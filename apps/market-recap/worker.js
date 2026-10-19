// Market Recap — Cloudflare Worker
// Rangkuman IHSG sesi 1 & penutupan setiap hari bursa: kondisi, penyebab naik/turun, dan narasi untuk investor.
// - "/"               -> halaman tim (di dalam Tool Hub): hari ini & arsip, sunting narasi, terbitkan, gambar IG, PDF
// - "/p", "/p/<tgl>"  -> halaman publik tanpa login: hanya rangkuman yang sudah diterbitkan
// - GET  /api/days         -> arsip (tanggal, sesi, status, judul, % IHSG)
// - GET  /api/day?date=    -> rangkuman satu hari (sesi 1 & penutupan)
// - POST /api/save | /api/publish | /api/rebuild -> sunting narasi, terbitkan/tarik, susun ulang hari ini (editor & admin)
//
// Jadwal: apps/cron memanggil scheduled() tiap :20/:50 UTC hari kerja; worker memilih sendiri apa yang dikerjakan:
//   s1    : saat jeda sesi 1 (12:00–13:30 WIB; Jumat 11:30–14:00)
//   close : setelah wrap.json IDX hari ini ada (mulai 17:20 WIB); tanpa data resmi IDX mulai 17:50 WIB (wrap dicoba 16:50 & 17:25)
// Sumber: Story Data (service binding STORYDATA: ?part=morning & ?part=halftime), TradingView (kontribusi poin per saham
//   & breadth), wrap.json IDX di repo (penutupan resmi & transaksi asing), RSS berita (shared/news.js), agenda (shared/macro.js).
// Narasi ditulis AI (shared/ai.js) hanya dari data di atas dan disimpan sebagai draf; tim yang menerbitkan.
import { title, profileScript } from "../../shared/profile.js";
import { themeHead } from "../../shared/theme.js";
import { newsFor } from "../../shared/news.js";
import { macroItems, macroUrls } from "../../shared/macro.js";
import { ai, AiError } from "../../shared/ai.js";
import { withCron } from "../../shared/cron.js";
import { r2, contributions, foreignFlow } from "./calc.js";
import PAGE from "./page.html";

/* =========================================================
   LOGIN LEWAT TOOL HUB
   ========================================================= */
const HUBSSO = (() => {
  const APP = "recap", COOKIE = "hub_" + APP, HOURS = 8, te = new TextEncoder();
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
    /** Kembali dari hub membawa ?hub_t=... -> tukar dengan cookie sesi. null kalau alamat tidak membawa tiket. onLogin(p) dipanggil sekali per login. */
    async ticket(request, env, onLogin) {
      const url = new URL(request.url), t = url.searchParams.get("hub_t");
      if (!t) return null;
      const p = await open(env, t); url.searchParams.delete("hub_t");
      if (!p) return go(url.pathname + url.search);
      if (onLogin) await onLogin(p).catch((e) => console.error("onLogin:", e.message));
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
    // cookie sesi ikut terkirim dari dalam bingkai, jadi permintaan yang mengubah data wajib berasal dari halaman ini sendiri
    sameOrigin: (request) => { const o = request.headers.get("origin"); return !o || o === new URL(request.url).origin; },
  };
})();

/* =========================================================
   ARSIP (D1: recap-db)
   ========================================================= */
export const SESSIONS = { s1: "Sesi 1", close: "Penutupan" };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS recaps (date TEXT NOT NULL, session TEXT NOT NULL, data TEXT, narrative TEXT, model TEXT, status TEXT DEFAULT 'draft', updated_by TEXT, updated_at TEXT, PRIMARY KEY (date, session))").run();
  ready = true;
}
const row = (r) => ({ ...r, data: JSON.parse(r.data || "{}") });
async function day(env, date, publishedOnly) {
  await ensure(env);
  const q = `SELECT * FROM recaps WHERE date=?${publishedOnly ? " AND status='published'" : ""} ORDER BY session DESC`; // s1 lalu close
  return (await env.DB.prepare(q).bind(date).all()).results.map(row);
}
async function days(env, publishedOnly, limit = 120) {
  await ensure(env);
  return (await env.DB.prepare(`SELECT date, session, status, substr(narrative, 1, instr(narrative || char(10), char(10)) - 1) AS title,
    json_extract(data, '$.ihsg.pct') AS pct FROM recaps ${publishedOnly ? "WHERE status='published'" : ""} ORDER BY date DESC, session DESC LIMIT ?`).bind(limit).all()).results;
}

