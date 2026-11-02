// Materi presentasi Brand Kit: Investment Growth Specialist mengajukan deck, admin hub atau Head Regional menyetujui / meminta revisi /
// menarik, sales mengunduh hanya versi resmi terbaru. File di Google Drive (gdrive.js): folder Menunggu, Resmi, Arsip.
// Status versi: unggah -> menunggu -> resmi | revisi; resmi -> arsip (diganti / ditarik); revisi -> arsip (versi baru diajukan);
// arsip -> trash (lebih dari 3 arsip per deck). Kolom folder = letak file yang sebenarnya; repair() menyamakannya dengan status.
import { roleIn, teamIn } from "../../shared/jobs.js";
import * as GD from "./gdrive.js";

export const MAX_SIZE = 104857600;
// ekstensi -> MIME yang diterima
const TYPES = { pdf: "application/pdf", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
const KEEP_ARCHIVE = 3;
const TARGET = { menunggu: "menunggu", revisi: "menunggu", resmi: "resmi", arsip: "arsip" };
const ABC = "abcdefghijkmnpqrstuvwxyz23456789";
const newId = () => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => ABC[x % ABC.length]).join("");
const now = (env) => Number(env.NOW_MS) || Date.now();
const iso = (env, plus = 0) => new Date(now(env) + plus).toISOString();
const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const who = (me) => me.n || me.e;

/** Tabel materi presentasi (dipanggil dari ensure() worker). */
export const TABLES = [
  "CREATE TABLE IF NOT EXISTS decks (id TEXT PRIMARY KEY, title TEXT, note TEXT, official TEXT, replaced_at TEXT, withdrawn_at TEXT, withdrawn_by TEXT, withdraw_note TEXT, created_at TEXT, updated_at TEXT)",
  // title / descr = judul & keterangan yang diajukan bersama versi ini; berlaku untuk sales setelah disetujui
  "CREATE TABLE IF NOT EXISTS deck_versions (id TEXT PRIMARY KEY, deck_id TEXT, n INTEGER, title TEXT, descr TEXT, file_id TEXT, name TEXT, mime TEXT, size INTEGER, status TEXT, folder TEXT, by_email TEXT, by_name TEXT, at TEXT, decided_by TEXT, decided_at TEXT, note TEXT)",
  "CREATE TABLE IF NOT EXISTS deck_log (id INTEGER PRIMARY KEY AUTOINCREMENT, deck_id TEXT, version_id TEXT, at TEXT, by_email TEXT, by_name TEXT, action TEXT, note TEXT)",
  "CREATE TABLE IF NOT EXISTS deck_downloads (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, email TEXT, branch TEXT, deck_id TEXT, version_id TEXT)",
  "CREATE INDEX IF NOT EXISTS deck_versions_deck ON deck_versions (deck_id)",
  "CREATE INDEX IF NOT EXISTS deck_versions_status ON deck_versions (status)",
  "CREATE INDEX IF NOT EXISTS deck_log_deck ON deck_log (deck_id, id)",
  "CREATE INDEX IF NOT EXISTS deck_downloads_who ON deck_downloads (email, deck_id)",
];

/** Pengaju: role Investment Growth Specialist (kunci "is"). */
export const canSubmit = (me) => me.j === "is";
/** Penyetuju: admin hub, atau Head di tim regional (Head of Regional Management). */
export const canApprove = (me, org) => !!me.adm || !!((roleIn(org, me.j) || {}).head && (teamIn(org, me.j) || {}).regional);

