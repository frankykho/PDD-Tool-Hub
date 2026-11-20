// Cek Bahan Live IG: aiVision (shared/ai.js), hitungan live.js, dan rute /api/live*.
// Jalankan: node apps/market-news/test-live.mjs   (Node 22.15+)
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { aiVision } from "../../shared/ai.js";

const IMG = [{ mime: "image/jpeg", b64: "AAAA" }, { mime: "image/png", b64: "BBBB" }];
const realFetch = globalThis.fetch;

/* ---------- aiVision ---------- */
{
  const calls = [];
  globalThis.fetch = async (u, o) => { calls.push([String(u), JSON.parse(o.body)]); return Response.json({ candidates: [{ content: { parts: [{ text: '[{"akun":"budi","q":"IHSG minggu depan gimana kak?"}]' }] } }] }); };
  const r = await aiVision({ GEMINI_API_KEY: "g", GROQ_API_KEY: "x" }, "sys", "baca", IMG, 500);
  assert.match(calls[0][0], /generativelanguage/, "Gemini dipakai");
  assert.equal(calls[0][1].contents[0].parts.filter((p) => p.inline_data).length, 2, "semua gambar ikut");
  assert.equal(calls[0][1].contents[0].parts[0].inline_data.mime_type, "image/jpeg");
  assert.match(r.text, /budi/);
}
{
  const calls = [], runs = [];
  globalThis.fetch = async (u) => { calls.push(String(u)); return new Response("{}", { status: 500 }); };
  const env = { GROQ_API_KEY: "x", AI: { run: async (m, inp) => { runs.push([m, inp]); return { response: '[{"akun":"sari","q":"Cum date BBRI kapan ya?"}]' }; } } };
  const r = await aiVision(env, "sys", "baca", IMG, 500);
  assert.equal(calls.filter((u) => /groq/.test(u)).length, 0, "Groq tidak menerima gambar");
  const content = runs[0][1].messages[1].content;
  assert.equal(content.filter((c) => c.type === "image_url").length, 2);
  assert.match(content.find((c) => c.type === "image_url").image_url.url, /^data:image\/jpeg;base64,AAAA$/);
  assert.match(r.text, /sari/);
}
{
  const calls = [];
  globalThis.fetch = async (u, o) => { calls.push(JSON.parse(o.body)); return Response.json({ content: [{ type: "text", text: "[]" }], model: "claude-x" }); };
  await aiVision({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" }, "sys", "baca", IMG, 500);
  const blocks = calls[0].messages[0].content;
  assert.deepEqual(blocks.map((b) => b.type), ["image", "image", "text"], "Claude: gambar lalu teks");
  assert.equal(blocks[1].source.media_type, "image/png");
}
globalThis.fetch = realFetch;

/* ---------- live.js ---------- */
const L = await import("./live.js");
assert.deepEqual(L.weekOf("2026-11-20"), { mon: "2026-11-16", fri: "2026-11-20" });
assert.deepEqual(L.weekOf("2026-11-22"), { mon: "2026-11-16", fri: "2026-11-20" }, "Minggu ikut minggu yang sama");
const wib = (s) => Date.parse(s + "+07:00");
assert.equal(L.buildWeek(wib("2026-11-20T17:30:00")), "2026-11-16", "Jumat sore: minggu ini");
assert.equal(L.buildWeek(wib("2026-11-22T09:00:00")), "2026-11-16", "Minggu: minggu yang baru lewat");
assert.equal(L.buildWeek(wib("2026-11-23T08:00:00")), "2026-11-16", "Senin pagi: minggu lalu");
assert.equal(L.buildWeek(wib("2026-11-20T10:00:00")), "2026-11-09", "Jumat sebelum tutup: minggu lalu");

// minggu dengan libur (4 rekap)
const rc = (date, prev, close, hi, lo, sectors, up, down, net) => ({ date, ihsg: { prev, close, high: hi, low: lo }, sectors, movers: { up, down }, foreign: net == null ? null : { net } });
const recs = [
  rc("2026-11-16", 7000, 7070, 7080, 6990, [{ name: "Energi", pct: 2 }, { name: "Properti", pct: -1 }], [{ code: "BBRI", pts: 10 }, { code: "ADRO", pts: 3 }], [{ code: "TLKM", pts: -4 }], 100e9),
  rc("2026-11-17", 7070, 7000, 7100, 6950, [{ name: "Energi", pct: 1 }, { name: "Properti", pct: -1 }], [{ code: "BBRI", pts: 2 }], [{ code: "BBCA", pts: -12 }], -40e9),
  rc("2026-11-19", 7000, 7140, 7150, 6995, [{ name: "Energi", pct: -0.5 }, { name: "Properti", pct: 3 }], [{ code: "BBCA", pts: 5 }], [{ code: "TLKM", pts: -1 }], null),
  rc("2026-11-20", 7140, 7210, 7230, 7120, [{ name: "Energi", pct: 1 }, { name: "Properti", pct: 0 }], [{ code: "ADRO", pts: 6 }], [], 10e9),
];
const n = L.weekNumbers(recs);
assert.deepEqual(n.days, ["2026-11-16", "2026-11-17", "2026-11-19", "2026-11-20"]);
assert.deepEqual([n.ihsg.open, n.ihsg.close, n.ihsg.pct, n.ihsg.high, n.ihsg.low], [7000, 7210, 3, 7230, 6950]);
assert.equal(n.foreign.net, 70e9, "asing dijumlah dari hari yang punya data");
assert.equal(n.sectors[0].name, "Energi");
assert.equal(n.sectors[0].pct, 3.53, "sektor digabung bertingkat");
assert.deepEqual(n.moversDaily.up.map((x) => [x.code, x.pts]), [["BBRI", 12], ["ADRO", 9]]);
assert.deepEqual(n.moversDaily.down.map((x) => [x.code, x.pts]), [["BBCA", -7], ["TLKM", -5]]);

// penggerak seminggu dari TradingView (Perf.W)
const mv = L.weekMovers([["BBRI", 4000, 10, 600e12], ["TLKM", 3000, -5, 300e12], ["ADRO", 2500, 0, 80e12]], 7000);
assert.equal(mv.up[0].code, "BBRI");
assert.equal(mv.down[0].code, "TLKM");

// saham hype
const hype = L.hypeStocks(
  [{ tickers: ["MBSS"], src: "a" }, { tickers: ["MBSS"], src: "b" }, { tickers: ["MBSS", "TLKM"], src: "c" }, { tickers: ["BBRI"], src: "a" }],
  [["MBSS", 600, 25, 4, 5e9], ["TLKM", 3000, -1, 1, 900e9], ["BBRI", 4000, 2, 1.1, 1e12], ["GORE", 50, 40, 9, 0.2e9], ["SUPR", 900, -30, 6, 20e9]], 3);
assert.deepEqual(hype.map((x) => x.code), ["MBSS", "SUPR", "BBRI"], "berita + gerak harga + volume; saham tidak likuid dilewati");
assert.equal(hype[0].mentions, 3);

// berita minggu itu: satu per kelompok, urut ramai
const wn = L.weekNews([
  { id: "1", ckey: "T:MBSS", src: "a", title: "MBSS buyback", score: 12, why: "Buyback menopang harga." },
  { id: "2", ckey: "T:MBSS", src: "b", title: "MBSS buyback Rp200 M", score: 10 },
  { id: "3", ckey: "M:bi", src: "a", title: "BI Rate ditahan", score: 9 },
  { id: "4", ckey: "U:4", src: "c", title: "Berita kecil", score: 2 },
], 2);
assert.deepEqual(wn.map((x) => x.id), ["1", "3"]);
assert.equal(wn[0].media, 2);

// JSON longgar
assert.deepEqual(L.parseJsonLoose('Berikut hasilnya:\n```json\n[{"akun":"a","q":"x"}]\n```'), [{ akun: "a", q: "x" }]);
assert.deepEqual(L.parseJsonLoose('{"a":1} catatan'), { a: 1 });
assert.equal(L.parseJsonLoose("maaf, tidak bisa"), null);

// gabung pertanyaan
const mq = L.mergeQuestions([{ akun: "budi", q: "IHSG minggu depan?" }], [{ akun: "Budi", q: "  IHSG  minggu depan? " }, { akun: "sari", q: "Cum date BBRI?" }, { akun: "", q: "" }]);
assert.deepEqual(mq.map((x) => x.akun), ["budi", "sari"]);

// kepatuhan: ajakan & target harga ditandai
assert.ok(L.flags("Menurut saya beli BBRI sekarang, target harga 5000.").length >= 1);
assert.equal(L.flags("IHSG naik 3% seminggu, ditopang BBRI dan ADRO.").length, 0);

/* ---------- worker: /api/live* ---------- */
registerHooks({
  load(url, ctx, next) {
    if (url.startsWith("file:") && url.endsWith(".html")) return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(fs.readFileSync(fileURLToPath(url), "utf8")) };
    return next(url, ctx);
  },
});
const { default: news, ensure } = await import("./worker.js");
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({ bind: (...a) => st(sql, a), all: async () => ({ results: db.prepare(sql).all(...args) }), first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; } });
  return { db, prepare: (sql) => st(sql), batch: async (list) => { const out = []; for (const x of list) out.push(await x.all()); return out; } };
}
const recapDb = d1();
recapDb.db.exec("CREATE TABLE recaps (date TEXT, session TEXT, data TEXT, status TEXT)");
for (const r of recs) recapDb.db.prepare("INSERT INTO recaps VALUES (?, 'close', ?, 'published')").run(r.date, JSON.stringify(r));
recapDb.db.prepare("INSERT INTO recaps VALUES ('2026-11-20', 's1', ?, 'draft')").run(JSON.stringify({ date: "2026-11-20", ihsg: { prev: 1, close: 99999 } }));
const SECRET = "s".repeat(40), HUB = "https://hub.acme.test", BASE = "https://news.acme.test";
const aiCalls = [];
let ocrReply = '[{"akun":"budi","q":"IHSG minggu depan gimana kak?"},{"akun":"rina","q":"BBRI masih bisa naik? beli di mana?"}]';
let aiReply = (sys) => /PERTANYAAN CADANGAN/.test(sys) ? '```json\n[{"q":"BBRI kuat banget minggu ini, kenapa ya kak?","points":["BBRI penggerak terbesar +12 poin"]}]\n```'
  : /Kelompokkan/.test(sys) ? '[{"title":"Arah IHSG","ids":[1,3],"layak":true,"alasan":"banyak ditanya","points":["IHSG naik 3% seminggu"]},{"title":"Minta sinyal","ids":[2],"layak":false,"alasan":"minta rekomendasi","points":["Jelaskan tidak bisa memberi rekomendasi"]}]'
  : "Halo teman-teman! IHSG naik 3% seminggu ke 7.210. Beli BBRI sekarang, target harga 5000. Sektor energi memimpin, properti tertinggal. Minggu depan pantau agenda makro dan arah dana asing. Keputusan investasi tetap di tangan masing-masing, ya teman-teman. Sampai jumpa di sesi tanya jawab!";
