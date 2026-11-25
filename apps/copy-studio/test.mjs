// Cek Copy Studio & shared/compliance.js. Jalankan: node apps/copy-studio/test.mjs   (Node 22.15+)
// D1 ditiru dengan node:sqlite; AI & Whisper ditiru, jadi tidak ada panggilan ke luar.
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { checkCopy, complianceScript, PLATFORMS } from "../../shared/compliance.js";

registerHooks({
  load(url, ctx, next) {
    if (url.startsWith("file:") && url.endsWith(".html")) return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(fs.readFileSync(fileURLToPath(url), "utf8")) };
    return next(url, ctx);
  },
});
const { default: worker, cleanStyle, prompt, parse, segments, DEFAULT_STYLE, HOOKS } = await import("./worker.js");

/* ---------- aturan kepatuhan ---------- */
const ids = (t, o) => checkCopy(t, o).issues.map((i) => i.id);
assert.deepEqual(ids("Reksa dana pasti untung, tanpa risiko"), ["janji", "janji"]);
assert.ok(ids("Yuk beli saham BBCA sekarang").includes("ajakan"));
assert.ok(ids("Target harga 10.000 ya").includes("ajakan"));
assert.ok(!ids("Beli reksa dana di iKISI mulai Rp10 ribu").includes("ajakan"), "nama aplikasi bukan kode saham");
assert.ok(!ids("Pantau IHSG dan beli IHSG lewat ETF").includes("ajakan"), "IHSG bukan kode saham");
assert.ok(ids("Beli ETF XKMS sekarang").includes("ajakan"));
assert.ok(!ids("Beli ETF XKMS sekarang", { allow: ["XKMS"] }).includes("ajakan"), "kode produk sendiri boleh");
assert.ok(ids("Reksa dana terbaik tahun ini").includes("superlatif"));
assert.ok(ids("Buruan daftar!").includes("fomo"));
assert.ok(ids("Return 12% setahun").includes("kinerja"));
assert.ok(!ids("Return 12% setahun. Kinerja masa lalu tidak mencerminkan kinerja masa depan.").includes("kinerja"));
assert.ok(!ids("Return 12% setahun", { platform: "push_body" }).includes("kinerja"), "teks pendek tanpa cek kinerja");
assert.ok(ids("Dapatkan cashback Rp50 ribu").includes("snk"));
assert.ok(!ids("Dapatkan cashback Rp50 ribu. S&K berlaku").includes("snk"));
assert.ok(ids("Mulai investasi saham").includes("risiko"));
assert.ok(!ids("Mulai investasi saham. Investasi mengandung risiko.").includes("risiko"));
// glosarium: salah ditandai, bentuk benar tidak
const gl = [{ bad: "reksadana", good: "reksa dana" }, { bad: "cuan maksimal", good: "" }];
const g = checkCopy("Investasi reksadana, bukan reksa dana palsu", { glossary: gl }).issues.filter((i) => i.id === "glosarium");
assert.equal(g.length, 1);
assert.equal(g[0].match, "reksadana");
assert.equal(g[0].at, 10);
assert.match(checkCopy("ini cuan maksimal", { glossary: gl }).issues.find((i) => i.id === "glosarium").msg, /Hindari/);
// panjang & hashtag
const long = "a".repeat(2300);
assert.equal(checkCopy(long, { platform: "ig" }).issues[0].id, "panjang");
assert.equal(checkCopy("x".repeat(46), { platform: "email_subject" }).issues[0].level, "error");
assert.ok(ids("#a #b #c #d #e #f halo", { platform: "ig" }).includes("hashtag"));
assert.equal(checkCopy("#a #b halo").tags, 2);
// izin OJK hanya untuk teks panjang
assert.ok(ids("z".repeat(250)).includes("izin"));
assert.ok(!ids("z".repeat(250) + " Berizin dan diawasi OJK").includes("izin"));
assert.ok(!ids("z".repeat(250), { license: false }).includes("izin"));
// urutan: error dulu
const lv = checkCopy("Buruan, pasti untung!!").issues.map((i) => i.level);
assert.deepEqual(lv, [...lv].sort((a, b) => ["error", "warn", "info"].indexOf(a) - ["error", "warn", "info"].indexOf(b)));
// versi browser memberi hasil yang sama
const w = {};
new Function("window", complianceScript().replace(/^<script>|<\/script>$/g, ""))(w);
for (const t of ["Reksa dana pasti untung", "Beli saham BBCA", "Return 8% per tahun, cashback!", "a".repeat(300)])
  assert.deepEqual(w.Compliance.check(t, { glossary: gl }), checkCopy(t, { glossary: gl }), t.slice(0, 30));
assert.deepEqual(Object.keys(w.Compliance.PLATFORMS), Object.keys(PLATFORMS));
// hasil bundle wrangler menyisipkan __name(...) ke dalam fungsi; browser tidak punya helper itu
const w2 = {}, bundled = complianceScript().replace(/^<script>|<\/script>$/g, "").replace("function checkCopy(text, opts) {", "function checkCopy(text, opts) {__name(function(){}, \"x\");");
new Function("window", bundled)(w2);
assert.equal(w2.Compliance.check("Pasti untung", {}).issues.length > 0, true, "skrip Compliance jalan walau ada __name");

/* ---------- prompt & parse ---------- */
assert.equal(prompt("ab", { brief: "" }), null);
assert.match(prompt("ab", { brief: "reksa dana", type: "subject", n: 99 }).user, /8 variasi subject email/);
assert.match(prompt("reels", { topic: "Deposito vs RDPU", duration: 60 }).user, /60 detik/);
assert.match(prompt("reels", { topic: "x", duration: 7 }).user, /30 detik/, "durasi tidak sah -> 30");
assert.equal(prompt("nope", {}), null);
// What's New: nama fitur atau catatan wajib; langkah kasar tetap per baris; hasil dirapikan (nomor langkah dibuang, paragraf dipisah)
assert.equal(prompt("wn", { name: " ", notes: "" }), null);
{ const u = prompt("wn", { name: "Auto-invest", steps: "buka menu RD\n\npilih auto-invest", version: "3.12" }).user;
  assert.match(u, /Nama fitur: Auto-invest/); assert.match(u, /buka menu RD\npilih auto-invest/); assert.match(u, /versi 3\.12/); assert.match(u, /\[nama menu\]/);
  // gaya bawaan = informasi produk dengan sentuhan marketing (±80/20); "info" = teks informasi tanpa gaya promosi
  assert.match(u, /informasi produk dengan sentuhan marketing/); assert.match(u, /80% informasi/);
  const ui = prompt("wn", { name: "Auto-invest", style: "info" }).user;
  assert.match(ui, /bukan iklan/); assert.doesNotMatch(ui, /sentuhan marketing/); }
{ const r = parse("wn", '{"title":"Auto-invest","short":"Investasi rutin otomatis.","long":"Paragraf satu.\\n\\nParagraf dua.","manual":{"intro":"Begini caranya.","steps":["1. Buka menu Reksa Dana","Langkah 2) Pilih Auto-invest",""],"notes":["Minimal Rp100 ribu"]},"faq":[{"q":"Bisa dihentikan?","a":"Bisa kapan saja."},{"q":"","a":"x"}],"check":["Nama menu"]}');
  assert.deepEqual(r.long, ["Paragraf satu.", "Paragraf dua."]); assert.deepEqual(r.manual.steps, ["Buka menu Reksa Dana", "Pilih Auto-invest"]);
  assert.equal(r.faq.length, 1); assert.deepEqual(r.check, ["Nama menu"]); }
assert.deepEqual(parse("ab", 'oke ```json {"items":[{"text":"Halo","angle":"manfaat","why":"langsung ke inti"},{"text":""}]} ```'), { items: [{ text: "Halo", angle: "manfaat", why: "langsung ke inti" }] });
// nada & formula: nada sah masuk ke perintah, nada asing diabaikan; tiap jenis A/B punya petunjuk sendiri
assert.match(prompt("ab", { brief: "x", tone: "syariah" }).user, /Nada: hangat dan santun/);
assert.doesNotMatch(prompt("ab", { brief: "x", tone: "aneh" }).user, /Nada:/);
assert.match(prompt("ab", { brief: "x", type: "subject" }).user, /pemicu spam/);
assert.match(prompt("ab", { brief: "x" }).user, /PAS \(masalah–dampak–solusi\)/);
for (const k of ["app", "reels", "kit"]) assert.match(prompt(k, { brief: "x", topic: "x", product: { name: "X" }, tone: "edukatif" }).user, /Nada: jelas dan sabar/, k);
assert.deepEqual(parse("reels", '{"hooks":["Satu",{"text":"Dua","pattern":"angka spesifik"},{"text":""}]}').hooks, [{ text: "Satu", pattern: "" }, { text: "Dua", pattern: "angka spesifik" }]);
// naskah YouTube: durasi/format tidak sah -> bawaan; penanda bab dari jumlah kata (140 kata/menit), bab pertama 0:00
assert.equal(prompt("yt", {}), null);
assert.match(prompt("yt", { topic: "x", duration: 10, format: "qa" }).user, /±10 menit[\s\S]*tanya-jawab[\s\S]*±1400 kata/);
assert.match(prompt("yt", { topic: "x", duration: 99, format: "?" }).user, /±8 menit[\s\S]*edukasi/);
const w140 = Array(140).fill("kata").join(" ");
const ytR = parse("yt", JSON.stringify({ titles: ["Judul A", { text: "Judul B", why: "kata kunci di depan" }], thumbnails: ["MULAI 10RB"], hook: Array(70).fill("a").join(" "),
  chapters: [{ title: "Pengantar", voiceover: w140 }, { title: "Inti", voiceover: w140 }, { title: "Contoh", voiceover: w140 }], cta_mid: "Subscribe ya", outro: w140, hashtags: ["reksa dana"], tags: ["#investasi", "pemula"] }));
