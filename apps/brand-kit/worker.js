// Brand Kit — Cloudflare Worker
// Satu tempat untuk materi resmi: template terkunci (cabang mengisi nama cabang, tanggal, tempat, narasumber, QR lalu unduh PNG / PDF),
// file resmi dari folder Google Drive, dan teks disclaimer resmi (ikut dikirim ke Copy Studio & Edukasi Studio).
// - "/"                -> halaman (di dalam Tool Hub)
// - "/api/*"           -> data (login lewat Tool Hub)
// - "/__hub/users" (POST) -> anggota, daftar cabang, dan tim & role dari Tool Hub
// Hak akses: semua pemegang akses memakai template, mengunduh, menambah narasumber; admin hub mengatur template, disclaimer, folder Drive.
import { hubPushAllowed } from "../../shared/hubfeed.js";
import { title, profileScript, appUrl, profile } from "../../shared/profile.js";
import { themeHead } from "../../shared/theme.js";
import EN from "./i18n.js";
import PAGE from "./page.html";
import { cleanOrg, roleIn } from "../../shared/jobs.js";

/* =========================================================
   LOGIN LEWAT TOOL HUB
   ========================================================= */
const HUBSSO = (() => {
  const APP = "brand", COOKIE = "hub_" + APP, HOURS = 8, te = new TextEncoder();
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
   AKSES & PRESET
   ========================================================= */
/** Boleh mengubah / menghapus narasumber: pembuatnya, Head tim mana pun, atau admin hub. */
export function canEditSpeaker(me, sp, org) {
  if (!me || !sp) return false;
  if (me.adm || (roleIn(org, me.j) || {}).head) return true;
  return !!sp.created_by && sp.created_by === String(me.e || "").toLowerCase();
}
// ukuran template; ukuran cetak sudah termasuk bleed 3 mm per sisi (A4 300 dpi, A3 300 dpi, X-banner 100 dpi)
export const SIZES = {
  story: { label: "Story", w: 1080, h: 1920, print: false, mm: null },
  feed45: { label: "Feed 4:5", w: 1080, h: 1350, print: false, mm: null },
  feed11: { label: "Feed persegi", w: 1080, h: 1080, print: false, mm: null },
  a4: { label: "A4", w: 2551, h: 3579, print: true, mm: [216, 303] },
  a3: { label: "A3", w: 3579, h: 5031, print: true, mm: [303, 426] },
  xbanner: { label: "X-banner 60×160", w: 2386, h: 6323, print: true, mm: [606, 1606] },
};
export const DISC_KEYS = [["umum", "Umum"], ["reksadana", "Reksa Dana"], ["obligasi", "Obligasi"], ["syariah", "Syariah"], ["edukasi", "Edukasi"], ["singkat", "Singkat"]];
export const FONTS = ["Montserrat", "Poppins", "Inter", "Open Sans"];

/* =========================================================
   DATA (D1: brand-db, KV: gambar latar template)
   ========================================================= */
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch([
    // pengaturan: users, branches, org (dari Tool Hub), drive_folder, push (status kiriman disclaimer)
    env.DB.prepare("CREATE TABLE IF NOT EXISTS cfg (k TEXT PRIMARY KEY, v TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS disclaimers (key TEXT PRIMARY KEY, label TEXT, text TEXT, sort INTEGER, updated_at TEXT, updated_by TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS disc_history (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT, text TEXT, at TEXT, by_name TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, name TEXT, status TEXT, created_at TEXT, updated_at TEXT, updated_by TEXT)"),
    // satu template banyak ukuran; logo / disc / slots = JSON
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sizes (id TEXT PRIMARY KEY, template_id TEXT, kind TEXT, sort INTEGER, has_bg INTEGER DEFAULT 0, dark INTEGER DEFAULT 0, logo TEXT, disc TEXT, slots TEXT)"),
    // narasumber bersama semua cabang; photo = JPEG base64 (±60 KB)
    env.DB.prepare("CREATE TABLE IF NOT EXISTS speakers (id TEXT PRIMARY KEY, name TEXT, title TEXT, photo TEXT, created_by TEXT, created_name TEXT, created_at TEXT, updated_at TEXT)"),
    // catatan unduhan (untuk Laporan KPI)
    env.DB.prepare("CREATE TABLE IF NOT EXISTS downloads (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, email TEXT, branch TEXT, template_id TEXT, kind TEXT, event_id TEXT)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS sizes_tpl ON sizes (template_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS downloads_at ON downloads (at)"),
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
export const getOrg = async (env) => cleanOrg(await cfgGet(env, "org"));
/** Daftar regional & cabang/galeri dari Tool Hub: [{ r, c, t }]. */
export const getBranches = async (env) => { const B = await cfgGet(env, "branches"); return Array.isArray(B) ? B : []; };
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
const iso = (env) => new Date(now(env)).toISOString();
const ABC = "abcdefghijkmnpqrstuvwxyz23456789";
const newId = () => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => ABC[x % ABC.length]).join("");
/** Sesi + cabang: tiket lama tanpa cabang memakai cabang di daftar anggota dari Tool Hub. */
async function whoAmI(env, me) {
  const e = lower(me.e);
  if (me.c) return { ...me, e };
  const U = (await cfgGet(env, "users")) || [], u = U.find((x) => x.email === e);
  return { ...me, e, c: (u && u.branch) || "" };
}
/** Halaman: data awal (window.BK) + tema & bahasa dari Tool Hub. */
async function page(env, me, org) {
  const cfg = { me: { name: me.n || me.e, email: me.e, adm: !!me.adm, head: !!(roleIn(org, me.j) || {}).head, branch: me.c || "" },
    sizes: SIZES, fonts: FONTS, disc: DISC_KEYS, event: appUrl(env, "event") || "" };
  const head_ = `<title>${esc(title(env, "Brand Kit"))}</title>${profileScript(env)}${themeHead("", EN)}<script>${HUBSSO.onlyInHub(env)}window.BK=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script>`;
  return PAGE.replace("<title>Brand Kit</title>", () => head_);
}
/** Hasil fungsi API -> respons JSON (status dari { status } atau 400 kalau ada error). */
const out = (r) => { const { status, ...rest } = r; return json(rest, status || (r.error ? 400 : 200)); };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    if (path === "/__hub/users") {
      if (!hubPushAllowed(request, env)) return new Response("forbidden", { status: 403 });
      return json(await syncFromHub(env, await request.json().catch(() => ({}))));
    }
    if (path === "/logout") return HUBSSO.logout(env);
    if (!HUBSSO.ready(env)) return HUBSSO.notReady();
    const tk = await HUBSSO.ticket(request, env); if (tk) return tk;
    const sess = await HUBSSO.user(request, env);
    if (!sess) return path.startsWith("/api/") || path.startsWith("/bg/") || path.startsWith("/photo/") ? json({ error: "Sesi habis. Muat ulang halaman." }, 401) : HUBSSO.login(request, env);
    await ensure(env);
    const me = await whoAmI(env, sess), org = await getOrg(env);
    if (path === "/" || path === "/index.html") return new Response(await page(env, me, org), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": HUBSSO.frame(env), "x-robots-tag": "noindex" } });
    try {
      if (request.method !== "GET" && !HUBSSO.sameOrigin(request)) return json({ error: "Permintaan ditolak." }, 403);
    } catch (e) {
      return json({ error: "Gagal: " + (e.message || e) }, 500);
    }
    return new Response("Tidak ditemukan", { status: 404 });
  },
};
