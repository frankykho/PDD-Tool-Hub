// ETF Insight — Cloudflare Worker
// - "/"           -> aplikasi internal (login lewat Tool Hub, hanya tampil di dalam dashboard)
// - "/p/<KODE>"   -> halaman untuk nasabah (tanpa login), mis. /p/XKMS; tombol PDF = cetak halaman
// - "/api/etf"    -> data (terbuka, hanya GET): ETF KISI + semua ETF di BEI sebagai pembanding
//
// Sumber (semua publik, diambil di sisi server):
//   TradingView scanner : harga, volume, nilai transaksi, biaya, kinerja indeks IDX30, ETF EIDO & kurs USD/IDR
//   Yahoo Finance       : riwayat harga harian 1 tahun ETF KISI
//   Fund Insight (D1)   : NAB, AUM, return NAB dari data pasar Bareksa (tabel mktsnap, hanya dibaca)
// Tidak ada cron dan tidak menulis ke D1; hasil disimpan di cache 10 menit.
import { profile, title, profileScript } from "../../shared/profile.js";
import { themeHead } from "../../shared/theme.js";
import PAGE from "./page.html";

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
const KISI = {
  XKMS: { pid: "4274", index: "MSCI Indonesia", bench: "msci", listed: "Nov 2020", listedAt: "2020-11-30", group: "big" },
  XKID: { pid: "4795", index: "IDX30", bench: "idx30", listed: "Nov 2023", listedAt: "2023-11-30", group: "idx30" },
};
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

async function yahoo(symbol, range = "1y") {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
  const res = (await r.json()).chart?.result?.[0];
  if (!res) throw new Error(`Yahoo ${symbol}: data kosong`);
  const q = res.indicators.quote[0], out = [];
  res.timestamp.forEach((t, i) => {
    const c = num(q.close[i]);
    if (c != null) out.push([new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10), c, num(q.volume[i]) || 0]);   // tanggal WIB
  });
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
  const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const kp = Object.values(KISI).map((k) => k.pid);
  const [f, n, a, h] = await env.DB.batch([
    env.DB.prepare(`SELECT j.key k, j.value v FROM mktsnap, json_each(mktsnap.v, '$.f') j WHERE mktsnap.d='latest' AND j.key IN (${ph})`).bind(...pids),
    env.DB.prepare(`SELECT j.key k, j.value v FROM mktsnap, json_each(mktsnap.v, '$.names') j WHERE mktsnap.d='latest' AND j.key IN (${ph})`).bind(...pids),
    env.DB.prepare("SELECT json_extract(v, '$.at') at FROM mktsnap WHERE d='latest'"),
    env.DB.prepare(`SELECT d, ${kp.map((p) => `json_extract(v, '$."${p}"') AS "${p}"`).join(", ")} FROM mktsnap WHERE d <> 'latest' AND d >= ? ORDER BY d`).bind(since),
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

async function build(env) {
  const cols = ["name", "description", "close", "change", "volume", "Value.Traded", "average_volume_10d_calc", "expense_ratio", "nav_discount_premium", ...PERF];
  const [etfs, idx, eido, fx, mk, ...charts] = await Promise.all([
    tv("indonesia", { filter: [{ left: "type", operation: "equal", right: "fund" }], columns: cols, range: [0, 300] }),
    tv("indonesia", { symbols: { tickers: ["IDX:IDX30"] }, columns: ["close", ...PERF] }),
    yahoo("EIDO", "5y").catch(() => []),
    yahoo("IDR=X", "5y").catch(() => []),
    market(env).catch((e) => ({ at: null, f: {}, names: {}, hist: [], error: e.message })),
    ...Object.keys(KISI).map((c) => yahoo(c + ".JK").catch(() => [])),
  ]);
  const lastDate = (code) => { const c = charts[Object.keys(KISI).indexOf(code)]; return c && c.length ? c[c.length - 1][0] : null; };
  // Pembanding indeks, dihitung sampai tanggal harga terakhir ETF supaya sebanding dengan return harga pasar.
  // IDX30: kinerja dari TradingView (berjalan, sama dengan return harga ETF dari TradingView).
  // MSCI Indonesia: data resmi berbayar, jadi diperkirakan dari ETF EIDO (USD) × kurs USD/IDR (Yahoo).
  let fi = 0;
  const proxy = eido.map(([d, c]) => { while (fi + 1 < fx.length && fx[fi + 1][0] <= d) fi++; return fx[fi] && fx[fi][0] <= d ? [d, c * fx[fi][1]] : null; }).filter(Boolean);
  const mEnd = lastDate("XKMS"), msciEnd = mEnd && proxy.length ? (proxy.findLast((p) => p[0] <= mEnd) || [null])[0] : null;
  const bench = {
    idx30: { name: "IDX30", asOf: lastDate("XKID"), note: "Indeks IDX30 dari TradingView", ret: idx[0] ? perfOf(idx[0].d, 1) : {} },
    msci: { name: "MSCI Indonesia (perkiraan)", asOf: msciEnd, ret: msciEnd ? retAt(proxy, msciEnd) : {},
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
    const end = lastDate(code), bx = bench[k.bench];
    return {
      ...p, price: trim(p.price, k.listedAt, end), ret: trim(p.ret, k.listedAt, p.navDate || end), bench: { ...bx, ret: trim(bx.ret, k.listedAt, bx.asOf || end) },
      index: k.index, listed: k.listed, priceDate: end,
      premium: atNav && p.nav ? (atNav[1] / p.nav - 1) * 100 : null, premiumClose: atNav ? atNav[1] : null,
      liq: { avgValue20: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null, zeroDays20: last20.filter((c) => !c[2]).length, days: last20.length },
      chart: { price: ch.map((c) => [c[0], c[1]]), nav: navPts.sort((a, b) => (a[0] < b[0] ? -1 : 1)) },
      flows: flows(k.pid, mk.hist, mk.f[k.pid]),
    };
  });
  return { at: new Date().toISOString(), navAt: mk.at, dbError: mk.error || null, groups: GROUPS, kisi, peers };
}

let MEM = null;
async function data(env, ctx, fresh) {
  if (!fresh && MEM && Date.now() - MEM.t < 10 * 60e3) return MEM.body;
  const cache = caches.default, key = new Request("https://etf-insight.cache/api/etf-v1");
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
