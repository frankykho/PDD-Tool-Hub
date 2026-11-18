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
// "Paling sering dibuka": publik, hanya urutan topik (tanpa angka)
assert.deepEqual((await call("/api/popular")).j, ["dana/topup"]);
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
// halaman nasabah membaca Firestore lewat REST: nilai bertipe -> nilai biasa (sama dengan isi dokumen di SDK)
{
  const page = fs.readFileSync(new URL('./site/index.html', import.meta.url), 'utf8'), i = page.indexOf('const fsVal'), j = page.indexOf('async function loadCategories', i);
  const { fsMap } = new Function(page.slice(i, j) + ';return { fsMap };')();
  assert.deepEqual(fsMap({ title: { stringValue: 'Saham' }, order: { integerValue: '2' }, x: { doubleValue: 1.5 }, on: { booleanValue: false }, n: { nullValue: null },
    items: { arrayValue: { values: [{ mapValue: { fields: { id: { stringValue: 't1' }, slides: { arrayValue: {} } } } }] } } }),
    { title: 'Saham', order: 2, x: 1.5, on: false, n: null, items: [{ id: 't1', slides: [] }] });
  // model data, slug, dan peringkat pencarian (diambil dari kode halaman)
  const grab = (a, b) => { const x = page.indexOf(a), y = page.indexOf(b, x); assert.ok(x >= 0 && y > x, 'potongan ' + a); return page.slice(x, y); };
  const P = new Function('location', grab('const esc =', '/* Ikon garis') + grab('/* ========================= DATA', '/* ========================= ROUTER')
    + ';return { build, searchTopics, searchFaq, bySlug, stepLabel, all: () => ({ CATS, TOPICS }), setPop: (p) => { POP = p; }, setFaq: (f) => { FAQ = f; } };')({ href: 'https://t.test/' });
  P.build([
    { id: 'cat-1-a6in3', title: 'Saham', icon: '📊', items: [
      { id: 'topic_9iz2siz', title: 'Log In iKISI', slides: [{ text: 'Masukkan **User ID** Anda', image: 'https://t.test/1.webp' }, { title: 'Klik Log In', desc: 'Tekan tombolnya', image: 'javascript:alert(1)', tip: 'Jangan bagikan password' }] },
      { id: 'topic_buy1', title: 'Cara Beli Saham', desc: 'Membeli saham lewat order', keywords: ['order', 'buy'], slides: [{ text: 'Pilih saham' }] },
      { id: 'topic_sell', title: 'Cara Jual Saham', keywords: 'sell, jual', slides: [] }, { id: 'topic_stop', title: 'Order Stop Loss', slides: [] }] },
    { id: 'cat_ixgqkq9', title: 'Dompet / RDN', items: [{ id: 'topic_tu1', title: 'Top Up RDN', slides: [{ text: 'Buka menu **Top Up**' }] }] },
  ]);
  const { CATS, TOPICS } = P.all(), login = TOPICS[0];
  assert.deepEqual([CATS[0].slug, CATS[1].slug, login.slug], ['saham-1a6in3', 'dompet-rdn-ixgqkq9', 'log-in-ikisi-9iz2siz']);
  assert.equal(P.bySlug(TOPICS, 'judul-lama-sekali-9iz2siz'), login, 'link tetap jalan walau judul diganti (id pendek di ujung slug)');
  assert.equal(P.bySlug(TOPICS, 'tidak-ada-zzz'), null);
  assert.deepEqual(login.steps[0], { title: '', text: 'Masukkan **User ID** Anda', image: 'https://t.test/1.webp', tip: '' });
  assert.deepEqual([login.steps[1].title, login.steps[1].text, login.steps[1].image, login.steps[1].tip], ['Klik Log In', 'Tekan tombolnya', '', 'Jangan bagikan password'], 'format lama judul+desc, tip baru, URL gambar berbahaya dibuang');
  assert.equal(login.thumb, 'https://t.test/1.webp');
  assert.equal(login.key, 'cat-1-a6in3/topic_9iz2siz', 'kunci statistik sama dengan versi lama');
  assert.deepEqual(TOPICS[2].keywords, ['sell', 'jual'], 'kata kunci boleh teks berkoma');
  assert.equal(P.stepLabel(login.steps[0], 0), 'Masukkan User ID Anda');
  const titles = (q) => P.searchTopics(q).map((t) => t.title);
  assert.deepEqual(titles('cara beli saham'), ['Cara Beli Saham'], 'judul persis paling atas & semua kata harus ada');
  assert.deepEqual(titles('saham beli'), ['Cara Beli Saham'], 'urutan kata bebas');
  assert.deepEqual(titles('buy'), ['Cara Beli Saham'], 'kata kunci dari Admin ikut dicari');
  assert.deepEqual(titles('rdn top'), ['Top Up RDN']);
  assert.equal(titles('saham').length, 4, 'nama kategori ikut dicari');
  assert.deepEqual(titles('top up'), ['Top Up RDN'], 'cocok di awal kata: "top" tidak menemukan "Stop"');
  assert.deepEqual(titles('password'), ['Log In iKISI'], 'isi langkah & tip ikut dicari');
  assert.deepEqual(titles('zzzz'), []);
  P.setPop(['cat-1-a6in3/topic_sell']);
  assert.equal(titles('saham')[0], 'Cara Jual Saham', 'skor seri: yang lebih sering dibuka dulu');
  P.setFaq([{ q: 'Berapa minimal top up?', a: 'Rp10.000' }]);
  assert.equal(P.searchFaq('minimal top').length, 1);
}
/* rute halaman yang bisa dibagikan disajikan dari index.html */
{
  const { SPA } = await import('./worker.js');
  for (const p of ['/tutorial/log-in-ikisi-9iz2siz', '/kategori', '/kategori/saham-1a6in3', '/cari', '/tutorial/x/']) assert.ok(SPA.test(p), p);
  for (const p of ['/', '/api/faq', '/icons.js', '/images/2026-10/a.webp', '/tutorial', '/tutorial/a/b', '/admin.html']) assert.ok(!SPA.test(p), p);
  const seen = [], asset = env.ASSETS.fetch;
  env.ASSETS.fetch = async (rq) => { seen.push(new URL(rq.url).pathname); return asset(rq); };
  await tut.fetch(new Request(BASE + '/tutorial/log-in-ikisi-9iz2siz?langkah=2'), env).catch(() => {});   // HTMLRewriter hanya ada di Workers
  assert.deepEqual(seen, ['/'], 'yang diambil index.html');
  env.ASSETS.fetch = asset;
}
console.log("semua cek lolos");
