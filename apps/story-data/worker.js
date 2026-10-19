/**
 * Story Data — Cloudflare Worker
 * ------------------------------------------------------------------
 * Dipakai oleh Story Generator (apps/story-generator):
 *   ?part=morning   → penutupan TERAKHIR yang sudah selesai (IHSG, indeks global,
 *                     USD/IDR, minyak WTI, emas) + 20 penutupan IHSG untuk grafik
 *                     + komoditas (timah, batu bara, CPO, nikel) dari Market Proxy.
 *   ?part=halftime  → IHSG sesi 1 (harga, %, high, low), market breadth, sektor.
 *   ?part=lme       → cek harga LME Closing 3-month timah & nikel (+ % dari simpanan KV).
 *   ?part=bonds     → daftar & harga obligasi ritel dari profil sources.bondApi.
 *   ?part=ping      → cek worker hidup.
 *   ?part=runwrap   → minta GitHub Actions mengambil data penutupan IDX sekarang (untuk tab Wrap).
 *
 * Jadwal data Wrap TIDAK memakai jadwal GitHub (sering telat berjam-jam). Worker ini yang
 * menyalakan workflow GitHub "story-data.yml" tepat waktu (16:50 & 17:25 WIB) lewat SATU Cron Trigger
 * "tiap 5 menit Senin-Jumat". Repo diambil dari variabel GITHUB_REPO (diisi scripts/deploy.mjs).
 * Wajib: secret GH_TOKEN (fine-grained token GitHub untuk repo itu, izin Actions: Read and write).
 *
 * Timah & nikel memakai Workers KV LME_KV (lihat wrangler.jsonc).
 *
 * Komoditas, breadth, dan sektor diambil dari worker Market Proxy (apps/market-proxy).
 * Cloudflare tidak mengizinkan Worker memanggil Worker lain di akun yang sama lewat alamat
 * workers.dev (error 1042), jadi Market Proxy dipanggil lewat SERVICE BINDING bernama MARKET (wrangler.jsonc).
 */
import { profile } from '../../shared/profile.js';
import { withCron } from '../../shared/cron.js';

// Alamat apa saja: permintaan lewat service binding tidak keluar ke internet, hanya path & query yang dipakai.
const MARKET_URL = 'https://market-proxy/';

const YAHOO = {
  ihsg: '^JKSE', djia: '^DJI', ndq: '^IXIC', sp: '^GSPC',
  nk: '^N225', hsi: '^HSI', idr: 'IDR=X', oil: 'CL=F', gold: 'GC=F',
};
const COMMODITIES = { tin: 'TIN_BI', coal: 'COAL_BI', cpo: 'FCPO_MY', ni: 'NICKEL_BI' };

// Timah & nikel: harga resmi LME (Official Price, Cash, sisi Offer/seller), bertanggal.
// Dibandingkan dengan harga resmi hari bursa LME sebelumnya. Kalau LME gagal,
// otomatis memakai sumber cadangan (Business Insider lewat Market Proxy).
// datasourceId diambil dari tabel "Official Prices" di halaman logam masing-masing di lme.com.
const LME_API = 'https://www.lme.com/api/trading-data/day-delayed?datasourceId=';
const LME_OFFICIAL = {
  tin: { id: '361d4046-e7b6-4043-af80-8ce9cbee6727', page: 'lme-tin' },
  ni:  { id: 'acadf037-c13f-42f2-b42a-cac9a8179940', page: 'lme-nickel' },
};
// Harga yang DIPAKAI di story: LME Closing Price kontrak 3-month.
// Situs LME hanya menampilkan closing hari terakhir (tanpa riwayat), jadi worker
// MENYIMPAN sendiri closing tiap hari di Workers KV (binding bernama LME_KV) dan
// menghitung % dari closing hari bursa sebelumnya yang tersimpan.
const LME_CLOSING = {
  tin: { id: 'de878b98-626a-4a66-acba-d083a1b7a15e', page: 'lme-tin' },
  ni:  { id: 'ccb89496-0b6e-4352-b15f-12086ff4dbc1', page: 'lme-nickel' },
};
// CPO & batu bara dari TradingView (gratis, bisa diakses dari Cloudflare).
//  • CPO: kontrak bulan ke-3 Bursa Malaysia (acuan pasar), cadangan bulan terdekat.
//  • Batu bara: ICE Newcastle bulan terdekat (sama dengan acuan lama tim: Barchart LQ / Investing NCFMc1).
const TV_COMMODITIES = {
  cpo: ['MYX:FCPO3!', 'MYX:FCPO1!'],
  coal: ['ICEEUR:NCF1!'],
};

