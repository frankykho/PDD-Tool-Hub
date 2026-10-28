// Cek Edukasi Studio: frasa untuk cek kemiripan, cek ke seluruh bank artikel (/api/similar), halaman & skrip klien,
// dan penyedia AI bersama (shared/ai.js: Gemini dengan cadangan Workers AI). Jalankan: node apps/edukasi-studio/test.mjs (Node 22.15+)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

const { default: edu, phrases } = await import("./worker.js");
const { ai, GEMINI_MODELS, GROQ_MODELS } = await import("../../shared/ai.js");

function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { db, prepare: (sql) => st(sql), batch: async (list) => { const out = []; for (const x of list) out.push(await x.all()); return out; } };
}
const SECRET = "s".repeat(40), HUB = "https://hub.acme.test", BASE = "https://edu.acme.test";
const env = { SSO_SECRET: SECRET, HUB_URL: HUB, DB: d1(), PROFILE: JSON.stringify({ urls: { hub: HUB }, brand: { short: "KISI" } }) };
const te = new TextEncoder(), b64u = (b) => Buffer.from(b).toString("base64url");
async function ticket(p) {
  const body = b64u(JSON.stringify({ app: "edukasi", x: Date.now() + 600e3, ...p }));
  const key = await crypto.subtle.importKey("raw", te.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return body + "." + b64u(await crypto.subtle.sign("HMAC", key, te.encode(body)));
}

/* ---------- frasa 6 kata ---------- */
const P = phrases("# Judul\n\nReksa dana pasar uang adalah pilihan investasi berisiko rendah bagi pemula. Ya.\n## Kenapa memilih RDPU, menurut kami?\n\n---\nSemua investasi memiliki risiko dan ini disclaimer panjang sekali di bawah garis");
assert.ok(P.includes("reksa dana pasar uang adalah pilihan"), JSON.stringify(P));
assert.ok(P.every((p) => p.split(" ").length === 6 && !/[.,?]/.test(p)), "tanpa tanda baca di dalam frasa");
assert.ok(!P.some((p) => p.includes("disclaimer")), "disclaimer di bawah --- tidak ikut");
assert.equal(phrases("").length, 0);
assert.ok(phrases(Array.from({ length: 200 }, (_, i) => `Kalimat nomor ${i} berisi enam kata atau lebih.`).join(" ")).length <= 90);

/* ---------- halaman & API ---------- */
let r = await edu.fetch(new Request(BASE + "/?hub_t=" + await ticket({ e: "sari@acme.test", n: "Sari", a: "editor" })), env);
assert.equal(r.status, 200);
const page = await r.text();
for (const [, code] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(code);
assert.match(page, /function bankCheck\(\)/);
assert.match(page, /Draf baru bisa disimpan setelah 0 kalimat mirip/);
const TOKEN = page.match(/"token":"([^"]+)"/)[1];
const call = async (path, body) => { const x = await edu.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + TOKEN, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), env); return { status: x.status, j: await x.json() }; };

