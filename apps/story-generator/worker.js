// =====================================================================
// STORY GENERATOR — Worker dengan static assets (folder ./site, lihat wrangler.jsonc).
// Semua permintaan lewat sini dulu (run_worker_first), lalu file diambil dari env.ASSETS.
// • Login & hak tab diurus Tool Hub; generator ini tidak menyimpan akun.
// • Membuang tab yang tidak diizinkan dari halaman SEBELUM dikirim ke browser.
// • Hanya dipakai di dalam dashboard Tool Hub (dibuka langsung -> pindah ke tab-nya di hub).
// • Menyisipkan window.PROFILE (nama brand, logo, link, alamat tool lain) ke halaman.
// • /api/draft: draf tim bersama di KV DRAFTS.
// Pengaturan: secret SSO_SECRET = nilai yang SAMA dengan SSO_SECRET di Tool Hub.
//   HUB_URL & PROFILE diisi otomatis oleh scripts/deploy.mjs.
// =====================================================================
import { title, profileScript } from '../../shared/profile.js';
import { themeHead } from '../../shared/theme.js';
import { STORY_THEME_CSS } from './theme.js';

const TABS = {
  morning:   ['pw-m1', 'pw-m2', 'pw-m3', 'pw-m4'],
  halftime:  ['pw-h1', 'pw-h2'],
  wrap:      ['pw-w1', 'pw-w2'],
  weekly:    ['pw-wk1', 'pw-wk2', 'pw-wk3', 'pw-wk4', 'pw-wk5'],
  rdh:       ['pw-rh1', 'pw-rh2', 'pw-rh3', 'pw-rh4', 'pw-rh5', 'pw-rh6'],
  bondpicks: ['pw-bp1', 'pw-bp2'],
};
// file di luar ./site memang tidak ikut tersaji; penjaga ini tetap dipasang untuk berjaga-jaga
const BLOCKED = /^\/(functions|config|worker|scripts|alat|\.github)(\/|$)|^\/(PANDUAN|README|wrangler)/i;
const APP = 'story', COOKIE = 'hub_' + APP, SESS_HOURS = 2;
// SameSite=None + Partitioned: generator ini beralamat di subdomain workers.dev sendiri tetapi tampil di dalam dashboard
// (subdomain lain = situs lain), jadi cookie biasa tidak akan terkirim. Satu-satunya permintaan yang mengubah data
// (POST /api/draft) memeriksa header Origin.
const CK = 'Path=/; HttpOnly; Secure; SameSite=None; Partitioned';
const enc = new TextEncoder();

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function sign(secret, body) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
}
/** Isi tiket/sesi kalau tanda tangannya sah, untuk tool ini, dan belum kedaluwarsa; selain itu null. */
async function openToken(secret, tok) {
  const [body, sig] = String(tok || '').split('.');
  if (!body || !sig || !safeEq(await sign(secret, body), sig)) return null;
  let p; try { p = JSON.parse(new TextDecoder().decode(fromB64u(body))); } catch (e) { return null; }
  return p && p.app === APP && p.x > Date.now() ? p : null;
}
const go = (to, extra = {}) => new Response(null, { status: 303, headers: { location: to, 'cache-control': 'no-store', ...extra } });

/* ---------- Draft tim: satu draft bersama per template/story, disimpan di KV binding DRAFTS ----------
   GET  /api/draft          -> [{k, by, at, title}]   daftar draft tim
   GET  /api/draft?k=market -> {k, data, by, at, title} atau {}
   POST /api/draft {k, data, title, base, force} -> {ok, at, by} atau 409 {conflict, by, at} bila orang lain menyimpan setelah versi "base"
   ponytail: satu draft per template (yang terakhir menang setelah konfirmasi); riwayat versi belum ada */
