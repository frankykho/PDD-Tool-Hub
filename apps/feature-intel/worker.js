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
import { ai, AiError } from "../../shared/ai.js";
import { BRD_AI_KEYS, BRD_VERSION, brdParse, brdSkeleton } from "./brd.js";
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
  BRD_VERSION,
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

/* ---------- scan: Instagram (data Content Insight), App Store, Play Store ---------- */
async function getMeta(env, k) { const r = await env.DB.prepare("SELECT v FROM ft_meta WHERE k=?").bind(k).first(); return r ? r.v : null; }
const setMeta = (env, k, v) => env.DB.prepare("INSERT OR REPLACE INTO ft_meta (k, v) VALUES (?, ?)").bind(k, String(v)).run();
export const ftHash = (competitorId, source, key) => competitorId + ":" + source + ":" +
  Array.from(String(key)).reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261).toString(16);
// kata yang tersisa setelah kata-kata "perbaikan bug / peningkatan performa" dibuang; kosong = catatan rilis tanpa fitur
const BUGFIX_WORDS = new Set(("bug bugs fix fixes fixed fixing perbaikan memperbaiki diperbaiki beberapa berbagai dan and serta & peningkatan meningkatkan ditingkatkan " +
  "performa kinerja stabilitas kestabilan aplikasi app performance improvement improvements improve stability minor kami we the our to of for with untuk dari pada " +
  "pengalaman experience lebih better baik versi version ini this new terbaru pembaruan update updates yang di in umum general tweaks enhancements kecil small issues masalah").split(" "));
