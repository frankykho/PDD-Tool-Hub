// Tutorial: halaman statis di folder site/ disajikan sebagai aset Worker (gratis).
// Worker menyisipkan window.PROFILE (nama aplikasi, alamat Tool Hub, konfigurasi Firebase, dsb.) ke halaman HTML,
// dan melayani API kecil di D1 (tutorial-db) yang tidak butuh aturan Firestore baru:
// - POST /api/view {t}            hitung dibuka per topik (t = "<idKategori>/<idTopik>"; sekali per pengunjung per hari)
// - POST /api/fb {t, v, note}     "Membantu?" ya/tidak (+ catatan singkat bila tidak; sekali per pengunjung per hari)
// - GET  /api/faq                 FAQ yang diisi admin
// - GET  /api/popular             urutan topik paling sering dibuka (tanpa angka), untuk "Paling sering dibuka" di beranda
// - POST /api/ask {q, ctx}        tanya asisten: AI menjawab hanya dari potongan tutorial yang dipilih browser (ctx)
// - GET  /api/stats, POST /api/faq  khusus admin: header x-hub-admin = izin 8 jam dari Tool Hub (HMAC SSO_SECRET, sama dengan /gh)
// Pengunjung tidak disimpan: hanya hash (IP + tanggal + SSO_SECRET) untuk mencegah hitungan ganda, dihapus setelah 2 hari.
// Gambar di site/images/ tidak lewat worker (lihat run_worker_first di wrangler.jsonc).
import { injectProfile, profile } from "../../shared/profile.js";
import { themeHead } from "../../shared/theme.js";
import { ai, AiError } from "../../shared/ai.js";
import { TUTORIAL_THEME_CSS } from "./theme.js";
import EN from "./i18n.js";

const te = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const hmac = async (secret, data) => b64u(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), te.encode(data)));
const sha = async (s) => b64u(await crypto.subtle.digest("SHA-256", te.encode(s))).slice(0, 22);
const json = (v, status = 200) => Response.json(v, { status, headers: { "cache-control": "no-store" } });
const str = (v, n) => (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, n);
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
export const TOPIC = /^[\w-]{1,80}\/[\w-]{1,80}$/;

/** Izin admin dari Tool Hub: { app: "tutorial", k: "gh", e, x } bertanda tangan HMAC SSO_SECRET. Email admin, atau null. */
export async function adminOf(env, tok) {
  const [body, sig] = String(tok || "").split(".");
  if (!body || !sig || String(env.SSO_SECRET || "").length < 32) return null;
  const want = await hmac(env.SSO_SECRET, body);
  if (want.length !== sig.length) return null;
  let d = 0; for (let i = 0; i < sig.length; i++) d |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  if (d) return null;
  let p; try { p = JSON.parse(new TextDecoder().decode(unb64(body))); } catch { return null; }
  return p && p.app === "tutorial" && p.k === "gh" && p.x > Date.now() ? p.e || "admin" : null;
}

let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS stats (topic TEXT PRIMARY KEY, views INTEGER DEFAULT 0, up INTEGER DEFAULT 0, down INTEGER DEFAULT 0)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, topic TEXT, text TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS seen (k TEXT PRIMARY KEY, d TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS asks (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, q TEXT, topics TEXT, found INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS faq (id INTEGER PRIMARY KEY AUTOINCREMENT, ord INTEGER, q TEXT, a TEXT, updated_by TEXT, updated_at TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)"),
  ]);
  ready = true;
}
/** true sekali per kunci per hari (pengunjung yang sama tidak dihitung dua kali). */
async function once(env, key) {
  const d = today(), k = await sha(key + "|" + d + "|" + env.SSO_SECRET);
  const r = await env.DB.prepare("INSERT OR IGNORE INTO seen (k, d) VALUES (?, ?)").bind(k, d).run();
  if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM seen WHERE d < ?").bind(new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)).run().catch(() => {});
  return !!(r.meta && r.meta.changes);
}
async function count(env, key, limit) {
  const r = await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind(key).first(), n = Number(r && r.v) || 0;
  if (n >= limit) return false;
  await env.DB.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(key, String(n + 1)).run();
  return true;
}