const GH_WORKFLOW = 'story-data.yml';
const WRAP_TIMES_UTC = [9 * 60 + 50, 10 * 60 + 25];   // 16:50 & 17:25 WIB
const LME_TIMES_UTC = [19 * 60 + 30, 23 * 60];          // 02:30 & 06:00 WIB

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export default withCron({
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const part = url.searchParams.get('part') || 'ping';
    const market = (query, timeoutMs) => marketJSON(env, query, timeoutMs);
    try {
      let body;
      if (part === 'morning') body = await morning(market, env);
      else if (part === 'halftime') body = await halftime(market);
      else if (part === 'lme') body = { tin: await lmeClosing('tin', env).catch(e => ({ error: String(e.message || e) })),
                                        ni: await lmeClosing('ni', env).catch(e => ({ error: String(e.message || e) })) };
      else if (part === 'ping') body = { ok: true, now: new Date().toISOString() };
      else if (part === 'runwrap') body = await runWrapNow(env);
      else if (part === 'bonds') body = await bondList(env);
      else if (part === 'tvcheck') body = await tvScan(['MYX:FCPO1!', 'MYX:FCPO2!', 'MYX:FCPO3!', 'ICEEUR:NCF1!', 'FX_IDC:USDIDR']);
      else return json({ error: `part tidak dikenal: ${part}` }, 400);
      return json(body);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 502);
    }
  },

  // Cron Trigger: catat closing LME setiap hari walau tombol generator tidak diklik.
  async scheduled(event, env, ctx) {
    // Dipanggil apps/cron tiap 5 menit, Senin–Jumat (UTC).
    // Worker memilih tugas berdasarkan jam:
    //   09:50 & 10:25 UTC (16:50 & 17:25 WIB) → ambil data Wrap (GitHub Actions mode wrap)
    //   19:30 & 23:00 UTC (02:30 & 06:00 WIB) → catat harga LME langsung dari worker ini ke LME_KV.
    //     (GitHub Actions mode lme tidak dinyalakan otomatis lagi: lme.com memblok server GitHub,
    //      sedangkan dari worker berhasil. Mode lme masih bisa dijalankan manual dari tab Actions.)
    const d = new Date(event.scheduledTime), m = d.getUTCHours() * 60 + d.getUTCMinutes();
    const log = tag => e => console.log(`dispatch ${tag} gagal`, e.message);
    if (WRAP_TIMES_UTC.includes(m)) ctx.waitUntil(dispatchIdx(env, 'wrap').catch(log('wrap')));
    if (LME_TIMES_UTC.includes(m))
      ctx.waitUntil(Promise.all(Object.keys(LME_CLOSING).map(k => lmeClosing(k, env).catch(() => null))));
  },
});