export function ftIsBugfixOnly(text) {
  return String(text || "").toLowerCase().split(/[^a-z0-9&]+/).filter((w) => w && !BUGFIX_WORDS.has(w)).length === 0;
}
export function ftAppStore(j) {
  const r = j && Array.isArray(j.results) && j.results[0];
  return r && r.version ? { version: String(r.version), notes: String(r.releaseNotes || ""), date: String(r.currentVersionReleaseDate || "").slice(0, 10) } : null;
}
const decode = (t) => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
/** Teks bagian "Yang baru" / "What's new" dari halaman aplikasi Play Store; "" bila tidak ketemu. */
export function ftPlayNotes(html) {
  const h = String(html || ""), i = h.search(/>\s*(Yang baru|What(?:&#39;|’|')s new)\s*</i);
  if (i < 0) return "";
  const m = h.slice(i).match(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/);
  return m ? decode(m[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[⁠​]/g, "").trim() : "";
}
function aiJson(raw) {
  const t = String(raw || ""), a = t.indexOf("{"), b = t.lastIndexOf("}");
  try { return a >= 0 && b > a ? JSON.parse(t.slice(a, b + 1)) : null; } catch { return null; }
}
const aiFeature = (x) => {
  const name = s(x && x.name, 160);
  if (!name) return null;
  return { name, area: FT.AREAS.includes(x.area) ? x.area : "Lainnya", description: s(x.description, 600), merge_id: s(x.merge_id, 60) || null };
};
/** Jawaban AI untuk satu caption IG: { feature: false } atau { feature: true, name, area, description, merge_id }. */
export function ftAiVerdict(raw) {
  const j = aiJson(raw), f = j && j.feature === true ? aiFeature(j) : null;
  return f ? { feature: true, ...f } : { feature: false };
}
/** Jawaban AI untuk catatan rilis: daftar fitur (bisa kosong). */
export function ftAiFeatures(raw) {
  const j = aiJson(raw);
  return (j && Array.isArray(j.features) ? j.features : []).map(aiFeature).filter(Boolean).slice(0, 12);
}
const aiLimit = (env) => Number(env.FT_AI_DAILY ?? 30);
async function aiTake(env) {
  const day = new Date().toISOString().slice(0, 10);
  let c = { d: day, n: 0 };
  try { const x = JSON.parse(await getMeta(env, "ft_ai_day")); if (x.d === day) c = x; } catch {}
  if (c.n >= aiLimit(env)) return false;
  c.n++;
  await setMeta(env, "ft_ai_day", JSON.stringify(c));
  return true;
}
const NOT_FEATURE = "promo, hadiah, cashback, kompetisi, edukasi, berita/analisis pasar, webinar, event, rekrutmen, ucapan hari besar";
const IG_RULES = `Kamu analis produk aplikasi investasi di Indonesia. Tentukan apakah caption Instagram ini mengumumkan FITUR APLIKASI (fungsi, menu, layar, atau produk yang baru/diperbarui di aplikasi), bukan ${NOT_FEATURE}.
Jangan mengarang: pakai hanya isi caption. Kalau fitur yang sama sudah ada di daftar, isi merge_id dengan id-nya.
Jawab JSON saja: {"feature":true,"name":"nama fitur singkat","area":"salah satu: ${FT.AREAS.join(" / ")}","description":"1-2 kalimat dari caption","merge_id":null} atau {"feature":false,"reason":"..."}`;
const STORE_RULES = `Kamu analis produk aplikasi investasi di Indonesia. Dari catatan rilis aplikasi, daftar FITUR yang baru atau diperbarui. Lewati perbaikan bug, peningkatan performa, dan perubahan teknis yang tidak terlihat pengguna.
Jangan mengarang: pakai hanya isi catatan rilis. Kalau fitur yang sama sudah ada di daftar, isi merge_id dengan id-nya.
Jawab JSON saja: {"features":[{"name":"nama fitur singkat","area":"salah satu: ${FT.AREAS.join(" / ")}","description":"1 kalimat","merge_id":null}]} (boleh kosong).`;
async function knownList(env) {
  return (await env.DB.prepare("SELECT id, name FROM ft_features ORDER BY updated_at DESC LIMIT 150").all()).results.map((f) => `${f.id}: ${f.name}`).join("\n") || "(belum ada)";
}
async function addPending(env, competitorId, source, key, row) {
  const r = await env.DB.prepare("INSERT OR IGNORE INTO ft_evidence (id, competitor_id, source, url, text, launched_at, ai_json, status, hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'Perlu verifikasi', ?, 'Scan otomatis', ?)")
    .bind(uid(), competitorId, source, row.url || "", s(row.text, 4000), row.launched_at || null, JSON.stringify(row.ai), ftHash(competitorId, source, key), now()).run();
  return r.meta && r.meta.changes ? 1 : 0;
}
const IG_BATCH = 10;
async function scanIg(env, comps, known) {
  const byAcc = Object.fromEntries(comps.filter((c) => c.ig_account).map((c) => [c.ig_account.toLowerCase(), c]));
  const accs = Object.keys(byAcc);
  if (!accs.length) return { n: 0, more: false };
  const since = (await getMeta(env, "ig_since")) || "";
  const rows = (await env.DB.prepare(`SELECT url, account, caption, posted_at, saved_at FROM ci_content WHERE platform='Instagram' AND lower(account) IN (${accs.map(() => "?").join(",")}) AND saved_at > ? ORDER BY saved_at LIMIT ${IG_BATCH}`)
    .bind(...accs, since).all()).results;
  let n = 0;
  for (const r of rows) {
    const c = byAcc[r.account.toLowerCase()];
    if (!(await env.DB.prepare("SELECT 1 FROM ft_evidence WHERE hash=?").bind(ftHash(c.id, "ig", r.url)).first())) {
      if (!(await aiTake(env))) return { n, more: true, error: "Batas AI harian tercapai; sisa caption diproses di scan berikutnya." };
      const { text } = await ai(env, IG_RULES, `Kompetitor: ${c.name}\nTanggal posting: ${String(r.posted_at || "").slice(0, 10)}\nFitur yang sudah tercatat (id: nama):\n${known}\n\nCaption:\n${s(r.caption, 3000)}`, 600, undefined, { temperature: 0.2, json: true });
      const v = ftAiVerdict(text);
      if (v.feature) { const { feature, ...sug } = v; n += await addPending(env, c.id, "ig", r.url, { url: r.url, text: r.caption, launched_at: String(r.posted_at || r.saved_at).slice(0, 10), ai: sug }); }
    }
    await setMeta(env, "ig_since", r.saved_at);
  }
  return { n, more: rows.length === IG_BATCH };
}
/** Satu sumber toko aplikasi: get(c) -> { key, notes, date, url } | null. Versi yang sudah diproses dilewati (penanda di ft_meta). */
async function scanStore(env, comps, known, source, get) {
  let n = 0;
  for (const c of comps) {
    const rel = await get(c);
    if (!rel) continue;
    const mk = `${source}_${c.id}`;
    if ((await getMeta(env, mk)) === rel.key) continue;
    if (!ftIsBugfixOnly(rel.notes)) {
      if (!(await aiTake(env))) return { n, error: "Batas AI harian tercapai; dicoba lagi di scan berikutnya." };
      const { text } = await ai(env, STORE_RULES, `Kompetitor: ${c.name}\nSumber: ${source === "appstore" ? "App Store" : "Play Store"}\nFitur yang sudah tercatat (id: nama):\n${known}\n\nCatatan rilis:\n${s(rel.notes, 4000)}`, 1500, undefined, { temperature: 0.2, json: true });
      for (const f of ftAiFeatures(text)) n += await addPending(env, c.id, source, rel.key + ":" + f.name, { url: rel.url, text: rel.notes, launched_at: rel.date, ai: f });
    }
    await setMeta(env, mk, rel.key);
  }
  return { n };
}
const wibToday = () => new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
/** Scan semua sumber; satu sumber gagal tidak menggagalkan yang lain. stores:false = hanya lanjutkan IG yang tertunda. */
export async function ftScan(env, { fetcher = fetch, stores = true } = {}) {
  const comps = (await env.DB.prepare("SELECT * FROM ft_competitors WHERE enabled=1").all()).results;
  const known = await knownList(env), out = {};
  const run = async (src, fn) => {
    try { out[src] = await fn(); } catch (e) { out[src] = { n: 0, error: String((e && e.message) || e).slice(0, 300) }; }
    await setMeta(env, "scan_" + src, JSON.stringify({ at: now(), n: out[src].n, ...(out[src].error ? { error: out[src].error } : {}) }));
  };
  await run("ig", () => scanIg(env, comps, known));
  if (stores) {
    await run("appstore", () => scanStore(env, comps.filter((c) => c.appstore_id), known, "appstore", async (c) => {
      const r = await fetcher(`https://itunes.apple.com/lookup?id=${c.appstore_id}&country=id`);
      if (!r.ok) throw new Error("App Store HTTP " + r.status);
      const a = ftAppStore(await r.json());
      return a && { key: a.version, notes: a.notes, date: a.date || wibToday(), url: `https://apps.apple.com/id/app/id${c.appstore_id}` };
    }));
    await run("playstore", () => scanStore(env, comps.filter((c) => c.play_id), known, "playstore", async (c) => {
      const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(c.play_id)}&hl=id&gl=ID`;
      const r = await fetcher(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; FeatureIntel/1.0)", "accept-language": "id-ID,id;q=0.9" } });
      if (!r.ok) throw new Error("Play Store HTTP " + r.status);
      const notes = ftPlayNotes(await r.text());
      if (!notes) throw new Error("Bagian 'Yang baru' tidak ditemukan di halaman Play Store");
      return { key: ftHash(c.id, "play", notes), notes, date: wibToday(), url };
    }));
  }
  return out;
}

/* ---------- BRD ---------- */
const parseJ = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
async function brdInput(env, ids) {
  const q = ids.map(() => "?").join(",");
  const [fs, ev] = await env.DB.batch([
    env.DB.prepare(`SELECT id, name, area, description, ikisi_status, decision, priority, notes FROM ft_features WHERE id IN (${q})`).bind(...ids),
    env.DB.prepare(`SELECT e.feature_id, c.name AS competitor, e.source, e.url, e.text, e.launched_at FROM ft_evidence e LEFT JOIN ft_competitors c ON c.id=e.competitor_id WHERE e.status='Terverifikasi' AND e.feature_id IN (${q}) ORDER BY e.launched_at`).bind(...ids),
  ]);
  return { features: fs.results, evidence: ev.results };
}
const BRD_RULES = `Kamu Business Analyst di Divisi Digital Business PT Korea Investment and Sekuritas Indonesia (KISI), pemilik aplikasi iKISI.
Tulis isi Business Requirements Document (BRD) untuk tim IT dalam Bahasa Indonesia baku, ringkas, dengan gaya kalimat seperti contoh: kebutuhan memakai kata "harus".
Larangan: jangan mengarang angka bisnis, target, nama orang, tanggal, nomor dokumen, atau fakta kompetitor di luar data yang diberikan. Kalau ada yang belum pasti, jadikan Open Items.
Jangan menulis modul Kebutuhan Data dan Integrasi atau Non-Fungsional (sudah ada sebagai kerangka tetap).
Jawab JSON saja dengan kunci yang diminta. Bentuk: ringkasan: [paragraf]; tujuan, ruang_lingkup, keamanan, open_items: [butir]; kebutuhan: [{"modul":"Modul 1 – ...","rows":[{"pri":"H|M|L","text":"..."}]}] (H = wajib untuk go-live, M = sebaiknya ada, L = fase berikutnya);
definisi: [{"istilah":"...","id":"penjelasan Bahasa Indonesia","en":"English"}] (istilah/teks pop-up baru fitur ini; [] bila tidak ada); kendala: [{"kendala":"...","deskripsi":"..."}]; tambahan: [{"butir":"...","alasan":"..."}]; identitas: {"nama_proyek":"..."}.`;
// cuplikan contoh BRD (few-shot gaya bahasa)
const BRD_EXAMPLE = `Contoh gaya (BRD Reksa Dana iKISI):
Ringkasan Eksekutif: "Proyek ini mengimplementasikan pengalaman Reksa Dana yang telah dirancang pada desain Figma terlampir. Pengembangan ini menghadirkan (1) Product Score ... Tujuan bisnisnya adalah membantu nasabah mengambil keputusan yang lebih baik, meningkatkan tingkat konversi ..., dengan tetap patuh pada ketentuan OJK terkait pemasaran dan pengungkapan risiko."
Modul 2 – Daftar Reksa Dana, Label Syariah, dan Pengurutan:
BR-2.2 H "Label "Syariah" harus ditampilkan pada setiap produk yang sesuai prinsip syariah, menggunakan logo dan posisi label sesuai desain."
BR-2.3 H "Daftar harus menyediakan "Sort by" dengan pilihan: Return 1Y, AUM, dan Product Score. Pengurutan harus diterapkan pada seluruh hasil pencarian di sisi server, tidak hanya pada halaman yang telah dimuat."
BR-2.7 M "Daftar harus mendukung pagination atau infinite scroll dengan status loading, status kosong, dan status error dengan opsi coba lagi."`;
const brdPrompt = (inp, brief, keys, current) => [
  `Tulis bagian: ${keys.join(", ")}.`,
  "Fitur yang akan dibangun di iKISI:\n" + inp.features.map((f) => `- ${f.name} [${f.area}] status iKISI: ${f.ikisi_status}; prioritas: ${f.priority || "-"}; ${f.description || ""}${f.notes ? " Catatan tim: " + f.notes : ""}`).join("\n"),
  "Bukti di kompetitor:\n" + (inp.evidence.map((e) => `- ${e.competitor} (${e.launched_at || "-"}, ${e.source}): ${s(e.text, 600)}`).join("\n") || "-"),
  `Arahan tim: modul iKISI terdampak: ${brief.modul || "-"}; catatan/kebutuhan khusus: ${brief.catatan || "-"}; target pengguna: ${brief.target || "-"}`,
  current ? "Isi BRD saat ini (untuk konteks):\n" + s(JSON.stringify(current), 6000) : "",
  BRD_EXAMPLE,
].filter(Boolean).join("\n\n");
async function brdRow(env, id) {
  const r = await env.DB.prepare("SELECT * FROM ft_brds WHERE id=?").bind(s(id, 60)).first();
  return r && { ...r, feature_ids: parseJ(r.feature_ids, []), brief: parseJ(r.brief, {}), sections: parseJ(r.sections, null) };
}
const saveSections = (env, me, id, sections) => env.DB.prepare("UPDATE ft_brds SET sections=?, updated_by=?, updated_at=? WHERE id=?").bind(JSON.stringify(sections), me.name, now(), id).run();
async function createBrd(env, me, b) {
  const title = s(b.title, 200), ids = [...new Set((Array.isArray(b.feature_ids) ? b.feature_ids : []).map((x) => s(x, 60)).filter(Boolean))].slice(0, 20);
  if (!title) return { error: "Isi judul BRD." };
  if (!ids.length) return { error: "Pilih minimal satu fitur." };
  const inp = await brdInput(env, ids);
  if (inp.features.length !== ids.length) return { error: "Ada fitur yang tidak ditemukan." };
  const brief = { modul: s(b.brief && b.brief.modul, 300), catatan: s(b.brief && b.brief.catatan, 2000), target: s(b.brief && b.brief.target, 300) };
  const id = uid(), t = now();
  await env.DB.prepare("INSERT INTO ft_brds (id, title, feature_ids, brief, sections, version, status, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'Draf', ?, ?, ?, ?)")
    .bind(id, title, JSON.stringify(ids), JSON.stringify(brief), JSON.stringify(brdSkeleton({ title, ...inp })), BRD_VERSION, me.name, t, me.name, t).run();
  return { id };
}
async function patchBrd(env, me, b) {
  const r = await brdRow(env, b.id);
  if (!r) return { error: "BRD tidak ditemukan.", status: 404 };
  const set = {};
  if (b.title !== undefined) { set.title = s(b.title, 200); if (!set.title) return { error: "Isi judul BRD." }; }
  if (b.status !== undefined) { if (!FT.BRD_STATUS.includes(b.status)) return { error: "Status BRD tidak dikenal." }; set.status = b.status; }
  let sec = r.sections;
  if (b.sections !== undefined) sec = brdParse(b.sections, sec);
  if (b.version !== undefined) { set.version = s(b.version, 80); if (!set.version) return { error: "Isi versi BRD." }; sec = { ...sec, identitas: { ...sec.identitas, versi: set.version } }; }
  set.sections = JSON.stringify(sec);
  const keys = Object.keys(set);
  await env.DB.prepare(`UPDATE ft_brds SET ${keys.map((k) => k + "=?").join(", ")}, updated_by=?, updated_at=? WHERE id=?`).bind(...keys.map((k) => set[k]), me.name, now(), r.id).run();
  return { ok: true, sections: sec };
}
/** Draf AI: semua bagian (kerangka disegarkan dari bukti terbaru) atau satu bagian (bagian lain tidak disentuh). */
async function draftBrd(env, me, b) {
  const r = await brdRow(env, b.id);
  if (!r) return { error: "BRD tidak ditemukan.", status: 404 };
  const key = b.key ? s(b.key, 40) : "";
  if (key && !BRD_AI_KEYS.includes(key)) return { error: "Bagian ini kerangka tetap; sunting langsung atau di Word." };
  if (!(await aiTake(env))) return { error: "Batas AI harian tercapai. Coba lagi besok, atau sunting bagian ini langsung.", status: 429 };
  const inp = await brdInput(env, r.feature_ids);
  const { text } = await ai(env, BRD_RULES, brdPrompt(inp, r.brief, key ? [key] : BRD_AI_KEYS, key ? r.sections : null), key ? 2500 : 6000, undefined, { temperature: 0.3, json: true });
  let sec;
  if (key) { const j = parseJ(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1), {}); sec = brdParse({ [key]: j[key] }, r.sections); }
  else sec = brdParse(text, brdSkeleton({ title: r.title, ...inp, version: r.version }));
  await saveSections(env, me, r.id, sec);
  return { sections: sec };
}

/* ---------- report management ---------- */
/** Periode report: bawaan 3 bulan terakhir (WIB). { error } bila tanggal salah. */
function period(from, to) {
  const today = wibToday(), d = new Date(today + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - 3);
  const f = from ? ftClean("launched_at", from) : d.toISOString().slice(0, 10), t = to ? ftClean("launched_at", to) : today;
  if (!f || !t) return { error: "Tanggal periode harus berbentuk YYYY-MM-DD." };
  return f > t ? { error: "Tanggal mulai harus sebelum tanggal selesai." } : { from: f, to: t };
}
async function report(env, q) {
  const p = period(s(q.get("from"), 10), s(q.get("to"), 10));
  if (p.error) return p;
  const [ev, bs] = await env.DB.batch([
    env.DB.prepare("SELECT e.feature_id, f.name AS feature, f.area, c.name AS competitor, e.launched_at, e.url, e.source FROM ft_evidence e JOIN ft_features f ON f.id=e.feature_id LEFT JOIN ft_competitors c ON c.id=e.competitor_id WHERE e.status='Terverifikasi' AND e.launched_at BETWEEN ? AND ? ORDER BY e.launched_at, c.name").bind(p.from, p.to),
    env.DB.prepare("SELECT id, title, feature_ids, status, version, updated_at FROM ft_brds WHERE status<>'Dibatalkan' ORDER BY updated_at DESC"),
  ]);
  const { features, competitors } = await listFeatures(env, new URLSearchParams());
  const brdOf = (id) => { const b = bs.results.find((x) => parseJ(x.feature_ids, []).includes(id)); return b ? { id: b.id, title: b.title, status: b.status, version: b.version } : null; };
  const rank = { H: 0, M: 1, L: 2 };
  const pursued = features.filter((x) => x.decision === "Kejar").sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3) || a.name.localeCompare(b.name))
    .map((x) => ({ feature_id: x.id, feature: x.name, area: x.area, priority: x.priority, ikisi_status: x.ikisi_status, brd: brdOf(x.id) }));
  return { ...p, launched: ev.results, features, competitors, pursued };
}
const SUMMARY_RULES = `Kamu analis produk di Divisi Digital Business KISI (aplikasi iKISI). Tulis ringkasan untuk management (maksimal 4 paragraf pendek, Bahasa Indonesia baku):
apa yang diluncurkan kompetitor dalam periode, posisi iKISI, dan fitur yang diusulkan dikejar beserta prioritasnya. Pakai hanya data yang diberikan; jangan mengarang angka atau dampak bisnis. Tanpa judul, tanpa markdown.`;
async function reportSummary(env, b) {
  const r = await report(env, new URLSearchParams({ from: s(b.from, 10), to: s(b.to, 10) }));
  if (r.error) return r;
  const ids = new Set((Array.isArray(b.feature_ids) ? b.feature_ids : []).map((x) => s(x, 60)));
  const pick_ = (x) => !ids.size || ids.has(x.feature_id ?? x.id);
  if (!(await aiTake(env))) return { error: "Batas AI harian tercapai. Tulis ringkasan langsung di kotak, atau coba lagi besok.", status: 429 };
  const user = [`Periode: ${r.from} s.d. ${r.to}`,
    "Diluncurkan kompetitor:\n" + (r.launched.filter(pick_).map((x) => `- ${x.launched_at} ${x.competitor}: ${x.feature} (${x.area})`).join("\n") || "-"),
    "Perbandingan (fitur: kompetitor yang punya; status iKISI; keputusan):\n" + r.features.filter(pick_).map((x) => `- ${x.name}: ${Object.keys(x.has).join(", ") || "-"}; ${x.ikisi_status}; ${x.decision || "-"}`).join("\n"),
    "Diusulkan dikejar:\n" + (r.pursued.filter(pick_).map((x) => `- ${x.feature} prioritas ${x.priority || "-"}; BRD: ${x.brd ? x.brd.status : "belum ada"}`).join("\n") || "-")].join("\n\n");
  const { text } = await ai(env, SUMMARY_RULES, user, 1200, undefined, { temperature: 0.3 });
  return { text: text.replace(/\*\*|^#+\s*/gm, "").split(/\n{2,}/).slice(0, 5).join("\n\n").trim() };
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
    if (path === "/api/report") return can("editor") ? out(await report(env, u.searchParams)) : json({ error: "Hanya editor atau admin yang bisa membuat report." }, 403);
    if (path === "/api/brds") {
      const [bs, fs] = await env.DB.batch([env.DB.prepare("SELECT id, title, feature_ids, version, status, updated_by, updated_at FROM ft_brds ORDER BY updated_at DESC"), env.DB.prepare("SELECT id, name FROM ft_features")]);
      const fname = Object.fromEntries(fs.results.map((f) => [f.id, f.name]));
      return json({ brds: bs.results.map(({ feature_ids, ...x }) => ({ ...x, feature_ids: parseJ(feature_ids, []), feature_names: parseJ(feature_ids, []).map((i) => fname[i]).filter(Boolean) })) });
    }
    if (path.startsWith("/api/brds/")) {
      const brd = await brdRow(env, decodeURIComponent(path.slice(10)));
      return brd ? json({ brd }) : json({ error: "BRD tidak ditemukan." }, 404);
    }
    if (path === "/api/scan") {
      const st = {};
      for (const src of ["ig", "appstore", "playstore"]) { try { st[src] = JSON.parse(await getMeta(env, "scan_" + src)); } catch { st[src] = null; } }
      // akun IG kompetitor yang tidak pernah muncul di data Content Insight (salah ketik / belum dipantau)
      const accs = (await env.DB.prepare("SELECT c.name, c.ig_account, (SELECT COUNT(*) FROM ci_content WHERE platform='Instagram' AND lower(account)=c.ig_account) AS n FROM ft_competitors c WHERE c.enabled=1 AND c.ig_account<>''").all().catch(() => ({ results: [] }))).results;
      return json({ ...st, ig_missing: accs.filter((a) => !a.n).map((a) => a.name + " (@" + a.ig_account + ")") });
    }
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
  if (path === "/api/scan" && m === "POST") return can("admin") ? json(await ftScan(env)) : json({ error: "Hanya admin yang bisa menjalankan scan." }, 403);
  if (path === "/api/brds" && m === "POST") return out(await createBrd(env, me, b));
  if (path === "/api/brds" && m === "PATCH") return out(await patchBrd(env, me, b));
  if ((path === "/api/brds/draft" || path === "/api/report/summary") && m === "POST") {
    try { return out(path === "/api/brds/draft" ? await draftBrd(env, me, b) : await reportSummary(env, b)); }
    catch (e) { if (e instanceof AiError) return json({ error: e.message }, 502); throw e; }
  }
  return json({ error: "Tidak ditemukan" }, 404);
}

// apps/cron memanggil tiap :00/:30 hari Minggu (UTC). Scan minggu ini dimulai 01:00 UTC (08.00 WIB, setelah scan IG Content Insight 07.00 WIB);
// panggilan berikutnya hanya melanjutkan caption IG yang belum terbaca (10 per panggilan, supaya tetap di bawah batas CPU).
async function scheduled(e, env) {
  const d = new Date(e.scheduledTime || Date.now());
  if (d.getUTCDay() !== 0) return;
  try {
    await ensure(env);
    const week = d.toISOString().slice(0, 10);
    let r;
    if (d.getUTCHours() === 1 && d.getUTCMinutes() < 30 && (await getMeta(env, "week")) !== week) { await setMeta(env, "week", week); r = await ftScan(env); }
    else if ((await getMeta(env, "pending")) === "1") r = await ftScan(env, { stores: false });
    if (r) await setMeta(env, "pending", r.ig && r.ig.more ? "1" : "0");
  } catch (err) { console.error("FT scan:", (err && err.message) || err); }
}

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
