// Google Drive untuk materi presentasi Brand Kit.
// Izin OAuth diberikan sekali oleh admin (akun Google pemilik folder); refresh token disimpan terenkripsi di cfg "gdrive".
// Scope hanya drive.file: tool hanya bisa melihat file & folder yang dibuatnya sendiri. Folder privat "Brand Kit – Materi presentasi"
// berisi Menunggu, Resmi, Arsip (cfg "gfolders"), terpisah dari folder Drive publik di tab File.
// Secret: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (OAuth client "Web application", redirect <alamat Brand Kit>/drive/callback).
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const GFOLDER = "application/vnd.google-apps.folder";
export const ROOT_NAME = "Brand Kit – Materi presentasi";
const SUBS = [["menunggu", "Menunggu"], ["resmi", "Resmi"], ["arsip", "Arsip"]];
const RECONNECT = "Google Drive perlu dihubungkan ulang.";
const TE = new TextEncoder(), TD = new TextDecoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const now = (env) => Number(env.NOW_MS) || Date.now();
const timed = (p, ms) => { let t; return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error("timeout")), ms); })]).finally(() => clearTimeout(t)); };

async function cfgGet(env, k) {
  const r = await env.DB.prepare("SELECT v FROM cfg WHERE k = ?").bind(k).first();
  try { return r ? JSON.parse(r.v) : null; } catch { return null; }
}
const cfgPut = (env, k, v) => env.DB.prepare("INSERT INTO cfg (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, JSON.stringify(v)).run();
const cfgDel = (env, k) => env.DB.prepare("DELETE FROM cfg WHERE k = ?").bind(k).run();

/* ---------- enkripsi refresh token (AES-GCM, kunci dari SSO_SECRET) ---------- */
const aesKey = async (env) => crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", TE.encode("gdrive:" + env.SSO_SECRET)), "AES-GCM", false, ["encrypt", "decrypt"]);
export async function seal(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return b64u(iv) + "." + b64u(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), TE.encode(text)));
}
export async function unseal(env, sealed) {
  try { const [iv, c] = String(sealed || "").split("."); return TD.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv) }, await aesKey(env), unb64u(c))); }
  catch { return null; }
}

