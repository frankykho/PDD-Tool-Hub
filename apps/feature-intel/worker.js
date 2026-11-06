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

/* ---------- fitur, bukti, kompetitor ---------- */
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const s = (v, max) => (typeof v === "string" || typeof v === "number" ? String(v) : "").trim().slice(0, max);
const IMG_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, IMG_MAX = 700 * 1024;
/** Nilai satu isian yang sudah dirapikan, atau null bila tidak sah (pilihan di luar daftar, tanggal/url salah bentuk). */
export function ftClean(field, value) {
  const v = s(value, field === "image_data" ? IMG_MAX + 1 : 2000);
  switch (field) {
    case "name": return v ? v.slice(0, 160) : null;
    case "description": case "notes": return v;
    case "area": return FT.AREAS.includes(v) ? v : null;
    case "ikisi_status": return FT.IKISI.includes(v) ? v : null;
    case "decision": return v === "" || FT.DECISIONS.includes(v) ? v : null;
    case "priority": return v === "" || FT.PRIOS.includes(v) ? v : null;
    case "launched_at": return /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : null;
    case "url": return v === "" || /^https?:\/\/[^\s]+$/i.test(v) ? v.slice(0, 600) : null;
    case "image_data": return v === "" || (v.length <= IMG_MAX && IMG_RE.test(v)) ? v : null;
    default: return null;
  }
}
const FEATURE_EDIT = ["name", "area", "description", "ikisi_status", "decision", "priority", "notes"];
const LABEL = { name: "nama fitur", area: "area", launched_at: "tanggal peluncuran (YYYY-MM-DD)", url: "link (http/https)", image_data: "gambar (PNG/JPEG/WebP, maks. 700 KB)",
  ikisi_status: "status iKISI", decision: "keputusan", priority: "prioritas", description: "deskripsi", notes: "catatan" };
/** Ambil isian dari body; { error } bila ada yang tidak sah. required = isian yang wajib terisi. */
function pick(b, fields, required = []) {
  const out = {};
  for (const k of fields) {
    if (b[k] === undefined && !required.includes(k)) continue;
    const v = ftClean(k, b[k]);
    if (v === null || (required.includes(k) && v === "")) return { error: "Isian tidak sah: " + LABEL[k] };
    out[k] = v;
  }
  return out;
}
async function competitorOk(env, id) {
  return !!(await env.DB.prepare("SELECT 1 FROM ft_competitors WHERE id=?").bind(s(id, 60)).first());
}
async function newFeature(env, me, f) {
  const id = uid(), t = now();
  await env.DB.prepare("INSERT INTO ft_features (id, name, area, description, ikisi_status, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, 'Belum ada', ?, ?, ?, ?)")
    .bind(id, f.name, f.area, f.description || "", me.name, t, me.name, t).run();
  return id;
}
/** Daftar fitur + kompetitor mana yang sudah punya (dari bukti Terverifikasi: tanggal peluncuran paling awal). */
async function listFeatures(env, q) {
  const where = [], args = [];
  for (const k of ["area", "decision", "priority"]) { const v = s(q.get(k), 40); if (v) { where.push(k + "=?"); args.push(v); } }
  const [fs, ev, cs] = await env.DB.batch([
    env.DB.prepare(`SELECT id, name, area, description, ikisi_status, decision, priority, notes, updated_by, updated_at FROM ft_features${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY area, name`).bind(...args),
    env.DB.prepare("SELECT feature_id, competitor_id, MIN(launched_at) AS d FROM ft_evidence WHERE status='Terverifikasi' AND feature_id IS NOT NULL GROUP BY feature_id, competitor_id"),
    env.DB.prepare("SELECT id, name FROM ft_competitors WHERE enabled=1 ORDER BY name"),
  ]);
  const has = {};
  for (const r of ev.results) (has[r.feature_id] ||= {})[r.competitor_id] = r.d;
  return { features: fs.results.map((f) => ({ ...f, has: has[f.id] || {} })), competitors: cs.results };
}
const EV_COLS = "e.id, e.feature_id, e.competitor_id, c.name AS competitor, e.source, e.url, e.text, e.image_data, e.launched_at, e.ai_json, e.status, e.created_by, e.created_at";
async function addManual(env, me, b) {
  const f = pick(b, ["name", "area", "description", "launched_at", "url", "image_data"], ["name", "area", "launched_at"]);
  if (f.error) return { error: f.error };
  if (!f.url && !f.image_data) return { error: "Isi link sumber, atau unggah screenshot sebagai bukti." };
  if (!(await competitorOk(env, b.competitor_id))) return { error: "Kompetitor tidak dikenal." };
  const feature_id = await newFeature(env, me, f), id = uid();
  await env.DB.prepare("INSERT INTO ft_evidence (id, feature_id, competitor_id, source, url, text, image_data, launched_at, status, hash, created_by, created_at) VALUES (?, ?, ?, 'manual', ?, ?, ?, ?, 'Terverifikasi', ?, ?, ?)")
    .bind(id, feature_id, s(b.competitor_id, 60), f.url || "", f.description || "", f.image_data || "", f.launched_at, "manual:" + id, me.name, now()).run();
  return { id, feature_id };
}
/** Temuan scan: gabung ke fitur yang ada / jadikan fitur baru / tolak. Tanggal peluncuran wajib saat disetujui. */
async function verify(env, me, b) {
  const ev = await env.DB.prepare("SELECT id, status FROM ft_evidence WHERE id=?").bind(s(b.id, 60)).first();
  if (!ev) return { error: "Temuan tidak ditemukan.", status: 404 };
  if (ev.status !== "Perlu verifikasi") return { error: "Temuan ini sudah diproses." };
  if (b.action === "reject") {
    await env.DB.prepare("UPDATE ft_evidence SET status='Ditolak' WHERE id=?").bind(ev.id).run();
    return { ok: true };
  }
  const d = pick(b, ["launched_at"], ["launched_at"]);
  if (d.error) return { error: d.error };
  let feature_id;
  if (b.action === "merge") {
    feature_id = s(b.feature_id, 60);
    if (!(await env.DB.prepare("SELECT 1 FROM ft_features WHERE id=?").bind(feature_id).first())) return { error: "Fitur tujuan tidak ditemukan." };
  } else if (b.action === "new") {
    const f = pick(b, ["name", "area", "description"], ["name", "area"]);
    if (f.error) return { error: f.error };
    feature_id = await newFeature(env, me, f);
  } else return { error: "Aksi tidak dikenal." };
  await env.DB.prepare("UPDATE ft_evidence SET status='Terverifikasi', feature_id=?, launched_at=? WHERE id=? AND status='Perlu verifikasi'").bind(feature_id, d.launched_at, ev.id).run();
  return { ok: true, feature_id };
}
async function patchFeature(env, me, b) {
  const f = pick(b, FEATURE_EDIT);
  if (f.error) return { error: f.error };
  const keys = Object.keys(f);
  if (!keys.length) return { error: "Tidak ada yang diubah." };
  const r = await env.DB.prepare(`UPDATE ft_features SET ${keys.map((k) => k + "=?").join(", ")}, updated_by=?, updated_at=? WHERE id=?`)
    .bind(...keys.map((k) => f[k]), me.name, now(), s(b.id, 60)).run();
  return r.meta && r.meta.changes === 0 ? { error: "Fitur tidak ditemukan.", status: 404 } : { ok: true };
}
async function saveCompetitor(env, b) {
  const name = s(b.name, 80);
  if (!name) return { error: "Isi nama kompetitor." };
  const id = s(b.id, 60) || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || uid();
  await env.DB.prepare("INSERT INTO ft_competitors (id, name, play_id, appstore_id, ig_account, enabled) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, play_id=excluded.play_id, appstore_id=excluded.appstore_id, ig_account=excluded.ig_account, enabled=excluded.enabled")
    .bind(id, name, s(b.play_id, 120), s(b.appstore_id, 20).replace(/\D/g, ""), s(b.ig_account, 60).replace(/^@/, "").toLowerCase(), b.enabled === 0 || b.enabled === false ? 0 : 1).run();
  return { id };
}

