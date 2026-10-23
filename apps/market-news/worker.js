// Market News — Cloudflare Worker
// Berita pilihan pasar modal untuk dibagikan ke nasabah: makro (rilis data & kebijakan berdampak besar), pasar (IHSG, sektor,
// komoditas), dan emiten (aksi korporasi, kinerja). Berita dikumpulkan otomatis, diberi skor "hype" (berapa media yang
// memberitakan, aksi korporasi, rilis data, saham ikut naik), diringkas AI, lalu dicek & diterbitkan tim.
// - "/"          -> halaman tim (di dalam Tool Hub): ringkasan pasar, berita pilihan, sunting ringkasan, terbitkan
// - "/p"         -> halaman publik tanpa login: berita yang sudah diterbitkan
// - "/n/<id>"    -> satu berita (pratinjau WhatsApp menampilkan banner & ringkasan lewat tag og:)
// - "/img/<id>"  -> gambar berita lewat worker ini (hotlink media sering diblokir; ikut di-cache)
// - GET  /api/items?view=pick|pub|skip|all, /api/market, /api/sources
// - POST /api/item {id, action: save|publish|unpublish|skip|restore, title, summary, why, no_img}, /api/ai {id}, /api/collect
// Jadwal: apps/cron memanggil scheduled() tiap :20/:50 UTC; tiap jalan membaca 3 sumber bergiliran (batas CPU), menghitung
// ulang skor, memperbarui data pasar (TradingView) pada jam bursa, dan meringkas maks. 2 berita teratas dengan AI.
// Data pasar IHSG/sektor/penggerak/komoditas dibaca dari tabel recaps Market Recap (binding RECAP_DB, hanya baca).
import { title, profileScript, profile } from "../../shared/profile.js";
import { themeHead } from "../../shared/theme.js";
import { ai, AiError } from "../../shared/ai.js";
import { withCron } from "../../shared/cron.js";
import { SOURCES, parseRss, parseList, classify, cleanTitle, score, article, AI_RULES, parseAi, idOf, marketFrom, overview, FIN, FIN_RULES, parseFin, finText } from "./news.js";
import { HUB_FEED, hubFeedAllowed } from "../../shared/hubfeed.js";
import { BG_MODEL, BG_DAILY, BG_THEMES, BG_LABEL, bgTheme, bgPrompt, SCENE_RULES, imageB64 } from "./banner.js";
import { shariaCached, shariaLabel } from "../../shared/sharia.js";
import PAGE from "./page.html";

/* =========================================================
   LOGIN LEWAT TOOL HUB
   ========================================================= */
const HUBSSO = (() => {
  const APP = "news", COOKIE = "hub_" + APP, HOURS = 8, te = new TextEncoder();
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
    /** Kembali dari hub membawa ?hub_t=... -> tukar dengan cookie sesi. null kalau alamat tidak membawa tiket. */
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
    // cookie sesi ikut terkirim dari dalam bingkai, jadi permintaan yang mengubah data wajib berasal dari halaman ini sendiri
    sameOrigin: (request) => { const o = request.headers.get("origin"); return !o || o === new URL(request.url).origin; },
  };
})();

/* =========================================================
   DATABASE (D1: news-db)
   ========================================================= */