const log = (env, me, deck, version, action, note = "") =>
  env.DB.prepare("INSERT INTO deck_log (deck_id, version_id, at, by_email, by_name, action, note) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(deck, version, iso(env), me.e, who(me), action, note);
/** Galat Google Drive -> pesan untuk orang. */
const driveErr = (e) => ({ error: e.reconnect ? "Google Drive perlu dihubungkan ulang. Hubungi admin." : /belum/.test(e.message) ? e.message : "Google Drive tidak bisa dihubungi. Coba lagi sebentar.", status: e.reconnect ? 503 : 502 });

/** Pindahkan file ke folder yang sesuai status; folder diisi hanya setelah Drive berhasil. */
export async function repair(env, limit = 10) {
  const L = (await env.DB.prepare("SELECT id, file_id, status, folder FROM deck_versions WHERE status IN ('menunggu', 'revisi', 'resmi', 'arsip') AND COALESCE(file_id, '') <> '' ORDER BY at").all()).results
    .filter((v) => (v.folder || "") !== TARGET[v.status]).slice(0, limit);
  if (!L.length) return {};
  try {
    const F = await GD.folders(env);
    if (!F) throw new Error("Folder Drive belum dibuat.");
    for (const v of L) {
      await GD.moveFile(env, v.file_id, F[v.folder] || "", F[TARGET[v.status]]);
      await env.DB.prepare("UPDATE deck_versions SET folder = ? WHERE id = ?").bind(TARGET[v.status], v.id).run();
    }
    return {};
  } catch (e) {
    console.log("pindah file Drive gagal:", e.message);
    return { warning: "Status tersimpan, tetapi file di Google Drive belum dipindah. Akan dicoba lagi otomatis." };
  }
}
/** Simpan 3 arsip terbaru per deck; sisanya ke Trash Drive. Hanya file yang sudah ada di folder Arsip. */
async function prune(env, me, deckId) {
  const A = (await env.DB.prepare("SELECT id, file_id, folder FROM deck_versions WHERE deck_id = ? AND status = 'arsip' ORDER BY n DESC").bind(deckId).all()).results.slice(KEEP_ARCHIVE);
  for (const v of A) {
    if (v.folder !== "arsip") continue;
    try { await GD.trashFile(env, v.file_id); } catch (e) { console.log("hapus arsip gagal:", e.message); return; }
    await env.DB.batch([env.DB.prepare("UPDATE deck_versions SET status = 'trash', folder = 'trash' WHERE id = ?").bind(v.id), log(env, me, deckId, v.id, "hapus-arsip")]);
  }
}
/** Sesudah tindakan: rapikan letak file lalu arsip lama. */
async function tidy(env, me, deckId) {
  const r = await repair(env);
  if (!r.warning) await prune(env, me, deckId);
  return r;
}

/** POST /api/decks/upload: { deck_id?, title, note?, name, mime, size } -> { version_id, upload_url }. */
export async function startUpload(env, me, b, origin) {
  if (!canSubmit(me)) return { error: "Hanya Investment Growth Specialist yang bisa mengajukan deck.", status: 403 };
  const name = str(b.name, 150), ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1], mime = String(b.mime || ""), size = Math.floor(Number(b.size));
  if (!ext || TYPES[ext.toLowerCase()] !== mime) return { error: "File harus PPT, PPTX, atau PDF." };
  if (!(size >= 1 && size <= MAX_SIZE)) return { error: "Ukuran file maksimal 100 MB." };
  // unggahan yang tidak pernah selesai (>24 jam) dibersihkan; deck baru tanpa versi lain ikut dihapus
  await env.DB.batch([env.DB.prepare("DELETE FROM deck_versions WHERE status = 'unggah' AND at < ?").bind(iso(env, -24 * 3600e3)),
    env.DB.prepare("DELETE FROM decks WHERE official IS NULL AND withdrawn_at IS NULL AND id NOT IN (SELECT deck_id FROM deck_versions)")]);
  let deck = null;
  if (b.deck_id) {
    deck = await env.DB.prepare("SELECT * FROM decks WHERE id = ?").bind(String(b.deck_id)).first();
    if (!deck) return { error: "Deck tidak ditemukan.", status: 404 };
    if (await env.DB.prepare("SELECT 1 FROM deck_versions WHERE deck_id = ? AND status IN ('unggah', 'menunggu')").bind(deck.id).first()) return { error: "Masih ada versi yang menunggu persetujuan." };
  }
  const title = str(b.title, 120) || (deck && deck.title) || "", descr = b.note !== undefined ? str(b.note, 300) : (deck && deck.note) || "";
  if (!title) return { error: "Isi judul deck." };
  let url;
  try {
    const F = (await GD.folders(env)) || (await GD.ensureFolders(env));
    url = await GD.startUpload(env, origin, { name, mime, size, folder: F.menunggu });
  } catch (e) { return driveErr(e); }
  const id = newId(), deckId = deck ? deck.id : newId();
  const n = deck ? ((await env.DB.prepare("SELECT MAX(n) AS n FROM deck_versions WHERE deck_id = ?").bind(deckId).first()) || {}).n || 0 : 0;
  await env.DB.batch([
    ...(deck ? [] : [env.DB.prepare("INSERT INTO decks (id, title, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(deckId, title, descr, iso(env), iso(env))]),
    env.DB.prepare("INSERT INTO deck_versions (id, deck_id, n, title, descr, name, mime, size, status, folder, by_email, by_name, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unggah', '', ?, ?, ?)")
      .bind(id, deckId, n + 1, title, descr, name, mime, size, me.e, who(me), iso(env)),
  ]);
  return { version_id: id, upload_url: url };
}
/** POST /api/decks/uploaded: { version_id, file_id } — file harus ada di folder Menunggu dengan ukuran yang sama. */
export async function confirmUpload(env, me, b) {
  const v = await env.DB.prepare("SELECT * FROM deck_versions WHERE id = ? AND status = 'unggah'").bind(String(b.version_id || "")).first();
  if (!v) return { error: "Unggahan tidak ditemukan atau sudah dikonfirmasi.", status: 404 };
  if (v.by_email !== me.e) return { error: "Hanya pengunggahnya yang bisa mengonfirmasi.", status: 403 };
  const fid = str(b.file_id, 120);
  let info, F;
  try { F = await GD.folders(env); info = fid && (await GD.fileInfo(env, fid)); }
  catch (e) { return e.status === 404 ? { error: "File tidak ditemukan di Google Drive." } : driveErr(e); }
  if (!info || info.trashed || !(info.parents || []).includes(F.menunggu) || Number(info.size) !== v.size) return { error: "File unggahan tidak cocok. Unggah ulang." };
  if (await env.DB.prepare("SELECT 1 FROM deck_versions WHERE file_id = ?").bind(fid).first()) return { error: "File ini sudah dipakai versi lain." };
  const r = await env.DB.prepare("UPDATE deck_versions SET file_id = ?, status = 'menunggu', folder = 'menunggu', at = ? WHERE id = ? AND status = 'unggah'").bind(fid, iso(env), v.id).run();
  if (!r.meta.changes) return { error: "Unggahan sudah dikonfirmasi.", status: 409 };
  await env.DB.batch([
    // versi yang diminta revisi digantikan versi baru ini
    env.DB.prepare("UPDATE deck_versions SET status = 'arsip' WHERE deck_id = ? AND status = 'revisi'").bind(v.deck_id),
    env.DB.prepare("UPDATE decks SET updated_at = ? WHERE id = ?").bind(iso(env), v.deck_id),
    log(env, me, v.deck_id, v.id, "ajukan"),
  ]);
  return { ok: true, ...(await tidy(env, me, v.deck_id)) };
}
/** POST /api/decks/decide: { version_id, action: "setujui" | "revisi", note }. Keputusan pertama yang berlaku. */
export async function decide(env, me, org, b) {
  if (!canApprove(me, org)) return { error: "Hanya admin atau Head Regional yang bisa memutuskan.", status: 403 };
  const action = b.action === "setujui" ? "setujui" : b.action === "revisi" ? "revisi" : "", note = str(b.note, 500);
  if (!action) return { error: "Pilih setujui atau minta revisi." };
  if (action === "revisi" && !note) return { error: "Tulis catatan revisinya." };
  const id = String(b.version_id || ""), at = iso(env);
  const r = await env.DB.prepare("UPDATE deck_versions SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ? AND status = 'menunggu'")
    .bind(action === "setujui" ? "resmi" : "revisi", who(me), at, action === "revisi" ? note : "", id).run();
  if (!r.meta.changes) {
    const v = await env.DB.prepare("SELECT status, decided_by FROM deck_versions WHERE id = ?").bind(id).first();
    if (!v) return { error: "Versi tidak ditemukan.", status: 404 };
    return { error: v.decided_by ? `Sudah diputuskan oleh ${v.decided_by}.` : "Versi ini belum bisa diputuskan.", status: 409 };
  }
  const v = await env.DB.prepare("SELECT * FROM deck_versions WHERE id = ?").bind(id).first();
  if (action === "setujui") {
    const d = await env.DB.prepare("SELECT official FROM decks WHERE id = ?").bind(v.deck_id).first();
    await env.DB.batch([
      env.DB.prepare("UPDATE deck_versions SET status = 'arsip' WHERE deck_id = ? AND status = 'resmi' AND id <> ?").bind(v.deck_id, v.id),
      env.DB.prepare("UPDATE decks SET official = ?, title = ?, note = ?, replaced_at = ?, withdrawn_at = NULL, withdrawn_by = NULL, withdraw_note = NULL, updated_at = ? WHERE id = ?")
        .bind(v.id, v.title, v.descr, d && d.official ? at : null, at, v.deck_id),
      log(env, me, v.deck_id, v.id, "setujui"),
    ]);
  } else await log(env, me, v.deck_id, v.id, "revisi", note).run();
  return { ok: true, ...(await tidy(env, me, v.deck_id)) };
}
/** POST /api/decks/withdraw: { deck_id, note } — deck resmi ditarik, file ke Arsip. */
export async function withdraw(env, me, org, b) {
  if (!canApprove(me, org)) return { error: "Hanya admin atau Head Regional yang bisa menarik deck.", status: 403 };
  const note = str(b.note, 500);
  if (!note) return { error: "Tulis alasan penarikan." };
  const d = await env.DB.prepare("SELECT * FROM decks WHERE id = ?").bind(String(b.deck_id || "")).first();
  if (!d || !d.official) return { error: "Deck resmi tidak ditemukan.", status: 404 };
  const at = iso(env);
  await env.DB.batch([
    env.DB.prepare("UPDATE deck_versions SET status = 'arsip' WHERE id = ? AND status = 'resmi'").bind(d.official),
    env.DB.prepare("UPDATE decks SET official = NULL, withdrawn_at = ?, withdrawn_by = ?, withdraw_note = ?, updated_at = ? WHERE id = ?").bind(at, who(me), note, at, d.id),
    log(env, me, d.id, d.official, "tarik", note),
  ]);
  return { ok: true, ...(await tidy(env, me, d.id)) };
}
/** GET /api/decks: deck resmi untuk semua; pengajuan & riwayat untuk pengaju dan penyetuju. */
export async function list(env, me, org) {
  const sub = canSubmit(me), app = canApprove(me, org), fresh = iso(env, -14 * 864e5);
  // penyetuju membuka daftar = kesempatan membetulkan letak file yang dulu gagal dipindah
  if (app) await repair(env).catch(() => {});
  const official = (await env.DB.prepare("SELECT d.id, d.title, d.note, d.replaced_at, v.id AS version_id, v.n, v.name, v.mime, v.size, v.decided_at AS approved_at FROM decks d JOIN deck_versions v ON v.id = d.official ORDER BY v.decided_at DESC").all()).results
    .map(({ replaced_at, ...x }) => ({ ...x, updated: !!replaced_at && replaced_at >= fresh }));
  const out = { official, can: { submit: sub, approve: app }, drive: { connected: !!(await env.DB.prepare("SELECT 1 FROM cfg WHERE k = 'gdrive'").first()) } };
  if (!sub && !app) return out;
  const D = (await env.DB.prepare(`SELECT * FROM decks WHERE id IN (SELECT deck_id FROM deck_versions WHERE status IN ('menunggu', 'revisi')) OR withdrawn_at >= ? ORDER BY updated_at DESC LIMIT 100`).bind(iso(env, -30 * 864e5)).all()).results;
  out.work = [];
  for (const d of D) {
    const [lv, lg] = await env.DB.batch([
      env.DB.prepare("SELECT id, n, title, descr, name, mime, size, status, by_name, at, decided_by, decided_at, note FROM deck_versions WHERE deck_id = ? AND status NOT IN ('unggah', 'trash') ORDER BY n DESC LIMIT 1").bind(d.id),
      env.DB.prepare("SELECT at, by_name, action, note, version_id FROM deck_log WHERE deck_id = ? ORDER BY id DESC LIMIT 20").bind(d.id),
    ]);
    out.work.push({ id: d.id, title: d.title, official: d.official, withdrawn_at: d.withdrawn_at, withdrawn_by: d.withdrawn_by, withdrawn_note: d.withdraw_note, latest: lv.results[0] || null, log: lg.results });
  }
  return out;
}