/** Perintah AI tanya-jawab: hanya dari potongan tutorial. */
export function askPrompt(env, q, ctx) {
  const p = profile(env), app = p.app.name || "aplikasi", c = p.contact || {};
  const cs = [c.whatsapp && "WhatsApp " + c.whatsapp, c.phone && "telepon " + c.phone, c.email && "email " + c.email].filter(Boolean).join(", ");
  const system = [
    `Kamu asisten pusat bantuan ${app}. Jawab dalam Bahasa Indonesia, ramah dan singkat (maks. 120 kata), berupa langkah bernomor bila cocok.`,
    "Jawab HANYA dari potongan tutorial yang diberikan. Bila jawabannya tidak ada di sana, katakan belum ada tutorialnya" + (cs ? ` dan sarankan menghubungi layanan nasabah (${cs})` : " dan sarankan menghubungi layanan nasabah") + ".",
    "Jangan memberi saran investasi, rekomendasi produk, atau meminta data pribadi (PIN, password, OTP, nomor rekening).",
    'Jawab HANYA dengan JSON: {"answer":"","topics":["<id topik yang dipakai>"],"found":true}',
  ].join("\n");
  const user = `Pertanyaan: ${q}\n\nPotongan tutorial:\n` + ctx.map((x) => `[${x.t}] ${x.title}\n${x.text}`).join("\n\n");
  return { system, user };
}
export function parseAsk(raw, ids) {
  const t = String(raw || ""), a = t.indexOf("{"), z = t.lastIndexOf("}");
  let j = null; try { if (a >= 0 && z > a) j = JSON.parse(t.slice(a, z + 1)); } catch {}
  if (!j || typeof j.answer !== "string") throw new AiError("Jawaban asisten tidak terbaca. Coba lagi.");
  return { answer: j.answer.trim().slice(0, 1500), topics: (Array.isArray(j.topics) ? j.topics : []).filter((x) => ids.includes(x)).slice(0, 3), found: j.found !== false };
}