/** Nyalakan workflow GitHub "Data IDX (Wrap & Kalender)" (story-data.yml) di repo GITHUB_REPO. */
async function dispatchIdx(env, mode) {
  if (!env.GH_TOKEN) throw new Error('Secret GH_TOKEN belum dipasang di worker');
  if (!env.GITHUB_REPO) throw new Error('GITHUB_REPO kosong: isi github.repo di profile.json lalu deploy ulang');
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GH_TOKEN}`, 'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'story-data', 'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: profile(env).github.branch || 'main', inputs: { mode } }),
  });
  if (r.status !== 204) throw new Error(`GitHub menolak (HTTP ${r.status}): ${(await r.text()).slice(0, 160)}`);
}

/** Dipanggil tombol di generator. Dibatasi: hari bursa 15:30–22:00 WIB, sekali per 3 menit. */
async function runWrapNow(env) {
  const w = new Date(Date.now() + 7 * 3600e3), day = w.getUTCDay(), min = w.getUTCHours() * 60 + w.getUTCMinutes();
  if (day === 0 || day === 6 || min < 15 * 60 + 30 || min > 22 * 60)
    return { ok: false, error: 'Hanya bisa dijalankan hari bursa pukul 15:30–22:00 WIB.' };
  if (env.LME_KV) {
    const last = Number(await env.LME_KV.get('dispatch:wrap')) || 0;
    if (Date.now() - last < 180e3) return { ok: true, note: 'Pengambilan sudah berjalan, tunggu sebentar.' };
    await env.LME_KV.put('dispatch:wrap', String(Date.now()));
  }
  await dispatchIdx(env, 'wrap');
  return { ok: true, note: 'Pengambilan data IDX dimulai.' };
}

/** Daftar obligasi ritel dari API perusahaan (profil sources.bondApi; sources.bondPage = halaman produk yang sama). */
async function bondList(env) {
  const { bondApi, bondPage } = profile(env).sources;
  if (!bondApi) throw new Error('Sumber obligasi belum diatur (profil sources.bondApi)');
  const host = new URL(bondPage || bondApi).host;
  const headers = { 'Accept': 'application/json', 'User-Agent': UA };
  if (bondPage) { headers['Origin'] = new URL(bondPage).origin; headers['Referer'] = bondPage; }
  const r = await fetch(bondApi, { headers });
  if (!r.ok) throw new Error(`${host} menolak (HTTP ${r.status})`);
  const j = await r.json();
  const rows = (j && j.data) || [];
  const bonds = rows.filter(b => Number(b.active) === 1 && String(b.status || 'ACTIVE').toUpperCase() === 'ACTIVE').map(b => ({
    code: b.bond_code, name: b.bond_name,
    type: /perusahaan|korporasi|corp/i.test(b.bond_category || b.category || '') ? 'corp' : 'gov',
    syariah: Number(b.is_syariah) === 1, best: Number(b.best_bond) === 1,
    rating: b.rating, maturity: b.maturity_date, coupon: Number(b.coupon_rate),
    price: Number(b.sell_percent),                 // "Harga Beli" (harga beli nasabah) di halaman produk
    ytm: Number(b.ytm != null ? b.ytm : b.sell_yield),   // "YTM" di halaman produk (sesuai Harga Beli)
    settlement: b.settlement_date,
  }));
  if (!bonds.length) throw new Error(`daftar obligasi ${host} kosong`);
  return { ok: true, source: (bondPage || bondApi).replace(/^https?:\/\/(www\.)?/, ''), fetchedAt: new Date().toISOString(), bonds };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: CORS });
}

async function getJSON(url, opts = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} dari ${new URL(url).host}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** Panggil Market Proxy lewat Service Binding MARKET (worker di akun yang sama tidak bisa dipanggil lewat URL). */
async function marketJSON(env, query, timeoutMs = 25000) {
  if (!env || !env.MARKET || typeof env.MARKET.fetch !== 'function')
    throw new Error('Service binding MARKET (ke worker market-proxy) belum terpasang');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await env.MARKET.fetch(new Request(MARKET_URL + query, { signal: ctrl.signal }));
    if (!r.ok) throw new Error(`HTTP ${r.status} dari Market Proxy (service binding)`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function yahooChart(symbol, range, interval) {
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=${interval}&includePrePost=false`;
  const d = await getJSON(u, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  const res = d && d.chart && d.chart.result && d.chart.result[0];
  if (!res) throw new Error(`Yahoo tidak mengembalikan data untuk ${symbol}`);
  return res;
}

