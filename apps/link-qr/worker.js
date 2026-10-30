// Link & QR Studio — Cloudflare Worker (nama worker "go": alamat pendek go.<subdomain>.workers.dev/<kode>)
// Link pendek + QR untuk kegiatan / Program di Content Planner. Klik dihitung per hari dan totalnya dikirim ke Content Planner.
// - "/<kode>"         -> publik: hitung klik (bukan bot) lalu alihkan ke tujuan yang tersimpan; link nonaktif -> halaman pemberitahuan
// - "/"               -> halaman (di dalam Tool Hub)
// - "/api/*"          -> data (login lewat Tool Hub)
// - "/__hub/users" (POST) -> anggota, daftar cabang, dan tim & role dari Tool Hub
// Hak akses: semua pemegang akses membuat link; kegiatan yang bisa dipilih & dilihat mengikuti aturan Content Planner (tim regional:
// hanya kegiatan cabang & rencana galeri). Menonaktifkan: pembuat, Head, atau admin hub. Tujuan link tidak pernah bisa diubah.
import { hubPushAllowed } from "../../shared/hubfeed.js";
import { title, profileScript, appUrl, profile } from "../../shared/profile.js";
import { themeHead } from "../../shared/theme.js";
import EN from "./i18n.js";
import PAGE from "./page.html";
import { cleanOrg, roleIn, isRegional } from "../../shared/jobs.js";

/* =========================================================
   LOGIN LEWAT TOOL HUB
   ========================================================= */
const HUBSSO = (() => {
  const APP = "go", COOKIE = "hub_" + APP, HOURS = 8, te = new TextEncoder();
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
   ATURAN DASAR
   ========================================================= */
// pratinjau link di aplikasi chat & mesin pencari tidak dihitung sebagai klik (sama dengan Content Planner)
export const BOT_UA = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|linkedin|skype|embedly|vkshare|pinterest|google-?inspect|headless/i;
// kode link: 6 huruf tanpa yang mirip (l, o, 0, 1). Link yang diketik dari poster boleh berhuruf besar (HP sering
// mengapitalkan huruf pertama) atau diakhiri garis miring; kodenya tetap dicari dalam huruf kecil.
const ABC = "abcdefghijkmnpqrstuvwxyz23456789";
export const CODE_RE = /^\/([a-km-np-z2-9]{6})\/?$/i;
// kanal: [label, utm_source, utm_medium]
export const KANAL = {
  poster: ["Poster/cetak", "poster", "cetak"], instagram: ["Instagram", "instagram", "social"], whatsapp: ["WhatsApp", "whatsapp", "social"],
  iklan: ["Iklan", "iklan", "ads"], email: ["Email", "email", "email"], lainnya: ["Lainnya", "lainnya", "lainnya"],
};
/** Tanggal WIB (YYYY-MM-DD) untuk hitungan harian. */
export const wibDay = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);

/* =========================================================
   DATA (D1: go-db)
   ========================================================= */
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch([
    // pengaturan: users, branches, org (dari Tool Hub)
    env.DB.prepare("CREATE TABLE IF NOT EXISTS cfg (k TEXT PRIMARY KEY, v TEXT)"),
    // item_kind / item_title = salinan dari Content Planner (diperbarui saat daftar dibuka); gone = kegiatan sudah dihapus di Planner
    env.DB.prepare("CREATE TABLE IF NOT EXISTS links (code TEXT PRIMARY KEY, item_id TEXT NOT NULL, item_kind TEXT, item_title TEXT, gone INTEGER DEFAULT 0, target TEXT NOT NULL, channel TEXT, name TEXT, utm INTEGER, active INTEGER DEFAULT 1, clicks INTEGER DEFAULT 0, created_by TEXT, created_email TEXT, created_at TEXT, off_by TEXT, off_at TEXT)"),
    // klik per link per hari (WIB); tanpa data pribadi pengunjung
    env.DB.prepare("CREATE TABLE IF NOT EXISTS daily (code TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (code, day))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS links_item ON links (item_id)"),
  ]);
  ready = true;
}
const lower = (x) => String(x || "").toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function cfgGet(env, k) {
  await ensure(env);
  const r = await env.DB.prepare("SELECT v FROM cfg WHERE k = ?").bind(k).first();
  try { return r ? JSON.parse(r.v) : null; } catch { return null; }
}
const cfgPut = (env, k, v) => env.DB.prepare("INSERT INTO cfg (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, JSON.stringify(v));
/** Tim & role dari Tool Hub (bawaan kalau belum pernah dikirim). */
const getOrg = async (env) => cleanOrg(await cfgGet(env, "org"));
/** POST /__hub/users dari Tool Hub: { users, branches, org }. */
async function syncFromHub(env, b) {
  await ensure(env);
  const L = (Array.isArray(b.users) ? b.users : []).map((u) => ({ email: lower(u && u.email), name: String((u && u.name) || "").slice(0, 60), job: String((u && u.job) || "").slice(0, 24),
    branch: String((u && u.branch) || "").slice(0, 60), adm: !!(u && u.adm) })).filter((u) => EMAIL.test(u.email)).slice(0, 500);
  const B = Array.isArray(b.branches) ? b.branches.map((x) => ({ r: String((x && x.r) || "").slice(0, 60), c: String((x && x.c) || "").slice(0, 60), t: x && x.t === "galeri" ? "galeri" : "cabang" })).filter((x) => x.r && x.c).slice(0, 300) : null;
  await env.DB.batch([...(L.length ? [cfgPut(env, "users", L)] : []), ...(B ? [cfgPut(env, "branches", B)] : []),
    ...(b.org && typeof b.org === "object" ? [cfgPut(env, "org", cleanOrg(b.org))] : [])]);
  return { ok: true, n: L.length };
}
const json = (v, status = 200) => Response.json(v, { status, headers: { "cache-control": "no-store" } });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// jam sekarang: env.NOW_MS hanya dipakai tes
const now = (env) => Number(env.NOW_MS) || Date.now();
/** Batas waktu untuk panggilan ke Content Planner. */
const timed = (p, ms) => { let t; return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error("timeout")), ms); })]).finally(() => clearTimeout(t)); };
const planner = (env, path, init = {}) => {
  if (!env.PLANNER) return Promise.reject(new Error("tanpa binding"));
  return timed(env.PLANNER.fetch("https://content-planner" + path, { ...init, headers: { "x-hub-key": env.SSO_SECRET, ...(init.body ? { "content-type": "application/json" } : {}) } }), 5000);
};