async function api(request, env, url) {
  const path = url.pathname;
  if (!env.DB) return json({ error: "Database tutorial belum dipasang." }, 503);
  await ensure(env);
  if (request.method === "GET" && path === "/api/faq") return json((await env.DB.prepare("SELECT q, a FROM faq ORDER BY ord, id").all()).results);
  // "Paling sering dibuka" di beranda: urutan topik saja (tanpa angka), halaman memetakan ke judul & melewati topik yang sudah dihapus
  if (request.method === "GET" && path === "/api/popular")
    return Response.json((await env.DB.prepare("SELECT topic FROM stats WHERE views > 0 ORDER BY views DESC LIMIT 12").all()).results.map((r) => r.topic), { headers: { "cache-control": "public, max-age=600" } });
  const admin = await adminOf(env, request.headers.get("x-hub-admin"));
  if (path === "/api/stats" && request.method === "GET") {
    if (!admin) return json({ error: "Khusus admin. Muat ulang halaman admin dari Tool Hub." }, 401);
    const [s, n, a] = await env.DB.batch([
      env.DB.prepare("SELECT topic, views, up, down FROM stats ORDER BY views DESC LIMIT 500"),
      env.DB.prepare("SELECT at, topic, text FROM notes ORDER BY id DESC LIMIT 60"),
      env.DB.prepare("SELECT at, q, topics, found FROM asks ORDER BY id DESC LIMIT 80"),
    ]);
    return json({ topics: s.results, notes: n.results, asks: a.results });
  }
  if (request.method !== "POST") return json({ error: "Tidak ditemukan" }, 404);
  // kiriman hanya dari halaman tutorial sendiri
  const o = request.headers.get("origin");
  if (o && o !== url.origin) return json({ error: "Permintaan ditolak." }, 403);
  const b = await request.json().catch(() => ({})), ip = request.headers.get("cf-connecting-ip") || "?";
  if (path === "/api/faq") {
    if (!admin) return json({ error: "Khusus admin. Muat ulang halaman admin dari Tool Hub." }, 401);
    const items = (Array.isArray(b.items) ? b.items : []).map((x) => ({ q: str(x && x.q, 200), a: str(x && x.a, 1500) })).filter((x) => x.q && x.a).slice(0, 60), at = new Date().toISOString();
    await env.DB.batch([env.DB.prepare("DELETE FROM faq"), ...items.map((x, i) => env.DB.prepare("INSERT INTO faq (ord, q, a, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)").bind(i, x.q, x.a, admin, at))]);
    return json({ ok: true, n: items.length });
  }
  if (path === "/api/view" || path === "/api/fb") {
    const t = str(b.t, 170);
    if (!TOPIC.test(t)) return json({ error: "Topik tidak sah." }, 400);
    if (path === "/api/view") {
      if (await once(env, `v|${ip}|${t}`)) await env.DB.prepare("INSERT INTO stats (topic, views) VALUES (?, 1) ON CONFLICT(topic) DO UPDATE SET views = views + 1").bind(t).run();
      return json({ ok: true });
    }
    const up = b.v === "up";
    if (b.v !== "up" && b.v !== "down") return json({ error: "Pilihan tidak sah." }, 400);
    if (!(await once(env, `f|${ip}|${t}`))) return json({ ok: true, dup: true });
    const col = up ? "up" : "down";
    await env.DB.prepare(`INSERT INTO stats (topic, ${col}) VALUES (?, 1) ON CONFLICT(topic) DO UPDATE SET ${col} = ${col} + 1`).bind(t).run();
    const note = str(b.note, 300);
    if (!up && note) await env.DB.prepare("INSERT INTO notes (at, topic, text) VALUES (?, ?, ?)").bind(new Date().toISOString(), t, note).run();
    return json({ ok: true });
  }
  if (path === "/api/ask") {
    const q = str(b.q, 300);
    const ctx = (Array.isArray(b.ctx) ? b.ctx : []).map((x) => ({ t: str(x && x.t, 170), title: str(x && x.title, 120), text: str(x && x.text, 1500) })).filter((x) => TOPIC.test(x.t) && x.title).slice(0, 4);
    if (q.length < 4) return json({ error: "Tulis pertanyaannya dulu." }, 400);
    const d = today();
    if (!(await count(env, `ask:${await sha(ip + d)}:${d}`, 15))) return json({ error: "Batas pertanyaan hari ini sudah tercapai. Coba lagi besok." }, 429);
    if (!(await count(env, `ai:${d}`, Number(env.TUTOR_AI_DAILY) || 150))) return json({ error: "Asisten sedang sibuk. Coba lagi besok atau cari di daftar tutorial." }, 429);
    let out;
    if (!ctx.length) out = { answer: "", topics: [], found: false };
    else {
      const { system, user } = askPrompt(env, q, ctx);
      const { text } = await ai(env, system, user, 700, undefined, { json: true, temperature: 0.2 });
      out = parseAsk(text, ctx.map((x) => x.t));
    }
    await env.DB.prepare("INSERT INTO asks (at, q, topics, found) VALUES (?, ?, ?, ?)").bind(new Date().toISOString(), q, out.topics.join(","), out.found ? 1 : 0).run();
    return json(out);
  }
  return json({ error: "Tidak ditemukan" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(request, env, url); }
      catch (e) { return json({ error: e instanceof AiError ? e.message : "Gagal: " + (e.message || e) }, e instanceof AiError ? 502 : 500); }
    }
    // tanpa If-None-Match: kalau tidak, browser bisa terus memakai HTML lama (dengan profil lama) dari cache
    const req = new Request(request);
    req.headers.delete("if-none-match");
    const res = injectProfile(await env.ASSETS.fetch(req), env);
    // tema & bahasa dari Tool Hub (di luar Hub bawaannya tema terang & bahasa Indonesia). fetch() dari tombol export (Sec-Fetch-Dest: empty) tidak disisipi,
    // supaya file tutorial offline tetap bersih
    if (request.headers.get("sec-fetch-dest") === "empty" || !(res.headers.get("content-type") || "").includes("text/html")) return res;
    return new HTMLRewriter().on("head", { element(el) { el.append(themeHead(TUTORIAL_THEME_CSS, EN), { html: true }); } }).transform(res);
  },
};
