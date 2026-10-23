// Content Planner — Cloudflare Worker
// - "/"            -> Kalender kegiatan tim: konten sosmed, artikel, edukasi/narasumber, dan tugas desain; laporan PPT/PDF (di browser)
// - "/paket"       -> Paket konten mingguan: rangkuman reksa dana, obligasi, dan agenda minggu depan + draf caption/email
// - "/api/items"   -> kegiatan (GET ?from=&to=, GET ?design=1 tugas desain, POST simpan, POST /api/items/delete hapus)
// - "/api/users"   -> anggota tim + role pekerjaannya (dari Tool Hub: tiket SSO & POST /__hub/users)
// - "/api/tasks"   -> tugas di dalam program (GET ?item= / ?mine=1 / ?all=1, POST simpan, POST /api/tasks/delete)
//                     hanya Partnership & admin yang memberi tugas; penerima boleh mengubah status & link hasilnya
// - "/api/programs", "/api/program-report" -> daftar program & data laporan program (PDF/PPT disusun di browser)
// - "/__hub/users" (POST) -> daftar anggota dari Tool Hub; "/__hub/notif" (POST) -> tandai notifikasi sudah dibaca
// - "/__hub/item" (POST) -> kegiatan dari tool lain (Content Insight: konsep konten); "/__hub/members" (GET) -> daftar anggota
// - "/api/weekly"  -> data paket mingguan (disusun saat diminta, cache 10 menit)
// - "/__hub/today" -> ringkasan hari ini + tugas & notifikasi untuk beranda Tool Hub (service binding, lihat shared/hubfeed.js)
// - "/api/approval" (POST) -> penyetuju menyetujui / meminta revisi konten; "/api/approvals" (GET) -> menunggu persetujuanku
// - "/api/comments" -> komentar & riwayat persetujuan per kegiatan (GET ?item=, POST)
// - "/api/moments"  -> kalender momen (shared/moments.js) + momen tim (GET ?from=&to=, POST, POST /api/moments/delete)
// - "/api/links"    -> link pelacak klik per konten (GET ?item=, POST); "/go/<kode>" (publik) -> hitung klik lalu alihkan
// - "/api/metrics/import" (POST) -> angka performa dari CSV Meta Business Suite, dicocokkan lewat link postingan
// Persetujuan: konten & artikel yang punya penyetuju harus disetujui sebelum berstatus Terbit; caption yang diubah setelah
// disetujui kembali menunggu persetujuan. Cek kepatuhan caption memakai shared/compliance.js (glosarium dari Copy Studio).
// Notifikasi (tabel notifs) dibuat saat seseorang ditugaskan, saat status tugasnya berubah, dan saat tenggat dekat
// (pengingat tenggat dibuat ketika beranda Tool Hub meminta ringkasan, jadi tidak perlu cron).
// Semua halaman & data hanya untuk yang login lewat Tool Hub. Semua yang punya akses boleh menambah & mengubah;
// menghapus hanya admin Tool Hub atau pembuat kegiatan itu sendiri.
//
// Sumber paket mingguan (semua sudah ada, tidak menarik data baru):
//   Fund Insight (service binding FUND): daftar RD + return (/api/funds), gerak harian tidak biasa (/api/stab)
//   Fund Insight (D1 FUND_DB, hanya dibaca): NAB seminggu lalu (return 1 minggu), agenda yang ditambahkan tim
//   Bond Insight (service binding BOND): obligasi (/data/bonds.json) dan riwayat yield (/data/history.json)
//   Story Generator (GitHub): agenda makro (data/macro.js + public/calendar.json), sama seperti agenda di Fund Insight
import { title, profileScript, appUrl, profile } from "../../shared/profile.js";
import { themeHead } from "../../shared/theme.js";
import { macroItems, macroUrls } from "../../shared/macro.js";
import { HUB_FEED, hubFeedAllowed, hubPushAllowed } from "../../shared/hubfeed.js";
import { JOBS, canAssign } from "../../shared/jobs.js";
import { complianceScript } from "../../shared/compliance.js";
import { momentsBetween, TYPES as MOMENT_TYPES } from "../../shared/moments.js";
import PAGE from "./page.html";

/* =========================================================
   LOGIN LEWAT TOOL HUB
   ========================================================= */
