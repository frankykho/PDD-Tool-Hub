// Edukasi Studio — riset artikel edukasi (saham, saham syariah, reksa dana, ETF, obligasi, structured warrant,
// derivatif, DIRE/DINFRA/EBA, right issue & waran, margin & short selling)
// dan penulis konten ORISINAL (artikel website, feed carousel, story) dari banyak sumber sekaligus.
//
// Cara kerja singkat:
//   1. Scraper mengambil artikel edukasi dari sumber terdaftar (sitemap / RSS / halaman daftar), menghormati robots.txt.
//   2. Tiap artikel diringkas AI menjadi "catatan fakta" (poin, bukan kalimat sumber).
//   3. Penulis AI hanya membaca catatan fakta dari beberapa sumber, bukan teks aslinya, lalu menulis konten baru.
//   4. Browser membandingkan hasil dengan teks sumber (frasa 6 kata yang sama) dan menandai kalimat yang terlalu mirip.
//
// Pengaturan di Cloudflare (Worker -> Settings):
//   HUB_URL       (Variable)   alamat Tool Hub (diisi scripts/deploy.mjs bersama PROFILE: nama brand & alamat tool)
//   SSO_SECRET    (Secret)     SAMA dengan SSO_SECRET di Tool Hub
//   DB            (D1 binding) database D1 (tabel dibuat otomatis)
//   AI            (Workers AI binding) model penulis (gratis 10.000 neuron/hari)
//   ANTHROPIC_API_KEY (Secret, opsional) bila diisi, penulis otomatis pindah ke Claude
//   CLAUDE_MODEL / AI_MODEL (Variable, opsional) ganti model tanpa ubah kode
// Cron (Settings -> Triggers): "*/15 * * * *" = cek otomatis tiap 15 menit. Tiap sumber diperiksa ulang 24 jam sekali;
// di luar itu jadwal hanya mengambil artikel yang masih antre.

import { profile, appUrl } from '../../shared/profile.js';
import { ai, AiError } from '../../shared/ai.js';
import { withCron } from '../../shared/cron.js';
import { HUB_FEED, hubFeedAllowed } from '../../shared/hubfeed.js';

const APP_ID = 'edukasi';
// User-Agent bot menyertakan alamat tool ini (dari profil) supaya pemilik situs tahu asalnya
const UA = env => { const u = appUrl(env, APP_ID); return 'EdukasiBot/1.0 (riset konten edukasi' + (u ? '; +' + u : '') + ')'; };
const UA_TOKEN = 'edukasibot';
const TOKEN_HOURS = 12;
const DISCOVER_HOURS = 24;       // tiap sumber dicek ulang paling cepat 24 jam sekali
const MAX_NEW_PER_RUN = 60;      // maksimal URL baru per sumber per putaran harian (bank terisi bertahap, tidak pernah berhenti)
const FETCH_PER_STEP = 4;        // artikel yang diambil per langkah (batas CPU & subrequest paket gratis)
const SITEMAP_CHUNK = 300;       // item sitemap yang disaring per langkah; sitemap besar dilanjutkan di langkah berikutnya

const TOPICS = { saham: 'Saham', syariah: 'Saham Syariah', reksadana: 'Reksa Dana', etf: 'ETF', obligasi: 'Obligasi & SBN', sw: 'Structured Warrant',
  derivatif: 'Derivatif', dire: 'DIRE, DINFRA & EBA', aksi: 'Right Issue & Waran', margin: 'Margin & Short Selling' };
// urutan penting: yang lebih spesifik dulu
const TOPIC_RE = [
  ['sw', /waran terstruktur|structured warrant/],
  ['derivatif', /derivatif|kontrak berjangka|single stock futures?|\bssf\b|index futures|futures (indeks|lq45|saham)|lq45 futures|kontrak opsi|opsi saham/],
  ['etf', /\betf\b|exchange traded/],
  ['dire', /\bdire\b|\bdinfra\b|dana investasi real estat|dana investasi infrastruktur|\breits?\b|efek beragun aset|\beba\b/],
  ['reksadana', /reksa ?dana|reksadana|manajer investasi|\bnab\b/],
  ['obligasi', /obligasi|\bsbn\b|sukuk|\bori ?0?\d{2}\b|\bsr ?0\d{2}\b|\bst ?0\d{2}\b|\bsbr ?0\d{2}\b|surat berharga negara|surat utang|\bkupon\b/],
  ['margin', /margin trading|transaksi margin|akun margin|rekening margin|margin call|short ?sell(ing)?|transaksi short|forced sell/],
  ['aksi', /right ?issue|\bhmetd\b|hak memesan efek|\bwaran\b|\bwarrant\b/],
  ['syariah', /saham syariah|efek syariah|indeks saham syariah|\bissi\b|\bjii\d*\b|pasar modal syariah|sharia stock/],
  ['saham', /saham|emiten|\bipo\b|dividen|\bihsg\b|analisis teknikal|analisis fundamental|\bpbv\b|\bper\b|\bbursa\b/],
];
const EDU_RE = /\b(apa itu|itu apa|adalah|cara|mengenal|kenali|pengertian|perbedaan|beda|panduan|tips|jenis|risiko|keuntungan|kelebihan|kekurangan|strategi|istilah|belajar|pemula|memilih|pilih|tutorial|contoh|rumus|fungsi|manfaat|faq|mekanisme|syarat|bagaimana|kenapa|mengapa|simulasi|menghitung|hitung|langkah|definisi|karakteristik|ciri|vs|versus|biaya|pajak)\b/;
const NEWS_RE = /\b(hari ini|ditutup|dibuka|melemah|menguat|anjlok|melesat|ambles|rekomendasi saham|target harga|laba bersih|rups|kuartal [iv1-4]+|sesi i|resmi luncurkan|meluncurkan|catat rekor|pekan ini|minggu ini|bulan ini|jadwal penawaran|hasil penjualan|ditetapkan)\b/;

// Sumber bawaan (sudah dicek: robots.txt mengizinkan & artikel bisa dibaca tanpa JavaScript).
const SOURCES = [
  { id: 'idx', name: 'IDX (Bursa Efek Indonesia)', kind: 'fixed', official: true, start: [
    'https://www.idx.co.id/id/produk/saham', 'https://www.idx.co.id/id/produk/reksa-dana', 'https://www.idx.co.id/id/produk/exchange-traded-fund-etf',
    'https://www.idx.co.id/id/produk/surat-utang-obligasi', 'https://www.idx.co.id/id/produk/waran-terstruktur', 'https://www.idx.co.id/id/idx-syariah/indeks-saham-syariah',
    'https://www.idx.co.id/id/produk/derivatif'] },
  { id: 'cermati', name: 'Cermati', kind: 'list', maxPage: 8, eduOnly: true, start: [
    'https://www.cermati.com/artikel/kategori/saham?page={n}', 'https://www.cermati.com/artikel/kategori/reksadana?page={n}', 'https://www.cermati.com/artikel/kategori/investasi?page={n}'],
    link: '^https://www\\.cermati\\.com/artikel/(?!kategori|amp|tag|penulis|author)[a-z0-9-]+/?$' },
  { id: 'ajaib', name: 'Ajaib Belajar', kind: 'sitemap', eduOnly: true, start: ['https://ajaib.co.id/sitemap-belajar.xml'],
    include: '/belajar/', exclude: '/belajar/(berita|kripto|crypto|forex|komoditas)/' },
  { id: 'bareksa', name: 'Bareksa', kind: 'sitemap', strictEdu: true, start: [
    'https://www.bareksa.com/sitemap/berita/belajar-investasi/news.xml', 'https://www.bareksa.com/sitemap/berita/reksa-dana/news.xml',
    'https://www.bareksa.com/sitemap/berita/sbn/news.xml', 'https://www.bareksa.com/sitemap/berita/saham/news.xml'],
    include: '/berita/', exclude: '/(kripto|emas)/' },
  { id: 'most', name: 'MOST (Mandiri Sekuritas)', kind: 'sitemap', eduOnly: true, start: ['https://www.most.co.id/sitemap.xml'], include: '/(tips-investasi|kelas-investasi)/' },
  { id: 'ocbc', name: 'OCBC Indonesia', kind: 'sitemap', start: ['https://www.ocbc.id/sitemap/article/sitemap.xml'], include: '/id/article/', child: 'investasi|wealth' },
  { id: 'bibit', name: 'Bibit', kind: 'rss', start: ['https://artikel.bibit.id/investasi1?format=rss'] },
  { id: 'gotrade', name: 'Gotrade Edukasi', kind: 'sitemap', eduOnly: true, start: ['https://www.heygotrade.com/sitemap-blog.xml'],
    include: '/id/(edukasi|blog)/', note: 'Contoh banyak memakai saham/ETF Amerika.' },
  { id: 'reku', name: 'Reku Campus', kind: 'list', eduOnly: true, start: ['https://reku.id/campus/category/saham', 'https://reku.id/campus'],
    link: '^https://reku\\.id/campus/(?!category|tag|author|page|en/)[a-z0-9-]+/?$', note: 'Situs kripto; artikel non-topik otomatis disaring.' },
  { id: 'bca', name: 'BCA Edukatips', kind: 'list', maxPage: 7, start: ['https://www.bca.co.id/id/informasi/edukatips/c/investasi?articles_view=grid&page={n}'],
    link: '/id/informasi/[Ee]dukatips/\\d{4}/', note: 'Banyak promosi produk BCA; AI hanya mengambil faktanya.' },
  { id: 'tanamduit', name: 'Tanamduit Belajar', kind: 'sitemap', eduOnly: true, start: ['https://www.tanamduit.com/post-sitemap.xml', 'https://www.tanamduit.com/post-sitemap2.xml'],
    include: '/belajar/', note: 'Kuat di SBN ritel & reksa dana.' },
  { id: 'makmur', name: 'Makmur Blog', kind: 'sitemap', start: ['https://www.makmur.id/sitemap-all-blogpost.xml'], include: '/blog/artikel/' },
  { id: 'mandiriinv', name: 'Mandiri Investasi', kind: 'sitemap', eduOnly: true, start: ['https://www.mandiri-investasi.co.id/post-sitemap.xml', 'https://www.mandiri-investasi.co.id/post-sitemap2.xml'],
    include: '/id/(artikel|belajar-investasi)/', note: 'Manajer investasi; fokus reksa dana.' },
  { id: 'schroders', name: 'Schroders Indonesia', kind: 'sitemap', eduOnly: true, start: ['https://www.schroders.com/id-id/id/investasi-reksadana/sitemap.xml'],
    include: '/investasi-reksadana/konten/', note: 'Manajer investasi; topik ditentukan dari judul.' },
  { id: 'dbs', name: 'DBS Indonesia Artikel', kind: 'sitemap', start: ['https://www.dbs.id/id/sitemap-articles.xml'], include: '/articles/', note: 'Kuat di obligasi/SBN; ada promosi produk DBS.' },
  { id: 'cimb', name: 'CIMB Niaga Inspirasi', kind: 'sitemap', start: ['https://www.cimbniaga.co.id/sitemap/inspirasi.xml'], include: '/id/inspirasi/', note: 'Ada promosi produk CIMB Niaga.' },
  { id: 'nanovest', name: 'Nanovest Belajar Saham', kind: 'sitemap', eduOnly: true, start: ['https://www.nanovest.io/learn-stocks-sitemap.xml'],
    note: 'Contoh banyak memakai saham AS.' },
  { id: 'idntimes', name: 'IDN Times Business', kind: 'sitemap', strictEdu: true, start: ['https://www.idntimes.com/business/sitemap-web.xml'],
    include: '/business/(finance|economy)/', note: 'Media berita; hanya artikel penjelasan yang diambil.' },
  { id: 'finansialku', name: 'Finansialku', kind: 'sitemap', defaultOff: true, start: ['https://www.finansialku.com/sitemap_index.xml'], child: 'post-sitemap',
    note: 'robots.txt situs ini menolak GPTBot & CCBot. Aktifkan hanya bila tim setuju.' },
  { id: 'stockbit', name: 'Stockbit Snips', kind: 'rss', topic: 'saham', defaultOff: true, start: ['https://snips.stockbit.com/investasi?format=rss'],
    note: 'robots.txt situs ini menolak bot AI. Aktifkan hanya bila tim setuju.' },
];

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const now = () => Date.now();
const hubOrigin = env => { try { return new URL(env.HUB_URL).origin; } catch (e) { return ''; } };
const configured = env => !!hubOrigin(env) && String(env.SSO_SECRET || '').length >= 32 && !!env.DB;