/** Tanggal (YYYY-MM-DD) sebuah timestamp di zona waktu bursanya. */
function dateAt(ts, gmtoffset) {
  return new Date((ts + (gmtoffset || 0)) * 1000).toISOString().slice(0, 10);
}

/**
 * Ambil candle harian yang SUDAH SELESAI.
 * Candle hari ini dibuang kalau sesi bursanya belum tutup,
 * jadi hasilnya selalu "penutupan terakhir" walau di-fetch saat bursa sedang buka.
 */
function completedDaily(res) {
  const ts = res.timestamp || [];
  const closes = (res.indicators && res.indicators.quote && res.indicators.quote[0].close) || [];
  const rows = ts.map((t, i) => ({ t, close: closes[i] })).filter(r => r.close != null);
  const reg = res.meta && res.meta.currentTradingPeriod && res.meta.currentTradingPeriod.regular;
  const now = Date.now() / 1000;
  if (rows.length && reg) {
    const last = rows[rows.length - 1];
    if (last.t >= reg.start - 60 && now < reg.end) rows.pop();
  }
  return rows;
}

function lmeCash(d) {
  const row = (d && d.Rows || []).find(r => /^cash$/i.test(String(r.RowTitle || '').trim()));
  const v = row && row.Values ? Number(String(row.Values[row.Values.length - 1]).replace(/,/g, '')) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Harga resmi LME (Cash, Offer) terbaru + hari bursa LME sebelumnya. key: 'tin' | 'ni' */
async function lmeOfficial(key) {
  const cfg = LME_OFFICIAL[key];
  const url = LME_API + cfg.id;
  const headers = { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': `https://www.lme.com/metals/non-ferrous/${cfg.page}` };
  const latest = await getJSON(url, { headers });
  const close = lmeCash(latest);
  const date = String(latest.DateOfData || '').slice(0, 10);
  if (!close || !date) throw new Error('LME: harga resmi Cash tidak ditemukan');
  let prevClose = null, prevDate = null;
  for (let back = 1; back <= 6 && prevClose == null; back++) {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - back);
    const ds = d.toISOString().slice(0, 10);
    const prev = await getJSON(`${url}&dateOfData=${ds}`, { headers });
    if (String(prev.DateOfData || '').slice(0, 10) === ds) { prevClose = lmeCash(prev); prevDate = prevClose ? ds : null; }
  }
  if (prevClose == null) throw new Error('LME: harga resmi hari sebelumnya tidak ditemukan');
  return { close, prevClose, changePct: (close - prevClose) / prevClose * 100, date, prevDate,
           source: 'LME Official Price (Cash, Offer)' };
}

/** Ambil LME Closing Price 3-month terbaru, simpan ke KV, hitung % dari closing tersimpan sebelumnya. */
async function lmeClosing(key, env) {
  const cfg = LME_CLOSING[key];
  const headers = { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': `https://www.lme.com/metals/non-ferrous/${cfg.page}` };
  const d = await getJSON(LME_API + cfg.id, { headers });
  const row = (d.Rows || []).find(r => /^3-month$/i.test(String(r.RowTitle || '').trim()));
  const close = row && row.Values ? Number(String(row.Values[0]).replace(/,/g, '')) : NaN;
  const date = String(d.DateOfData || '').slice(0, 10);
  if (!Number.isFinite(close) || close <= 0 || !date) throw new Error('LME: Closing Price 3-month tidak ditemukan');
  const out = { close, prevClose: null, changePct: null, date, prevDate: null, source: 'LME Closing Price (3-month)' };
  if (!env || !env.LME_KV) {
    out.note = 'Penyimpanan LME_KV belum dipasang — % perubahan tidak bisa dihitung';
    return out;
  }
  const hkey = `closing:${key}`;
  let hist = [];
  try { hist = JSON.parse(await env.LME_KV.get(hkey) || '[]'); } catch (_) { hist = []; }
  const i = hist.findIndex(h => h[0] === date);
  if (i >= 0) hist[i] = [date, close]; else hist.push([date, close]);
  hist.sort((a, b) => a[0] < b[0] ? -1 : 1);
  hist = hist.slice(-40);
  await env.LME_KV.put(hkey, JSON.stringify(hist));
  const prev = hist.filter(h => h[0] < date).pop();
  if (prev) {
    out.prevClose = prev[1]; out.prevDate = prev[0];
    out.changePct = (close - prev[1]) / prev[1] * 100;
  } else {
    out.note = 'Closing hari sebelumnya belum tersimpan (baru mulai mencatat) — % otomatis tersedia mulai hari bursa LME berikutnya';
  }
  return out;
}

function prevWeekday(ds) {
  const d = new Date(ds + 'T00:00:00Z');
  do d.setUTCDate(d.getUTCDate() - 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/**
 * Penutupan terakhir yang SUDAH SELESAI + penutupan sebelumnya, tahan terhadap candle harian
 * Yahoo yang kosong (null) — hal yang sering terjadi untuk ^JKSE, ^N225, ^HSI, CL=F, GC=F.
 *  • Bursa sedang TIDAK buka  → penutupan terakhir = meta.regularMarketPrice (tanggal regularMarketTime).
 *  • Bursa sedang buka         → penutupan terakhir = chartPreviousClose dari permintaan range=1d
 *    (untuk futures: setelah 17:00 waktu New York, settlement hari itu).
 *  • Penutupan sebelumnya      → candle harian terakhir yang berisi dan tanggalnya lebih awal.
 */
async function yahooLatest(sym, withSpark) {
  const [d, one] = await Promise.all([yahooChart(sym, '1mo', '1d'), yahooChart(sym, '1d', '1d').catch(() => null)]);
  const m = d.meta || {}, off = m.gmtoffset || 0, now = Date.now() / 1000;
  const closes = (d.indicators && d.indicators.quote && d.indicators.quote[0].close) || [];
  const rows = (d.timestamp || []).map((t, i) => ({ t, date: dateAt(t, off), close: closes[i] })).filter(r => r.close != null);
  const reg = m.currentTradingPeriod && m.currentTradingPeriod.regular;
  const inSession = !!(reg && now >= reg.start && now < reg.end);
  let close, date;
  if (!inSession && m.regularMarketPrice > 0 && m.regularMarketTime) {
    close = m.regularMarketPrice; date = dateAt(m.regularMarketTime, off);
  } else {
    const pc = one && one.meta && one.meta.chartPreviousClose;
    const local = new Date((now + off) * 1000), today = local.toISOString().slice(0, 10);
    date = (m.instrumentType === 'FUTURE' && local.getUTCHours() >= 17) ? today : prevWeekday(today);
    close = pc > 0 ? pc : null;
  }
  const before = rows.filter(r => r.date < date);
  if (!(close > 0)) { const last = before.pop(); if (!last) throw new Error('data penutupan tidak tersedia'); close = last.close; date = last.date; }
  let prev = before[before.length - 1];
  // Hari libur: "penutupan terakhir" ternyata sama dengan candle sebelumnya → mundur satu candle.
  if (prev && Math.abs(prev.close - close) < 1e-6) { date = prev.date; before.pop(); prev = before[before.length - 1]; }
  if (!prev) throw new Error('data penutupan kurang dari 2 hari');
  const q = { close, prevClose: prev.close, changePct: (close - prev.close) / prev.close * 100, date, prevDate: prev.date };
  if (withSpark) q.spark = [...before.map(r => r.close), close].slice(-20);
  return q;
}

/**
 * Buang "lonjakan" terisolasi pada data kurs Yahoo (mis. 17.900 → 17.559 → 17.950):
 * satu penutupan yang menyimpang > tol dari penutupan SEBELUM dan SESUDAHNYA,
 * padahal kedua tetangganya sendiri berdekatan. Mengembalikan baris bersih + tanggal yang dibuang.
 */
function dropSpikes(rows, gmtoffset, tol = 0.01) {
  const out = [], removed = [];
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i - 1], c = rows[i], n = rows[i + 1];
    if (p && n) {
      const dp = Math.abs(c.close / p.close - 1), dn = Math.abs(c.close / n.close - 1), pn = Math.abs(n.close / p.close - 1);
      if (dp > tol && dn > tol && pn < tol) { removed.push(dateAt(c.t, gmtoffset)); continue; }
    }
    out.push(c);
  }
  return { rows: out, removed };
}

/** Data futures/forex dari scanner TradingView. Hasil: { ticker: {close, change, changeAbs, desc} } */
async function tvScan(tickers) {
  const byMarket = {};
  tickers.forEach(t => { const mk = /^FX/.test(t) ? 'forex' : 'futures'; (byMarket[mk] = byMarket[mk] || []).push(t); });
  const out = {};
  await Promise.all(Object.entries(byMarket).map(async ([mk, list]) => {
    const r = await fetch(`https://scanner.tradingview.com/${mk}/scan`, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ symbols: { tickers: list }, columns: ['close', 'change', 'change_abs', 'description'] }),
    });
    if (!r.ok) throw new Error('TradingView HTTP ' + r.status);
    const j = await r.json();
    (j.data || []).forEach(x => { const [close, change, changeAbs, desc] = x.d || []; out[x.s] = { close, change, changeAbs, desc }; });
  }));
  return out;
}

