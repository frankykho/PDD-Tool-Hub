// Feature Intelligence — Cloudflare Worker: fitur aplikasi kompetitor (Stockbit, IPOT) dibandingkan dengan iKISI,
// lalu jadi report management (PDF) dan BRD untuk IT (Word, template F-IT-BRD-0624-00). Login lewat Tool Hub (app "feature").
// - "/"        -> halaman (hanya di dalam dashboard Tool Hub)
// - "/api/*"   -> data; viewer hanya membaca, editor menambah/verifikasi/BRD/report, admin + kompetitor & scan
// - "/__cron"  -> dipanggil apps/cron (Minggu :00/:30 UTC) lewat shared/cron.js
// DB = insight-db (dipakai bersama Competitor Intelligence, Content Insight, Fund, ETF, Planner); semua tabel berawalan ft_.
// ci_content (Content Insight) hanya DIBACA untuk caption Instagram kompetitor.
import { title, profileScript } from "../../shared/profile.js";
import { withCron } from "../../shared/cron.js";
import { themeHead } from "../../shared/theme.js";
import EN from "./i18n.js";
import PAGE from "./page.html";

/* =========================================================
   LOGIN LEWAT TOOL HUB (sama dengan Competitor Intelligence)
   ========================================================= */
const HUBSSO = (() => {
  const APP = "feature", COOKIE = "hub_" + APP, HOURS = 2, te = new TextEncoder();
  // SameSite=None + Partitioned: cookie tetap terkirim saat tool tampil di dalam dashboard Tool Hub (bingkai).
  // Karena itu permintaan yang MENGUBAH data wajib lolos sameOrigin() di bawah.
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
  const hub = (env) => (env.HUB_URL || "").replace(/\/+$/, "");
  const go = (to, extra = {}) => new Response(null, { status: 303, headers: { location: to, "cache-control": "no-store", ...extra } });
  return {
    ready: (env) => String(env.SSO_SECRET || "").length >= 32,
    notReady: () => new Response("Tool ini belum dikonfigurasi: pasang secret SSO_SECRET (sama dengan di Tool Hub).", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } }),
    /** Kembali dari hub membawa ?hub_t=... -> tukar dengan cookie sesi 2 jam. null kalau alamat tidak membawa tiket. */
    // ponytail: akses yang dicabut di hub terasa paling lambat 2 jam; perpendek HOURS bila perlu lebih cepat
    async ticket(request, env) {
      const url = new URL(request.url), t = url.searchParams.get("hub_t");
      if (!t) return null;
      const p = await open(env, t); url.searchParams.delete("hub_t");
      if (!p) return go(url.pathname + url.search);
      const body = b64(te.encode(JSON.stringify({ ...p, x: Date.now() + HOURS * 3600e3 })));
      return go(url.pathname + url.search, { "set-cookie": `${COOKIE}=${body}.${await sign(env.SSO_SECRET, body)}; ${CK}; Max-Age=${HOURS * 3600}` });
    },
    /** Pengguna dari cookie: { e: email, n: nama, u: username, a: hak akses, adm: admin hub } atau null. */
    async user(request, env) {
      const m = (request.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
      return m ? open(env, m[1]) : null;
    },
    login: (request, env, path) => { const url = new URL(request.url); return go(`${hub(env)}/sso?app=${APP}&back=${encodeURIComponent(url.origin + (path || url.pathname + url.search))}`); },
    logout: (env) => go(hub(env) + "/logout", { "set-cookie": `${COOKIE}=; ${CK}; Max-Age=0` }),
    /** Permintaan yang mengubah data hanya boleh datang dari halaman tool ini sendiri (cegah CSRF). */
    sameOrigin: (request) => { const o = request.headers.get("origin"); return !o || o === new URL(request.url).origin; },
    /** Halaman aplikasi hanya dipakai di dalam dashboard: dibuka langsung -> pindah ke tab-nya di hub. */
    onlyInHub: (env) => `if(window.top===window.self)location.replace(${JSON.stringify(hub(env) + "/#" + APP)});`,
    frame: (env) => `frame-ancestors 'self' ${hub(env)}`,
  };
})();
const ROLES = ["admin", "editor", "viewer"];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const json = (v, status = 200) => Response.json(v, { status, headers: { "cache-control": "no-store" } });

/* =========================================================
   TABEL (insight-db, awalan ft_)
   ========================================================= */