/* =========================================================
   DATA
   ========================================================= */
const wibNow = (t = Date.now()) => new Date(t + 7 * 3600e3); // jam WIB dibaca lewat getUTC*
const ymd = (d) => d.toISOString().slice(0, 10);
const minutes = (t) => t.getUTCHours() * 60 + t.getUTCMinutes();
/** Jeda sesi 1: 12:00–13:30 WIB (Jumat 11:30–14:00). Harga saat itu = harga akhir sesi 1. */
const inBreak = (t) => { const m = minutes(t), fri = t.getUTCDay() === 5; return m >= (fri ? 690 : 720) && m < (fri ? 840 : 810); };
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const getJson = async (svc, path) => { const r = await svc.fetch("https://story-data" + path); if (!r.ok) throw new Error(`Story Data ${path}: HTTP ${r.status}`); return r.json(); };
const SECTOR_ID = { Financials: "Keuangan", Infrastructures: "Infrastruktur", Healthcare: "Kesehatan", "Consumer Cyclicals": "Konsumen Non-Primer",
  Industrials: "Perindustrian", Technology: "Teknologi", "Transportation & Logistics": "Transportasi", Energy: "Energi", "Basic Materials": "Barang Baku",
  "Consumer Non-Cyclicals": "Konsumen Primer", "Properties & Real Estate": "Properti" };
const GLOBAL = { sp: "S&P 500", ndq: "Nasdaq", djia: "Dow Jones", nk: "Nikkei", hsi: "Hang Seng", idr: "USD/IDR", oil: "Minyak WTI", gold: "Emas" };
const COMMOD = { coal: "Batu bara", cpo: "CPO", ni: "Nikel", tin: "Timah" };

async function tradingView() {
  const r = await fetch("https://scanner.tradingview.com/indonesia/scan", {
    method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ columns: ["name", "close", "change", "market_cap_basic"], range: [0, 2000], filter: [{ left: "type", operation: "equal", right: "stock" }] }),
  });
  if (!r.ok) throw new Error("TradingView HTTP " + r.status);
  return (await r.json()).data.map((x) => x.d);
}
/** wrap.json (penutupan resmi IDX) di repo, ditulis GitHub Actions story-data.yml; letaknya di samping calendar.json. */
async function wrapJson(env) {
  const u = macroUrls(env);
  if (!u) return null;
  const r = await fetch(u.cal.replace(/calendar\.json$/, "wrap.json") + "?t=" + Date.now(), { signal: AbortSignal.timeout(15000) });
  return r.ok ? r.json() : null;
}
async function agenda(env, date) {
  const u = macroUrls(env);
  if (!u) return [];
  const get = (url, json) => fetch(url, { signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? (json ? r.json() : r.text()) : null)).catch(() => null);
  const [js, cal] = await Promise.all([get(u.js), get(u.cal, true)]);
  return macroItems(js, cal).filter((x) => x.d > date && x.d <= addDays(date, 4)).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 6).map(({ d, t, time, country }) => ({ d, t, time, country }));
}
const NEWS_RE = /IHSG|saham|bursa|BEI|indeks|asing|rupiah|emiten|investor|The Fed|suku bunga/i;