/** Ambil satu komoditas dari TradingView: ticker pertama yang datanya lengkap. */
async function tvCommodity(key) {
  const list = TV_COMMODITIES[key];
  const res = await tvScan(list);
  for (const t of list) {
    const x = res[t];
    if (x && x.close > 0 && Number.isFinite(x.change) && Number.isFinite(x.changeAbs)) {
      const prevClose = x.close - x.changeAbs;
      return { close: x.close, prevClose, changePct: x.change, date: null, source: `TradingView ${t}` };
    }
  }
  throw new Error('TradingView: data ' + key + ' tidak tersedia');
}

/**
 * USD/IDR "penutupan sore" = harga pukul 16:00 WIB (setelah pasar valas domestik tutup),
 * dari candle 1 jam Yahoo. Candle HARIAN Yahoo untuk IDR=X tidak bisa dipercaya (penutupannya
 * sering di luar rentang high–low hari itu, mis. 30/9: close 17.736 padahal low 17.831).
 */
async function idrAfternoon() {
  const res = await yahooChart('IDR=X', '10d', '60m');
  const closes = (res.indicators && res.indicators.quote && res.indicators.quote[0].close) || [];
  const now = Date.now() / 1000, byDay = {};
  (res.timestamp || []).forEach((t, i) => {
    const c = closes[i];
    if (c == null || !(c > 0) || t + 3600 > now) return;           // candle belum selesai
    const w = new Date((t + 7 * 3600) * 1000), dow = w.getUTCDay(), hh = w.getUTCHours();
    if (dow === 0 || dow === 6 || hh > 15) return;                   // hari kerja; candle 15:00–16:00 WIB = harga 16:00
    const d = w.toISOString().slice(0, 10);
    if (!byDay[d] || t > byDay[d].t) byDay[d] = { t, close: c, hh };
  });
  const days = Object.keys(byDay).sort().filter(d => byDay[d].hh >= 15);   // hari yang sudah sampai sore
  if (days.length < 2) throw new Error('data USD/IDR sore hari kurang dari 2 hari');
  const a = byDay[days[days.length - 1]], b = byDay[days[days.length - 2]];
  return { close: a.close, prevClose: b.close, changePct: (a.close - b.close) / b.close * 100,
           date: days[days.length - 1], prevDate: days[days.length - 2], basis: 'harga 16:00 WIB' };
}