/* ---------- Login lewat Tool Hub ----------
   Tanpa cookie (tool ini tampil di bingkai hub, dan browser sering memblokir cookie di bingkai).
   Tiket hub (hub_t) ditukar menjadi token 12 jam yang disimpan di halaman dan dikirim sebagai Authorization. */
async function verifyHub(env, t) {
  const [body, sig] = String(t || '').split('.');
  if (!body || !sig || !safeEq(await hmac(env.SSO_SECRET, body), sig)) return null;
  let p; try { p = JSON.parse(new TextDecoder().decode(fromB64u(body))); } catch (e) { return null; }
  return p && p.app === APP_ID && p.x > now() && p.a ? p : null;
}
async function makeToken(env, p) {
  const body = b64u(enc.encode(JSON.stringify({ e: p.e, n: p.n || '', adm: !!(p.adm || p.a === 'admin'), x: now() + TOKEN_HOURS * 3600e3 })));
  return body + '.' + await hmac(env.SSO_SECRET + ':edu', body);
}
async function readToken(env, request) {
  const [body, sig] = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').split('.');
  if (!body || !sig || !safeEq(await hmac(env.SSO_SECRET + ':edu', body), sig)) return null;
  let p; try { p = JSON.parse(new TextDecoder().decode(fromB64u(body))); } catch (e) { return null; }
  return p && p.x > now() ? p : null;
}

/* ---------- Database ---------- */
let ready = false;
async function init(env) {
  if (ready) return;
  await env.DB.batch([
    'CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, enabled INTEGER, custom TEXT, state TEXT, last_discover INTEGER, last_error TEXT)',
    'CREATE TABLE IF NOT EXISTS urls(url TEXT PRIMARY KEY, source TEXT, title TEXT, topic TEXT, status TEXT, info TEXT, found_at INTEGER, touched INTEGER)',
    'CREATE INDEX IF NOT EXISTS urls_status ON urls(status, found_at)',
    'CREATE TABLE IF NOT EXISTS articles(id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT UNIQUE, source TEXT, topic TEXT, title TEXT, published TEXT, text TEXT, words INTEGER, notes TEXT, scraped_at INTEGER)',
    'CREATE INDEX IF NOT EXISTS art_topic ON articles(topic, scraped_at)',
    'CREATE TABLE IF NOT EXISTS drafts(id INTEGER PRIMARY KEY AUTOINCREMENT, format TEXT, title TEXT, body TEXT, refs TEXT, score REAL, model TEXT, author TEXT, created_at INTEGER)',
    'CREATE TABLE IF NOT EXISTS robots(host TEXT PRIMARY KEY, body TEXT, fetched_at INTEGER)',
  ].map(s => env.DB.prepare(s)));
  ready = true;
}
/** Gabungan sumber bawaan + sumber tambahan admin, beserta status dari DB. */
async function allSources(env) {
  const rows = (await env.DB.prepare('SELECT * FROM sources').all()).results || [];
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  const list = SOURCES.map(s => ({ ...s, builtin: true }));
  rows.filter(r => r.custom).forEach(r => { try { list.push({ ...JSON.parse(r.custom), id: r.id, builtin: false }); } catch (e) {} });
  return list.map(s => { const r = byId[s.id] || {}; return { ...s, enabled: r.enabled == null ? !s.defaultOff : !!r.enabled, state: r.state ? JSON.parse(r.state) : null, last_discover: r.last_discover || 0, last_error: r.last_error || '' }; });
}
/** Simpan hanya kolom yang disebut di f (enabled / state / last_discover / last_error). */
async function saveSource(env, id, f) {
  const sets = [], vals = [];
  if ('enabled' in f) { sets.push('enabled=?'); vals.push(f.enabled ? 1 : 0); }
  if ('state' in f) { sets.push('state=?'); vals.push(f.state == null ? null : JSON.stringify(f.state)); }
  if ('last_discover' in f) { sets.push('last_discover=?'); vals.push(f.last_discover); }
  if ('last_error' in f) { sets.push('last_error=?'); vals.push(String(f.last_error || '').slice(0, 300)); }
  await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO sources(id) VALUES(?)').bind(id), env.DB.prepare(`UPDATE sources SET ${sets.join(', ')} WHERE id=?`).bind(...vals, id)]);
}