let ready = false;
export async function ensure(env) {
  if (ready) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mn_items (id TEXT PRIMARY KEY, url TEXT UNIQUE, src TEXT, src_id TEXT, title TEXT, at TEXT, seen_at TEXT,
    descr TEXT, image TEXT, cat TEXT, theme TEXT, corp TEXT, tickers TEXT, ckey TEXT, score REAL DEFAULT 0, lead INTEGER DEFAULT 0, sources TEXT,
    status TEXT DEFAULT 'baru', ai_state TEXT, ai_title TEXT, summary TEXT, why TEXT, model TEXT, no_img INTEGER DEFAULT 0,
    published_at TEXT, published_by TEXT, updated_at TEXT)`).run();
  await env.DB.batch([
    env.DB.prepare("CREATE INDEX IF NOT EXISTS mn_items_seen ON mn_items(seen_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS mn_items_pub ON mn_items(status, published_at)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS mn_meta (k TEXT PRIMARY KEY, v TEXT)"),
  ]);
  try { await env.DB.prepare("ALTER TABLE mn_items ADD COLUMN fin_state TEXT").run(); } catch {} // antrean laporan keuangan
  // laporan keuangan emiten dari berita (satu baris per emiten & periode); notified = sudah dikirim ke Telegram / webhook
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mn_fin (code TEXT, period TEXT, company TEXT, currency TEXT, revenue REAL, revenue_prev REAL, revenue_yoy REAL,
    net_profit REAL, net_profit_prev REAL, net_profit_yoy REAL, note TEXT, sources TEXT, item_id TEXT, model TEXT, at TEXT, updated_at TEXT, notified INTEGER DEFAULT 0,
    PRIMARY KEY (code, period))`).run();
  // latar banner KISI (ilustrasi AI): per tema (status usul → ok setelah disetujui tim) atau khusus satu berita (item_id)
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mn_bg (id TEXT PRIMARY KEY, theme TEXT, item_id TEXT, status TEXT, img TEXT, prompt TEXT,
    made_by TEXT, made_at TEXT)`).run();
  ready = true;
}
const getMeta = async (env, k) => { try { const r = await env.DB.prepare("SELECT v FROM mn_meta WHERE k=?").bind(k).first(); return r ? JSON.parse(r.v) : null; } catch { return null; } };
const setMeta = (env, k, v) => env.DB.prepare("INSERT OR REPLACE INTO mn_meta (k,v) VALUES (?,?)").bind(k, JSON.stringify(v)).run();
const nowIso = () => new Date().toISOString();
const wib = (t = Date.now()) => new Date(t + 7 * 3600e3);
const ymd = (d) => d.toISOString().slice(0, 10);

/* =========================================================
   PENGUMPUL BERITA
   ========================================================= */
const UA = { "User-Agent": "Mozilla/5.0" }; // beberapa media (CloudFront) menolak User-Agent peramban lengkap
/** Baca sumber `ids`, simpan berita baru yang relevan. Status tiap sumber dicatat di mn_meta 'src'. */
export async function collect(env, ids) {
  await ensure(env);
  const mkt = await getMeta(env, "mkt"), codes = new Set(String((mkt && mkt.codes) || "").split(",").filter(Boolean));
  const st = (await getMeta(env, "src")) || {}, now = nowIso(), old = Date.now() - 48 * 3600e3, rows = [];
  for (const s of SOURCES.filter((x) => ids.includes(x.id))) {
    try {
      const r = await fetch(s.url, { headers: { ...UA, accept: s.type === "rss" ? "application/rss+xml,application/xml,text/xml" : "text/html" }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const txt = (await r.text()).slice(0, 700000);
      const L = s.type === "rss" ? parseRss(txt) : parseList(txt, s.link);
      let n = 0;
      for (const x of L) {
        const t = cleanTitle(x.title), c = classify(t, x.descr, codes);
        if (!c || (x.at && Date.parse(x.at) < old)) continue;
        const fin = c.cat === "emiten" && c.tickers.length && FIN.test(t) ? "pending" : null; // berita kinerja emiten -> antrean laporan keuangan
        rows.push([idOf(x.url), x.url, s.name, s.id, t, x.at || now, now, x.descr || "", x.image || "", c.cat, c.theme, c.corp, c.tickers.join(","), fin]); n++;
      }
      st[s.id] = { at: now, ok: true, n, total: L.length };
    } catch (e) { st[s.id] = { ...(st[s.id] || {}), at: now, ok: false, err: String(e.message || e).slice(0, 120) }; }
  }
  for (let i = 0; i < rows.length; i += 40)
    await env.DB.batch(rows.slice(i, i + 40).map((v) => env.DB.prepare("INSERT OR IGNORE INTO mn_items (id,url,src,src_id,title,at,seen_at,descr,image,cat,theme,corp,tickers,fin_state) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(...v)));
  await setMeta(env, "src", st);
  return rows.length;
}
/** Hitung ulang skor 48 jam terakhir; hanya baris yang berubah yang ditulis (hemat kuota tulis D1). */
export async function rescore(env) {
  const since = new Date(Date.now() - 48 * 3600e3).toISOString(), mkt = await getMeta(env, "mkt");
  const L = (await env.DB.prepare("SELECT id,url,src,title,at,seen_at,cat,theme,corp,tickers,ckey,score,lead,sources FROM mn_items WHERE seen_at>=? AND status<>'abaikan'").bind(since).all()).results || [];
  const sc = score(L.map((x) => ({ ...x, tickers: x.tickers ? x.tickers.split(",") : [] })), (mkt && mkt.px) || {});
  const up = [];
  for (const x of L) {
    const s = sc[x.id], src = s.lead ? JSON.stringify(s.sources || []) : null;
    if (s.score !== x.score || s.lead !== x.lead || s.ckey !== x.ckey || src !== x.sources) up.push(env.DB.prepare("UPDATE mn_items SET score=?,lead=?,ckey=?,sources=? WHERE id=?").bind(s.score, s.lead, s.ckey, src, x.id));
  }
  for (let i = 0; i < up.length; i += 50) await env.DB.batch(up.slice(i, i + 50));
  return up.length;
}
/** Data pasar TradingView (semua saham, satu permintaan): % perubahan per kode, breadth, top gainer & top value. */
export async function refreshMarket(env) {
  const r = await fetch("https://scanner.tradingview.com/indonesia/scan", { method: "POST", headers: { "content-type": "application/json", ...UA }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ columns: ["name", "close", "change", "Value.Traded"], range: [0, 2000], filter: [{ left: "type", operation: "equal", right: "stock" }] }) });
  if (!r.ok) throw new Error("TradingView HTTP " + r.status);
  const m = marketFrom(((await r.json()).data || []).map((x) => x.d));
  await setMeta(env, "mkt", m);
  return m;
}
async function recapLatest(env) {
  if (!env.RECAP_DB) return null;
  try {
    const r = await env.RECAP_DB.prepare("SELECT data FROM recaps ORDER BY date DESC, CASE session WHEN 'close' THEN 0 ELSE 1 END LIMIT 1").first();
    return r ? JSON.parse(r.data) : null;
  } catch { return null; }
}
export async function market(env) { return overview(await recapLatest(env), await getMeta(env, "mkt")); }

/* =========================================================
   AI: banner & ringkasan dari isi artikel
   ========================================================= */
const aiLimit = (env) => Number(env.NEWS_AI_DAILY || 150);
async function aiTake(env) {
  const d = new Date().toISOString().slice(0, 10), c = (await getMeta(env, "ai_day")) || {};
  const n = c.d === d ? c.n : 0;
  if (n >= aiLimit(env)) return false;
  await setMeta(env, "ai_day", { d, n: n + 1 });
  return true;
}
/** Baca artikel (gambar utama & isi), ringkas dengan AI, simpan. Gagal membaca artikel -> ringkasan dari judul & deskripsi RSS. */
export async function enrich(env, x) {
  let art = { image: "", descr: "", text: "" };
  try {
    const r = await fetch(x.url, { headers: { ...UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12000) });
    if (r.ok) art = article((await r.text()).slice(0, 900000));
  } catch {}
  // judul dari slug (halaman daftar tanpa teks judul) diganti judul asli artikel
  const slug = art.title && art.title.length >= 20 && x.title.slice(1) === x.title.slice(1).toLowerCase(), t0 = slug ? cleanTitle(art.title) : x.title;
  const us = profile(env).brand.short || profile(env).brand.company || "";
  const input = `Media: ${x.src}\nJudul: ${t0}\nTanggal: ${x.at || ""}\n\nIsi artikel:\n${art.text || art.descr || x.descr || "(isi tidak terbaca; ringkas dari judul saja, jangan menambah fakta)"}`;
  const { text, model } = await ai(env, AI_RULES(us), input, 900, undefined, { temperature: 0.3, json: true });
  const f = parseAi(text);
  // kode dari AI hanya yang terdaftar di BEI (daftar kode dari data pasar TradingView)
  const mkt = await getMeta(env, "mkt"), codes = new Set(String((mkt && mkt.codes) || "").split(",").filter(Boolean));
  const tk = [...new Set([...(x.tickers ? String(x.tickers).split(",").filter(Boolean) : []), ...f.tickers.filter((c) => !codes.size || codes.has(c))])].slice(0, 6).join(",");
  const set = { ai_state: f.summary ? "done" : "bukan", ai_title: f.title || null, summary: f.summary || null, why: f.why || null, model, image: art.image || x.image || null, tickers: tk || null, updated_at: nowIso() };
  if (slug) set.title = t0;
  if (f.cat) set.cat = f.cat;
  if (!f.summary) set.status = "abaikan"; // AI menilai bukan berita pasar/ekonomi; tim bisa mengembalikannya
  const k = Object.keys(set);
  await env.DB.prepare(`UPDATE mn_items SET ${k.map((c) => c + "=?").join(",")} WHERE id=?`).bind(...k.map((c) => set[c]), x.id).run();
  return set;
}
const AI_MIN = 8; // skor minimal berita yang diringkas otomatis
async function enrichQueue(env, n) {
  if (!env.AI && !env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY) return 0;
  const since = new Date(Date.now() - 36 * 3600e3).toISOString();
  const L = (await env.DB.prepare("SELECT * FROM mn_items WHERE lead=1 AND status='baru' AND ai_state IS NULL AND score>=? AND seen_at>=? ORDER BY score DESC LIMIT ?").bind(AI_MIN, since, n).all()).results || [];
  let done = 0;
  for (const x of L) {
    if (!(await aiTake(env))) break;
    try { await enrich(env, x); done++; }
    catch (e) {
      if (/kuota/i.test(e.message)) break;
      await env.DB.prepare("UPDATE mn_items SET ai_state='gagal' WHERE id=?").bind(x.id).run();
    }
  }
  return done;
}

/* =========================================================
   LAPORAN KEUANGAN EMITEN (dari berita kinerja)
   ========================================================= */
const FIN_COLS = "code,period,company,currency,revenue,revenue_prev,revenue_yoy,net_profit,net_profit_prev,net_profit_yoy,note,sources,item_id,model,at,updated_at";
const addSrc = (json, s) => { let L = []; try { L = JSON.parse(json || "[]"); } catch {} if (!L.some((x) => x.url === s.url)) L.push(s); return JSON.stringify(L.slice(0, 8)); };
/** Baca satu berita kinerja: AI mengambil periode, pendapatan, laba bersih. Hasil: "done" (tersimpan), "bukan", atau error. */
export async function finRead(env, x) {
  let art = { text: "", descr: "" };
  try { const r = await fetch(x.url, { headers: { ...UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12000) }); if (r.ok) art = article((await r.text()).slice(0, 900000)); } catch {}
  const mkt = await getMeta(env, "mkt"), codes = new Set(String((mkt && mkt.codes) || "").split(",").filter(Boolean));
  const { text, model } = await ai(env, FIN_RULES, `Media: ${x.src}\nJudul: ${x.title}\nTanggal: ${x.at || ""}\n\nIsi artikel:\n${art.text || art.descr || x.descr || x.title}`, 700, undefined, { temperature: 0.1, json: true });
  const f = parseFin(text, codes);
  if (!f) { await env.DB.prepare("UPDATE mn_items SET fin_state='bukan' WHERE id=?").bind(x.id).run(); return "bukan"; }
  const now = nowIso(), src = { src: x.src, url: x.url, title: x.title };
  const old = await env.DB.prepare("SELECT sources FROM mn_fin WHERE code=? AND period=?").bind(f.code, f.period).first();
  if (old) {
    // laporan yang sama dari media lain: angka yang kosong dilengkapi, sumber ditambah, tidak dikirim ulang
    await env.DB.prepare(`UPDATE mn_fin SET revenue=COALESCE(revenue,?), revenue_prev=COALESCE(revenue_prev,?), revenue_yoy=COALESCE(revenue_yoy,?), net_profit=COALESCE(net_profit,?),
      net_profit_prev=COALESCE(net_profit_prev,?), net_profit_yoy=COALESCE(net_profit_yoy,?), note=COALESCE(NULLIF(note,''),?), sources=?, updated_at=? WHERE code=? AND period=?`)
      .bind(f.revenue, f.revenue_prev, f.revenue_yoy, f.net_profit, f.net_profit_prev, f.net_profit_yoy, f.note, addSrc(old.sources, src), now, f.code, f.period).run();
  } else {
    await env.DB.prepare(`INSERT INTO mn_fin (${FIN_COLS},notified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`).bind(f.code, f.period, f.company, f.currency, f.revenue, f.revenue_prev, f.revenue_yoy,
      f.net_profit, f.net_profit_prev, f.net_profit_yoy, f.note, JSON.stringify([src]), x.id, model, x.at || now, now).run();
  }
  await env.DB.prepare("UPDATE mn_items SET fin_state='done' WHERE id=?").bind(x.id).run();
  return "done";
}
/** Antrean berita kinerja (4 hari terakhir, terbaru dulu). Emiten yang sudah terbaca dalam 3 hari: berita lain cukup jadi sumber tambahan (tanpa AI). */
export async function finQueue(env, n = 3) {
  if (!env.AI && !env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY) return 0;
  const since = new Date(Date.now() - 4 * 864e5).toISOString(), recent = new Date(Date.now() - 3 * 864e5).toISOString();
  const L = (await env.DB.prepare("SELECT id,url,src,title,at,descr,tickers FROM mn_items WHERE fin_state='pending' AND seen_at>=? ORDER BY seen_at DESC LIMIT 12").bind(since).all()).results || [];
  let done = 0;
  for (const x of L) {
    const code = String(x.tickers || "").split(",")[0];
    const have = code ? await env.DB.prepare("SELECT period, sources FROM mn_fin WHERE code=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 1").bind(code, recent).first() : null;
    if (have) {
      await env.DB.batch([env.DB.prepare("UPDATE mn_fin SET sources=? WHERE code=? AND period=?").bind(addSrc(have.sources, { src: x.src, url: x.url, title: x.title }), code, have.period),
        env.DB.prepare("UPDATE mn_items SET fin_state='sama' WHERE id=?").bind(x.id)]);
      continue;
    }
    if (done >= n || !(await aiTake(env))) break;
    try { await finRead(env, x); done++; }
    catch (e) { if (/kuota/i.test(e.message)) break; await env.DB.prepare("UPDATE mn_items SET fin_state='gagal' WHERE id=?").bind(x.id).run(); }
  }
  return done;
}
const finRows = async (env, days = 30) => ((await env.DB.prepare(`SELECT ${FIN_COLS} FROM mn_fin WHERE updated_at>=? ORDER BY at DESC, updated_at DESC LIMIT 300`).bind(new Date(Date.now() - days * 864e5).toISOString()).all()).results || [])
  .map((r) => ({ ...r, sources: JSON.parse(r.sources || "[]") }));
/** Kirim laporan keuangan baru ke Telegram (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) dan/atau webhook (NOTIFY_WEBHOOK, mis. gateway WhatsApp). */
export async function notifyFin(env) {
  const L = (await env.DB.prepare(`SELECT ${FIN_COLS} FROM mn_fin WHERE notified=0 ORDER BY at LIMIT 8`).all()).results || [];
  if (!L.length) return 0;
  const tg = env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID, hook = env.NOTIFY_WEBHOOK;
  if (tg || hook) {
    const blocks = L.map((f) => finText(f, (JSON.parse(f.sources || "[]"))[0]));
    const text = `📊 Laporan keuangan baru (${L.length})\n\n` + blocks.join("\n\n");
    if (tg) {
      const hesc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: hesc(text).replace(/^\*(.+)\*$/gm, "<b>$1</b>"), parse_mode: "HTML", disable_web_page_preview: true }) });
      if (!r.ok) throw new Error("Telegram HTTP " + r.status);
    }
    if (hook) await fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10000), body: JSON.stringify({ text, content: text.slice(0, 1990) }) });
  }
  // tanpa saluran notifikasi pun ditandai terkirim, supaya saat saluran dipasang tidak membanjiri laporan lama
  await env.DB.batch(L.map((f) => env.DB.prepare("UPDATE mn_fin SET notified=1 WHERE code=? AND period=?").bind(f.code, f.period)));
  return L.length;
}
/** Ringkasan untuk kartu "Hari ini" di beranda Tool Hub (shared/hubfeed.js). */
async function hubToday(env) {
  await ensure(env);
  const today = ymd(wib()), since = new Date(Date.parse(today + "T00:00:00+07:00") - 864e5).toISOString();
  const fin = (await env.DB.prepare(`SELECT ${FIN_COLS} FROM mn_fin WHERE at>=? OR updated_at>=? ORDER BY at DESC LIMIT 6`).bind(since, since).all()).results || [];
  const c = await env.DB.prepare("SELECT SUM(status='terbit' AND published_at>=?) AS pub, SUM(status='baru' AND lead=1 AND ai_state='done' AND seen_at>=?) AS ready FROM mn_items").bind(since, since).first();
  return { date: today, fin: fin.map((r) => ({ ...r, sources: JSON.parse(r.sources || "[]") })), pub: (c && c.pub) || 0, ready: (c && c.ready) || 0 };
}

/* =========================================================
   HALAMAN
   ========================================================= */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ITEM_COLS = "id,url,src,title,at,seen_at,descr,cat,theme,corp,tickers,score,lead,sources,status,ai_state,ai_title,summary,why,model,no_img,published_at,published_by,(image IS NOT NULL AND image<>'') AS has_img";
const pub = (x) => ({ id: x.id, url: x.url, src: x.src, title: x.ai_title || x.title, at: x.at, cat: x.cat, theme: x.theme, corp: x.corp, tickers: x.tickers ? x.tickers.split(",") : [],
  summary: x.summary, why: x.why, sources: x.sources ? JSON.parse(x.sources) : [], img: x.has_img && !x.no_img ? "/img/" + x.id : "", published_at: x.published_at });
// saham syariah (anggota ISSI/JII70/JII) -> label "Syariah" di kode saham; kosong kalau TradingView tidak terjangkau
const syMap = (ctx) => shariaCached(ctx).then((s) => Object.fromEntries(Object.entries(s.codes).map(([c, t]) => [c, shariaLabel(t)]))).catch(() => ({}));
function page(env, cfg, head = "", inHub = false) {
  const h = `<title>${esc(cfg.title || title(env, "Market News"))}</title>${head}${profileScript(env)}${themeHead("")}<script>${inHub ? HUBSSO.onlyInHub(env) : ""}window.MN=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script>`;
  return PAGE.replace("<title>Market News</title>", () => h);
}
const html = (body, extra = {}, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...extra } });
const json = (v, status = 200) => Response.json(v, { status, headers: { "cache-control": "no-store" } });
async function published(env, limit = 60) {
  await ensure(env);
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  return ((await env.DB.prepare(`SELECT ${ITEM_COLS} FROM mn_items WHERE status='terbit' AND published_at>=? ORDER BY published_at DESC LIMIT ?`).bind(since, limit).all()).results || []).map(pub);
}
// Gambar berita lewat worker ini: hotlink sering diblokir media, dan pratinjau WhatsApp butuh alamat yang stabil
async function image(env, id, ctx) {
  await ensure(env);
  const x = await env.DB.prepare("SELECT image, url FROM mn_items WHERE id=?").bind(id).first();
  if (!x || !x.image || !/^https:\/\//.test(x.image)) return new Response("Tidak ada gambar", { status: 404 });
  const key = new Request("https://cache.local/mn-img/" + encodeURIComponent(x.image)), cache = caches.default;
  const hit = await cache.match(key); if (hit) return hit;
  const g = await fetch(x.image, { headers: { ...UA, accept: "image/*", referer: new URL(x.url).origin + "/" }, signal: AbortSignal.timeout(12000) }).catch(() => null);
  const ct = g && g.ok ? (g.headers.get("content-type") || "") : "";
  if (!/^image\/(png|jpe?g|webp|gif|avif)/.test(ct) || Number(g.headers.get("content-length") || 0) > 6e6) return new Response("Gambar tidak bisa dimuat", { status: 502 });
  const res = new Response(g.body, { headers: { "content-type": ct, "cache-control": "public, max-age=86400" } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/* ---------- latar banner KISI ---------- */
const bgList = async (env) => ((await env.DB.prepare("SELECT id, theme, item_id, status, made_by, made_at FROM mn_bg ORDER BY made_at DESC LIMIT 400").all()).results || []);
async function bgTake(env) {
  const d = new Date().toISOString().slice(0, 10), c = (await getMeta(env, "bg_day")) || {}, n = c.d === d ? c.n : 0;
  if (n >= BG_DAILY) return false;
  await setMeta(env, "bg_day", { d, n: n + 1 });
  return true;
}
/** Buat satu latar: per tema (`theme`, status usul) atau khusus berita (`item`, langsung dipakai). */
export async function makeBg(env, { theme, item, who }) {
  let scene = "";
  if (item) {
    theme = bgTheme(item);
    // adegan visual dari judul + ringkasan (tanpa orang/teks); bila AI teks gagal, pakai subjek tema
    try { scene = (await ai(env, SCENE_RULES, `Headline: ${item.ai_title || item.title}\nSummary: ${item.summary || item.descr || ""}`, 120, undefined, { temperature: 0.6 })).text; } catch {}
  }
  if (!BG_THEMES[theme]) throw new Error("Tema tidak dikenal.");
  const prompt = bgPrompt(theme, scene);
  const out = await env.AI.run(BG_MODEL, { prompt, steps: 6 });   // model ini tidak menerima `seed`; tiap panggilan sudah acak
  const img = await imageB64(out), id = "bg" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (item) await env.DB.prepare("DELETE FROM mn_bg WHERE item_id=?").bind(item.id).run();   // satu latar khusus per berita
  await env.DB.prepare("INSERT INTO mn_bg (id, theme, item_id, status, img, prompt, made_by, made_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id, theme, item ? item.id : null, item ? "ok" : "usul", img, prompt, who || "", nowIso()).run();
  return { id, theme, item_id: item ? item.id : null, status: item ? "ok" : "usul", made_by: who || "", made_at: nowIso() };
}
async function bgImage(env, id) {
  const r = await env.DB.prepare("SELECT img FROM mn_bg WHERE id=?").bind(id).first();
  if (!r || !r.img) return new Response("Tidak ada latar", { status: 404 });
  const bin = Uint8Array.from(atob(r.img), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { "content-type": /^iVBOR/.test(r.img) ? "image/png" : "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
}

export default withCron({
  async scheduled(e, env) {
    await ensure(env);
    const t = wib(e.scheduledTime), h = t.getUTCHours(), wd = t.getUTCDay() >= 1 && t.getUTCDay() <= 5;
    if (h < 5 || h >= 23) return; // malam: tidak ada berita yang perlu dikejar
    // 3 sumber per jalan, bergiliran (batas CPU 10 ms)
    const i = ((await getMeta(env, "rot")) || 0) % SOURCES.length, ids = [0, 1, 2].map((k) => SOURCES[(i + k) % SOURCES.length].id);
    await setMeta(env, "rot", i + 3);
    await collect(env, ids);
    const m = await getMeta(env, "mkt");
    if ((wd && h >= 9 && h < 17) || !m || Date.now() - Date.parse(m.at) > 6 * 3600e3) await refreshMarket(env).catch((err) => console.error("pasar:", err.message));
    await rescore(env);
    await enrichQueue(env, 2).catch((err) => console.error("AI:", err.message));
    await finQueue(env, 3).catch((err) => console.error("lapkeu:", err.message));
    await notifyFin(env).catch((err) => console.error("notifikasi:", err.message));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    try {
      if (path === HUB_FEED) return hubFeedAllowed(request, env) ? json(await hubToday(env)) : new Response("forbidden", { status: 403 });
      if (path === "/logo") {
        const src = profile(env).brand.logo;
        if (!src) return new Response("Tidak ada logo", { status: 404 });
        const r = await fetch(src, { cf: { cacheTtl: 86400, cacheEverything: true } });
        return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "image/png", "cache-control": "public, max-age=86400" } });
      }
      const im = /^\/img\/([a-z0-9]+)$/.exec(path);
      if (im) return image(env, im[1], ctx);
      const bm = /^\/bg\/([a-z0-9]+)$/.exec(path);
      if (bm) { await ensure(env); return bgImage(env, bm[1]); }
      const logo = profile(env).brand.logo ? "/logo" : "";
      // publik: hanya berita yang sudah diterbitkan, tanpa login
      if (path === "/p" || path === "/p/") return html(page(env, { mode: "public", logo, items: await published(env), market: await market(env), sharia: await syMap(ctx) }, '<meta name="viewport" content="width=device-width,initial-scale=1">'));
      const nm = /^\/n\/([a-z0-9]+)$/.exec(path);
      if (nm) {
        await ensure(env);
        const x = await env.DB.prepare(`SELECT ${ITEM_COLS} FROM mn_items WHERE id=? AND status='terbit'`).bind(nm[1]).first();
        if (!x) return html(page(env, { mode: "public", logo, items: [], missing: true }), {}, 404);
        const it = pub(x), og = (p, v) => v ? `<meta property="${p}" content="${esc(v)}">` : "";
        const head = '<meta name="viewport" content="width=device-width,initial-scale=1">' + og("og:type", "article") + og("og:title", it.title) + og("og:description", it.summary) + og("og:url", url.origin + path)
          + og("og:image", it.img ? url.origin + it.img : "") + og("og:site_name", title(env, "Market News")) + `<meta name="twitter:card" content="${it.img ? "summary_large_image" : "summary"}">`;
        return html(page(env, { mode: "public", logo, items: [it], single: true, title: it.title, sharia: await syMap(ctx) }, head));
      }
      if (path === "/logout") return HUBSSO.logout(env);
      if (!HUBSSO.ready(env)) return HUBSSO.notReady();
      const tk = await HUBSSO.ticket(request, env); if (tk) return tk;
      const me = await HUBSSO.user(request, env);
      const isPage = path === "/" || path === "/index.html";
      if (!me) return isPage ? HUBSSO.login(request, env) : json({ error: "Belum login atau sesi habis. Muat ulang halaman dari Tool Hub." }, 401);
      const role = me.adm ? "admin" : me.a, canEdit = role === "admin" || role === "editor", who = me.n || me.u || me.e;
      if (isPage) return html(page(env, { mode: "team", logo, canEdit, publicUrl: url.origin + "/p", sources: SOURCES.map(({ id, name }) => ({ id, name })), sharia: await syMap(ctx) }, "", true), { "content-security-policy": HUBSSO.frame(env) });
      await ensure(env);

      if (request.method === "GET") {
        if (path === "/api/market") return json(await market(env));
        if (path === "/api/bg") return json({ bgs: await bgList(env), themes: Object.keys(BG_THEMES).map((k) => ({ k, label: BG_LABEL[k] || k })), day: (await getMeta(env, "bg_day")) || {}, limit: BG_DAILY });
        if (path === "/api/fin") return json({ rows: await finRows(env, Number(url.searchParams.get("days")) || 30), notify: { telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID), webhook: !!env.NOTIFY_WEBHOOK } });
        if (path === "/api/sources") return json({ src: (await getMeta(env, "src")) || {}, ai: (await getMeta(env, "ai_day")) || {}, aiLimit: aiLimit(env) });
        if (path === "/api/items") {
          const v = url.searchParams.get("view") || "pick", since = new Date(Date.now() - 48 * 3600e3).toISOString();
          const q = v === "pub" ? ["status='terbit' ORDER BY published_at DESC LIMIT 100", []]
            : v === "skip" ? ["status='abaikan' AND seen_at>=? ORDER BY seen_at DESC LIMIT 100", [since]]
            : v === "all" ? ["seen_at>=? ORDER BY seen_at DESC LIMIT 300", [since]]
            : ["status='baru' AND lead=1 AND seen_at>=? ORDER BY score DESC, seen_at DESC LIMIT 80", [since]];
          const L = (await env.DB.prepare(`SELECT ${ITEM_COLS} FROM mn_items WHERE ${q[0]}`).bind(...q[1]).all()).results || [];
          const m = await getMeta(env, "mkt"), px = (m && m.px) || {};
          return json(L.map((x) => ({ ...pub(x), raw_title: x.title, score: x.score, status: x.status, ai_state: x.ai_state, model: x.model, no_img: !!x.no_img, has_img: !!x.has_img, seen_at: x.seen_at, published_by: x.published_by,
            px: Object.fromEntries((x.tickers ? x.tickers.split(",") : []).filter((c) => typeof px[c] === "number").map((c) => [c, px[c]])) })));
        }
      }
      if (request.method === "POST") {
        if (!HUBSSO.sameOrigin(request)) return json({ error: "Permintaan ditolak." }, 403);
        if (!canEdit) return json({ error: "Hanya editor atau admin yang bisa mengubah berita." }, 403);
        const b = await request.json().catch(() => ({}));
        if (path === "/api/collect") {
          // dari tombol: 4 sumber berikutnya (batas CPU); pasar diperbarui bila sudah lebih dari 15 menit
          const i = ((await getMeta(env, "rot")) || 0) % SOURCES.length, ids = [0, 1, 2, 3].map((k) => SOURCES[(i + k) % SOURCES.length].id);
          await setMeta(env, "rot", i + 4);
          const n = await collect(env, ids), m = await getMeta(env, "mkt");
          if (!m || Date.now() - Date.parse(m.at) > 15 * 60e3) await refreshMarket(env).catch(() => {});
          await rescore(env);
          return json({ ok: true, n, sources: ids });
        }
        if (path === "/api/bg/gen") {   // latar baru: {theme} untuk perpustakaan tema, atau {item} untuk satu berita
          const it = b.item ? await env.DB.prepare("SELECT * FROM mn_items WHERE id=?").bind(String(b.item)).first() : null;
          if (b.item && !it) return json({ error: "Berita tidak ditemukan." }, 404);
          if (!it && !BG_THEMES[b.theme]) return json({ error: "Tema tidak dikenal." }, 400);
          if (!(await bgTake(env))) return json({ error: `Batas pembuatan gambar hari ini (${BG_DAILY}) sudah tercapai. Pakai latar tema atau coba lagi besok.` }, 429);
          try { return json({ ok: true, bg: await makeBg(env, { theme: b.theme, item: it, who }) }); }
          catch (e) { return json({ error: "Gambar AI gagal dibuat: " + e.message }, 503); }
        }
        if (path === "/api/bg/set") {   // setujui / kembalikan ke usulan / hapus
          const id = String(b.bg || "");
          if (b.status === "hapus") await env.DB.prepare("DELETE FROM mn_bg WHERE id=?").bind(id).run();
          else if (b.status === "ok" || b.status === "usul") await env.DB.prepare("UPDATE mn_bg SET status=? WHERE id=?").bind(b.status, id).run();
          else return json({ error: "Status tidak dikenal." }, 400);
          return json({ ok: true });
        }
        const x = b.id ? await env.DB.prepare("SELECT * FROM mn_items WHERE id=?").bind(String(b.id)).first() : null;
        if (!x) return json({ error: "Berita tidak ditemukan." }, 404);
        if (path === "/api/ai") {
          if (!(await aiTake(env))) return json({ error: `Batas AI harian Market News (${aiLimit(env)}x) sudah tercapai. Coba lagi besok pukul 07.00 WIB.` }, 429);
          try { await enrich(env, x); } catch (e) { return json({ error: e instanceof AiError ? e.message : "AI gagal: " + e.message }, 503); }
          return json({ ok: true });
        }
        if (path === "/api/item") {
          const s = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n), set = { updated_at: nowIso() };
          if (b.title !== undefined) set.ai_title = s(b.title, 160) || null;
          if (b.summary !== undefined) set.summary = s(b.summary, 600) || null;
          if (b.why !== undefined) set.why = s(b.why, 300) || null;
          if (b.no_img !== undefined) set.no_img = b.no_img ? 1 : 0;
          if (b.action === "publish") {
            if (!(set.summary ?? x.summary)) return json({ error: "Isi ringkasan dulu sebelum diterbitkan." }, 400);
            Object.assign(set, { status: "terbit", published_at: nowIso(), published_by: who });
          } else if (b.action === "unpublish" || b.action === "restore") set.status = "baru";
          else if (b.action === "skip") set.status = "abaikan";
          const k = Object.keys(set);
          await env.DB.prepare(`UPDATE mn_items SET ${k.map((c) => c + "=?").join(",")} WHERE id=?`).bind(...k.map((c) => set[c]), x.id).run();
          return json({ ok: true, link: url.origin + "/n/" + x.id });
        }
      }
    } catch (e) {
      if (/daily row write limit/i.test(e.message)) return json({ error: "Kuota tulis database harian (paket gratis Cloudflare) sudah habis. Coba lagi setelah pukul 07.00 WIB." }, 503);
      return json({ error: "Gagal: " + (e.message || e) }, 500);
    }
    return new Response("Tidak ditemukan", { status: 404 });
  },
});
