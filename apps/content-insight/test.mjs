// Cek Content Insight: ide tim, konsep otomatis (AI ditiru), kirim konsep ke Content Planner (worker asli lewat binding).
// Jalankan: node apps/content-insight/test.mjs   (Node 22.15+)
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

registerHooks({
  load(url, ctx, next) {
    if (url.startsWith("file:") && url.endsWith(".html")) return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(fs.readFileSync(fileURLToPath(url), "utf8")) };
    return next(url, ctx);
  },
});
const { default: ci, overlap, parseConcept, conceptText } = await import("./worker.js");
const { default: planner } = await import("../content-planner/worker.js");

function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
  });
  return { db, prepare: (sql) => st(sql), batch: async (list) => { const out = []; for (const x of list) out.push(await x.all()); return out; } };
}
const SECRET = "s".repeat(40), HUB = "https://hub.acme.test", BASE = "https://content.acme.test";
const PROFILE = JSON.stringify({ urls: { hub: HUB }, brand: { short: "KISI", company: "PT Contoh Sekuritas" } });
const plEnv = { SSO_SECRET: SECRET, DB: d1(), HUB_URL: HUB, PROFILE };
const AIQ = [], prompts = [];
const env = { SSO_SECRET: SECRET, DB: d1(), HUB_URL: HUB, PROFILE,
  AI: { run: async (model, { messages }) => { prompts.push(messages); return { response: AIQ.length ? AIQ.shift() : "" }; } },
  PLANNER: { fetch: (u, init) => planner.fetch(new Request(u, init), plEnv, { waitUntil() { } }) } };

