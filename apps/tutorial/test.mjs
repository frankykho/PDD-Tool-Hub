// Cek API Tutorial: dibuka, "Membantu?", catatan, tanya asisten, FAQ, statistik admin. Jalankan: node apps/tutorial/test.mjs (Node 22.15+)
// D1 ditiru dengan node:sqlite, AI ditiru; izin admin dibuat seperti Tool Hub (HMAC SSO_SECRET).
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import tut, { adminOf, askPrompt, parseAsk, TOPIC } from "./worker.js";

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
const SECRET = "s".repeat(40), BASE = "https://tutorial.acme.test";
let aiCalls = 0;
const env = { DB: d1(), SSO_SECRET: SECRET, TUTOR_AI_DAILY: "3", PROFILE: JSON.stringify({ app: { name: "AcmeApp" }, contact: { whatsapp: "0812" } }),
  AI: { run: async () => { aiCalls++; return { response: '{"answer":"Buka menu Top Up lalu pilih bank.","topics":["dana/topup","x/y"],"found":true}' }; } },
  ASSETS: { fetch: async () => new Response("<html><head></head><body>ok</body></html>", { headers: { "content-type": "text/html" } }) } };
const call = (path, body, { ip = "1.1.1.1", headers = {} } = {}) => tut.fetch(new Request(BASE + path, { method: body ? "POST" : "GET",
  headers: { "cf-connecting-ip": ip, ...(body ? { "content-type": "application/json", origin: BASE } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }), env).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));

const te = new TextEncoder(), b64 = (b) => Buffer.from(b).toString("base64url");
async function hubToken(p) {
  const body = b64(te.encode(JSON.stringify({ app: "tutorial", k: "gh", e: "admin@acme.test", x: Date.now() + 3600e3, ...p })));
  const key = await crypto.subtle.importKey("raw", te.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return body + "." + b64(await crypto.subtle.sign("HMAC", key, te.encode(body)));
}
const ADM = await hubToken({});

/* izin admin */
assert.equal(await adminOf(env, ADM), "admin@acme.test");
assert.equal(await adminOf(env, await hubToken({ x: Date.now() - 1 })), null, "kedaluwarsa");
assert.equal(await adminOf(env, await hubToken({ app: "fund" })), null, "tool lain");
assert.equal(await adminOf(env, ADM.slice(0, -2) + "xx"), null, "tanda tangan salah");
assert.equal(await adminOf(env, ""), null);
assert.ok(TOPIC.test("cat-1/topik_2") && !TOPIC.test("a/b/c") && !TOPIC.test("<x>/y"));

/* dibuka & membantu */
assert.equal((await call("/api/view", { t: "dana/topup" })).status, 200);
await call("/api/view", { t: "dana/topup" });                     // pengunjung sama, hari sama: tidak dihitung lagi
await call("/api/view", { t: "dana/topup" }, { ip: "2.2.2.2" });
assert.equal((await call("/api/view", { t: "bukan topik" })).status, 400);
assert.equal((await call("/api/fb", { t: "dana/topup", v: "up" })).status, 200);
assert.equal((await call("/api/fb", { t: "dana/topup", v: "down" })).j.dup, true, "satu penilaian per pengunjung per hari");
await call("/api/fb", { t: "dana/topup", v: "down", note: "Langkah 3 beda" }, { ip: "3.3.3.3" });
assert.equal((await call("/api/fb", { t: "dana/topup", v: "meh" }, { ip: "4.4.4.4" })).status, 400);
assert.equal((await call("/api/view", { t: "dana/topup" }, { headers: { origin: "https://evil.test" } })).status, 403, "kiriman dari situs lain ditolak");

/* statistik khusus admin */
assert.equal((await call("/api/stats")).status, 401);
let s = (await call("/api/stats", null, { headers: { "x-hub-admin": ADM } })).j;
assert.deepEqual(s.topics.map((x) => [x.topic, x.views, x.up, x.down]), [["dana/topup", 2, 1, 1]]);
assert.deepEqual(s.notes.map((x) => x.text), ["Langkah 3 beda"]);
const raw = JSON.stringify(env.DB.db.prepare("SELECT * FROM seen").all());
assert.ok(!raw.includes("1.1.1.1"), "IP tidak disimpan apa adanya");

/* tanya asisten */
assert.equal((await call("/api/ask", { q: "ok" })).status, 400);
let r = await call("/api/ask", { q: "bagaimana cara top up?", ctx: [{ t: "dana/topup", title: "Top up RDN", text: "1. Buka menu Top Up" }] });
assert.equal(r.status, 200);
assert.deepEqual(r.j.topics, ["dana/topup"], "hanya topik yang dikirim browser");
assert.match(r.j.answer, /Top Up/);
r = await call("/api/ask", { q: "cara beli emas batangan?", ctx: [] });
assert.deepEqual([r.j.found, aiCalls], [false, 1], "tanpa potongan tutorial: tidak memanggil AI");
await call("/api/ask", { q: "pertanyaan ketiga?", ctx: [] });
assert.equal((await call("/api/ask", { q: "pertanyaan keempat?", ctx: [] })).status, 429, "batas TUTOR_AI_DAILY = 3");
s = (await call("/api/stats", null, { headers: { "x-hub-admin": ADM } })).j;
assert.deepEqual(s.asks.map((x) => x.found), [0, 0, 1], "pertanyaan terbaru dulu; yang belum ada tutorialnya bertanda 0");
const ap = askPrompt(env, "q?", [{ t: "a/b", title: "T", text: "x" }]);
assert.match(ap.system, /AcmeApp/); assert.match(ap.system, /WhatsApp 0812/); assert.match(ap.user, /\[a\/b\] T/);
assert.throws(() => parseAsk("maaf", ["a/b"]), /tidak terbaca/);

/* FAQ */
assert.equal((await call("/api/faq", { items: [{ q: "Q", a: "A" }] })).status, 401);
r = await call("/api/faq", { items: [{ q: "Berapa minimal top up?", a: "Rp10.000" }, { q: "", a: "kosong" }] }, { headers: { "x-hub-admin": ADM } });
assert.equal(r.j.n, 1);
assert.deepEqual((await call("/api/faq")).j, [{ q: "Berapa minimal top up?", a: "Rp10.000" }]);

// skrip editor anotasi bisa dimuat sebagai modul
assert.ok(fs.readFileSync(new URL("./site/annotate.js", import.meta.url), "utf8").includes("export async function annotate"));
console.log("semua cek lolos");