/* ---------- izin sekali (OAuth) ---------- */
const hmac = async (env, body) => b64u(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", TE.encode(env.SSO_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), TE.encode(body)));
export const ready = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
/** Alamat persetujuan Google. state = email admin + batas 10 menit, ditandatangani SSO_SECRET. */
export async function authUrl(env, origin, email) {
  const body = b64u(TE.encode(JSON.stringify({ e: email, x: now(env) + 10 * 60e3 })));
  return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: origin + "/drive/callback", response_type: "code",
    scope: SCOPE, access_type: "offline", prompt: "consent", state: body + "." + await hmac(env, body) });
}
async function stateOk(env, state, email) {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig || sig !== await hmac(env, body)) return false;
  try { const p = JSON.parse(TD.decode(unb64u(body))); return p.e === email && p.x > now(env); } catch { return false; }
}
const tokenPost = (params) => timed(fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) }), 10000);
/** Kembali dari Google: tukar code dengan refresh token, simpan terenkripsi, lalu buat folder. */
export async function finishAuth(env, origin, code, state, me) {
  if (!(await stateOk(env, state, me.e))) return { error: "Tautan izin tidak sah atau sudah kedaluwarsa. Ulangi dari Atur Brand Kit." };
  let j;
  try {
    const r = await tokenPost({ code: String(code || ""), client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: origin + "/drive/callback", grant_type: "authorization_code" });
    j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: "Google menolak izin (" + (j.error || "HTTP " + r.status) + "). Ulangi dari Atur Brand Kit." };
  } catch (e) { return { error: "Google tidak bisa dihubungi. Coba lagi." }; }
  if (!j.refresh_token) return { error: "Google tidak memberi izin jangka panjang. Ulangi dari Atur Brand Kit." };
  // drive.file: akun lain tidak bisa melihat folder yang sudah ada, jadi sambungan lama dipertahankan
  const F0 = await folders(env);
  let acct;
  try {
    if (F0 && F0.root) {
      const r = await driveAt(j.access_token, `/drive/v3/files/${encodeURIComponent(F0.root)}?fields=id,trashed`);
      if (r.status === 404) return { error: `Akun yang dipilih adalah akun Google lain, bukan pemilik folder "${ROOT_NAME}". Masuk dengan akun ${F0.owner || "Google yang dulu menghubungkan"}, lalu ulangi dari Atur Brand Kit.` };
      if (!r.ok) throw new Error("HTTP " + r.status);
      if ((await r.json()).trashed) return { error: `Folder "${ROOT_NAME}" ada di Trash Google Drive. Pulihkan dulu, lalu ulangi dari Atur Brand Kit.` };
    }
    const a = await driveAt(j.access_token, "/drive/v3/about?fields=user(emailAddress)");
    acct = a.ok ? ((await a.json()).user || {}).emailAddress || "" : "";
  } catch (e) { return { error: "Google tidak bisa dihubungi. Coba lagi." }; }
  await cfgPut(env, "gdrive", { t: await seal(env, j.refresh_token), by: me.n || me.e, at: new Date(now(env)).toISOString() });
  await env.BRAND_KV.put("gtoken", JSON.stringify({ t: j.access_token, x: now(env) + (Number(j.expires_in) || 3600) * 1000 }));
  try { const F = await ensureFolders(env); if (acct && F.owner !== acct) await cfgPut(env, "gfolders", { ...F, owner: acct }); }
  catch (e) { return { error: "Izin tersimpan, tetapi folder Drive gagal dibuat: " + e.message }; }
  return { ok: true };
}
const reconnect = () => Object.assign(new Error(RECONNECT), { reconnect: true });
/** Access token: dari KV selama masih >60 dtk, selain itu ditukar dari refresh token. Izin dicabut -> sambungan dihapus. */
export async function token(env) {
  const c = await env.BRAND_KV.get("gtoken", "json");
  if (c && c.t && c.x - now(env) > 60e3) return c.t;
  const g = await cfgGet(env, "gdrive"), rt = g && (await unseal(env, g.t));
  if (!rt) throw reconnect();
  let r;
  try { r = await tokenPost({ refresh_token: rt, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: "refresh_token" }); }
  catch (e) { throw new Error("Google Drive tidak bisa dihubungi."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (j.error === "invalid_grant") { await cfgDel(env, "gdrive"); throw reconnect(); }
    throw new Error("Google Drive tidak bisa dihubungi.");
  }
  await env.BRAND_KV.put("gtoken", JSON.stringify({ t: j.access_token, x: now(env) + (Number(j.expires_in) || 3600) * 1000 }));
  return j.access_token;
}
export async function disconnect(env) {
  await cfgDel(env, "gdrive");
  await env.BRAND_KV.delete("gtoken");
}
/** Status untuk Atur Brand Kit. Memanggil Drive sekali supaya izin yang dicabut langsung kelihatan; acct = akun Google yang terhubung. */
export async function status(env) {
  const g = await cfgGet(env, "gdrive");
  if (!ready(env)) return { ready: false, connected: false };
  if (!g) return { ready: true, connected: false };
  try {
    const a = await (await drive(env, "/drive/v3/about?fields=user(emailAddress)")).json();
    return { ready: true, connected: true, by: g.by, at: g.at, acct: (a.user || {}).emailAddress || "" };
  }
  catch (e) { return { ready: true, connected: !e.reconnect && !!(await cfgGet(env, "gdrive")), by: g.by, at: g.at, error: e.message }; }
}

/* ---------- Drive REST ---------- */
const driveAt = (t, path, init = {}) => timed(fetch("https://www.googleapis.com" + path, { ...init, headers: { authorization: "Bearer " + t, ...(init.body && typeof init.body === "string" ? { "content-type": "application/json" } : {}), ...(init.headers || {}) } }), 15000);
/** Panggilan Drive (www.googleapis.com) dengan token; HTTP >= 400 -> Error("Google Drive: HTTP n"). */
export async function drive(env, path, init = {}) {
  let r = await driveAt(await token(env), path, init);
  // token di cache ditolak (mis. izin dicabut di akun Google): buang, tukar ulang sekali -> invalid_grant jadi "hubungkan ulang"
  if (r.status === 401) { await env.BRAND_KV.delete("gtoken"); r = await driveAt(await token(env), path, init); }
  if (!r.ok) throw Object.assign(new Error("Google Drive: HTTP " + r.status), { status: r.status });
  return r;
}
const json = (o) => JSON.stringify(o);
async function mkFolder(env, name, parent) {
  const r = await drive(env, "/drive/v3/files?fields=id", { method: "POST", body: json({ name, mimeType: GFOLDER, ...(parent ? { parents: [parent] } : {}) }) });
  return (await r.json()).id;
}
/** Folder Materi presentasi; yang belum ada dibuat. */
export async function ensureFolders(env) {
  const F = (await cfgGet(env, "gfolders")) || {};
  if (!F.root) F.root = await mkFolder(env, ROOT_NAME);
  for (const [k, name] of SUBS) if (!F[k]) F[k] = await mkFolder(env, name, F.root);
  await cfgPut(env, "gfolders", F);
  return F;
}
export const folders = (env) => cfgGet(env, "gfolders");
/** Sesi unggah resumable: browser mengirim file langsung ke URL ini (CORS diizinkan untuk origin yang disebut di sini). */
export async function startUpload(env, origin, { name, mime, size, folder }) {
  const r = await drive(env, "/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,parents", {
    method: "POST", body: json({ name, parents: [folder] }), headers: { origin, "x-upload-content-type": mime, "x-upload-content-length": String(size) } });
  const loc = r.headers.get("location");
  if (!loc) throw new Error("Google Drive tidak memberi alamat unggah.");
  return loc;
}
export async function fileInfo(env, id) {
  return (await drive(env, `/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size,parents,trashed`)).json();
}
export async function moveFile(env, id, from, to) {
  const q = new URLSearchParams({ addParents: to, ...(from ? { removeParents: from } : {}), fields: "id,parents" });
  await drive(env, `/drive/v3/files/${encodeURIComponent(id)}?${q}`, { method: "PATCH", body: "{}" });
}
export async function trashFile(env, id) {
  await drive(env, `/drive/v3/files/${encodeURIComponent(id)}?fields=id`, { method: "PATCH", body: json({ trashed: true }) });
}
/** Isi file, diteruskan apa adanya (tidak ditampung di memori). */
export const streamFile = (env, id) => drive(env, `/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