const te = new TextEncoder();
async function cookie(p) {
  const body = Buffer.from(JSON.stringify({ app: "content", x: Date.now() + 3600e3, ...p })).toString("base64url");
  const key = await crypto.subtle.importKey("raw", te.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `hub_content=${body}.${Buffer.from(await crypto.subtle.sign("HMAC", key, te.encode(body))).toString("base64url")}`;
}
const SMS = await cookie({ e: "sari@acme.test", n: "Sari", j: "sosmed", a: "editor" });
const VIEW = await cookie({ e: "budi@acme.test", n: "Budi", j: "is", a: "viewer" });
const EDIT = await cookie({ e: "cici@acme.test", n: "Cici", j: "copy", a: "editor" });
const call = async (path, { ck, method = "GET", body } = {}) => {
  const r = await ci.fetch(new Request(BASE + path, { method, headers: { cookie: ck, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() { } });
  return { status: r.status, j: await r.json().catch(() => null) };
};
await planner.fetch(new Request("https://p/__hub/users", { method: "POST", headers: { "x-hub-key": SECRET, "content-type": "application/json" }, body: JSON.stringify({ users: [
  { email: "sari@acme.test", name: "Sari", job: "sosmed" }, { email: "dodi@acme.test", name: "Dodi", job: "design" }] }) }), plEnv);

const CAP = "Mau mulai investasi tapi modal kecil? Reksa dana pasar uang bisa jadi pilihan pertama karena risikonya rendah dan bisa dicairkan kapan saja. Yuk mulai dari 10 ribu di aplikasi kami!";
/* ---------- konten kompetitor ---------- */
let r = await call("/api/content", { ck: EDIT, method: "POST", body: { url: "https://www.instagram.com/p/ABC123/?igsh=x", caption: CAP, account: "@pesaing", format: "Carousel" } });
assert.equal(r.status, 200, JSON.stringify(r.j));
const X = r.j.id;
// ide lama di kolom "idea" (sebelum ada daftar ide) dipindah jadi ide pertama
env.DB.db.prepare("UPDATE ci_content SET idea = 'Versi KISI: bandingkan dengan deposito' WHERE id = ?").run(X);

/* ---------- ide tim: semua anggota ---------- */
let ideas = (await call("/api/ideas", { ck: VIEW })).j;
assert.deepEqual(ideas.map((i) => i.text), ["Versi KISI: bandingkan dengan deposito"], "ide lama pindah jadi ide pertama");
assert.equal(env.DB.db.prepare("SELECT idea FROM ci_content WHERE id = ?").get(X).idea, null);
r = await call("/api/ideas", { ck: VIEW, method: "POST", body: { content_id: X, text: "Format kuis: tebak mana yang lebih likuid" } });
assert.equal(r.status, 200, "akses lihat saja tetap boleh memberi ide");
const VI = r.j.idea.id;
assert.equal((await call("/api/ideas", { ck: VIEW, method: "POST", body: { content_id: X, text: "  " } })).status, 400);
assert.equal((await call("/api/ideas", { ck: VIEW, method: "POST", body: { content_id: "tidak-ada", text: "x" } })).status, 404);
assert.equal((await call("/api/ideas", { ck: EDIT, method: "DELETE", body: { id: VI } })).status, 403, "ide orang lain tidak bisa dihapus");
// form lama (halaman bookmark) mengirim "idea": jadi ide baru atas nama pengirim, tidak dobel
await call("/api/content", { ck: EDIT, method: "PATCH", body: { id: X, note: "Hook pertanyaan kuat", idea: "Pakai data KISI sendiri" } });
await call("/api/content", { ck: EDIT, method: "PATCH", body: { id: X, idea: "Pakai data KISI sendiri" } });
ideas = (await call("/api/ideas", { ck: VIEW })).j;
assert.deepEqual(ideas.map((i) => [i.text, i.by_name]).slice(1), [["Format kuis: tebak mana yang lebih likuid", "Budi"], ["Pakai data KISI sendiri", "Cici"]]);

/* ---------- konsep: hanya Social Media Specialist & admin ---------- */
assert.equal((await call("/api/concepts", { ck: EDIT, method: "POST", body: { content_id: X } })).status, 403, "Editor dengan role lain tidak membuat konsep");
const good = { judul: "Deposito vs RDPU: mana buat dana darurat?", hook: "Dana darurat kamu tidur di mana?", sudut: "Perbandingan untuk dana darurat", beda: "Kompetitor mengajak mulai kecil; kita membandingkan pilihan untuk dana darurat.",
  format: "Carousel", alur: [{ bagian: "Slide 1", isi: "Dana darurat kamu tidur di mana?", visual: "ilustrasi celengan" }, { bagian: "Slide 2", isi: "Tabel likuiditas & risiko", visual: "tabel 2 kolom" }],
  caption: "Simpan dana darurat itu soal mudah dicairkan dan risikonya rendah. Coba bandingkan dulu sebelum memilih.", hashtag: ["#danadarurat", "reksadana", "#"], cta: "Simpan postingan ini", brief_visual: "1080x1350, 5 slide, hijau KISI", kepatuhan: "Investasi mengandung risiko." };
// percobaan pertama menyalin caption kompetitor -> diulang dengan peringatan; kedua orisinal
AIQ.push("```json\n" + JSON.stringify({ ...good, caption: CAP }) + "\n```", JSON.stringify(good));
r = await call("/api/concepts", { ck: SMS, method: "POST", body: { content_id: X, idea_id: "*", extra: "sasaran karyawan muda" } });
assert.equal(r.status, 200, JSON.stringify(r.j));
assert.equal(prompts.length, 2, "konsep yang mirip kompetitor ditulis ulang");
const [sys1, user1] = prompts[0], user2 = prompts[1][1].content;
assert.match(sys1.content, /KISI \(PT Contoh Sekuritas\)/); assert.match(sys1.content, /Jangan menyalin/); assert.match(sys1.content, /OJK/);
assert.ok(user1.content.includes(CAP) && /Hook pertanyaan kuat/.test(user1.content), "caption & catatan tim ikut");
assert.ok(/bandingkan dengan deposito/.test(user1.content) && /Format kuis/.test(user1.content) && /Pakai data KISI/.test(user1.content), "semua ide ikut bila dipilih Semua ide");
assert.match(user1.content, /sasaran karyawan muda/);
assert.match(user2, /terlalu mirip/);
const K = r.j.concept;
assert.deepEqual([K.body.judul, K.body.format, K.body.alur.length, K.body.hashtag], [good.judul, "Carousel", 2, ["#danadarurat", "#reksadana"]]);
assert.match(K.text, /Terinspirasi dari konten @pesaing \(Instagram\): https:\/\/www\.instagram\.com\/p\/ABC123\//);
// satu ide saja
AIQ.push(JSON.stringify({ ...good, judul: "Versi kuis" }));
r = await call("/api/concepts", { ck: SMS, method: "POST", body: { content_id: X, idea_id: VI } });
assert.equal(r.status, 200);
assert.ok(/Format kuis/.test(prompts[2][1].content) && !/bandingkan dengan deposito/.test(prompts[2][1].content), "hanya ide yang dipilih");
// AI gagal dua kali -> pesan jelas
AIQ.push("bukan json sama sekali, hanya teks panjang tanpa kurung kurawal apa pun di sini", "masih bukan json, teks panjang lagi supaya lolos batas minimal panjang");
r = await call("/api/concepts", { ck: SMS, method: "POST", body: { content_id: X } });
assert.equal(r.status, 502); assert.match(r.j.error, /tidak lengkap/);
assert.equal((await call("/api/concepts", { ck: VIEW })).j.length, 2, "semua orang bisa melihat konsep");
// sunting
r = await call("/api/concepts", { ck: SMS, method: "PATCH", body: { id: K.id, body: { caption: "Caption baru", judul: "Judul baru", format: "Reels" } } });
assert.deepEqual([r.j.body.caption, r.j.body.judul, r.j.body.format], ["Caption baru", "Judul baru", "Carousel"], "format tidak ikut diubah lewat sunting");
assert.equal((await call("/api/concepts", { ck: SMS, method: "PATCH", body: { id: K.id, body: { caption: "" } } })).status, 400);

/* ---------- ke Content Planner ---------- */
const members = (await call("/api/members", { ck: SMS })).j;
assert.deepEqual(members.map((m) => [m.email, m.role]), [["dodi@acme.test", "design"], ["sari@acme.test", "sosmed"]]);
assert.deepEqual((await call("/api/members", { ck: VIEW })).j, [], "daftar anggota hanya untuk pembuat konsep");
assert.equal((await call("/api/concepts/planner", { ck: SMS, method: "POST", body: { id: K.id } })).status, 400, "tanggal wajib");
r = await call("/api/concepts/planner", { ck: SMS, method: "POST", body: { id: K.id, date: "2026-10-28", channel: "IG Feed", design_due: "2026-10-25", designer: { email: "dodi@acme.test", name: "Dodi" } } });
assert.equal(r.status, 200, JSON.stringify(r.j));
const it = plEnv.DB.db.prepare("SELECT * FROM items WHERE id = ?").get(r.j.planner_id);
assert.deepEqual([it.kind, it.title, it.date, it.channel, it.status, it.owner_email, it.created_email, it.d_need, it.d_who, it.d_due, it.d_brief],
  ["konten", "Judul baru", "2026-10-28", "IG Feed", "ide", "sari@acme.test", "sari@acme.test", 1, "dodi@acme.test", "2026-10-25", good.brief_visual]);
assert.match(it.note, /Caption:\nCaption baru/); assert.match(it.note, /Terinspirasi dari konten @pesaing/);
assert.equal(plEnv.DB.db.prepare("SELECT COUNT(*) n FROM notifs WHERE email='dodi@acme.test' AND title='Permintaan visual: Judul baru'").get().n, 1, "desainer diberi tahu");
const row = env.DB.db.prepare("SELECT used_at, used_by, used_ref FROM ci_content WHERE id = ?").get(X);
assert.ok(row.used_at); assert.equal(row.used_by, "Sari"); assert.equal(row.used_ref, "Content Planner: Judul baru (2026-10-28)");
assert.ok((await call("/api/concepts", { ck: SMS })).j.find((c) => c.id === K.id).planner_id, "konsep ditandai sudah masuk Planner");
// tanpa binding PLANNER: pesan jelas
const pl = env.PLANNER; delete env.PLANNER;
assert.equal((await call("/api/concepts/planner", { ck: SMS, method: "POST", body: { id: K.id, date: "2026-10-28" } })).status, 503);
env.PLANNER = pl;
// endpoint internal Planner butuh kunci hub
assert.equal((await planner.fetch(new Request("https://p/__hub/item", { method: "POST", body: "{}" }), plEnv)).status, 403);
assert.equal((await planner.fetch(new Request("https://p/__hub/members"), plEnv)).status, 403);
assert.equal((await call("/api/concepts", { ck: SMS, method: "DELETE", body: { id: K.id } })).status, 200);

/* ---------- halaman ---------- */
const page = await (await ci.fetch(new Request(BASE + "/", { headers: { cookie: SMS } }), env, { waitUntil() { } })).text();
assert.match(page, /window\.ME=\{[^<]*"job":"sosmed"/);
for (const [, code] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(code);

/* ---------- fungsi murni ---------- */
assert.ok(overlap(CAP, CAP) > 0.9); assert.equal(overlap(CAP, good.caption), 0); assert.equal(overlap("", "x"), 0);
assert.equal(parseConcept('{"judul":"x"}'), null, "konsep tanpa caption & alur ditolak");
assert.equal(parseConcept(JSON.stringify({ ...good, format: "Podcast" })).format, "Carousel");
assert.match(conceptText(parseConcept(JSON.stringify(good)), null), /^Deposito vs RDPU.*\(Carousel\)\n\nHook:/);

console.log("semua cek lolos");