assert.deepEqual(ytR.chapters.map((c) => c.start), [0, 90, 151], "0:00, lalu hook 70 + bab 140 kata = 1,5 menit, lalu + CTA tengah 2 kata");
assert.deepEqual(ytR.titles[0], { text: "Judul A", why: "" });
assert.deepEqual([ytR.hashtags, ytR.tags], [["#reksadana"], ["investasi", "pemula"]]);
assert.equal(ytR.words, 70 + 140 * 3 + 2 + 140);
// contoh hook di panduan menulis AI sendiri harus lolos cek kepatuhan
for (const [n, e] of HOOKS) assert.equal(checkCopy(e, { platform: "ig" }).issues.filter((i) => i.level === "error").length, 0, n);
assert.deepEqual(parse("reels", '{"hashtags":["investasi","#Reksa Dana"],"scenes":[{"time":"0-3"}]}').hashtags, ["#investasi", "#ReksaDana"]);
assert.throws(() => parse("fix", "maaf"), /JSON/);
assert.deepEqual(segments({ segments: [{ start: 0, end: 2.5, text: " Halo " }, { start: 3, end: 4, text: "" }] }), [{ start: 0, end: 2.5, text: "Halo" }]);
assert.deepEqual(segments({ text: "Halo semua", transcription_info: { duration: 4 } }), [{ start: 0, end: 4, text: "Halo semua" }]);
assert.deepEqual(segments(null), []);
assert.deepEqual(cleanStyle({ guide: " g ", glossary: [{ bad: "A" }, { bad: "a", good: "dup" }, { bad: "" }, null] }), { guide: "g", glossary: [{ bad: "A", good: "", note: "" }] });

/* ---------- paket produk ---------- */
const { factLines, products } = await import("./worker.js");
assert.equal(factLines({}), null);
const fl = factLines({ kind: "Reksa dana", name: "RD Pasar Uang A", im: "MI X", sy: true, min: 10000, ret: { y1: 5.123, m1: null } });
assert.match(fl, /- Nama: RD Pasar Uang A/); assert.match(fl, /- Syariah: ya/); assert.match(fl, /Return 1 tahun: 5\.12%/); assert.ok(!/1 bulan/.test(fl));
assert.equal(prompt("kit", { product: {} }), null);
assert.match(prompt("kit", { product: { name: "XKMS" }, mode: "comarketing", partner: "MI Y" }).user, /co-marketing bersama MI Y/);
assert.doesNotMatch(prompt("kit", { product: { name: "XKMS" }, mode: "launch", partner: "MI Y" }).user, /co-marketing/);
const kit = parse("kit", JSON.stringify({ headline: "H", feed: "F", story: ["a", { text: "b" }, ""], email: { subject: "S" }, push: { title: "T", body: "B" }, faq: [{ q: "Q", a: "A" }, { q: "x" }] }));
assert.deepEqual(kit.story, ["a", "b"]); assert.equal(kit.email.subject, "S"); assert.equal(kit.faq.length, 1); assert.equal(kit.wa, "");
const svc = (body, ok = true) => ({ fetch: async () => (ok ? Response.json(body) : new Response("x", { status: 500 })) });
const P = await products({
  FUND: svc({ funds: [{ pid: 7, name: "RD Syariah B", nav: 1200, im: "MI Z", sy: 1, ret: { y1: 4 }, minSubs: 100000 }, { pid: 8, name: "Tanpa NAB" }] }),
  BOND: svc({ meta: { date: "2026-10-22" }, bonds: [{ code: "SR021", name: "Sukuk Ritel", type: "Sukuk", coupon: 6.4, yield: 6.2, min: 1e6 }] }),
  ETF: svc({}, false),
});
assert.deepEqual([P.rd.length, P.rd[0].id, P.rd[0].sy, P.bond[0].type, P.bond[0].sy, P.etf.length], [1, "7", true, "Sukuk", true, 0]);
assert.match(P.errors.join(), /ETF/);