/* ---------- robots.txt ---------- */
function robotsAllows(txt, pathAndQuery) {
  const groups = []; let cur = null, lastUA = false;
  for (let line of String(txt || '').split(/\r?\n/)) {
    line = line.replace(/#.*/, '').trim(); if (!line) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === 'user-agent') { if (!cur || !lastUA) { cur = { ua: [], rules: [] }; groups.push(cur); } cur.ua.push(v.toLowerCase()); lastUA = true; }
    else { lastUA = false; if (cur && (k === 'allow' || k === 'disallow') && v) cur.rules.push({ allow: k === 'allow', p: v }); }
  }
  let g = groups.filter(x => x.ua.some(u => u !== '*' && u.length > 2 && UA_TOKEN.includes(u)));
  if (!g.length) g = groups.filter(x => x.ua.includes('*'));
  let best = null;
  for (const r of g.flatMap(x => x.rules)) {
    let p = r.p; const end = p.endsWith('$'); if (end) p = p.slice(0, -1);
    const re = new RegExp('^' + p.replace(/[.+?^(){}|[\]\\$]/g, '\\$&').replace(/\*/g, '.*') + (end ? '$' : ''));
    if (re.test(pathAndQuery) && (!best || r.p.length > best.p.length || (r.p.length === best.p.length && r.allow))) best = r;
  }
  return !best || best.allow;
}
const robotsMem = {};
async function allowed(env, url) {
  const u = new URL(url), host = u.host;
  let body = robotsMem[host];
  if (body == null) {
    const row = await env.DB.prepare('SELECT body, fetched_at FROM robots WHERE host=?').bind(host).first();
    if (row && now() - row.fetched_at < 864e5) body = row.body;
    else {
      try {
        const r = await fetch(u.origin + '/robots.txt', { headers: { 'user-agent': UA(env) }, signal: AbortSignal.timeout(10000) });
        body = r.ok ? (await r.text()).slice(0, 200000) : '';   // 4xx = tidak ada aturan
      } catch (e) { body = ''; }
      await env.DB.prepare('INSERT OR REPLACE INTO robots(host, body, fetched_at) VALUES(?,?,?)').bind(host, body, now()).run();
    }
    robotsMem[host] = body;
  }
  return robotsAllows(body, u.pathname + u.search);
}
const get = (env, url) => fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': UA(env), accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'id-ID,id;q=0.9,en;q=0.5' } });

/* ---------- Penyaring & pengelompokan topik ---------- */
// tanpa new URL(): dipanggil ribuan kali per sitemap, jadi dibuat semurah mungkin (batas CPU paket gratis)
const slugText = url => {
  let p = String(url || '').replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/[?#].*$/, '');
  if (p.includes('%')) try { p = decodeURIComponent(p); } catch (e) {}
  return p.toLowerCase().replace(/[-_/]+/g, ' ');
};
const ANY_TOPIC = new RegExp(TOPIC_RE.map(([, re]) => re.source).join('|'));   // saringan cepat sebelum cek per topik
const topicOf = s => { s = String(s || '').toLowerCase(); if (!ANY_TOPIC.test(s)) return null; for (const [t, re] of TOPIC_RE) if (re.test(s)) return t; return null; };
function topicByCount(text) {
  const s = String(text || '').toLowerCase().slice(0, 6000); let best = null, n = 0;
  for (const [t, re] of TOPIC_RE) { const c = (s.match(new RegExp(re.source, 'g')) || []).length; if (c > n) { n = c; best = t; } }
  return n >= 2 ? best : null;
}
const looksEdu = s => EDU_RE.test(s) && !NEWS_RE.test(s);

/* ---------- Ekstraksi teks artikel (HTMLRewriter, ringan CPU) ---------- */
const SKIP_SEL = ['nav', 'footer', 'aside', 'form', 'script', 'style', 'noscript', 'header', 'figcaption', 'button', 'iframe',
  '[class*="related"]', '[class*="share"]', '[class*="comment"]', '[class*="breadcrumb"]', '[class*="newsletter"]', '[class*="sidebar"]', '[class*="baca-juga"]', '[class*="recommend"]', '[id*="related"]'];
const BLOCKS = ['p', 'h2', 'h3', 'h4', 'li', 'blockquote', 'td'];
const BOILER = /^(baca juga|lihat juga|baca selengkapnya|artikel terkait|disclaimer|download|unduh|bagikan|share|tags?\b|sumber\s*:|editor\s*:|penulis\s*:|foto\s*:|ilustrasi|copyright|hak cipta|©)/i;
async function extract(res) {
  const scopes = ['article', 'main', 'body'], buckets = { article: [], main: [], body: [] }, meta = {};
  let skip = 0;
  const rw = new HTMLRewriter();
  for (const s of SKIP_SEL) rw.on('body ' + s, { element(el) { skip++; try { el.onEndTag(() => { skip--; }); } catch (e) { skip--; } } });
  for (const sc of scopes) for (const tag of BLOCKS) {
    const key = sc; let curEntry = null;
    rw.on(sc + ' ' + tag, {
      element() { curEntry = { tag, t: '', skip: skip > 0 }; buckets[key].push(curEntry); },
      text(t) { if (curEntry) curEntry.t += t.text; },
    });
  }
  const m = (sel, k, attr) => rw.on(sel, { element(el) { if (!meta[k]) meta[k] = el.getAttribute(attr || 'content'); } });
  m('meta[property="og:title"]', 'og'); m('meta[property="article:published_time"]', 'pub'); m('meta[name="description"]', 'desc');
  let tt = '', h1 = '';
  rw.on('title', { text(t) { tt += t.text; } });
  rw.on('h1', { text(t) { if (h1.length < 300) h1 += t.text; } });
  await rw.transform(res).arrayBuffer();
  const clean = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/\s+/g, ' ').trim();
  const pick = key => {
    const out = [];
    for (const e of buckets[key]) {
      if (e.skip) continue;
      const t = clean(e.t); if (!t) continue;
      const head = /^h[2-4]$/.test(e.tag);
      if (!head && t.length < 25) continue;
      if (BOILER.test(t)) continue;
      if (out.slice(-2).some(x => x.t.includes(t))) continue;   // li > p: teks yang sama muncul dua kali
      out.push({ head, t });
    }
    return out;
  };
  let chosen = [];
  for (const k of scopes) { const p = pick(k); if (p.reduce((n, x) => n + x.t.length, 0) > 800) { chosen = p; break; } if (!chosen.length) chosen = p; }
  const text = chosen.map(x => (x.head ? '## ' : '') + x.t).join('\n').slice(0, 30000);
  const title = clean(meta.og || h1 || tt).replace(/\s*\|\s*[^|]{2,40}$/, '').slice(0, 250);
  return { title, text, published: meta.pub || '', desc: clean(meta.desc || '') };
}

/** Frasa 6 kata dari naskah (tanpa tanda baca di dalamnya) untuk dicari persis di bank artikel: 2 per kalimat (awal & tengah),
 *  huruf kecil, maks. 90. Disclaimer di bawah garis "---" tidak ikut. */
export function phrases(body, max = 90) {
  const main = String(body || '').split(/\n-{3,}\n/)[0], out = new Set();
  for (const s of main.split(/\n+|(?<=[.!?])\s+/)) {
    const w = s.replace(/^[#>*\-\s]+|\*\*/g, '').trim().split(/\s+/);
    const ok = (i) => w.slice(i, i + 6).every(t => /^[\p{L}\p{N}%]+$/u.test(t));
    const starts = []; for (let i = 0; i + 6 <= w.length; i++) if (ok(i)) starts.push(i);
    if (!starts.length) continue;
    for (const i of new Set([starts[0], starts[Math.floor(starts.length / 2)]])) out.add(w.slice(i, i + 6).join(' ').toLowerCase());
    if (out.size >= max) break;
  }
  return [...out].slice(0, max);
}

/* ---------- Penemuan URL ---------- */
/** from/max: baca sitemap per potongan (posisi karakter) supaya satu langkah tidak melewati batas CPU. next = posisi potongan berikutnya. */
function parseXml(xml, from = 0, max = Infinity) {
  const isIndex = /<sitemapindex[\s>]/i.test(xml), items = [];
  if (/<rss[\s>]|<feed[\s>]/i.test(xml)) {
    for (const m of xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)) {
      const b = m[0], link = (b.match(/<link>\s*(?:<!\[CDATA\[)?([^<\]]+)/i) || b.match(/<link[^>]+href="([^"]+)"/i) || [])[1];
      const title = (b.match(/<title>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/title>/i) || [])[1] || '';
      if (link) items.push({ url: link.trim(), title: title.replace(/<[^>]+>/g, '').trim() });
    }
    return { isIndex: false, items };
  }
  const re = /<(url|sitemap)>([\s\S]*?)<\/\1>/gi;
  re.lastIndex = from;
  let m, next = 0;
  while ((m = re.exec(xml))) {
    const loc = (m[2].match(/<loc>\s*(?:<!\[CDATA\[)?([^<\]\s]+)/i) || [])[1];
    const title = (m[2].match(/<news:title>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/news:title>/i) || [])[1] || '';
    if (loc) items.push({ url: loc.replace(/&amp;/g, '&'), title: title.trim() });
    if (items.length >= max) { if (xml.indexOf('<url>', re.lastIndex) >= 0 || xml.indexOf('<sitemap>', re.lastIndex) >= 0) next = re.lastIndex; break; }
  }
  return { isIndex, items, next };
}
async function listLinks(res, base) {
  const links = [];
  await new HTMLRewriter().on('a[href]', { element(el) { try { links.push(new URL(el.getAttribute('href'), base).href.split('#')[0]); } catch (e) {} } }).transform(res).arrayBuffer();
  return [...new Set(links)];
}
/** Satu unit penemuan: ambil satu sitemap / feed / halaman daftar dari antrean sumber. */
async function discoverOne(env, src) {
  let st = src.state && src.state.queue ? src.state : null;
  if (!st) {
    const q = src.kind === 'list' ? src.start.flatMap(u => Array.from({ length: src.maxPage || 5 }, (_, i) => u.replace('{n}', i + 1))) : [...src.start];
    st = { queue: q, added: 0 };
  }
  // isi antrean: alamat (string) atau {u, at} = lanjutan sitemap besar mulai posisi karakter "at"
  const job = st.queue.shift();
  const target = job && (typeof job === 'string' ? job : job.u), from = (job && job.at) || 0;
  let added = 0, err = '';
  if (target && st.added < MAX_NEW_PER_RUN) {
    // simpan progres DULU: bila langkah ini dihentikan Cloudflare (batas CPU), langkah berikutnya
    // melewati target ini alih-alih mengulanginya terus dan mengunci semua sumber lain
    await saveSource(env, src.id, { state: st, last_error: 'Terhenti saat memproses ' + target + ' (kemungkinan batas CPU); bagian ini dilewati.' });
    try {
      if (!(await allowed(env, target))) err = 'Diblokir robots.txt: ' + target;
      else {
        const res = await get(env, target);
        if (!res.ok) err = `HTTP ${res.status} di ${target}`;
        else {
          let cands = [];
          if (src.kind === 'fixed') { cands = [{ url: target, title: '' }]; await res.body.cancel(); }
          else if (src.kind === 'list') cands = (await listLinks(res, target)).filter(u => new RegExp(src.link).test(u)).map(u => ({ url: u, title: '' }));
          else {
            const xml = await res.text();
            const { isIndex, items, next } = parseXml(xml.slice(0, 3e6), from, SITEMAP_CHUNK);
            if (isIndex) { st.queue.push(...items.map(x => x.url).filter(u => !src.child || new RegExp(src.child, 'i').test(u)).slice(0, 40)); }
            else { cands = items; if (next) st.queue.unshift({ u: target, at: next }); }
          }
          const inc = src.include ? new RegExp(src.include) : null, exc = src.exclude ? new RegExp(src.exclude) : null;
          const rows = [];
          for (const c of cands) {
            if (inc && !inc.test(c.url)) continue;
            if (exc && exc.test(c.url)) continue;
            const s = (slugText(c.url) + ' ' + c.title).toLowerCase();
            const topic = src.kind === 'fixed' ? topicOf(s) : (topicOf(s) || src.topic || null);
            if (!topic) continue;
            if (src.kind !== 'fixed' && (src.eduOnly ? NEWS_RE.test(s) : !looksEdu(s))) continue;
            rows.push([c.url, src.id, c.title.slice(0, 250), topic]);
            if (st.added + rows.length >= MAX_NEW_PER_RUN) break;
          }
          if (rows.length) {
            const r = await env.DB.batch(rows.map(x => env.DB.prepare("INSERT OR IGNORE INTO urls(url, source, title, topic, status, found_at, touched) VALUES(?,?,?,?, 'new', ?, 0)").bind(...x, now())));
            added = r.reduce((n, x) => n + (x.meta && x.meta.changes || 0), 0);
          }
        }
      }
    } catch (e) { err = (e && e.message || String(e)) + ' di ' + target; }
  }
  st.added += added;
  const done = !st.queue.length || st.added >= MAX_NEW_PER_RUN;
  const fin = done ? { state: null, last_discover: now() } : { state: st };
  if (target) fin.last_error = err;   // tanpa target (sisa langkah yang terhenti): pesan galat sebelumnya tetap terlihat
  await saveSource(env, src.id, fin);
  return { did: 'discover', source: src.name, target, added, err, done };
}

/** Ambil satu halaman, ekstrak, lalu simpan ke bank artikel. Dipakai antrean dan tombol "Tambah dari link". */
async function saveArticle(env, url, sourceId, hintTitle, hintTopic, strict) {
  try {
    if (!(await allowed(env, url))) return { status: 'skip', info: 'robots.txt situs ini melarang' };
    const res = await get(env, url);
    if (!res.ok) { await res.body?.cancel(); return { status: 'error', info: 'HTTP ' + res.status }; }
    if (!/html/i.test(res.headers.get('content-type') || '')) { await res.body?.cancel(); return { status: 'skip', info: 'bukan halaman HTML (PDF belum didukung)' }; }
    const a = await extract(res);
    const words = a.text.split(/\s+/).length;
    const title = a.title || hintTitle || url;
    // judul dulu: sebagian situs menaruh kata topik di semua alamat (mis. /investasi-reksadana/konten/...)
    const topic = topicOf(title) || topicOf(slugText(url)) || topicByCount(a.text) || hintTopic;
    if (words < 150) return { status: 'skip', info: 'isi terlalu sedikit (mungkin butuh JavaScript)' };
    if (strict && !looksEdu((title + ' ' + slugText(url)).toLowerCase())) return { status: 'skip', info: 'lebih mirip berita' };
    if (!topic) return { status: 'skip', info: 'bukan topik pasar modal yang dipantau' };
    await env.DB.prepare('INSERT OR REPLACE INTO articles(url, source, topic, title, published, text, words, notes, scraped_at) VALUES(?,?,?,?,?,?,?,NULL,?)')
      .bind(url, sourceId, topic, title, a.published.slice(0, 30), a.text, words, now()).run();
    return { status: 'done', info: words + ' kata', title, topic };
  } catch (e) { return { status: 'error', info: (e && e.message || String(e)).slice(0, 200) }; }
}

/** Ambil & simpan beberapa artikel dari antrean. */
async function fetchSome(env, srcs) {
  // baris yang macet di status 'working' > 10 menit dikembalikan ke antrean sekali; macet kedua kali = dianggap gagal
  // (biasanya halamannya terlalu berat sehingga langkah dihentikan Cloudflare)
  await env.DB.prepare("UPDATE urls SET status=CASE WHEN info='diulang' THEN 'error' ELSE 'new' END, info=CASE WHEN info='diulang' THEN 'terhenti 2x saat diproses (halaman terlalu berat?)' ELSE 'diulang' END WHERE status='working' AND touched < ?").bind(now() - 6e5).run();
  const on = srcs.filter(s => s.enabled).map(s => s.id);
  if (!on.length) return null;
  const rows = (await env.DB.prepare(`SELECT * FROM urls WHERE status='new' AND source IN (${on.map(() => '?').join(',')}) ORDER BY found_at LIMIT ${FETCH_PER_STEP}`).bind(...on).all()).results || [];
  if (!rows.length) return null;
  await env.DB.batch(rows.map(r => env.DB.prepare("UPDATE urls SET status='working', touched=? WHERE url=?").bind(now(), r.url)));
  const log = [];
  for (const r of rows) {
    const src = srcs.find(s => s.id === r.source) || {};
    const { status, info } = await saveArticle(env, r.url, r.source, r.title, r.topic, src.strictEdu);
    await env.DB.prepare('UPDATE urls SET status=?, info=?, touched=? WHERE url=?').bind(status, info, now(), r.url).run();
    log.push({ url: r.url, status, info });
  }
  return { did: 'fetch', items: log };
}

/** Satu langkah kerja: ambil artikel antrean dulu, kalau kosong cari URL baru dari sumber yang sudah waktunya. */
async function step(env, forceId) {
  const srcs = await allSources(env);
  const f = await fetchSome(env, srcs);
  if (f) return f;
  const due = srcs.filter(s => s.enabled && (s.id === forceId || (s.state && s.state.queue) || now() - s.last_discover > DISCOVER_HOURS * 3600e3));
  if (!due.length) return { did: 'idle' };
  due.sort((a, b) => (b.state ? 1 : 0) - (a.state ? 1 : 0) || a.last_discover - b.last_discover);
  return discoverOne(env, due[0]);
}

/* ---------- AI: shared/ai.js ---------- */

// Prompt penulis: nama perusahaan & aplikasi dari profil (brand.company, brand.short, app.name); kosong = netral
const rules = env => {
  const { brand, app } = profile(env);
  const who = brand.company ? brand.company + (brand.short && brand.short !== brand.company ? ` (${brand.short})` : '') : brand.short;
  return `Kamu copywriter edukasi investasi${who ? ' untuk ' + who : ''}${app.name ? `, dengan aplikasi trading ${app.name}` : ''}.
Tulis konten ORISINAL berbahasa Indonesia yang jelas, hangat, dan mudah dipahami investor pemula.
Aturan wajib:
1. Bahanmu hanya CATATAN FAKTA yang diberikan. Susun alur, contoh, analogi, dan kalimatmu sendiri. Jangan meniru struktur atau gaya artikel mana pun.
2. Jangan mengarang angka, aturan, tanggal, atau nama produk yang tidak ada di catatan. Jika catatan bertanda [cek ulang], pertahankan tanda [cek ulang] di tulisan.
3. Jangan menyebut nama sekuritas, aplikasi, bank, platform, atau media lain.
4. Ini edukasi, bukan ajakan membeli atau menjual. Jangan menjanjikan keuntungan; jangan memakai kata "pasti untung", "tanpa risiko", "dijamin", "auto cuan". Jelaskan risiko secara seimbang.
5. ${app.name ? `Boleh menyebut ${app.name} secara wajar paling banyak satu kali, di bagian akhir, tanpa klaim berlebihan.` : 'Jangan mempromosikan aplikasi atau produk tertentu.'}
6. Jangan menulis disclaimer, sistem menambahkannya otomatis.
7. Untuk derivatif, structured warrant, transaksi margin, dan short selling: tegaskan bahwa produk ini berisiko tinggi, bisa menimbulkan kerugian lebih cepat atau lebih besar dari modal awal, dan lebih cocok untuk investor berpengalaman.`;
};
const FORMATS = {
  web: len => `Buat ARTIKEL WEBSITE sekitar ${len} kata dalam format markdown:
- Baris 1: "# " + judul (maks 70 karakter, ramah SEO).
- Baris 2: "Meta: " + deskripsi singkat (maks 155 karakter).
- Pembuka 2-3 kalimat yang langsung relevan dengan pembaca.
- 3 sampai 6 subjudul "## ". Boleh memakai poin "- " bila membantu.
- Bagian "## Pertanyaan yang Sering Diajukan" berisi 3 tanya-jawab, tiap tanya diawali "**T:**" dan jawabannya "**J:**".
- Penutup singkat.`,
  feed: () => `Buat NASKAH CAROUSEL FEED Instagram 6-8 slide dengan format persis:
JUDUL KONTEN: ...

Slide 1 (cover)
Judul: (maks 8 kata, memancing rasa ingin tahu)
Sub: (maks 14 kata)

Slide 2
Judul: (maks 6 kata)
Isi: (maks 30 kata)

(lanjutkan sampai slide terakhir; slide terakhir berisi ringkasan dan ajakan menyimpan atau membagikan konten, BUKAN ajakan membeli)

CAPTION:
(80-150 kata, ditutup 3-5 hashtag relevan)`,
  story: () => `Buat NASKAH INSTAGRAM STORY 4-6 frame dengan format persis:
JUDUL KONTEN: ...

Frame 1
Teks: (maks 12 kata)
Visual: (saran visual singkat)

(lanjutkan; satu ide per frame; frame terakhir berisi ajakan interaksi seperti polling, kuis, atau kotak pertanyaan yang relevan)`,
};
// Baris izin di akhir disclaimer: brand.company + brand.license dari profil (dilewati bila keduanya kosong)
const disclaimer = env => { const b = profile(env).brand, lic = [b.company, b.license].filter(Boolean).join(' ');
  return `\n\n---\nSemua investasi memiliki risiko. Lakukan analisis mandiri dan pahami potensi kerugian sebelum mengambil keputusan.\nInformasi ini bersifat edukasi, bukan ajakan atau dorongan untuk membeli atau menjual efek tertentu.${lic ? '\n' + lic.replace(/\.?$/, '.') : ''}`; };
const withDisclaimer = (env, s) => String(s).split(/\n-{3,}\n[\s\S]*(?:Otoritas Jasa Keuangan|Semua investasi memiliki risiko)[\s\S]*$/)[0].trim() + disclaimer(env);

async function makeNotes(env, id) {
  const a = await env.DB.prepare('SELECT id, title, topic, text, notes FROM articles WHERE id=?').bind(id).first();
  if (!a) throw new AiError('Artikel tidak ditemukan.');
  if (a.notes) return a.notes;
  const sys = `Kamu analis riset konten edukasi investasi. Dari satu artikel sumber, buat CATATAN FAKTA untuk penulis lain.
Aturan: tulis dengan kata-katamu sendiri sebagai poin singkat (frasa padat, bukan kalimat sumber); JANGAN menyalin kalimat sumber;
catat definisi, cara kerja, angka, syarat, aturan, contoh, kelebihan, dan risiko; beri tanda [cek ulang] pada angka, tarif, jadwal, atau aturan yang bisa berubah;
abaikan promosi, ajakan unduh aplikasi, dan nama perusahaan sumber. Maksimal 15 poin. Keluarkan hanya daftar poin yang diawali "- ".`;
  const { text } = await ai(env, sys, `Topik: ${TOPICS[a.topic] || a.topic}\nJudul sumber: ${a.title}\n\nIsi sumber:\n${a.text.slice(0, 9000)}`, 900);
  const notes = text.split('\n').filter(l => /^\s*[-*•]/.test(l)).map(l => '- ' + l.replace(/^\s*[-*•]\s*/, '')).join('\n') || text;
  await env.DB.prepare('UPDATE articles SET notes=? WHERE id=?').bind(notes, id).run();
  return notes;
}

/* ---------- API ---------- */
async function api(request, env, url, me) {
  const path = url.pathname, m = request.method;
  const body = m === 'POST' ? await request.json().catch(() => ({})) : {};
  const ids = v => String(v || '').split(',').map(Number).filter(n => n > 0).slice(0, 8);

  if (path === '/api/stats') {
    const srcs = await allSources(env);
    const art = (await env.DB.prepare('SELECT source, topic, count(*) n, sum(scraped_at > ?) baru FROM articles GROUP BY source, topic').bind(now() - 864e5).all()).results || [];
    const q = (await env.DB.prepare('SELECT source, status, count(*) n FROM urls GROUP BY source, status').all()).results || [];
    return json({ me: { email: me.e, name: me.n, admin: me.adm }, topics: TOPICS, art, q, sources: srcs.map(s => ({ id: s.id, name: s.name, kind: s.kind, enabled: s.enabled, builtin: s.builtin, note: s.note || '', official: !!s.official, running: !!(s.state && s.state.queue), last_discover: s.last_discover, last_error: s.last_error, start: s.start })) });
  }
  if (path === '/api/step' && m === 'POST') return json(await step(env, body.force));

  if (path === '/api/articles') {
    const w = [], b = [];
    const topic = url.searchParams.get('topic'), source = url.searchParams.get('source'), q = (url.searchParams.get('q') || '').trim();
    if (topic && TOPICS[topic]) { w.push('topic=?'); b.push(topic); }
    if (source) { w.push('source=?'); b.push(source); }
    if (q) { w.push('(title LIKE ? OR text LIKE ?)'); b.push('%' + q + '%', '%' + q + '%'); }
    const off = Math.max(0, +url.searchParams.get('offset') || 0);
    const rows = (await env.DB.prepare(`SELECT id, url, source, topic, title, published, words, notes IS NOT NULL has_notes, substr(text, 1, 260) excerpt, scraped_at FROM articles ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY scraped_at DESC LIMIT 30 OFFSET ${off}`).bind(...b).all()).results;
    const total = (await env.DB.prepare(`SELECT count(*) n FROM articles ${w.length ? 'WHERE ' + w.join(' AND ') : ''}`).bind(...b).first()).n;
    return json({ rows, total });
  }
  if (path === '/api/pick') {   // pilih otomatis 3 artikel dari sumber berbeda
    const topic = url.searchParams.get('topic'), q = (url.searchParams.get('q') || '').trim();
    const w = ['words >= 250'], b = [];
    if (topic && TOPICS[topic]) { w.push('topic=?'); b.push(topic); }
    if (q) { w.push('(title LIKE ? OR text LIKE ?)'); b.push('%' + q + '%', '%' + q + '%'); }
    const rows = (await env.DB.prepare(`SELECT id, url, source, topic, title, words FROM articles WHERE ${w.join(' AND ')} ORDER BY (title LIKE ?) DESC, scraped_at DESC LIMIT 60`).bind(...b, '%' + q + '%').all()).results || [];
    const out = [], seen = new Set();
    for (const r of rows) if (!seen.has(r.source) && out.length < 3) { out.push(r); seen.add(r.source); }
    for (const r of rows) if (out.length < 3 && !out.includes(r)) out.push(r);
    return json({ rows: out });
  }
  if (path === '/api/article') {
    const a = await env.DB.prepare('SELECT id, url, source, topic, title, published, words, notes FROM articles WHERE id=?').bind(+url.searchParams.get('id')).first();
    return a ? json(a) : json({ error: 'Artikel tidak ditemukan.' }, 404);
  }
  if (path === '/api/texts') {   // teks sumber untuk cek kemiripan di browser
    const list = ids(url.searchParams.get('ids'));
    if (!list.length) return json({ texts: {} });
    const rows = (await env.DB.prepare(`SELECT id, text FROM articles WHERE id IN (${list.map(() => '?').join(',')})`).bind(...list).all()).results || [];
    return json({ texts: Object.fromEntries(rows.map(r => [r.id, r.text])) });
  }
  if (path === '/api/notes' && m === 'POST') return json({ notes: await makeNotes(env, +body.id) });
  if (path === '/api/similar' && m === 'POST') {   // artikel lain di bank yang memuat frasa 6 kata yang sama persis dengan naskah
    const ph = phrases(body.body), skip = new Set(ids((body.exclude || []).join(',')));
    const found = new Map();
    for (let i = 0; i < ph.length && found.size < 8; i += 30) {
      const part = ph.slice(i, i + 30);
      const rows = (await env.DB.prepare(`SELECT id, url, source, title FROM articles WHERE ${part.map(() => "text LIKE ? ESCAPE '\\'").join(' OR ')} LIMIT 20`)
        .bind(...part.map(p => '%' + p.replace(/[\\%_]/g, c => '\\' + c) + '%')).all()).results || [];
      for (const r of rows) if (!skip.has(r.id) && !found.has(r.id) && found.size < 8) found.set(r.id, r);
    }
    return json({ rows: [...found.values()], checked: ph.length });
  }
  if (path === '/api/addurl' && m === 'POST') {   // tambah satu artikel dari link
    let u; try { u = new URL(String(body.url || '').trim()); } catch (e) { return json({ error: 'Link belum benar.' }, 400); }
    if (u.protocol !== 'https:') return json({ error: 'Gunakan link https.' }, 400);
    u.hash = '';
    const r = await saveArticle(env, u.href, 'manual', '', TOPICS[body.topic] ? body.topic : null, false);
    if (r.status !== 'done') return json({ error: 'Tidak bisa disimpan: ' + r.info }, 400);
    const a = await env.DB.prepare('SELECT id, url, source, topic, title, words, scraped_at FROM articles WHERE url=?').bind(u.href).first();
    return json({ ok: true, article: a, info: r.info });
  }

  if (path === '/api/generate' && m === 'POST') {
    const list = ids((body.ids || []).join(','));
    if (!list.length) return json({ error: 'Pilih minimal satu artikel sumber.' }, 400);
    const fmt = FORMATS[body.format] ? body.format : 'web';
    const rows = (await env.DB.prepare(`SELECT id, url, source, topic, title, notes FROM articles WHERE id IN (${list.map(() => '?').join(',')})`).bind(...list).all()).results || [];
    for (const r of rows) if (!r.notes) r.notes = await makeNotes(env, r.id);
    const topic = TOPICS[body.topic] || TOPICS[rows[0] && rows[0].topic] || 'investasi';
    const notes = rows.map((r, i) => `[Catatan ${i + 1}]\n${r.notes}`).join('\n\n');
    const user = `${FORMATS[fmt](Math.min(1500, Math.max(400, +body.length || 800)))}\n\nTopik: ${topic}\nJudul atau ide (opsional): ${String(body.title || '-').slice(0, 200)}\nSudut pandang atau pesan ${profile(env).brand.short || 'brand'} (opsional): ${String(body.angle || '-').slice(0, 400)}\nTarget pembaca: ${body.audience === 'menengah' ? 'investor yang sudah paham dasar' : 'investor pemula'}\n\nCATATAN FAKTA:\n${notes}`;
    const { text, model } = await ai(env, rules(env), user, fmt === 'web' ? 3000 : 1600);
    return json({ body: withDisclaimer(env, text), model, refs: rows.map(r => ({ id: r.id, title: r.title, url: r.url, source: r.source })) });
  }
  if (path === '/api/derive' && m === 'POST') {
    const fmt = FORMATS[body.format] && body.format !== 'web' ? body.format : 'feed';
    const src = String(body.body || '').split(/\n-{3,}\n/)[0].slice(0, 12000);
    const { text, model } = await ai(env, rules(env), `${FORMATS[fmt]()}\n\nGunakan HANYA isi artikel berikut sebagai bahan (artikel ini sudah orisinal milik ${profile(env).brand.short || 'kita sendiri'}):\n\n${src}`, 1600);
    return json({ body: withDisclaimer(env, text), model });
  }
  if (path === '/api/rewrite' && m === 'POST') {
    const flagged = (body.flagged || []).slice(0, 25).map(String);
    if (!flagged.length) return json({ error: 'Tidak ada kalimat yang ditandai.' }, 400);
    const main = String(body.body || '').split(/\n-{3,}\n/)[0];
    const sys = 'Kamu editor bahasa Indonesia. Tulis ulang HANYA kalimat yang ditandai supaya susunan dan pilihan katanya benar-benar baru, makna dan faktanya tetap sama. Bagian lain jangan diubah. Kembalikan naskah lengkap dengan format yang sama, tanpa komentar tambahan.';
    const { text, model } = await ai(env, sys, `KALIMAT YANG DITANDAI:\n${flagged.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nNASKAH:\n${main}`, 3200);
    return json({ body: withDisclaimer(env, text), model });
  }

  if (path === '/api/drafts') {
    if (m === 'POST') {
      const d = body; if (!d.body) return json({ error: 'Naskah kosong.' }, 400);
      const title = (String(d.body).match(/^(?:#\s+|JUDUL KONTEN:\s*)(.+)$/m) || [])[1] || String(d.title || 'Tanpa judul');
      if (d.id) {
        const old = await env.DB.prepare('SELECT author FROM drafts WHERE id=?').bind(+d.id).first();
        if (!old || (old.author !== me.e && !me.adm)) return json({ error: 'Draf ini milik orang lain.' }, 403);
        await env.DB.prepare('UPDATE drafts SET title=?, body=?, score=?, refs=? WHERE id=?').bind(title.slice(0, 200), d.body, +d.score || 0, JSON.stringify(d.refs || []), +d.id).run();
        return json({ id: +d.id });
      }
      const r = await env.DB.prepare('INSERT INTO drafts(format, title, body, refs, score, model, author, created_at) VALUES(?,?,?,?,?,?,?,?)')
        .bind(FORMATS[d.format] ? d.format : 'web', title.slice(0, 200), d.body, JSON.stringify(d.refs || []), +d.score || 0, String(d.model || ''), me.e, now()).run();
      return json({ id: r.meta.last_row_id });
    }
    if (m === 'DELETE') {
      const d = await env.DB.prepare('SELECT author FROM drafts WHERE id=?').bind(+url.searchParams.get('id')).first();
      if (!d) return json({ ok: true });
      if (d.author !== me.e && !me.adm) return json({ error: 'Hanya pembuat draf atau admin yang bisa menghapus.' }, 403);
      await env.DB.prepare('DELETE FROM drafts WHERE id=?').bind(+url.searchParams.get('id')).run();
      return json({ ok: true });
    }
    const one = url.searchParams.get('id');
    if (one) return json(await env.DB.prepare('SELECT * FROM drafts WHERE id=?').bind(+one).first() || {});
    return json({ rows: (await env.DB.prepare('SELECT id, format, title, score, model, author, created_at FROM drafts ORDER BY created_at DESC LIMIT 100').all()).results });
  }

  // ---- khusus admin: kelola sumber ----
  if (path.startsWith('/api/source')) {
    if (!me.adm) return json({ error: 'Khusus admin.' }, 403);
    if (path === '/api/source' && m === 'POST') { await saveSource(env, String(body.id), { enabled: !!body.enabled }); return json({ ok: true }); }
    if (path === '/api/source/refresh' && m === 'POST') { await saveSource(env, String(body.id), { state: null, last_discover: 0 }); return json({ ok: true }); }
    if (path === '/api/source/add' && m === 'POST') {
      const name = String(body.name || '').trim().slice(0, 60), start = String(body.url || '').trim(), kind = body.kind === 'rss' ? 'rss' : 'sitemap';
      let u; try { u = new URL(start); } catch (e) { return json({ error: 'URL belum benar.' }, 400); }
      if (!name || u.protocol !== 'https:') return json({ error: 'Isi nama dan URL https.' }, 400);
      let include = String(body.include || '').trim().slice(0, 120);
      try { if (include) new RegExp(include); } catch (e) { return json({ error: 'Filter alamat tidak valid.' }, 400); }
      const id = 'c_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
      await env.DB.prepare('INSERT OR REPLACE INTO sources(id, enabled, custom, state, last_discover, last_error) VALUES(?,1,?,NULL,0,\'\')')
        .bind(id, JSON.stringify({ name, kind, start: [u.href], include: include || undefined })).run();
      return json({ ok: true, id });
    }
    if (path === '/api/source/delete' && m === 'POST') {
      const id = String(body.id);
      if (!id.startsWith('c_')) return json({ error: 'Sumber bawaan tidak bisa dihapus, cukup dinonaktifkan.' }, 400);
      await env.DB.batch([env.DB.prepare('DELETE FROM sources WHERE id=?').bind(id), env.DB.prepare("DELETE FROM urls WHERE source=? AND status!='done'").bind(id)]);
      return json({ ok: true });
    }
  }
  return json({ error: 'Tidak ditemukan.' }, 404);
}

/* ---------- Halaman ---------- */
const setupPage = env => `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Edukasi Studio</title>
<style>body{font-family:system-ui,sans-serif;background:#f1f4f3;color:#14201c;padding:24px}.c{max-width:560px;margin:6vh auto;background:#fff;border-radius:14px;padding:28px}h1{font-size:19px;color:#1f5e4b}td{padding:8px;vertical-align:top;border-bottom:1px solid #e5e7eb}small{color:#64716c;display:block}</style></head><body><div class="c">
<h1>Edukasi Studio belum dikonfigurasi</h1><p>Di Cloudflare buka Worker ini &rarr; <b>Settings</b>, lalu lengkapi:</p><table>
<tr><td>${hubOrigin(env) ? '&#9989;' : '&#10060;'}</td><td><b>HUB_URL</b><small>Variables and Secrets &rarr; alamat Tool Hub (diisi otomatis oleh scripts/deploy.mjs)</small></td></tr>
<tr><td>${String(env.SSO_SECRET || '').length >= 32 ? '&#9989;' : '&#10060;'}</td><td><b>SSO_SECRET</b><small>Tipe Secret, isinya sama persis dengan SSO_SECRET di Tool Hub</small></td></tr>
<tr><td>${env.DB ? '&#9989;' : '&#10060;'}</td><td><b>DB</b><small>Bindings &rarr; Add &rarr; D1 database, Variable name <b>DB</b></small></td></tr>
<tr><td>${env.AI || env.ANTHROPIC_API_KEY ? '&#9989;' : '&#10060;'}</td><td><b>AI</b><small>Bindings &rarr; Add &rarr; Workers AI, Variable name <b>AI</b></small></td></tr></table></div></body></html>`;

function appPage(env, token, me) {
  const boot = JSON.stringify({ token, me: { email: me.e, name: me.n, admin: !!me.adm }, topics: TOPICS }).replace(/</g, '\\u003c'), short = esc(profile(env).brand.short);
  return `<!doctype html><html lang="id" data-theme="system"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Edukasi Studio</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%231f5e4b'/%3E%3Cpath d='M9 22l3-1 10-10-2-2-10 10z' fill='%23fff'/%3E%3C/svg%3E"><style>${CSS}</style></head><body>
<header class="top"><div><h1>Edukasi Studio</h1><p class="sub">Riset artikel edukasi &rarr; konten orisinal${short ? ' ' + short : ''}</p></div>
<nav class="tabs" role="tablist"><button data-tab="bank" class="on">Bank Artikel</button><button data-tab="tulis">Tulis</button><button data-tab="draf">Draf</button><button data-tab="sumber">Sumber</button></nav></header>
<main>
<section id="t-bank" class="tab on">
  <div class="bar"><div class="chips" id="topicChips"></div><select id="srcSel" aria-label="Sumber"><option value="">Semua sumber</option></select><input id="q" type="search" placeholder="Cari judul atau isi…" aria-label="Cari"></div>
  <details class="addurl"><summary>+ Tambah artikel dari link</summary><div class="row"><input id="addUrl" type="url" placeholder="https://… (artikel edukasi yang bagus tapi sumbernya belum terdaftar)"><select id="addTopic" aria-label="Topik"><option value="">Topik otomatis</option></select><button id="addBtn">Simpan</button></div><p class="hint">Tool tetap mengecek robots.txt situsnya. Halaman PDF belum didukung.</p></details>
  <p class="sub" id="bankInfo"></p><div id="list" class="list"></div><button id="more" class="ghost" hidden>Muat lagi</button>
  <div class="selbar" id="selbar" hidden><span id="selCount"></span><button class="ghost sm" id="selClear">Kosongkan</button><button id="selGo">Tulis dari artikel ini &rarr;</button></div>
</section>
<section id="t-tulis" class="tab">
  <div class="grid2">
  <div class="card">
    <h2>1. Bahan riset</h2>
    <div id="picked" class="picked"></div>
    <div class="row"><select id="autoTopic" aria-label="Topik"></select><input id="autoQ" placeholder="Kata kunci (opsional), mis. kupon" aria-label="Kata kunci"><button class="ghost" id="autoBtn">Pilih otomatis</button></div>
    <p class="hint">Gunakan 2–4 artikel dari sumber berbeda. AI hanya membaca catatan fakta dari tiap artikel, bukan kalimat aslinya.</p>
    <h2>2. Arahan</h2>
    <label>Format</label><div class="seg" id="fmt"><button data-v="web" class="on">Artikel website</button><button data-v="feed">Feed carousel</button><button data-v="story">Story</button></div>
    <label for="title">Judul atau ide (opsional)</label><input id="title" placeholder="mis. Bedanya obligasi negara dan korporasi untuk pemula">
    <label for="angle">Sudut pandang / pesan ${short || 'brand'} (opsional)</label><textarea id="angle" rows="2" placeholder="mis. tekankan diversifikasi; ajak belajar lewat kelas edukasi kita"></textarea>
    <div class="row"><div><label for="aud">Pembaca</label><select id="aud"><option value="pemula">Pemula</option><option value="menengah">Sudah paham dasar</option></select></div>
    <div id="lenWrap"><label for="len">Panjang artikel</label><select id="len"><option value="600">± 600 kata</option><option value="900" selected>± 900 kata</option><option value="1200">± 1.200 kata</option></select></div></div>
    <button id="goBtn" class="big">Tulis konten</button><div id="prog" class="prog" hidden></div>
  </div>
  <div class="card" id="outCard">
    <div class="outhead"><h2>3. Hasil</h2><span id="modelTag" class="tag"></span></div>
    <div id="empty" class="emptybox">Hasil tulisan muncul di sini.</div>
    <div id="outWrap" hidden>
      <div id="simBox" class="sim"></div>
      <div class="seg small" id="view"><button data-v="edit" class="on">Edit</button><button data-v="preview">Pratinjau</button></div>
      <textarea id="out" rows="22" spellcheck="false"></textarea><div id="prev" class="prev" hidden></div>
      <div class="actions"><button id="recheck" class="ghost">Cek ulang kemiripan</button><button id="rewrite" class="ghost">Tulis ulang kalimat yang ditandai</button>
      <button id="toFeed" class="ghost">Jadikan feed</button><button id="toStory" class="ghost">Jadikan story</button>
      <button id="copy" class="ghost">Salin</button><button id="dl" class="ghost">Unduh .md</button><button id="save">Simpan draf</button></div>
      <details class="refs"><summary>Sumber riset (catatan internal, tidak ikut tersalin)</summary><ul id="refList"></ul></details>
      <p class="hint">Wajib dicek manusia sebelum tayang: angka, aturan, dan tanda [cek ulang]. Konten untuk publik tetap lewat review Compliance sesuai aturan internal.</p>
    </div>
  </div></div>
</section>
<section id="t-draf" class="tab"><div class="card"><h2>Draf tersimpan</h2><div id="drafts" class="list"></div></div></section>
<section id="t-sumber" class="tab">
  <div class="card"><div class="outhead"><h2>Sumber artikel</h2><button id="runBtn">Perbarui sekarang</button></div>
  <p class="sub"><b id="srcSum"></b></p><p class="sub">Artikel baru diambil otomatis bila jadwal (Cron) dipasang. Tool ini menghormati robots.txt dan hanya mengambil artikel bertopik edukasi.</p>
  <div id="runLog" class="log" hidden></div><div class="scroll"><table id="srcTable"></table></div></div>
  <div class="card" id="addCard" hidden><h2>Tambah sumber (admin)</h2>
    <div class="row"><input id="nsName" placeholder="Nama sumber"><select id="nsKind"><option value="sitemap">Sitemap XML</option><option value="rss">RSS feed</option></select></div>
    <input id="nsUrl" placeholder="https://example.com/sitemap.xml"><input id="nsInc" placeholder="Filter alamat (opsional), mis. /edukasi/"><button id="nsBtn">Tambah</button>
    <p class="hint">Cek dulu robots.txt situsnya dan pastikan artikelnya bisa dibaca tanpa login.</p></div>
</section>
</main><div id="toast" role="status"></div>
<script>window.BOOT=${boot};</script><script>${CLIENT}</script></body></html>`;
}

const CSS = `*{box-sizing:border-box}:root{--bg:#f1f4f3;--card:#fff;--ink:#14201c;--mut:#64716c;--line:#dfe7e2;--brand:#1f5e4b;--brand2:#ecfdf5;--ok:#166534;--okb:#ecfdf5;--warn:#92400e;--warnb:#fffbeb;--bad:#991b1b;--badb:#fef2f2;--mark:#fde68a}
html[data-theme="dark"]{--bg:#0f1713;--card:#17221c;--ink:#e7eee9;--mut:#a8b8af;--line:#2f4238;--brand:#5fcf98;--brand2:#20372a;--ok:#c4f3d7;--okb:#173b2a;--warn:#fde9b8;--warnb:#3b2f12;--bad:#ffd8d5;--badb:#421f20;--mark:#7a5d10}
@media(prefers-color-scheme:dark){html[data-theme="system"]{--bg:#0f1713;--card:#17221c;--ink:#e7eee9;--mut:#a8b8af;--line:#2f4238;--brand:#5fcf98;--brand2:#20372a;--ok:#c4f3d7;--okb:#173b2a;--warn:#fde9b8;--warnb:#3b2f12;--bad:#ffd8d5;--badb:#421f20;--mark:#7a5d10}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 20px;border-bottom:1px solid var(--line);background:var(--card);position:sticky;top:0;z-index:5}
h1{font-size:18px;margin:0;color:var(--brand)}h2{font-size:15px;margin:0 0 10px}.sub{margin:2px 0 0;color:var(--mut);font-size:12.5px}
main{max-width:1200px;margin:0 auto;padding:16px}.tab{display:none}.tab.on{display:block}
.tabs{display:flex;gap:4px;background:var(--bg);padding:4px;border-radius:10px}.tabs button{background:transparent;color:var(--mut);padding:8px 12px}.tabs button.on{background:var(--card);color:var(--brand);box-shadow:0 1px 3px #0002}
button{padding:9px 14px;border:0;border-radius:8px;background:var(--brand);color:#fff;font-family:inherit;font-weight:600;font-size:13px;cursor:pointer}html[data-theme="dark"] button:not(.ghost):not(.tabs button){color:#0f1713}
button.ghost{background:var(--brand2);color:var(--brand)}button.sm{padding:5px 9px;font-size:12px}button:disabled{opacity:.55;cursor:wait}button.big{width:100%;margin-top:16px;padding:12px}
input,select,textarea{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font-family:inherit;font-size:14px}textarea{resize:vertical}
input:focus,select:focus,textarea:focus,button:focus-visible{outline:2px solid #5dd62c55;border-color:var(--brand)}
label{display:block;font-size:12px;font-weight:600;color:var(--mut);margin:12px 0 5px}.row{display:flex;gap:8px;align-items:flex-end}.row>*{flex:1}.row>button{flex:none}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:14px;min-width:0}
.grid2{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:14px;align-items:start}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px}.bar select{width:auto;min-width:160px}.bar input{flex:1;min-width:180px;width:auto}
.chips{display:flex;gap:6px;flex-wrap:wrap}.chips button{background:var(--card);color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:6px 11px}.chips button.on{background:var(--brand);color:#fff;border-color:var(--brand)}
.list{display:flex;flex-direction:column;gap:8px;margin-top:10px}.item{display:flex;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}.item.sel{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand)}
.item input{width:18px;height:18px;flex:none;margin-top:2px;accent-color:var(--brand)}.item .b{min-width:0;flex:1}.item a.t{font-weight:600;color:var(--ink);text-decoration:none}.item a.t:hover{text-decoration:underline}
.meta{font-size:12px;color:var(--mut);margin-top:2px}.ex{font-size:12.5px;color:var(--mut);margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.tag.new{background:#fde68a;color:#78350f}.tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:var(--brand2);color:var(--brand);font-weight:600}
.notes{white-space:pre-wrap;font-size:12.5px;background:var(--bg);border-radius:8px;padding:10px;margin-top:8px}
.addurl{margin:8px 0 4px;font-size:13px}.addurl summary{cursor:pointer;color:var(--brand);font-weight:600}.addurl .row{margin-top:8px}.addurl select{max-width:180px}.selbar{position:sticky;bottom:12px;display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--brand);border-radius:12px;padding:10px 12px;margin-top:12px;box-shadow:0 8px 24px #0002}.selbar span{flex:1;font-weight:600}
.picked{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}.pk{display:flex;gap:8px;align-items:center;background:var(--bg);border-radius:8px;padding:7px 9px;font-size:13px}.pk span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pk span.tag{flex:none}.pk button{padding:3px 8px;font-size:12px}
.hint{font-size:12px;color:var(--mut);margin:8px 0 0}.seg{display:flex;gap:4px;background:var(--bg);padding:4px;border-radius:9px}.seg button{flex:1;background:transparent;color:var(--mut);padding:8px}.seg button.on{background:var(--card);color:var(--brand);box-shadow:0 1px 3px #0002}.seg.small{width:max-content;margin:10px 0 8px}.seg.small button{flex:none;padding:5px 12px}
.prog{margin-top:12px;font-size:13px;color:var(--mut)}.prog div:before{content:"• "}.prog .now{color:var(--brand);font-weight:600}
.outhead{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.outhead h2{margin:0}
.emptybox{border:1px dashed var(--line);border-radius:10px;padding:40px 16px;text-align:center;color:var(--mut)}
#out{font:13px/1.55 ui-monospace,Menlo,Consolas,monospace}.prev{border:1px solid var(--line);border-radius:8px;padding:6px 16px;max-height:640px;overflow:auto}.prev mark{background:var(--mark);color:inherit}
.prev h1{font-size:20px;margin:12px 0}.prev h2{font-size:16px;margin:16px 0 6px}.prev .metal{font-size:12px;color:var(--mut)}
.actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.sim{border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:4px}.sim.ok{background:var(--okb);color:var(--ok)}.sim.warn{background:var(--warnb);color:var(--warn)}.sim.bad{background:var(--badb);color:var(--bad)}.sim b{font-size:15px}
.sim ol{margin:6px 0 0;padding-left:18px;max-height:180px;overflow:auto}.sim li{margin:3px 0}
.refs{margin-top:12px;font-size:13px}.refs summary{cursor:pointer;color:var(--mut)}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--mut);font-weight:600}td small{display:block;color:var(--mut)}.err{color:var(--bad)}
.scroll{overflow-x:auto}.log{background:var(--bg);border-radius:8px;padding:10px;font:12px/1.5 ui-monospace,monospace;max-height:220px;overflow:auto;margin-bottom:12px;white-space:pre-wrap}
#addCard input,#addCard select{margin-bottom:8px}#addCard .row{align-items:center}.switch{display:inline-flex;align-items:center;gap:6px;font-size:12px}.switch input{width:auto}
#toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#1f2d26;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;opacity:0;pointer-events:none;transition:opacity .2s;z-index:20;max-width:90vw}#toast.on{opacity:1}
@media(max-width:900px){.grid2{grid-template-columns:1fr}}@media(max-width:600px){main{padding:10px}.top{padding:12px}.tabs{width:100%}.tabs button{flex:1;padding:8px 4px;font-size:12px}.row{flex-wrap:wrap}.bar select,.bar input{width:100%}}`;

// Kode browser. Ditulis tanpa backtick dan tanpa "${" supaya aman di dalam template.
const CLIENT = String.raw`(function(){
var B=window.BOOT,TOKEN=B.token,ME=B.me,TOPICS=B.topics,STATE={topic:'',source:'',q:'',offset:0,sel:{},picked:[],fmt:'web',refs:[],model:'',draftId:null,texts:{},flagged:[],extra:[],bank:0,struct:[]};
var $=function(id){return document.getElementById(id)};
function h(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function toast(m){var t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove('on')},3200)}
function api(path,opt){opt=opt||{};return fetch(path,{method:opt.method||'GET',headers:{authorization:'Bearer '+TOKEN,'content-type':'application/json'},body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){if(r.status===401){location.reload();throw new Error('Sesi habis')}return r.json().catch(function(){throw new Error('Cloudflare membalas halaman galat (HTTP '+r.status+'), biasanya karena batas CPU paket gratis terlampaui')}).then(function(j){if(!r.ok||j.error)throw new Error(j.error||('HTTP '+r.status));return j})})}
// tema mengikuti Tool Hub
addEventListener('message',function(e){var d=e.data||{};if(d.type==='toolhub-theme'&&/^(light|dark|system)$/.test(d.theme))document.documentElement.setAttribute('data-theme',d.theme)});
try{if(parent!==window)parent.postMessage({type:'toolhub-theme-request'},'*')}catch(e){}
try{history.replaceState(null,'',location.pathname)}catch(e){}
var SRCNAME={manual:'Ditambah manual'};
function fmtDate(ms){if(!ms)return '-';var d=new Date(ms);return d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})+' '+d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}
// ---- tab ----
document.querySelectorAll('[data-tab]').forEach(function(b){b.onclick=function(){showTab(b.dataset.tab)}});
function showTab(t){document.querySelectorAll('[data-tab]').forEach(function(x){x.classList.toggle('on',x.dataset.tab===t)});document.querySelectorAll('.tab').forEach(function(x){x.classList.toggle('on',x.id==='t-'+t)});if(t==='draf')loadDrafts();if(t==='sumber')loadStats()}
// ---- bank artikel ----
var chips=$('topicChips');[['','Semua']].concat(Object.keys(TOPICS).map(function(k){return[k,TOPICS[k]]})).forEach(function(p){var b=document.createElement('button');b.textContent=p[1];b.dataset.v=p[0];if(!p[0])b.className='on';b.onclick=function(){STATE.topic=p[0];chips.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b)});loadList(true)};chips.appendChild(b)});
var at=$('autoTopic');Object.keys(TOPICS).forEach(function(k){[at,$('addTopic')].forEach(function(sel){var o=document.createElement('option');o.value=k;o.textContent=TOPICS[k];sel.appendChild(o)})});
$('addBtn').onclick=function(){var b=this,u=$('addUrl').value.trim();if(!u)return toast('Tempel link artikel dulu.');b.disabled=true;b.textContent='Mengambil…';api('/api/addurl',{method:'POST',body:{url:u,topic:$('addTopic').value}}).then(function(j){toast('Tersimpan: '+j.article.title+' ('+j.info+')');$('addUrl').value='';loadList(true)}).catch(function(e){toast(e.message)}).then(function(){b.disabled=false;b.textContent='Simpan'})};
$('srcSel').onchange=function(){STATE.source=this.value;loadList(true)};
var qt;$('q').oninput=function(){clearTimeout(qt);var v=this.value;qt=setTimeout(function(){STATE.q=v;loadList(true)},350)};
$('more').onclick=function(){loadList(false)};
function loadList(reset){if(reset)STATE.offset=0;var p='/api/articles?topic='+encodeURIComponent(STATE.topic)+'&source='+encodeURIComponent(STATE.source)+'&q='+encodeURIComponent(STATE.q)+'&offset='+STATE.offset;
  api(p).then(function(j){var L=$('list');if(reset)L.innerHTML='';
    if(!j.total){L.innerHTML='<div class="emptybox">Belum ada artikel'+(STATE.q||STATE.topic||STATE.source?' yang cocok':'. Buka tab <b>Sumber</b> lalu klik <b>Perbarui sekarang</b>')+'.</div>'}
    j.rows.forEach(function(r){L.appendChild(itemEl(r))});STATE.offset+=j.rows.length;$('more').hidden=STATE.offset>=j.total;$('bankInfo').textContent=j.total+' artikel'}).catch(function(e){toast(e.message)})}
function itemEl(r){var d=document.createElement('div');d.className='item'+(STATE.sel[r.id]?' sel':'');
  d.innerHTML='<input type="checkbox" aria-label="Pilih artikel"'+(STATE.sel[r.id]?' checked':'')+'><div class="b"><a class="t" href="'+h(r.url)+'" target="_blank" rel="noopener">'+h(r.title||r.url)+'</a>'+(Date.now()-r.scraped_at<864e5?' <span class="tag new">Baru</span>':'')+'<div class="meta"><span class="tag">'+h(TOPICS[r.topic]||r.topic)+'</span> '+h(SRCNAME[r.source]||r.source)+' · '+r.words+' kata'+(r.published?' · '+h(r.published.slice(0,10)):'')+'</div><div class="ex">'+h(String(r.excerpt||'').replace(/^## /gm,''))+'</div><button class="ghost sm nb">'+(r.has_notes?'Lihat catatan fakta':'Buat catatan fakta')+'</button><div class="nwrap"></div></div>';
  var cb=d.querySelector('input');cb.onchange=function(){if(cb.checked){if(Object.keys(STATE.sel).length>=5){cb.checked=false;return toast('Maksimal 5 artikel sekaligus.')}STATE.sel[r.id]=r}else delete STATE.sel[r.id];d.classList.toggle('sel',cb.checked);selBar()};
  var nb=d.querySelector('.nb'),nw=d.querySelector('.nwrap');nb.onclick=function(){if(nw.innerHTML){nw.innerHTML='';return}nb.disabled=true;nb.textContent='Membuat catatan…';api('/api/notes',{method:'POST',body:{id:r.id}}).then(function(j){nw.innerHTML='<div class="notes">'+h(j.notes)+'</div>';r.has_notes=1}).catch(function(e){toast(e.message)}).then(function(){nb.disabled=false;nb.textContent=r.has_notes?'Tutup / lihat catatan':'Buat catatan fakta'})};
  return d}
function selBar(){var n=Object.keys(STATE.sel).length;$('selbar').hidden=!n;$('selCount').textContent=n+' artikel dipilih'}
$('selClear').onclick=function(){STATE.sel={};document.querySelectorAll('.item').forEach(function(x){x.classList.remove('sel');x.querySelector('input').checked=false});selBar()};
$('selGo').onclick=function(){STATE.picked=Object.keys(STATE.sel).map(function(k){return STATE.sel[k]});renderPicked();showTab('tulis')};
// ---- tulis ----
function renderPicked(){var P=$('picked');P.innerHTML=STATE.picked.length?'':'<div class="hint" style="margin:0">Belum ada artikel. Pilih di Bank Artikel, atau pakai “Pilih otomatis”.</div>';
  STATE.picked.forEach(function(r,i){var d=document.createElement('div');d.className='pk';d.innerHTML='<span class="tag">'+h(TOPICS[r.topic]||r.topic)+'</span><span title="'+h(r.title)+'">'+h(r.title)+' <small style="color:var(--mut)">· '+h(SRCNAME[r.source]||r.source)+'</small></span><button class="ghost" aria-label="Hapus">✕</button>';d.querySelector('button').onclick=function(){STATE.picked.splice(i,1);renderPicked()};P.appendChild(d)})}
$('autoBtn').onclick=function(){var b=this;b.disabled=true;api('/api/pick?topic='+at.value+'&q='+encodeURIComponent($('autoQ').value)).then(function(j){if(!j.rows.length)toast('Belum ada artikel untuk topik ini. Perbarui sumber dulu.');STATE.picked=j.rows;renderPicked()}).catch(function(e){toast(e.message)}).then(function(){b.disabled=false})};
$('fmt').querySelectorAll('button').forEach(function(b){b.onclick=function(){STATE.fmt=b.dataset.v;$('fmt').querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b)});$('lenWrap').style.visibility=STATE.fmt==='web'?'visible':'hidden'}});
function prog(lines,cur){var P=$('prog');P.hidden=false;P.innerHTML=lines.map(function(l,i){return '<div class="'+(i===cur?'now':'')+'">'+h(l)+'</div>'}).join('')}
$('goBtn').onclick=function(){if(!STATE.picked.length)return toast('Pilih artikel sumber dulu.');var btn=this;btn.disabled=true;
  var steps=STATE.picked.map(function(r,i){return 'Catatan fakta '+(i+1)+'/'+STATE.picked.length+': '+r.title.slice(0,50)});steps.push('Menulis konten…');steps.push('Cek kemiripan dengan sumber…');
  var i=0;function next(){if(i<STATE.picked.length){prog(steps,i);var r=STATE.picked[i];return api('/api/notes',{method:'POST',body:{id:r.id}}).then(function(){i++;return next()})}
    prog(steps,i);return api('/api/generate',{method:'POST',body:{ids:STATE.picked.map(function(r){return r.id}),format:STATE.fmt,title:$('title').value,angle:$('angle').value,audience:$('aud').value,length:$('len').value,topic:STATE.picked[0].topic}})}
  next().then(function(j){prog(steps,steps.length-1);STATE.refs=j.refs;STATE.model=j.model;STATE.draftId=null;STATE.curFmt=STATE.fmt;return showResult(j.body)}).then(function(){$('prog').hidden=true}).catch(function(e){$('prog').innerHTML='<div class="err">'+h(e.message)+'</div>'}).then(function(){btn.disabled=false})};
function showResult(body){$('empty').hidden=true;$('outWrap').hidden=false;$('out').value=body;$('modelTag').textContent=STATE.model?'AI: '+STATE.model:'';
  $('refList').innerHTML=(STATE.refs||[]).map(function(r){return '<li><a href="'+h(r.url)+'" target="_blank" rel="noopener">'+h(r.title)+'</a> <small>· '+h(SRCNAME[r.source]||r.source)+'</small></li>'}).join('');
  $('toFeed').hidden=$('toStory').hidden=STATE.curFmt!=='web';
  return loadTexts().then(runCheck).then(bankCheck)}
function loadTexts(){var need=(STATE.refs||[]).map(function(r){return r.id}).filter(function(id){return !STATE.texts[id]});if(!need.length)return Promise.resolve();return api('/api/texts?ids='+need.join(',')).then(function(j){for(var k in j.texts)STATE.texts[k]=j.texts[k]})}
// ---- cek kemiripan: frasa 6 kata yang sama persis dengan teks sumber ----
var N=6;
function words(s){return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9%]+/g,' ').trim().split(' ').filter(Boolean)}
function grams(w){var o=[];for(var i=0;i+N<=w.length;i++)o.push(w.slice(i,i+N).join(' '));return o}
function runCheck(){var src=(STATE.refs||[]).concat(STATE.extra||[]),G=new Map();src.forEach(function(r){grams(words(STATE.texts[r.id]||'')).forEach(function(g){if(!G.has(g))G.set(g,r.id)})});
  var main=$('out').value.split(/\n-{3,}\n/)[0];var sents=main.split(/\n+|(?<=[.!?])\s+/).map(function(x){return x.replace(/^[#>*\-\s]+|\*\*/g,'').trim()}).filter(function(x){return words(x).length>=N});
  var tot=0,hit=0,fl=[];sents.forEach(function(s){var g=grams(words(s)),k=0,by={};g.forEach(function(x){if(G.has(x)){k++;by[G.get(x)]=1}});tot+=g.length;hit+=k;if(k)fl.push({s:s,k:k,by:Object.keys(by)})});
  var score=tot?Math.round(hit/tot*1000)/10:0;STATE.score=score;STATE.flagged=fl.map(function(f){return f.s});
  // struktur: subjudul naskah yang hampir sama (kata >= 60% sama) dengan subjudul satu sumber
  var dh=heads(main),st=[];if(dh.length>=2)src.forEach(function(r){var sh=heads(STATE.texts[r.id]||''),k=0;dh.forEach(function(a){if(sh.some(function(b){return jac(a,b)>=0.6}))k++});if(k>=2&&k/dh.length>=0.5)st.push({r:r,k:k})});STATE.struct=st;
  var name=function(id){var r=src.filter(function(x){return String(x.id)===String(id)})[0];return r?(SRCNAME[r.source]||r.source)+': '+r.title:''};
  var cls=fl.length?(score<15?'warn':'bad'):st.length?'warn':'ok';var box=$('simBox');box.className='sim '+cls;
  var nb=(STATE.extra||[]).length,bank=STATE.bank==='load'?' · cek ke seluruh bank artikel sedang berjalan…':STATE.bank==='err'?' · cek ke seluruh bank artikel gagal, klik Cek ulang':STATE.bank?' · dicek juga ke seluruh bank artikel ('+STATE.bank+' frasa)'+(nb?': '+nb+' artikel lain memuat frasa yang sama':': tidak ada artikel lain yang sama'):'';
  box.innerHTML='<b>'+(fl.length?'✗ '+fl.length+' kalimat sama persis dengan sumber':'✓ 0 kalimat mirip')+'</b> · kemiripan '+score+'%'+(st.length?' · <b>struktur mirip</b> '+st.map(function(x){return h(name(x.r.id))+' ('+x.k+' dari '+dh.length+' subjudul)'}).join(', '):dh.length>=2?' · struktur berbeda dari semua sumber':'')
    +(fl.length?'<ol>'+fl.map(function(f){return '<li>'+h(f.s)+'<small style="display:block;opacity:.8">sama dengan '+f.by.map(function(id){return h(name(id))}).join('; ')+'</small></li>'}).join('')+'</ol><div>Tulis ulang kalimat yang ditandai dulu. Draf baru bisa disimpan setelah 0 kalimat mirip.</div>':'')
    +(st.length?'<div>Ubah urutan atau sudut subjudul supaya tidak mengikuti satu artikel sumber.</div>':'')
    +'<div style="font-size:11.5px;margin-top:6px;opacity:.85">Dicek terhadap '+(STATE.refs||[]).length+' artikel bahan'+bank+'. Ini cek internal, bukan jaminan lolos alat cek plagiat lain; tetap sunting sebelum terbit.</div>';
  $('rewrite').disabled=!fl.length;$('save').disabled=!!fl.length;$('save').title=fl.length?'Masih ada kalimat yang sama persis dengan sumber':'';renderPrev()}
function heads(t){return String(t).split('\n').filter(function(l){return /^#{2,3} /.test(l)}).map(function(l){return words(l.replace(/^#+ /,''))}).filter(function(w){return w.length})}
function jac(a,b){var A=new Set(a),B=new Set(b),i=0;A.forEach(function(x){if(B.has(x))i++});return i/((A.size+B.size-i)||1)}
// cek ke seluruh bank: server mencari artikel lain yang memuat frasa 6 kata yang sama persis, lalu teksnya ikut dicek di sini
function bankCheck(){STATE.bank='load';STATE.extra=[];runCheck();return api('/api/similar',{method:'POST',body:{body:$('out').value,exclude:(STATE.refs||[]).map(function(r){return r.id})}}).then(function(j){STATE.extra=j.rows||[];STATE.bank=j.checked||0;
  var need=STATE.extra.map(function(r){return r.id}).filter(function(id){return !STATE.texts[id]});return need.length?api('/api/texts?ids='+need.join(',')).then(function(t){for(var k in t.texts)STATE.texts[k]=t.texts[k]}):null}).then(runCheck,function(){STATE.bank='err';runCheck()})}
function renderPrev(){var marks=STATE.flagged.map(h);var out=[],inList=false;$('out').value.split('\n').forEach(function(l){var e=h(l);marks.forEach(function(m){if(m&&e.indexOf(m)>=0)e=e.split(m).join('<mark>'+m+'</mark>')});e=e.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
    if(/^- /.test(l)){if(!inList){out.push('<ul>');inList=true}out.push('<li>'+e.slice(2)+'</li>');return}if(inList){out.push('</ul>');inList=false}
    if(/^# /.test(l))out.push('<h1>'+e.slice(2)+'</h1>');else if(/^## /.test(l))out.push('<h2>'+e.slice(3)+'</h2>');else if(/^### /.test(l))out.push('<h3>'+e.slice(4)+'</h3>');else if(/^Meta: /.test(l))out.push('<p class="metal">'+e+'</p>');else if(/^-{3,}$/.test(l))out.push('<hr>');else if(l.trim())out.push('<p>'+e+'</p>')});if(inList)out.push('</ul>');$('prev').innerHTML=out.join('')}
$('view').querySelectorAll('button').forEach(function(b){b.onclick=function(){$('view').querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b)});var p=b.dataset.v==='preview';if(p)renderPrev();$('prev').hidden=!p;$('out').hidden=p}});
$('recheck').onclick=function(){loadTexts().then(runCheck).then(bankCheck)};
$('rewrite').onclick=function(){var b=this;b.disabled=true;b.textContent='Menulis ulang…';api('/api/rewrite',{method:'POST',body:{body:$('out').value,flagged:STATE.flagged}}).then(function(j){$('out').value=j.body;runCheck();bankCheck();toast('Kalimat yang ditandai sudah ditulis ulang. Cek lagi hasilnya.')}).catch(function(e){toast(e.message)}).then(function(){b.textContent='Tulis ulang kalimat yang ditandai';b.disabled=!STATE.flagged.length})};
function derive(fmt,b){b.disabled=true;var t=b.textContent;b.textContent='Menyusun…';api('/api/derive',{method:'POST',body:{body:$('out').value,format:fmt}}).then(function(j){STATE.curFmt=fmt;STATE.draftId=null;STATE.model=j.model;return showResult(j.body)}).then(function(){toast('Naskah '+fmt+' dibuat dari artikel. Simpan sebagai draf terpisah.')}).catch(function(e){toast(e.message)}).then(function(){b.disabled=false;b.textContent=t})}
$('toFeed').onclick=function(){derive('feed',this)};$('toStory').onclick=function(){derive('story',this)};
$('copy').onclick=function(){var v=$('out').value;(navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(function(){toast('Tersalin.')},function(){$('out').select();document.execCommand('copy');toast('Tersalin.')})};
$('dl').onclick=function(){var v=$('out').value,t=(v.match(/^(?:# |JUDUL KONTEN:\s*)(.+)$/m)||[])[1]||'konten-edukasi';var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([v],{type:'text/markdown'}));a.download=t.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,60)+'.md';a.click()};
$('save').onclick=function(){var b=this;if(STATE.flagged.length)return toast('Tulis ulang kalimat yang ditandai dulu.');b.disabled=true;api('/api/drafts',{method:'POST',body:{id:STATE.draftId,format:STATE.curFmt||STATE.fmt,body:$('out').value,refs:STATE.refs,score:STATE.score,model:STATE.model}}).then(function(j){STATE.draftId=j.id;toast('Draf tersimpan.')}).catch(function(e){toast(e.message)}).then(function(){b.disabled=false})};
var FN={web:'Artikel',feed:'Feed',story:'Story'};
function loadDrafts(){api('/api/drafts').then(function(j){var D=$('drafts');D.innerHTML=j.rows.length?'':'<div class="emptybox">Belum ada draf.</div>';j.rows.forEach(function(r){var d=document.createElement('div');d.className='item';
  d.innerHTML='<div class="b"><a class="t" href="#">'+h(r.title)+'</a><div class="meta"><span class="tag">'+FN[r.format]+'</span> '+h(r.author)+' · '+fmtDate(r.created_at)+' · kemiripan '+(r.score||0)+'%</div></div>'+(r.author===ME.email||ME.admin?'<button class="ghost sm del">Hapus</button>':'');
  d.querySelector('a').onclick=function(e){e.preventDefault();api('/api/drafts?id='+r.id).then(function(x){STATE.refs=JSON.parse(x.refs||'[]');STATE.model=x.model;STATE.draftId=x.id;STATE.curFmt=x.format;showTab('tulis');return showResult(x.body)}).catch(function(e){toast(e.message)})};
  var del=d.querySelector('.del');if(del)del.onclick=function(){if(!confirm('Hapus draf ini?'))return;api('/api/drafts?id='+r.id,{method:'DELETE'}).then(loadDrafts).catch(function(e){toast(e.message)})};D.appendChild(d)})}).catch(function(e){toast(e.message)})}
// ---- sumber ----
function loadStats(){return api('/api/stats').then(function(j){var cnt={},nw={},q={},tot=0,totNew=0;j.art.forEach(function(r){cnt[r.source]=(cnt[r.source]||0)+r.n;nw[r.source]=(nw[r.source]||0)+(r.baru||0);tot+=r.n;totNew+=(r.baru||0)});$('srcSum').textContent=tot+' artikel di bank · '+totNew+' baru dalam 24 jam terakhir';j.q.forEach(function(r){q[r.source]=q[r.source]||{};q[r.source][r.status]=r.n});
  var sel=$('srcSel'),cur=sel.value;sel.innerHTML='<option value="">Semua sumber</option>';j.sources.forEach(function(s){SRCNAME[s.id]=s.name;var o=document.createElement('option');o.value=s.id;o.textContent=s.name;sel.appendChild(o)});sel.value=cur;
  var T=$('srcTable');T.innerHTML='<tr><th>Sumber</th><th>Artikel</th><th>Antrean</th><th>Terakhir dicek</th><th></th></tr>';
  j.sources.forEach(function(s){var qq=q[s.id]||{},tr=document.createElement('tr');
    tr.innerHTML='<td><b>'+h(s.name)+'</b>'+(s.official?' <span class="tag">resmi</span>':'')+'<small>'+h(s.kind)+' · '+h((s.start||[])[0]||'')+'</small>'+(s.note?'<small>'+h(s.note)+'</small>':'')+(s.last_error?'<small class="err">'+h(s.last_error)+'</small>':'')+'</td><td>'+(cnt[s.id]||0)+(nw[s.id]?'<small>+'+nw[s.id]+' baru</small>':'')+'</td><td>'+(qq['new']||0)+' baru<small>'+(qq.skip||0)+' dilewati · '+(qq.error||0)+' gagal</small></td><td>'+(s.running?'sedang berjalan':fmtDate(s.last_discover))+'</td><td></td>';
    var c=tr.lastChild;if(ME.admin){var lab=document.createElement('label');lab.className='switch';lab.innerHTML='<input type="checkbox"'+(s.enabled?' checked':'')+'> aktif';lab.querySelector('input').onchange=function(){api('/api/source',{method:'POST',body:{id:s.id,enabled:this.checked}}).then(loadStats).catch(function(e){toast(e.message)})};c.appendChild(lab);
      var rb=document.createElement('button');rb.className='ghost sm';rb.textContent='Cek ulang';rb.onclick=function(){api('/api/source/refresh',{method:'POST',body:{id:s.id}}).then(function(){toast('Sumber dicek ulang saat Perbarui berikutnya.');loadStats()})};c.appendChild(rb);
      if(!s.builtin){var db=document.createElement('button');db.className='ghost sm';db.textContent='Hapus';db.onclick=function(){if(confirm('Hapus sumber ini?'))api('/api/source/delete',{method:'POST',body:{id:s.id}}).then(loadStats).catch(function(e){toast(e.message)})};c.appendChild(db)}}
    else c.textContent=s.enabled?'aktif':'nonaktif';T.appendChild(tr)})})}
var running=false;$('runBtn').onclick=function(){var b=this;if(running){running=false;b.textContent='Perbarui sekarang';return}running=true;b.textContent='Berhenti';var L=$('runLog');L.hidden=false;L.textContent='Mulai…\n';var n=0,saved=0,errs=0;
  function loop(){if(!running||n>=150){fin();return}n++;api('/api/step',{method:'POST',body:{}}).then(function(j){errs=0;
    if(j.did==='idle'){L.textContent+='Selesai. Semua sumber sudah dicek dalam 24 jam terakhir.\n';fin();return}
    if(j.did==='discover')L.textContent+='Cek '+j.source+': +'+j.added+' URL'+(j.err?' ('+j.err+')':'')+'\n';
    if(j.did==='fetch')j.items.forEach(function(it){if(it.status==='done')saved++;L.textContent+=(it.status==='done'?'✓ ':it.status==='skip'?'– ':'✗ ')+it.url.replace(/^https?:\/\//,'').slice(0,80)+' · '+it.info+'\n'});
    L.scrollTop=L.scrollHeight;setTimeout(loop,300)}).catch(function(e){errs++;L.textContent+='Galat: '+e.message+(errs<3?' · lanjut ke langkah berikutnya\n':'\n');L.scrollTop=L.scrollHeight;if(errs>=3){L.textContent+='Berhenti setelah 3 galat berturut-turut.\n';fin()}else setTimeout(loop,1500)})}
  function fin(){running=false;b.textContent='Perbarui sekarang';L.textContent+='Artikel baru tersimpan: '+saved+'\n';loadStats();loadList(true)}loop()};
if(ME.admin){$('addCard').hidden=false;$('nsBtn').onclick=function(){api('/api/source/add',{method:'POST',body:{name:$('nsName').value,kind:$('nsKind').value,url:$('nsUrl').value,include:$('nsInc').value}}).then(function(){toast('Sumber ditambahkan.');$('nsName').value=$('nsUrl').value=$('nsInc').value='';loadStats()}).catch(function(e){toast(e.message)})}}
renderPicked();loadStats().then(function(){loadList(true)});
})();`;

export { robotsAllows, parseXml, topicOf, looksEdu };
// Ringkasan "Hari ini" untuk beranda Tool Hub (shared/hubfeed.js): draf 7 hari terakhir dan artikel sumber yang baru terkumpul hari ini (WIB).
async function hubToday(env, email) {
  const t = now(), today = new Date(t + 7 * 3600e3).toISOString().slice(0, 10), start = Date.parse(today + 'T00:00:00+07:00'), week = t - 7 * 864e5;
  const [d, c] = await env.DB.batch([
    env.DB.prepare('SELECT id, format, title, author, created_at FROM drafts WHERE created_at >= ? ORDER BY created_at DESC LIMIT 5').bind(week),
    env.DB.prepare('SELECT (SELECT COUNT(*) FROM drafts WHERE created_at >= ?1) AS n, (SELECT COUNT(*) FROM drafts WHERE created_at >= ?1 AND author = ?2) AS mine, (SELECT COUNT(*) FROM articles WHERE scraped_at >= ?3) AS art').bind(week, email, start),
  ]);
  const k = (c.results && c.results[0]) || {};
  return { date: today, n: k.n || 0, mine: k.mine || 0, articles: k.art || 0, drafts: d.results || [] };
}

export default withCron({
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!configured(env)) return new Response(setupPage(env), { status: 500, headers: { 'content-type': 'text/html; charset=utf-8' } });
    await init(env);
    if (url.pathname === HUB_FEED) return hubFeedAllowed(request, env) ? json(await hubToday(env, url.searchParams.get('email') || '')) : new Response('forbidden', { status: 403 });
    const sec = { 'content-security-policy': `frame-ancestors 'self' ${hubOrigin(env)}`, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' };
    if (url.pathname.startsWith('/api/')) {
      const me = await readToken(env, request);
      if (!me) return json({ error: 'Sesi habis. Muat ulang halaman.' }, 401);
      try { return await api(request, env, url, me); }
      catch (e) { return json({ error: e instanceof AiError ? e.message : 'Terjadi kesalahan: ' + (e && e.message || e) }, e instanceof AiError ? 502 : 500); }
    }
    if (url.pathname !== '/') return new Response('Tidak ditemukan', { status: 404 });
    const p = await verifyHub(env, url.searchParams.get('hub_t'));
    if (!p) {
      // belum ada tiket: minta ke Tool Hub (hub yang memeriksa login & hak akses)
      return Response.redirect(hubOrigin(env) + '/sso?app=' + APP_ID + '&back=' + encodeURIComponent(url.origin + '/'), 302);
    }
    const me = { e: p.e, n: p.n || '', adm: !!(p.adm || p.a === 'admin') };
    return new Response(appPage(env, await makeToken(env, p), me), { headers: { 'content-type': 'text/html; charset=utf-8', ...sec } });
  },
  async scheduled(event, env, ctx) {
    if (!configured(env)) return;
    await init(env);
    // maksimal tiga langkah per jadwal (tiap langkah: 4 artikel atau 1 potongan sitemap). Batas CPU dihitung per jadwal,
    // jadi berhenti setelah langkah sitemap (paling berat) supaya tidak melewati batas paket gratis.
    for (let i = 0; i < 3; i++) { const r = await step(env); if (r.did === 'idle' || r.did === 'discover') break; }
  },
});