/** Harga USD/IDR terkini dari TradingView (pembanding independen). */
async function tvUsdIdr() {
  const r = await fetch('https://scanner.tradingview.com/forex/scan', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ symbols: { tickers: ['FX_IDC:USDIDR'] }, columns: ['close'] }),
  });
  if (!r.ok) throw new Error('TradingView HTTP ' + r.status);
  const j = await r.json();
  const v = j && j.data && j.data[0] && j.data[0].d && Number(j.data[0].d[0]);
  if (!Number.isFinite(v) || v <= 0) throw new Error('TradingView: USD/IDR tidak ada');
  return v;
}

/** Pemeriksaan kewajaran USD/IDR: dibersihkan dari lonjakan, dibandingkan dengan TradingView. */
const IDR_MAX_DAILY = 1.0;   // % — perubahan harian di atas ini wajib dicek manusia
const IDR_MAX_GAP = 1.0;     // % — selisih maksimal Yahoo vs TradingView
async function checkIdr(q, removed) {
  const reasons = [];
  if (removed.length) reasons.push(`data Yahoo tanggal ${removed.join(', ')} tidak wajar dan diabaikan (perubahan dihitung dari penutupan sebelumnya)`);
  let tv = null;
  try { tv = await tvUsdIdr(); } catch (e) { reasons.push('pembanding TradingView tidak tersedia'); }
  // Kalau yang dibuang justru penutupan tepat sebelum hari terakhir, basis % berubah → wajib dicek.
  let suspect = removed.some(d => !q.prevDate || d > q.prevDate);
  if (Math.abs(q.changePct) > IDR_MAX_DAILY) { suspect = true; reasons.push(`perubahan ${q.changePct.toFixed(2)}% dalam sehari (di atas ${IDR_MAX_DAILY}%)`); }
  if (tv) {
    const gap = Math.abs(q.close / tv - 1) * 100;
    if (gap > IDR_MAX_GAP) { suspect = true; reasons.push(`berbeda ${gap.toFixed(1)}% dari TradingView (${Math.round(tv)})`); }
  }
  return { suspect, reasons, tv, removed };
}

