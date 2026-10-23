// ETF Insight — Cloudflare Worker
// - "/"           -> aplikasi internal (login lewat Tool Hub, hanya tampil di dalam dashboard)
// - "/p/<KODE>"   -> halaman untuk nasabah (tanpa login), mis. /p/XKMS; tombol PDF = cetak halaman
// - "/api/etf"    -> data (terbuka, hanya GET): ETF KISI + semua ETF di BEI sebagai pembanding
// - "/__hub/today"-> peringatan ops & kalender 7 hari untuk beranda dan lonceng Tool Hub (service binding, shared/hubfeed.js)
//
// Sumber (semua publik, diambil di sisi server):
//   TradingView scanner : harga (berjalan), volume, nilai transaksi, biaya, IDX30 & LQ45 berjalan, ETF EIDO & kurs USD/IDR
//   Yahoo Finance       : riwayat harga harian & dividen ETF KISI, IDX30, IHSG, indeks syariah (JII, JII70, ISSI)
//   Fund Insight (D1)   : NAB, AUM, return NAB dari data pasar Bareksa (tabel mktsnap, hanya dibaca)
// Ops: perkiraan iNAV (NAB terakhir × pergerakan indeks sejak tanggal NAB), tracking error dari selisih return bulanan
// NAB vs indeks, kalender ops (review indeks MSCI & IDX30, dividen dari riwayat, laporan bulanan), dan peringatan anomali.
// Tidak ada cron dan tidak menulis ke D1; hasil disimpan di cache 10 menit.
import { profile, title, profileScript } from "../../shared/profile.js";
import { themeHead } from "../../shared/theme.js";
import { HUB_FEED, hubFeedAllowed } from "../../shared/hubfeed.js";
import PAGE from "./page.html";
import { newsFor } from "../../shared/news.js";

// Berita (internal): ETF & indeks yang diikuti (MSCI Indonesia, IDX30; didahulukan), plus penggerak bursa (IHSG, BEI, dana asing)
export const ETF_TOP_RE = /\bETF\b|reksa ?dana indeks|LQ ?45|IDX ?30|IDX ?80|Kompas ?100|MSCI|FTSE|SRI[- ]KEHATI/i;
export const ETF_NEWS_RE = new RegExp(ETF_TOP_RE.source + /|IHSG|indeks saham|pasar saham|bursa|\bBEI\b|\basing\b|net (buy|sell)/.source, "i");

/* =========================================================
   LOGIN LEWAT TOOL HUB
   ========================================================= */
const HUBSSO = (() => {
  const APP = "etf", COOKIE = "hub_" + APP, HOURS = 2, te = new TextEncoder();
  // SameSite=None + Partitioned: cookie tetap terkirim saat tool tampil di dalam dashboard Tool Hub (bingkai).
  const CK = "Path=/; HttpOnly; Secure; SameSite=None; Partitioned";
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64 = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
  const eq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
  const sign = async (secret, body) => b64(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), te.encode(body)));
  // isi tiket/sesi kalau tanda tangannya sah, untuk tool ini, dan belum kedaluwarsa; selain itu null
  const open = async (env, tok) => {
    const [body, sig] = String(tok || "").split(".");
    if (!body || !sig || !eq(await sign(env.SSO_SECRET, body), sig)) return null;
    let p; try { p = JSON.parse(new TextDecoder().decode(unb64(body))); } catch (e) { return null; }
    return p && p.app === APP && p.x > Date.now() ? p : null;
  };
  const hub = (env) => String(env.HUB_URL || "").replace(/\/+$/, "");
  const go = (to, extra = {}) => new Response(null, { status: 303, headers: { location: to, "cache-control": "no-store", ...extra } });
  return {
    ready: (env) => String(env.SSO_SECRET || "").length >= 32,
    notReady: () => new Response("Tool ini belum dikonfigurasi: pasang secret SSO_SECRET (sama dengan di Tool Hub).", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } }),
    /** Kembali dari hub membawa ?hub_t=... -> tukar dengan cookie sesi 2 jam. null kalau alamat tidak membawa tiket. */
    async ticket(request, env) {
      const url = new URL(request.url), t = url.searchParams.get("hub_t");
      if (!t) return null;
      const p = await open(env, t); url.searchParams.delete("hub_t");
      if (!p) return go(url.pathname + url.search);
      const body = b64(te.encode(JSON.stringify({ ...p, x: Date.now() + HOURS * 3600e3 })));
      return go(url.pathname + url.search, { "set-cookie": `${COOKIE}=${body}.${await sign(env.SSO_SECRET, body)}; ${CK}; Max-Age=${HOURS * 3600}` });
    },
    async user(request, env) {
      const m = (request.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
      return m ? open(env, m[1]) : null;
    },
    login: (request, env) => { const url = new URL(request.url); return go(`${hub(env)}/sso?app=${APP}&back=${encodeURIComponent(url.origin + url.pathname + url.search)}`); },
    logout: (env) => go(hub(env) + "/logout", { "set-cookie": `${COOKIE}=; ${CK}; Max-Age=0` }),
    /** Halaman aplikasi hanya dipakai di dalam dashboard: dibuka langsung -> pindah ke tab-nya di hub. */
    onlyInHub: (env) => `if(window.top===window.self)location.replace(${JSON.stringify(hub(env) + "/#" + APP)});`,
    frame: (env) => `frame-ancestors 'self' ${hub(env)}`,
  };
})();

