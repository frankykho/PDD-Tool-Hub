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
/** Batas waktu untuk panggilan ke tool lain / Google. */
const timed = (p, ms) => { let t; return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error("timeout")), ms); })]).finally(() => clearTimeout(t)); };
const newId = () => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => ABC[x % ABC.length]).join("");
/** Sesi + cabang: tiket lama tanpa cabang memakai cabang di daftar anggota dari Tool Hub. */
async function whoAmI(env, me) {
  const e = lower(me.e);
  if (me.c) return { ...me, e };
  const U = (await cfgGet(env, "users")) || [], u = U.find((x) => x.email === e);
  return { ...me, e, c: (u && u.branch) || "" };
}
/* =========================================================
   DISCLAIMER (beberapa versi; dikirim ke Copy Studio & Edukasi Studio)
   ========================================================= */
// teks penutup artikel Edukasi Studio sebelum Brand Kit ada (apps/edukasi-studio/worker.js disclaimer())
export const EDU_DEFAULT = "Semua investasi memiliki risiko. Lakukan analisis mandiri dan pahami potensi kerugian sebelum mengambil keputusan.\nInformasi ini bersifat edukasi, bukan ajakan atau dorongan untuk membeli atau menjual efek tertentu.";
const SINGKAT = "PT Korea Investment And Sekuritas Indonesia berizin dan diawasi oleh OJK.";
/** Semua versi berurutan; baris yang belum ada diisi teks awal. */
export async function getDisclaimers(env) {
  await ensure(env);
  const have = new Map((await env.DB.prepare("SELECT * FROM disclaimers").all()).results.map((x) => [x.key, x]));
  const miss = DISC_KEYS.filter(([k]) => !have.has(k));
  if (miss.length) {
    const b = profile(env).brand || {}, lic = [b.company, b.license].filter(Boolean).join(" ");
    const seed = { edukasi: EDU_DEFAULT + (lic ? "\n" + lic.replace(/\.?$/, ".") : ""), singkat: SINGKAT };
    await env.DB.batch(miss.map(([k, label]) => env.DB.prepare("INSERT OR IGNORE INTO disclaimers (key, label, text, sort, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(k, label, seed[k] || "", DISC_KEYS.findIndex((x) => x[0] === k), iso(env), "")));
    return getDisclaimers(env);
  }
  return DISC_KEYS.map(([k]) => { const { key, label, text, updated_at, updated_by } = have.get(k); return { key, label, text: text || "", updated_at, updated_by }; });
}
/** Kirim semua versi ke Copy Studio & Edukasi Studio (masing-masing menyimpan salinannya). Gagal = dicatat, tidak melempar. */
async function pushDisclaimers(env) {
  const list = await getDisclaimers(env);
  // teks Edukasi lama: Edukasi Studio membuang disclaimer lama di akhir artikel walau kata-katanya sudah diganti
  const old = (await env.DB.prepare("SELECT text FROM disc_history WHERE key = 'edukasi' ORDER BY id DESC LIMIT 20").all()).results.map((x) => x.text).filter(Boolean);
  const body = JSON.stringify({ versions: list.map(({ key, label, text }) => ({ key, label, text })), old: { edukasi: old } });
  const send = async (bind, host) => {
    if (!bind) return false;
    try {
      const r = await timed(bind.fetch(`https://${host}/__hub/disclaimers`, { method: "POST", headers: { "x-hub-key": env.SSO_SECRET, "content-type": "application/json" }, body }), 6000);
      return r.ok;
    } catch (e) { console.log(`kirim disclaimer ke ${host} gagal:`, e.message); return false; }
  };
  const [copy, edukasi] = await Promise.all([send(env.COPY, "copy"), send(env.EDUKASI, "edukasi")]);
  const push = { at: iso(env), ok: { copy, edukasi } };
  await cfgPut(env, "push", push).run();
  return push;
}
async function saveDisclaimer(env, me, b) {
  const key = String(b.key || "");
  if (!DISC_KEYS.some(([k]) => k === key)) return { error: "Versi disclaimer tidak dikenal." };
  const text = String(b.text ?? "").replace(/\r\n/g, "\n").trim().slice(0, 3000);
  const cur = (await getDisclaimers(env)).find((x) => x.key === key);
  if (cur.text !== text) await env.DB.batch([
    env.DB.prepare("INSERT INTO disc_history (key, text, at, by_name) VALUES (?, ?, ?, ?)").bind(key, cur.text, iso(env), String(me.n || me.e).slice(0, 60)),
    env.DB.prepare("UPDATE disclaimers SET text = ?, updated_at = ?, updated_by = ? WHERE key = ?").bind(text, iso(env), String(me.n || me.e).slice(0, 60), key)]);
  return { list: await getDisclaimers(env), push: await pushDisclaimers(env) };
}

/* =========================================================
   TEMPLATE & UKURAN
   ========================================================= */
const HEX = /^#[0-9a-f]{6}$/i;
const AUTOS = ["", "branch", "event.title", "event.date", "event.time", "event.place"];
const num = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const discLabel = (k) => (DISC_KEYS.find((x) => x[0] === k) || [k, k])[1];
/** Kotak isian satu ukuran -> daftar bersih (koordinat dijaga di dalam gambar) atau { error }. */
export function cleanSlots(kind, slots) {
  const S = SIZES[kind];
  if (!S) return { error: "Ukuran tidak dikenal." };
  const L = Array.isArray(slots) ? slots : [];
  if (L.length > 20) return { error: "Maksimal 20 kotak per ukuran." };
  const out = [];
  for (const x of L) {
    if (!x || typeof x !== "object") return { error: "Kotak isian tidak sah." };
    const id = String(x.id || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || newId();
    const box = () => { const w = num(x.w, 10, S.w), h = num(x.h, 10, S.h); return { x: num(x.x, 0, S.w - w), y: num(x.y, 0, S.h - h), w, h }; };
    const font = (f) => FONTS.includes(f);
    if (x.type === "text") {
      if (!font(x.font)) return { error: "Font tidak ada di daftar." };
      if (!HEX.test(x.color || "")) return { error: "Warna harus berupa kode #rrggbb." };
      const size = num(x.size, 8, 600);
      out.push({ id, type: "text", field: String(x.field || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30) || id, label: str(x.label, 60) || "Teks", ...box(),
        font: x.font, weight: [400, 600, 700, 800].includes(Number(x.weight)) ? Number(x.weight) : 700, size, minSize: num(x.minSize ?? size, 6, size), color: x.color.toLowerCase(),
        align: ["left", "center", "right"].includes(x.align) ? x.align : "left", max: num(x.max ?? 60, 1, 200), required: !!x.required, def: str(x.def, 200), auto: AUTOS.includes(x.auto) ? x.auto : "" });
    } else if (x.type === "speakers") {
      if (out.some((o) => o.type === "speakers")) return { error: "Hanya satu area narasumber per ukuran." };
      const max = Number(x.max);
      if (!Number.isInteger(max) || max < 1 || max > 6) return { error: "Narasumber maksimal 1 sampai 6 orang." };
      if (!font(x.font)) return { error: "Font tidak ada di daftar." };
      if (!HEX.test(x.nameColor || "") || !HEX.test(x.titleColor || "")) return { error: "Warna harus berupa kode #rrggbb." };
      out.push({ id, type: "speakers", ...box(), max, font: x.font, nameSize: num(x.nameSize, 8, 300), nameColor: x.nameColor.toLowerCase(), titleSize: num(x.titleSize, 6, 300), titleColor: x.titleColor.toLowerCase() });
    } else if (x.type === "qr") {
      if (out.some((o) => o.type === "qr")) return { error: "Hanya satu kotak QR per ukuran." };
      if (!HEX.test(x.color || "")) return { error: "Warna harus berupa kode #rrggbb." };
      const size = num(x.size, 40, Math.min(S.w, S.h));
      out.push({ id, type: "qr", x: num(x.x, 0, S.w - size), y: num(x.y, 0, S.h - size), size, color: x.color.toLowerCase() });
    } else return { error: "Jenis kotak tidak dikenal." };
  }
  return out;
}
/** Logo & kotak disclaimer satu ukuran; X-banner selalu memakai disclaimer Singkat. */
function cleanLocked(kind, logo, disc) {
  const S = SIZES[kind], l = logo && typeof logo === "object" ? logo : {}, d = disc && typeof disc === "object" ? disc : {};
  const h = num(l.h ?? Math.round(S.w * 0.08), 20, Math.round(S.h / 3));
  const key = kind === "xbanner" ? "singkat" : DISC_KEYS.some(([k]) => k === d.key) ? d.key : "umum";
  if (d.color !== undefined && !HEX.test(d.color)) return { error: "Warna harus berupa kode #rrggbb." };
  const w = num(d.w ?? S.w - 120, 50, S.w);
  return { logo: { y: num(l.y ?? Math.round(S.h * 0.04), 0, S.h - h), h },
    disc: { key, w, x: num(d.x ?? 60, 0, S.w - w), y: num(d.y ?? S.h - 120, 0, S.h - 10), size: num(d.size ?? 18, 6, 200), color: (d.color || "#333333").toLowerCase(), align: ["left", "center", "right"].includes(d.align) ? d.align : "center" } };
}
const sizeRow = (x) => ({ id: x.id, kind: x.kind, has_bg: x.has_bg, dark: x.dark, logo: JSON.parse(x.logo || "{}"), disc: JSON.parse(x.disc || "{}"), slots: JSON.parse(x.slots || "[]") });
const KIND_ORDER = Object.keys(SIZES);
/** Daftar template. Selain admin: hanya yang aktif, dan hanya ukuran yang lengkap (ada gambar latar, disclaimer-nya berisi). */
async function listTemplates(env, me) {
  const T = (await env.DB.prepare("SELECT * FROM templates ORDER BY name").all()).results.filter((t) => me.adm || t.status === "live");
  const S = (await env.DB.prepare("SELECT * FROM sizes").all()).results.map((x) => ({ ...sizeRow(x), template_id: x.template_id }));
  const filled = new Set((await getDisclaimers(env)).filter((d) => d.text).map((d) => d.key));
  return T.map((t) => ({ id: t.id, name: t.name, status: t.status, updated_at: t.updated_at, updated_by: t.updated_by,
    sizes: S.filter((s) => s.template_id === t.id && (me.adm || (s.has_bg && filled.has(s.disc.key)))).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
      .map(({ template_id, ...s }) => s) })).filter((t) => me.adm || t.sizes.length);
}
async function saveTemplate(env, me, b) {
  const name = str(b.name, 80), by = String(me.n || me.e).slice(0, 60);
  if (!name) return { error: "Nama template belum diisi." };
  if (!b.id) {
    const id = newId();
    await env.DB.prepare("INSERT INTO templates (id, name, status, created_at, updated_at, updated_by) VALUES (?, ?, 'draft', ?, ?, ?)").bind(id, name, iso(env), iso(env), by).run();
    return { id };
  }
  const t = await env.DB.prepare("SELECT * FROM templates WHERE id = ?").bind(String(b.id)).first();
  if (!t) return { error: "Template tidak ditemukan.", status: 404 };
  const status = b.status === "live" ? "live" : b.status === "draft" ? "draft" : t.status;
  if (status === "live") {
    // tampil ke cabang hanya kalau setiap ukuran punya gambar latar dan disclaimer-nya berisi
    const S = (await env.DB.prepare("SELECT * FROM sizes WHERE template_id = ?").bind(t.id).all()).results.map(sizeRow);
    if (!S.length) return { error: "Tambahkan minimal satu ukuran." };
    const noBg = S.find((s) => !s.has_bg);
    if (noBg) return { error: `Gambar latar ${SIZES[noBg.kind].label} belum diunggah.` };
    const D = new Map((await getDisclaimers(env)).map((d) => [d.key, d.text])), empty = S.find((s) => !D.get(s.disc.key));
    if (empty) return { error: `Disclaimer ${discLabel(empty.disc.key)} belum diisi.` };
  }
  await env.DB.prepare("UPDATE templates SET name = ?, status = ?, updated_at = ?, updated_by = ? WHERE id = ?").bind(name, status, iso(env), by, t.id).run();
  return { id: t.id, state: status };
}
async function saveSize(env, me, b) {
  if (b.delete) {
    const s = await env.DB.prepare("SELECT id FROM sizes WHERE id = ?").bind(String(b.id || "")).first();
    if (!s) return { error: "Ukuran tidak ditemukan.", status: 404 };
    await env.DB.prepare("DELETE FROM sizes WHERE id = ?").bind(s.id).run();
    await env.BRAND_KV.delete("bg:" + s.id);
    return { ok: true };
  }
  const prev = b.id ? await env.DB.prepare("SELECT * FROM sizes WHERE id = ?").bind(String(b.id)).first() : null;
  if (b.id && !prev) return { error: "Ukuran tidak ditemukan.", status: 404 };
  const tid = prev ? prev.template_id : String(b.template_id || "");
  if (!await env.DB.prepare("SELECT id FROM templates WHERE id = ?").bind(tid).first()) return { error: "Template tidak ditemukan.", status: 404 };
  // jenis ukuran tidak berubah setelah dibuat (gambar latarnya dibuat untuk ukuran itu)
  const kind = prev ? prev.kind : String(b.kind || "");
  if (!SIZES[kind]) return { error: "Ukuran tidak dikenal." };
  if (await env.DB.prepare("SELECT id FROM sizes WHERE template_id = ? AND kind = ? AND id <> ?").bind(tid, kind, prev ? prev.id : "").first()) return { error: `Ukuran ${SIZES[kind].label} sudah ada di template ini.` };
  const slots = cleanSlots(kind, b.slots);
  if (slots.error) return slots;
  const lk = cleanLocked(kind, b.logo, b.disc);
  if (lk.error) return lk;
  const id = prev ? prev.id : newId(), dark = b.dark ? 1 : 0;
  if (prev) await env.DB.prepare("UPDATE sizes SET dark = ?, logo = ?, disc = ?, slots = ? WHERE id = ?").bind(dark, JSON.stringify(lk.logo), JSON.stringify(lk.disc), JSON.stringify(slots), id).run();
  else await env.DB.prepare("INSERT INTO sizes (id, template_id, kind, sort, has_bg, dark, logo, disc, slots) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)")
    .bind(id, tid, kind, KIND_ORDER.indexOf(kind), dark, JSON.stringify(lk.logo), JSON.stringify(lk.disc), JSON.stringify(slots)).run();
  await env.DB.prepare("UPDATE templates SET updated_at = ?, updated_by = ? WHERE id = ?").bind(iso(env), String(me.n || me.e).slice(0, 60), tid).run();
  return { id };
}
async function deleteTemplate(env, id) {
  const t = await env.DB.prepare("SELECT id FROM templates WHERE id = ?").bind(String(id || "")).first();
  if (!t) return { error: "Template tidak ditemukan.", status: 404 };
  const S = (await env.DB.prepare("SELECT id FROM sizes WHERE template_id = ?").bind(t.id).all()).results;
  await env.DB.batch([env.DB.prepare("DELETE FROM sizes WHERE template_id = ?").bind(t.id), env.DB.prepare("DELETE FROM templates WHERE id = ?").bind(t.id)]);
  await Promise.all(S.map((s) => env.BRAND_KV.delete("bg:" + s.id)));
  return { ok: true };
}
const BG_MAX = 15 * 1024 * 1024;
/** PUT /bg/<id>: gambar latar dari Canva (PNG / JPG, maks. 15 MB) disimpan di KV. */
async function putBg(env, id, request) {
  const s = await env.DB.prepare("SELECT id FROM sizes WHERE id = ?").bind(id).first();
  if (!s) return { error: "Ukuran tidak ditemukan.", status: 404 };
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length > BG_MAX) return { error: "Gambar terlalu besar (maks. 15 MB)." };
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47, jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (!png && !jpg) return { error: "File harus PNG atau JPG." };
  await env.BRAND_KV.put("bg:" + s.id, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { metadata: { type: png ? "image/png" : "image/jpeg" } });
  await env.DB.prepare("UPDATE sizes SET has_bg = 1 WHERE id = ?").bind(s.id).run();
  return { ok: true };
}
async function logUsage(env, me, b) {
  const t = await env.DB.prepare("SELECT id FROM templates WHERE id = ?").bind(String(b.template_id || "")).first();
  if (!t) return { error: "Template tidak ditemukan.", status: 404 };
  if (!SIZES[b.kind]) return { error: "Ukuran tidak dikenal." };
  await env.DB.prepare("INSERT INTO downloads (at, email, branch, template_id, kind, event_id) VALUES (?, ?, ?, ?, ?, ?)").bind(iso(env), me.e, me.c || "", t.id, b.kind, str(b.event_id, 40)).run();
  return { ok: true };
}
/** Ringkasan unduhan 90 hari terakhir: per template & per cabang. */
async function usage(env) {
  const since = new Date(now(env) - 90 * 864e5).toISOString();
  const byTemplate = (await env.DB.prepare("SELECT COALESCE(t.name, '(template terhapus)') AS name, COUNT(*) AS n FROM downloads d LEFT JOIN templates t ON t.id = d.template_id WHERE d.at >= ? GROUP BY d.template_id ORDER BY n DESC, name").bind(since).all()).results;
  const byBranch = (await env.DB.prepare("SELECT COALESCE(NULLIF(branch, ''), 'Tanpa cabang') AS branch, COUNT(*) AS n FROM downloads WHERE at >= ? GROUP BY 1 ORDER BY n DESC, branch").bind(since).all()).results;
  return { byTemplate: byTemplate.map(({ name, n }) => ({ name, n })), byBranch: byBranch.map(({ branch, n }) => ({ branch, n })) };
}

/* =========================================================
   NARASUMBER (dipakai bersama semua cabang)
   ========================================================= */
const PHOTO_MAX = 200 * 1024;
/** Foto dari browser (sudah dipotong & dikecilkan) -> base64 JPEG, atau { error }. */
function cleanPhoto(v) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(v || ""));
  if (!m) return { error: "Foto harus JPG." };
  let bin; try { bin = atob(m[1]); } catch { return { error: "Foto harus JPG." }; }
  if (bin.length > PHOTO_MAX) return { error: "Foto terlalu besar (maks. 200 KB)." };
  if (bin.charCodeAt(0) !== 0xff || bin.charCodeAt(1) !== 0xd8) return { error: "Foto harus JPG." };
  return { b64: m[1] };
}
async function listSpeakers(env, me, org) {
  const L = (await env.DB.prepare("SELECT id, name, title, created_by, created_name, created_at, updated_at FROM speakers ORDER BY name").all()).results;
  return L.map((s) => ({ ...s, v: s.updated_at, canEdit: canEditSpeaker(me, s, org) }));
}
async function saveSpeaker(env, me, org, b) {
  const name = str(b.name, 80), title_ = str(b.title, 120);
  if (!name) return { error: "Nama narasumber belum diisi." };
  const ph = b.photo ? cleanPhoto(b.photo) : null;
  if (ph && ph.error) return ph;
  if (b.id) {
    const sp = await env.DB.prepare("SELECT id, created_by FROM speakers WHERE id = ?").bind(String(b.id)).first();
    if (!sp) return { error: "Narasumber tidak ditemukan.", status: 404 };
    if (!canEditSpeaker(me, sp, org)) return { error: "Hanya pembuat, Head, atau admin yang bisa mengubah narasumber ini.", status: 403 };
    await env.DB.prepare("UPDATE speakers SET name = ?, title = ?, photo = COALESCE(?, photo), updated_at = ? WHERE id = ?").bind(name, title_, ph ? ph.b64 : null, iso(env), sp.id).run();
    return { id: sp.id };
  }
  if (!ph) return { error: "Foto narasumber belum dipilih." };
  const id = newId();
  await env.DB.prepare("INSERT INTO speakers (id, name, title, photo, created_by, created_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, name, title_, ph.b64, me.e, String(me.n || me.e).slice(0, 60), iso(env), iso(env)).run();
  return { id };
}
async function deleteSpeaker(env, me, org, id) {
  const sp = await env.DB.prepare("SELECT id, created_by FROM speakers WHERE id = ?").bind(String(id || "")).first();
  if (!sp) return { error: "Narasumber tidak ditemukan.", status: 404 };
  if (!canEditSpeaker(me, sp, org)) return { error: "Hanya pembuat, Head, atau admin yang bisa mengubah narasumber ini.", status: 403 };
  await env.DB.prepare("DELETE FROM speakers WHERE id = ?").bind(sp.id).run();
  return { ok: true };
}

/* =========================================================
   FILE RESMI DARI GOOGLE DRIVE (subfolder = kategori)
   ========================================================= */
/** ID folder dari ID mentah atau link folder Drive; "" kalau tidak dikenali. */
export function folderId(input) {
  const s = String(input || "").trim(), m = /\/folders\/([A-Za-z0-9_-]+)/.exec(s) || /[?&]id=([A-Za-z0-9_-]+)/.exec(s);
  const id = m ? m[1] : s;
  return /^[A-Za-z0-9_-]{10,100}$/.test(id) ? id : "";
}
const FILES_TTL = 600e3, GFOLDER = "application/vnd.google-apps.folder";
async function driveList(env, id) {
  const q = new URLSearchParams({ q: `'${id}' in parents and trashed=false`, fields: "files(id,name,mimeType,size,modifiedTime)", pageSize: "1000", orderBy: "folder,name", key: env.DRIVE_API_KEY });
  const r = await timed(fetch("https://www.googleapis.com/drive/v3/files?" + q), 10000);
  if (!r.ok) throw new Error(`Google Drive tidak bisa dibaca (HTTP ${r.status}).`);
  return ((await r.json()).files || []);
}
const fileOut = (f) => ({ id: f.id, name: f.name, mime: f.mimeType, size: Number(f.size) || 0, modified: f.modifiedTime || "",
  thumb: `https://drive.google.com/thumbnail?id=${f.id}&sz=w400`, view: `https://drive.google.com/file/d/${f.id}/view`,
  // file Google (Docs / Slides / Sheets) tidak bisa diunduh langsung, hanya dibuka
  download: f.mimeType.startsWith("application/vnd.google-apps.") ? "" : `https://drive.google.com/uc?export=download&id=${f.id}` });
async function readDrive(env, folder) {
  const root = await driveList(env, folder), subs = root.filter((f) => f.mimeType === GFOLDER).slice(0, 30);
  const cats = await Promise.all(subs.map(async (s) => ({ name: s.name, files: (await driveList(env, s.id)).filter((f) => f.mimeType !== GFOLDER).map(fileOut) })));
  cats.sort((a, b) => a.name.localeCompare(b.name, "id"));
  const rest = root.filter((f) => f.mimeType !== GFOLDER).map(fileOut);
  return [...cats, ...(rest.length ? [{ name: "Lainnya", files: rest }] : [])];
}
/** Daftar file (cache 10 menit di KV). Kalau Drive gagal, data terakhir tetap ditampilkan dengan pesan. */
async function listFiles(env, fresh) {
  const folder = (await cfgGet(env, "drive_folder")) || "";
  if (!env.DRIVE_API_KEY) return { folder, categories: [], error: "DRIVE_API_KEY belum dipasang." };
  if (!folder) return { folder, categories: [], error: "Folder Drive belum diatur admin." };
  const c = await env.BRAND_KV.get("files", "json"), cached = c && c.folder === folder ? c : null;
  if (cached && !fresh && now(env) - cached.at < FILES_TTL) return { folder, categories: cached.data };
  try {
    const data = await readDrive(env, folder);
    await env.BRAND_KV.put("files", JSON.stringify({ at: now(env), folder, data }));
    return { folder, categories: data };
  } catch (e) {
    console.log("baca Drive gagal:", e.message);
    return { folder, categories: cached ? cached.data : [], error: /^Google Drive/.test(e.message) ? e.message : "Google Drive tidak bisa dihubungi." };
  }
}
async function setFolder(env, b) {
  const id = folderId(b.folder);
  if (!id) return { error: "Link atau ID folder Drive tidak dikenali." };
  await cfgPut(env, "drive_folder", id).run();
  await env.BRAND_KV.delete("files");
  return { folder: id };
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
      const admin = () => (me.adm ? null : json({ error: "Khusus admin." }, 403));
      if (request.method === "GET") {
        if (path === "/api/disclaimers") {
          const list = await getDisclaimers(env);
          // riwayat hanya untuk admin
          const history = me.adm ? (await env.DB.prepare("SELECT key, text, at, by_name FROM disc_history ORDER BY id DESC LIMIT 200").all()).results : [];
          return json({ list, history, push: (await cfgGet(env, "push")) || null });
        }
        if (path === "/api/templates") return json({ templates: await listTemplates(env, me) });
        if (path === "/api/usage") return admin() || json(await usage(env));
        if (path === "/api/speakers") return json({ speakers: await listSpeakers(env, me, org) });
        if (path === "/api/files") return json(await listFiles(env, me.adm && url.searchParams.get("fresh") === "1"));
        if (path === "/api/events") {
          // Event & Lead menerapkan aturan aksesnya sendiri; email selalu dari sesi
          const id = url.searchParams.get("id") || "", q = new URLSearchParams({ email: me.e, ...(id ? { id } : {}) });
          try {
            if (!env.EVENT) throw new Error("tanpa binding");
            const r = await timed(env.EVENT.fetch("https://event/__hub/brand-events?" + q, { headers: { "x-hub-key": env.SSO_SECRET } }), 6000);
            if (id) return r.ok ? json(await r.json()) : json({ error: "Event tidak ditemukan." }, 404);
            if (!r.ok) throw new Error("HTTP " + r.status);
            return json({ events: (await r.json()).events || [] });
          } catch (e) {
            console.log("Event & Lead tidak bisa dihubungi:", e.message);
            return id ? json({ error: "Event & Lead tidak bisa dihubungi." }, 502) : json({ events: [], off: true });
          }
        }
        const ph = /^\/photo\/([a-z0-9]{6,20})$/.exec(path);
        if (ph) {
          const sp = await env.DB.prepare("SELECT photo FROM speakers WHERE id = ?").bind(ph[1]).first();
          if (!sp) return new Response("Tidak ditemukan", { status: 404 });
          return new Response(Uint8Array.from(atob(sp.photo), (c) => c.charCodeAt(0)), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
        }
        const bg = /^\/bg\/([a-z0-9]{6,20})$/.exec(path);
        if (bg) {
          const { value, metadata } = await env.BRAND_KV.getWithMetadata("bg:" + bg[1], "arrayBuffer");
          if (!value) return new Response("Tidak ditemukan", { status: 404 });
          return new Response(value, { headers: { "content-type": (metadata && metadata.type) || "image/png", "cache-control": "private, max-age=300" } });
        }
      }
      if (request.method === "PUT" && path.startsWith("/bg/")) return admin() || out(await putBg(env, path.slice(4), request));
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        if (path === "/api/disclaimers") return admin() || out(await saveDisclaimer(env, me, b));
        if (path === "/api/disclaimers/push") return admin() || json({ push: await pushDisclaimers(env) });
        if (path === "/api/templates") return admin() || out(await saveTemplate(env, me, b));
        if (path === "/api/templates/delete") return admin() || out(await deleteTemplate(env, b.id));
        if (path === "/api/sizes") return admin() || out(await saveSize(env, me, b));
        if (path === "/api/usage") return out(await logUsage(env, me, b));
        if (path === "/api/speakers") return out(await saveSpeaker(env, me, org, b));
        if (path === "/api/speakers/delete") return out(await deleteSpeaker(env, me, org, b.id));
        if (path === "/api/drive") return admin() || out(await setFolder(env, b));
      }
    } catch (e) {
      return json({ error: "Gagal: " + (e.message || e) }, 500);
    }
    return new Response("Tidak ditemukan", { status: 404 });
  },
};