async function morning(market, env) {
  const quotes = {};
  const errors = {};
  await Promise.all(Object.entries(YAHOO).map(async ([key, sym]) => {
    try {
      if (key !== 'idr') { quotes[key] = await yahooLatest(sym, key === 'ihsg'); return; }
      if (key === 'idr') {
        quotes.idr = await idrAfternoon();
        quotes.idr.check = await checkIdr(quotes.idr, []);
        return;
      }
      const res = await yahooChart(sym, '1mo', '1d');
      let rows = completedDaily(res), removed = [];
      if (rows.length < 2) throw new Error('data penutupan kurang dari 2 hari');
      const a = rows[rows.length - 1], b = rows[rows.length - 2];
      quotes[key] = {
        close: a.close, prevClose: b.close,
        changePct: (a.close - b.close) / b.close * 100,
        date: dateAt(a.t, res.meta.gmtoffset),
        prevDate: dateAt(b.t, res.meta.gmtoffset),
      };
      if (key === 'idr') quotes[key].check = await checkIdr(quotes[key], removed);
      if (key === 'ihsg') quotes[key].spark = rows.slice(-20).map(r => r.close);
    } catch (e) { errors[key] = String(e.message || e); }
  }));

  const commodities = {};
  try {
    const d = await market(`?symbols=${encodeURIComponent(Object.values(COMMODITIES).join(','))}`, 15000);
    for (const [key, sym] of Object.entries(COMMODITIES)) {
      const x = d[sym];
      if (!x || x.error || x.price == null || x.prevClose == null) { errors[key] = (x && x.error) || 'tidak tersedia'; continue; }
      commodities[key] = { close: x.price, prevClose: x.prevClose, changePct: (x.price - x.prevClose) / x.prevClose * 100, date: x.date || null };
    }
  } catch (e) {
    for (const key of Object.keys(COMMODITIES)) errors[key] = 'Market Proxy: ' + String(e.message || e);
  }
  // CPO & batu bara: TradingView sebagai sumber utama; Market Proxy (Investing / Business Insider) cadangan.
  await Promise.all(Object.keys(TV_COMMODITIES).map(async key => {
    try {
      commodities[key] = await tvCommodity(key);
      delete errors[key];
    } catch (e) {
      if (commodities[key]) commodities[key].source = (commodities[key].source || 'Market Proxy') + ' — cadangan (' + String(e.message || e) + ')';
    }
  }));
  await Promise.all(Object.keys(LME_CLOSING).map(async key => {
    try {
      const c = await lmeClosing(key, env);
      if (c.changePct == null) throw new Error(c.note);
      commodities[key] = c;                 // sumber utama: LME Closing Price 3-month
      delete errors[key];
    } catch (e) {
      const msg = 'LME closing: ' + String(e.message || e);
      try {                                 // cadangan 1: LME Official Price (Cash)
        commodities[key] = await lmeOfficial(key);
        commodities[key].source += ' — cadangan (' + msg + ')';
        delete errors[key];
      } catch (e2) {                        // cadangan 2: Business Insider (Market Proxy)
        if (commodities[key]) commodities[key].source = 'Business Insider — cadangan (' + msg + ')';
        else errors[key] = msg + (errors[key] ? ' | ' + errors[key] : '');
      }
    }
  }));
  return { ok: true, fetchedAt: new Date().toISOString(), quotes, commodities, errors };
}