/** Susun rangkuman satu sesi lalu simpan sebagai draf. { skip } kalau belum waktunya / bursa libur. */
async function build(env, date, session, { live = false, by = "jadwal" } = {}) {
  const [morning, half] = await Promise.all([getJson(env.STORYDATA, "/?part=morning"), getJson(env.STORYDATA, "/?part=halftime")]);
  const q = morning.quotes || {};
  if (!q.ihsg || q.ihsg.date !== date) return { skip: "bursa tidak dibuka hari ini" };
  let wrap = null;
  if (session === "close") {
    wrap = await wrapJson(env).catch(() => null);
    if (wrap && wrap.date !== date) wrap = null;
    if (!wrap && !live) return { skip: "menunggu data penutupan IDX" };
  }
  const prev = wrap ? wrap.ihsg.prev : q.ihsg.prevClose, price = wrap ? wrap.ihsg.close : half.ihsg && half.ihsg.price;
  if (!(price > 0 && prev > 0)) throw new Error("Harga IHSG belum tersedia dari Story Data");
  const [rows, ag] = await Promise.all([tradingView(), agenda(env, date)]);
  const mv = contributions(rows, prev);
  const top = new RegExp(`\\b(${[...mv.up, ...mv.down].map((x) => x.code).join("|") || "IHSG"})\\b`);
  const since = new Date(date + "T00:00:00+07:00").toISOString();
  const news = (await newsFor(NEWS_RE, 30, top).catch(() => [])).filter((x) => !x.at || x.at >= since).slice(0, 8).map(({ t, link, src }) => ({ t, link, src }));
  const s1 = session === "s1";
  const data = {
    date, session, at: new Date().toISOString(), official: !!wrap,
    ihsg: {
      close: r2(price), prev: r2(prev), chg: r2(price - prev), pct: r2((price / prev - 1) * 100),
      high: r2(wrap ? wrap.ihsg.high : s1 ? half.ihsg.high : null), low: r2(wrap ? wrap.ihsg.low : s1 ? half.ihsg.low : null),
      value: wrap ? wrap.ihsg.value : null, volume: wrap ? wrap.ihsg.volume : null, freq: wrap ? wrap.ihsg.frequency : null,
    },
    breadth: mv.breadth,
    sectors: (wrap ? wrap.sectors.map((s) => ({ name: s.name, pct: r2(s.pct) })) : (half.sectors || []).map((s) => ({ name: SECTOR_ID[s.name] || s.name, pct: r2(s.changePct) })))
      .sort((a, b) => b.pct - a.pct),
    movers: { up: mv.up, down: mv.down, sum: mv.sum },
    foreign: foreignFlow(wrap),
    global: Object.entries(GLOBAL).filter(([k]) => q[k]).map(([k, label]) => ({ label, close: r2(q[k].close), pct: r2(q[k].changePct), date: q[k].date })),
    commodities: Object.entries(COMMOD).filter(([k]) => (morning.commodities || {})[k]).map(([k, label]) => ({ label, close: r2(morning.commodities[k].close), pct: r2(morning.commodities[k].changePct) })),
    news, agenda: ag,
  };
  let narrative = "", model = "";
  try { ({ text: narrative, model } = await narrate(env, data)); }
  catch (e) { model = "gagal: " + (e instanceof AiError ? e.message : e.message || e); }
  await ensure(env);
  await env.DB.prepare(`INSERT INTO recaps (date, session, data, narrative, model, status, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)
    ON CONFLICT(date, session) DO UPDATE SET data=excluded.data, narrative=excluded.narrative, model=excluded.model, status='draft', updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
    .bind(date, session, JSON.stringify(data), narrative, model, by, new Date().toISOString()).run();
  return { ok: true, model };
}

const SYSTEM = `Anda analis pasar modal Indonesia yang menulis rangkuman harian IHSG untuk investor ritel.
Aturan:
- Pakai HANYA fakta dan angka dari data JSON yang diberikan. Jangan menambah angka, nama, kejadian, atau penyebab yang tidak ada di data.
- Penyebab naik/turun dijelaskan lewat yang terlihat di data: saham penggerak (movers, dalam poin IHSG), sektor, transaksi asing (foreign, rupiah), bursa global & komoditas, dan judul berita hari ini. Kalau tidak ada berita yang jelas terkait, jangan menebak alasannya.
- Bahasa Indonesia baku yang mudah dipahami. Tanpa rekomendasi beli/jual dan tanpa prediksi harga.
- Kontribusi poin saham adalah perkiraan; tulis "sekitar" bila menyebutnya.
Format jawaban (teks biasa, tanpa markdown):
Baris 1: judul singkat maksimal 10 kata.
Baris kosong, lalu tiga paragraf pendek (total 120–180 kata): (1) kondisi IHSG, (2) penyebab, (3) yang perlu dicermati berikutnya (agenda; kalau kosong, faktor yang perlu dipantau dari data).`;
async function narrate(env, data) {
  const { news, ...rest } = data;
  const user = `Rangkuman ${data.session === "s1" ? "SESI 1 (jeda siang, perdagangan belum selesai)" : "PENUTUPAN hari ini"}, tanggal ${data.date}.\n` +
    `Data:\n${JSON.stringify({ ...rest, news: news.map((n) => n.t) })}`;
  return ai(env, SYSTEM, user, 4000, env.CLAUDE_MODEL || "claude-opus-5-5");
}

/* =========================================================
   HALAMAN
   ========================================================= */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function page(env, cfg, inHub) {
  const head = `<title>${esc(title(env, "Market Recap"))}</title>${profileScript(env)}${themeHead("")}<script>${inHub ? HUBSSO.onlyInHub(env) : ""}window.RC=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script>`;
  return PAGE.replace("<title>Market Recap</title>", () => head);
}
const html = (body, extra = {}) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex", ...extra } });
const json = (v, status = 200) => Response.json(v, { status, headers: { "cache-control": "no-store" } });

export default withCron({
  async scheduled(e, env) {
    const t = wibNow(e.scheduledTime), date = ymd(t), m = minutes(t);
    await ensure(env);
    const have = new Set((await env.DB.prepare("SELECT session FROM recaps WHERE date=?").bind(date).all()).results.map((r) => r.session));
    let r = null; // satu sesi per jalan (batas CPU)
    if (!have.has("s1") && inBreak(t)) r = await build(env, date, "s1");
    else if (!have.has("close") && m >= 17 * 60 + 20) r = await build(env, date, "close", { live: m >= 17 * 60 + 50 });
    if (r) console.log(`recap ${date}:`, r.skip || r.model);
  },

  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    try {
      // publik: hanya yang sudah diterbitkan, tanpa login
      const pm = /^\/p(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/.exec(path);
      if (pm) {
        const list = await days(env, true, 60);
        const date = pm[1] || (list[0] && list[0].date);
        return html(page(env, { mode: "public", date, day: date ? await day(env, date, true) : [], days: [...new Set(list.map((x) => x.date))] }, false));
      }
      if (path === "/logout") return HUBSSO.logout(env);
      if (!HUBSSO.ready(env)) return HUBSSO.notReady();
      const tk = await HUBSSO.ticket(request, env); if (tk) return tk;
      const me = await HUBSSO.user(request, env);
      const isPage = path === "/" || path === "/index.html";
      if (!me) return isPage ? HUBSSO.login(request, env) : json({ error: "Belum login atau sesi habis. Muat ulang halaman dari Tool Hub." }, 401);
      const role = me.adm ? "admin" : me.a, canEdit = role === "admin" || role === "editor", who = me.n || me.u || me.e;
      if (isPage) return html(page(env, { mode: "team", canEdit, today: ymd(wibNow()), publicUrl: url.origin + "/p" }, true), { "content-security-policy": HUBSSO.frame(env) });

      if (request.method === "GET") {
        if (path === "/api/days") return json(await days(env, false));
        if (path === "/api/day") { const d = url.searchParams.get("date") || ""; return ISO.test(d) ? json(await day(env, d, false)) : json({ error: "Tanggal tidak sah." }, 400); }
      }
      if (request.method === "POST") {
        if (!HUBSSO.sameOrigin(request)) return json({ error: "Permintaan ditolak." }, 403);
        if (!canEdit) return json({ error: "Hanya editor atau admin yang bisa mengubah rangkuman." }, 403);
        const b = await request.json().catch(() => ({}));
        if (!ISO.test(b.date || "") || !SESSIONS[b.session]) return json({ error: "Tanggal atau sesi tidak sah." }, 400);
        const now = new Date().toISOString();
        if (path === "/api/save") {
          await ensure(env);
          await env.DB.prepare("UPDATE recaps SET narrative=?, updated_by=?, updated_at=? WHERE date=? AND session=?").bind(String(b.narrative || "").slice(0, 6000), who, now, b.date, b.session).run();
          return json({ ok: true });
        }
        if (path === "/api/publish") {
          await ensure(env);
          await env.DB.prepare("UPDATE recaps SET status=?, updated_by=?, updated_at=? WHERE date=? AND session=?").bind(b.on ? "published" : "draft", who, now, b.date, b.session).run();
          return json({ ok: true });
        }
        if (path === "/api/rebuild") {
          // data diambil saat ini juga, jadi hanya untuk hari ini
          if (b.date !== ymd(wibNow())) return json({ error: "Hanya rangkuman hari ini yang bisa disusun ulang (data diambil saat ini)." }, 400);
          if (b.session === "s1" && !inBreak(wibNow())) return json({ error: "Sesi 1 hanya bisa disusun ulang saat jeda siang (12:00–13:30 WIB, Jumat 11:30–14:00); setelah itu harga sudah bergerak di sesi 2." }, 400);
          if (b.session === "close" && minutes(wibNow()) < 16 * 60 + 15) return json({ error: "Penutupan bisa disusun setelah bursa tutup (16:15 WIB)." }, 400);
          const r = await build(env, b.date, b.session, { live: true, by: who });
          return json(r, r.skip ? 409 : 200);
        }
      }
    } catch (e) {
      return json({ error: "Gagal: " + (e.message || e) }, 500);
    }
    return new Response("Tidak ditemukan", { status: 404 });
  },
});