/* =========================================================
   DAFTAR ETF
   ========================================================= */
// ETF KISI. pid = id Bareksa di data pasar Fund Insight; bench = pembanding kinerja indeks.
// listedAt = perkiraan tanggal tercatat (berita peluncuran); return periode yang lebih panjang dari umur ETF dikosongkan.
// live = indeks berjalan di TradingView untuk perkiraan iNAV (MSCI Indonesia tidak tersedia gratis saat jam bursa: didekati LQ45).
const KISI = {
  XKMS: { pid: "4274", index: "MSCI Indonesia", bench: "msci", listed: "Nov 2020", listedAt: "2020-11-30", group: "big", live: "LQ45", review: "msci" },
  XKID: { pid: "4795", index: "IDX30", bench: "idx30", listed: "Nov 2023", listedAt: "2023-11-30", group: "idx30", live: "IDX30", review: "idx30" },
};
// Indeks dari Yahoo: IDX30 harian (tracking error XKID), IHSG, dan indeks syariah sebagai pembanding.
// ISSI & JII70 tidak punya riwayat di Yahoo: ISSI diambil kinerjanya dari TradingView, JII70 tidak tersedia gratis.
const IDX_Y = { idx30: "IDX30.JK", ihsg: "^JKSE", jii: "^JKII" };
export const SHARIA_IDX = [["jii", "JII (Jakarta Islamic Index, 30 saham)"], ["issi", "ISSI (semua saham syariah)"], ["ihsg", "IHSG (pembanding)"]];
const MONTHS = { m1: 1, m3: 3, m6: 6, y1: 12, y3: 36 };
const young = (listedAt, end, k) => { if (!end || !MONTHS[k]) return false; const t = new Date(end + "T00:00:00Z"); t.setUTCMonth(t.getUTCMonth() - MONTHS[k]); return t.toISOString().slice(0, 10) < listedAt; };
const trim = (ret, listedAt, end) => Object.fromEntries(Object.entries(ret || {}).map(([k, v]) => [k, young(listedAt, end, k) ? null : v]));
// Semua ETF di BEI: kode -> [pid Bareksa, kelompok]. Dicocokkan dari nama TradingView vs Bareksa (Okt 2026).
// ETF baru yang belum ada di sini tetap tampil (kelompok "Lainnya", tanpa NAB/AUM).
const ETFS = {
  XKID: ["4795", "idx30"], XIIT: ["1095", "idx30"], XIID: ["4173", "idx30"], XSBC: ["3364", "idx30"], XBID: ["3719", "idx30"], XPTD: ["3789", "idx30"],
  XKMS: ["4274", "big"], XIML: ["4106", "big"], "R-LQ45X": ["1096", "big"], XMLF: ["4676", "big"], XCLQ: ["4016", "big"], XDIF: ["3185", "big"],
  XISR: ["1725", "theme"], XBSK: ["3739", "theme"], XSSK: ["4155", "theme"], XMSK: ["4898", "theme"], XIFE: ["4328", "theme"], XCEG: ["4545", "theme"],
  XPSG: ["3076", "theme"], XILV: ["4163", "theme"], XIHD: ["3666", "theme"], XPDV: ["2635", "theme"], XKIV: ["3993", "theme"], XISC: ["2037", "theme"],
  XISI: ["1099", "theme"], XIPB: ["5019", "theme"], XBIN: ["3950", "theme"], XPLQ: ["2333", "theme"], XBLQ: ["3184", "theme"],
  XIJI: ["1098", "sharia"], XSSI: ["3935", "sharia"],
  XIPI: ["3667", "bond"], XMIG: ["3844", "bond"], XPIN: ["5021", "bond"], XISB: ["2502", "bond"], XRDN: ["5166", "bond"],
  XTRA: ["5273", "gold"], XKGS: ["5294", "gold"], XGLD: ["5278", "gold"], XMES: ["5275", "gold"], XDES: ["5277", "gold"], XBGS: ["5292", "gold"], XSGO: ["5279", "gold"],
};
const GROUPS = { idx30: "IDX30", big: "Saham besar (MSCI, LQ45, Top 40)", theme: "Saham tematik, ESG & faktor", sharia: "Saham syariah", bond: "Obligasi & kas", gold: "Emas", other: "Lainnya" };