/* ---------- worker ---------- */
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
  });
  return { prepare: (sql) => st(sql) };
}
const SECRET = "s".repeat(40), HUB = "https://hub.acme.test", ORIGIN = "https://copy.acme.test";
const aiCalls = [];
const env = {
  SSO_SECRET: SECRET, HUB_URL: HUB, DB: d1(), COPY_AI_DAILY: "2", COPY_STT_DAILY: "1",
  PROFILE: JSON.stringify({ brand: { short: "Acme", hashtags: "#Acme" }, app: { name: "AcmeApp" }, tools: { etf: { facts: { XKMS: {} } } } }),
  AI: { async run(model, input) {
    aiCalls.push(model);
    if (/whisper/.test(model)) return { text: "halo", segments: [{ start: 0.2, end: 1.5, text: "Halo semua" }] };
    return { response: '{"items":[{"text":"Mulai dari Rp10 ribu","angle":"angka"},{"text":"Sudah kenal reksa dana?","angle":"pertanyaan"}]}' };
  } },
};
const te = new TextEncoder();
const b64u = (buf) => Buffer.from(buf).toString("base64url");
async function cookie(p) {
  const body = b64u(te.encode(JSON.stringify({ app: "copy", x: Date.now() + 3600e3, ...p })));
  const key = await crypto.subtle.importKey("raw", te.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `hub_copy=${body}.${b64u(await crypto.subtle.sign("HMAC", key, te.encode(body)))}`;
}
const call = (path, { cookie: ck, json, origin = ORIGIN, headers = {} } = {}) => worker.fetch(new Request(ORIGIN + path, {
  method: json ? "POST" : "GET", headers: { ...(ck ? { cookie: ck } : {}), ...(json ? { "content-type": "application/json", origin } : {}), ...headers }, body: json ? JSON.stringify(json) : undefined,
}), env);
const editor = await cookie({ e: "ed@acme.test", n: "Edi", a: "editor" }), user = await cookie({ e: "u@acme.test", a: "user" });

let r = await call("/");
assert.equal(r.status, 303);
assert.match(r.headers.get("location"), /^https:\/\/hub\.acme\.test\/sso\?app=copy/);
assert.equal((await call("/api/style")).status, 401);

r = await call("/", { cookie: user });
const page = await r.text();
assert.match(page, /<title>Acme Copy Studio<\/title>/);
assert.match(page, /window\.Compliance=/);
const cfg = JSON.parse(page.match(/window\.CS=(\{.*?\});<\/script>/)[1]);
assert.equal(cfg.canEdit, false);
assert.deepEqual(cfg.allow, ["XKMS"]);
assert.deepEqual(cfg.style.glossary, DEFAULT_STYLE.glossary);
for (const [, js] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(js);

// disclaimer dari Brand Kit: sebelum ada kiriman, tombol "+ Izin & disclaimer" tetap memakai profil
assert.equal(cfg.brand.versions, undefined);
const PUSH = { versions: [{ key: "umum", label: "Umum", text: "Teks umum" }, { key: "reksadana", label: "Reksa Dana", text: "Teks RD" }, { key: "obligasi", label: "Obligasi", text: "" }], old: { edukasi: [] } };
assert.equal((await call("/__hub/disclaimers", { json: PUSH })).status, 403, "tanpa kunci hub ditolak");
assert.equal((await call("/__hub/disclaimers", { json: PUSH, headers: { "x-hub-key": SECRET } })).status, 200);
const cfg2 = JSON.parse((await (await call("/", { cookie: user })).text()).match(/window\.CS=(\{.*?\});<\/script>/)[1]);
assert.deepEqual(cfg2.brand.versions, [{ label: "Umum", text: "Teks umum" }, { label: "Reksa Dana", text: "Teks RD" }], "versi kosong tidak ikut");

// panduan gaya: hanya editor/admin
assert.equal((await call("/api/style", { cookie: user, json: { guide: "x" } })).status, 403);
assert.equal((await call("/api/style", { cookie: editor, json: { guide: "x" }, origin: "https://evil.test" })).status, 403, "beda origin ditolak");
r = await call("/api/style", { cookie: editor, json: { guide: "Pakai kamu", glossary: [{ bad: "cuan", good: "" }] } });
assert.equal(r.status, 200);
const st = await (await call("/api/style", { cookie: user })).json();
assert.equal(st.guide, "Pakai kamu");
assert.equal(st.updated_by, "Edi");
assert.deepEqual(st.glossary, [{ bad: "cuan", good: "", note: "" }]);
r = await call("/__hub/style", { headers: { "x-hub-key": SECRET } });
assert.equal((await r.json()).guide, "Pakai kamu");
assert.equal((await call("/__hub/style", { headers: { "x-hub-key": "salah".repeat(8) } })).status, 403);

// Copywriter: kuota, data program & PR
const q0 = await (await call("/api/quota", { cookie: user })).json();
assert.deepEqual(q0, { used: 0, limit: 2 });               // env tes COPY_AI_DAILY "2"
const cw0 = await (await call("/api/cw", { cookie: user })).json();
assert.equal(cw0.pr.contact, "");
assert.match(cw0.pr.about, /kode broker BQ/);
assert.equal(cw0.program, undefined);
assert.equal((await call("/api/cw", { cookie: user, json: { pr: { contact: "x" } } })).status, 403);
const cw1 = await (await call("/api/cw", { cookie: editor, json: { pr: { about: "A", contact: "B" } } })).json();
assert.deepEqual(cw1.pr, { about: "A", contact: "B" });
assert.equal((await (await call("/api/cw", { cookie: user })).json()).pr.contact, "B");
assert.ok(page.includes('["cw", "Copywriter"]') && page.includes('import("/cw.js")'));
assert.ok(fs.existsSync(new URL("./assets/brand/kisi-color.png", import.meta.url)));
for (const f of ["wrangler.jsonc", "wrangler.deploy.json"]) if (fs.existsSync(new URL("./" + f, import.meta.url))) assert.match(fs.readFileSync(new URL("./" + f, import.meta.url), "utf8"), /"COPY_AI_DAILY": "100"/);

// AI: batas per hari
assert.equal((await call("/api/ai", { cookie: user, json: { kind: "ab", brief: "" } })).status, 400);
r = await call("/api/ai", { cookie: user, json: { kind: "ab", brief: "reksa dana untuk pemula", n: 3 } });
assert.equal(r.status, 200);
const ab = await r.json();
assert.equal(ab.result.items.length, 2);
assert.equal((await call("/api/ai", { cookie: user, json: { kind: "ab", brief: "lagi" } })).status, 200);
r = await call("/api/ai", { cookie: user, json: { kind: "ab", brief: "lagi" } });
assert.equal(r.status, 429, "batas COPY_AI_DAILY = 2");

// subtitle
assert.equal((await call("/api/transcribe", { cookie: user, json: { audio: "" } })).status, 400);
r = await call("/api/transcribe", { cookie: user, json: { audio: Buffer.from("RIFF....").toString("base64"), lang: "id" } });
assert.deepEqual((await r.json()).segments, [{ start: 0.2, end: 1.5, text: "Halo semua" }]);
assert.equal((await call("/api/transcribe", { cookie: user, json: { audio: "UklGRg==" } })).status, 429, "batas COPY_STT_DAILY = 1");
assert.ok(aiCalls.includes("@cf/openai/whisper-large-v3-turbo"));

/* ---------- banner What's New (assets/banner.js) ---------- */
const B = await import("./assets/banner.js");
assert.equal(B.combos().length, 23);
assert.deepEqual(B.combos(2).map((c) => c.id + ":" + c.side), ["dua:kanan", "dua:kiri", "sejajar:kanan", "sejajar:kiri", "dua-miring:kanan", "dua-miring:kiri", "melayang:kanan", "melayang:kiri", "seri2:kanan", "seri2:kiri"]);
assert.equal(B.layoutFor("melayang", "kanan").float, true); assert.equal(B.layoutFor("dua", "kanan").float, false);
assert.deepEqual(B.layoutFor("melayang", "kiri").phones.map((p) => p.rot), [-12, 14], "melayang versi kiri dicerminkan");
assert.equal(B.combos(3).length, 5, "kipas & seri kanan/kiri + tengah");
assert.deepEqual(B.combos(4).map((c) => c.id + ":" + c.side), ["seri4:kanan", "seri4:kiri"]);
for (const side of ["kanan", "kiri"]) { const L = B.layoutFor("seri4", side);
  assert.deepEqual(L.phones.map((p) => p.no), [1, 2, 3, 4], "seri: urutan gambar = screenshot, layar berikutnya digambar di depan " + side);
  assert.deepEqual(L.phones.map((p) => p.bare), [false, true, true, true], "hanya HP utama berbingkai");
  const xs = L.phones.map((p) => p.x); assert.ok(side === "kanan" ? xs[0] < xs[3] : xs[0] > xs[3], "HP utama di sisi teks"); }
const kn = B.layoutFor("dua", "kanan"), kr = B.layoutFor("dua", "kiri");
assert.deepEqual(kr.phones.map((p) => p.x), [1920 - 1060 - 440, 1920 - 1400 - 440], "dicerminkan, urutan gambar tetap");
assert.deepEqual(kn.phones.map((p) => p.no), [1, 2]);
assert.deepEqual(kr.phones.map((p) => p.no), [2, 1], "nomor = urutan kiri→kanan");
assert.equal(B.layoutFor("miring", "kiri").phones[0].rot, 8);
assert.equal(B.layoutFor("tengah", "tengah").desc, false);
// teks tidak menabrak HP (bbox setelah diputar) dan tetap di dalam banner, semua kombinasi
const bbox = (p) => { const r = Math.abs(p.rot) * Math.PI / 180, hw = (p.w * Math.cos(r) + p.h * Math.sin(r)) / 2, cx = p.x + p.w / 2; return [cx - hw, cx + hw]; };
for (const c of B.combos()) {
  const L = B.layoutFor(c.id, c.side);
  assert.ok(L.text.x >= 0 && L.text.x + L.text.w <= 1920, c.id + c.side);
  if (c.side === "kanan") assert.ok(L.text.x + L.text.w < Math.min(...L.phones.map((p) => bbox(p)[0])), "teks vs HP " + c.id);
  if (c.side === "kiri") assert.ok(L.text.x > Math.max(...L.phones.map((p) => bbox(p)[1])), "teks vs HP " + c.id);
}
assert.deepEqual(B.coverTop(1080, 2340, 480, 1030), { sx: 0, sy: 0, sw: 1080, sh: 1080 * 1030 / 480 }, "screenshot lebih panjang: bawah dibuang");
const wide = B.coverTop(2000, 1000, 480, 1030);
assert.equal(wide.sy, 0); assert.equal(wide.sh, 1000); assert.ok(Math.abs(wide.sx - (2000 - wide.sw) / 2) < 1e-9, "landscape: dipotong rata kiri-kanan");
const ms = (t, s) => t.length * s * 0.55;
const f1 = B.fitText(ms, "Auto-invest Reksa Dana", { w: 1000, size: 88, minSize: 53, maxLines: 3, lh: 1.05 });
assert.equal(f1.overflow, false); assert.equal(f1.size, 88);
const f2 = B.fitText(ms, "x".repeat(150), { w: 1000, size: 36, minSize: 22, maxLines: 3, lh: 1.4 });
assert.ok(f2.lines.every((l) => ms(l, f2.size) <= 1000), "kata panjang dipecah, tidak melebihi lebar");
assert.equal(B.fitText(ms, "kata ".repeat(200), { w: 300, size: 36, minSize: 22, maxLines: 3, lh: 1.4 }).overflow, true);
assert.equal(B.fileName("Auto-invest Reksa Dana!"), "whats-new-auto-invest-reksa-dana.png");
assert.equal(B.fileName("  "), "whats-new-banner.png");

// draw(): ctx tiruan yang mencatat panggilan
const fakeCtx = () => { const log = []; const c = new Proxy({ log, measureText: (t) => ({ width: t.length * 20 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (o, k) => k in o ? o[k] : (...a) => log.push([k, ...a]), set: (o, k, v) => (log.push(["set:" + k, v]), true) }); return c; };
const shot = { naturalWidth: 1080, naturalHeight: 2340 }, logoImg = { naturalWidth: 1200, naturalHeight: 390 };
{ const fx = fakeCtx(), s2 = { naturalWidth: 1080, naturalHeight: 2340 }; B.draw(fx, { id: "seri3", side: "kanan", theme: "terang", shots: [shot, s2, null], title: "J" });
  const im = fx.log.filter((l) => l[0] === "drawImage" && (l[1] === shot || l[1] === s2));
  assert.deepEqual(im.map((l) => l[1] === shot), [true, false], "screenshot 1 dulu (HP utama), lalu layar lanjutan di depannya");
  assert.equal(im[1][8], 340, "layar lanjutan tanpa bingkai: gambar selebar kartu");
  assert.ok(!fx.log.some((l) => l[0] === "fillText" && /^[123]$/.test(l[1])), "tanpa nomor"); }
let fcx = fakeCtx(), r1 = B.draw(fcx, { id: "kipas", side: "kanan", theme: "gelap", logo: logoImg, shots: [shot, shot, null], tag: "FITUR BARU", title: "Auto-invest", desc: "Investasi rutin." });
assert.deepEqual(r1.overflow, []);
assert.equal(fcx.log.filter((l) => l[0] === "drawImage" && l[1] === shot).length, 2, "dua screenshot digambar, slot kosong tidak");
assert.equal(fcx.log.filter((l) => l[0] === "clip").length, 3, "tiap layar HP di-clip");
assert.ok(fcx.log.some((l) => l[0] === "fillText" && l[1] === "Investasi rutin."));
fcx = fakeCtx(); B.draw(fcx, { id: "tengah", side: "tengah", theme: "terang", logo: logoImg, shots: [], tag: "FITUR BARU", title: "Judul", desc: "Tidak tampil" });
assert.ok(!fcx.log.some((l) => l[0] === "fillText" && l[1] === "Tidak tampil"), "susunan tengah tanpa penjelasan");
assert.deepEqual(B.draw(fakeCtx(), { id: "tegak", side: "kanan", theme: "terang", logo: logoImg, shots: [], tag: "FITUR BARU", title: "Judul ".repeat(40), desc: "" }).overflow, ["title"]);

// menu yang disorot: lebih besar dari aslinya, keluar HP ke arah teks tapi tidak menabrak kolom teks, tetap di dalam banner (semua susunan & HP)
const menu = { x: 0, y: 0.3, w: 1, h: 0.08 };
for (const c of B.combos()) {
  const L = B.layoutFor(c.id, c.side);
  for (const p of L.phones) for (const r of [menu, { x: 0.6, y: 0.9, w: 0.3, h: 0.05 }, { x: 0, y: 0, w: 1, h: 1 }]) {
    const b = B.hlBox(L, p, 1080, 2340, r), tag = c.id + c.side + p.no;
    assert.ok(b.cx - b.w / 2 >= 39.9 && b.cx + b.w / 2 <= 1920.1 - 40 && b.cy - b.h / 2 >= 39.9 && b.cy + b.h / 2 <= 1080.1 - 40, "di dalam banner " + tag);
    if (c.side === "kanan") assert.ok(b.cx - b.w / 2 >= L.text.x + L.text.w + 29.9, "tidak menabrak teks " + tag);
    if (c.side === "kiri") assert.ok(b.cx + b.w / 2 <= L.text.x - 29.9, "tidak menabrak teks " + tag);
  }
}
{ const L = B.layoutFor("tegak", "kanan"), p = L.phones[0], b = B.hlBox(L, p, 1080, 2340, menu), sw = p.w - 40;
  assert.ok(Math.abs(b.w - sw * B.HL_SCALE) < 1e-6, "menu selebar layar diperbesar " + B.HL_SCALE + "x");
  assert.ok(b.cx < p.x + p.w / 2, "digeser ke arah teks (kiri)");
  assert.ok(Math.abs(b.cy - (p.y + 20 + (0.34 * 2340) * (sw / 1080))) < 1e-6, "tinggi mengikuti letak menu di layar");
  const bl = B.hlBox(B.layoutFor("tegak", "kiri"), B.layoutFor("tegak", "kiri").phones[0], 1080, 2340, menu);
  assert.ok(bl.cx > B.layoutFor("tegak", "kiri").phones[0].x + p.w / 2, "versi kiri: digeser ke kanan"); }
fcx = fakeCtx(); B.draw(fcx, { id: "dua", side: "kanan", theme: "gelap", logo: logoImg, shots: [shot, shot], hl: { shot: 1, r: menu }, tag: "", title: "Judul", desc: "" });
let crop = fcx.log.filter((l) => l[0] === "drawImage" && l[1] === shot && l.length === 10);
assert.equal(crop.length, 3, "2 layar + 1 sorotan"); assert.deepEqual(crop[2].slice(2, 6), [0, 0.3 * 2340, 1080, 0.08 * 2340], "potongan sesuai area");
assert.equal(fcx.log.filter((l) => l[0] === "arc").length, 0, "susunan biasa tanpa bayangan lantai");
fcx = fakeCtx(); B.draw(fcx, { id: "melayang", side: "kanan", theme: "terang", logo: logoImg, shots: [shot, shot], title: "Judul" });
assert.equal(fcx.log.filter((l) => l[0] === "arc").length, 2, "HP melayang: bayangan lantai per HP");
// geser sorotan manual: ikut d, tetap di dalam banner, d hasil = geseran yang dipakai
{ const L = B.layoutFor("dua", "kanan"), base = B.hlBox(L, L.phones[1], 1080, 2340, menu);
  const r0 = B.draw(fakeCtx(), { id: "dua", side: "kanan", theme: "terang", shots: [shot, shot], hl: { shot: 1, r: menu }, title: "J" }).hl;
  assert.equal(r0.cx, base.cx); assert.deepEqual(r0.d, [0, 0]);
  const r1 = B.draw(fakeCtx(), { id: "dua", side: "kanan", theme: "terang", shots: [shot, shot], hl: { shot: 1, r: menu, d: [-30, 50] }, title: "J" }).hl;
  assert.ok(Math.abs(r1.cx - (base.cx - 30)) < 1e-9 && Math.abs(r1.cy - (base.cy + 50)) < 1e-9, "digeser kiri 30, bawah 50");
  const far = B.moveHl(base, [-9999, 9999]);
  assert.ok(Math.abs(far.cx - (40 + base.w / 2)) < 1e-9 && Math.abs(far.cy - (1080 - 40 - base.h / 2)) < 1e-9, "mentok di tepi banner");
  assert.deepEqual(far.d, [far.cx - base.cx, far.cy - base.cy]); }
fcx = fakeCtx(); B.draw(fcx, { id: "tegak", side: "kanan", theme: "terang", logo: logoImg, shots: [null], hl: { shot: 0, r: menu }, title: "Judul" });
assert.ok(!fcx.log.some((l) => l[0] === "drawImage" && l[1] === shot), "tanpa screenshot: tanpa sorotan");
fcx = fakeCtx(); B.draw(fcx, { id: "tegak", side: "kanan", theme: "terang", logo: logoImg, shots: [shot], hl: { shot: 2, r: menu }, title: "Judul" });
assert.equal(fcx.log.filter((l) => l[0] === "drawImage" && l[1] === shot).length, 1, "HP ke-3 tidak ada di susunan 1 HP: tanpa sorotan");

// kontrol banner di tab What's New
for (const id of ["wbN", "wbLay", "wbTheme", "wbTag", "wbTitle", "wbDesc", "wbShots", "wbFill", "wbCanvas", "wbWarn", "wbDl", "wbHl", "wbHlPick"]) assert.ok(page.includes(`id="${id}"`), id);
assert.ok(page.includes('import("/banner.js")'));
assert.ok(/fonts\.googleapis\.com\/css2\?family=Inter/.test(page));
assert.ok(page.includes('"cs_wnb"'));

// "Ambil dari hasil What's New" tidak memotong teks diam-diam: teks panjang masuk utuh, lalu badge & overflow yang menandai
{
  const src = page.match(/function wbFromWn\(force\) \{[\s\S]*?\n  \}\n/)[0];
  const el = { wbTitle: { value: "", maxLength: 40 }, wbDesc: { value: "lama", maxLength: 150 } };
  const fill = new Function("$", "wnVal", "wbSave", "wbDraw", src + "return wbFromWn")((id) => el[id], (k) => ({ title: "Auto-invest: investasi rutin otomatis tiap bulan", short: "baru" })[k], () => {}, () => {});
  fill(false);
  assert.equal(el.wbTitle.value, "Auto-invest: investasi rutin otomatis tiap bulan", "judul 48 huruf tidak dipotong");
  assert.equal(el.wbDesc.value, "lama", "kolom yang sudah terisi tidak ditimpa");
  fill(true);
  assert.equal(el.wbDesc.value, "baru");
}
assert.ok(page.includes("Font Inter gagal dimuat; muat ulang halaman untuk mengunduh"), "pesan font menyebut muat ulang");

/* ---------- office.js ---------- */
{
  const O = await import("./assets/office.js");
  const DOC = `<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Adver</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">stisement &amp; Co</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Termyn</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>I</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>`;
  assert.deepEqual(O.docxParagraphs(DOC), [{ i: 0, text: "Adverstisement & Co", inTable: false }, { i: 1, text: "Termyn\tI", inTable: true }]);
  const f = O.makeDocx([{ t: "h1", runs: [{ text: "Judul & <x>", b: true }] }, { t: "p", runs: [{ text: "Jakarta", b: true }, { text: " – isi", i: true }] }], {});
  assert.ok(f["[Content_Types].xml"] && f["word/document.xml"] && f["word/styles.xml"]);
  assert.match(f["word/document.xml"], /Judul &amp; &lt;x&gt;/);
  assert.match(f["word/document.xml"], /<w:b\/>[\s\S]*Jakarta/);
  assert.deepEqual(O.docxParagraphs(f["word/document.xml"]).map((p) => p.text), ["Judul & <x>", "Jakarta – isi"]);
  const fl = O.makeDocx([{ t: "p", runs: [{ text: "x" }] }], { logo: { data: new Uint8Array([137, 80]), w: 200, h: 60 } });
  assert.ok(fl["word/media/logo.png"] && /header1\.xml/.test(fl["word/_rels/document.xml.rels"]));
  assert.deepEqual(O.docxParagraphs('<w:body><w:p w:rsidR="1"/><w:p><w:r><w:t>A</w:t></w:r></w:p></w:body>'), [{ i: 0, text: "", inTable: false }, { i: 1, text: "A", inTable: false }]);
  assert.equal(O.docxParagraphs('<w:body><w:p><w:r><w:t>a</w:t><w:br w:type="page"/><w:t>b</w:t></w:r></w:p></w:body>')[0].text, "a\nb");
  assert.match(O.makeDocx([{ t: "li", runs: [{ text: "poin" }] }], {})["word/document.xml"], /• <\/w:t>[\s\S]*poin/);
  const fj = O.makeDocx([{ t: "img", img: { data: new Uint8Array([1]), w: 10, h: 10, ext: "jpg" } }], {});
  assert.ok(fj["word/media/image1.jpeg"] && !/undefined/.test(fj["[Content_Types].xml"]));
  const T = { track: true, author: "Copy Studio", date: "2026-11-24T10:00:00Z" };
  const r1 = O.applyDocx(DOC, [{ id: "a", p: 0, from: "Adverstisement", to: "Advertisement" }, { id: "b", p: 1, from: "Termyn", to: "Termin" }, { id: "c", p: 0, from: "tidak ada", to: "x" }], T);
  assert.deepEqual([r1.applied, r1.failed], [["a", "b"], ["c"]]);
  assert.match(r1.xml, /<w:del [^>]*w:author="Copy Studio"[^>]*>[\s\S]*<w:delText[^>]*>Adver<\/w:delText>/);
  assert.match(r1.xml, /<w:ins [^>]*w:date="2026-11-24T10:00:00Z"[^>]*>[\s\S]*Advertisement/);
  assert.match(r1.xml, /<w:t xml:space="preserve"> &amp; Co<\/w:t>/, "sisa run tebal tetap, & tetap di-escape");
  const clean = O.applyDocx(DOC, [{ id: "a", p: 0, from: "Adverstisement", to: "Advertisement & <b>" }], { ...T, track: false });
  assert.equal(O.docxParagraphs(clean.xml)[0].text, "Advertisement & <b> & Co");
  assert.doesNotMatch(clean.xml, /w:del|w:ins/);
  assert.equal(O.applyDocx(DOC, [], T).xml, DOC);
  assert.equal(O.hasLangMarkers(DOC), false);
  const en = O.insertEnglish(DOC, new Map([[0, "Advertisement & Co"], [1, "Term\tI"]]), T);
  assert.deepEqual(O.docxParagraphs(en).map((p) => p.text), ["ENGLISH", "Advertisement & Co", "Term\tI", "INDONESIA", "Adverstisement & Co", "Termyn\tI"]);
  assert.ok(O.hasLangMarkers(en));
  assert.ok(/<w:sectPr\/><\/w:body>/.test(en), "sectPr tetap di akhir");
  // tab/drawing di dalam run, beberapa edit satu paragraf, id unik
  const D2 = '<w:body><w:p><w:pPr><w:pStyle w:val="X"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Foo bar</w:t><w:tab/><w:t>baz Foo</w:t><w:drawing/></w:r></w:p><w:p><w:r><w:t>sama</w:t></w:r></w:p></w:body>';
  const r2 = O.applyDocx(D2, [{ id: 1, p: 0, from: "bar\tbaz", to: "BB" }, { id: 2, p: 0, from: "Foo", to: "Fu" }, { id: 3, p: 0, from: "Foo", to: "Fi" }], T);
  assert.deepEqual([r2.applied, r2.failed], [[1, 2, 3], []]);
  assert.ok(r2.xml.includes("<w:drawing/>") && r2.xml.startsWith('<w:body><w:p><w:pPr><w:pStyle w:val="X"/></w:pPr>'));
  assert.ok(r2.xml.endsWith("<w:p><w:r><w:t>sama</w:t></w:r></w:p></w:body>"), "paragraf lain tidak berubah");
  const ids = [...r2.xml.matchAll(/w:id="(\d+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length); assert.equal(Math.min(...ids), 9001);
  const D3 = '<w:body><w:p><w:pPr><w:rPr><w:ins w:id="1" w:author="a" w:date="d"/></w:rPr></w:pPr><w:r><w:t>Termyn</w:t></w:r><w:ins w:id="2" w:author="a" w:date="d"><w:r><w:t>x</w:t></w:r></w:ins></w:p></w:body>';
  const r3 = O.applyDocx(D3, [{ id: 1, p: 0, from: "Termyn", to: "Termin" }], T);
  assert.deepEqual(r3.applied, [1]); assert.match(r3.xml, /<w:ins w:id="1"[^>]*\/><\/w:rPr><\/w:pPr>/);
  assert.match(O.applyDocx(D3.replace('w:id="1"', 'w:id="9001"'), [{ id: 1, p: 0, from: "Termyn", to: "Termin" }], T).xml, /w:id="9002"/, "id baru di atas id yang ada");
  const D4 = '<w:body><w:p w14:paraId="1A"><w:bookmarkStart w:id="0" w:name="x"/><w:r><w:drawing><wp:docPr id="5" name="p"/></w:drawing></w:r><w:bookmarkEnd w:id="0"/></w:p><w:sectPr/></w:body>';
  const e4 = O.insertEnglish(D4, new Map(), T);
  const cnt = (re) => (e4.match(re) || []).length;
  assert.equal(cnt(/w14:paraId="1A"/g), 1); assert.equal(cnt(/w:name="x"/g), 1);
  const docIds = [...e4.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => m[1]); assert.equal(new Set(docIds).size, 2);
  const D5 = '<w:body><w:p><w:commentRangeStart w:id="3"/><w:r><w:rPr><w:b/><w:rPrChange w:id="7" w:author="a" w:date="d"><w:rPr/></w:rPrChange></w:rPr><w:t>Isi</w:t></w:r><w:commentRangeEnd w:id="3"/><w:r><w:commentReference w:id="3"/></w:r></w:p><w:sectPr/></w:body>';
  const e5 = O.insertEnglish(D5, new Map(), T);
  const cn = (re) => (e5.match(re) || []).length;
  assert.equal(cn(/w:id="7"/g), 1); assert.equal(cn(/w:id="3"/g), 3, "komentar hanya di asli"); assert.equal(cn(/commentRangeStart/g), 1); assert.equal(cn(/commentReference/g), 1);
  const wids = [...e4.matchAll(/<w:(?:ins|del|bookmarkStart) [^>]*w:id="(\d+)"/g)].map((m) => m[1]); assert.equal(new Set(wids).size, wids.length);
  assert.equal(O.docxParagraphs(O.applyDocx(D2, [{ id: 1, p: 0, from: "bar\tbaz", to: "B\nB" }, { id: 2, p: 0, from: "Foo", to: "Fu" }], { ...T, track: false }).xml)[0].text, "Fu B\nB Foo");
  /* Excel */
  const X = {
    "[Content_Types].xml": `<Types xmlns="t"><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "xl/workbook.xml": `<workbook><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst><si><t>Adverstisement</t></si><si><t>Meta &amp; Google</t></si></sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="s" s="3"><v>0</v></c><c r="B1" t="s"><v>0</v></c><c r="C1"><v>45000000</v></c><c r="D1"><f>C1*2</f><v>90000000</v></c><c r="E1" t="s"><v>1</v></c></row></sheetData></worksheet>`,
  };
  assert.deepEqual(O.xlsxCells(X).map((c) => [c.sheet, c.ref, c.text]), [["Budget", "A1", "Adverstisement"], ["Budget", "B1", "Adverstisement"], ["Budget", "E1", "Meta & Google"]]);
  const xr = O.applyXlsx(X, [{ id: 1, path: "xl/worksheets/sheet1.xml", ref: "A1", from: "Adverstisement", to: "Advertisement & Co" }]);
  const s1 = xr.files["xl/worksheets/sheet1.xml"];
  assert.match(s1, /<c r="A1" t="inlineStr" s="3"><is><t xml:space="preserve">Advertisement &amp; Co<\/t><\/is><\/c>/);
  assert.match(s1, /<c r="B1" t="s"><v>0<\/v><\/c>/, "sel lain yang memakai shared string sama tidak berubah");
  assert.match(s1, /<f>C1\*2<\/f>/);
  assert.equal(xr.files["xl/sharedStrings.xml"], X["xl/sharedStrings.xml"]);
  assert.deepEqual([xr.applied, xr.failed], [[1], []]);
  assert.deepEqual(O.applyXlsx(X, [{ id: 2, path: "xl/worksheets/sheet1.xml", ref: "C1", from: "x", to: "y" }, { id: 3, path: "xl/worksheets/sheet1.xml", ref: "A1", from: "salah", to: "y" }]).failed, [2, 3], "angka dan teks tak cocok gagal");
  const xs = O.addSheet(xr.files, "Catatan Review", [["Sel", "Sebelum", "Sesudah"], ["Budget!A1", "Adverstisement", "Advertisement & Co"]]);
  assert.deepEqual(O.xlsxCells(xs).filter((c) => c.sheet === "Catatan Review").map((c) => c.text), ["Sel", "Sebelum", "Sesudah", "Budget!A1", "Adverstisement", "Advertisement & Co"]);
  assert.match(xs["[Content_Types].xml"], /sheet2\.xml/);
  assert.match(xs["xl/workbook.xml"], /<sheet name="Catatan Review" sheetId="2" r:id="rId2"\/>/);
  assert.match(xs["xl/_rels/workbook.xml.rels"], /Id="rId2"[^>]*Target="worksheets\/sheet2\.xml"/);
  const xe = O.copySheetTranslated(X, "xl/worksheets/sheet1.xml", "EN", new Map([["E1", "Meta and Google"]]));
  assert.ok(O.xlsxCells(xe).some((c) => c.sheet === "EN" && c.ref === "E1" && c.text === "Meta and Google"));
  assert.match(Object.entries(xe).find(([k, v]) => /sheet2/.test(k))[1], /<f>C1\*2<\/f>/, "rumus ikut tersalin");
  // kasus sulit: rich text, rPh, sel kosong, urutan atribut, nama & dan duplikat
  const Y = structuredClone(X);
  Y["xl/workbook.xml"] = `<workbook><sheets><sheet r:id="rId1" sheetId="1" name="A &amp; B"/></sheets></workbook>`;
  Y["xl/sharedStrings.xml"] = `<sst><si><r><t>Adver</t></r><r><rPr><b/></rPr><t xml:space="preserve">tisement </t></r><rPh sb="0" eb="1"><t>ふりがな</t></rPh><r><t>Co</t></r></si></sst>`;
  Y["xl/worksheets/sheet1.xml"] = `<worksheet><sheetData><row r="1" xr:uid="{AAA}"><c r="A1" s="2"/><c s="4" t="s" r="B1"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Hai</t></is></c></row></sheetData><pageSetup orientation="landscape" r:id="rId1"/><oleObjects><oleObject r:id="rId5"/></oleObjects><controls><control r:id="rId6"/></controls><drawing r:id="rId9"/><tableParts count="1"><tablePart r:id="rId8"/></tableParts><extLst><ext uri="x"><x14:id xmlns:x14="y">{GUID}</x14:id></ext></extLst></worksheet>`;
  Y["xl/worksheets/_rels/sheet1.xml.rels"] = `<Relationships><Relationship Id="rId9" Type="drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
  assert.deepEqual(O.xlsxCells(Y).map((c) => [c.sheet, c.ref, c.text]), [["A & B", "B1", "Advertisement Co"], ["A & B", "C1", "Hai"]]);
  const yr = O.applyXlsx(Y, [{ id: 1, path: "xl/worksheets/sheet1.xml", ref: "B1", from: "Advertisement Co", to: "Z" }]);
  assert.match(yr.files["xl/worksheets/sheet1.xml"], /<c s="4" t="inlineStr" r="B1"><is><t xml:space="preserve">Z<\/t><\/is><\/c>/);
  assert.match(yr.files["xl/worksheets/sheet1.xml"], /<c r="A1" s="2"\/>/);
  const yc = O.copySheetTranslated(Y, "xl/worksheets/sheet1.xml", "A & B", new Map([["C1", "Hello"]]));
  const copy = yc["xl/worksheets/sheet2.xml"];
  assert.doesNotMatch(copy, /<drawing|<tableParts|<legacyDrawing/);
  assert.doesNotMatch(copy, /r:id=|<oleObjects|<controls|<extLst|xr:uid/, "tidak ada r:id menggantung, GUID, extLst");
  assert.match(copy, /<pageSetup orientation="landscape"\/>/);
  assert.equal(O.applyXlsx(Y, [{ id: 1, path: "xl/worksheets/sheet1.xml", ref: "B1", from: "tisement", to: "$&\u0001X" }]).files["xl/worksheets/sheet1.xml"].match(/<t xml:space="preserve">([^<]*)</)[1], "Adver$&amp;X Co", "substring, tanpa pola $, karakter kontrol dibuang");
  assert.equal(O.xlsxCells({ ...Y, "xl/sharedStrings.xml": "<sst><si><t xml:space=\"preserve\"/><t>Q</t></si></sst>" })[0].text, "Q");
  assert.equal(O.xlsxCells(O.addSheet(X, "'Hi'", [["a"]])).at(-1).sheet, "Hi");
  assert.equal(O.xlsxCells(O.addSheet(X, " 'a\u0001b' ", [["a"]])).at(-1).sheet, "ab");
  assert.equal(O.xlsxCells(O.addSheet(X, "x".repeat(30) + "'y", [["a"]])).at(-1).sheet, "x".repeat(30));
  const Z = { ...X, "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData><mc:AlternateContent><mc:Choice><controls><control r:id="rId9"/></controls></mc:Choice></mc:AlternateContent><oleObjects/><controls/><extLst/><pageMargins left="1"/></worksheet>` };
  const zc = O.copySheetTranslated(Z, "xl/worksheets/sheet1.xml", "Z", new Map())["xl/worksheets/sheet2.xml"];
  assert.doesNotMatch(zc, /AlternateContent|r:id=|<oleObjects|<controls|<extLst/);
  assert.match(zc, /<pageMargins left="1"\/><\/worksheet>/);
  assert.equal(yc["xl/worksheets/_rels/sheet2.xml.rels"], undefined, "rel gambar/tabel tidak disalin");
  assert.match(yc["xl/workbook.xml"], /name="A &amp; B 2"/, "nama unik");
  assert.match(yc["xl/workbook.xml"], /sheetId="2"/);
  assert.ok(O.xlsxCells(yc).some((c) => c.sheet === "A & B 2" && c.ref === "C1" && c.text === "Hello"));
  assert.equal(O.addSheet(X, "x".repeat(40), [["a"]])["xl/workbook.xml"].match(/name="(x+)"/)[1].length, 31);
  assert.equal(O.xlsxCells(O.addSheet(X, "[Bad]:Name/?", [["a"]])).at(-1).sheet, "Bad Name", "karakter terlarang dibuang");
}

/* ---------- Copywriter: artikel berita ---------- */
{
const CW = await import("./assets/cw.js");
const IGS = "Indonesia dan Uni Eropa resmi menandatangani IEU-CEPA pada 21 November 2026. Sebanyak 90,4% pos tarif mendapat bea masuk 0% pada 2027.\nDimuat oleh Tim Investment Growth Specialist KISI.";
assert.deepEqual(CW.numbers("90,4% pos, 0% pada 2027"), ["90,4%", "0%", "2027"]);
assert.deepEqual(CW.missingNumbers(IGS, IGS.replace("90,4%", "90%")), ["90,4%"]);
assert.deepEqual(CW.missingNumbers(IGS, IGS), []);
const ae = CW.applyEdits("Termyn I dan Termyn II", [{ from: "Termyn", to: "Termin" }, { from: "tidak ada", to: "x" }]);
assert.equal(ae.text, "Termin I dan Termyn II"); assert.equal(ae.skipped.length, 1);
const art = CW.buildArticle({ body: IGS, title: "Deal Indonesia-Eropa, Peluang Baru Buat Sektor Ini!", closing: "Ikuti KISI Challenge.", close: "promo", tags: ["IEU-CEPA", "kisi"] });
assert.ok(art.text.startsWith("Behind The Candle – Indonesia"));
assert.equal(art.text.split("Dimuat oleh Tim Investment Growth Specialist KISI.").length, 2, "byline tidak dobel");
assert.ok(art.text.indexOf("Ikuti KISI Challenge.") < art.text.indexOf("Dimuat oleh"));
assert.ok(art.text.includes(CW.PRIZE_DISC) && art.text.endsWith(CW.DISC_ARTICLE));
assert.deepEqual(art.tags, ["IEU-CEPA", "kisi", "iKISI", "Behind The Candle"]);
assert.deepEqual(CW.extraNumbers(IGS, IGS + " Hadiah Rp25 juta"), ["25"]);
assert.deepEqual(CW.extraNumbers(IGS, IGS), []);
assert.ok(!CW.buildArticle({ body: IGS, closing: "Ikuti KISI Challenge.", close: "none" }).text.includes("Ikuti KISI"));
assert.ok(CW.buildArticle({ body: "Behind The Candle - Isi", close: "none" }).text.startsWith("Behind The Candle - Isi"));
assert.equal(prompt("cw_article", { text: " " }), null);
const pa = prompt("cw_article", { text: IGS, title: "Deal Indonesia-Eropa", close: "brand" }).user;
assert.match(pa, /Deal Indonesia-Eropa/); assert.match(pa, /Jangan mengarang angka/); assert.match(pa, /penutup/i);
assert.doesNotMatch(prompt("cw_article", { text: IGS, close: "none" }).user, /paragraf penutup/i);
const ra = parse("cw_article", '{"titles":["A","B"],"edits":[{"from":"x","to":"y","why":"typo"},{"from":"z","to":"z"},{"to":"q"}],"tags":["t1"],"closing":""}');
assert.deepEqual(ra.edits, [{ from: "x", to: "y", why: "typo" }]);
const nf = CW.numberFormatFindings([{ loc: "p3", text: "- 277,500,000 Termyn I" }, { loc: "p4", text: "188.700.000 dan 377.400.000 naik 90,4%" }]);
assert.deepEqual(nf.map((x) => [x.loc, x.from, x.to]), [["p3", "277,500,000", "277.500.000"]]);
assert.equal(CW.parseIdr("2.543.204.033"), 2543204033);
assert.equal(CW.parseIdr("2,543,204,033"), 2543204033);
assert.equal(CW.parseIdr("abc"), null);
const rows = [["Prize", 2363404000], ["Uni", 34333333], ["Meta", 45000000], ["Google", 45000000], ["DBL", 55466700], ["IDX", 0], ["Grand Total", 2543204033]].map(([label, value], i) => ({ loc: "r" + i, label, value }));
assert.deepEqual(CW.totalFindings(rows), []);
rows[6].value = 2543204000;
assert.match(CW.totalFindings(rows)[0].why, /2\.543\.204\.033/);
assert.deepEqual(CW.totalFindings([{ loc: "a", label: "A", value: 5 }, { loc: "b", label: "Total", value: 5 }, { loc: "c", label: "B", value: 7 }, { loc: "d", label: "Total", value: 7 }]), []);
assert.deepEqual(CW.langFindings([{ loc: "e1", text: "run from 1 October to 30 November 2026" }], [{ loc: "i1", text: "berlangsung 1 Oktober–30 November 2026" }]), []);
assert.deepEqual(CW.langFindings([{ loc: "e1", text: "Total 555,000,000" }], [{ loc: "i1", text: "Total 555.000.000" }]), []);
assert.equal(CW.langFindings([{ loc: "e1", text: "Total 555.000.000" }], [{ loc: "i1", text: "Total 550.000.000" }])[0].loc, "i1");
assert.deepEqual(CW.totalFindings([{ loc: "a", label: "A", value: null }, { loc: "b", label: "B", value: 5 }, { loc: "c", label: "Total", value: NaN }, { loc: "d", label: "Total", value: 5 }]), []);
const sub = [["A", 10], ["B", 20], ["Subtotal", 30], ["C", 5], ["Sub-total", 5], ["Grand Total", 35]].map(([label, value], i) => ({ loc: "s" + i, label, value }));
assert.deepEqual(CW.totalFindings(sub), []);
sub[5].value = 70;
const sf = CW.totalFindings(sub); assert.equal(sf.length, 1); assert.match(sf[0].why, /Jumlah baris = 35$/);
assert.equal(CW.parseIdr("Rp1.000.000"), 1000000); assert.equal(CW.parseIdr("Rp 1.000"), 1000);
}

/* ---------- Copywriter: cek wording file ---------- */
{
assert.equal(prompt("cw_review", { units: [] }), null);
assert.match(prompt("cw_review", { units: [{ id: "p0", text: "Detailed of Budget" }] }).user, /p0[\s\S]*Detailed of Budget/);
assert.deepEqual(parse("cw_review", '{"findings":[{"id":"p0","from":"Detailed of Budget","to":"Budget Details","kind":"kalimat","why":"x"},{"id":"p1","from":"a","to":"a"}]}').findings.length, 1);
assert.match(prompt("cw_translate", { units: [{ id: "p0", text: "Tujuan" }] }).user, /iKISI[\s\S]*KOINS/);
assert.deepEqual(parse("cw_translate", '{"items":[{"id":"p0","en":"Purpose"},{"id":"","en":"x"}]}').items, [{ id: "p0", en: "Purpose" }]);
const CW = await import("./assets/cw.js");
const U = Array.from({ length: 5 }, (_, i) => ({ id: "p" + i, text: "x".repeat(4000) }));
assert.deepEqual(CW.chunks(U).map((c) => c.length), [2, 2, 1]);
assert.equal(CW.estimateCalls(U, true), 6);
assert.equal(CW.chunks([{ id: "p0", text: "y".repeat(20000) }]).length, 1, "unit lebih panjang dari batas tetap satu potongan sendiri");
const D = '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Judul</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Meta</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Rp 1.000</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Total</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2.000</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
assert.deepEqual(CW.docxRows(D), [{ loc: "p1", label: "Meta", value: 1000 }, { loc: "p3", label: "Total", value: 2000 }]);
assert.equal(CW.totalFindings(CW.docxRows(D)).length, 1);
const X = { "xl/workbook.xml": '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>', "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Meta</t></is></c><c r="B1"><v>5</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Total</t></is></c><c r="B2"><f>SUM(B1)</f><v>5</v></c></row></sheetData></worksheet>' };
assert.deepEqual(CW.xlsxRows(X), [{ loc: "xl/worksheets/sheet1.xml!B1", label: "Meta", value: 5 }, { loc: "xl/worksheets/sheet1.xml!B2", label: "Total", value: 5 }]);
}

/* ---------- Brief KISI Challenge ---------- */
{
const CW = await import("./assets/cw.js");
const sd = CW.snsDisclaimer("Kuliah Saham", "https://drive.example/x", "single");
assert.ok(sd.startsWith("Tambahin tulisan kecil:\nDisclaimer:\n● Hadiah adalah bentuk apresiasi"));
assert.match(sd, /● Kuliah Saham tidak terafiliasi sebagai pegawai PT KISI dan tidak memiliki izin dari Otoritas Jasa Keuangan \(OJK\)\./);
assert.ok(sd.endsWith("Link aset: https://drive.example/x"));
assert.ok(CW.snsDisclaimer("Sahamology", "", "carousel").startsWith("Tambahin tulisan kecil di setiap slide:"));
assert.doesNotMatch(CW.snsDisclaimer("Sahamology", "", "carousel"), /Link aset/);
const BR = "KISI Challenge: Tantangan Baru. Periode 1–31 Januari 2027. Hadiah utama mobil listrik. Partner: Komunitas A, Komunitas B. Link aset: https://drive.example/a";
assert.equal(prompt("cw_brief", { text: " ", type: "media" }), null);
const pb2 = prompt("cw_brief", { text: BR, type: "sns", partners: [], format: "carousel" }).user;
assert.match(pb2, /Tantangan Baru/); assert.match(pb2, /perlu dilengkapi/); assert.match(pb2, /Jangan mengarang/);
const pb3 = prompt("cw_brief", { text: BR, type: "sns", partners: ["Sahamology", "Kuliah Saham"], format: "carousel" }).user;
assert.match(pb3, /Sahamology[\s\S]*Kuliah Saham/); assert.match(pb3, /berbeda/);
assert.match(prompt("cw_brief", { text: BR, type: "media" }).user, /350 kata/);
assert.equal(parse("cw_brief", '{"asset_url":"https://drive.example/a","sns":[]}').asset_url, "https://drive.example/a");
assert.ok(!/tidak terafiliasi/.test(CW.snsDisclaimer("", "", "single")));
assert.match(CW.briefText({ sns: [{ partner: "", frames: [{ label: "Slide 1", lines: ["x"] }] }], asset_url: "" }, { format: "carousel", platform: "IG" }), /^IG Carousel/);
const cwx = await (await call("/api/cw", { cookie: user })).json();
assert.equal(cwx.program, undefined); assert.equal(cwx.pr.contact, "B");
for (const f of ["worker.js", "assets/cw.js", "page.html"]) assert.doesNotMatch(fs.readFileSync(new URL("./" + f, import.meta.url), "utf8"), /Beyond Tomorrow|BYD Denza|Sahamology|Kuliah Saham|cleanProgram/, f);
for (const id of ["cwFile", "cwPaste", "cwOpts", "cwGo", "cwSettings"]) assert.ok(page.includes(`id="${id}"`), id);
for (const g of ["article", "review", "pr", "brief"]) assert.ok(page.includes(`data-goal="${g}"`), g);
assert.ok(!page.includes('id="cwKind"') && !page.includes('id="prEvent"') && !page.includes('id="bfProg"'), "formulir lama hilang");
assert.equal(CW.igsTitle("Judul pendek\nIsi naskah"), "Judul pendek");
assert.equal(CW.igsTitle("\n  \nJudul  \nIsi"), "Judul");
assert.equal(CW.igsTitle("x".repeat(121) + "\nIsi"), "");
assert.deepEqual(CW.splitTitle("Judul"+"\n"+"  Isi 5%"), { title: "Judul", body: "Isi 5%" });
assert.deepEqual(CW.splitTitle("x".repeat(121) + "\nIsi"), { title: "", body: "x".repeat(121) + "\nIsi" });
const prL = prompt("cw_pr", { hl: { free: "a".repeat(10000) + "UJUNG" } }).user;
assert.match(prL, /UJUNG/); assert.match(prL, /perlu dilengkapi: kota[/]tanggal/); assert.match(prL, /kata demi kata dari bahan diberi ai=false/);
// 2 highlight saja tetap jadi press release lengkap: kutipan wajib ada, data kosong jadi penanda [ … ], bukan dikarang
assert.match(prL, /walaupun highlight di bawah hanya 1–2 poin/); assert.match(prL, /Kutipan narasumber WAJIB ada dan WAJIB dari perwakilan KISI/); assert.match(prL, /\[nama narasumber\]/); assert.match(prL, /Jangan mengarang/);
assert.doesNotMatch(prompt("cw_pr", { hl: { free: "x", city: "Jakarta", date: "1 Mei" } }).user, /kota[/]tanggal/);
assert.match(prompt("cw_article", { text: "x", close: "promo", promo: { name: "", url: "" } }).user, /perlu dilengkapi: nama program/);
assert.doesNotMatch(prompt("cw_article", { text: "x", close: "promo", promo: { name: "Kompetisi A" } }).user, /nama program/);
assert.equal(CW.inputError("article", "", "  "), "Unggah file atau tempel teks dulu.");
assert.equal(CW.inputError("article", "a.xlsx", ""), "File Excel/PDF hanya untuk Cek wording.");
assert.equal(CW.inputError("review", "a.pdf", ""), "");
assert.equal(CW.inputError("review", "", "teks"), "Cek wording perlu file Word, Excel, atau PDF.");
assert.equal(CW.inputError("pr", "a.txt", ""), "Pilih file .docx, .xlsx, atau .pdf.");
assert.equal(CW.inputError("brief", "a.docx", ""), "");
const rb = parse("cw_brief", '{"sns":[{"partner":"Sahamology","frames":[{"label":"Slide 1","lines":["KOMPETISI DIMULAI!",""]}]}]}');
assert.deepEqual(rb.sns[0].frames[0].lines, ["KOMPETISI DIMULAI!"]);
assert.match(CW.briefText({ sns: [{ partner: "P", frames: [{ label: "Slide 1:", lines: ["x"] }] }] }, { format: "carousel", platform: "IG" }), /Slide 1:\nx/);
assert.doesNotMatch(CW.briefText({ sns: [{ partner: "P", frames: [{ label: "Slide 1:", lines: ["x"] }] }] }, { format: "carousel", platform: "IG" }), /::/);
assert.match(CW.briefText(rb, { format: "carousel", platform: "IG", date: "1 September" }), /^Sahamology: IG Carousel[\s\S]*Posting tanggal 1 September[\s\S]*Slide 1:\nKOMPETISI DIMULAI![\s\S]*● Sahamology tidak terafiliasi/);
assert.equal(prompt("cw_pr", { hl: {} }), null);
// highlight dikembangkan jadi press release utuh, fakta tetap dari bahan; batas jawaban cukup untuk ±600 kata dalam format runs
{ const q = prompt("cw_pr", { hl: { free: "Edukasi pasar modal di Padang, 200 peserta UMKM" } });
  assert.match(q.user, /Kembangkan highlight/); assert.match(q.user, /600–900 kata/); assert.match(q.user, /Jangan mengarang angka, nama/); assert.ok(q.max >= 7000); }
const pp = prompt("cw_pr", { hl: { event: "GI BEI Award 2026", city: "Jakarta", date: "23 November 2026", speaker: "Mr. Yang Seok Mo, Online Business Associate Director KISI" } }).user;
assert.match(pp, /Jakarta, 23 November 2026 – PT Korea Investment And Sekuritas Indonesia \(KISI\)/); assert.match(pp, /missing/); assert.match(pp, /Jangan mengarang/);
const rp = parse("cw_pr", '{"title":"KISI Raih Penghargaan","paras":[{"runs":[{"text":"Jakarta, 23 November 2026","b":true},{"text":" – isi"}]}],"quote":{"text":"Kami bangga.","speaker":"Mr. Yang Seok Mo","ai":true},"closing":["KISI berkomitmen."],"missing":["Jabatan Dedy Lasmono"]}');
const pbk = CW.prBlocks(rp, { about: "Para 1\n\nPara 2", contact: "" });
assert.deepEqual(pbk[0].runs[0], { text: "PRESS RELEASE", b: true, i: true });
assert.ok(pbk.some((b) => b.runs && b.runs[0].text === "Tentang PT Korea Investment And Sekuritas Indonesia (KISI)"));
assert.ok(!pbk.some((b) => b.runs && /Media Contact/.test(b.runs[0].text)), "kontak kosong -> tanpa Media Contact");
assert.ok(CW.prBlocks(rp, { about: "x", contact: "Nama\nTelp" }).some((b) => b.runs && /Media Contact/.test(b.runs[0].text)));
{ const nb = CW.prBlocks({ ...rp, title: "", quote: { text: "Q", speaker: "", ai: true } }, { about: "x", contact: "" }); assert.ok(!nb.some((b) => b.runs && b.runs.some((r) => /ujar/.test(r.text))), "tanpa narasumber -> tanpa ujar"); assert.ok(!nb.some((b) => b.runs && b.runs[0].b && !b.runs[0].i && b.runs[0].text === "")); assert.equal(nb[1].runs[0].text.startsWith("Jakarta"), true, "judul kosong dilewati"); }
assert.match(fs.readFileSync(new URL("../../README.md", import.meta.url), "utf8"), /Copywriter.*artikel.*cek wording.*press release.*brief KISI Challenge/i);
}

/* ---------- review akhir: textbox, angka, konsistensi ---------- */
{
  const O = await import("./assets/office.js"), CW = await import("./assets/cw.js");
  const bal = (x) => { const st = []; for (const m of x.matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) { if (m[3]) continue; if (!m[1]) st.push(m[2]); else if (st.pop() !== m[2]) return false; } return !st.length; };
  const TB = (t) => `<mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wps:txbx><w:txbxContent><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:txbxContent></wps:txbx></w:drawing></mc:Choice><mc:Fallback><w:pict><v:textbox><w:txbxContent><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:txbxContent></v:textbox></w:pict></mc:Fallback></mc:AlternateContent>`;
  const D = `<w:document><w:body><w:p><w:r><w:t>Cover </w:t></w:r><w:r>${TB("Adverstisement plan")}</w:r></w:p><w:p><w:r><w:t>Next</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`;
  const T = { track: true, author: "x", date: "d" };
  assert.ok(bal(D));
  assert.equal(O.docxParagraphs(D).length, 2, "textbox bukan paragraf tersendiri");
  assert.equal(O.docxParagraphs(D)[0].text, "Cover ");
  for (const track of [true, false]) {
    const o = { ...T, track };
    const a = O.applyDocx(D, [{ id: "a", p: 0, from: "Cover", to: "Sampul" }, { id: "b", p: 1, from: "Next", to: "Nxt" }], o);
    assert.deepEqual(a.applied, ["a", "b"]); assert.ok(bal(a.xml), "applyDocx seimbang"); assert.ok(a.xml.includes(TB("Adverstisement plan")), "textbox utuh");
    const e = O.insertEnglish(D, new Map([[1, "EN"]]), o); assert.ok(bal(e), "insertEnglish tanpa terjemahan seimbang");
    assert.equal(O.docxParagraphs(e).length, 2 * 2 + 2, "jumlah paragraf = asli + salinan + 2 penanda");
    assert.ok(bal(O.insertEnglish(D, new Map([[0, "EN"], [1, "EN2"]]), o)));
  }
  assert.equal(CW.docxRows(`<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r>${TB("x")}</w:p></w:tc><w:tc><w:p><w:r><w:t>10</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`).length, 1);
  // sectPr paragraf tidak digandakan di salinan
  const SP = `<w:document><w:body><w:p><w:pPr><w:sectPr><w:pgSz w:w="1"/></w:sectPr></w:pPr><w:r><w:t>A</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`;
  assert.equal(O.insertEnglish(SP, new Map(), { track: false, author: "x", date: "d" }).match(/<w:sectPr>/g).length, 1);
  assert.equal(O.insertEnglish(SP, new Map([[0, "EN"]]), { track: false, author: "x", date: "d" }).match(/<w:sectPr>/g).length, 1);
  // angka
  assert.deepEqual(CW.missingNumbers("naik 90,4 % ini", "naik 90,4% ini"), []); assert.deepEqual(CW.extraNumbers("naik 90,4 % ini", "naik 90,4% ini"), []);
  assert.ok(CW.sameNumbers("naik 90,4 %", "up 90.4%")); assert.ok(!CW.sameNumbers("naik 90,4%", "naik 94%")); assert.ok(CW.sameNumbers("tahun 2027", "year 2027"));
  assert.ok(!CW.sameNumbers("10 dan 10", "10"));
  const tf = CW.transFindings([{ id: "p0", text: "Naik 90,4%" }, { id: "p1", text: "Ada 5" }], new Map([["p0", "Up 94%"], ["p1", "There are 5"]]));
  assert.equal(tf.length, 1); assert.equal(tf[0].kind, "konsistensi"); assert.equal(tf[0].loc, "p0");
}

/* ---------- cek kepatuhan dokumen (Cek wording) ---------- */
// disclaimer resmi "bukan jaminan keuntungan" tidak boleh dianggap janji untung
assert.ok(!ids("Hadiah adalah bentuk apresiasi aktivitas transaksi, bukan jaminan keuntungan investasi.").includes("janji"));
assert.ok(ids("Ada jaminan keuntungan 10%").includes("janji"));
{ const CWd = await import("./assets/cw.js");
  const units = [{ id: "p0", text: "Hadiah utama BYD untuk trader saham terbaik. " + "x".repeat(220) }, { id: "p1", text: "S&K berlaku. Investasi mengandung risiko. Berizin dan diawasi OJK." }];
  const f = CWd.docCompliance(units, (t) => checkCopy(t).issues);
  assert.deepEqual(f.filter((x) => ["p0", "p1"].includes(x.loc)).map((x) => x.from.toLowerCase()), ["terbaik"], "per paragraf hanya kata terlarang");
  assert.equal(f.filter((x) => x.loc === "dokumen").length, 0, "disclaimer sekali di dokumen sudah cukup");
  assert.ok(CWd.docCompliance([{ id: "p0", text: "Menangkan hadiah saham. " + "x".repeat(220) }], (t) => checkCopy(t).issues).filter((x) => x.loc === "dokumen").length >= 2, "dokumen tanpa disclaimer tetap ditandai sekali"); }
console.log("semua cek lolos");
