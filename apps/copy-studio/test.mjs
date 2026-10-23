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
const { default: worker, cleanStyle, prompt, parse, segments, DEFAULT_STYLE } = await import("./worker.js");

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

/* ---------- prompt & parse ---------- */
assert.equal(prompt("ab", { brief: "" }), null);
assert.match(prompt("ab", { brief: "reksa dana", type: "subject", n: 99 }).user, /8 variasi subject email/);
assert.match(prompt("reels", { topic: "Deposito vs RDPU", duration: 60 }).user, /60 detik/);
assert.match(prompt("reels", { topic: "x", duration: 7 }).user, /30 detik/, "durasi tidak sah -> 30");
assert.equal(prompt("nope", {}), null);
assert.deepEqual(parse("ab", 'oke ```json {"items":[{"text":"Halo","angle":"manfaat"},{"text":""}]} ```'), { items: [{ text: "Halo", angle: "manfaat" }] });
assert.deepEqual(parse("reels", '{"hashtags":["investasi","#Reksa Dana"],"scenes":[{"time":"0-3"}]}').hashtags, ["#investasi", "#ReksaDana"]);
assert.throws(() => parse("fix", "maaf"), /JSON/);
assert.deepEqual(segments({ segments: [{ start: 0, end: 2.5, text: " Halo " }, { start: 3, end: 4, text: "" }] }), [{ start: 0, end: 2.5, text: "Halo" }]);
assert.deepEqual(segments({ text: "Halo semua", transcription_info: { duration: 4 } }), [{ start: 0, end: 4, text: "Halo semua" }]);
assert.deepEqual(segments(null), []);
assert.deepEqual(cleanStyle({ guide: " g ", glossary: [{ bad: "A" }, { bad: "a", good: "dup" }, { bad: "" }, null] }), { guide: "g", glossary: [{ bad: "A", good: "", note: "" }] });

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

console.log("semua cek lolos");