const ins = env.DB.db.prepare("INSERT INTO articles (url, source, topic, title, text, words, scraped_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
ins.run("https://a.test/1", "cermati", "reksadana", "RDPU untuk pemula", "## Apa itu RDPU\nReksa dana pasar uang adalah pilihan investasi berisiko rendah bagi pemula yang baru belajar.", 15, Date.now());
ins.run("https://b.test/2", "tanamduit", "reksadana", "Lain", "Saham adalah bukti kepemilikan perusahaan. 100% aman? Tidak, ada risiko_pasar.", 10, Date.now());
ins.run("https://c.test/3", "bareksa", "saham", "Bahan", "Obligasi negara memberi kupon tetap setiap bulan kepada investor ritel.", 10, Date.now());
const DRAFT = "# RDPU\n\nMenurut kami, reksa dana pasar uang adalah pilihan investasi berisiko rendah bagi pemula. Kalimat lain yang orisinal sekali tanpa kesamaan apa pun.\n\n---\nSemua investasi memiliki risiko.";
r = await call("/api/similar", { body: DRAFT, exclude: [3] });
assert.equal(r.status, 200, JSON.stringify(r.j));
assert.deepEqual(r.j.rows.map((x) => x.id), [1], "artikel bank yang memuat frasa yang sama ditemukan");
assert.ok(r.j.checked > 0);
r = await call("/api/similar", { body: DRAFT, exclude: [1] });
assert.deepEqual(r.j.rows, [], "artikel bahan sendiri dikecualikan");
r = await call("/api/similar", { body: "Saham adalah bukti kepemilikan perusahaan yang dijual 100% aman" });
assert.deepEqual(r.j.rows, [], "% dan _ di teks tidak dianggap wildcard");
assert.equal((await call("/api/similar", { body: "" })).j.rows.length, 0);

/* ---------- shared/ai.js: Gemini dulu, cadangan Workers AI ---------- */
const realFetch = globalThis.fetch, seen = [];
let mode = "ok";
globalThis.fetch = async (u, init) => {
  const m = String(u).match(/models\/([^:]+):generateContent/); if (!m) return realFetch(u, init);
  seen.push(m[1]); assert.equal(init.headers["x-goog-api-key"], "g-key");
  const b = JSON.parse(init.body); assert.equal(b.systemInstruction.parts[0].text, "SYS"); assert.equal(b.contents[0].parts[0].text, "USER");
  if (mode === "429" || (mode === "first404" && m[1] === GEMINI_MODELS[0])) return Response.json({ error: { status: mode === "429" ? "RESOURCE_EXHAUSTED" : "NOT_FOUND" } }, { status: mode === "429" ? 429 : 404 });
  return Response.json({ candidates: [{ content: { parts: [{ text: "memikirkan…", thought: true }, { text: "Naskah artikel edukasi yang cukup panjang untuk lolos." }] } }] });
};
const wai = { run: async () => ({ response: "Jawaban Workers AI yang cukup panjang untuk dipakai." }) };
let out = await ai({ GEMINI_API_KEY: "g-key", AI: wai }, "SYS", "USER", 500);
assert.deepEqual(out, { text: "Naskah artikel edukasi yang cukup panjang untuk lolos.", model: GEMINI_MODELS[0] }, "bagian 'thought' tidak ikut");
mode = "first404"; seen.length = 0;
out = await ai({ GEMINI_API_KEY: "g-key", AI: wai }, "SYS", "USER", 500);
assert.equal(out.model, GEMINI_MODELS[1], "model yang tidak tersedia dilewati");
mode = "429"; seen.length = 0;
out = await ai({ GEMINI_API_KEY: "g-key", AI: wai }, "SYS", "USER", 500);
assert.equal(seen.length, GEMINI_MODELS.length); assert.match(out.text, /Workers AI/, "kuota Gemini habis -> Workers AI");
mode = "ok"; seen.length = 0;
out = await ai({ GEMINI_API_KEY: "g-key", GEMINI_MODEL: "gemini-x", AI: wai }, "SYS", "USER", 500);
assert.equal(seen[0], "gemini-x", "GEMINI_MODEL dicoba lebih dulu");
out = await ai({ AI: wai }, "SYS", "USER", 500);
assert.match(out.text, /Workers AI/, "tanpa GEMINI_API_KEY tetap Workers AI");

/* ---------- shared/ai.js: Groq sesudah Gemini, sebelum Workers AI ---------- */
const gq = []; let gqMode = "ok";
globalThis.fetch = async (u, init) => {
  if (/generativelanguage/.test(String(u))) return Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
  assert.match(String(u), /api\.groq\.com\/openai\/v1\/chat\/completions/); assert.equal(init.headers.authorization, "Bearer q-key");
  const b = JSON.parse(init.body); gq.push(b.model); assert.equal(b.messages[0].content, "SYS"); assert.equal(b.messages[1].content, "USER");
  if (gqMode === "429" || (gqMode === "first404" && b.model === GROQ_MODELS[0])) return Response.json({ error: { code: gqMode === "429" ? "rate_limit_exceeded" : "model_not_found" } }, { status: gqMode === "429" ? 429 : 404 });
  return Response.json({ choices: [{ message: { content: "Jawaban Groq yang cukup panjang untuk dipakai di tool.", reasoning: "berpikir…" }, finish_reason: "stop" }] });
};
out = await ai({ GEMINI_API_KEY: "g-key", GROQ_API_KEY: "q-key", AI: wai }, "SYS", "USER", 500);
assert.deepEqual(out, { text: "Jawaban Groq yang cukup panjang untuk dipakai di tool.", model: GROQ_MODELS[0] }, "kuota Gemini habis -> Groq, bukan Workers AI");
gqMode = "first404"; gq.length = 0;
out = await ai({ GROQ_API_KEY: "q-key", AI: wai }, "SYS", "USER", 500);
assert.equal(out.model, GROQ_MODELS[1], "model Groq yang ditolak dilewati");
gqMode = "429"; gq.length = 0;
out = await ai({ GROQ_API_KEY: "q-key", AI: wai }, "SYS", "USER", 500);
assert.equal(gq.length, GROQ_MODELS.length); assert.match(out.text, /Workers AI/, "kuota Groq habis -> Workers AI");
gqMode = "ok"; gq.length = 0;
await ai({ GROQ_API_KEY: "q-key", GROQ_MODEL: "qwen-x", AI: wai }, "SYS", "USER", 500);
assert.equal(gq[0], "qwen-x", "GROQ_MODEL dicoba lebih dulu");
globalThis.fetch = realFetch;

console.log("semua cek lolos");
