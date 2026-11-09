// Content Planner — Cloudflare Worker
// - "/"            -> Kalender kegiatan tim: konten sosmed, artikel, edukasi/narasumber, dan tugas desain; laporan PPT/PDF (di browser)
// - "/paket"       -> Paket konten mingguan: rangkuman reksa dana, obligasi, dan agenda minggu depan + draf caption/email
// - "/api/items"   -> kegiatan (GET ?from=&to=, GET ?design=1 tugas desain, POST simpan, POST /api/items/delete hapus)
// - "/api/users"   -> anggota tim + role pekerjaannya (dari Tool Hub: tiket SSO & POST /__hub/users)
// - "/api/tasks"   -> tugas di dalam program (GET ?item= / ?mine=1 / ?all=1, POST simpan, POST /api/tasks/delete)
//                     hanya Partnership & admin yang memberi tugas; penerima boleh mengubah status & link hasilnya
// - "/api/programs", "/api/program-report" -> daftar program & data laporan program (PDF/PPT disusun di browser)
// - "/__hub/users" (POST) -> daftar anggota dari Tool Hub; "/__hub/notif" (POST) -> tandai notifikasi sudah dibaca
// - "/__hub/email" (POST) -> email blast dari Email Studio ("Catat ke Planner"): buat/perbarui kegiatan kanal Email / Newsletter,
//   link pelacak ke tujuan banner (dipakai ulang kalau tujuannya sama), gambar email -> { id, code, url }
// - "/__hub/item" (POST) -> kegiatan dari tool lain (Content Insight: konsep konten); "/__hub/members" (GET) -> daftar anggota
// - "/api/weekly"  -> data paket mingguan (disusun saat diminta, cache 10 menit)
// - "/__hub/today" -> ringkasan hari ini + tugas & notifikasi untuk beranda Tool Hub (service binding, lihat shared/hubfeed.js)
// - "/api/approval" (POST) -> penyetuju menyetujui / meminta revisi konten; "/api/approvals" (GET) -> menunggu persetujuanku
// - "/api/comments" -> komentar & riwayat persetujuan per kegiatan (GET ?item=, POST)
// - "/api/moments"  -> kalender momen (shared/moments.js) + momen tim (GET ?from=&to=, POST, POST /api/moments/delete)
// - "/api/links"    -> link pelacak klik per konten (GET ?item=, POST); "/go/<kode>" (publik) -> hitung klik lalu alihkan
// - "/api/metrics/import" (POST) -> angka performa dari CSV Meta Business Suite, dicocokkan lewat link postingan
// - "/api/imgs" (GET ?ids=a,b) -> gambar postingan (tabel item_img, data URL) untuk Performa & Laporan IG;
//   "/api/img" (POST {id, img}) -> ganti/hapus gambar satu kegiatan (pembuat, PIC, desainer, admin)
// - "/api/linkimg" (GET ?url=) -> gambar sampul dari link (YouTube: thumbnail; lainnya: og:image) untuk dikecilkan browser
// - "/api/yt/refresh" (POST {ids}) -> views, suka, komentar video YouTube dari YouTube Data API (secret opsional YOUTUBE_API_KEY:
//   Google Cloud Console -> aktifkan "YouTube Data API v3" -> Credentials -> Create API key (batasi ke API itu),
//   lalu `wrangler secret put YOUTUBE_API_KEY` di folder ini). Tanpa key angka YouTube diisi manual.
//   Laporan IG (dialog Laporan, disusun di browser): postingan IG KISI per bulan, kartu bergambar + suka, komentar, bagikan,
//   views, simpan, repost (kolom m_reposts). Gambar & angka masuk lewat tombol bookmark "Angka IG ke Planner" atau isian manual.
// - "/api/logs"     -> pekerjaan harian anggota (GET ?from=&to=, POST simpan milik sendiri, POST /api/logs/delete);
//                     Monthly Report (PDF 16:9, per tim = role) disusun di browser dari kegiatan + pekerjaan harian
// - "/api/picks"    -> stock pick + statusnya dari harga EOD Yahoo (GET ?from=&to=[&ihsg=1], POST simpan, POST /api/picks/delete); pembuat atau admin yang mengubah;
// - "/api/translate" (POST) -> isian bebas laporan diterjemahkan ke English lewat AI (Gemini; shared/ai.js)
// - "/api/wa"       -> jumlah posting WA Channel per hari/orang/jenis (GET ?from=&to=, POST {date, n: {jenis: jumlah}} milik sendiri)
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
import { i18nHead } from "../../shared/i18n.js";
import EN from "./i18n.js";
import { macroItems, macroUrls } from "../../shared/macro.js";
import { HUB_FEED, hubFeedAllowed, hubPushAllowed } from "../../shared/hubfeed.js";
import { cleanOrg, jobsOf, roleIn, teamIn, canAssign, canImportGal, isRegional, branchType, opsAlert } from "../../shared/jobs.js";
import { complianceScript } from "../../shared/compliance.js";
import { momentsBetween, TYPES as MOMENT_TYPES } from "../../shared/moments.js";
import { ai, AiError } from "../../shared/ai.js";
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
  program: { label: "Program partnership", channels: ["Manajer investasi (AM)", "APERD / agen penjual", "Komunitas", "Kampus / sekolah", "Korporasi", "Media partner", "Event / pameran", "Lainnya"], statuses: ["rencana", "berjalan", "selesai", "batal"] },
  // aktivitas tim di luar kegiatan di atas: pekerjaan rutin cukup dicatat sekali dengan periode (date .. end_date), lalu statusnya diubah
  aktivitas: { label: "Aktivitas", channels: ["Pekerjaan rutin", "Koordinasi", "Persiapan program", "Rapat", "Lainnya"], statuses: ["rencana", "berjalan", "selesai", "kendala"] },
  // dicatat tim regional (sales & pengelola galeri investasi): acara di cabang / galeri, dengan cabang (+ regionalnya) dari daftar Tool Hub
  cabang: { label: "Kegiatan cabang", channels: ["Gathering nasabah", "Edukasi / seminar", "Open booth / pameran", "Kunjungan korporasi / komunitas", "Sosialisasi produk", "Kunjungan kampus / sekolah", "Lainnya"], statuses: ["rencana", "konfirmasi", "selesai", "batal"] },
  // rencana galeri investasi baru bersama mitra (pengelola galeri / sales): tahap demi tahap, tiap update progres tercatat di riwayat (comments, kind "progres:<tahap>")
  // pekerjaan tim ETF & Fund Ops (kolom ops, JSON); hanya role ops & admin yang mencatat
  ops: { label: "Ops ETF", channels: ["Rebalancing ETF", "Pekerjaan ETF lainnya"], statuses: ["rencana", "berjalan", "selesai", "kendala"] },
  // fitur / fungsi produk (partner = produk / aplikasi, goal = deskripsi fungsi, end_date = target rilis); hanya admin; update status ke riwayat seperti galeri
  produk: { label: "Pengembangan produk", channels: ["Fitur baru", "Fungsi / peningkatan", "Perbaikan", "Lainnya"], statuses: ["ide", "rencana", "pengembangan", "uji", "rilis", "batal"] },
  galeri: { label: "Kerja sama galeri baru", channels: ["Kampus / universitas", "Sekolah", "Komunitas", "Korporasi", "Pemerintah daerah", "Lainnya"], statuses: ["penjajakan", "proposal", "negosiasi", "mou", "resmi", "batal"] },
};
/** Jenis kegiatan yang dilihat & dicatat tim regional. */
export const REG_KINDS = ["cabang", "galeri"];
const REG_SQL = "kind IN ('cabang', 'galeri')";
// rencana galeri yang sudah sampai tahap ini diusulkan ke admin Tool Hub untuk masuk ke daftar cabang / galeri
const GAL_DONE = ["mou", "resmi"];
// dokumen kerja sama galeri (kolom docs, JSON { surat: { s, d }, ... }): s = "" (belum) | proses | selesai, d = tanggal (opsional)
export const GAL_DOCS = { surat: "Surat permohonan + profil", bipartit: "PKS bipartit", tripartit: "PKS tripartit" };
const DOC_ST = { proses: "proses", selesai: "selesai" };
/** Isian dokumen -> JSON yang sah ("" kalau semuanya belum). */
export function cleanDocs(v) {
  let o = v; if (typeof o === "string") { try { o = JSON.parse(o || "{}"); } catch { o = {}; } }
  const out = {};
  for (const k of Object.keys(GAL_DOCS)) {
    const x = (o && o[k]) || {}, st = DOC_ST[x.s] || "", d = ISO.test(String(x.d || "")) ? String(x.d) : "";
    if (st || d) out[k] = { s: st || "selesai", d };
  }
  return Object.keys(out).length ? JSON.stringify(out) : "";
}
/** Dokumen yang berubah dibanding versi sebelumnya, untuk riwayat progres: "PKS bipartit: selesai". */
function docChanges(before, after) {
  const A = JSON.parse(before || "{}"), B = JSON.parse(after || "{}");
  return Object.keys(GAL_DOCS).filter((k) => ((A[k] || {}).s || "") !== ((B[k] || {}).s || "")).map((k) => GAL_DOCS[k] + ": " + ((B[k] || {}).s || "belum"));
}
/** Isian Ops ETF -> JSON { etf, fee, trx, in, out } ("" kalau kosong). Saham: kode 4 huruf, tanpa dobel, maks. 60. */
export function cleanOps(v) {
  let o = v; if (typeof o === "string") { try { o = JSON.parse(o || "{}"); } catch { o = {}; } }
  o = o || {};
  const codes = (x) => [...new Set((Array.isArray(x) ? x.join(" ") : String(x ?? "")).toUpperCase().split(/[\s,;]+/).filter((c) => /^[A-Z]{4}$/.test(c)))].slice(0, 60);
  const out = { etf: String(o.etf ?? "").trim().slice(0, 80), fee: numOf(o.fee), trx: numOf(o.trx), in: codes(o.in), out: codes(o.out) };
  return out.etf || out.fee != null || out.trx != null || out.in.length || out.out.length ? JSON.stringify(out) : "";
}
const canOps = (org, job, adm) => !!adm || job === "ops" || opsAlert(org, job);
// kanal / jenis di luar pilihan boleh ditulis sendiri (pilih "Lainnya" di form); kosong -> "Lainnya"
export const EDU_ROLES = ["Narasumber", "Moderator", "Penyelenggara", "Peserta"];
export const DESIGN_STATUSES = ["belum", "proses", "revisi", "selesai"];
// role pekerjaan anggota tim, diatur di Tool Hub (menentukan tampilan bawaan, pilihan penerima tugas, & pengelompokan di laporan)
const DSL = { belum: "Belum mulai", proses: "Dikerjakan", revisi: "Revisi", selesai: "Selesai" };
// angka hasil program: peserta (result_num), jangkauan, leads, akun baru, nilai transaksi/AUM (Rp), anggaran & biaya (Rp)
export const PROGRAM_NUMS = ["reach", "leads", "accounts", "aum", "budget", "cost"];
const ISO = /^\d{4}-\d{2}-\d{2}$/, EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Kolom selain id/date/title. Tabel versi pertama dibuat tanpa sebagian kolom ini; ensure() menambahkannya tanpa menyentuh isi.
const COLS = {
  kind: "TEXT", channel: "TEXT", status: "TEXT", owner: "TEXT", owner_email: "TEXT", note: "TEXT", link: "TEXT",
  time: "TEXT", place: "TEXT", role: "TEXT", audience: "TEXT", result_num: "INTEGER", result_note: "TEXT",
  d_need: "INTEGER", d_who: "TEXT", d_name: "TEXT", d_due: "TEXT", d_status: "TEXT", d_link: "TEXT", d_brief: "TEXT",
  program_id: "TEXT", partner: "TEXT", end_date: "TEXT", goal: "TEXT", target: "TEXT", region: "TEXT", branch: "TEXT", docs: "TEXT", ops: "TEXT",
  reach: "INTEGER", leads: "INTEGER", accounts: "INTEGER", aum: "INTEGER", budget: "INTEGER", cost: "INTEGER",
  // konten & artikel: caption/naskah final, penyetuju & status persetujuan, angka performa setelah terbit
  copy: "TEXT", approver: "TEXT", approver_email: "TEXT", approval: "TEXT", approval_note: "TEXT", approved_by: "TEXT", approved_at: "TEXT",
  m_views: "INTEGER", m_reach: "INTEGER", m_likes: "INTEGER", m_comments: "INTEGER", m_saves: "INTEGER", m_shares: "INTEGER", m_reposts: "INTEGER", m_follows: "INTEGER", m_at: "TEXT", m_src: "TEXT",
  // event_id: tersambung ke event di Event & Lead (Peserta & Leads diisi otomatis dari sana dan tidak bisa diubah di sini)
  event_id: "TEXT",
  // email blast (kanal Email / Newsletter): nama template Email Studio yang dipakai
  email_tpl: "TEXT",
  created_by: "TEXT", created_email: "TEXT", created_at: "TEXT", updated_by: "TEXT", updated_at: "TEXT",
};
// kolom persetujuan, asal angka & sambungan event hanya diisi server (approvalStep, /api/approval, impor CSV), bukan dari form
const SERVER_COLS = ["approval", "approval_note", "approved_by", "approved_at", "m_at", "m_src", "event_id"];
const EDIT = ["date", "title", ...Object.keys(COLS).filter((k) => !/^(created_|updated_)/.test(k) && !SERVER_COLS.includes(k))];
/** Kegiatan yang punya caption, persetujuan, dan angka performa. */
export const COPY_KINDS = ["konten", "artikel"];
export const METRICS = ["m_views", "m_reach", "m_likes", "m_comments", "m_saves", "m_shares", "m_reposts", "m_follows"];
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
    // total klik link Link & QR Studio per kegiatan (dikirim Studio lewat /__hub/link-clicks)
    env.DB.prepare("CREATE TABLE IF NOT EXISTS qrclicks (item_id TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, at TEXT)"),
    // pekerjaan harian: job = role pemiliknya saat mencatat (pengelompokan per tim di Monthly Report)
    env.DB.prepare("CREATE TABLE IF NOT EXISTS worklog (id TEXT PRIMARY KEY, date TEXT NOT NULL, email TEXT NOT NULL, name TEXT, job TEXT, text TEXT NOT NULL, status TEXT, item_id TEXT, link TEXT, note TEXT, created_at TEXT, updated_at TEXT)"),
    // posting WA Channel: hanya jumlah per hari, per orang, per jenis (isi postingan tidak disimpan)
    env.DB.prepare("CREATE TABLE IF NOT EXISTS stockpick (id TEXT PRIMARY KEY, date TEXT NOT NULL, email TEXT NOT NULL, name TEXT, job TEXT, code TEXT NOT NULL, entry INTEGER NOT NULL, sl INTEGER NOT NULL, tp1 INTEGER NOT NULL, tp2 INTEGER, status TEXT NOT NULL DEFAULT 'open', hit_date TEXT, tp2_date TEXT, last INTEGER, last_date TEXT, checked TEXT, created_at TEXT, updated_at TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS wapost (date TEXT NOT NULL, email TEXT NOT NULL, name TEXT, job TEXT, kind TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, updated_at TEXT, PRIMARY KEY (date, email, kind))"),
    // pengaturan dari Tool Hub, mis. branches = daftar regional & cabang [{ r, c }]
    env.DB.prepare("CREATE TABLE IF NOT EXISTS cfg (k TEXT PRIMARY KEY, v TEXT)"),
    // gambar postingan (data URL ±480px dari bookmark IG atau unggahan manual), terpisah supaya kalender tidak ikut memuatnya
    env.DB.prepare("CREATE TABLE IF NOT EXISTS item_img (id TEXT PRIMARY KEY, img TEXT NOT NULL, at TEXT)"),
  ]);
  const have = new Set((await env.DB.prepare("PRAGMA table_info(items)").all()).results.map((c) => c.name));
  const uhave = new Set((await env.DB.prepare("PRAGMA table_info(users)").all()).results.map((c) => c.name));
  const add = Object.entries(COLS).filter(([k]) => !have.has(k)).map(([k, t]) => env.DB.prepare(`ALTER TABLE items ADD COLUMN ${k} ${t}`));
  // active: 1 = ada di daftar anggota Tool Hub, 0 = sudah tidak (tidak tampil sebagai pilihan); kosong = belum pernah disinkronkan
  if (!uhave.has("active")) add.push(env.DB.prepare("ALTER TABLE users ADD COLUMN active INTEGER"));
  // branch: cabang / galeri anggota tim regional (diatur admin Tool Hub)
  if (!uhave.has("branch")) add.push(env.DB.prepare("ALTER TABLE users ADD COLUMN branch TEXT"));
  // entry_hi: batas atas area entry (kosong = entry satu harga)
  if (!(await env.DB.prepare("PRAGMA table_info(stockpick)").all()).results.some((c) => c.name === "entry_hi")) add.push(env.DB.prepare("ALTER TABLE stockpick ADD COLUMN entry_hi INTEGER"));
  add.push(env.DB.prepare("CREATE INDEX IF NOT EXISTS items_date ON items (date)"), env.DB.prepare("CREATE INDEX IF NOT EXISTS items_design ON items (d_need, d_status)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS items_program ON items (program_id)"), env.DB.prepare("CREATE INDEX IF NOT EXISTS tasks_who ON tasks (who, status)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS tasks_item ON tasks (item_id)"), env.DB.prepare("CREATE INDEX IF NOT EXISTS notifs_email ON notifs (email, id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS comments_item ON comments (item_id, id)"), env.DB.prepare("CREATE INDEX IF NOT EXISTS links_item ON links (item_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS moments_date ON moments (date)"), env.DB.prepare("CREATE INDEX IF NOT EXISTS worklog_date ON worklog (date)"), env.DB.prepare("CREATE INDEX IF NOT EXISTS stockpick_date ON stockpick (date)"));
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
    program_id: s(b.program_id, 40), partner: "", end_date: "", goal: "", target: "", region: "", branch: "", reach: null, leads: null, accounts: null, aum: null, budget: null, cost: null,
    copy: "", approver: "", approver_email: "", email_tpl: "", docs: "", ops: "", ...Object.fromEntries(METRICS.map((k) => [k, null])),
  };
  if (COPY_KINDS.includes(kind)) {
    it.copy = s(b.copy, 6000);
    it.email_tpl = s(b.email_tpl, 80);
    it.approver_email = EMAIL.test(s(b.approver_email, 120)) ? s(b.approver_email, 120).toLowerCase() : "";
    it.approver = it.approver_email ? s(b.approver, 60) : "";
    for (const k of METRICS) it[k] = numOf(b[k]);
  }
  if (!ISO.test(it.date) || isNaN(Date.parse(it.date))) return { error: "Tanggal belum diisi." };
  if (!it.title) return { error: "Judul belum diisi." };
  if (!it.channel) it.channel = "Lainnya";
  if (!K.statuses.includes(it.status)) it.status = K.statuses[0];
  const n = Math.round(Number(String(b.result_num ?? "").replace(/[.\s]/g, "").replace(",", ".")));
  it.result_num = String(b.result_num ?? "").trim() !== "" && n >= 0 && n < 1e12 ? n : null;
  // konten sosmed: angka hasil di laporan = jangkauan (atau views) dari angka performa
  if (kind === "konten" && (it.m_reach ?? it.m_views) != null) it.result_num = it.m_reach ?? it.m_views;
  if (kind === "edukasi" || kind === "cabang") {
    it.time = /^\d{2}:\d{2}$/.test(s(b.time, 5)) ? s(b.time, 5) : "";
    it.place = s(b.place, 160); it.audience = s(b.audience, 160);
    if (kind === "edukasi") it.role = EDU_ROLES.includes(b.role) ? b.role : EDU_ROLES[0];
  }
  // kegiatan cabang: regionalnya diisi saveItem dari daftar cabang; angka hasil bisnis seperti program
  if (kind === "cabang") {
    it.branch = s(b.branch, 60);
    if (!it.branch) return { error: "Cabang / galeri belum dipilih." };
    for (const k of PROGRAM_NUMS) it[k] = numOf(b[k]);
  }
  // rencana galeri: mitra, kota, regional (wajib; dicek saveItem terhadap daftar), cabang in charge (opsional), target peresmian,
  // jumlah mahasiswa / siswa (result_num), rank (target), PIC coordinator dari mitra (audience), dokumen kerja sama (docs)
  if (kind === "galeri") {
    it.partner = s(b.partner, 120); it.place = s(b.place, 160); it.region = s(b.region, 60); it.branch = s(b.branch, 60);
    it.target = s(b.target, 60); it.audience = s(b.audience, 160); it.docs = cleanDocs(b.docs);
    if (!it.region) return { error: "Regional belum dipilih." };
    const end = s(b.end_date, 10);
    it.end_date = ISO.test(end) && end >= it.date ? end : "";
    it.program_id = ""; it.d_need = 0;
  }
  if (kind === "ops") { it.ops = cleanOps(b.ops); it.program_id = ""; it.d_need = 0; }
  if (kind === "produk") {
    it.partner = s(b.partner, 120); it.goal = s(b.goal, 1000);
    const end = s(b.end_date, 10);
    it.end_date = ISO.test(end) && end >= it.date ? end : "";
    it.program_id = ""; it.d_need = 0;
  }
  if (kind === "aktivitas") {
    const end = s(b.end_date, 10);
    it.end_date = ISO.test(end) && end >= it.date ? end : "";
    it.d_need = 0;
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
// total klik per kegiatan: link pelacak /go/ lama + link Link & QR Studio; Program ikut menjumlahkan kegiatan terkaitnya (program_id).
// Tiap link menempel ke satu kegiatan saja, jadi tidak ada yang terhitung dua kali. Semua nol -> NULL (tampil kosong).
const OWN = (t) => `COALESCE((SELECT SUM(clicks) FROM links WHERE links.item_id = ${t}.id), 0) + COALESCE((SELECT n FROM qrclicks WHERE qrclicks.item_id = ${t}.id), 0)`;
const CLICKS = `NULLIF(${OWN("items")} + CASE WHEN items.kind = 'program' THEN COALESCE((SELECT SUM(${OWN("c")}) FROM items c WHERE c.program_id = items.id), 0) ELSE 0 END, 0) AS clicks`;
/** overlap (laporan): ikut program & aktivitas yang mulai sebelum periode tapi masih berjalan di dalamnya, termasuk yang statusnya masih "berjalan"
 *  walau tanggal selesainya sudah lewat (kalender cukup menurut tanggal mulai). */
async function listItems(env, from, to, overlap, reg) {
  await ensure(env);
  if (!ISO.test(from) || !ISO.test(to)) return [];
  // tim regional hanya melihat kegiatan cabang & rencana galeri
  const L = (await env.DB.prepare(`SELECT items.*, ${CLICKS} FROM items WHERE date >= ? AND date <= ?${reg ? " AND " + REG_SQL : ""} ORDER BY date, time, created_at`).bind(from, to).all()).results;
  if (!overlap || reg) return L;
  const run = (await env.DB.prepare(`SELECT items.*, ${CLICKS} FROM items WHERE kind IN ('program', 'aktivitas') AND date < ? AND (COALESCE(NULLIF(end_date, ''), date) >= ? OR status IN ('berjalan', 'kendala')) ORDER BY date`).bind(from, from).all()).results;
  return [...run, ...L];
}
/** Tugas desain: semua yang belum selesai (tanggal berapa pun) + yang selesai dengan tenggat di rentang itu. */
async function designItems(env, from, to) {
  await ensure(env);
  return (await env.DB.prepare("SELECT * FROM items WHERE d_need = 1 AND (COALESCE(d_status, 'belum') <> 'selesai' OR COALESCE(d_due, date) BETWEEN ? AND ?) ORDER BY COALESCE(d_due, date), created_at LIMIT 500")
    .bind(ISO.test(from) ? from : "0000-00-00", ISO.test(to) ? to : "9999-12-31").all()).results;
}
/** Tim & role pekerjaan { teams, roles } yang dikirim Tool Hub (Admin → Tim & role); belum pernah dikirim = daftar bawaan. */
export async function orgOf(env) {
  await ensure(env);
  const r = await env.DB.prepare("SELECT v FROM cfg WHERE k = 'org'").first();
  try { return cleanOrg(JSON.parse((r && r.v) || "null")); } catch { return cleanOrg(null); }
}
/** Daftar regional & cabang / galeri [{ r, c, t }] yang dikirim Tool Hub (kosong = belum diatur: cabang boleh diketik bebas). */
export async function branches(env) {
  await ensure(env);
  const r = await env.DB.prepare("SELECT v FROM cfg WHERE k = 'branches'").first();
  try { const L = JSON.parse((r && r.v) || "[]"); return Array.isArray(L) ? L.map((x) => ({ ...x, t: x.t === "galeri" || x.t === "cabang" ? x.t : branchType(x.c) })) : []; } catch { return []; }
}
/** opts.logAt (ISO): waktu baris riwayat progres (impor dari sheet: tanggal "Last Update"); kosong = sekarang. */
/** Boleh mengubah kegiatan: admin hub, pembuat, PIC, atau desainer visual (bila kegiatan butuh visual). */
export function canEditItem(me, it) {
  const e = lower(me.e);
  return !!me.adm || (!!e && [it.created_email, it.owner_email, it.d_need ? it.d_who : ""].some((x) => lower(x) === e));
}
async function saveItem(env, me, b, opts = {}) {
  await ensure(env);
  const it = cleanItem(b);
  if (it.error) return it;
  const by = who(me), meE = lower(me.e);
  const prev = b.id ? await env.DB.prepare("SELECT * FROM items WHERE id=?").bind(String(b.id)).first() : null;
  if (b.id && !prev) return { error: "Kegiatan ini sudah dihapus orang lain. Muat ulang kalender." };
  // dicek terhadap data lama, jadi orang tidak bisa menjadikan dirinya PIC lalu menyimpan
  if (prev && !opts.trusted && !canEditItem(me, prev)) return { error: "Hanya pembuat, PIC, desainer, atau admin yang bisa mengubah kegiatan ini.", forbidden: true };
  const org = await orgOf(env), job = await jobOf(env, me, org);
  if (isRegional(org, job, me.adm)) {
    if (!REG_KINDS.includes(it.kind) || (prev && !REG_KINDS.includes(prev.kind))) return { error: "Tim regional hanya bisa mencatat kegiatan cabang dan rencana galeri baru." };
    it.program_id = ""; it.d_need = 0;   // program & permintaan visual tidak terlihat oleh tim regional
  }
  if (it.kind === "cabang") {
    // cabang dari daftar (nama dirapikan, regional ikut); cabang lama yang sudah dihapus dari daftar tetap boleh disimpan apa adanya
    const B = await branches(env), hit = B.find((x) => lower(x.c) === lower(it.branch)), kept = prev && prev.branch === it.branch;
    if (hit) { it.branch = hit.c; it.region = hit.r; }
    else if (kept) it.region = prev.region || "";
    else if (B.length) return { error: "Cabang “" + it.branch + "” tidak ada di daftar. Pilih dari daftar, atau minta admin Tool Hub menambahkannya." };
  }
  if (it.kind === "galeri") {
    // regional dari daftar (galeri barunya sendiri belum ada di daftar); cabang pendamping boleh kosong
    const B = await branches(env), reg = B.find((x) => lower(x.r) === lower(it.region)), hit = it.branch && B.find((x) => lower(x.c) === lower(it.branch));
    if (reg) it.region = reg.r;
    else if (B.length && !(prev && prev.region === it.region)) return { error: "Regional “" + it.region + "” tidak ada di daftar. Pilih dari daftar, atau minta admin Tool Hub menambahkannya." };
    if (hit) it.branch = hit.c;
    else if (it.branch && B.length && !(prev && prev.branch === it.branch)) return { error: "Cabang pendamping “" + it.branch + "” tidak ada di daftar." };
  }
  // tersambung ke Event & Lead: Peserta (dan Leads untuk kegiatan cabang) tetap angka dari event
  if (prev && prev.event_id) { it.result_num = prev.result_num; if (prev.kind === "cabang") it.leads = prev.leads; }
  const vals = EDIT.map((k) => it[k] ?? null);
  // updated_at selalu naik (juga bila dua simpanan jatuh di milidetik yang sama), supaya cek base di bawah tidak terlewat
  let now = new Date().toISOString();
  if (prev && prev.updated_at && now <= prev.updated_at) now = new Date(Date.parse(prev.updated_at) + 1).toISOString();
  // base = updated_at versi yang dibuka: kalau sudah diubah lagi sejak itu (orang lain / tab lain), jangan ditimpa diam-diam
  if (prev && b.base !== undefined && !b.force && (prev.updated_at || "") !== String(b.base || ""))
    return { conflict: true, by: prev.updated_by || "", at: prev.updated_at || "", error: `Kegiatan ini sudah diubah ${prev.updated_by || "orang lain"} setelah kamu membukanya.` };
  if ((it.kind === "ops" || (prev && prev.kind === "ops")) && !canOps(org, job, me.adm)) return { error: "Ops ETF hanya bisa dicatat dan diubah oleh ETF & Fund Ops atau admin." };
  if ((it.kind === "produk" || (prev && prev.kind === "produk")) && !me.adm) return { error: "Pengembangan produk hanya bisa dicatat dan diubah oleh admin Tool Hub." };
  if ((it.kind === "program" || (prev && prev.kind === "program")) && !canAssign(org, job, me.adm)) return { error: "Program hanya bisa dibuat dan diubah oleh role yang punya hak Program & tugas (mis. Partnership, Head), atau admin." };
  const ap = approvalStep(prev, it, meE, by);
  if (ap.error) return ap;
  const mChanged = METRICS.some((k) => (it[k] ?? null) !== ((prev && prev[k]) ?? null));
  const srv = { ...ap.cols, m_at: mChanged ? now : (prev && prev.m_at) || null, m_src: mChanged ? "manual" : (prev && prev.m_src) || null, event_id: (prev && prev.event_id) || null }, svals = SERVER_COLS.map((k) => srv[k] ?? null);
  let id = prev ? prev.id : "";
  if (prev) {
    const r = await env.DB.prepare(`UPDATE items SET ${[...EDIT, ...SERVER_COLS].map((k) => k + "=?").join(", ")}, updated_by=?, updated_at=? WHERE id=?`).bind(...vals, ...svals, by, now, id).run();
    if (!r.meta.changes) return { error: "Kegiatan ini sudah dihapus orang lain. Muat ulang kalender." };
  } else {
    id = crypto.randomUUID();
    const cols = ["id", ...EDIT, ...SERVER_COLS, "created_by", "created_email", "created_at", "updated_by", "updated_at"];
    await env.DB.prepare(`INSERT INTO items (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(",")})`).bind(id, ...vals, ...svals, by, meE, now, by, now).run();
  }
  // rencana galeri: tiap pindah tahap atau ada update progres -> satu baris riwayat (tahap saat itu + catatannya)
  // dokumen yang berubah ikut ditulis di riwayat
  const upd = [String(b.progress ?? "").trim().slice(0, 1000), ...(it.kind === "galeri" ? docChanges(prev && prev.kind === "galeri" ? prev.docs : "", it.docs) : [])].filter(Boolean).join(" · ");
  if ((it.kind === "galeri" || it.kind === "produk") && (upd || !prev || prev.status !== it.status))
    await env.DB.prepare("INSERT INTO comments (item_id, at, by_name, by_email, kind, text) VALUES (?, ?, ?, ?, ?, ?)").bind(id, opts.logAt || now, by, meE, "progres:" + it.status, upd).run();
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
    // updated_at ikut berubah: form yang masih membuka versi lama tidak menimpa keputusan ini (lihat base di saveItem)
    st = env.DB.prepare("UPDATE items SET approval='disetujui', approval_note=?, approved_by=?, approved_at=?, updated_by=?, updated_at=? WHERE id=?").bind(note, by, now, by, now, it.id);
  } else if (b.action === "revisi") {
    if (!note) return { error: "Tulis catatan revisinya." };
    if (it.approval !== "menunggu" && it.approval !== "disetujui") return { error: "Konten ini tidak sedang menunggu persetujuan." };
    st = env.DB.prepare("UPDATE items SET approval='revisi', approval_note=?, approved_by='', approved_at='', status = CASE WHEN status = 'review' THEN 'draf' ELSE status END, updated_by=?, updated_at=? WHERE id=?").bind(note, by, now, it.id);
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
/** Email blast dari Email Studio atas nama by: kegiatan baru atau perbarui b.id, link pelacak ke b.target, gambar b.img. */
async function hubEmail(env, b) {
  await ensure(env);
  const by = b.by || {}, e = lower(by.email);
  if (!EMAIL.test(e)) return { error: "Pembuat kegiatan tidak dikenal." };
  // dari Email Studio selalu link lengkap; awalan lain (ftp:, javascript:) ditolak, bukan diberi https:// seperti isian form
  const target = /^https?:\/\//i.test(String(b.target || "").trim()) ? cleanUrl(b.target) : "";
  try { new URL(target); } catch { return { error: "Link tujuan tidak sah." }; }
  const me = { e, n: String(by.name || e).slice(0, 60), j: jobsOf(await orgOf(env))[by.job] ? by.job : "" }, i = b.item || {};
  const f = { title: String(i.title || "").trim().slice(0, 200) || "Email blast", date: i.date, email_tpl: String(i.email_tpl || "").trim().slice(0, 80) };
  let r;
  if (b.id) {
    const prev = await env.DB.prepare("SELECT * FROM items WHERE id=?").bind(String(b.id)).first();
    if (!prev || prev.channel !== "Email / Newsletter") return { error: "Kegiatan email ini sudah dihapus di Planner.", notFound: true };
    if (!canEditItem(me, prev)) return { error: "Hanya pembuat, PIC, atau admin yang bisa memperbarui kegiatan email ini.", forbidden: true };
    r = await saveItem(env, me, { ...prev, ...f, email_tpl: f.email_tpl || prev.email_tpl || "" });
  } else r = await saveItem(env, me, { kind: "artikel", channel: "Email / Newsletter", status: "terbit", owner: me.n, owner_email: e, ...f });
  if (r.error) return r;
  const id = r.id || String(b.id), old = await env.DB.prepare("SELECT code FROM links WHERE item_id=? AND target=? ORDER BY created_at LIMIT 1").bind(id, target).first();
  const lk = old ? { code: old.code } : await saveLink(env, me, { item_id: id, target });
  if (lk.error) return lk;
  const img = imgOk(b.img);
  if (img) await env.DB.prepare("INSERT OR REPLACE INTO item_img (id, img, at) VALUES (?, ?, ?)").bind(id, img, new Date().toISOString()).run();
  return { id, code: lk.code, url: appUrl(env, "planner") + "/go/" + lk.code };
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
/** ID video YouTube dari link (watch?v=, youtu.be/, shorts/, embed/), "" kalau bukan YouTube. */
export function ytId(link) {
  let u; try { u = new URL(String(link || "")); } catch { return ""; }
  if (!/(^|\.)(youtube\.com|youtu\.be)$/i.test(u.hostname)) return "";
  const id = /youtu\.be$/i.test(u.hostname) ? u.pathname.slice(1) : u.searchParams.get("v") || (u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/) || [])[1] || "";
  return /^[\w-]{11}$/.test(id) ? id : "";
}
/** Gambar sampul halaman (og:image / twitter:image) sebagai URL absolut, "" kalau tidak ada. */
export function ogImage(html, base) {
  for (const k of ["og:image:secure_url", "og:image", "twitter:image"]) {
    const m = String(html).match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${k}["']`, "i"));
    if (m) try { return new URL((m[1] || m[2]).replace(/&amp;/g, "&"), base).href; } catch { /* lanjut */ }
  }
  return "";
}
/** URL dari luar yang boleh diambil server: https, nama host (bukan IP / localhost). */
const safeHttps = (v) => { try { const u = new URL(String(v || "")); return u.protocol === "https:" && !/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname) && !/^[\d.]+$|:/.test(u.hostname) ? u : null; } catch { return null; } };
/** Isi respons dipotong di max byte (null kalau lebih). */
async function readCapped(res, max) {
  const rd = res.body.getReader(), parts = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > max) { rd.cancel().catch(() => {}); return null; } parts.push(value); }
  const out = new Uint8Array(n); let o = 0; for (const x of parts) { out.set(x, o); o += x.length; } return out;
}
const UA_WEB = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
/** GET /api/linkimg: gambar sampul link artikel / thumbnail YouTube, dikirim apa adanya (browser yang mengecilkan). */
async function linkImg(link) {
  const u = safeHttps(link);
  if (!u) return json({ error: "Link harus https." }, 400);
  const get = (x, accept) => fetch(x, { headers: { "User-Agent": UA_WEB, Accept: accept }, redirect: "follow", signal: AbortSignal.timeout(10000) });
  try {
    let src = ytId(u.href) ? `https://i.ytimg.com/vi/${ytId(u.href)}/hqdefault.jpg` : "";
    if (!src) {
      const r = await get(u.href, "text/html");
      const body = r.ok ? await readCapped(r, 1.5e6) : null;
      src = body ? ogImage(new TextDecoder().decode(body), r.url || u.href) : "";
    }
    if (!src || !safeHttps(src)) return json({ error: "Gambar tidak ditemukan di link ini." }, 404);
    const r = await get(src, "image/*"), ct = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!r.ok) return json({ error: "Gambar tidak ditemukan di link ini." }, 404);
    if (!/^image\/(jpeg|png|webp)$/.test(ct)) return json({ error: "Gambar di link ini bukan JPG/PNG/WebP." }, 415);
    const img = await readCapped(r, 5e6);
    return img ? new Response(img, { headers: { "content-type": ct, "cache-control": "no-store" } }) : json({ error: "Gambar terlalu besar." }, 415);
  } catch { return json({ error: "Gambar tidak ditemukan di link ini." }, 404); }
}
/** POST /api/yt/refresh: statistik video YouTube kegiatan (maks. 50); angka yang tidak didapat tidak menghapus isian. */
async function ytRefresh(env, ids) {
  await ensure(env);
  if (!env.YOUTUBE_API_KEY) return { updated: 0, skipped: "no-key" };
  const L = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, 50);
  if (!L.length) return { updated: 0 };
  const rows = (await env.DB.prepare(`SELECT id, link FROM items WHERE id IN (${L.map(() => "?").join(",")})`).bind(...L).all()).results
    .map((r) => ({ id: r.id, v: ytId(r.link) })).filter((r) => r.v);
  if (!rows.length) return { updated: 0 };
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${[...new Set(rows.map((x) => x.v))].join(",")}&key=${encodeURIComponent(env.YOUTUBE_API_KEY)}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  if (!j) return { updated: 0, error: "YouTube tidak menjawab (cek YOUTUBE_API_KEY / kuota)." };
  const st = new Map((j.items || []).map((x) => [x.id, x.statistics || {}])), now = new Date().toISOString(), q = [];
  for (const x of rows) {
    const s = st.get(x.v); if (!s) continue;
    q.push(env.DB.prepare("UPDATE items SET m_views=COALESCE(?, m_views), m_likes=COALESCE(?, m_likes), m_comments=COALESCE(?, m_comments), m_src='yt', m_at=? WHERE id=?")
      .bind(numOf(s.viewCount), numOf(s.likeCount), numOf(s.commentCount), now, x.id));
  }
  if (q.length) await env.DB.batch(q);
  return { updated: q.length };
}
/** Data URL gambar postingan yang boleh disimpan (JPG/PNG/WebP, ≤ ±700 KB), atau null. */
export const imgOk = (v) => typeof v === "string" && v.length <= 950000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;
/** Satu baris CSV (sudah dipetakan di browser) -> baris yang sah, atau null. */
export function cleanMetricRow(r) {
  if (!r || typeof r !== "object") return null;
  const link = cleanUrl(r.link), key = postKey(link);
  if (!key) return null;
  const date = ISO.test(String(r.date || "").slice(0, 10)) ? String(r.date).slice(0, 10) : "";
  const out = { key, link, date, title: String(r.title ?? "").replace(/\s+/g, " ").trim().slice(0, 160), type: String(r.type ?? "").slice(0, 40) };
  for (const k of METRICS) out[k] = numOf(r[k]);
  out.img = imgOk(r.img);
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
  const now = new Date().toISOString(), by = who(me), meE = lower(me.e), st = [], unmatched = [], imgs = [];
  let matched = 0, created = 0;
  for (const r of rows.values()) {
    const res = r.m_reach ?? r.m_views, id = have.get(r.key);
    if (id) {
      matched++;
      if (r.img) imgs.push([id, r.img]);
      // angka yang tidak dibawa sumber ini (CSV Meta tanpa Reposts, bookmark tanpa jangkauan/simpan) tidak dihapus
      st.push(env.DB.prepare(`UPDATE items SET ${METRICS.map((k) => k + "=COALESCE(?, " + k + ")").join(", ")}, m_at=?, m_src='csv', result_num=COALESCE(?, result_num), updated_by=?, updated_at=? WHERE id=?`).bind(...METRICS.map((k) => r[k]), now, res, by, now, id));
    } else if (b.create && r.date) {
      created++;
      const nid = crypto.randomUUID();
      if (r.img) imgs.push([nid, r.img]);
      const cols = ["id", "kind", "date", "title", "channel", "status", "owner", "owner_email", "link", "d_need", ...METRICS, "m_at", "m_src", "result_num", "created_by", "created_email", "created_at", "updated_by", "updated_at"];
      st.push(env.DB.prepare(`INSERT INTO items (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(",")})`).bind(nid, "konten", r.date, r.title || "Postingan " + tgl(r.date), channelOf(r.type, r.link), "terbit", by, meE, r.link, 0,
        ...METRICS.map((k) => r[k]), now, "csv", res, by, meE, now, by, now));
    } else unmatched.push(r.link);
  }
  for (let i = 0; i < st.length; i += 50) await env.DB.batch(st.slice(i, i + 50));
  // gambar ±50 KB per baris: batch kecil supaya satu permintaan D1 tidak terlalu besar
  const put = imgs.map(([id, img]) => env.DB.prepare("INSERT OR REPLACE INTO item_img (id, img, at) VALUES (?, ?, ?)").bind(id, img, now));
  for (let i = 0; i < put.length; i += 10) await env.DB.batch(put.slice(i, i + 10));
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
    env.DB.prepare("DELETE FROM item_img WHERE id=?").bind(String(id)),
  ]);
  return { ok: true };
}
/** Gambar postingan beberapa kegiatan: { id: dataUrl } (maks. 100 id). */
async function listImgs(env, ids) {
  await ensure(env);
  const L = [...new Set(String(ids || "").split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 100);
  if (!L.length) return {};
  const rows = (await env.DB.prepare(`SELECT id, img FROM item_img WHERE id IN (${L.map(() => "?").join(",")})`).bind(...L).all()).results;
  return Object.fromEntries(rows.map((r) => [r.id, r.img]));
}
/** Ganti gambar postingan satu kegiatan; img "" = hapus. Hak sama dengan mengubah kegiatannya. */
async function saveImg(env, me, b) {
  await ensure(env);
  const id = String(b.id || ""), it = id ? await env.DB.prepare("SELECT created_email, owner_email, d_need, d_who FROM items WHERE id=?").bind(id).first() : null;
  if (!it) return { error: "Kegiatan ini sudah dihapus." };
  if (!canEditItem(me, it)) return { error: "Hanya pembuat, PIC, desainer, atau admin yang bisa mengubah kegiatan ini.", forbidden: true };
  if (b.img === "") { await env.DB.prepare("DELETE FROM item_img WHERE id=?").bind(id).run(); return { ok: true }; }
  const img = imgOk(b.img);
  if (!img) return { error: "Gambar harus JPG/PNG/WebP dan di bawah ±700 KB." };
  await env.DB.prepare("INSERT OR REPLACE INTO item_img (id, img, at) VALUES (?, ?, ?)").bind(id, img, new Date().toISOString()).run();
  return { ok: true };
}
/** Dicatat saat login: anggota tim untuk pilihan penanggung jawab, desainer, dan penerima tugas. Role ikut dari tiket Tool Hub (j).
 *  User biasa (tanpa role, bukan admin hub) tetap boleh membuka Planner, tapi tidak menjadi anggota yang bisa diberi tugas. */
export async function seen(env, p) {
  const email = String(p.e || "").toLowerCase();
  if (!EMAIL.test(email)) return;
  await ensure(env);
  const job = jobsOf(await orgOf(env))[p.j] ? p.j : null, member = job || p.adm ? 1 : 0;
  // cabang (c) dari tiket: kosong tidak menghapus yang sudah ada (sinkron anggota dari Tool Hub yang menentukan)
  await env.DB.prepare("INSERT INTO users (email, name, role, seen_at, active, branch) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name, seen_at = excluded.seen_at, "
    + "role = CASE WHEN excluded.active = 1 THEN COALESCE(excluded.role, role) ELSE NULL END, active = CASE WHEN excluded.active = 1 THEN active ELSE 0 END, branch = COALESCE(NULLIF(excluded.branch, ''), branch)")
    .bind(email, String(p.n || p.u || email).slice(0, 60), job, new Date().toISOString(), member, String(p.c || "").slice(0, 60)).run();
}
/** Rencana galeri (semua tanggal, paling banyak 500) + riwayat progresnya [{ at, by, st, text }], urut regional lalu tanggal mulai. id = satu rencana saja. */
// kind = "produk" -> semua pengembangan produk; id -> satu rencana galeri / produk
async function galleries(env, id, kind) {
  await ensure(env);
  const L = (await env.DB.prepare(`SELECT * FROM items WHERE ${id ? "kind IN ('galeri', 'produk') AND id = ?" : "kind = ?"} ORDER BY region, date LIMIT 500`).bind(id ? String(id) : kind === "produk" ? "produk" : "galeri").all()).results;
  if (!L.length) return [];
  const C = (await env.DB.prepare(`SELECT item_id, at, by_name, kind, text FROM comments WHERE kind LIKE 'progres:%' AND item_id IN (${L.map(() => "?").join(",")}) ORDER BY id`).bind(...L.map((i) => i.id)).all()).results;
  const by = {}; C.forEach((c) => (by[c.item_id] = by[c.item_id] || []).push({ at: c.at, by: c.by_name, st: c.kind.slice(8), text: c.text || "" }));
  return L.map((i) => ({ ...i, log: by[i.id] || [] }));
}
/* =========================================================
   TERJEMAHAN LAPORAN (versi English): isian bebas (judul, catatan, update) lewat shared/ai.js (Gemini, cadangan Groq / Workers AI)
   ========================================================= */
const TR_RULES = `You translate Indonesian text from an internal company activity report into natural, concise English.
Input: a JSON object { "<id>": "<Indonesian text>" }. Output ONLY JSON: { "lang": "en", "translations": { "<id>": "<English text>" } } with every id.
Keep unchanged: names of people, companies, products, apps, places and events; stock / fund / ETF codes; numbers, amounts, dates, URLs, emails, hashtags.
Use standard finance terms (reksa dana = mutual fund, obligasi = bond, saham = stock, NAB = NAV). Text already in English stays as is. Do not add explanations.`;
/** POST /api/translate { texts: [...] } -> { map: { teks: terjemahan }, failed, note }. Dibagi per ±6.000 karakter dan dikirim bersamaan;
 *  kelompok yang gagal / jawabannya tidak terbaca dilewati (teksnya tetap Bahasa Indonesia, note = alasan pertama). call = ai (tes: tiruan). */
export async function translateTexts(env, b, call = ai) {
  const T = [...new Set((Array.isArray(b.texts) ? b.texts : []).map((x) => String(x ?? "").trim().slice(0, 1500)).filter((x) => /\p{L}{2}/u.test(x) && !/^https?:\/\/\S+$/.test(x)))].slice(0, 600);
  const groups = []; let g = [], n = 0;
  for (const t of T) { if (g.length && (n + t.length > 6000 || g.length >= 80)) { groups.push(g); g = []; n = 0; } g.push(t); n += t.length; }
  if (g.length) groups.push(g);
  const map = {}, errs = [];
  await Promise.all(groups.map(async (G) => {
    try {
      const { text } = await call(env, TR_RULES, JSON.stringify(Object.fromEntries(G.map((t, i) => [i, t]))), Math.ceil(G.join("").length / 2) + 600, undefined, { temperature: 0.2, json: true });
      const o = (JSON.parse(String(text).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")) || {}).translations || {};
      G.forEach((t, i) => { const v = o[i]; if (typeof v === "string" && v.trim()) map[t] = v.trim().slice(0, 3000); });
    } catch (e) { errs.push(e instanceof AiError ? e.message : "Jawaban AI tidak terbaca."); }
  }));
  return { map, failed: T.length - Object.keys(map).length, note: errs[0] || "" };
}
/**
 * POST /api/galeri/import { rows: [...] } dari sheet laporan galeri (ditempel / file Excel, sudah dipetakan di browser).
 * Baris = isian rencana galeri (title wajib) + progress (Remarks) + log_date (Last Update, YYYY-MM-DD).
 * Galeri yang namanya sudah ada (huruf besar/kecil diabaikan) diperbarui: hanya kolom yang terisi di sheet yang menimpa,
 * dokumen digabung per dokumen, Remarks masuk riwayat kalau berbeda dari update terakhir. Cabang in charge di luar daftar dikosongkan.
 */
async function importGalleries(env, me, b) {
  await ensure(env);
  const org = await orgOf(env);
  if (!canImportGal(org, await jobOf(env, me, org), me.adm)) return { error: "Hanya admin atau role dengan hak Impor galeri (Tool Hub → Admin → Tim & role) yang bisa mengimpor galeri." };
  const rows = Array.isArray(b.rows) ? b.rows.slice(0, 300) : [];
  if (!rows.length) return { error: "Tidak ada baris untuk diimpor." };
  const B = await branches(env), all = await galleries(env, ""), out = { added: 0, updated: 0, same: 0, errors: [], warn: [] };
  const byName = new Map(all.map((i) => [lower(i.title).trim(), i]));
  for (const [n, r0] of rows.entries()) {
    const r = r0 && typeof r0 === "object" ? r0 : {}, name = String(r.title || "").trim(), row = n + 1;
    if (!name) { out.errors.push({ row, error: "Nama galeri kosong." }); continue; }
    const prev = byName.get(lower(name)), set = Object.fromEntries(Object.entries(r).filter(([k, v]) => !["docs", "progress", "log_date", "id"].includes(k) && v != null && String(v).trim() !== ""));
    if (prev) delete set.title;   // nama galeri lama tetap (sheet bisa beda huruf besar/kecil)
    // impor bebas izin edit, jadi PIC galeri orang lain tidak boleh diganti lewat sheet (bisa dipakai mengambil alih)
    if (prev && !canEditItem(me, prev)) { delete set.owner; delete set.owner_email; }
    if (set.branch && B.length && !B.some((x) => lower(x.c) === lower(set.branch))) { out.warn.push({ row, msg: `Cabang “${set.branch}” tidak ada di daftar, dikosongkan.` }); delete set.branch; }
    // regional: kolom Regional, atau regional dari cabang in charge
    if (!set.region && set.branch) { const h = B.find((x) => lower(x.c) === lower(set.branch)); if (h) set.region = h.r; }
    const docs = { ...JSON.parse((prev && prev.docs) || "{}"), ...(r.docs && typeof r.docs === "object" ? r.docs : {}) };
    const last = prev && (prev.log || []).filter((l) => l.text).slice(-1)[0], prog = String(r.progress || "").trim();
    const item = prev ? { ...prev, ...set, id: prev.id, kind: "galeri", docs } : { kind: "galeri", date: set.date || r.log_date || "", owner: who(me), owner_email: lower(me.e), ...set, docs };
    if (!ISO.test(String(item.date || ""))) item.date = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    item.progress = prog && !(last && last.text === prog) ? prog : "";
    const changed = !prev || item.progress || cleanDocs(docs) !== (prev.docs || "") || Object.keys(set).some((k) => String(prev[k] ?? "") !== String(set[k]));
    if (!changed) { out.same++; continue; }
    const at = ISO.test(String(r.log_date || "")) ? r.log_date + "T05:00:00.000Z" : "";
    const res = await saveItem(env, me, item, { logAt: at, trusted: true });   // impor sheet galeri bersama: tidak lewat izin edit form
    if (res.error) { out.errors.push({ row, error: res.error }); continue; }
    prev ? out.updated++ : out.added++;
    if (!prev) byName.set(lower(name), { id: res.id, title: name, log: [] });
  }
  return out;
}
/** GET /__hub/galeri (Tool Hub, halaman admin): rencana galeri yang sudah MoU / diresmikan tapi namanya belum ada di daftar cabang / galeri. */
/** GET /__hub/event-items (Event & Lead): kegiatan yang bisa disambungkan ke event baru. cabang = kegiatan cabang di cabang itu;
 *  edukasi = edukasi milik / buatan orang itu. Belum selesai / batal, tidak lebih dari 30 hari lalu, belum tersambung ke event lain. */
async function eventItems(env, q) {
  await ensure(env);
  const kind = q.get("kind") === "edukasi" ? "edukasi" : "cabang", e = lower(q.get("email")), from = new Date(Date.now() + 7 * 3600e3 - 30 * 86400e3).toISOString().slice(0, 10);
  // sinkron event mengubah kegiatan, jadi cabang: hanya kegiatan yang dibuat / di-PIC-kan orang ini (admin: semua di cabangnya)
  const mine = "(owner_email = ? OR created_email = ?)", adm = q.get("adm") === "1";
  const who = kind === "cabang" ? "branch = ?" + (adm ? "" : " AND " + mine) : mine, args = kind === "cabang" ? [String(q.get("branch") || ""), ...(adm ? [] : [e, e])] : [e, e];
  const L = (await env.DB.prepare(`SELECT id, kind, title, date, time, place, branch, status FROM items WHERE kind = ? AND ${who} AND status NOT IN ('selesai', 'batal') AND date >= ? AND COALESCE(event_id, '') = '' ORDER BY date LIMIT 100`)
    .bind(kind, ...args, from).all()).results;
  return L;
}
/** POST /__hub/event-sync (Event & Lead): { item_id, event_id, set?: { title, date, time, place, branch, status }, counts?: { reg, hadir } }.
 *  Kegiatan cabang: Peserta = hadir, Leads = pendaftar; jenis lain: Peserta = hadir. Kegiatan yang sudah dihapus -> { gone: true }. */
async function eventSync(env, b) {
  await ensure(env);
  const it = await env.DB.prepare("SELECT id, kind, status FROM items WHERE id = ?").bind(String(b.item_id || "")).first();
  if (!it) return { gone: true };
  const S = { event_id: String(b.event_id || "").slice(0, 60) }, set = b.set && typeof b.set === "object" ? b.set : {}, s = (v, n) => String(v ?? "").trim().slice(0, n);
  if (set.title && s(set.title, 160)) S.title = s(set.title, 160);
  if (ISO.test(s(set.date, 10))) S.date = s(set.date, 10);
  if (set.time !== undefined) S.time = s(set.time, 5);
  if (set.place !== undefined) S.place = s(set.place, 200);
  if (set.branch && it.kind === "cabang") { const h = (await branches(env)).find((x) => lower(x.c) === lower(set.branch)); if (h) { S.branch = h.c; S.region = h.r; } }
  if (set.status && (KINDS[it.kind] || {}).statuses && KINDS[it.kind].statuses.includes(set.status)) S.status = set.status;
  const c = b.counts && typeof b.counts === "object" ? b.counts : null, n = (v) => Math.max(0, Math.round(Number(v) || 0));
  if (c) { S.result_num = n(c.hadir); if (it.kind === "cabang") S.leads = n(c.reg); }
  // hanya angka berubah: updated_at tetap, supaya form yang sedang dibuka orang tidak dianggap bentrok
  const meta = Object.keys(set).length ? { updated_by: "Event & Lead", updated_at: new Date().toISOString() } : {};
  const K = Object.keys({ ...S, ...meta }), V = { ...S, ...meta };
  await env.DB.prepare(`UPDATE items SET ${K.map((k) => k + " = ?").join(", ")} WHERE id = ?`).bind(...K.map((k) => V[k]), it.id).run();
  return { ok: true };
}
/** GET /__hub/link-items (Link & QR Studio): kegiatan yang bisa diberi link. reg=1 -> hanya kegiatan cabang & rencana galeri
 *  (Studio menentukan regional dari tiket Tool Hub). q = cari judul; ids = kegiatan tertentu (yang hilang = sudah dihapus). Semua status. */
async function linkItems(env, q) {
  await ensure(env);
  const W = [], A = [], ids = String(q.get("ids") || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 200), s = String(q.get("q") || "").trim().slice(0, 60);
  if (q.get("reg") === "1") W.push(REG_SQL);
  if (ids.length) { W.push(`id IN (${ids.map(() => "?").join(",")})`); A.push(...ids); }
  if (s) { W.push("title LIKE ?"); A.push("%" + s.replace(/[%_]/g, "") + "%"); }
  const L = (await env.DB.prepare(`SELECT id, kind, title, date, COALESCE(branch, '') AS branch, status FROM items${W.length ? " WHERE " + W.join(" AND ") : ""} ORDER BY date DESC, created_at DESC LIMIT ${ids.length ? 200 : 50}`).bind(...A).all()).results;
  return { items: L };
}
/** POST /__hub/link-clicks (Link & QR Studio): { items: { <item_id>: <total klik> } }. Total, bukan tambahan: hanya ditulis kalau lebih besar,
 *  supaya kiriman yang datang terlambat tidak menurunkan angka dan kiriman ulang tidak memakai kuota tulis D1. Kegiatan yang sudah dihapus -> gone. */
async function linkClicks(env, b) {
  await ensure(env);
  const E = Object.entries(b && typeof b.items === "object" && b.items ? b.items : {}).slice(0, 200).map(([k, v]) => [String(k).slice(0, 60), Math.max(0, Math.round(Number(v) || 0))]);
  if (!E.length) return { ok: true, gone: [] };
  const have = new Set((await env.DB.prepare(`SELECT id FROM items WHERE id IN (${E.map(() => "?").join(",")})`).bind(...E.map((e) => e[0])).all()).results.map((x) => x.id));
  const at = new Date().toISOString(), up = E.filter(([k]) => have.has(k));
  if (up.length) await env.DB.batch(up.map(([k, n]) => env.DB.prepare("INSERT INTO qrclicks (item_id, n, at) VALUES (?, ?, ?) ON CONFLICT(item_id) DO UPDATE SET n = excluded.n, at = excluded.at WHERE excluded.n > qrclicks.n").bind(k, n, at)));
  return { ok: true, gone: E.filter(([k]) => !have.has(k)).map((e) => e[0]) };
}
async function galleryProposals(env) {
  await ensure(env);
  const B = new Set((await branches(env)).map((x) => lower(x.c)));
  const L = (await env.DB.prepare(`SELECT id, title, region, place, partner, status, owner, created_by FROM items WHERE kind = 'galeri' AND status IN (${GAL_DONE.map(() => "?").join(",")}) ORDER BY region, title LIMIT 100`).bind(...GAL_DONE).all()).results;
  return L.filter((i) => i.region && !B.has(lower(i.title))).map((i) => ({ id: i.id, r: i.region, c: i.title, city: i.place || "", partner: i.partner || "", status: i.status, by: i.owner || i.created_by || "" }));
}
async function users(env) {
  await ensure(env);
  return (await env.DB.prepare("SELECT email, name, role, COALESCE(branch, '') AS branch FROM users WHERE COALESCE(active, 1) = 1 ORDER BY name").all()).results;
}
/** POST /__hub/users dari Tool Hub: semua akun yang boleh membuka Content Planner (+ cabangnya), daftar regional & cabang, dan tim & role.
 *  Yang tidak ada di daftar tidak lagi tampil sebagai pilihan. */
async function syncUsers(env, list, brs, o) {
  await ensure(env);
  const org = o && typeof o === "object" ? cleanOrg(o) : await orgOf(env), J = jobsOf(org);
  const L = (Array.isArray(list) ? list : []).map((u) => ({ email: lower(u && u.email), name: String((u && u.name) || "").slice(0, 60), job: J[u && u.job] ? u.job : null, branch: String((u && u.branch) || "").slice(0, 60) }))
    .filter((u) => EMAIL.test(u.email)).slice(0, 500);
  if (!L.length) return { error: "Daftar anggota kosong." };   // jangan sampai semua anggota hilang karena kiriman yang keliru
  const B = Array.isArray(brs) ? brs.map((x) => ({ r: String((x && x.r) || "").slice(0, 60), c: String((x && x.c) || "").slice(0, 60), t: x && (x.t === "galeri" || x.t === "cabang") ? x.t : branchType(x && x.c) })).filter((x) => x.r && x.c).slice(0, 300) : null;
  await env.DB.batch([env.DB.prepare("UPDATE users SET active = 0"), ...L.map((u) => env.DB.prepare("INSERT INTO users (email, name, role, active, branch) VALUES (?, ?, ?, 1, ?) ON CONFLICT(email) DO UPDATE SET name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE name END, role = COALESCE(excluded.role, role), active = 1, branch = excluded.branch").bind(u.email, u.name || u.email, u.job, u.branch)),
    ...(B ? [env.DB.prepare("INSERT INTO cfg (k, v) VALUES ('branches', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(B))] : []),
    ...(o && typeof o === "object" ? [env.DB.prepare("INSERT INTO cfg (k, v) VALUES ('org', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(org))] : [])]);
  return { ok: true, n: L.length };
}
async function myRole(env, me, J) {
  await ensure(env);
  const r = await env.DB.prepare("SELECT role FROM users WHERE email=?").bind(String(me.e || "").toLowerCase()).first();
  return r && J[r.role] ? r.role : "";
}
/** Role pekerjaan orang yang sedang login: dari tiket Tool Hub; sesi lama tanpa role memakai catatan di tabel users. */
const jobOf = async (env, me, org) => { const J = jobsOf(org || await orgOf(env)); return J[me.j] ? me.j : await myRole(env, me, J).catch(() => ""); };

/* =========================================================
   TUGAS DI DALAM PROGRAM & NOTIFIKASI
   ========================================================= */
export const TASK_STATUSES = DESIGN_STATUSES;
/** J = { kunci role: nama } dari tim & role yang berlaku (role yang tidak dikenal dikosongkan). */
export function cleanTask(b, J = jobsOf(cleanOrg(null))) {
  const s = (v, n) => String(v ?? "").trim().slice(0, n);
  const t = { item_id: s(b.item_id, 40), title: s(b.title, 160), job: J[b.job] ? b.job : "", who: EMAIL.test(s(b.who, 120)) ? lower(s(b.who, 120)) : "",
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
  const org = await orgOf(env), meE = lower(me.e), by = who(me), now = new Date().toISOString(), boss = canAssign(org, await jobOf(env, me, org), me.adm);
  const prev = b.id ? await env.DB.prepare("SELECT * FROM tasks WHERE id=?").bind(String(b.id)).first() : null;
  if (b.id && !prev) return { error: "Tugas ini sudah dihapus. Muat ulang halaman." };
  if (!prev && !boss) return { error: "Hanya role yang punya hak Program & tugas (mis. Partnership, Head), atau admin, yang bisa memberi tugas." };
  // pemberi tugas & admin boleh mengubah semuanya; penerima hanya status dan link hasilnya
  const full = !prev || prev.by_email === meE || !!me.adm;
  if (prev && !full && prev.who !== meE) return { error: "Tugas ini bukan untukmu." };
  let t;
  if (full) { t = cleanTask(b, jobsOf(org)); if (t.error) return t; }
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
  const org = await orgOf(env), all = q.all && canAssign(org, await jobOf(env, me, org), me.adm);
  return (await env.DB.prepare(TASK_SEL + ` WHERE ${all ? "1 = 1" : "(t.who = ?1 OR t.by_email = ?1)"} AND (COALESCE(t.status, 'belum') <> 'selesai' OR t.done_at >= ?2) ORDER BY t.due, t.created_at LIMIT 300`).bind(meE, since).all()).results;
}
/* =========================================================
   PEKERJAAN HARIAN: tiap anggota mencatat apa yang dikerjakan per hari (beberapa entri), dibaca semua anggota,
   diubah hanya oleh pemiliknya (hapus: pemilik atau admin). Dirangkum per tim (role) di Monthly Report (PDF di browser).
   ========================================================= */
export const WORK_STATUSES = { selesai: "Selesai", berjalan: "Berjalan", kendala: "Kendala" };
const WCOLS = ["date", "text", "status", "item_id", "link", "note"];
const wibToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
/** Isian dari browser -> entri yang sah, atau { error }. Hari yang belum datang (WIB) belum bisa dicatat. */
export function cleanLog(b, today = wibToday()) {
  const s = (v, n) => String(v ?? "").trim().slice(0, n);
  const l = { date: ISO.test(s(b.date, 10)) ? s(b.date, 10) : "", text: s(b.text, 500), status: WORK_STATUSES[b.status] ? b.status : "selesai",
    item_id: s(b.item_id, 40) || null, link: cleanUrl(b.link) || null, note: s(b.note, 500) || null };
  if (!l.date) return { error: "Tanggal belum benar." };
  if (l.date > today) return { error: "Hari yang belum datang belum bisa dicatat." };
  if (!l.text) return { error: "Tulis dulu apa yang dikerjakan." };
  if (!/[\p{L}\p{N}]/u.test(l.text)) return { error: "Tulis apa yang dikerjakan dengan kata, bukan hanya tanda." };
  return l;
}
async function saveLog(env, me, b) {
  await ensure(env);
  const meE = lower(me.e), now = new Date().toISOString();
  const prev = b.id ? await env.DB.prepare("SELECT email FROM worklog WHERE id=?").bind(String(b.id)).first() : null;
  if (b.id && !prev) return { error: "Catatan ini sudah dihapus. Muat ulang halaman." };
  if (prev && prev.email !== meE) return { error: "Hanya pemilik catatan yang bisa mengubahnya." };
  const l = cleanLog(b);
  if (l.error) return l;
  // kegiatan terkait harus ada di kalender (kalau sudah dihapus, kaitannya dilepas)
  if (l.item_id && !(await env.DB.prepare("SELECT id FROM items WHERE id=?").bind(l.item_id).first())) l.item_id = null;
  if (prev) {
    await env.DB.prepare(`UPDATE worklog SET ${WCOLS.map((k) => k + "=?").join(", ")}, updated_at=? WHERE id=?`).bind(...WCOLS.map((k) => l[k]), now, String(b.id)).run();
    return { id: String(b.id) };
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO worklog (id, email, name, job, ${WCOLS.join(", ")}, created_at, updated_at) VALUES (?, ?, ?, ?${", ?".repeat(WCOLS.length)}, ?, ?)`)
    .bind(id, meE, who(me), (await jobOf(env, me)) || null, ...WCOLS.map((k) => l[k]), now, now).run();
  return { id };
}
async function deleteLog(env, me, id) {
  await ensure(env);
  const l = await env.DB.prepare("SELECT email FROM worklog WHERE id=?").bind(String(id || "")).first();
  if (!l) return { ok: true };
  if (!me.adm && l.email !== lower(me.e)) return { error: "Hanya pemilik catatan atau admin yang bisa menghapusnya." };
  await env.DB.prepare("DELETE FROM worklog WHERE id=?").bind(String(id)).run();
  return { ok: true };
}
/** Semua catatan pada periode (maks. ±3 bulan), dengan judul kegiatan terkait. */
async function listLogs(env, from, to) {
  await ensure(env);
  if (!ISO.test(from) || !ISO.test(to) || from > to) return { error: "Periode belum benar." };
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 93) return { error: "Periode maksimal 3 bulan." };
  return (await env.DB.prepare("SELECT w.*, i.title AS item_title, i.kind AS item_kind FROM worklog w LEFT JOIN items i ON i.id = w.item_id WHERE w.date BETWEEN ? AND ? ORDER BY w.date, w.name, w.created_at LIMIT 3000")
    .bind(from, to).all()).results;
}

// ---------- posting WA Channel (insight, berita, stockpick): tombol + / − di tab Harian, jumlahnya masuk ke laporan ----------
export const WA_KINDS = { insight: "Insight pasar", berita: "Berita", stockpick: "Stockpick", lain: "Lainnya" };
/** Simpan jumlah posting milik sendiri pada satu tanggal (tombol Simpan): {date, n: {jenis: jumlah}}; jumlah diganti, bukan ditambah. */
async function saveWa(env, me, b) {
  await ensure(env);
  const date = String(b.date ?? "").slice(0, 10), n = b.n && typeof b.n === "object" ? b.n : {}, ks = Object.keys(n);
  if (!ISO.test(date)) return { error: "Tanggal belum benar." };
  if (date > wibToday()) return { error: "Hari yang belum datang belum bisa dicatat." };
  if (!ks.length || ks.some((k) => !WA_KINDS[k])) return { error: "Jenis posting tidak dikenal." };
  if (ks.some((k) => !Number.isInteger(n[k]) || n[k] < 0 || n[k] > 999)) return { error: "Jumlah posting harus 0 sampai 999." };
  const meE = lower(me.e), name = who(me), job = (await jobOf(env, me)) || null, now = new Date().toISOString();
  await env.DB.batch(ks.map((k) => env.DB.prepare("INSERT INTO wapost (date, email, name, job, kind, n, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) "
    + "ON CONFLICT(date, email, kind) DO UPDATE SET n = excluded.n, name = excluded.name, updated_at = excluded.updated_at").bind(date, meE, name, job, k, n[k], now)));
  return { n };
}
// ---------- stock pick: entry, SL, TP1, TP2; status dari harga penutupan harian (EOD) sejak pick dibuat ----------
const PRICE = (v) => { const n = Number(String(v ?? "").replace(/[.,\s]/g, "")); return Number.isInteger(n) && n > 0 && n < 1e7 ? n : null; };
/** Isian pick. Harga saham IDX selalu rupiah bulat, jadi "4.250" dibaca 4250. Entry boleh area, mis. "298 - 312". */
export function cleanPick(b, today = wibToday()) {
  const t2 = String(b.tp2 ?? "").trim(), en = String(b.entry ?? "").split(/[-–—]/).map(PRICE).sort((x, y) => x - y);
  const lo = en.length <= 2 && en.every(Boolean) ? en[0] : null, hi = lo && en[1] > lo ? en[1] : null;
  const p = { date: String(b.date ?? "").slice(0, 10), code: String(b.code ?? "").trim().toUpperCase(), entry: lo, entry_hi: hi, sl: PRICE(b.sl), tp1: PRICE(b.tp1), tp2: t2 ? PRICE(t2) : null };
  if (!ISO.test(p.date)) return { error: "Tanggal belum benar." };
  if (p.date > today) return { error: "Hari yang belum datang belum bisa dicatat." };
  if (!/^[A-Z]{4}$/.test(p.code)) return { error: "Kode saham harus 4 huruf, mis. BBRI." };
  if (!p.entry || !p.sl || !p.tp1 || (t2 && !p.tp2)) return { error: "Isi entry, SL, dan TP1 dengan angka rupiah (TP2 boleh kosong)." };
  if (!(p.sl < p.entry && (p.entry_hi || p.entry) < p.tp1 && (!p.tp2 || p.tp1 < p.tp2))) return { error: "Urutan harga harus SL < entry < TP1 < TP2." };
  return p;
}
/** Status dari harga penutupan [{d, c}] (urut tanggal) sejak tanggal pick: SL atau TP1 yang tercapai duluan; setelah TP1 tetap dipantau sampai TP2. */
export function pickStatus(p, bars) {
  let status = "open", hit_date = null, tp2_date = null, last = null, last_date = null;
  for (const { d, c } of bars) {
    if (d < p.date) continue;
    last = c; last_date = d;
    if (status === "open" && c <= p.sl) { status = "sl"; hit_date = d; break; }
    if (status === "open" && c >= p.tp1) { status = "tp1"; hit_date = d; }
    if (status === "tp1" && p.tp2 && c >= p.tp2) { status = "tp2"; tp2_date = d; break; }
  }
  return { status, hit_date, tp2_date, last, last_date };
}
/** Return pick: kena SL di harga SL, kena TP1/TP2 di harga TP1, on going di harga terakhir (sementara); entry area dihitung dari harga tengahnya. */
export function pickReturn(p) {
  const out = p.status === "sl" ? p.sl : p.status === "open" ? p.last : p.tp1, e = (p.entry + (p.entry_hi || p.entry)) / 2;
  return out ? (out - e) / e : null;
}
/** Tanggal EOD terbaru yang sudah final: harga penutupan hari ini baru dipakai setelah 16.30 WIB. */
export function eodSlot(now = Date.now()) {
  const w = new Date(now + 7 * 3600e3);
  if (w.getUTCHours() * 60 + w.getUTCMinutes() < 16 * 60 + 30) w.setUTCDate(w.getUTCDate() - 1);
  return w.toISOString().slice(0, 10);
}
/** Harga penutupan harian dari Yahoo sejak tanggal from (WIB), hanya sampai tanggal EOD final. */
async function eodCloses(sym, from, upto) {
  const p1 = Math.floor(Date.parse(from + "T00:00:00+07:00") / 1000) - 86400, p2 = Math.floor(Date.now() / 1000) + 86400;
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${p1}&period2=${p2}&interval=1d`,
    { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36", Accept: "application/json" } });
  if (!r.ok) throw new Error("Yahoo " + r.status);
  const x = (await r.json())?.chart?.result?.[0], ts = x?.timestamp || [], c = x?.indicators?.quote?.[0]?.close || [];
  return ts.map((t, i) => ({ d: new Date(t * 1000 + 7 * 3600e3).toISOString().slice(0, 10), c: c[i] == null ? null : Math.round(c[i]) })).filter((b) => b.c && b.d <= upto);
}
const PCOLS = ["date", "code", "entry", "entry_hi", "sl", "tp1", "tp2"];
async function savePick(env, me, b) {
  await ensure(env);
  const meE = lower(me.e), now = new Date().toISOString();
  const prev = b.id ? await env.DB.prepare("SELECT email FROM stockpick WHERE id=?").bind(String(b.id)).first() : null;
  if (b.id && !prev) return { error: "Stock pick ini sudah dihapus. Muat ulang halaman." };
  if (prev && prev.email !== meE && !me.adm) return { error: "Hanya pembuat stock pick atau admin yang bisa mengubahnya." };
  const p = cleanPick(b);
  if (p.error) return p;
  // diubah: status dihitung ulang dari awal saat dibuka berikutnya
  if (prev) {
    await env.DB.prepare(`UPDATE stockpick SET ${PCOLS.map((k) => k + "=?").join(", ")}, status='open', hit_date=NULL, tp2_date=NULL, last=NULL, last_date=NULL, checked=NULL, updated_at=? WHERE id=?`).bind(...PCOLS.map((k) => p[k]), now, String(b.id)).run();
    return { id: String(b.id) };
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO stockpick (id, email, name, job, ${PCOLS.join(", ")}, created_at, updated_at) VALUES (?, ?, ?, ?${", ?".repeat(PCOLS.length)}, ?, ?)`)
    .bind(id, meE, who(me), (await jobOf(env, me)) || null, ...PCOLS.map((k) => p[k]), now, now).run();
  return { id };
}
async function deletePick(env, me, id) {
  await ensure(env);
  const p = await env.DB.prepare("SELECT email FROM stockpick WHERE id=?").bind(String(id || "")).first();
  if (!p) return { ok: true };
  if (!me.adm && p.email !== lower(me.e)) return { error: "Hanya pembuat stock pick atau admin yang bisa menghapusnya." };
  await env.DB.prepare("DELETE FROM stockpick WHERE id=?").bind(String(id)).run();
  return { ok: true };
}
/** Pick pada periode (menurut tanggal pick). Yang belum final dicek ulang sekali per EOD lalu disimpan; ihsg: return IHSG periode itu. */
async function listPicks(env, from, to, withIhsg) {
  await ensure(env);
  if (!ISO.test(from) || !ISO.test(to) || from > to) return { error: "Periode belum benar." };
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 400) return { error: "Periode maksimal 1 tahun." };
  const picks = (await env.DB.prepare("SELECT * FROM stockpick WHERE date BETWEEN ? AND ? ORDER BY date, created_at").bind(from, to).all()).results;
  const slot = eodSlot(), todo = picks.filter((p) => (p.status === "open" || (p.status === "tp1" && p.tp2)) && (p.checked || "") < slot);
  // shortcut: maks. 40 kode per kali buka (batas 50 subrequest Workers Free); sisanya dicek saat dibuka berikutnya
  const codes = [...new Set(todo.slice().sort((a, b) => (a.checked || "").localeCompare(b.checked || "")).map((p) => p.code))].slice(0, 40);
  const upd = [];
  await Promise.all(codes.map(async (code) => {
    const mine = todo.filter((p) => p.code === code);
    const bars = await eodCloses(code + ".JK", mine.reduce((a, p) => (p.date < a ? p.date : a), mine[0].date), slot).catch(() => null);
    if (!bars) return;   // Yahoo gagal: status lama dipakai, dicoba lagi saat dibuka berikutnya
    for (const p of mine) {
      Object.assign(p, pickStatus(p, bars), { checked: slot });
      upd.push(env.DB.prepare("UPDATE stockpick SET status=?, hit_date=?, tp2_date=?, last=?, last_date=?, checked=? WHERE id=?").bind(p.status, p.hit_date, p.tp2_date, p.last, p.last_date, slot, p.id));
    }
  }));
  if (upd.length) await env.DB.batch(upd);
  const out = { picks: picks.map((p) => ({ ...p, ret: pickReturn(p) })) };
  if (withIhsg) {
    // return IHSG: penutupan terakhir s.d. akhir periode dibanding penutupan terakhir sebelum periode
    const d0 = new Date(from + "T00:00:00Z"); d0.setUTCDate(d0.getUTCDate() - 14);
    const bars = await eodCloses("^JKSE", d0.toISOString().slice(0, 10), to < slot ? to : slot).catch(() => null);
    const base = bars && bars.filter((b) => b.d < from).pop(), last = bars && bars.filter((b) => b.d >= from).pop();
    out.ihsg = base && last ? { base: base.c, last: last.c, last_date: last.d, ret: (last.c - base.c) / base.c } : null;
  }
  return out;
}
/** Jumlah posting semua orang pada periode (maks. ±1 tahun, cukup untuk laporan triwulan / tahunan). */
async function listWa(env, from, to) {
  await ensure(env);
  if (!ISO.test(from) || !ISO.test(to) || from > to) return { error: "Periode belum benar." };
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 400) return { error: "Periode maksimal 1 tahun." };
  // tiap stock pick = satu posting WA Stockpick, jadi tidak perlu dicatat dua kali di kotak posting
  return (await env.DB.prepare("SELECT date, email, name, job, kind, n FROM wapost WHERE date BETWEEN ? AND ? AND n > 0 "
    + "UNION ALL SELECT date, email, MAX(name), MAX(job), 'stockpick', COUNT(*) FROM stockpick WHERE date BETWEEN ? AND ? GROUP BY date, email ORDER BY date, name").bind(from, to, from, to).all()).results;
}

async function programs(env) {
  await ensure(env);
  return (await env.DB.prepare("SELECT id, title, date, end_date, partner, status, channel FROM items WHERE kind = 'program' ORDER BY date DESC LIMIT 300").all()).results;
}
/** Data laporan program: program yang berjalan di periode itu (atau satu program), beserta kegiatan terkait & tugasnya. */
async function programReport(env, from, to, id) {
  await ensure(env);
  const P = id ? (await env.DB.prepare(`SELECT items.*, ${CLICKS} FROM items WHERE kind = 'program' AND id = ?`).bind(id).all()).results
    : ISO.test(from) && ISO.test(to) ? (await env.DB.prepare(`SELECT items.*, ${CLICKS} FROM items WHERE kind = 'program' AND date <= ? AND (COALESCE(NULLIF(end_date, ''), date) >= ? OR status = 'berjalan') ORDER BY date LIMIT 90`).bind(to, from).all()).results : [];
  if (!P.length) return { programs: [] };
  const ids = P.map((p) => p.id), ph = ids.map(() => "?").join(",");
  const [items, tasks] = await env.DB.batch([
    env.DB.prepare(`SELECT items.*, ${CLICKS} FROM items WHERE program_id IN (${ph}) ORDER BY date, time`).bind(...ids),
    env.DB.prepare(`SELECT * FROM tasks WHERE item_id IN (${ph}) ORDER BY due, created_at`).bind(...ids),
  ]);
  // benchmark: promo reksa dana kompetitor yang berjalan di periode program (Competitor Intelligence, service binding COMPETITOR)
  const bFrom = ISO.test(from) && !id ? from : P.map((p) => p.date).sort()[0], bTo = ISO.test(to) && !id ? to : P.map((p) => p.end_date || p.date).sort().pop();
  let bench = [];
  if (env.COMPETITOR) try {
    const r = await env.COMPETITOR.fetch(`https://competitor-intel/__hub/benchmark?from=${bFrom}&to=${bTo}&cat=${encodeURIComponent("Reksa dana")}`, { headers: { "x-hub-key": env.SSO_SECRET } });
    if (r.ok) bench = ((await r.json()).items || []).slice(0, 20);
  } catch (e) { console.error("benchmark:", e.message); }
  return { programs: P.map((p) => ({ ...p, items: items.results.filter((i) => i.program_id === p.id), tasks: tasks.results.filter((t) => t.item_id === p.id) })), bench };
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
  // "kegiatan tim hari ini": tim regional melihat kegiatan cabang & rencana galeri saja, tim pusat tanpa keduanya
  const u = me ? await env.DB.prepare("SELECT role FROM users WHERE email = ?").bind(me).first() : null;
  const scope = isRegional(await orgOf(env), u && u.role, false) ? REG_SQL : "COALESCE(kind, '') NOT IN ('cabang', 'galeri')";
  const [team, mine, design, tasks] = await Promise.all([
    env.DB.prepare(`SELECT ${cols} FROM items WHERE date = ? AND ${scope} ORDER BY time, created_at LIMIT 20`).bind(today).all(),
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
<div class="box"><table><thead><tr><th style="width:40px"></th><th>Tayang</th><th>Postingan</th><th class="n">Suka</th><th class="n">Komentar</th><th class="n">Views</th><th class="n">Repost</th></tr></thead><tbody id="rows"></tbody></table></div>
<label><input type="checkbox" id="cr"> Buat kegiatan untuk postingan yang belum ada di kalender</label><button id="save" disabled>Simpan ke Planner</button><p class="m" id="msg"></p>
<p class="m">Angka publik (suka, komentar, views, repost) dan gambar postingan. Jangkauan, simpan, dan bagikan diisi dari CSV Meta Business Suite atau manual.</p></div>
<script>(function(){var $=function(i){return document.getElementById(i)},rows=[],why="",n=+new URLSearchParams(location.search).get("n")||0,got=0;
var esc=function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};
if(!window.opener){$("st").textContent="Buka jendela ini lewat tombol bookmark di halaman Instagram.";return}
addEventListener("message",function(e){if(e.source!==window.opener||!/^https:\\/\\/([a-z]+\\.)?instagram\\.com$/.test(e.origin)||!e.data)return;var m=e.data;
if(m.pl==="row"&&m.row){got++;if(!m.ok&&m.row.err)why=String(m.row.err).slice(0,80);if(m.row.img&&!/^data:image\\/(jpeg|png|webp);base64,[A-Za-z0-9+\\/=]+$/.test(m.row.img))m.row.img="";if(m.ok)rows.push(m.row);$("bar").style.width=(n?got/n*100:100)+"%";$("st").textContent="Membaca postingan "+got+(n?"/"+n:"")+"…";
$("rows").insertAdjacentHTML("beforeend","<tr><td>"+(m.row.img?"<img src='"+esc(m.row.img)+"' alt='' width='36' height='36' style='object-fit:cover;border-radius:6px;display:block'>":"")+"</td><td>"+esc(m.row.date||"–")+"</td><td>"+esc((m.row.title||m.row.link).slice(0,50))+"</td><td class=n>"+esc(m.row.m_likes)+"</td><td class=n>"+esc(m.row.m_comments)+"</td><td class=n>"+esc(m.row.m_views)+"</td><td class=n>"+esc(m.row.m_reposts)+"</td></tr>")}
if(m.pl==="done"){$("bar").style.width="100%";$("st").textContent=rows.length+" postingan terbaca"+(got>rows.length?", "+(got-rows.length)+" gagal dibaca ("+(why?"Instagram menjawab: "+why+"; pastikan sudah login Instagram":"login Instagram dulu")+")":"")+". Periksa lalu simpan.";$("save").disabled=!rows.length}});
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
  const org = await orgOf(env), [job, gl, B, u] = await Promise.all([jobOf(env, me, org), mode === "kalender" ? glossary(env) : [], branches(env),
    env.DB.prepare("SELECT branch FROM users WHERE email = ?").bind(lower(me.e)).first().catch(() => null)]);
  const etf = (profile(env).tools || {}).etf || {}, reg = isRegional(org, job, me.adm), rl = roleIn(org, job), tm = teamIn(org, job);
  // tim regional: hanya "Kegiatan cabang" & "Kerja sama galeri baru" (tanpa paket mingguan, tugas, harian, performa)
  const cfg = { mode: reg ? "kalender" : mode, me: { name: who(me), email: String(me.e || "").toLowerCase(), adm: !!me.adm, role: job, assign: canAssign(org, job, me.adm), gal: canImportGal(org, job, me.adm), ops: canOps(org, job, me.adm), reg, branch: (u && u.branch) || me.c || "", team: tm ? tm.id : "", head: !!(rl && rl.head) },
    branches: B, kinds: reg ? Object.fromEntries(REG_KINDS.map((k) => [k, KINDS[k]])) : KINDS, galDocs: GAL_DOCS, eduRoles: EDU_ROLES, designStatuses: DESIGN_STATUSES, taskStatuses: TASK_STATUSES, roles: jobsOf(org), org, programNums: PROGRAM_NUMS, hub: String(env.HUB_URL || "").replace(/\/+$/, ""), story: appUrl(env, "story"),
    copyKinds: COPY_KINDS, approval: APPROVAL, momentTypes: MOMENT_TYPES, glossary: gl, allow: Object.keys(etf.facts || {}), workStatuses: WORK_STATUSES, waKinds: WA_KINDS };
  const head = `<title>${esc(title(env, "Content Planner"))}</title>${profileScript(env)}${themeHead("", EN)}${mode === "kalender" ? complianceScript() : ""}<script>${HUBSSO.onlyInHub(env)}window.PL=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script>`;
  return PAGE.replace("<title>Content Planner</title>", () => head);
}
const json = (v, status = 200) => Response.json(v, { status, headers: { "cache-control": "no-store" } });
// API yang boleh dipakai tim regional; selebihnya kosong (GET) atau ditolak
const REG_GET = ["/api/items", "/api/users", "/api/moments", "/api/galeri"], REG_POST = ["/api/items", "/api/items/delete", "/api/galeri/import", "/api/translate"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    if (path === HUB_FEED) return hubFeedAllowed(request, env) ? json(await hubToday(env, url.searchParams.get("email") || "")) : new Response("forbidden", { status: 403 });
    if (path === "/__hub/galeri") return hubFeedAllowed(request, env) ? json(await galleryProposals(env)) : new Response("forbidden", { status: 403 });
    if (path === "/__hub/members") return hubFeedAllowed(request, env) ? json(await users(env)) : new Response("forbidden", { status: 403 });
    // Event & Lead (service binding): pilih kegiatan untuk event, lalu kirim perubahan event & angka pesertanya
    if (path === "/__hub/event-items") return hubFeedAllowed(request, env) ? json(await eventItems(env, url.searchParams)) : new Response("forbidden", { status: 403 });
    if (path === "/__hub/event-sync") return hubPushAllowed(request, env) ? json(await eventSync(env, await request.json().catch(() => ({})))) : new Response("forbidden", { status: 403 });
    // Link & QR Studio (service binding): pilih kegiatan untuk link baru, lalu kirim total klik per kegiatan
    if (path === "/__hub/link-items") return hubFeedAllowed(request, env) ? json(await linkItems(env, url.searchParams)) : new Response("forbidden", { status: 403 });
    if (path === "/__hub/link-clicks") return hubPushAllowed(request, env) ? json(await linkClicks(env, await request.json().catch(() => ({})))) : new Response("forbidden", { status: 403 });
    if (path === "/__hub/item") {
      // atas nama orang yang menekan tombol di tool asal: dia jadi pembuat kegiatan, dan notifikasi (mis. ke desainer) tetap jalan
      if (!hubPushAllowed(request, env)) return new Response("forbidden", { status: 403 });
      const b = await request.json().catch(() => ({})), by = b.by || {}, e = lower(by.email);
      if (!EMAIL.test(e)) return json({ error: "Pembuat kegiatan tidak dikenal." }, 400);
      const r = await saveItem(env, { e, n: String(by.name || e).slice(0, 60), j: jobsOf(await orgOf(env))[by.job] ? by.job : "" }, { ...(b.item || {}), id: undefined });
      return json(r, r.error ? 400 : 200);
    }
    if (path === "/__hub/email") {
      if (!hubPushAllowed(request, env)) return new Response("forbidden", { status: 403 });
      const r = await hubEmail(env, await request.json().catch(() => ({})));
      return json(r, r.forbidden ? 403 : r.notFound ? 404 : r.error ? 400 : 200);
    }
    if (path === "/__hub/users" || path === "/__hub/notif") {
      if (!hubPushAllowed(request, env)) return new Response("forbidden", { status: 403 });
      const b = await request.json().catch(() => ({})), r = path === "/__hub/users" ? await syncUsers(env, b.users, b.branches, b.org) : await readNotifs(env, b);
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
    // jendela /ig-sync dibuka dari tab Instagram (bukan bingkai Tool Hub): bahasa dari ?lang=en yang dipasang tombol bookmark
    if (path === "/ig-sync") return new Response(IG_SYNC.replace("<meta charset=\"utf-8\">", (m) => m + i18nHead(EN)), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": "frame-ancestors 'none'", "x-robots-tag": "noindex", "referrer-policy": "no-referrer" } });
    if (isPage) {
      return new Response(await page(env, me, path === "/paket" ? "paket" : "kalender"), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": HUBSSO.frame(env), "x-robots-tag": "noindex" },
      });
    }
    try {
      // tim regional: hanya kalender kegiatan cabang & rencana galeri (lihat, tambah, ubah, hapus milik sendiri) + daftar anggota & momen
      const org = await orgOf(env), reg = isRegional(org, await jobOf(env, me, org), me.adm);
      if (reg && !(request.method === "GET" ? REG_GET : REG_POST).includes(path))
        return request.method === "GET" && !["/api/weekly", "/api/program-report"].includes(path) ? json([]) : json({ error: "Tidak tersedia untuk tim regional." }, 403);
      if (request.method === "GET") {
        const from = url.searchParams.get("from") || "", to = url.searchParams.get("to") || "";
        if (path === "/api/items" && url.searchParams.get("id")) {
          await ensure(env);
          const it = await env.DB.prepare(`SELECT items.*, ${CLICKS} FROM items WHERE id=?`).bind(url.searchParams.get("id")).first();
          return it && !(reg && !REG_KINDS.includes(it.kind)) ? json(it) : json({ error: "Kegiatan ini sudah dihapus." }, 404);
        }
        if (path === "/api/items") return json(await (url.searchParams.has("design") ? (reg ? [] : designItems(env, from, to)) : listItems(env, from, to, url.searchParams.has("overlap"), reg)));
        if (path === "/api/users") return json(await users(env));
        if (path === "/api/galeri") return json(await galleries(env, url.searchParams.get("id") || "", url.searchParams.get("kind")));
        if (path === "/api/tasks") return json(await listTasks(env, me, { item: url.searchParams.get("item") || "", all: url.searchParams.has("all") }));
        if (path === "/api/programs") return json(await programs(env));
        if (path === "/api/program-report") return json(await programReport(env, from, to, url.searchParams.get("id") || ""));
        if (path === "/api/approvals") return json(await myApprovals(env, me));
        if (path === "/api/comments") return json(await listComments(env, url.searchParams.get("item")));
        if (path === "/api/moments") return json(await moments(env, from, to));
        if (path === "/api/links") return json(await listLinks(env, url.searchParams.get("item")));
        if (path === "/api/imgs") return json(await listImgs(env, url.searchParams.get("ids")));
        if (path === "/api/linkimg") return linkImg(url.searchParams.get("url"));
        if (path === "/api/logs") { const r = await listLogs(env, from, to); return json(r, r.error ? 400 : 200); }
        if (path === "/api/wa") { const r = await listWa(env, from, to); return json(r, r.error ? 400 : 200); }
        if (path === "/api/picks") { const r = await listPicks(env, from, to, url.searchParams.has("ihsg")); return json(r, r.error ? 400 : 200); }
      }
      if (path === "/api/weekly" && request.method === "GET") {
        return new Response(await weeklyCached(env, ctx, url.searchParams.has("refresh")), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      }
      if (request.method === "POST") {
        if (!HUBSSO.sameOrigin(request)) return json({ error: "Permintaan ditolak." }, 403);
        const b = await request.json().catch(() => ({}));
        if (path === "/api/items") { const r = await saveItem(env, me, b); return json(r, r.conflict ? 409 : r.forbidden ? 403 : r.error ? 400 : 200); }
        if (path === "/api/tasks") { const r = await saveTask(env, me, b); return json(r, r.error ? 400 : 200); }
        if (path === "/api/tasks/delete") { const r = await deleteTask(env, me, b.id); return json(r, r.error ? 403 : 200); }
        if (path === "/api/items/delete") { const r = await deleteItem(env, me, b.id); return json(r, r.error ? 403 : 200); }
        if (path === "/api/img") { const r = await saveImg(env, me, b); return json(r, r.forbidden ? 403 : r.error ? 400 : 200); }
        const R = { "/api/approval": () => decide(env, me, b), "/api/comments": () => addComment(env, me, b), "/api/moments": () => saveMoment(env, me, b),
          "/api/moments/delete": () => deleteMoment(env, me, b.id), "/api/links": () => saveLink(env, me, b), "/api/metrics/import": () => importMetrics(env, me, b), "/api/yt/refresh": () => ytRefresh(env, b.ids),
          "/api/logs": () => saveLog(env, me, b), "/api/logs/delete": () => deleteLog(env, me, b.id), "/api/wa": () => saveWa(env, me, b), "/api/picks": () => savePick(env, me, b), "/api/picks/delete": () => deletePick(env, me, b.id), "/api/galeri/import": () => importGalleries(env, me, b), "/api/translate": () => translateTexts(env, b) }[path];
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