const env = { DB: d1(), RECAP_DB: recapDb, SSO_SECRET: SECRET, HUB_URL: HUB, PROFILE: JSON.stringify({ urls: { hub: HUB }, brand: { short: "KISI" } }),
  AI: { run: async (m, inp) => { aiCalls.push([m, inp]); return { response: Array.isArray(inp.messages[1].content) ? ocrReply : aiReply(inp.messages[0].content) }; } } };
globalThis.caches = { default: { match: async () => null, put: async () => {} } };
let tvCalls = 0;
globalThis.fetch = async (u) => {
  u = String(u);
  if (u.startsWith("https://scanner.tradingview.com")) { tvCalls++; return Response.json({ data: [["BBRI", 4000, 10, 600e12, 1.5, 1e12], ["TLKM", 3000, -5, 300e12, 1, 500e9], ["MBSS", 600, 25, 5e12, 4, 5e9]].map((d) => ({ d })) }); }
  return new Response("not found", { status: 404 });
};
const te = new TextEncoder();
async function cookie(p) {
  const body = Buffer.from(JSON.stringify({ app: "news", x: Date.parse("2027-06-01"), ...p })).toString("base64url");
  const key = await crypto.subtle.importKey("raw", te.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `hub_news=${body}.${Buffer.from(await crypto.subtle.sign("HMAC", key, te.encode(body))).toString("base64url")}`;
}
const EDIT = await cookie({ e: "sari@acme.test", n: "Sari", a: "editor" }), VIEW = await cookie({ e: "budi@acme.test", n: "Budi", a: "viewer" });
const call = async (path, ck, method = "GET", body) => {
  const r = await news.fetch(new Request(BASE + path, { method, headers: { cookie: ck, ...(body ? { "content-type": "application/json", origin: BASE } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  return [r.status, await r.json()];
};
// berita di news-db
await ensure(env);
const ins = env.DB.db.prepare("INSERT INTO mn_items (id,url,src,title,at,seen_at,tickers,ckey,score,status,why) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
ins.run("n1", "https://a/1", "CNBC", "MBSS buyback Rp200 M", "2026-11-17T10:00:00+07:00", "2026-11-17T03:00:00Z", "MBSS", "T:MBSS", 12, "baru", "Buyback menopang harga.");
ins.run("n2", "https://b/1", "Kontan", "MBSS siapkan buyback", "2026-11-17T11:00:00+07:00", "2026-11-17T04:00:00Z", "MBSS", "T:MBSS", 10, "terbit", null);
ins.run("n3", "https://a/2", "CNBC", "Berita diabaikan BBRI", "2026-11-18T10:00:00+07:00", "2026-11-18T03:00:00Z", "BBRI", "T:BBRI", 20, "abaikan", null);
ins.run("n4", "https://a/3", "CNBC", "Berita minggu lain", "2026-11-10T10:00:00+07:00", "2026-11-10T03:00:00Z", "TLKM", "T:TLKM", 30, "baru", null);
ins.run("n5", "https://a/4", "Bisnis", "Rupiah melemah akhir pekan", "2026-11-21T10:00:00+07:00", "2026-11-21T03:00:00Z", "", "M:rupiah", 8, "baru", null);

// Jumat 18.00 WIB: penggerak dari TradingView
const realNow = Date.now;
Date.now = () => Date.parse("2026-11-20T18:00:00+07:00");
let [s, j] = await call("/api/live/build", VIEW, "POST", { week: "2026-11-16", part: "all" });
assert.equal(s, 403, "viewer tidak bisa menyusun");
[s, j] = await call("/api/live/build", EDIT, "POST", { part: "all" });
assert.equal(s, 200, JSON.stringify(j));
[s, j] = await call("/api/live?week=2026-11-16", VIEW);
assert.equal(s, 200);
assert.equal(j.week, "2026-11-16");
assert.equal(j.data.numbers.ihsg.close, 7210, "rekap sesi 1 tidak ikut");
assert.equal(j.data.movers.approx, false);
assert.equal(j.data.movers.up[0].code, "BBRI");
assert.equal(j.data.hype[0].code, "MBSS");
assert.deepEqual(j.news.map((x) => x.id), ["n1"], "satu per kelompok; yang diabaikan & minggu lain tidak ikut");
assert.match(j.script, /IHSG naik 3%/);
assert.ok(j.flags.script.length >= 1, "ajakan beli & target harga ditandai");
assert.equal(j.backup[0].q, "BBRI kuat banget minggu ini, kenapa ya kak?");
assert.deepEqual(j.weeks, ["2026-11-16"]);
assert.equal(j.updated_by, "Sari");

// AI rusak untuk cadangan -> 503, data lama tetap
const keep = aiReply;
aiReply = () => "maaf saya tidak bisa membantu dengan format itu sekarang ya";
[s, j] = await call("/api/live/build", EDIT, "POST", { week: "2026-11-16", part: "backup" });
assert.equal(s, 503);
[, j] = await call("/api/live?week=2026-11-16", VIEW);
assert.equal(j.backup.length, 1, "cadangan lama tidak hilang");
aiReply = keep;

// Senin pagi: susun ulang naskah membawa berita akhir pekan
Date.now = () => Date.parse("2026-11-23T07:00:00+07:00");
[s, j] = await call("/api/live/build", EDIT, "POST", { week: "2026-11-16", part: "script" });
assert.equal(s, 200, JSON.stringify(j));
[, j] = await call("/api/live?week=2026-11-16", VIEW);
assert.deepEqual(j.weekend.map((x) => x.id), ["n5"]);
assert.match(aiCalls.at(-1)[1].messages[1].content, /Rupiah melemah akhir pekan/);

// unggah screenshot dua kali: digabung, lalu dikelompokkan
const img = { mime: "image/jpeg", b64: "AAAA" };
[s] = await call("/api/live/upload", VIEW, "POST", { week: "2026-11-16", images: [img] });
assert.equal(s, 403);
[s] = await call("/api/live/upload", EDIT, "POST", { week: "2026-11-16", images: [] });
assert.equal(s, 400);
[s, j] = await call("/api/live/upload", EDIT, "POST", { week: "2026-11-16", images: [img] });
assert.equal(s, 200, JSON.stringify(j));
ocrReply = '[{"akun":"Budi","q":"IHSG  minggu depan gimana kak?"},{"akun":"dewi","q":"Arah IHSG akhir tahun?"}]';
[s] = await call("/api/live/upload", EDIT, "POST", { week: "2026-11-16", images: [img, img] });
assert.equal(s, 200);
[, j] = await call("/api/live?week=2026-11-16", VIEW);
assert.deepEqual(j.questions.map((x) => x.akun), ["budi", "rina", "dewi"]);
assert.equal(j.groups[0].title, "Arah IHSG");
assert.deepEqual(j.groups[0].ids, [1, 3]);

// simpan suntingan & hapus pertanyaan
[s] = await call("/api/live/save", EDIT, "POST", { week: "2026-11-16", field: "script", value: "Naskah suntingan tim." });
assert.equal(s, 200);
[s] = await call("/api/live/save", EDIT, "POST", { week: "2026-11-16", field: "questions", value: [] });
assert.equal(s, 400, "kolom yang tidak boleh disunting ditolak");
[s] = await call("/api/live/clear", EDIT, "POST", { week: "2026-11-16" });
assert.equal(s, 200);
[, j] = await call("/api/live?week=2026-11-16", VIEW);
assert.equal(j.script, "Naskah suntingan tim.");
assert.deepEqual([j.questions, j.groups], [[], []]);

// disusun jauh setelahnya: penggerak = jumlah rekap harian (perkiraan), tanpa TradingView
// ... tapi angka TradingView & berita yang sudah tersimpan tidak diganti versi perkiraan / berita yang sudah terhapus
Date.now = () => Date.parse("2026-12-02T10:00:00+07:00");
env.DB.db.prepare("DELETE FROM mn_items WHERE id IN ('n1','n2')").run();   // berita > 7 hari sudah dihapus prune()
tvCalls = 0;
[s, j] = await call("/api/live/build", EDIT, "POST", { week: "2026-11-16", part: "all" });
assert.equal(s, 200, JSON.stringify(j));
[, j] = await call("/api/live?week=2026-11-16", VIEW);
assert.equal(tvCalls, 0);
assert.equal(j.data.movers.approx, false, "penggerak TradingView yang tersimpan dipertahankan");
assert.equal(j.data.hype[0].code, "MBSS");
assert.deepEqual(j.news.map((x) => x.id), ["n1"], "berita tersimpan dipertahankan");
env.DB.db.prepare("DELETE FROM mn_live").run();
[s, j] = await call("/api/live/build", EDIT, "POST", { week: "2026-11-16", part: "all" });
assert.equal(s, 200, JSON.stringify(j));
[, j] = await call("/api/live?week=2026-11-16", VIEW);
assert.equal(j.data.movers.approx, true, "baru disusun belakangan: penggerak dari rekap harian (perkiraan)");
assert.equal(j.data.movers.up[0].code, "BBRI");
[s] = await call("/api/live/build", EDIT, "POST", { week: "2026-11-02", part: "all" });
assert.equal(s, 400, "minggu tanpa rekap");

// Jumat sebelum rekap penutupan Jumat ada: ditolak (bukan rekap 4 hari)
for (const d of ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]) recapDb.db.prepare("INSERT INTO recaps VALUES (?, 'close', ?, 'published')").run(d, JSON.stringify(rc(d, 7210, 7220, 7230, 7200, [], [], [], 1e9)));
Date.now = () => Date.parse("2026-11-27T17:40:00+07:00");
[s, j] = await call("/api/live/build", EDIT, "POST", { week: "2026-11-23", part: "all" });
assert.equal(s, 400);
assert.match(j.error, /Jumat/);
assert.equal(L.buildWeek(wib("2026-11-27T17:10:00")), "2026-11-16", "sebelum 17.30 masih minggu lalu");

// naskah ikut tersimpan walau pertanyaan cadangan gagal; berita akhir pekan dibatasi sampai Senin 09.00
Date.now = () => Date.parse("2026-11-20T18:00:00+07:00");
env.DB.db.prepare("INSERT INTO mn_items (id,url,src,title,at,seen_at,tickers,ckey,score,status) VALUES ('n1','https://a/1','CNBC','MBSS buyback Rp200 M','2026-11-17T10:00:00+07:00','2026-11-17T03:00:00Z','MBSS','T:MBSS',12,'baru')").run();
env.DB.db.prepare("INSERT INTO mn_items (id,url,src,title,at,seen_at,tickers,ckey,score,status) VALUES ('n6','https://a/6','CNBC','Berita hari Selasa','2026-11-24T10:00:00+07:00','2026-11-24T03:00:00Z','','M:selasa',9,'baru')").run();
aiReply = (sys) => (/PERTANYAAN CADANGAN/.test(sys) ? "tidak bisa" : keep(sys));
[s] = await call("/api/live/build", EDIT, "POST", { week: "2026-11-16", part: "all" });
assert.equal(s, 503);
[, j] = await call("/api/live?week=2026-11-16", VIEW);
assert.match(j.script, /IHSG naik 3%/, "naskah yang sudah jadi tidak dibuang");
aiReply = keep;
Date.now = () => Date.parse("2026-11-25T10:00:00+07:00");
[s] = await call("/api/live/build", EDIT, "POST", { week: "2026-11-16", part: "script" });
assert.equal(s, 200);
[, j] = await call("/api/live?week=2026-11-16", VIEW);
assert.deepEqual(j.weekend.map((x) => x.id), ["n5"], "berita Selasa bukan berita akhir pekan");

// unggah satu per satu: pengelompokan hanya di unggahan terakhir; isi AI yang aneh tidak bikin 500
ocrReply = '[null, "x", {"akun":"tono","q":"Cum date TLKM kapan?"}]';
const before = aiCalls.length;
[s, j] = await call("/api/live/upload", EDIT, "POST", { week: "2026-11-16", images: [img], group: false });
assert.equal(s, 200, JSON.stringify(j));
assert.equal(aiCalls.length - before, 1, "tanpa pengelompokan");
[s] = await call("/api/live/upload", EDIT, "POST", { week: "2026-11-16", images: [{ mime: "image/jpeg", b64: "A".repeat(1.6e6) }] });
assert.equal(s, 400, "gambar terlalu besar ditolak");

// suntingan dirapikan; minggu tanpa bahan tidak bisa disunting
[s] = await call("/api/live/save", EDIT, "POST", { week: "2026-11-16", field: "backup", value: [{ q: "Tanpa poin?" }, null] });
assert.equal(s, 200);
[s] = await call("/api/live/save", EDIT, "POST", { week: "2026-11-16", field: "groups", value: [{ title: "Tanpa ids" }] });
assert.equal(s, 200);
[s, j] = await call("/api/live?week=2026-11-16", VIEW);
assert.equal(s, 200);
assert.deepEqual(j.backup, [{ q: "Tanpa poin?", points: [] }]);
assert.deepEqual(j.groups[0].ids, []);
[s] = await call("/api/live/save", EDIT, "POST", { week: "2026-10-05", field: "script", value: "x" });
assert.equal(s, 400);
[s] = await call("/api/live/clear", EDIT, "POST", { week: "2026-10-05" });
assert.equal(s, 400);
Date.now = realNow;
globalThis.fetch = realFetch;

console.log("semua cek lolos");