export const FT = {
  AREAS: ["Saham", "Reksa Dana", "Obligasi/SBN", "Akun & Onboarding", "Pembayaran/RDN", "Riset & Konten", "Lainnya"],
  IKISI: ["Sudah ada", "Sebagian", "Belum ada"],
  DECISIONS: ["Kejar", "Pantau", "Abaikan"],
  PRIOS: ["H", "M", "L"],
  EV_STATUS: ["Perlu verifikasi", "Terverifikasi", "Ditolak"],
  BRD_STATUS: ["Draf", "Diserahkan ke IT", "Disetujui", "Dibatalkan"],
  BRD_VERSION: "1.0 – Draft untuk direview",
};
// id aplikasi dicek 2026-11-06 (App Store search & Play Store); akun IG = dugaan, Pengaturan memberi tanda bila tidak ada di ci_content
const SEED = [
  { id: "stockbit", name: "Stockbit", play_id: "com.stockbit.android", appstore_id: "1184800207", ig_account: "stockbit" },
  { id: "ipot", name: "IPOT", play_id: "com.indopremier.ipot", appstore_id: "1514387216", ig_account: "indopremier" },
];
export async function ftMigrate(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS ft_competitors (id TEXT PRIMARY KEY, name TEXT NOT NULL, play_id TEXT, appstore_id TEXT, ig_account TEXT, enabled INTEGER DEFAULT 1)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS ft_features (id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT, description TEXT, ikisi_status TEXT DEFAULT 'Belum ada', decision TEXT, priority TEXT, notes TEXT, created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS ft_evidence (id TEXT PRIMARY KEY, feature_id TEXT, competitor_id TEXT NOT NULL, source TEXT NOT NULL, url TEXT, text TEXT, image_data TEXT, launched_at TEXT, ai_json TEXT, status TEXT DEFAULT 'Perlu verifikasi', hash TEXT UNIQUE, created_by TEXT, created_at TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS ft_brds (id TEXT PRIMARY KEY, title TEXT NOT NULL, feature_ids TEXT, brief TEXT, sections TEXT, version TEXT, status TEXT DEFAULT 'Draf', created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS ft_meta (k TEXT PRIMARY KEY, v TEXT)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS ft_evidence_feature ON ft_evidence (feature_id)"),
    ...SEED.map((c) => env.DB.prepare("INSERT OR IGNORE INTO ft_competitors (id, name, play_id, appstore_id, ig_account, enabled) VALUES (?, ?, ?, ?, ?, 1)").bind(c.id, c.name, c.play_id, c.appstore_id, c.ig_account)),
  ]);
}
let ready = false, retryAt = 0;
// Persiapan tabel ikut MENULIS ke D1. Kalau ditolak (mis. kuota tulis harian habis), data tetap bisa dibaca; dicoba lagi 10 menit kemudian.
async function ensure(env) {
  if (ready || Date.now() < retryAt) return;
  try { await ftMigrate(env); ready = true; }
  catch (e) { retryAt = Date.now() + 10 * 60e3; console.log("ftMigrate gagal, data tetap dibaca:", e.message); }
}

/* =========================================================
   HALAMAN & API
   ========================================================= */
function page(env, me) {
  const head = `<title>${esc(title(env, "Feature Intelligence"))}</title>${profileScript(env)}${themeHead("", EN)}<script>${HUBSSO.onlyInHub(env)}window.FT=${JSON.stringify({ me, ...FT }).replace(/</g, "\\u003c")};</script>`;
  return PAGE.replace("<title>Feature Intelligence</title>", () => head);
}

async function api(req, env, u, me, can) {
  const path = u.pathname;
  if (req.method === "GET" && path === "/api/me") return json({ name: me.name, role: me.role });
  if (req.method !== "GET" && !can("editor")) return json({ error: "Hanya editor atau admin yang bisa mengubah data." }, 403);
  return json({ error: "Tidak ditemukan" }, 404);
}

async function scheduled() {}

export default withCron({
  scheduled,
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (!HUBSSO.ready(env)) return HUBSSO.notReady();
    const tk = await HUBSSO.ticket(req, env); if (tk) return tk;
    if (u.pathname === "/login") return HUBSSO.login(req, env, "/");
    if (u.pathname === "/logout") return HUBSSO.logout(env);
    // peran (viewer / editor / admin) datang dari Tool Hub; admin hub selalu admin di sini
    const hu = await HUBSSO.user(req, env), hr = hu ? (hu.adm ? "admin" : hu.a) : null;
    const me = hu && ROLES.includes(hr) ? { u: hu.u || hu.e, name: hu.n || hu.u || hu.e, role: hr } : null;
    // admin boleh semua; editor juga boleh yang boleh viewer
    const can = (role) => !!me && (me.role === "admin" || me.role === role || (role === "viewer" && me.role === "editor"));
    // permintaan yang mengubah data hanya dari halaman ini sendiri (cookie sesi bisa terkirim dari dalam bingkai Tool Hub)
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !HUBSSO.sameOrigin(req)) return json({ error: "Permintaan ditolak." }, 403);
    try {
      if (u.pathname === "/" || u.pathname === "/index.html") {
        if (!me) return HUBSSO.login(req, env);
        await ensure(env);
        return new Response(page(env, me), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": HUBSSO.frame(env), "x-robots-tag": "noindex" } });
      }
      if (u.pathname.startsWith("/api/")) {
        if (!me) return json({ error: "Sesi habis. Muat ulang halaman." }, 401);
        await ensure(env);
        return await api(req, env, u, me, can);
      }
      return new Response("Tidak ditemukan", { status: 404 });
    } catch (e) {
      if (/daily row write limit/i.test(e.message)) return json({ error: "Kuota tulis database harian (paket gratis Cloudflare) sudah habis. Data tetap bisa dilihat; perubahan & scan bisa dijalankan lagi setelah pukul 07.00 WIB." }, 503);
      return json({ error: "Gagal: " + e.message }, 500);
    }
  },
});