const HUBSSO = (() => {
  const APP = "planner", COOKIE = "hub_" + APP, HOURS = 8, te = new TextEncoder();
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
   KEGIATAN (D1: planner-db)
   ========================================================= */
// Tiga jenis kegiatan, masing-masing dengan kanal/format dan alur statusnya sendiri.
export const KINDS = {
  konten: { label: "Konten sosmed", channels: ["IG Story", "IG Feed", "IG Reels", "TikTok", "YouTube", "WA Broadcast", "WA Channel", "Lainnya"], statuses: ["ide", "draf", "review", "terbit"] },
  artikel: { label: "Artikel", channels: ["Website", "Blog", "Email / Newsletter", "Media partner", "Lainnya"], statuses: ["ide", "draf", "review", "terbit"] },
  edukasi: { label: "Edukasi / narasumber", channels: ["Webinar", "Seminar", "Talkshow", "Kelas / kunjungan", "Live IG / TikTok", "Lainnya"], statuses: ["rencana", "konfirmasi", "selesai", "batal"] },
  // dibuat Partnership: kerja sama dengan pihak luar; kegiatan lain bisa dikaitkan (program_id) dan tugas dibagi di dalamnya
  program: { label: "Program partnership", channels: ["Komunitas", "Kampus / sekolah", "Korporasi", "Media partner", "Event / pameran", "Lainnya"], statuses: ["rencana", "berjalan", "selesai", "batal"] },
};
export const EDU_ROLES = ["Narasumber", "Moderator", "Penyelenggara", "Peserta"];
export const DESIGN_STATUSES = ["belum", "proses", "revisi", "selesai"];
// role pekerjaan anggota tim, diatur di Tool Hub (menentukan tampilan bawaan, pilihan penerima tugas, & pengelompokan di laporan)
export const ROLES = JOBS;
const DSL = { belum: "Belum mulai", proses: "Dikerjakan", revisi: "Revisi", selesai: "Selesai" };
// angka hasil program: peserta (result_num), jangkauan, leads, akun baru, nilai transaksi/AUM (Rp), anggaran & biaya (Rp)
export const PROGRAM_NUMS = ["reach", "leads", "accounts", "aum", "budget", "cost"];
const ISO = /^\d{4}-\d{2}-\d{2}$/, EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Kolom selain id/date/title. Tabel versi pertama dibuat tanpa sebagian kolom ini; ensure() menambahkannya tanpa menyentuh isi.
const COLS = {
  kind: "TEXT", channel: "TEXT", status: "TEXT", owner: "TEXT", owner_email: "TEXT", note: "TEXT", link: "TEXT",
  time: "TEXT", place: "TEXT", role: "TEXT", audience: "TEXT", result_num: "INTEGER", result_note: "TEXT",
  d_need: "INTEGER", d_who: "TEXT", d_name: "TEXT", d_due: "TEXT", d_status: "TEXT", d_link: "TEXT", d_brief: "TEXT",
  program_id: "TEXT", partner: "TEXT", end_date: "TEXT", goal: "TEXT", target: "TEXT",
  reach: "INTEGER", leads: "INTEGER", accounts: "INTEGER", aum: "INTEGER", budget: "INTEGER", cost: "INTEGER",
  // konten & artikel: caption/naskah final, penyetuju & status persetujuan, angka performa setelah terbit
  copy: "TEXT", approver: "TEXT", approver_email: "TEXT", approval: "TEXT", approval_note: "TEXT", approved_by: "TEXT", approved_at: "TEXT",
  m_views: "INTEGER", m_reach: "INTEGER", m_likes: "INTEGER", m_comments: "INTEGER", m_saves: "INTEGER", m_shares: "INTEGER", m_follows: "INTEGER", m_at: "TEXT", m_src: "TEXT",
  created_by: "TEXT", created_email: "TEXT", created_at: "TEXT", updated_by: "TEXT", updated_at: "TEXT",
};
// kolom persetujuan & asal angka hanya diisi server (approvalStep, /api/approval, impor CSV), bukan dari form
const SERVER_COLS = ["approval", "approval_note", "approved_by", "approved_at", "m_at", "m_src"];
const EDIT = ["date", "title", ...Object.keys(COLS).filter((k) => !/^(created_|updated_)/.test(k) && !SERVER_COLS.includes(k))];
/** Kegiatan yang punya caption, persetujuan, dan angka performa. */
export const COPY_KINDS = ["konten", "artikel"];
export const METRICS = ["m_views", "m_reach", "m_likes", "m_comments", "m_saves", "m_shares", "m_follows"];
export const APPROVAL = { menunggu: "Menunggu persetujuan", disetujui: "Disetujui", revisi: "Perlu revisi" };
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, date TEXT NOT NULL, title TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, role TEXT, seen_at TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, title TEXT NOT NULL, job TEXT, who TEXT, who_name TEXT, due TEXT, status TEXT, brief TEXT, link TEXT, by_email TEXT, by_name TEXT, created_at TEXT, updated_at TEXT, done_at TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS notifs (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, at TEXT, kind TEXT, title TEXT, body TEXT, item_id TEXT, by_name TEXT, nkey TEXT UNIQUE, read_at TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id TEXT NOT NULL, at TEXT, by_name TEXT, by_email TEXT, kind TEXT, text TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS moments (id TEXT PRIMARY KEY, date TEXT NOT NULL, name TEXT NOT NULL, idea TEXT, created_by TEXT, created_email TEXT, created_at TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS links (code TEXT PRIMARY KEY, item_id TEXT, target TEXT NOT NULL, clicks INTEGER DEFAULT 0, created_by TEXT, created_email TEXT, created_at TEXT)"),
  ]);
  const have = new Set((await env.DB.prepare("PRAGMA table_info(items)").all()).results.map((c) => c.name));
  const uhave = new Set((await env.DB.prepare("PRAGMA table_info(users)").all()).results.map((c) => c.name));
  const add = Object.entries(COLS).filter(([k]) => !have.has(k)).map(([k, t]) => env.DB.prepare(`ALTER TABLE items ADD COLUMN ${k} ${t}`));
  // active: 1 = ada di daftar anggota Tool Hub, 0 = sudah tidak (tidak tampil sebagai pilihan); kosong = belum pernah disinkronkan
  if (!uhave.has("active")) add.push(env.DB.prepare("ALTER TABLE users ADD COLUMN active INTEGER"));
  add.push(env.DB.prepare("CREATE INDEX IF NOT EXISTS items_date ON items (date)"), env.DB.prepare("CREATE INDEX IF NOT EXISTS items_design ON items (d_need, d_status)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS items_program ON items (program_id)"), env.DB.prepare("CREATE INDEX IF NOT EXISTS tasks_who ON tasks (who, status)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS tasks_item ON tasks (item_id)"), env.DB.prepare("CREATE INDEX IF NOT EXISTS notifs_email ON notifs (email, id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS comments_item ON comments (item_id, id)"), env.DB.prepare("CREATE INDEX IF NOT EXISTS links_item ON links (item_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS moments_date ON moments (date)"));
  await env.DB.batch(add);
  ready = true;
}
const who = (me) => me.n || me.u || me.e;
const lower = (s) => String(s || "").toLowerCase();
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (s) => { const d = new Date(String(s) + "T00:00:00Z"); return isNaN(d) ? String(s || "") : d.getUTCDate() + " " + BULAN[d.getUTCMonth()]; };
const cleanUrl = (v) => { const x = String(v ?? "").trim().slice(0, 500); return x && !/^https?:\/\//i.test(x) ? "https://" + x : x; };
const numOf = (v) => { const t = String(v ?? "").trim(); if (!t) return null; const n = Math.round(Number(t.replace(/[.\s]/g, "").replace(",", "."))); return n >= 0 && n < 1e15 ? n : null; };
/** Isian dari browser -> baris yang sah, atau { error }. */
export function cleanItem(b) {
  const s = (v, n) => String(v ?? "").trim().slice(0, n);
  const url = (v) => { const x = s(v, 500); return x && !/^https?:\/\//i.test(x) ? "https://" + x : x; };
  const kind = KINDS[b.kind] ? b.kind : "konten", K = KINDS[kind];
  const it = {
    kind, date: s(b.date, 10), title: s(b.title, 160), channel: s(b.channel, 40), status: s(b.status, 12),
    owner: s(b.owner, 60), owner_email: EMAIL.test(s(b.owner_email, 120)) ? s(b.owner_email, 120).toLowerCase() : "",
    note: s(b.note, 4000), link: url(b.link), time: "", place: "", role: "", audience: "", result_num: null, result_note: s(b.result_note, 300),
    d_need: b.d_need ? 1 : 0, d_who: "", d_name: "", d_due: "", d_status: "", d_link: "", d_brief: "",
    program_id: s(b.program_id, 40), partner: "", end_date: "", goal: "", target: "", reach: null, leads: null, accounts: null, aum: null, budget: null, cost: null,
    copy: "", approver: "", approver_email: "", ...Object.fromEntries(METRICS.map((k) => [k, null])),
  };
  if (COPY_KINDS.includes(kind)) {
    it.copy = s(b.copy, 6000);
    it.approver_email = EMAIL.test(s(b.approver_email, 120)) ? s(b.approver_email, 120).toLowerCase() : "";
    it.approver = it.approver_email ? s(b.approver, 60) : "";
    for (const k of METRICS) it[k] = numOf(b[k]);
  }
  if (!ISO.test(it.date) || isNaN(Date.parse(it.date))) return { error: "Tanggal belum diisi." };
  if (!it.title) return { error: "Judul belum diisi." };
  if (!K.channels.includes(it.channel)) it.channel = "Lainnya";
  if (!K.statuses.includes(it.status)) it.status = K.statuses[0];
  const n = Math.round(Number(String(b.result_num ?? "").replace(/[.\s]/g, "").replace(",", ".")));
  it.result_num = String(b.result_num ?? "").trim() !== "" && n >= 0 && n < 1e12 ? n : null;
  // konten sosmed: angka hasil di laporan = jangkauan (atau views) dari angka performa
  if (kind === "konten" && (it.m_reach ?? it.m_views) != null) it.result_num = it.m_reach ?? it.m_views;
  if (kind === "edukasi") {
    it.time = /^\d{2}:\d{2}$/.test(s(b.time, 5)) ? s(b.time, 5) : "";
    it.place = s(b.place, 160); it.audience = s(b.audience, 160);
    it.role = EDU_ROLES.includes(b.role) ? b.role : EDU_ROLES[0];
  }
  if (kind === "program") {
    // program tidak bisa menjadi bagian dari program lain; pekerjaan untuk orang lain lewat tugas, bukan permintaan visual
    it.program_id = ""; it.d_need = 0;
    it.partner = s(b.partner, 120); it.goal = s(b.goal, 1000); it.target = s(b.target, 300);
    const end = s(b.end_date, 10);
    it.end_date = ISO.test(end) && end >= it.date ? end : it.date;
    for (const k of PROGRAM_NUMS) it[k] = numOf(b[k]);
  }
  if (it.d_need) {
    it.d_who = EMAIL.test(s(b.d_who, 120)) ? s(b.d_who, 120).toLowerCase() : "";
    it.d_name = s(b.d_name, 60); it.d_brief = s(b.d_brief, 2000); it.d_link = url(b.d_link);
    it.d_due = ISO.test(s(b.d_due, 10)) ? s(b.d_due, 10) : it.date;
    it.d_status = DESIGN_STATUSES.includes(b.d_status) ? b.d_status : "belum";
  }
  return it;
}
// total klik link pelacak per kegiatan
const CLICKS = "(SELECT SUM(clicks) FROM links WHERE links.item_id = items.id) AS clicks";
async function listItems(env, from, to) {
  await ensure(env);
  if (!ISO.test(from) || !ISO.test(to)) return [];
  return (await env.DB.prepare(`SELECT items.*, ${CLICKS} FROM items WHERE date >= ? AND date <= ? ORDER BY date, time, created_at`).bind(from, to).all()).results;
}
/** Tugas desain: semua yang belum selesai (tanggal berapa pun) + yang selesai dengan tenggat di rentang itu. */
async function designItems(env, from, to) {
  await ensure(env);
  return (await env.DB.prepare("SELECT * FROM items WHERE d_need = 1 AND (COALESCE(d_status, 'belum') <> 'selesai' OR COALESCE(d_due, date) BETWEEN ? AND ?) ORDER BY COALESCE(d_due, date), created_at LIMIT 500")
    .bind(ISO.test(from) ? from : "0000-00-00", ISO.test(to) ? to : "9999-12-31").all()).results;
}
async function saveItem(env, me, b) {
  await ensure(env);
  const it = cleanItem(b);
  if (it.error) return it;
  const now = new Date().toISOString(), by = who(me), meE = lower(me.e), vals = EDIT.map((k) => it[k] ?? null);
  const prev = b.id ? await env.DB.prepare("SELECT * FROM items WHERE id=?").bind(String(b.id)).first() : null;
  if (b.id && !prev) return { error: "Kegiatan ini sudah dihapus orang lain. Muat ulang kalender." };
  if ((it.kind === "program" || (prev && prev.kind === "program")) && !canAssign(await jobOf(env, me), me.adm)) return { error: "Program hanya bisa dibuat dan diubah oleh Partnership atau admin." };
  const ap = approvalStep(prev, it, meE, by);
  if (ap.error) return ap;
  const mChanged = METRICS.some((k) => (it[k] ?? null) !== ((prev && prev[k]) ?? null));
  const srv = { ...ap.cols, m_at: mChanged ? now : (prev && prev.m_at) || null, m_src: mChanged ? "manual" : (prev && prev.m_src) || null }, svals = SERVER_COLS.map((k) => srv[k] ?? null);
  let id = prev ? prev.id : "";
  if (prev) {
    const r = await env.DB.prepare(`UPDATE items SET ${[...EDIT, ...SERVER_COLS].map((k) => k + "=?").join(", ")}, updated_by=?, updated_at=? WHERE id=?`).bind(...vals, ...svals, by, now, id).run();
    if (!r.meta.changes) return { error: "Kegiatan ini sudah dihapus orang lain. Muat ulang kalender." };
  } else {
    id = crypto.randomUUID();
    const cols = ["id", ...EDIT, ...SERVER_COLS, "created_by", "created_email", "created_at", "updated_by", "updated_at"];
    await env.DB.prepare(`INSERT INTO items (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(",")})`).bind(id, ...vals, ...svals, by, meE, now, by, now).run();
  }
  await notify(env, [...itemNotifs(prev, it, id, meE, by), ...ap.notifs.map((n) => ({ ...n, item_id: id }))]).catch((e) => console.error("notify:", e.message));
  return { id };
}
/**
 * Status persetujuan setelah kegiatan disimpan. Fungsi murni.
 * - penyetuju baru -> mulai dari awal; status Review -> menunggu persetujuan (penyetuju dapat notifikasi)
 * - caption/judul diubah setelah disetujui (sebelum terbit) -> menunggu lagi
 * - pindah ke Terbit hanya bila sudah disetujui; kembali ke Ide/Draf -> permintaan yang menunggu dibatalkan
 * Hasil: { cols: {approval, approval_note, approved_by, approved_at}, notifs } atau { error }.
 */
export function approvalStep(prev, it, meE, by) {
  const P = prev || {}, none = { cols: { approval: "", approval_note: "", approved_by: "", approved_at: "" }, notifs: [] };
  if (!COPY_KINDS.includes(it.kind) || !it.approver_email) return none;
  const was = P.approver_email === it.approver_email ? P.approval || "" : "", published = P.status === "terbit";
  let a = was, note = P.approver_email === it.approver_email ? P.approval_note || "" : "";
  const changed = was === "disetujui" && !published && ((P.copy || "") !== (it.copy || "") || (P.title || "") !== (it.title || ""));
  if (changed) a = "menunggu";
  if (it.status === "review" && (a === "" || a === "revisi")) a = "menunggu";
  if ((it.status === "ide" || it.status === "draf") && a === "menunggu") a = "";
  if (!published && it.status === "terbit" && a !== "disetujui")
    return { error: `Konten ini perlu disetujui ${it.approver || it.approver_email} sebelum berstatus Terbit. Ubah status ke Review untuk meminta persetujuan.` };
  const notifs = [];
  if (a === "menunggu" && was !== "menunggu") {
    note = changed ? "Diubah setelah disetujui" : "";
    if (it.approver_email !== meE) notifs.push({ email: it.approver_email, kind: "approval", title: (changed ? "Cek ulang: " : "Minta persetujuan: ") + it.title, body: `${(KINDS[it.kind] || {}).label || "Konten"} · tayang ${tgl(it.date)} · dari ${by}`, by });
  }
  const ok = a === "disetujui";
  return { cols: { approval: a, approval_note: a ? note : "", approved_by: ok ? P.approved_by || "" : "", approved_at: ok ? P.approved_at || "" : "" }, notifs };
}
/** Penyetuju memutuskan: { id, action: "setujui" | "revisi", note, checked }. */
async function decide(env, me, b) {
  await ensure(env);
  const it = await env.DB.prepare("SELECT * FROM items WHERE id=?").bind(String(b.id || "")).first();
  if (!it) return { error: "Kegiatan ini sudah dihapus." };
  const meE = lower(me.e), by = who(me), now = new Date().toISOString(), note = String(b.note ?? "").trim().slice(0, 1000);
  if (it.approver_email !== meE && !me.adm) return { error: "Hanya penyetuju konten ini yang bisa memutuskan." };
  let st;
  if (b.action === "setujui") {
    if (it.approval !== "menunggu") return { error: "Konten ini tidak sedang menunggu persetujuan." };
    if (b.checked !== true) return { error: "Centang dulu bahwa caption sudah dicek kepatuhannya." };
    st = env.DB.prepare("UPDATE items SET approval='disetujui', approval_note=?, approved_by=?, approved_at=? WHERE id=?").bind(note, by, now, it.id);
  } else if (b.action === "revisi") {
    if (!note) return { error: "Tulis catatan revisinya." };
    if (it.approval !== "menunggu" && it.approval !== "disetujui") return { error: "Konten ini tidak sedang menunggu persetujuan." };
    st = env.DB.prepare("UPDATE items SET approval='revisi', approval_note=?, approved_by='', approved_at='', status = CASE WHEN status = 'review' THEN 'draf' ELSE status END WHERE id=?").bind(note, it.id);
  } else return { error: "Aksi tidak dikenal." };
  const ok = b.action === "setujui";
  await env.DB.batch([st, env.DB.prepare("INSERT INTO comments (item_id, at, by_name, by_email, kind, text) VALUES (?, ?, ?, ?, ?, ?)").bind(it.id, now, by, meE, ok ? "disetujui" : "revisi", note)]);
  const to = it.owner_email || it.created_email;
  if (to && to !== meE) await notify(env, [{ email: to, kind: "approval", title: (ok ? "Disetujui: " : "Perlu revisi: ") + it.title, body: (note ? note.slice(0, 120) + " · " : "") + "oleh " + by, item_id: it.id, by }]).catch((e) => console.error("notify:", e.message));
  return { ok: true };
}
async function listComments(env, item) {
  await ensure(env);
  return (await env.DB.prepare("SELECT id, at, by_name, by_email, kind, text FROM comments WHERE item_id=? ORDER BY id LIMIT 200").bind(String(item || "")).all()).results;
}
/** Komentar baru -> notifikasi ke penanggung jawab, penyetuju, dan pembuat (selain penulis komentar). */
async function addComment(env, me, b) {
  await ensure(env);
  const text = String(b.text ?? "").trim().slice(0, 2000), meE = lower(me.e), by = who(me);
  if (!text) return { error: "Komentar masih kosong." };
  const it = await env.DB.prepare("SELECT id, title, owner_email, approver_email, created_email FROM items WHERE id=?").bind(String(b.item_id || "")).first();
  if (!it) return { error: "Kegiatan ini sudah dihapus." };
  await env.DB.prepare("INSERT INTO comments (item_id, at, by_name, by_email, kind, text) VALUES (?, ?, ?, ?, 'komentar', ?)").bind(it.id, new Date().toISOString(), by, meE, text).run();
  const to = [...new Set([it.owner_email, it.approver_email, it.created_email].filter((e) => e && e !== meE))];
  await notify(env, to.map((email) => ({ email, kind: "comment", title: "Komentar: " + it.title, body: `${by}: ${text.slice(0, 120)}`, item_id: it.id, by }))).catch((e) => console.error("notify:", e.message));
  return { ok: true };
}
async function myApprovals(env, me) {
  await ensure(env);
  return (await env.DB.prepare("SELECT id, kind, title, date, channel, status, owner, approval_note FROM items WHERE approver_email=? AND approval='menunggu' ORDER BY date LIMIT 50").bind(lower(me.e)).all()).results;
}

/* =========================================================
   MOMEN, LINK PELACAK, ANGKA PERFORMA
   ========================================================= */
async function moments(env, from, to) {
  if (!ISO.test(from) || !ISO.test(to)) return [];
  await ensure(env);
  const team = (await env.DB.prepare("SELECT id, date, name, idea, created_by, created_email FROM moments WHERE date BETWEEN ? AND ? ORDER BY date LIMIT 300").bind(from, to).all()).results.map((m) => ({ ...m, type: "tim" }));
  return [...momentsBetween(from, to), ...team].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
async function saveMoment(env, me, b) {
  await ensure(env);
  const date = String(b.date || "").slice(0, 10), name = String(b.name ?? "").trim().slice(0, 100), idea = String(b.idea ?? "").trim().slice(0, 300);
  if (!ISO.test(date) || isNaN(Date.parse(date))) return { error: "Tanggal momen belum diisi." };
  if (!name) return { error: "Nama momen belum diisi." };
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO moments (id, date, name, idea, created_by, created_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, date, name, idea, who(me), lower(me.e), new Date().toISOString()).run();
  return { id };
}
async function deleteMoment(env, me, id) {
  await ensure(env);
  const m = await env.DB.prepare("SELECT created_email FROM moments WHERE id=?").bind(String(id || "")).first();
  if (!m) return { ok: true };
  if (!me.adm && m.created_email !== lower(me.e)) return { error: "Hanya pembuat momen ini atau admin yang bisa menghapusnya." };
  await env.DB.prepare("DELETE FROM moments WHERE id=?").bind(String(id)).run();
  return { ok: true };
}

const SOURCE = [[/^IG|instagram/i, "instagram"], [/tiktok/i, "tiktok"], [/youtube/i, "youtube"], [/^WA|whatsapp/i, "whatsapp"], [/email|newsletter/i, "email"], [/website|blog/i, "website"]];
const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
/** Tambah UTM (yang belum ada) ke link tujuan: sumber dari kanal, medium social/email, kampanye dari judul, content = kode link. */
export function utmUrl(target, it, code) {
  const u = new URL(target), src = (SOURCE.find(([re]) => re.test(it.channel || "")) || [, "lainnya"])[1];
  const set = (k, v) => { if (!u.searchParams.has(k) && v) u.searchParams.set(k, v); };
  set("utm_source", src); set("utm_medium", src === "email" ? "email" : "social"); set("utm_campaign", slug(it.title)); set("utm_content", code);
  return u.toString();
}
const CODE_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => CODE_CHARS[x % CODE_CHARS.length]).join("");
async function saveLink(env, me, b) {
  await ensure(env);
  const it = await env.DB.prepare("SELECT id, title, channel FROM items WHERE id=?").bind(String(b.item_id || "")).first();
  if (!it) return { error: "Simpan kegiatannya dulu, lalu buat link pelacak." };
  let target = cleanUrl(b.target);
  try { const u = new URL(target); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { return { error: "Link tujuan tidak sah." }; }
  for (let i = 0; i < 4; i++) {
    const code = newCode(), final = b.utm ? utmUrl(target, it, code) : target;
    const r = await env.DB.prepare("INSERT OR IGNORE INTO links (code, item_id, target, clicks, created_by, created_email, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)").bind(code, it.id, final, who(me), lower(me.e), new Date().toISOString()).run();
    if (r.meta.changes) return { code, target: final };
  }
  return { error: "Gagal membuat kode link. Coba lagi." };
}
async function listLinks(env, item) {
  await ensure(env);
  return (await env.DB.prepare("SELECT code, target, clicks, created_by, created_at FROM links WHERE item_id=? ORDER BY created_at").bind(String(item || "")).all()).results;
}
// pratinjau link di aplikasi chat & mesin pencari tidak dihitung sebagai klik
export const BOT_UA = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|linkedin|skype|embedly|vkshare|pinterest|google-?inspect|headless/i;
async function go(env, ctx, request, code) {
  await ensure(env);
  const r = await env.DB.prepare("SELECT target FROM links WHERE code=?").bind(code).first();
  if (!r) return new Response("Link tidak ditemukan.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  if (!BOT_UA.test(request.headers.get("user-agent") || "") && request.method === "GET")
    ctx.waitUntil(env.DB.prepare("UPDATE links SET clicks = clicks + 1 WHERE code=?").bind(code).run().catch(() => {}));
  return new Response(null, { status: 302, headers: { location: r.target, "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

/** Kunci pencocokan link postingan: kode postingan IG/TikTok/YouTube, selain itu URL tanpa skema, query, dan garis miring akhir. */
export function postKey(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  let m = u.match(/instagram\.com\/(?:[^/?#]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/i);
  if (m) return "ig:" + m[1];
  if ((m = u.match(/tiktok\.com\/.*?\/video\/(\d+)/i))) return "tt:" + m[1];
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i))) return "yt:" + m[1];
  return u.toLowerCase().replace(/^https?:\/\/(?:www\.|m\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
}
/** Jenis postingan di CSV Meta -> kanal Planner. */
export const channelOf = (type, link) => /tiktok\.com/i.test(link) ? "TikTok" : /youtu/i.test(link) ? "YouTube" : /reel/i.test(type) || /\/reels?\//i.test(link) ? "IG Reels" : /stor|cerita/i.test(type) ? "IG Story" : /instagram\.com/i.test(link) ? "IG Feed" : "Lainnya";
/** Satu baris CSV (sudah dipetakan di browser) -> baris yang sah, atau null. */
export function cleanMetricRow(r) {
  if (!r || typeof r !== "object") return null;
  const link = cleanUrl(r.link), key = postKey(link);
  if (!key) return null;
  const date = ISO.test(String(r.date || "").slice(0, 10)) ? String(r.date).slice(0, 10) : "";
  const out = { key, link, date, title: String(r.title ?? "").replace(/\s+/g, " ").trim().slice(0, 160), type: String(r.type ?? "").slice(0, 40) };
  for (const k of METRICS) out[k] = numOf(r[k]);
  return METRICS.some((k) => out[k] != null) ? out : null;
}
/** Impor angka performa: { rows: [{link, date, title, type, m_views, ...}], create }. Baris yang cocok (lewat link) diperbarui;
 *  create = buat kegiatan Terbit untuk postingan yang belum ada di kalender. */
async function importMetrics(env, me, b) {
  await ensure(env);
  const rows = new Map();
  for (const r of (Array.isArray(b.rows) ? b.rows : []).slice(0, 1000)) { const c = cleanMetricRow(r); if (c) rows.set(c.key, c); }
  if (!rows.size) return { error: "Tidak ada baris dengan link postingan dan angka performa." };
  const have = new Map();
  for (const i of (await env.DB.prepare("SELECT id, link FROM items WHERE kind = 'konten' AND COALESCE(link, '') <> ''").all()).results) have.set(postKey(i.link), i.id);
  const now = new Date().toISOString(), by = who(me), meE = lower(me.e), st = [], unmatched = [];
  let matched = 0, created = 0;
  for (const r of rows.values()) {
    const res = r.m_reach ?? r.m_views, id = have.get(r.key);
    if (id) {
      matched++;
      st.push(env.DB.prepare(`UPDATE items SET ${METRICS.map((k) => k + "=?").join(", ")}, m_at=?, m_src='csv', result_num=COALESCE(?, result_num) WHERE id=?`).bind(...METRICS.map((k) => r[k]), now, res, id));
    } else if (b.create && r.date) {
      created++;
      const cols = ["id", "kind", "date", "title", "channel", "status", "owner", "owner_email", "link", "d_need", ...METRICS, "m_at", "m_src", "result_num", "created_by", "created_email", "created_at", "updated_by", "updated_at"];
      st.push(env.DB.prepare(`INSERT INTO items (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(",")})`).bind(crypto.randomUUID(), "konten", r.date, r.title || "Postingan " + tgl(r.date), channelOf(r.type, r.link), "terbit", by, meE, r.link, 0,
        ...METRICS.map((k) => r[k]), now, "csv", res, by, meE, now, by, now));
    } else unmatched.push(r.link);
  }
  for (let i = 0; i < st.length; i += 50) await env.DB.batch(st.slice(i, i + 50));
  return { matched, created, unmatched: unmatched.length, sample: unmatched.slice(0, 8) };
}
/** Notifikasi dari perubahan kegiatan: penanggung jawab baru, desainer baru, dan status visual yang berubah. Fungsi murni. */
export function itemNotifs(prev, it, id, meE, by) {
  const N = [], kind = (KINDS[it.kind] || {}).label || "Kegiatan";
  if (it.owner_email && it.owner_email !== meE && it.owner_email !== (prev && prev.owner_email))
    N.push({ email: it.owner_email, kind: "owner", title: "Kamu penanggung jawab: " + it.title, body: `${kind} · ${tgl(it.date)} · ditunjuk ${by}`, item_id: id, by });
  if (it.d_need && it.d_who && it.d_who !== meE && (!prev || !prev.d_need || prev.d_who !== it.d_who))
    N.push({ email: it.d_who, kind: "design", title: "Permintaan visual: " + it.title, body: `Tenggat ${tgl(it.d_due)} · dari ${by}`, item_id: id, by });
  if (prev && prev.d_need && it.d_need && prev.d_who === it.d_who && (prev.d_status || "belum") !== it.d_status) {
    // desainer mengubah status -> yang meminta tahu; orang lain mengubah (mis. minta revisi) -> desainer tahu
    const to = meE === it.d_who ? prev.owner_email || prev.created_email : it.d_who;
    if (to && to !== meE) N.push({ email: to, kind: "design", title: `Visual "${it.title}": ${DSL[it.d_status]}`, body: "Diubah " + by, item_id: id, by });
  }
  return N;
}
async function deleteItem(env, me, id) {
  await ensure(env);
  const r = await env.DB.prepare("SELECT created_by, created_email FROM items WHERE id=?").bind(String(id || "")).first();
  if (!r) return { ok: true };
  const mine = r.created_email ? r.created_email === String(me.e || "").toLowerCase() : r.created_by === who(me);
  if (!me.adm && !mine) return { error: "Hanya admin atau pembuat kegiatan ini yang bisa menghapusnya." };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM items WHERE id=?").bind(String(id)),
    env.DB.prepare("DELETE FROM tasks WHERE item_id=?").bind(String(id)),
    env.DB.prepare("UPDATE items SET program_id='' WHERE program_id=?").bind(String(id)),
  ]);
  return { ok: true };
}
/** Dicatat saat login: anggota tim untuk pilihan penanggung jawab, desainer, dan penerima tugas. Role ikut dari tiket Tool Hub (j).
 *  User biasa (tanpa role, bukan admin hub) tetap boleh membuka Planner, tapi tidak menjadi anggota yang bisa diberi tugas. */
export async function seen(env, p) {
  const email = String(p.e || "").toLowerCase();
  if (!EMAIL.test(email)) return;
  await ensure(env);
  const job = JOBS[p.j] ? p.j : null, member = job || p.adm ? 1 : 0;
  await env.DB.prepare("INSERT INTO users (email, name, role, seen_at, active) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name, seen_at = excluded.seen_at, "
    + "role = CASE WHEN excluded.active = 1 THEN COALESCE(excluded.role, role) ELSE NULL END, active = CASE WHEN excluded.active = 1 THEN active ELSE 0 END")
    .bind(email, String(p.n || p.u || email).slice(0, 60), job, new Date().toISOString(), member).run();
}
async function users(env) {
  await ensure(env);
  return (await env.DB.prepare("SELECT email, name, role FROM users WHERE COALESCE(active, 1) = 1 ORDER BY name").all()).results;
}
/** POST /__hub/users dari Tool Hub: semua akun yang boleh membuka Content Planner. Yang tidak ada di daftar tidak lagi tampil sebagai pilihan. */
async function syncUsers(env, list) {
  await ensure(env);
  const L = (Array.isArray(list) ? list : []).map((u) => ({ email: lower(u && u.email), name: String((u && u.name) || "").slice(0, 60), job: JOBS[u && u.job] ? u.job : null }))
    .filter((u) => EMAIL.test(u.email)).slice(0, 500);
  if (!L.length) return { error: "Daftar anggota kosong." };   // jangan sampai semua anggota hilang karena kiriman yang keliru
  await env.DB.batch([env.DB.prepare("UPDATE users SET active = 0"), ...L.map((u) => env.DB.prepare("INSERT INTO users (email, name, role, active) VALUES (?, ?, ?, 1) ON CONFLICT(email) DO UPDATE SET name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE name END, role = COALESCE(excluded.role, role), active = 1").bind(u.email, u.name || u.email, u.job))]);
  return { ok: true, n: L.length };
}
async function myRole(env, me) {
  await ensure(env);
  const r = await env.DB.prepare("SELECT role FROM users WHERE email=?").bind(String(me.e || "").toLowerCase()).first();
  return r && ROLES[r.role] ? r.role : "";
}
/** Role pekerjaan orang yang sedang login: dari tiket Tool Hub; sesi lama tanpa role memakai catatan di tabel users. */
const jobOf = async (env, me) => (JOBS[me.j] ? me.j : await myRole(env, me).catch(() => ""));

/* =========================================================
   TUGAS DI DALAM PROGRAM & NOTIFIKASI
   ========================================================= */
export const TASK_STATUSES = DESIGN_STATUSES;
export function cleanTask(b) {
  const s = (v, n) => String(v ?? "").trim().slice(0, n);
  const t = { item_id: s(b.item_id, 40), title: s(b.title, 160), job: JOBS[b.job] ? b.job : "", who: EMAIL.test(s(b.who, 120)) ? lower(s(b.who, 120)) : "",
    due: ISO.test(s(b.due, 10)) ? s(b.due, 10) : "", status: TASK_STATUSES.includes(b.status) ? b.status : "belum", brief: s(b.brief, 2000), link: cleanUrl(b.link) };
  if (!t.item_id) return { error: "Tugas harus berada di dalam program." };
  if (!t.title) return { error: "Nama tugas belum diisi." };
  if (!t.who) return { error: "Pilih orang yang ditugaskan." };
  if (!t.due) return { error: "Tenggat tugas belum diisi." };
  return t;
}
const TCOLS = ["item_id", "title", "job", "who", "who_name", "due", "status", "brief", "link", "done_at"];
async function saveTask(env, me, b) {
  await ensure(env);
  const meE = lower(me.e), by = who(me), now = new Date().toISOString(), boss = canAssign(await jobOf(env, me), me.adm);
  const prev = b.id ? await env.DB.prepare("SELECT * FROM tasks WHERE id=?").bind(String(b.id)).first() : null;
  if (b.id && !prev) return { error: "Tugas ini sudah dihapus. Muat ulang halaman." };
  if (!prev && !boss) return { error: "Hanya Partnership atau admin yang bisa memberi tugas." };
  // pemberi tugas & admin boleh mengubah semuanya; penerima hanya status dan link hasilnya
  const full = !prev || prev.by_email === meE || !!me.adm;
  if (prev && !full && prev.who !== meE) return { error: "Tugas ini bukan untukmu." };
  let t;
  if (full) { t = cleanTask(b); if (t.error) return t; }
  else t = { ...prev, status: TASK_STATUSES.includes(b.status) ? b.status : prev.status, link: b.link === undefined ? prev.link : cleanUrl(b.link) };
  const item = await env.DB.prepare("SELECT id, title, kind FROM items WHERE id=?").bind(t.item_id).first();
  if (!item) return { error: "Program untuk tugas ini tidak ditemukan." };
  // penerima harus anggota yang terdaftar (dipilih dari daftar, bukan diketik), supaya notifikasinya sampai
  const u = await env.DB.prepare("SELECT name, role FROM users WHERE email=? AND COALESCE(active, 1) = 1").bind(t.who).first();
  if (!u) return { error: "Orang yang ditugaskan belum terdaftar sebagai anggota Content Planner." };
  t.who_name = u.name || t.who; if (!t.job) t.job = u.role || "";
  t.done_at = t.status === "selesai" ? (prev && prev.done_at) || now : null;
  let id = prev ? prev.id : "";
  if (prev) await env.DB.prepare(`UPDATE tasks SET ${TCOLS.map((k) => k + "=?").join(", ")}, updated_at=? WHERE id=?`).bind(...TCOLS.map((k) => t[k] ?? null), now, id).run();
  else {
    id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO tasks (id, ${TCOLS.join(", ")}, by_email, by_name, created_at, updated_at) VALUES (?${", ?".repeat(TCOLS.length)}, ?, ?, ?, ?)`)
      .bind(id, ...TCOLS.map((k) => t[k] ?? null), meE, by, now, now).run();
  }
  await notify(env, taskNotifs(prev, { ...t, by_email: prev ? prev.by_email : meE }, item, meE, by, full)).catch((e) => console.error("notify:", e.message));
  return { id };
}
/** Notifikasi dari perubahan tugas. Fungsi murni. */
export function taskNotifs(prev, t, item, meE, by, full) {
  const N = [], base = { item_id: t.item_id, by, kind: "task" };
  if (t.who !== meE && (!prev || prev.who !== t.who)) N.push({ ...base, email: t.who, title: "Tugas baru: " + t.title, body: `${item.title} · tenggat ${tgl(t.due)} · dari ${by}` });
  else if (prev && prev.status !== t.status) {
    const to = meE === t.who ? t.by_email : t.who;   // penerima mengubah -> pemberi tugas tahu, dan sebaliknya
    if (to && to !== meE) N.push({ ...base, email: to, title: `${t.title}: ${DSL[t.status]}`, body: `${item.title} · diubah ${by}` });
  } else if (prev && full && t.who !== meE && (prev.due !== t.due || prev.brief !== t.brief || prev.title !== t.title))
    N.push({ ...base, email: t.who, title: "Tugas diperbarui: " + t.title, body: `${item.title} · tenggat ${tgl(t.due)} · oleh ${by}` });
  return N;
}
async function deleteTask(env, me, id) {
  await ensure(env);
  const t = await env.DB.prepare("SELECT by_email FROM tasks WHERE id=?").bind(String(id || "")).first();
  if (!t) return { ok: true };
  if (!me.adm && t.by_email !== lower(me.e)) return { error: "Hanya pemberi tugas atau admin yang bisa menghapusnya." };
  await env.DB.prepare("DELETE FROM tasks WHERE id=?").bind(String(id)).run();
  return { ok: true };
}
const TASK_SEL = "SELECT t.*, i.title AS item_title, i.date AS item_date, i.kind AS item_kind FROM tasks t LEFT JOIN items i ON i.id = t.item_id";
/** ?item= : tugas satu program. Selain itu: tugas untukku & dariku (all = semua tim, untuk Partnership/admin), yang belum selesai + selesai 30 hari terakhir. */
async function listTasks(env, me, q) {
  await ensure(env);
  if (q.item) return (await env.DB.prepare(TASK_SEL + " WHERE t.item_id = ? ORDER BY t.due, t.created_at").bind(q.item).all()).results;
  const since = new Date(Date.now() - 30 * 864e5).toISOString(), meE = lower(me.e);
  const all = q.all && canAssign(await jobOf(env, me), me.adm);
  return (await env.DB.prepare(TASK_SEL + ` WHERE ${all ? "1 = 1" : "(t.who = ?1 OR t.by_email = ?1)"} AND (COALESCE(t.status, 'belum') <> 'selesai' OR t.done_at >= ?2) ORDER BY t.due, t.created_at LIMIT 300`).bind(meE, since).all()).results;
}
async function programs(env) {
  await ensure(env);
  return (await env.DB.prepare("SELECT id, title, date, end_date, partner, status, channel FROM items WHERE kind = 'program' ORDER BY date DESC LIMIT 300").all()).results;
}
/** Data laporan program: program yang berjalan di periode itu (atau satu program), beserta kegiatan terkait & tugasnya. */
async function programReport(env, from, to, id) {
  await ensure(env);
  const P = id ? (await env.DB.prepare("SELECT * FROM items WHERE kind = 'program' AND id = ?").bind(id).all()).results
    : ISO.test(from) && ISO.test(to) ? (await env.DB.prepare("SELECT * FROM items WHERE kind = 'program' AND date <= ? AND COALESCE(NULLIF(end_date, ''), date) >= ? ORDER BY date LIMIT 90").bind(to, from).all()).results : [];
  if (!P.length) return { programs: [] };
  const ids = P.map((p) => p.id), ph = ids.map(() => "?").join(",");
  const [items, tasks] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM items WHERE program_id IN (${ph}) ORDER BY date, time`).bind(...ids),
    env.DB.prepare(`SELECT * FROM tasks WHERE item_id IN (${ph}) ORDER BY due, created_at`).bind(...ids),
  ]);
  return { programs: P.map((p) => ({ ...p, items: items.results.filter((i) => i.program_id === p.id), tasks: tasks.results.filter((t) => t.item_id === p.id) })) };
}

/** Simpan notifikasi. key (opsional) mencegah notifikasi yang sama dibuat dua kali (pengingat tenggat). */
async function notify(env, list) {
  const L = (list || []).filter((n) => n && EMAIL.test(n.email || ""));
  if (!L.length) return;
  const now = new Date().toISOString();
  await env.DB.batch(L.map((n) => env.DB.prepare("INSERT OR IGNORE INTO notifs (email, at, kind, title, body, item_id, by_name, nkey) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(n.email, now, n.kind || "", String(n.title || "").slice(0, 200), String(n.body || "").slice(0, 300), n.item_id || "", n.by || "", n.key || null)));
}
/** Pengingat tenggat untuk tugas & permintaan visual milik seseorang: besok, hari ini, dan lewat (masing-masing sekali). Fungsi murni. */
export function dueNotifs(email, today, tasks, design) {
  const tomorrow = addDays(today, 1), N = [];
  const stage = (due) => (due < today ? ["late", "Lewat tenggat"] : due === today ? ["today", "Tenggat hari ini"] : due === tomorrow ? ["soon", "Tenggat besok"] : null);
  for (const t of tasks) { const s = t.due && stage(t.due); if (s) N.push({ email, kind: "due", title: `${s[1]}: ${t.title}`, body: `${t.item_title || "Program"} · tenggat ${tgl(t.due)}`, item_id: t.item_id, key: `due:t:${t.id}:${t.due}:${s[0]}` }); }
  for (const d of design) { const due = d.d_due || d.date, s = due && stage(due); if (s) N.push({ email, kind: "due", title: `${s[1]}: visual ${d.title}`, body: `Permintaan visual · tenggat ${tgl(due)}`, item_id: d.id, key: `due:d:${d.id}:${due}:${s[0]}` }); }
  return N;
}
let notifSweep = 0;
async function notifsOf(env, email, today, tasks, design) {
  await notify(env, dueNotifs(email, today, tasks, design)).catch((e) => console.error("notify:", e.message));
  if (Date.now() - notifSweep > 864e5) { notifSweep = Date.now(); await env.DB.prepare("DELETE FROM notifs WHERE at < ?").bind(new Date(Date.now() - 60 * 864e5).toISOString()).run().catch(() => {}); }
  const [c, l] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM notifs WHERE email = ? AND read_at IS NULL").bind(email),
    env.DB.prepare("SELECT id, at, kind, title, body, item_id, read_at FROM notifs WHERE email = ? ORDER BY id DESC LIMIT 15").bind(email),
  ]);
  return { unread: (c.results[0] || {}).n || 0, items: l.results };
}
/** POST /__hub/notif dari Tool Hub: { email, ids: [...] } atau { email, all: true }. */
async function readNotifs(env, b) {
  await ensure(env);
  const email = lower(b && b.email), now = new Date().toISOString();
  if (!EMAIL.test(email)) return { error: "Email tidak sah." };
  const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 90) : [];
  if (b.all) await env.DB.prepare("UPDATE notifs SET read_at = ? WHERE email = ? AND read_at IS NULL").bind(now, email).run();
  else if (ids.length) await env.DB.prepare(`UPDATE notifs SET read_at = ? WHERE email = ? AND read_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`).bind(now, email, ...ids).run();
  return { ok: true };
}

/* =========================================================
   PAKET MINGGUAN
   ========================================================= */
const wib = (d = new Date()) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
export const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Ringkasan untuk beranda Tool Hub: kegiatan tim hari ini, kegiatan milik pengguna 7 hari ke depan yang belum selesai,
 *  dan tugas desain yang ditugaskan kepadanya. Hanya kolom ringkas. */
async function hubToday(env, email) {
  await ensure(env);
  const today = wib(), until = addDays(today, 6), me = EMAIL.test(email) ? email.toLowerCase() : "";
  const cols = "id, kind, date, time, title, channel, status, owner, d_due, d_status";
  const done = "('terbit', 'selesai', 'batal')";
  const [team, mine, design, tasks] = await Promise.all([
    env.DB.prepare(`SELECT ${cols} FROM items WHERE date = ? ORDER BY time, created_at LIMIT 20`).bind(today).all(),
    me ? env.DB.prepare(`SELECT ${cols} FROM items WHERE owner_email = ? AND date BETWEEN ? AND ? AND COALESCE(status, '') NOT IN ${done} ORDER BY date, time LIMIT 20`).bind(me, today, until).all() : null,
    me ? env.DB.prepare("SELECT " + cols + " FROM items WHERE d_need = 1 AND d_who = ? AND COALESCE(d_status, 'belum') <> 'selesai' ORDER BY COALESCE(d_due, date) LIMIT 20").bind(me).all() : null,
    me ? env.DB.prepare("SELECT t.id, t.title, t.due, t.status, t.by_name, t.item_id, i.title AS item_title FROM tasks t LEFT JOIN items i ON i.id = t.item_id WHERE t.who = ? AND COALESCE(t.status, 'belum') <> 'selesai' ORDER BY t.due LIMIT 20").bind(me).all() : null,
  ]);
  const notif = me ? await notifsOf(env, me, today, tasks.results, design.results) : { unread: 0, items: [] };
  return { date: today, until, today: team.results, mine: mine ? mine.results : [], design: design ? design.results : [], tasks: tasks ? tasks.results : [], notif,
    kinds: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.label])) };
}
/** Senin & Minggu pekan depan dari tanggal (WIB) tertentu. */
export function nextWeek(today) {
  const dow = new Date(today + "T00:00:00Z").getUTCDay(); // 0 = Minggu
  const mon = addDays(today, dow === 0 ? 1 : 8 - dow);
  return { from: mon, to: addDays(mon, 6) };
}
const getJson = async (svc, path) => {
  if (!svc) throw new Error("service binding belum ada");
  const r = await svc.fetch("https://svc" + path);
  if (!r.ok) throw new Error(path + " HTTP " + r.status);
  return r.json();
};
const settle = async (p) => { try { return { v: await p }; } catch (e) { return { err: String(e.message || e) }; } };

/** Reksa dana: return 1 minggu (dari NAB), return 1 tahun, dan gerak harian tidak biasa dalam 7 hari terakhir. */
async function fundPart(env) {
  const [{ funds = [] }, stab] = await Promise.all([getJson(env.FUND, "/api/funds"), getJson(env.FUND, "/api/stab").catch(() => ({}))]);
  const list = funds.filter((f) => f && f.name && f.nav > 0 && f.navDate);
  // NAB terakhir pada atau sebelum 7 hari sebelum tanggal NAB tiap produk (satu kueri, pencarian lewat kunci utama pid+date)
  const want = list.map((f) => ({ p: String(f.pid), d: addDays(f.navDate, -7) }));
  const old = {};
  if (want.length && env.FUND_DB) {
    const { results } = await env.FUND_DB.prepare("SELECT value->>'p' p, (SELECT nav FROM nav WHERE pid = value->>'p' AND date <= value->>'d' ORDER BY date DESC LIMIT 1) n FROM json_each(?)").bind(JSON.stringify(want)).all();
    for (const r of results) if (r.n > 0) old[r.p] = r.n;
  }
  const navDate = list.map((f) => f.navDate).sort().pop() || null;
  const rows = list.map((f) => {
    const t = f.ret || {}, o = old[f.pid];
    return { pid: f.pid, name: f.name, type: f.type, risk: f.risk || "", min: f.minSubs ?? null, navDate: f.navDate,
      w1: o ? (f.nav / o - 1) * 100 : null, m1: t.m1 ?? null, y1: t.y1 ?? null, y1x: t.y1x ?? null, ytd: t.ytd ?? null, aum: f.aum ?? null,
      // syariah: kategori Bareksa (Fund Insight), cadangan tebakan nama
      sy: f.sy != null ? f.sy === 1 : /syariah|sharia|sukuk|falah/i.test(f.name) };
  });
  // aturan sama dengan peringatan di Home Fund Insight: >= 3x simpangan harian biasanya dan >= 0,1%
  const since = navDate ? addDays(navDate, -7) : "";
  const movers = [];
  for (const f of list) {
    const s = stab[f.pid];
    for (const [d, pct, z] of (s && s.rec) || []) if (d > since && Math.abs(z) >= 3 && Math.abs(pct) >= 0.1) movers.push({ pid: f.pid, name: f.name, type: f.type, d, pct, z, sdd: s.sdd });
  }
  movers.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return { navDate, rows, movers: movers.slice(0, 12) };
}

/** Obligasi: yield tertinggi per jenis dan perubahan yield dibanding sekitar seminggu lalu. */
async function bondPart(env) {
  const [data, hist] = await Promise.all([getJson(env.BOND, "/data/bonds.json"), getJson(env.BOND, "/data/history.json").catch(() => ({ days: {} }))]);
  const bonds = (data.bonds || []).filter((b) => b && b.code && b.yield > 0);
  const days = Object.keys(hist.days || {}).sort(), last = days[days.length - 1];
  const ref = last ? days.filter((d) => d <= addDays(last, -7)).pop() : null, then = ref ? hist.days[ref] : {};
  const today = wib();
  const rows = bonds.filter((b) => !b.maturity || String(b.maturity).slice(0, 10) > today).map((b) => {
    const p = then[b.code];
    return { code: b.code, name: b.name, issuer: b.issuer, type: b.type, coupon: b.coupon, yield: b.yield, price: b.price, rating: b.rating || "",
      maturity: b.maturity ? String(b.maturity).slice(0, 10) : null, min: b.min, syariah: !!b.syariah, best: !!b.best, dy: p && p[1] != null ? b.yield - p[1] : null };
  });
  return { asOf: (data.meta && data.meta.updated_at) || last || null, refDate: ref, rows };
}

/** Agenda pekan depan: agenda makro (Story Generator) + agenda yang ditambahkan tim di Fund Insight. */
async function agendaPart(env, from, to) {
  const out = [];
  const u = macroUrls(env);
  if (u) {
    const get = (url, json) => fetch(url, { signal: AbortSignal.timeout(15000), cf: { cacheTtl: 3600, cacheEverything: true } }).then((r) => (r.ok ? (json ? r.json() : r.text()) : null)).catch(() => null);
    const [js, cal] = await Promise.all([get(u.js), get(u.cal, true)]);
    out.push(...macroItems(js, cal));
  }
  if (env.FUND_DB) {
    const r = await env.FUND_DB.prepare("SELECT v FROM meta WHERE k='agenda'").first().catch(() => null);
    try { out.push(...(r ? JSON.parse(r.v) : [])); } catch (e) {}
  }
  return out.filter((x) => x.d >= from && x.d <= to).sort((a, b) => (a.d + (a.time || "")).localeCompare(b.d + (b.time || "")))
    .map((x) => ({ d: x.d, time: x.time || "", country: x.country || "", t: x.t, k: x.k || "makro" }));
}

async function weekly(env) {
  const today = wib(), wk = nextWeek(today);
  const [f, b, a] = await Promise.all([settle(fundPart(env)), settle(bondPart(env)), settle(agendaPart(env, wk.from, wk.to))]);
  return { at: new Date().toISOString(), today, next: wk, funds: f.v || null, fundsError: f.err || null, bonds: b.v || null, bondsError: b.err || null, agenda: a.v || [], agendaError: a.err || null };
}
let MEM = null;
async function weeklyCached(env, ctx, fresh) {
  if (!fresh && MEM && Date.now() - MEM.t < 10 * 60e3) return MEM.body;
  const cache = caches.default, key = new Request("https://content-planner.cache/api/weekly-v1");
  if (!fresh) { const hit = await cache.match(key); if (hit) { MEM = { t: Date.now(), body: await hit.text() }; return MEM.body; } }
  const data = await weekly(env), body = JSON.stringify(data);
  // hanya disimpan kalau semua bagian berhasil, supaya gangguan sesaat tidak tertahan 10 menit
  if (!data.fundsError && !data.bondsError && !data.agendaError) {
    MEM = { t: Date.now(), body };
    ctx.waitUntil(cache.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=600" } })));
  }
  return body;
}

/* =========================================================
   HALAMAN
   ========================================================= */
// Jendela kecil yang dibuka tombol bookmark "Angka IG ke Planner" di Instagram: menerima angka per postingan dari tab Instagram
// (postMessage, hanya dari instagram.com), lalu menyimpannya lewat /api/metrics/import setelah tim menekan Simpan.
const IG_SYNC = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Angka Instagram ke Content Planner</title>
<style>body{margin:0;font:14px/1.5 Inter,system-ui,sans-serif;background:#edf3ef;color:#17251d}.w{padding:18px}h1{font-size:17px;margin:0 0 6px}.prog{height:8px;border-radius:8px;background:#dfe8e2;overflow:hidden;margin:8px 0 12px}.prog i{display:block;height:100%;width:0;background:#1f7a4d}
table{width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:10px;overflow:hidden}th,td{padding:5px 7px;border-bottom:1px solid #dfe8e2;text-align:left}td.n,th.n{text-align:right}.box{max-height:46vh;overflow:auto;margin-bottom:12px}
button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:9px 14px;background:#1f7a4d;color:#fff;cursor:pointer}button:disabled{opacity:.5}label{display:flex;gap:8px;align-items:center;margin:0 0 12px;font-size:13px}.m{color:#5b6d62;font-size:12.5px}</style></head>
<body><div class="w"><h1>📈 Angka Instagram → Content Planner</h1><p class="m" id="st">Menunggu data dari tab Instagram…</p><div class="prog"><i id="bar"></i></div>
<div class="box"><table><thead><tr><th>Tayang</th><th>Postingan</th><th class="n">Suka</th><th class="n">Komentar</th><th class="n">Views</th></tr></thead><tbody id="rows"></tbody></table></div>
<label><input type="checkbox" id="cr"> Buat kegiatan untuk postingan yang belum ada di kalender</label><button id="save" disabled>Simpan ke Planner</button><p class="m" id="msg"></p>
<p class="m">Hanya angka publik (suka, komentar, views). Jangkauan dan simpan diisi dari CSV Meta Business Suite atau manual.</p></div>
<script>(function(){var $=function(i){return document.getElementById(i)},rows=[],n=+new URLSearchParams(location.search).get("n")||0,got=0;
var esc=function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};
if(!window.opener){$("st").textContent="Buka jendela ini lewat tombol bookmark di halaman Instagram.";return}
addEventListener("message",function(e){if(e.source!==window.opener||!/^https:\\/\\/([a-z]+\\.)?instagram\\.com$/.test(e.origin)||!e.data)return;var m=e.data;
if(m.pl==="row"&&m.row){got++;if(m.ok)rows.push(m.row);$("bar").style.width=(n?got/n*100:100)+"%";$("st").textContent="Membaca postingan "+got+(n?"/"+n:"")+"…";
$("rows").insertAdjacentHTML("beforeend","<tr><td>"+esc(m.row.date||"–")+"</td><td>"+esc((m.row.title||m.row.link).slice(0,50))+"</td><td class=n>"+esc(m.row.m_likes)+"</td><td class=n>"+esc(m.row.m_comments)+"</td><td class=n>"+esc(m.row.m_views)+"</td></tr>")}
if(m.pl==="done"){$("bar").style.width="100%";$("st").textContent=rows.length+" postingan terbaca"+(got>rows.length?", "+(got-rows.length)+" gagal dibaca (login Instagram dulu)":"")+". Periksa lalu simpan.";$("save").disabled=!rows.length}});
window.opener.postMessage({pl:"ready"},"*");
$("save").onclick=function(){$("save").disabled=true;$("msg").textContent="Menyimpan…";
fetch("/api/metrics/import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({rows:rows,create:$("cr").checked})}).then(function(r){return r.json()}).then(function(j){
if(j.error)throw new Error(j.error);$("msg").textContent="✓ "+j.matched+" konten diperbarui"+(j.created?", "+j.created+" kegiatan baru":"")+(j.unmatched?". "+j.unmatched+" postingan belum ada di kalender (centang kotak di atas untuk menambahkannya).":".")}).catch(function(e){$("msg").textContent="✗ "+e.message;$("save").disabled=false})}})();</script></body></html>`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** Glosarium tim dari Copy Studio (service binding COPY) untuk cek caption; kosong kalau Copy Studio belum ada. */
async function glossary(env) {
  if (!env.COPY) return [];
  try {
    const r = await env.COPY.fetch("https://copy-studio/__hub/style", { headers: { "x-hub-key": env.SSO_SECRET } });
    const s = r.ok ? await r.json() : {};
    return Array.isArray(s.glossary) ? s.glossary.slice(0, 300) : [];
  } catch { return []; }
}
async function page(env, me, mode) {
  const [job, gl] = await Promise.all([jobOf(env, me), mode === "kalender" ? glossary(env) : []]);
  const etf = (profile(env).tools || {}).etf || {};
  const cfg = { mode, me: { name: who(me), email: String(me.e || "").toLowerCase(), adm: !!me.adm, role: job, assign: canAssign(job, me.adm) },
    kinds: KINDS, eduRoles: EDU_ROLES, designStatuses: DESIGN_STATUSES, taskStatuses: TASK_STATUSES, roles: ROLES, programNums: PROGRAM_NUMS, hub: String(env.HUB_URL || "").replace(/\/+$/, ""), story: appUrl(env, "story"),
    copyKinds: COPY_KINDS, approval: APPROVAL, momentTypes: MOMENT_TYPES, glossary: gl, allow: Object.keys(etf.facts || {}) };
  const head = `<title>${esc(title(env, "Content Planner"))}</title>${profileScript(env)}${themeHead("")}${mode === "kalender" ? complianceScript() : ""}<script>${HUBSSO.onlyInHub(env)}window.PL=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script>`;
  return PAGE.replace("<title>Content Planner</title>", () => head);
}
const json = (v, status = 200) => Response.json(v, { status, headers: { "cache-control": "no-store" } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    if (path === HUB_FEED) return hubFeedAllowed(request, env) ? json(await hubToday(env, url.searchParams.get("email") || "")) : new Response("forbidden", { status: 403 });
    if (path === "/__hub/members") return hubFeedAllowed(request, env) ? json(await users(env)) : new Response("forbidden", { status: 403 });
    if (path === "/__hub/item") {
      // atas nama orang yang menekan tombol di tool asal: dia jadi pembuat kegiatan, dan notifikasi (mis. ke desainer) tetap jalan
      if (!hubPushAllowed(request, env)) return new Response("forbidden", { status: 403 });
      const b = await request.json().catch(() => ({})), by = b.by || {}, e = lower(by.email);
      if (!EMAIL.test(e)) return json({ error: "Pembuat kegiatan tidak dikenal." }, 400);
      const r = await saveItem(env, { e, n: String(by.name || e).slice(0, 60), j: JOBS[by.job] ? by.job : "" }, { ...(b.item || {}), id: undefined });
      return json(r, r.error ? 400 : 200);
    }
    if (path === "/__hub/users" || path === "/__hub/notif") {
      if (!hubPushAllowed(request, env)) return new Response("forbidden", { status: 403 });
      const b = await request.json().catch(() => ({})), r = path === "/__hub/users" ? await syncUsers(env, b.users) : await readNotifs(env, b);
      return json(r, r.error ? 400 : 200);
    }
    // link pelacak: publik, tanpa login
    const gm = /^\/go\/([a-z0-9]{6})$/.exec(path);
    if (gm) return go(env, ctx, request, gm[1]);
    if (path === "/logout") return HUBSSO.logout(env);
    if (!HUBSSO.ready(env)) return HUBSSO.notReady();
    const tk = await HUBSSO.ticket(request, env, (p) => seen(env, p)); if (tk) return tk;
    const me = await HUBSSO.user(request, env);
    const isPage = path === "/" || path === "/index.html" || path === "/paket";
    if (!me) return isPage || path === "/ig-sync" ? HUBSSO.login(request, env) : json({ error: "Belum login atau sesi habis. Muat ulang halaman dari Tool Hub." }, 401);
    if (path === "/ig-sync") return new Response(IG_SYNC, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": "frame-ancestors 'none'", "x-robots-tag": "noindex", "referrer-policy": "no-referrer" } });
    if (isPage) {
      return new Response(await page(env, me, path === "/paket" ? "paket" : "kalender"), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": HUBSSO.frame(env), "x-robots-tag": "noindex" },
      });
    }
    try {
      if (request.method === "GET") {
        const from = url.searchParams.get("from") || "", to = url.searchParams.get("to") || "";
        if (path === "/api/items" && url.searchParams.get("id")) {
          await ensure(env);
          const it = await env.DB.prepare(`SELECT items.*, ${CLICKS} FROM items WHERE id=?`).bind(url.searchParams.get("id")).first();
          return it ? json(it) : json({ error: "Kegiatan ini sudah dihapus." }, 404);
        }
        if (path === "/api/items") return json(await (url.searchParams.has("design") ? designItems(env, from, to) : listItems(env, from, to)));
        if (path === "/api/users") return json(await users(env));
        if (path === "/api/tasks") return json(await listTasks(env, me, { item: url.searchParams.get("item") || "", all: url.searchParams.has("all") }));
        if (path === "/api/programs") return json(await programs(env));
        if (path === "/api/program-report") return json(await programReport(env, from, to, url.searchParams.get("id") || ""));
        if (path === "/api/approvals") return json(await myApprovals(env, me));
        if (path === "/api/comments") return json(await listComments(env, url.searchParams.get("item")));
        if (path === "/api/moments") return json(await moments(env, from, to));
        if (path === "/api/links") return json(await listLinks(env, url.searchParams.get("item")));
      }
      if (path === "/api/weekly" && request.method === "GET") {
        return new Response(await weeklyCached(env, ctx, url.searchParams.has("refresh")), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      }
      if (request.method === "POST") {
        if (!HUBSSO.sameOrigin(request)) return json({ error: "Permintaan ditolak." }, 403);
        const b = await request.json().catch(() => ({}));
        if (path === "/api/items") { const r = await saveItem(env, me, b); return json(r, r.error ? 400 : 200); }
        if (path === "/api/tasks") { const r = await saveTask(env, me, b); return json(r, r.error ? 400 : 200); }
        if (path === "/api/tasks/delete") { const r = await deleteTask(env, me, b.id); return json(r, r.error ? 403 : 200); }
        if (path === "/api/items/delete") { const r = await deleteItem(env, me, b.id); return json(r, r.error ? 403 : 200); }
        const R = { "/api/approval": () => decide(env, me, b), "/api/comments": () => addComment(env, me, b), "/api/moments": () => saveMoment(env, me, b),
          "/api/moments/delete": () => deleteMoment(env, me, b.id), "/api/links": () => saveLink(env, me, b), "/api/metrics/import": () => importMetrics(env, me, b) }[path];
        if (R) { const r = await R(); return json(r, r.error ? 400 : 200); }
        // beberapa rencana sekaligus (dari Paket Mingguan -> "Masukkan ke kalender")
        if (path === "/api/items/bulk") {
          const list = Array.isArray(b.items) ? b.items.slice(0, 20) : [], ids = [];
          for (const it of list) { const r = await saveItem(env, me, { ...it, id: undefined }); if (r.error) return json({ error: r.error, saved: ids.length }, 400); ids.push(r.id); }
          return json({ ids });
        }
      }
    } catch (e) {
      return json({ error: "Gagal: " + (e.message || e) }, 500);
    }
    return new Response("Tidak ditemukan", { status: 404 });
  },
};