/* =========================================================
   SUMBER DATA
   ========================================================= */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const PERF = ["Perf.1M", "Perf.3M", "Perf.6M", "Perf.YTD", "Perf.Y", "Perf.3Y"], PK = ["m1", "m3", "m6", "ytd", "y1", "y3"];
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

async function tv(market, body) {
  const r = await fetch(`https://scanner.tradingview.com/${market}/scan`, {
    method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`TradingView ${market} HTTP ${r.status}`);
  return (await r.json()).data || [];
}
const perfOf = (d, at) => Object.fromEntries(PK.map((k, i) => [k, num(d[at + i])]));

// withDiv = ikut ambil riwayat dividen (out.div = [[tanggal WIB, Rp per unit]])
async function yahoo(symbol, range = "1y", withDiv = false) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d${withDiv ? "&events=div" : ""}`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
  const res = (await r.json()).chart?.result?.[0];
  if (!res) throw new Error(`Yahoo ${symbol}: data kosong`);
  const q = res.indicators.quote[0], out = [], wib = (t) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);
  res.timestamp.forEach((t, i) => {
    const c = num(q.close[i]);
    if (c != null) out.push([wib(t), c, num(q.volume && q.volume[i]) || 0]);   // tanggal WIB; sebagian indeks tanpa kolom volume
  });
  if (withDiv) out.div = Object.values(res.events?.dividends || {}).map((d) => [wib(d.date), num(d.amount)]).filter((d) => d[1]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return out;
}

// Return per periode yang BERAKHIR di tanggal `end` dari deret [tanggal, nilai] (urut naik), memakai nilai terakhir <= tanggal.
function retAt(series, end) {
  const at = (d) => { let v = null; for (const p of series) { if (p[0] > d) break; v = p[1]; } return v; };
  const back = (months) => { const t = new Date(end + "T00:00:00Z"); t.setUTCMonth(t.getUTCMonth() - months); return t.toISOString().slice(0, 10); };
  const v1 = at(end), base = { m1: back(1), m3: back(3), m6: back(6), ytd: `${+end.slice(0, 4) - 1}-12-31`, y1: back(12), y3: back(36) };
  return Object.fromEntries(PK.map((k) => { const v0 = series[0] && series[0][0] <= base[k] ? at(base[k]) : null; return [k, v0 && v1 ? (v1 / v0 - 1) * 100 : null]; }));
}

// NAB, AUM, return dari data pasar Fund Insight. f[pid] = [NAB, AUM miliar, bulan AUM yyyymm, jenis, ret 6B, 1T, 3T, tanggal NAB, ret 1B, 3B, YTD]
async function market(env) {
  if (!env.DB) return { at: null, f: {}, names: {}, hist: [] };
  const pids = [...new Set(Object.values(ETFS).map((x) => x[0]))], ph = pids.map(() => "?").join(",");
  const kp = Object.values(KISI).map((k) => k.pid);
  const [f, n, a, h] = await env.DB.batch([
    env.DB.prepare(`SELECT j.key k, j.value v FROM mktsnap, json_each(mktsnap.v, '$.f') j WHERE mktsnap.d='latest' AND j.key IN (${ph})`).bind(...pids),
    env.DB.prepare(`SELECT j.key k, j.value v FROM mktsnap, json_each(mktsnap.v, '$.names') j WHERE mktsnap.d='latest' AND j.key IN (${ph})`).bind(...pids),
    env.DB.prepare("SELECT json_extract(v, '$.at') at FROM mktsnap WHERE d='latest'"),
    env.DB.prepare(`SELECT d, ${kp.map((p) => `json_extract(v, '$."${p}"') AS "${p}"`).join(", ")} FROM mktsnap WHERE d <> 'latest' ORDER BY d`),
  ]);
  const J = (s) => { try { return typeof s === "string" ? JSON.parse(s) : s; } catch { return null; } };
  return {
    at: a.results?.[0]?.at || null,
    f: Object.fromEntries((f.results || []).map((r) => [r.k, J(r.v)])),
    names: Object.fromEntries((n.results || []).map((r) => [r.k, J(r.v)])),
    hist: (h.results || []).map((r) => ({ d: r.d, ...Object.fromEntries(kp.map((p) => [p, J(r[p])])) })),
  };
}

// Arus dana bersih per bulan (Rp miliar) = AUM bulan ini − AUM bulan lalu × (NAB akhir bulan ini / NAB akhir bulan lalu)
function flows(pid, hist, latest) {
  const byM = {};
  for (const h of [...hist, { d: "9999", [pid]: latest }]) {
    const r = h[pid];
    if (!r || !r[1] || !r[2]) continue;
    byM[r[2]] = r[1];
  }
  const navEnd = (ym) => {   // NAB terakhir yang tercatat di bulan itu
    const y = Math.floor(ym / 100), m = ym % 100, end = `${y}-${String(m).padStart(2, "0")}-31`;
    let v = null;
    for (const h of hist) if (h.d <= end && h.d.slice(0, 7) === end.slice(0, 7) && h[pid]) v = h[pid][0];
    return v;
  };
  const ms = Object.keys(byM).map(Number).sort((x, y) => x - y), out = [];
  for (let i = 1; i < ms.length; i++) {
    const a = ms[i - 1], b = ms[i], n0 = navEnd(a), n1 = navEnd(b);
    let fl = n0 && n1 ? byM[b] - byM[a] * (n1 / n0) : null;
    if (fl != null && Math.abs(fl) < byM[b] * 0.001) fl = 0;   // sisa pembulatan AUM, bukan arus dana
    out.push({ ym: b, aum: byM[b], flow: fl == null ? null : +fl.toFixed(3) });
  }
  return out.slice(-12);
}

const prevWeekday = (d) => { const t = new Date(d + "T00:00:00Z"); do t.setUTCDate(t.getUTCDate() - 1); while (t.getUTCDay() % 6 === 0); return t.toISOString().slice(0, 10); };
// Return per tahun kalender dari deret harian; tahun berjalan = sampai tanggal `end`.
function yearsOf(series, end) {
  const at = (d) => { let v = null; for (const p of series) { if (p[0] > d) break; v = p[1]; } return v; };
  const out = {}, y1 = +end.slice(0, 4);
  for (let y = +series[0][0].slice(0, 4) + 1; y <= y1; y++) {
    const v0 = at(`${y - 1}-12-31`), v1 = y === y1 ? at(end) : at(`${y}-12-31`);
    if (v0 && v1) out[y] = (v1 / v0 - 1) * 100;
  }
  return out;
}

/* =========================================================
   OPS: iNAV, TRACKING ERROR, KALENDER, PERINGATAN (fungsi murni, dicek di test.mjs)
   ========================================================= */
const isoD = (d) => d.toISOString().slice(0, 10);
const addD = (iso, n) => { const t = new Date(iso + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return isoD(t); };
/** Jumlah hari kerja (Senin–Jumat) setelah a sampai b. */
export function weekdaysBetween(a, b) {
  let n = 0;
  for (let d = addD(a, 1); d <= b; d = addD(d, 1)) { const w = new Date(d + "T00:00:00Z").getUTCDay(); if (w % 6) n++; }
  return n;
}
/**
 * Perkiraan iNAV = NAB terakhir × (indeks sekarang ÷ indeks pada tanggal NAB). live = { c: penutupan/berjalan, p: penutupan kemarin }.
 * Hanya bila tanggal NAB = hari harga terakhir atau 1 hari bursa sebelumnya (TradingView hanya memberi dua titik itu).
 */
export function inavOf(nav, navDate, priceDate, live) {
  if (!nav || !navDate || !priceDate || !live || !live.c) return null;
  const base = navDate === priceDate ? live.c : navDate === prevWeekday(priceDate) ? live.p : null;
  if (!base) return null;
  return { value: nav * live.c / base, move: (live.c / base - 1) * 100 };
}
const monthIdx = (m) => +m.slice(0, 4) * 12 + +m.slice(5, 7);
/**
 * Tracking error dari titik akhir bulan: deviasi standar (selisih return bulanan NAB − indeks) × √12, dalam persen per tahun.
 * Bulan berjalan (thisMonth) tidak dihitung. Indeks = return harga (tanpa dividen), jadi selisih rata-ratanya cenderung positif.
 */
export function trackingOf(navPts, idx, listedAt, thisMonth) {
  const ends = (s) => { const m = {}; for (const p of s || []) if (p[0] >= (listedAt || "")) m[p[0].slice(0, 7)] = p[1]; return m; };
  const N = ends(navPts), I = ends(idx), ms = Object.keys(N).filter((m) => I[m] && m !== thisMonth).sort(), diffs = [];
  for (let i = 1; i < ms.length; i++) if (monthIdx(ms[i]) - monthIdx(ms[i - 1]) === 1) diffs.push([ms[i], (N[ms[i]] / N[ms[i - 1]] - 1) - (I[ms[i]] / I[ms[i - 1]] - 1)]);
  const te = (n) => {
    const L = diffs.slice(-n).map((d) => d[1]);
    if (L.length < Math.min(n, 6)) return null;
    const mu = L.reduce((a, b) => a + b, 0) / L.length;
    return { te: Math.sqrt(L.reduce((a, b) => a + (b - mu) ** 2, 0) / (L.length - 1)) * Math.sqrt(12) * 100, avg: mu * 100, n: L.length };
  };
  return { y1: te(12), y3: te(36), last: diffs.slice(-12).map(([m, d]) => [m, +(d * 100).toFixed(3)]) };
}
const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const pad2 = (n) => String(n).padStart(2, "0");
const bizBack = (iso) => { let d = iso; while (new Date(d + "T00:00:00Z").getUTCDay() % 6 === 0) d = addD(d, -1); return d; };
const bizFwd = (iso) => { let d = iso; while (new Date(d + "T00:00:00Z").getUTCDay() % 6 === 0) d = addD(d, 1); return d; };
const lastBiz = (y, m) => bizBack(isoD(new Date(Date.UTC(y, m, 0))));   // m = 1–12
const firstBiz = (y, m) => bizFwd(`${y}-${pad2(m)}-01`);
/**
 * Kalender ops ETF & reksa dana dari today sampai today + days. Jadwal resmi bisa bergeser, jadi semua bertanda perkiraan.
 * - MSCI Quarterly Index Review: pengumuman ±pertengahan Feb/Mei/Agu/Nov, berlaku penutupan hari bursa terakhir bulan itu.
 * - IDX30: evaluasi mayor Januari & Juli, minor April & Oktober; berlaku hari bursa pertama Feb/Mei/Agu/Nov.
 * - Dividen: bulan yang sama dengan pembagian tahun-tahun sebelumnya (riwayat Yahoo).
 * - Awal bulan: fund fact sheet & laporan bulanan bulan sebelumnya.
 */
export function opsCalendar(today, divs = {}, days = 120) {
  const end = addD(today, days), ev = [], y0 = +today.slice(0, 4);
  for (const y of [y0, y0 + 1]) {
    for (const m of [2, 5, 8, 11]) {
      ev.push({ date: bizFwd(`${y}-${pad2(m)}-12`), etf: "XKMS", type: "indeks", title: `Pengumuman MSCI Quarterly Index Review ${MON[m - 1]} ${y}`, note: "Perkiraan; cek jadwal resmi di msci.com. Siapkan daftar perubahan konstituen MSCI Indonesia." });
      ev.push({ date: lastBiz(y, m), etf: "XKMS", type: "rebalancing", title: `Rebalancing MSCI Indonesia berlaku (penutupan ${MON[m - 1]} ${y})`, note: "Portofolio XKMS disesuaikan dengan konstituen baru." });
    }
    for (const [m, k] of [[1, "mayor"], [4, "minor"], [7, "mayor"], [10, "minor"]]) {
      ev.push({ date: lastBiz(y, m), etf: "XKID", type: "indeks", title: `Pengumuman evaluasi ${k} indeks IDX30 (${MON[m - 1]} ${y})`, note: "Perkiraan; cek pengumuman BEI di idx.co.id." });
      ev.push({ date: firstBiz(y, m + 1), etf: "XKID", type: "rebalancing", title: `Konstituen baru IDX30 berlaku (evaluasi ${k})`, note: "Portofolio XKID disesuaikan dengan konstituen baru." });
    }
    for (let m = 1; m <= 12; m++) ev.push({ date: firstBiz(y, m), etf: "", type: "laporan", title: `Fund fact sheet & laporan bulanan ${MON[(m + 10) % 12]} ${m === 1 ? y - 1 : y}`, note: "Cek NAB akhir bulan, AUM, dan kinerja sebelum materi dibagikan." });
  }
  for (const [code, list] of Object.entries(divs)) {
    const last = {};
    for (const [d, amt] of [...(list || [])].sort((a, b) => (a[0] < b[0] ? -1 : 1))) last[d.slice(5, 7)] = [d, amt];   // satu per bulan: pembagian terakhir di bulan itu
    for (const [mm, [d, amt]] of Object.entries(last)) for (const y of [y0, y0 + 1]) {
      const date = `${y}-${mm}-${d.slice(8, 10)}`;
      if (date > d) ev.push({ date: bizFwd(date), etf: code, type: "dividen", title: `Perkiraan pembagian dividen ${code}`, note: `Terakhir ${d.slice(8, 10)} ${MON[+mm - 1]} ${d.slice(0, 4)}: Rp${amt.toLocaleString("id-ID")} per unit (Yahoo Finance).` });
    }
  }
  return ev.filter((e) => e.date >= today && e.date <= end).map((e) => ({ ...e, approx: true })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
/**
 * Peringatan ops satu ETF. level: "high" | "warn". key unik per kejadian (dipakai lonceng Tool Hub supaya tidak berulang).
 * Ambang: NAB terlambat > 2 hari bursa; premium/diskon ≥ 1% (≥ 2% = tinggi); ≥ 5 dari 20 hari tanpa transaksi;
 * selisih NAB vs indeks 1 bulan ≥ 1 poin; tracking error 1 tahun > 2%; arus keluar > 10% AUM dalam sebulan.
 */
export function alertsOf(k) {
  const A = [], f2 = (v) => (v > 0 ? "+" : "") + v.toFixed(2).replace(".", ","), at = k.navDate || k.priceDate || "";
  const add = (level, rule, t, body) => A.push({ code: k.code, level, rule, title: `${k.code}: ${t}`, body, key: `etf:${k.code}:${rule}:${at}` });
  if (k.navDate && k.priceDate) { const lag = weekdaysBetween(k.navDate, k.priceDate); if (lag > 2) add("high", "nav", `NAB belum diperbarui ${lag} hari bursa`, `NAB terakhir ${k.navDate}, harga terakhir ${k.priceDate}. Cek publikasi NAB.`); }
  if (k.premium != null && Math.abs(k.premium) >= 1) add(Math.abs(k.premium) >= 2 ? "high" : "warn", "prem", `harga ${k.premium > 0 ? "premium" : "diskon"} ${f2(k.premium)}% dari NAB`, `Pada ${k.navDate}. Cek kuotasi market maker / dealer partisipan.`);
  if (k.premiumLive != null && Math.abs(k.premiumLive) >= 1) add("warn", "inav", `harga ${f2(k.premiumLive)}% dari perkiraan iNAV`, `Perkiraan iNAV ${k.inav ? Math.round(k.inav.value).toLocaleString("id-ID") : "–"} (indeks ${k.liveIndex}).`);
  if (k.liq && k.liq.zeroDays20 >= 5) add("warn", "liq", `${k.liq.zeroDays20} dari ${k.liq.days} hari bursa tanpa transaksi`, "Likuiditas rendah. Cek kuotasi market maker.");
  const an = k.bench && k.bench.atNav, td = an && an.ret && an.ret.m1 != null && k.ret && k.ret.m1 != null ? k.ret.m1 - an.ret.m1 : null;
  if (td != null && Math.abs(td) >= 1) add("warn", "td", `selisih NAB vs indeks 1 bulan ${f2(td)} poin`, "Di luar kebiasaan (±1 poin). Cek dividen, biaya, atau rebalancing.");
  if (k.track && k.track.y1 && k.track.y1.te > 2) add("warn", "te", `tracking error 1 tahun ${k.track.y1.te.toFixed(2).replace(".", ",")}%`, "Di atas 2% per tahun. Cek bobot portofolio vs indeks.");
  const fl = (k.flows || []).at(-1);
  if (fl && fl.flow != null && fl.aum && fl.flow < -0.1 * (fl.aum - fl.flow)) add("warn", "flow", `penebusan besar ${String(fl.ym).slice(4)}/${String(fl.ym).slice(0, 4)}`, `Arus keluar ±Rp${Math.round(-fl.flow).toLocaleString("id-ID")} M (> 10% AUM).`);
  return A;
}

async function build(env) {
  const cols = ["name", "description", "close", "change", "volume", "Value.Traded", "average_volume_10d_calc", "expense_ratio", "nav_discount_premium", ...PERF];
  const yk = Object.keys(IDX_Y);
  const [etfs, idxRows, eido, fx, mk, ys, ...charts] = await Promise.all([
    tv("indonesia", { filter: [{ left: "type", operation: "equal", right: "fund" }], columns: cols, range: [0, 300] }),
    tv("indonesia", { symbols: { tickers: ["IDX:IDX30", "IDX:LQ45", "IDX:ISSI"] }, columns: ["name", "close", "close[1]", ...PERF] }),
    yahoo("EIDO", "5y").catch(() => []),
    yahoo("IDR=X", "5y").catch(() => []),
    market(env).catch((e) => ({ at: null, f: {}, names: {}, hist: [], error: e.message })),
    Promise.all(yk.map((k) => yahoo(IDX_Y[k], "5y").catch(() => []))),
    ...Object.keys(KISI).map((c) => yahoo(c + ".JK", "10y", true).catch(() => [])),
  ]);
  const Y = Object.fromEntries(yk.map((k, i) => [k, ys[i]]));
  // baris TradingView: [name, close, close[1], ...PERF]; idx = IDX30 (urutan lama: close, close[1], PERF)
  const tvRow = (n) => idxRows.find((r) => r.d[0] === n), live = Object.fromEntries(["IDX30", "LQ45"].map((n) => { const r = tvRow(n); return [n, r ? { c: num(r.d[1]), p: num(r.d[2]) } : null]; }));
  const idx = tvRow("IDX30") ? [{ d: tvRow("IDX30").d.slice(1) }] : [];
  const lastDate = (code) => { const c = charts[Object.keys(KISI).indexOf(code)]; return c && c.length ? c[c.length - 1][0] : null; };
  // Pembanding indeks, dihitung sampai tanggal harga terakhir ETF supaya sebanding dengan return harga pasar.
  // IDX30: kinerja dari TradingView (berjalan, sama dengan return harga ETF dari TradingView).
  // MSCI Indonesia: data resmi berbayar, jadi diperkirakan dari ETF EIDO (USD) × kurs USD/IDR (Yahoo).
  let fi = 0;
  const proxy = eido.map(([d, c]) => { while (fi + 1 < fx.length && fx[fi + 1][0] <= d) fi++; return fx[fi] && fx[fi][0] <= d ? [d, c * fx[fi][1]] : null; }).filter(Boolean);
  const mEnd = lastDate("XKMS"), msciEnd = mEnd && proxy.length ? (proxy.findLast((p) => p[0] <= mEnd) || [null])[0] : null;
  const xEnd = lastDate("XKID"), iR = idx[0] ? perfOf(idx[0].d, 2) : {}, iC = idx[0] ? num(idx[0].d[0]) : null, iP = idx[0] ? num(idx[0].d[1]) : null;
  const yr = xEnd ? +xEnd.slice(0, 4) : null;
  const bench = {
    idx30: { name: "IDX30", asOf: xEnd, note: "Indeks IDX30 dari TradingView", ret: iR, years: yr && iR.ytd != null ? { [yr]: iR.ytd } : {},
      // Indeks pada tanggal NAB, supaya bisa dibandingkan dengan return NAB. TradingView hanya memberi penutupan hari ini & kemarin,
      // jadi hanya bisa kalau NAB bertanggal hari harga terakhir atau hari kerja sebelumnya; titik awal periodenya bergeser 1 hari (perkiraan).
      atNav: (d) => (!d || !xEnd || !iC ? null : d === xEnd ? { ret: iR, approx: false } : d === prevWeekday(xEnd) && iP
        ? { ret: Object.fromEntries(PK.map((k) => [k, iR[k] == null ? null : ((1 + iR[k] / 100) * (iP / iC) - 1) * 100])), approx: true } : null) },
    msci: { name: "MSCI Indonesia (perkiraan)", asOf: msciEnd, ret: msciEnd ? retAt(proxy, msciEnd) : {}, years: msciEnd ? yearsOf(proxy, msciEnd) : {},
      atNav: (d) => (d && proxy.length && proxy[0][0] <= d ? { ret: retAt(proxy, d), approx: false } : null),
      note: "Indeks MSCI Indonesia diperkirakan dari ETF iShares MSCI Indonesia (EIDO, bursa AS) yang dikonversi ke rupiah dengan kurs USD/IDR" },
  };
  const navRet = (r) => (r ? { m1: num(r[8]), m3: num(r[9]), m6: num(r[4]), ytd: num(r[10]), y1: num(r[5]), y3: num(r[6]) } : {});
  const peers = etfs.map((row) => {
    const d = row.d, code = d[0], m = ETFS[code], r = m ? mk.f[m[0]] : null, nm = m ? mk.names[m[0]] : null;
    return {
      code, name: (nm && nm[0]) || d[1], im: (nm && nm[1]) || "", group: m ? m[1] : "other", kisi: !!KISI[code],
      close: num(d[2]), change: num(d[3]), vol: num(d[4]), value: num(d[5]), avgVol10: num(d[6]), fee: num(d[7]), premTv: num(d[8]),
      price: perfOf(d, 9), nav: r ? num(r[0]) : null, navDate: r ? r[7] || null : null, aum: r ? num(r[1]) : null, aumYm: r ? r[2] : null, ret: navRet(r),
    };
  }).sort((a, b) => (b.aum || 0) - (a.aum || 0));
  const kisi = Object.entries(KISI).map(([code, k], i) => {
    const p = peers.find((x) => x.code === code) || { code, name: code, price: {}, ret: {} }, ch = charts[i] || [];
    const atNav = p.navDate ? ch.find((c) => c[0] === p.navDate) : null;
    const last20 = ch.slice(-20), vals = last20.map((c) => c[1] * c[2]);
    const navPts = mk.hist.filter((h) => h[k.pid]).map((h) => [h.d, h[k.pid][0]]);
    if (p.nav && p.navDate && !navPts.some((n) => n[0] === p.navDate)) navPts.push([p.navDate, p.nav]);
    const end = lastDate(code), { atNav: idxAtNav, ...bx } = bench[k.bench], an = idxAtNav(p.navDate);
    navPts.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const inav = inavOf(p.nav, p.navDate, end, live[k.live]), thisMonth = isoD(new Date(Date.now() + 7 * 3600e3)).slice(0, 7);
    const out = {
      ...p, price: trim(p.price, k.listedAt, end), ret: trim(p.ret, k.listedAt, p.navDate || end),
      bench: { ...bx, ret: trim(bx.ret, k.listedAt, bx.asOf || end), atNav: an && { ...an, ret: trim(an.ret, k.listedAt, p.navDate) } },
      index: k.index, listed: k.listed, listedAt: k.listedAt, priceDate: end,
      premium: atNav && p.nav ? (atNav[1] / p.nav - 1) * 100 : null, premiumClose: atNav ? atNav[1] : null,
      inav, liveIndex: k.live, premiumLive: inav && p.close ? (p.close / inav.value - 1) * 100 : null,
      track: trackingOf(navPts, k.bench === "msci" ? proxy : Y.idx30, k.listedAt, thisMonth),
      divs: (ch.div || []).slice(-12),
      liq: { avgValue20: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null, zeroDays20: last20.filter((c) => !c[2]).length, days: last20.length },
      chart: { price: ch.map((c) => [c[0], c[1]]), nav: navPts },
      flows: flows(k.pid, mk.hist, mk.f[k.pid]),
    };
    return { ...out, alerts: alertsOf(out) };
  });
  // Pembanding syariah: indeks JII, JII70, ISSI (dan IHSG) sampai tanggal harga terakhir ETF KISI; ETF syariah di BEI.
  const sEnd = Object.keys(KISI).map(lastDate).filter(Boolean).sort().pop();
  const sharia = {
    asOf: sEnd || null,
    idx: SHARIA_IDX.map(([key, name]) => {
      // ISSI: kinerja berjalan dari TradingView (tanpa riwayat tahunan)
      if (key === "issi") { const r = tvRow("ISSI"); return { key, name, asOf: r ? "berjalan" : null, ret: r ? perfOf(r.d, 3) : {}, years: {} }; }
      const s = Y[key] || [], e = sEnd && s.length ? (s.findLast((p) => p[0] <= sEnd) || [null])[0] : null;
      return { key, name, asOf: e, ret: e ? retAt(s, e) : {}, years: e ? yearsOf(s, e) : {} };
    }),
    etfs: peers.filter((p) => p.group === "sharia").map((p) => p.code),
  };
  const today = isoD(new Date(Date.now() + 7 * 3600e3));
  const calendar = opsCalendar(today, Object.fromEntries(kisi.map((k) => [k.code, k.divs])));
  return { at: new Date().toISOString(), navAt: mk.at, dbError: mk.error || null, groups: GROUPS, kisi, peers, sharia, calendar, alerts: kisi.flatMap((k) => k.alerts) };
}

let MEM = null;
async function data(env, ctx, fresh) {
  if (!fresh && MEM && Date.now() - MEM.t < 10 * 60e3) return MEM.body;
  const cache = caches.default, key = new Request("https://etf-insight.cache/api/etf-v3");
  if (!fresh) { const hit = await cache.match(key); if (hit) { MEM = { t: Date.now(), body: await hit.text() }; return MEM.body; } }
  const body = JSON.stringify(await build(env));
  MEM = { t: Date.now(), body };
  ctx.waitUntil(cache.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=600" } })));
  return body;
}

/* =========================================================
   HALAMAN
   ========================================================= */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function page(env, mode, code, extra = "") {
  const name = mode === "share" ? `${code} · ${title(env, "ETF Insight")}` : title(env, "ETF Insight");
  const cfg = `<script>window.ETF_MODE=${JSON.stringify(mode)};window.ETF_CODE=${JSON.stringify(code || "")};${extra}</script>`;
  return PAGE.replace("<title>ETF Insight</title>", () => `<title>${esc(name)}</title>${profileScript(env)}${themeHead("")}${cfg}`);
}
const htmlRes = (body, headers = {}) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", ...headers } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Metode tidak didukung", { status: 405 });
    if (path === "/api/etf") {
      try {
        return new Response(await data(env, ctx, url.searchParams.has("refresh")), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      } catch (e) {
        return Response.json({ error: "Data belum bisa diambil: " + e.message }, { status: 502 });
      }
    }
    if (path === "/api/news") return Response.json(await newsFor(ETF_NEWS_RE, 12, ETF_TOP_RE), { headers: { "cache-control": "public, max-age=1800" } });
    // beranda & lonceng Tool Hub: peringatan ops dan kalender 7 hari ke depan
    if (path === HUB_FEED) {
      if (!hubFeedAllowed(request, env)) return new Response("forbidden", { status: 403 });
      const d = JSON.parse(await data(env, ctx, false)), today = isoD(new Date(Date.now() + 7 * 3600e3));
      return Response.json({ date: today, at: d.at, alerts: d.alerts || [], calendar: (d.calendar || []).filter((e) => e.date <= addD(today, 7)).slice(0, 8),
        kisi: (d.kisi || []).map(({ code, close, nav, navDate, premium, premiumLive, inav }) => ({ code, close, nav, navDate, premium, premiumLive, inav })) }, { headers: { "cache-control": "no-store" } });
    }
    const pm = /^\/p\/([A-Za-z0-9-]{3,10})\/?$/.exec(path);
    if (pm) {
      const code = pm[1].toUpperCase();
      if (!KISI[code]) return new Response("ETF tidak ditemukan", { status: 404 });
      return htmlRes(page(env, "share", code), { "cache-control": "public, max-age=300" });
    }
    if (path === "/logout") return HUBSSO.logout(env);
    if (path === "/" || path === "/index.html") {
      if (!HUBSSO.ready(env)) return HUBSSO.notReady();
      const tk = await HUBSSO.ticket(request, env); if (tk) return tk;
      const me = await HUBSSO.user(request, env);
      if (!me) return HUBSSO.login(request, env);
      return htmlRes(page(env, "app", "", HUBSSO.onlyInHub(env)), { "cache-control": "private, no-store", "content-security-policy": HUBSSO.frame(env) });
    }
    return new Response("Tidak ditemukan", { status: 404 });
  },
};