async function draftApi(request, env, who) {
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  if (!env.DRAFTS) return J({ error: 'Penyimpanan draft tim belum dipasang (KV binding DRAFTS).', off: true }, 501);
  const u = new URL(request.url), K = /^[a-z0-9_-]{1,24}$/;
  if (request.method === 'GET') {
    const k = u.searchParams.get('k');
    if (!k) return J((await env.DRAFTS.list({ prefix: 'd:' })).keys.map(x => ({ k: x.name.slice(2), ...(x.metadata || {}) })));
    if (!K.test(k)) return J({ error: 'k?' }, 400);
    return J((await env.DRAFTS.get('d:' + k, 'json')) || {});
  }
  if (request.method !== 'POST') return J({ error: 'method' }, 405);
  if (request.headers.get('origin') && request.headers.get('origin') !== u.origin) return J({ error: 'origin' }, 403);
  const b = await request.json().catch(() => ({})), k = String(b.k || '');
  if (!K.test(k) || !b.data || typeof b.data !== 'object') return J({ error: 'Data draft tidak valid' }, 400);
  const body = JSON.stringify(b.data);
  if (body.length > 400000) return J({ error: 'Draft terlalu besar' }, 413);
  const cur = await env.DRAFTS.get('d:' + k, 'json');
  if (cur && cur.at && !b.force && cur.by !== who && cur.at > (+b.base || 0)) return J({ conflict: true, by: cur.by, at: cur.at }, 409);
  const at = Date.now(), title = String(b.title || '').slice(0, 120), rec = { k, data: b.data, by: who, at, title };
  await env.DRAFTS.put('d:' + k, JSON.stringify(rec), { metadata: { by: who, at, title } });
  return J({ ok: true, at, by: who });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (BLOCKED.test(path)) return new Response('Not found', { status: 404 });

    const secret = env.SSO_SECRET, hub = String(env.HUB_URL || '').replace(/\/+$/, '');
    if (!secret || secret.length < 32 || !hub) return new Response('Generator belum dikonfigurasi: pasang secret SSO_SECRET (sama dengan di Tool Hub) dan HUB_URL (diisi scripts/deploy.mjs).', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });

    if (path === '/logout' || path === '/login') return go(path === '/logout' ? hub + '/logout' : '/', { 'set-cookie': `${COOKIE}=; ${CK}; Max-Age=0` });

    // kembali dari hub membawa tiket -> tukar dengan cookie sesi 2 jam
    // ponytail: akses yang dicabut di hub terasa paling lambat 2 jam; perpendek SESS_HOURS bila perlu lebih cepat
    const t = url.searchParams.get('hub_t');
    if (t) {
      const p = await openToken(secret, t); url.searchParams.delete('hub_t');
      if (p) { const body = b64u(enc.encode(JSON.stringify({ ...p, x: Date.now() + SESS_HOURS * 3600e3 }))); return go(url.pathname + url.search, { 'set-cookie': `${COOKIE}=${body}.${await sign(secret, body)}; ${CK}; Max-Age=${SESS_HOURS * 3600}` }); }
    }
    const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
    const sess = m && await openToken(secret, m[1]);
    if (!sess) {
      const accept = request.headers.get('accept') || '';
      if (request.method === 'GET' && (accept.includes('text/html') || path === '/' || path.endsWith('.html')))
        return go(`${hub}/sso?app=${APP}&back=${encodeURIComponent(url.origin + url.pathname + url.search)}`);
      return new Response('Unauthorized', { status: 401, headers: { 'cache-control': 'no-store' } });
    }

    if (path === '/api/draft') return draftApi(request, env, sess.n || sess.e || 'tim');

    const allowed = Array.isArray(sess.a) ? sess.a : [];
    const tabs = allowed.includes('*') ? Object.keys(TABS) : allowed.filter(t => TABS[t]);

    // tanpa If-None-Match: halaman HTML diubah di bawah, jadi 304 dari aset bisa membuat browser memakai halaman lama
    const req = new Request(request);
    if (!/\.[a-z0-9]+$/i.test(path) || path.endsWith('.html')) req.headers.delete('if-none-match');
    const res = await env.ASSETS.fetch(req);
    const h0 = new Headers(res.headers);
    h0.set('cache-control', 'private, no-store');
    h0.set('content-security-policy', `frame-ancestors 'self' ${hub}`);   // hanya boleh ditampilkan di dalam Tool Hub
    if (!(res.headers.get('content-type') || '').includes('text/html'))
      return new Response(res.body, { status: res.status, headers: h0 });
    h0.delete('content-length'); h0.delete('etag');   // isi halaman diubah di bawah (beda per akun)

    let rw = new HTMLRewriter().on('head', { element(el) {
      el.prepend(profileScript(env), { html: true });
      el.append(themeHead(STORY_THEME_CSS), { html: true });   // setelah CSS halaman: tema gelap dari Tool Hub
      // dibuka di luar dashboard -> pindah ke tab-nya di hub; email & Keluar sudah ada di bilah dashboard
      el.append(`<script>if(window.top===window.self)location.replace(${JSON.stringify(hub + '/#' + APP)});window.HUB_USER=${JSON.stringify({ email: sess.e, tabs }).replace(/</g, '\\u003c')};</script><style>.tb-user{display:none!important}</style>`, { html: true });
    } }).on('title', { element(el) { el.setInnerContent(title(env, 'Story Generator')); } });
    for (const [t, ids] of Object.entries(TABS)) {
      if (tabs.includes(t)) continue;
      rw = rw.on(`button[data-tab="${t}"]`, { element(el) { el.remove(); } })
             .on(`#form-${t}`, { element(el) { el.remove(); } });
      for (const id of ids) rw = rw.on(`#${id}`, { element(el) { el.remove(); } });
    }
    return rw.transform(new Response(res.body, { status: res.status, headers: h0 }));
  },
};