async function halftime(market) {
  const [breadthRes, summaryRes, intraday] = await Promise.all([
    market('?market=idx&part=idx', 25000),
    market('?market=idx&part=summary', 25000),
    yahooChart('^JKSE', '1d', '5m').catch(e => ({ error: String(e.message || e) })),
  ]);
  if (breadthRes.error) throw new Error('Breadth: ' + breadthRes.error);
  if (summaryRes.error) throw new Error('Ringkasan IHSG: ' + summaryRes.error);

  // High & low sesi 1: candle 5 menit IHSG sampai akhir sesi 1 (12:00 WIB; Jumat 11:30).
  let high = null, low = null, hlSource = null;
  if (intraday && !intraday.error) {
    const off = intraday.meta.gmtoffset || 25200;
    const q = intraday.indicators.quote[0];
    (intraday.timestamp || []).forEach((t, i) => {
      const local = new Date((t + off) * 1000);
      const mins = local.getUTCHours() * 60 + local.getUTCMinutes();
      const endS1 = local.getUTCDay() === 5 ? 11 * 60 + 30 : 12 * 60;
      if (mins < 9 * 60 || mins >= endS1) return;
      if (q.high[i] != null) high = high == null ? q.high[i] : Math.max(high, q.high[i]);
      if (q.low[i] != null) low = low == null ? q.low[i] : Math.min(low, q.low[i]);
    });
    hlSource = 'Yahoo 5m';
    if (high == null && intraday.meta) {
      high = intraday.meta.regularMarketDayHigh ?? null;
      low = intraday.meta.regularMarketDayLow ?? null;
      hlSource = 'Yahoo meta';
    }
  }

  const m = summaryRes.market || {};
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    ihsg: {
      price: m.ihsg ? m.ihsg.price : null,
      changePct: m.ihsg ? m.ihsg.changePct : null,
      high, low, hlSource,
    },
    breadth: breadthRes.breadth || null,
    breadthSource: breadthRes.source || null,
    complete: !!breadthRes.complete,
    masterUniverse: breadthRes.masterUniverse || null,
    recordsReceived: breadthRes.recordsReceived || null,
    sectors: Array.isArray(m.sectors) ? m.sectors : [],
  };
}