/** Hasil fungsi -> respons JSON (status dari { status }, atau 400 kalau ada error). */
const out = (r) => { const { status, ...rest } = r; return json(rest, status || (r.error ? 400 : 200)); };
async function api(req, env, u, me, can) {
  const path = u.pathname, m = req.method;
  if (m === "GET") {
    if (path === "/api/me") return json({ name: me.name, role: me.role });
    if (path === "/api/features") return json(await listFeatures(env, u.searchParams));
    if (path.startsWith("/api/features/")) {
      const id = decodeURIComponent(path.slice(14));
      const feature = await env.DB.prepare("SELECT * FROM ft_features WHERE id=?").bind(id).first();
      if (!feature) return json({ error: "Fitur tidak ditemukan." }, 404);
      const ev = await env.DB.prepare(`SELECT ${EV_COLS} FROM ft_evidence e LEFT JOIN ft_competitors c ON c.id=e.competitor_id WHERE e.feature_id=? AND e.status='Terverifikasi' ORDER BY e.launched_at`).bind(id).all();
      return json({ feature, evidence: ev.results });
    }
    if (path === "/api/evidence") {
      const st = FT.EV_STATUS.includes(u.searchParams.get("status")) ? u.searchParams.get("status") : "Perlu verifikasi";
      const ev = await env.DB.prepare(`SELECT ${EV_COLS} FROM ft_evidence e LEFT JOIN ft_competitors c ON c.id=e.competitor_id WHERE e.status=? ORDER BY e.created_at DESC LIMIT 200`).bind(st).all();
      return json({ evidence: ev.results });
    }
    if (path === "/api/competitors") return json({ competitors: (await env.DB.prepare("SELECT * FROM ft_competitors ORDER BY name").all()).results });
    return json({ error: "Tidak ditemukan" }, 404);
  }
  if (!can("editor")) return json({ error: "Hanya editor atau admin yang bisa mengubah data." }, 403);
  const b = await req.json().catch(() => ({}));
  if (m === "POST" && path === "/api/evidence") return out(await addManual(env, me, b));
  if (m === "POST" && path === "/api/evidence/verify") return out(await verify(env, me, b));
  if (m === "POST" && path === "/api/features") {
    const f = pick(b, ["name", "area", "description"], ["name", "area"]);
    return out(f.error ? f : { id: await newFeature(env, me, f) });
  }
  if (m === "PATCH" && path === "/api/features") return out(await patchFeature(env, me, b));
  if (path === "/api/competitors" && m === "POST") return can("admin") ? out(await saveCompetitor(env, b)) : json({ error: "Hanya admin yang bisa mengatur kompetitor." }, 403);
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