/* =========================================================
   KLIK
   ========================================================= */
/** Kirim total klik per kegiatan ke Content Planner (nilai total; Planner menyimpan yang terbesar, jadi aman dikirim ulang).
 *  Kegiatan yang sudah dihapus di Planner ditandai gone. Gagal -> dicatat di log saja, pengalihan tidak terganggu. */
async function pushClicks(env, ids) {
  ids = [...new Set(ids.filter(Boolean).map(String))].slice(0, 200);
  if (!ids.length) return { gone: [] };
  try {
    const ph = ids.map(() => "?").join(",");
    const R = (await env.DB.prepare(`SELECT item_id, SUM(clicks) AS n FROM links WHERE item_id IN (${ph}) GROUP BY item_id`).bind(...ids).all()).results;
    const r = await planner(env, "/__hub/link-clicks", { method: "POST", body: JSON.stringify({ items: Object.fromEntries(R.map((x) => [x.item_id, Number(x.n) || 0])) }) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const gone = ((await r.json()).gone || []).map(String).filter((x) => ids.includes(x));
    if (gone.length) await env.DB.prepare(`UPDATE links SET gone = 1 WHERE item_id IN (${gone.map(() => "?").join(",")})`).bind(...gone).run();
    return { gone };
  } catch (e) {
    console.log("Content Planner tidak bisa dihubungi:", e.message);
    return { gone: [] };
  }
}
async function count(env, code, item) {
  await env.DB.batch([
    env.DB.prepare("UPDATE links SET clicks = clicks + 1 WHERE code = ?").bind(code),
    env.DB.prepare("INSERT INTO daily (code, day, n) VALUES (?, ?, 1) ON CONFLICT(code, day) DO UPDATE SET n = n + 1").bind(code, wibDay(now(env))),
  ]);
  await pushClicks(env, [item]);
}
/** Halaman kecil untuk pengunjung (link tidak ada / nonaktif): logo perusahaan + pesan + tombol ke website. */
function notice(env, status, head, text) {
  const web = String((profile(env).contact || {}).website || ""), co = esc(profile(env).brand.company || "");
  const btn = /^https?:\/\//.test(web) ? `<a class="b" href="${esc(web)}">Kunjungi website</a>` : "";
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(head)}</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f6f8f7;color:#16201b}
.c{max-width:360px;padding:32px 24px;text-align:center}img{width:200px;max-width:70%;height:auto;margin-bottom:24px}h1{font-size:20px;margin:0 0 8px}p{margin:0 0 24px;color:#4d5a53}
.b{display:inline-block;min-height:44px;line-height:44px;padding:0 22px;border-radius:10px;background:#1f7a4d;color:#fff;text-decoration:none;font-weight:600}
@media (prefers-color-scheme:dark){body{background:#0f1512;color:#e6ece8}p{color:#a6b3ac}img{background:#fff;padding:10px 14px;border-radius:10px}.b{background:#4fc285;color:#0f1512}}</style></head>
<body><main class="c"><img src="/brand/kisi-color.png" alt="${co}"><h1>${esc(head)}</h1><p>${esc(text)}</p>${btn}</main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
/** GET /<kode>: tujuan selalu dari D1 (tidak pernah dari query), jadi tidak bisa dipakai sebagai open redirect. */
async function redirect(request, env, ctx, code) {
  await ensure(env);
  const L = await env.DB.prepare("SELECT target, active, item_id FROM links WHERE code = ?").bind(code).first();
  if (!L) return notice(env, 404, "Link tidak ditemukan", "Periksa kembali alamat atau kode QR yang dipindai.");
  if (!L.active) return notice(env, 410, "Link ini sudah tidak aktif", "Materi ini sudah tidak berlaku. Informasi terbaru ada di website kami.");
  if (request.method === "GET" && !BOT_UA.test(request.headers.get("user-agent") || ""))
    ctx.waitUntil(count(env, code, L.item_id).catch((e) => console.log("hitung klik gagal:", e.message)));
  return new Response(null, { status: 302, headers: { location: L.target, "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

/* =========================================================
   KEGIATAN, LINK, GRAFIK
   ========================================================= */
const REG_KINDS = ["cabang", "galeri"];
const OFFLINE = "Content Planner tidak bisa dihubungi. Coba lagi sebentar.";
/** Sesi: tiket lama tanpa role memakai role di daftar anggota dari Tool Hub, supaya aturan regional tetap berlaku. */
async function whoAmI(env, sess) {
  const e = lower(sess.e);
  if (sess.j || sess.adm) return { ...sess, e };
  const u = ((await cfgGet(env, "users")) || []).find((x) => x.email === e);
  return { ...sess, e, j: (u && u.job) || "", adm: !!(u && u.adm) };
}
/** Kegiatan dari Content Planner; reg = hanya kegiatan cabang & rencana galeri. */
async function plannerItems(env, reg, params) {
  const r = await planner(env, "/__hub/link-items?" + new URLSearchParams({ ...(reg ? { reg: "1" } : {}), ...params }));
  if (!r.ok) throw new Error("HTTP " + r.status);
  return (await r.json()).items || [];
}
const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
/** Tambah UTM (yang belum ada) ke link tujuan: sumber & medium dari kanal, kampanye dari judul kegiatan, content = kode link. */
export function utmUrl(target, itemTitle, channel, code) {
  const u = new URL(target), k = KANAL[channel] || KANAL.lainnya;
  const set = (key, v) => { if (!u.searchParams.has(key) && v) u.searchParams.set(key, v); };
  set("utm_source", k[1]); set("utm_medium", k[2]); set("utm_campaign", slug(itemTitle)); set("utm_content", code);
  return u.toString();
}
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => ABC[x % ABC.length]).join("");
const linkUrl = (env, code) => appUrl(env, "go") + "/" + code;
/** POST /api/links: { item_id, target, channel, name?, utm? }. Kegiatan selalu dicek ke Content Planner dengan aturan orang ini. */
async function createLink(env, me, reg, b) {
  const target = String(b.target ?? "").trim();
  let u; try { u = new URL(target); } catch { u = null; }
  if (!u || !/^https?:$/.test(u.protocol) || target.length > 500) return { error: "Link tujuan tidak sah. Awali dengan https:// (maksimal 500 karakter)." };
  if (!Object.hasOwn(KANAL, String(b.channel))) return { error: "Pilih kanal." };
  const id = String(b.item_id || "").slice(0, 60);
  if (!id) return { error: "Pilih kegiatan atau Program dulu." };
  let it;
  try { [it] = await plannerItems(env, reg, { ids: id }); } catch (e) { console.log("Content Planner:", e.message); return { error: OFFLINE, status: 502 }; }
  if (!it || it.id !== id) return { error: "Kegiatan tidak ditemukan atau tidak bisa kamu pilih." };
  const name = String(b.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60), utm = b.utm !== false;
  for (let i = 0; i < 4; i++) {
    const code = newCode(), final = utm ? utmUrl(target, it.title, b.channel, code) : target;
    const r = await env.DB.prepare("INSERT OR IGNORE INTO links (code, item_id, item_kind, item_title, target, channel, name, utm, created_by, created_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(code, it.id, it.kind, it.title, final, b.channel, name, utm ? 1 : 0, me.n || me.e, me.e, new Date(now(env)).toISOString()).run();
    if (r.meta.changes) return { code, url: linkUrl(env, code), target: final };
  }
  return { error: "Gagal membuat kode link. Coba lagi." };
}
/** Boleh menonaktifkan / mengaktifkan: pembuat, Head (tim mana pun), atau admin hub. */
const canEdit = (me, org, L) => !!me.adm || L.created_email === me.e || !!(roleIn(org, me.j) || {}).head;
/** GET /api/links?item=&mine=1&state=active|off: judul & jenis kegiatan disegarkan dari Content Planner, dan total klik dikirim ulang. */
async function listLinks(env, ctx, me, org, reg, q) {
  const W = [], A = [];
  if (q.get("item")) { W.push("item_id = ?"); A.push(q.get("item")); }
  if (q.get("mine") === "1") { W.push("created_email = ?"); A.push(me.e); }
  if (q.get("state") === "active") W.push("active = 1"); else if (q.get("state") === "off") W.push("active = 0");
  const L = (await env.DB.prepare(`SELECT code, item_id, item_kind, item_title, gone, target, channel, name, utm, active, clicks, created_by, created_email, created_at, off_by, off_at FROM links${W.length ? " WHERE " + W.join(" AND ") : ""} ORDER BY created_at DESC LIMIT 300`).bind(...A).all()).results;
  const ids = [...new Set(L.map((x) => x.item_id))].slice(0, 200);
  if (ids.length) {
    try {
      const P = new Map((await plannerItems(env, false, { ids: ids.join(",") })).map((x) => [x.id, x]));
      await env.DB.batch(ids.map((id) => { const p = P.get(id);
        return p ? env.DB.prepare("UPDATE links SET item_title = ?, item_kind = ?, gone = 0 WHERE item_id = ?").bind(p.title, p.kind, id) : env.DB.prepare("UPDATE links SET gone = 1 WHERE item_id = ?").bind(id); }));
      for (const x of L) if (ids.includes(x.item_id)) { const p = P.get(x.item_id); if (p) Object.assign(x, { item_title: p.title, item_kind: p.kind, gone: 0 }); else x.gone = 1; }
    } catch (e) { console.log("Content Planner:", e.message); }
    ctx.waitUntil(pushClicks(env, ids));
  }
  const links = L.filter((x) => !reg || REG_KINDS.includes(x.item_kind)).map((x) => ({ ...x, url: linkUrl(env, x.code), can: canEdit(me, org, x) }));
  return { links };
}
/** POST /api/links/active: { code, active }. Tujuan link tidak pernah berubah. */
async function setActive(env, me, org, b) {
  const L = await env.DB.prepare("SELECT code, created_email FROM links WHERE code = ?").bind(String(b.code || "")).first();
  if (!L) return { error: "Link tidak ditemukan.", status: 404 };
  if (!canEdit(me, org, L)) return { error: "Hanya pembuat link, Head, atau admin yang bisa mengubah status link.", status: 403 };
  const on = b.active === true;
  await env.DB.prepare("UPDATE links SET active = ?, off_by = ?, off_at = ? WHERE code = ?").bind(on ? 1 : 0, on ? null : me.n || me.e, on ? null : new Date(now(env)).toISOString(), L.code).run();
  return { ok: true };
}
/** GET /api/stats?code= | ?item= &days=30|90: klik per hari (hari tanpa klik = 0), hanya untuk link yang boleh dilihat. */
async function stats(env, reg, q) {
  const days = q.get("days") === "90" ? 90 : 30, code = q.get("code"), item = q.get("item");
  const L = code ? (await env.DB.prepare("SELECT code, item_kind FROM links WHERE code = ?").bind(code).all()).results
    : item ? (await env.DB.prepare("SELECT code, item_kind FROM links WHERE item_id = ?").bind(item).all()).results : [];
  const C = L.filter((x) => !reg || REG_KINDS.includes(x.item_kind)).map((x) => x.code);
  if (!C.length) return { error: "Tidak ditemukan.", status: 404 };
  const end = Date.parse(wibDay(now(env)) + "T00:00:00Z"), from = new Date(end - (days - 1) * 864e5).toISOString().slice(0, 10);
  const R = new Map((await env.DB.prepare(`SELECT day, SUM(n) AS n FROM daily WHERE code IN (${C.map(() => "?").join(",")}) AND day >= ? GROUP BY day`).bind(...C, from).all()).results.map((x) => [x.day, Number(x.n) || 0]));
  return { days: Array.from({ length: days }, (_, i) => { const day = new Date(end - (days - 1 - i) * 864e5).toISOString().slice(0, 10); return { day, n: R.get(day) || 0 }; }) };
}

/* =========================================================
   HALAMAN & API
   ========================================================= */
async function page(env, me, org) {
  const cfg = { me: { name: me.n || me.e, email: me.e, adm: !!me.adm, head: !!(roleIn(org, me.j) || {}).head, reg: isRegional(org, me.j, me.adm) },
    kanal: KANAL, base: appUrl(env, "go") };
  const head_ = `<title>${esc(title(env, "Link & QR Studio"))}</title>${profileScript(env)}${themeHead("", EN)}<script>${HUBSSO.onlyInHub(env)}window.LQ=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script>`;
  return PAGE.replace("<title>Link & QR Studio</title>", () => head_);
}
/** Hasil fungsi API -> respons JSON (status dari { status } atau 400 kalau ada error). */
const out = (r) => { const { status, ...rest } = r; return json(rest, status || (r.error ? 400 : 200)); };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    // pengalih publik lebih dulu: tanpa login, secepat mungkin
    const m = CODE_RE.exec(path);
    if (m && (request.method === "GET" || request.method === "HEAD")) return redirect(request, env, ctx, m[1].toLowerCase());
    if (path === "/__hub/users") {
      if (!hubPushAllowed(request, env)) return new Response("forbidden", { status: 403 });
      return json(await syncFromHub(env, await request.json().catch(() => ({}))));
    }
    if (path === "/logout") return HUBSSO.logout(env);
    if (!HUBSSO.ready(env)) return HUBSSO.notReady();
    const tk = await HUBSSO.ticket(request, env); if (tk) return tk;
    const sess = await HUBSSO.user(request, env);
    if (!sess) return path.startsWith("/api/") ? json({ error: "Sesi habis. Muat ulang halaman." }, 401) : HUBSSO.login(request, env);
    await ensure(env);
    const me = await whoAmI(env, sess), org = await getOrg(env), reg = isRegional(org, me.j, me.adm);
    if (path === "/" || path === "/index.html") return new Response(await page(env, me, org), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": HUBSSO.frame(env), "x-robots-tag": "noindex" } });
    try {
      if (request.method !== "GET" && !HUBSSO.sameOrigin(request)) return json({ error: "Permintaan ditolak." }, 403);
      if (request.method === "GET") {
        if (path === "/api/items") {
          // Content Planner menerapkan aturan regional; regional ditentukan dari tiket Tool Hub
          const id = String(url.searchParams.get("id") || "").slice(0, 60), s = String(url.searchParams.get("q") || "").trim().slice(0, 60);
          try {
            if (id) { const [it] = await plannerItems(env, reg, { ids: id }); return it && it.id === id ? json({ item: it }) : json({ error: "Kegiatan tidak ditemukan." }, 404); }
            return json({ items: await plannerItems(env, reg, s ? { q: s } : {}) });
          } catch (e) {
            console.log("Content Planner:", e.message);
            return id ? json({ error: OFFLINE }, 502) : json({ items: [], off: true });
          }
        }
        if (path === "/api/links") return out(await listLinks(env, ctx, me, org, reg, url.searchParams));
        if (path === "/api/stats") return out(await stats(env, reg, url.searchParams));
      }
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        if (path === "/api/links") return out(await createLink(env, me, reg, b));
        if (path === "/api/links/active") return out(await setActive(env, me, org, b));
      }
    } catch (e) {
      return json({ error: "Gagal: " + (e.message || e) }, 500);
    }
    return new Response("Tidak ditemukan", { status: 404 });
  },
};
