// Event & Lead — Cloudflare Worker
// Pendaftaran peserta event (nasabah daftar sendiri lewat link / QR), konfirmasi oleh Sales lewat WhatsApp, absen di hari acara.
// - "/"                -> halaman tim (di dalam Tool Hub): daftar event, form, link & QR, peserta, ekspor Excel
// - "/api/*"           -> data event & peserta (login lewat Tool Hub)
// - "/__hub/users" (POST) -> anggota, daftar cabang, dan tim & role dari Tool Hub
// Hak akses: admin hub semua event; Head tim regional semua event regional; Sales / GI coordinator event cabangnya;
// pemegang akses di luar tim regional hanya event buatannya (+ Head timnya).
import { hubFeedAllowed, hubPushAllowed } from "../../shared/hubfeed.js";
import { cleanOrg, roleIn, teamIn, isRegional } from "../../shared/jobs.js";

/* =========================================================
   LOGIN LEWAT TOOL HUB
   ========================================================= */
const HUBSSO = (() => {
  const APP = "event", COOKIE = "hub_" + APP, HOURS = 8, te = new TextEncoder();
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
   AKSES
   ========================================================= */
/** Boleh melihat event ini (dan pesertanya)? me = sesi { e, n, j, c, adm }, ev = baris event. */
export function canSee(me, ev, org) {
  if (!me || !ev) return false;
  if (me.adm) return true;
  const rl = roleIn(org, me.j), e = String(me.e || "").toLowerCase();
  if (isRegional(org, me.j, me.adm)) {
    if (rl && rl.head && ev.branch) return true;
    if (ev.branch && ev.branch === me.c) return true;
  }
  if (ev.creator_email && ev.creator_email === e) return true;
  return !!(rl && rl.head && rl.team && rl.team === ev.creator_team);
}
/** Boleh mengubah event & pesertanya: sama dengan boleh melihat (dipisah supaya mudah diubah nanti). */
export const canManage = (me, ev, org) => canSee(me, ev, org);
/** Boleh menghapus peserta: admin hub atau Head tim mana pun. */
export const canDelete = (me, org) => !!(me && (me.adm || (roleIn(org, me.j) || {}).head));

/* =========================================================
   DATA (D1: event-db)
   ========================================================= */
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, code TEXT UNIQUE, acode TEXT UNIQUE, title TEXT, mode TEXT, date TEXT, time_start TEXT, time_end TEXT, place TEXT, online_url TEXT, "
      + "branch TEXT, region TEXT, descr TEXT, quota INTEGER, open INTEGER DEFAULT 1, wa_tpl TEXT, item_id TEXT, item_kind TEXT, item_gone INTEGER DEFAULT 0, status TEXT, "
      + "creator_email TEXT, creator_name TEXT, creator_job TEXT, creator_team TEXT, created_at TEXT, updated_at TEXT, "
      + "purged INTEGER DEFAULT 0, n_reg INTEGER DEFAULT 0, n_conf INTEGER DEFAULT 0, n_hadir INTEGER DEFAULT 0, n_walkin INTEGER DEFAULT 0)"),
    // data pribadi peserta: satu nomor HP satu baris per event
    env.DB.prepare("CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, name TEXT, phone TEXT, email TEXT, is_client INTEGER, client_code TEXT, "
      + "status TEXT, walkin INTEGER DEFAULT 0, src TEXT, consent_at TEXT, consent_ver INTEGER, created_at TEXT, updated_at TEXT, updated_by TEXT, UNIQUE (event_id, phone))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT NOT NULL, at TEXT, by_name TEXT, from_status TEXT, to_status TEXT)"),
    // batas kiriman form publik per IP per jam (UTC)
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hits (ip TEXT, hour TEXT, n INTEGER, PRIMARY KEY (ip, hour))"),
    // pengaturan: org, branches, users (dari Tool Hub), consent (teks persetujuan), purged_at
    env.DB.prepare("CREATE TABLE IF NOT EXISTS cfg (k TEXT PRIMARY KEY, v TEXT)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS people_event ON people (event_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS history_person ON history (person_id)"),
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
/** POST /__hub/users dari Tool Hub: { users, branches, org } (sama seperti yang dikirim ke Content Planner). */
async function syncFromHub(env, b) {
  await ensure(env);
  const L = (Array.isArray(b.users) ? b.users : []).map((u) => ({ email: lower(u && u.email), name: String((u && u.name) || "").slice(0, 60), job: String((u && u.job) || "").slice(0, 24), branch: String((u && u.branch) || "").slice(0, 60) }))
    .filter((u) => EMAIL.test(u.email)).slice(0, 500);
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

/* =========================================================
   PESERTA: ISIAN, HITUNGAN
   ========================================================= */
export const STATUSES = { terdaftar: "Terdaftar", dikonfirmasi: "Dikonfirmasi", hadir: "Hadir", batal: "Batal", tidak_bisa: "Tidak bisa dihubungi" };
/** Nomor HP Indonesia -> "628…" (0812…, +62 812…, 812…); "" kalau bukan nomor HP. */
export function normPhone(s) {
  let d = String(s ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return /^628\d{7,11}$/.test(d) ? d : "";
}
/** Isian daftar -> { name, phone, email, is_client, client_code } atau { error }. consent: false = tambah manual oleh Sales (tanpa centang, email boleh kosong). */
export function cleanReg(b, { consent = true } = {}) {
  const s = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const name = s(b.name, 80), phone = normPhone(b.phone), email = lower(s(b.email, 120)), ic = String(b.is_client ?? "");
  if (!name) return { error: "Nama belum diisi." };
  if (!phone) return { error: "Nomor HP (WhatsApp) belum benar." };
  if (consent ? !EMAIL.test(email) : email && !EMAIL.test(email)) return { error: "Email belum benar." };
  if (ic !== "1" && ic !== "0") { if (consent) return { error: "Pilih apakah sudah menjadi nasabah KISI." }; }
  const is_client = ic === "1" ? 1 : 0, client_code = is_client ? s(b.client_code, 30) : "";
  if (is_client && !client_code) return { error: "Kode nasabah belum diisi." };
  if (consent && !b.consent) return { error: "Persetujuan data pribadi wajib dicentang." };
  return { name, phone, email, is_client, client_code };
}
/** Hitung ulang angka event dari tabel peserta (disimpan di event: tetap ada setelah data pribadi dihapus). */
async function recount(env, id) {
  const c = await env.DB.prepare("SELECT COUNT(CASE WHEN status <> 'batal' THEN 1 END) AS reg, COUNT(CASE WHEN status IN ('dikonfirmasi', 'hadir') AND walkin = 0 THEN 1 END) AS conf, "
    + "COUNT(CASE WHEN status = 'hadir' THEN 1 END) AS hadir, COUNT(CASE WHEN walkin = 1 AND status <> 'batal' THEN 1 END) AS walkin FROM people WHERE event_id = ?").bind(id).first();
  await env.DB.prepare("UPDATE events SET n_reg = ?, n_conf = ?, n_hadir = ?, n_walkin = ? WHERE id = ?").bind(c.reg, c.conf, c.hadir, c.walkin, id).run();
  return env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(id).first();
}
/* ---------- Content Planner (service binding PLANNER) ---------- */
async function planner(env, path, body) {
  if (!env.PLANNER) throw new Error("Content Planner belum tersambung");
  const r = await env.PLANNER.fetch("https://planner" + path, body === undefined ? { headers: { "x-hub-key": env.SSO_SECRET } }
    : { method: "POST", headers: { "x-hub-key": env.SSO_SECRET, "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Content Planner HTTP " + r.status);
  return j;
}
/** Kirim { item_id, event_id, set?, counts? } ke kegiatan Planner. Kegiatan sudah dihapus di Planner -> event ditandai tidak tersambung. */
async function plannerSync(env, ev, extra) {
  if (!ev.item_id || ev.item_gone) return;
  const r = await planner(env, "/__hub/event-sync", { item_id: ev.item_id, event_id: ev.id, ...extra });
  if (r.gone) await env.DB.prepare("UPDATE events SET item_gone = 1 WHERE id = ?").bind(ev.id).run();
}
/** Angka ke Planner: Pendaftar -> Leads (kegiatan cabang), Hadir -> Peserta. */
const syncCounts = (env, ev) => plannerSync(env, ev, { counts: { reg: ev.n_reg, hadir: ev.n_hadir } });
/** Isian kegiatan Planner dari event. */
const itemSet = (ev) => ({ title: ev.title, date: ev.date, time: ev.time_start, place: ev.mode === "online" ? "Online" : ev.place, branch: ev.branch, ...(ev.status === "batal" ? { status: "batal" } : {}) });
// event bercabang -> Kegiatan cabang; tanpa cabang (pembuat di luar tim regional) -> Edukasi / narasumber
const kindFor = (branch) => (branch ? "cabang" : "edukasi");
async function plannerChoices(env, me, kind, branch) {
  return planner(env, "/__hub/event-items?" + new URLSearchParams({ email: me.e, branch, kind }));
}
/** Kegiatan yang dipilih harus ada di pilihan orang ini (cabangnya / miliknya, belum tersambung). */
async function checkChoice(env, me, ev, itemId) {
  let C;
  try { C = await plannerChoices(env, me, kindFor(ev.branch), ev.branch); } catch (e) { return { error: "Content Planner tidak bisa dihubungi. Coba lagi sebentar lagi." }; }
  return Array.isArray(C) && C.some((x) => x.id === itemId) ? null : { error: "Kegiatan Content Planner ini tidak bisa dipilih." };
}
/** Sambungkan event ke kegiatan Planner: { item_id } = kegiatan yang sudah ada (harus ada di pilihan orang ini), { create: true } = kegiatan baru. */
async function linkItem(env, me, ev, link) {
  const kind = kindFor(ev.branch);
  let id = "";
  if (link.item_id) id = link.item_id;   // sudah dicek saveEvent (checkChoice)
  else {
    const item = { kind, ...itemSet(ev), status: "rencana", owner: String(me.n || me.e).slice(0, 60), owner_email: me.e,
      channel: kind === "cabang" ? "Edukasi / seminar" : ev.mode === "online" ? "Webinar" : "Seminar", ...(kind === "edukasi" ? { role: "Penyelenggara" } : {}) };
    id = (await planner(env, "/__hub/item", { by: { email: me.e, name: me.n || me.e, job: me.j || "" }, item })).id;
  }
  await env.DB.prepare("UPDATE events SET item_id = ?, item_kind = ?, item_gone = 0 WHERE id = ?").bind(id, kind, ev.id).run();
  await plannerSync(env, { ...ev, item_id: id, item_gone: 0 }, { set: itemSet(ev), counts: { reg: ev.n_reg || 0, hadir: ev.n_hadir || 0 } });
  return { item_id: id };
}
/** Setelah peserta berubah: hitung ulang, lalu kirim ke Planner di belakang layar (Planner mati tidak menghalangi pendaftaran). */
async function changed(env, ctx, id) {
  const ev = await recount(env, id);
  if (ev) ctx.waitUntil(syncCounts(env, ev).catch((e) => console.log("sinkron angka ke Planner gagal:", e.message)));
  return ev;
}

/* =========================================================
   HALAMAN PUBLIK (tanpa login): daftar /d/<kode>
   ========================================================= */
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** "2026-11-03" -> "Selasa, 3 November 2026". */
export const tanggal = (s) => { const d = new Date(String(s) + "T00:00:00Z"); return isNaN(d) ? String(s || "") : `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
/** "09:00", "11:00" -> "09.00–11.00 WIB". */
export const jam = (ev) => [ev.time_start, ev.time_end].filter(Boolean).map((t) => t.replace(":", ".")).join("–") + (ev.time_start ? " WIB" : "");
/** Waktu WIB di tanggal acara -> milidetik. */
const wibMs = (date, t) => Date.parse(`${date}T${t || "00:00"}:00+07:00`);
const CONSENT_DEFAULT = { ver: 1, text: "Saya setuju nama, nomor HP, email, dan kode nasabah saya dipakai penyelenggara untuk menghubungi saya terkait acara ini. Data disimpan paling lama 12 bulan setelah acara." };
export const getConsent = async (env) => { const c = await cfgGet(env, "consent"); return c && c.text ? c : CONSENT_DEFAULT; };

const te = new TextEncoder();
const hmac = async (env, s) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", te.encode(env.SSO_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), te.encode("form:" + s)))))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** Cap waktu form dibuka (ditandatangani): kiriman yang terlalu cepat (bot) ditolak. */
export const formStamp = async (env) => { const t = String(now(env)); return t + "." + await hmac(env, t); };
const MIN_FILL = 3000, MAX_FILL = 24 * 3600e3;
async function stampOk(env, s) {
  const [t, sig] = String(s || "").split(".");
  if (!t || !sig || sig !== await hmac(env, t)) return false;
  const age = now(env) - Number(t);
  return age >= MIN_FILL && age <= MAX_FILL;
}
// batas kiriman form publik per IP per jam. Absen lebih longgar: peserta di lokasi memakai Wi-Fi yang sama.
const HITS_PER_HOUR = 10, ABSEN_PER_HOUR = 300;
async function hit(env, request, kind = "d", limit = HITS_PER_HOUR) {
  const ip = kind + ":" + String(request.headers.get("cf-connecting-ip") || "?").slice(0, 64), hour = iso(env).slice(0, 13);
  const prev = new Date(now(env) - 3 * 3600e3).toISOString().slice(0, 13);
  await env.DB.batch([env.DB.prepare("DELETE FROM hits WHERE hour < ?").bind(prev),
    env.DB.prepare("INSERT INTO hits (ip, hour, n) VALUES (?, ?, 1) ON CONFLICT(ip, hour) DO UPDATE SET n = n + 1").bind(ip, hour)]);
  const r = await env.DB.prepare("SELECT n FROM hits WHERE ip = ? AND hour = ?").bind(ip, hour).first();
  return r.n <= limit;
}
/** Kenapa pendaftaran tidak bisa (null = bisa). phone = nomor yang sudah terdaftar boleh memperbarui data walau kuota penuh. */
async function regBlocked(env, ev, phone = "") {
  if (ev.status === "batal") return "Acara ini dibatalkan.";
  if (!ev.open || ev.purged || now(env) > wibMs(ev.date, ev.time_end || "23:59")) return "Pendaftaran sudah ditutup.";
  if (ev.quota > 0) {
    const r = await env.DB.prepare("SELECT COUNT(CASE WHEN status <> 'batal' THEN 1 END) AS n, COUNT(CASE WHEN phone = ? THEN 1 END) AS me FROM people WHERE event_id = ?").bind(phone, ev.id).first();
    if (!r.me && r.n >= ev.quota) return "Kuota pendaftaran sudah penuh.";
  }
  return null;
}

const PUB_CSS = `*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#17231B;background:#F1F7F3}
main{max-width:560px;margin:0 auto;padding:20px 16px 48px}.logo{display:block;height:40px;width:auto;margin:4px 0 20px}
.card{background:#fff;border:1px solid #DCE7E0;border-radius:16px;padding:20px;box-shadow:0 8px 24px rgba(16,32,22,.06)}
h1{font-size:22px;line-height:1.3;margin:0 0 10px}.meta{margin:0 0 4px;color:#3C4A41}.meta b{color:#17231B}.descr{margin:12px 0 0;color:#3C4A41;white-space:pre-line}
form{margin-top:20px;display:grid;gap:14px}label{display:grid;gap:6px;font-weight:600;font-size:15px}
input[type=text],input[type=tel],input[type=email]{font:inherit;width:100%;min-height:48px;padding:10px 12px;border:1px solid #B9C9BE;border-radius:10px;background:#fff;color:inherit}
input:focus{outline:2px solid #0B7A3B;outline-offset:1px}fieldset{border:0;margin:0;padding:0;display:grid;gap:8px}legend{font-weight:600;font-size:15px;margin-bottom:6px}
.opt{display:flex;align-items:center;gap:10px;font-weight:500;min-height:44px}.opt input{width:20px;height:20px;accent-color:#0B7A3B}
.consent{display:flex;gap:10px;align-items:flex-start;font-weight:400;font-size:14px;color:#3C4A41}.consent input{width:20px;height:20px;margin-top:2px;flex:none;accent-color:#0B7A3B}
button{font:inherit;font-weight:600;min-height:48px;border:0;border-radius:10px;background:#0B7A3B;color:#fff;cursor:pointer}button:hover{background:#09652F}
.err{background:#FDECEC;color:#8A1C1C;border-radius:10px;padding:10px 12px;margin:16px 0 0}.note{background:#EAF5EE;border-radius:10px;padding:12px;margin:16px 0 0}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}a{color:#0B7A3B;overflow-wrap:anywhere}small{color:#5E6A61;font-weight:400}`;
function pubHtml(title, body, status = 200) {
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">`
    + `<title>${esc(title)}</title><style>${PUB_CSS}</style></head><body><main><img class="logo" src="/brand/ikisi-color.png" alt="iKISI — Elevate Your Investing">${body}</main></body></html>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "referrer-policy": "no-referrer" } });
}
const evHead = (ev) => `<h1>${esc(ev.title)}</h1><p class="meta"><b>${esc(tanggal(ev.date))}</b> · ${esc(jam(ev))}</p>`
  + `<p class="meta">${ev.mode === "online" ? "Online" : esc(ev.place)}</p>${ev.descr ? `<p class="descr">${esc(ev.descr)}</p>` : ""}`;
/** Isian daftar (juga dipakai form walk-in di halaman absen). v = isian sebelumnya. */
async function regFields(env, v = {}) {
  const c = await getConsent(env), ck = (x) => (String(v.is_client ?? "") === x ? " checked" : "");
  return `<label>Nama lengkap<input type="text" name="name" required maxlength="80" autocomplete="name" value="${esc(v.name)}"></label>`
    + `<label>Nomor HP (WhatsApp)<input type="tel" name="phone" required inputmode="tel" autocomplete="tel" placeholder="08xx" value="${esc(v.phone)}"></label>`
    + `<label>Email<input type="email" name="email" required maxlength="120" autocomplete="email" value="${esc(v.email)}"></label>`
    + `<fieldset><legend>Sudah menjadi nasabah KISI?</legend><label class="opt"><input type="radio" name="is_client" value="1" required${ck("1")}> Ya, sudah</label>`
    + `<label class="opt"><input type="radio" name="is_client" value="0"${ck("0")}> Belum</label></fieldset>`
    + `<label id="cc"${String(v.is_client) === "1" ? "" : " hidden"}>Kode nasabah<input type="text" name="client_code" maxlength="30" value="${esc(v.client_code)}"></label>`
    + `<label class="consent"><input type="checkbox" name="consent" value="1" required${v.consent ? " checked" : ""}><span>${esc(c.text)}</span></label>`
    + `<div class="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>`
    + `<input type="hidden" name="ts" value="${esc(await formStamp(env))}">`
    // kode nasabah hanya tampil (dan wajib) kalau "Ya"
    + `<script>(function(){var f=document.currentScript.parentNode,c=document.getElementById("cc"),i=c.querySelector("input");function u(){var y=f.querySelector("input[name=is_client]:checked");y=y&&y.value==="1";c.hidden=!y;i.required=y}f.addEventListener("change",u);u()})()</script>`;
}
async function regPage(env, ev, { v = {}, error = "", status = 200 } = {}) {
  const block = await regBlocked(env, ev, normPhone(v.phone));
  if (block) return pubHtml(ev.title, `<div class="card">${evHead(ev)}<p class="note">${esc(block)}</p></div>`, status);
  return pubHtml(ev.title, `<div class="card">${evHead(ev)}${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}`
    + `<form method="post">${await regFields(env, v)}<button type="submit">Daftar</button></form></div>`, status);
}
const thanks = (ev) => pubHtml(ev.title, `<div class="card"><h1>Terima kasih, pendaftaran tercatat.</h1><p class="meta"><b>${esc(ev.title)}</b></p>`
  + `<p class="meta">${esc(tanggal(ev.date))} · ${esc(jam(ev))}</p><p class="meta">${ev.mode === "online" ? "Online" : esc(ev.place)}</p>`
  + (ev.mode === "online" && ev.online_url ? `<p class="note">Link acara: <a href="${esc(ev.online_url)}" rel="noopener">${esc(ev.online_url)}</a></p>` : "")
  + `<p class="descr">Tim kami akan menghubungi Anda lewat WhatsApp untuk konfirmasi.</p></div>`);
const notFound = () => pubHtml("Acara tidak ditemukan", `<div class="card"><h1>Acara tidak ditemukan.</h1><p class="descr">Periksa lagi link atau QR yang Anda pindai.</p></div>`, 404);
const formOf = async (request) => { const f = await request.formData().catch(() => null); return f ? Object.fromEntries([...f].map(([k, v]) => [k, String(v)])) : {}; };

/** Simpan / perbarui peserta (satu nomor HP satu baris per event). Status yang berubah tercatat di riwayat. */
async function upsertPerson(env, ev, d, { status, src, by, consentVer = null, walkin = 0 }) {
  const prev = await env.DB.prepare("SELECT id, status FROM people WHERE event_id = ? AND phone = ?").bind(ev.id, d.phone).first(), at = iso(env);
  const id = prev ? prev.id : crypto.randomUUID(), to = status || (prev && prev.status !== "batal" ? prev.status : "terdaftar");
  const Q = [prev
    ? env.DB.prepare("UPDATE people SET name = ?, email = COALESCE(NULLIF(?, ''), email), is_client = ?, client_code = ?, status = ?, consent_at = COALESCE(?, consent_at), consent_ver = COALESCE(?, consent_ver), updated_at = ?, updated_by = ? WHERE id = ?")
      .bind(d.name, d.email, d.is_client, d.client_code, to, consentVer == null ? null : at, consentVer, at, by, id)
    : env.DB.prepare("INSERT INTO people (id, event_id, name, phone, email, is_client, client_code, status, walkin, src, consent_at, consent_ver, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, ev.id, d.name, d.phone, d.email, d.is_client, d.client_code, to, walkin, src, consentVer == null ? null : at, consentVer ?? 0, at, at, by)];
  if (!prev || prev.status !== to) Q.push(env.DB.prepare("INSERT INTO history (person_id, at, by_name, from_status, to_status) VALUES (?, ?, ?, ?, ?)").bind(id, at, by, prev ? prev.status : "", to));
  await env.DB.batch(Q);
  return id;
}
async function register(request, env, ctx, ev) {
  if (!(await hit(env, request))) return pubHtml(ev.title, `<div class="card">${evHead(ev)}<p class="err" role="alert">Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.</p></div>`, 429);
  const v = await formOf(request);
  if (v.website) return thanks(ev);   // kolom jebakan terisi: bot
  if (!(await stampOk(env, v.ts))) return regPage(env, ev, { v, error: "Coba kirim lagi.", status: 400 });
  const d = cleanReg(v);
  if (d.error) return regPage(env, ev, { v, error: d.error, status: 400 });
  if (await regBlocked(env, ev, d.phone)) return regPage(env, ev, { v });
  const c = await getConsent(env);
  await upsertPerson(env, ev, d, { src: "form", by: "Daftar mandiri", consentVer: c.ver });
  await changed(env, ctx, ev.id);
  return thanks(ev);
}

/* =========================================================
   HALAMAN PUBLIK: absen /h/<kode absen>
   ========================================================= */
// absen dibuka 1 jam sebelum mulai sampai 2 jam setelah selesai (WIB)
const OPEN_BEFORE = 3600e3, CLOSE_AFTER = 2 * 3600e3;
/** Sedang dalam jendela absen acara ini? */
export const inWindow = (ev, nowMs) => nowMs >= wibMs(ev.date, ev.time_start) - OPEN_BEFORE && nowMs <= wibMs(ev.date, ev.time_end || ev.time_start) + CLOSE_AFTER;
function absenBlocked(env, ev) {
  if (ev.status === "batal") return "Acara ini dibatalkan.";
  if (ev.purged || now(env) > wibMs(ev.date, ev.time_end || ev.time_start) + CLOSE_AFTER) return "Absen sudah ditutup.";
  if (!inWindow(ev, now(env))) return "Absen belum dibuka.";
  return null;
}
// halaman absen tidak pernah menampilkan nama atau data peserta lain
async function absenPage(env, ev, { v = {}, error = "", walkin = false, status = 200 } = {}) {
  const block = absenBlocked(env, ev);
  if (block) return pubHtml(ev.title, `<div class="card">${evHead(ev)}<p class="note">${esc(block)}</p></div>`, status);
  const err = error ? `<p class="err" role="alert">${esc(error)}</p>` : "";
  if (walkin) return pubHtml(ev.title, `<div class="card">${evHead(ev)}${err}<p class="note">Nomor ini belum terdaftar. Isi data singkat di bawah untuk mencatat kehadiran.</p>`
    + `<form method="post">${await regFields(env, v)}<button type="submit">Catat kehadiran</button></form></div>`, status);
  return pubHtml(ev.title, `<div class="card">${evHead(ev)}<h2 style="font-size:18px;margin:20px 0 0">Absen kehadiran</h2>${err}<form method="post">`
    + `<label>Nomor HP (WhatsApp) yang dipakai saat mendaftar<input type="tel" name="phone" required inputmode="tel" autocomplete="tel" placeholder="08xx" value="${esc(v.phone)}"></label>`
    + `<div class="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>`
    + `<input type="hidden" name="ts" value="${esc(await formStamp(env))}"><button type="submit">Catat kehadiran</button></form></div>`, status);
}
const present = (ev) => pubHtml(ev.title, `<div class="card"><h1>Kehadiran tercatat.</h1><p class="meta"><b>${esc(ev.title)}</b></p><p class="meta">${esc(tanggal(ev.date))} · ${esc(jam(ev))}</p>`
  + (ev.mode === "online" && ev.online_url ? `<p class="note">Link acara: <a href="${esc(ev.online_url)}" rel="noopener">${esc(ev.online_url)}</a></p>` : "")
  + `<p class="descr">Terima kasih sudah hadir.</p></div>`);
async function checkIn(request, env, ctx, ev) {
  if (!(await hit(env, request, "h", ABSEN_PER_HOUR))) return pubHtml(ev.title, `<div class="card">${evHead(ev)}<p class="err" role="alert">Terlalu banyak percobaan dari jaringan ini. Coba lagi nanti.</p></div>`, 429);
  const v = await formOf(request);
  if (absenBlocked(env, ev)) return absenPage(env, ev);
  if (v.website) return present(ev);   // kolom jebakan terisi: bot
  const walkin = v.name !== undefined;
  if (!(await stampOk(env, v.ts))) return absenPage(env, ev, { v, walkin, error: "Coba kirim lagi.", status: 400 });
  const phone = normPhone(v.phone);
  if (!phone) return absenPage(env, ev, { v, walkin, error: "Nomor HP (WhatsApp) belum benar.", status: 400 });
  const p = await env.DB.prepare("SELECT id, status FROM people WHERE event_id = ? AND phone = ?").bind(ev.id, phone).first();
  if (p) {
    if (p.status !== "hadir") await env.DB.batch([
      env.DB.prepare("UPDATE people SET status = 'hadir', updated_at = ?, updated_by = 'Absen mandiri' WHERE id = ?").bind(iso(env), p.id),
      env.DB.prepare("INSERT INTO history (person_id, at, by_name, from_status, to_status) VALUES (?, ?, 'Absen mandiri', ?, 'hadir')").bind(p.id, iso(env), p.status)]);
    await changed(env, ctx, ev.id);
    return present(ev);
  }
  if (!walkin) return absenPage(env, ev, { v, walkin: true });
  const d = cleanReg(v);
  if (d.error) return absenPage(env, ev, { v, walkin: true, error: d.error, status: 400 });
  await upsertPerson(env, ev, d, { status: "hadir", src: "absen", by: "Absen mandiri (walk-in)", consentVer: (await getConsent(env)).ver, walkin: 1 });
  await changed(env, ctx, ev.id);
  return present(ev);
}

/* =========================================================
   API TIM: EVENT & PESERTA
   ========================================================= */
export const WA_DEFAULT = "Halo {nama}, terima kasih sudah mendaftar {acara} pada {tanggal} pukul {jam} di {tempat}. Mohon balas YA untuk konfirmasi kehadiran. Terima kasih.";
/** Teks konfirmasi WhatsApp: {nama} {acara} {tanggal} {jam} {tempat} {link}. Acara online tanpa {link} di template: link ditambahkan di akhir. */
export function waText(tpl, ev, person) {
  const on = ev.mode === "online", link = on ? String(ev.online_url || "") : "";
  const V = { nama: person.name || "", acara: ev.title || "", tanggal: tanggal(ev.date), jam: jam(ev), tempat: on ? "online" : ev.place || "", link };
  const t = String(tpl || WA_DEFAULT);
  return t.replace(/\{(nama|acara|tanggal|jam|tempat|link)\}/g, (_, k) => V[k]) + (link && !t.includes("{link}") ? "\nLink acara: " + link : "");
}
// kode link publik: tanpa huruf/angka yang mirip (l, o, 0, 1)
const ABC = "abcdefghijkmnpqrstuvwxyz23456789";
const newCode = () => [...crypto.getRandomValues(new Uint8Array(10))].map((x) => ABC[x % ABC.length]).join("");
const ISO = /^\d{4}-\d{2}-\d{2}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const cleanUrl = (v) => { const x = String(v ?? "").trim().slice(0, 500); return x && !/^https?:\/\//i.test(x) ? "https://" + x : x; };
/** Sesi + cabang: tiket lama tanpa cabang memakai cabang di daftar anggota dari Tool Hub. */
async function whoAmI(env, me) {
  const e = lower(me.e);
  if (me.c) return { ...me, e };
  const U = (await cfgGet(env, "users")) || [], u = U.find((x) => x.email === e);
  return { ...me, e, c: (u && u.branch) || "" };
}
async function visibleEvent(env, me, org, id) {
  const ev = await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(String(id || "")).first();
  return ev && canSee(me, ev, org) ? ev : null;
}
/** Isian event -> baris yang sah atau { error }. Cabang: Sales / GI coordinator hanya cabangnya; Head regional & admin cabang di daftar; lainnya tanpa cabang. */
async function cleanEvent(env, me, org, b) {
  const s = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const ev = { title: s(b.title, 160), mode: b.mode === "online" ? "online" : "tatap", date: s(b.date, 10), time_start: s(b.time_start, 5), time_end: s(b.time_end, 5),
    place: s(b.place, 200), online_url: cleanUrl(b.online_url), descr: String(b.descr ?? "").trim().slice(0, 2000), wa_tpl: String(b.wa_tpl ?? "").trim().slice(0, 1000),
    quota: Math.max(0, Math.round(Number(String(b.quota ?? "").replace(/\D/g, "")) || 0)) || null, open: b.open === false || b.open === 0 || b.open === "0" ? 0 : 1,
    status: b.status === "batal" ? "batal" : "aktif", branch: s(b.branch, 60), region: "" };
  if (!ev.title) return { error: "Judul acara belum diisi." };
  if (!ISO.test(ev.date) || isNaN(Date.parse(ev.date))) return { error: "Tanggal acara belum benar." };
  if (!HM.test(ev.time_start)) return { error: "Jam mulai belum benar." };
  if (!HM.test(ev.time_end) || ev.time_end <= ev.time_start) return { error: "Jam selesai harus setelah jam mulai." };
  if (ev.mode === "online" && !ev.online_url) return { error: "Link acara online belum diisi." };
  if (ev.mode === "tatap" && !ev.place) return { error: "Lokasi acara belum diisi." };
  if (ev.mode === "tatap") ev.online_url = "";
  const reg = isRegional(org, me.j, me.adm), head = !!(roleIn(org, me.j) || {}).head;
  if (!reg && !me.adm) ev.branch = "";
  if (reg && !head && ev.branch !== me.c) return { error: me.c ? "Cabang ini bukan cabangmu." : "Cabangmu belum diatur admin Tool Hub." };
  if (reg && !ev.branch) return { error: "Pilih cabang acara." };
  if (ev.branch) {
    const B = await getBranches(env), h = B.find((x) => x.c === ev.branch);
    if (!h && (head || me.adm)) return { error: "Cabang tidak ada di daftar." };
    ev.region = h ? h.r : "";
  }
  return ev;
}
/** Simpan event. b.link = { item_id } / { create: true }: sambungkan ke kegiatan Content Planner (kalau belum tersambung).
 *  Event yang sudah tersambung: judul, tanggal, jam, tempat, cabang, dan batal ikut ke kegiatannya. Planner tidak bisa dihubungi -> event tetap tersimpan, dengan warn. */
async function saveEvent(env, ctx, me, org, b) {
  const ev = await cleanEvent(env, me, org, b);
  if (ev.error) return ev;
  const at = iso(env), link = b.link && typeof b.link === "object" && (b.link.item_id || b.link.create) ? { item_id: String(b.link.item_id || ""), create: !b.link.item_id } : null;
  const prev = b.id ? await visibleEvent(env, me, org, b.id) : null;
  if (b.id && !prev) return { error: "Event tidak ditemukan.", status: 404 };
  const linked = prev && prev.item_id && !prev.item_gone;
  if (link && link.item_id && !linked) { const bad = await checkChoice(env, me, ev, link.item_id); if (bad) return bad; }
  let res, row;
  if (prev) {
    const K = Object.keys(ev);
    await env.DB.prepare(`UPDATE events SET ${K.map((k) => k + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...K.map((k) => ev[k]), at, prev.id).run();
    res = { id: prev.id, code: prev.code, acode: prev.acode }; row = { ...prev, ...ev };
  } else {
    row = { ...ev, id: crypto.randomUUID(), code: newCode(), acode: newCode(), creator_email: me.e, creator_name: String(me.n || me.e).slice(0, 60), creator_job: me.j || "",
      creator_team: (teamIn(org, me.j) || {}).id || "", created_at: at, updated_at: at };
    const K = Object.keys(row);
    await env.DB.prepare(`INSERT INTO events (${K.join(", ")}) VALUES (${K.map(() => "?").join(", ")})`).bind(...K.map((k) => row[k])).run();
    res = { id: row.id, code: row.code, acode: row.acode };
  }
  try {
    if (linked) await plannerSync(env, row, { set: itemSet(row) });
    else if (link) await linkItem(env, me, row, link);
  } catch (e) {
    console.log("sambungan Planner gagal:", e.message);
    res.warn = "Event tersimpan, tapi belum tersambung ke Content Planner (" + e.message + "). Simpan lagi nanti untuk menyambungkan.";
  }
  return res;
}
async function listEvents(env, me, org) {
  const L = (await env.DB.prepare("SELECT * FROM events ORDER BY date DESC, time_start DESC LIMIT 2000").all()).results;
  return L.filter((ev) => canSee(me, ev, org));
}
/** POST /api/people: { id, status } = ubah status; selain itu tambah / ubah data peserta (tambah manual oleh Sales). */
async function savePerson(env, ctx, me, org, b) {
  const by = String(me.n || me.e).slice(0, 60);
  if (b.id && b.status !== undefined && b.name === undefined) {
    const p = await env.DB.prepare("SELECT * FROM people WHERE id = ?").bind(String(b.id)).first();
    const ev = p && await visibleEvent(env, me, org, p.event_id);
    if (!ev) return { error: "Peserta tidak ditemukan.", status: 404 };
    if (!STATUSES[b.status]) return { error: "Status tidak dikenal." };
    if (p.status !== b.status) await env.DB.batch([
      env.DB.prepare("UPDATE people SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?").bind(b.status, iso(env), by, p.id),
      env.DB.prepare("INSERT INTO history (person_id, at, by_name, from_status, to_status) VALUES (?, ?, ?, ?, ?)").bind(p.id, iso(env), by, p.status, b.status)]);
    await changed(env, ctx, ev.id);
    return { ok: true };
  }
  const ev = await visibleEvent(env, me, org, b.event_id);
  if (!ev) return { error: "Event tidak ditemukan.", status: 404 };
  if (ev.purged) return { error: "Data peserta acara ini sudah dihapus." };
  const d = cleanReg(b, { consent: false });
  if (d.error) return d;
  if (b.id) {
    const p = await env.DB.prepare("SELECT * FROM people WHERE id = ? AND event_id = ?").bind(String(b.id), ev.id).first();
    if (!p) return { error: "Peserta tidak ditemukan.", status: 404 };
    const dup = await env.DB.prepare("SELECT id FROM people WHERE event_id = ? AND phone = ? AND id <> ?").bind(ev.id, d.phone, p.id).first();
    if (dup) return { error: "Nomor HP ini sudah terdaftar di acara ini." };
    await env.DB.prepare("UPDATE people SET name = ?, phone = ?, email = ?, is_client = ?, client_code = ?, updated_at = ?, updated_by = ? WHERE id = ?")
      .bind(d.name, d.phone, d.email, d.is_client, d.client_code, iso(env), by, p.id).run();
    await changed(env, ctx, ev.id);
    return { id: p.id };
  }
  const id = await upsertPerson(env, ev, d, { src: "manual", by });
  await changed(env, ctx, ev.id);
  return { id };
}
async function deletePerson(env, ctx, me, org, id) {
  if (!canDelete(me, org)) return { error: "Hanya admin atau Head yang bisa menghapus peserta.", status: 403 };
  const p = await env.DB.prepare("SELECT id, event_id FROM people WHERE id = ?").bind(String(id || "")).first();
  const ev = p && await visibleEvent(env, me, org, p.event_id);
  if (!ev) return { error: "Peserta tidak ditemukan.", status: 404 };
  await env.DB.batch([env.DB.prepare("DELETE FROM history WHERE person_id = ?").bind(p.id), env.DB.prepare("DELETE FROM people WHERE id = ?").bind(p.id)]);
  await changed(env, ctx, ev.id);
  return { ok: true };
}
async function saveConsent(env, b) {
  const text = String(b.consent ?? "").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!text) return { error: "Teks persetujuan belum diisi." };
  const c = { ver: (await getConsent(env)).ver + 1, text };
  await cfgPut(env, "consent", c).run();
  return { consent: c };
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
    // halaman publik: tanpa login, tanpa bingkai Tool Hub
    const pm = /^\/d\/([a-z0-9]{6,20})$/.exec(path);
    if (pm) {
      await ensure(env);
      const ev = await env.DB.prepare("SELECT * FROM events WHERE code = ?").bind(pm[1]).first();
      if (!ev) return notFound();
      return request.method === "POST" ? register(request, env, ctx, ev) : regPage(env, ev);
    }
    const hm = /^\/h\/([a-z0-9]{6,20})$/.exec(path);
    if (hm) {
      await ensure(env);
      const ev = await env.DB.prepare("SELECT * FROM events WHERE acode = ?").bind(hm[1]).first();
      if (!ev) return notFound();
      return request.method === "POST" ? checkIn(request, env, ctx, ev) : absenPage(env, ev);
    }
    if (path === "/logout") return HUBSSO.logout(env);
    if (!HUBSSO.ready(env)) return HUBSSO.notReady();
    const tk = await HUBSSO.ticket(request, env); if (tk) return tk;
    const sess = await HUBSSO.user(request, env);
    if (!sess) return path.startsWith("/api/") ? json({ error: "Sesi habis. Muat ulang halaman." }, 401) : HUBSSO.login(request, env);
    await ensure(env);
    const me = await whoAmI(env, sess), org = await getOrg(env);
    try {
      if (request.method === "GET") {
        if (path === "/api/events") return json(await listEvents(env, me, org));
        if (path === "/api/people") {
          const ev = await visibleEvent(env, me, org, url.searchParams.get("event"));
          if (!ev) return json({ error: "Event tidak ditemukan." }, 404);
          const P = (await env.DB.prepare("SELECT * FROM people WHERE event_id = ? ORDER BY created_at DESC").bind(ev.id).all()).results;
          return json({ event: ev, people: P, waDefault: WA_DEFAULT, canDelete: canDelete(me, org) });
        }
        if (path === "/api/settings") return me.adm ? json({ consent: await getConsent(env) }) : json({ error: "Khusus admin." }, 403);
        if (path === "/api/planner-items") {
          // Sales / GI coordinator: cabangnya sendiri; Head regional & admin: cabang yang dipilih di form; lainnya: kegiatan Edukasi miliknya
          const reg = isRegional(org, me.j, me.adm), head = !!(roleIn(org, me.j) || {}).head;
          const branch = reg && !head ? me.c : reg || me.adm ? String(url.searchParams.get("branch") || "") : "";
          try { return json(await plannerChoices(env, me, kindFor(branch), branch)); } catch (e) { return json({ error: "Content Planner tidak bisa dihubungi." }, 502); }
        }
      }
      if (request.method === "POST" && path.startsWith("/api/")) {
        if (!HUBSSO.sameOrigin(request)) return json({ error: "Permintaan ditolak." }, 403);
        const b = await request.json().catch(() => ({}));
        if (path === "/api/events") return out(await saveEvent(env, ctx, me, org, b));
        if (path === "/api/people") return out(await savePerson(env, ctx, me, org, b));
        if (path === "/api/people/delete") return out(await deletePerson(env, ctx, me, org, b.id));
        if (path === "/api/settings") return me.adm ? out(await saveConsent(env, b)) : json({ error: "Khusus admin." }, 403);
      }
    } catch (e) {
      return json({ error: "Gagal: " + (e.message || e) }, 500);
    }
    return new Response("Tidak ditemukan", { status: 404 });
  },
};
