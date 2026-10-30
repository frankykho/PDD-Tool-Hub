// Cek Link & QR Studio: sinkron Tool Hub, pengalih publik & hitung klik, kirim klik ke Content Planner, buat link, hak akses, grafik.
// Jalankan: node apps/link-qr/test.mjs   (Node 22.15+). D1 ditiru dengan node:sqlite; Content Planner = worker aslinya.
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_ORG } from "../../shared/jobs.js";

registerHooks({
  load(url, ctx, next) {
    if (url.startsWith("file:") && url.endsWith(".html")) return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(fs.readFileSync(fileURLToPath(url), "utf8")) };
    return next(url, ctx);
  },
});
const { default: worker, BOT_UA, CODE_RE, KANAL, wibDay } = await import("./worker.js");
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
const SECRET = "s".repeat(40), HUB = "https://hub.acme.test", BASE = "https://go.acme.test", NOW = Date.parse("2026-10-30T03:00:00Z");
const PROFILE = JSON.stringify({ urls: { hub: HUB, go: BASE }, contact: { website: "https://kisi.test" } });
// Content Planner asli dengan D1 sendiri; panggilan dicatat
const plannerEnv = { SSO_SECRET: SECRET, DB: d1(), HUB_URL: HUB, PROFILE };
const plannerCalls = [];
const PLANNER = { fetch: async (u, init = {}) => { plannerCalls.push({ url: String(u), key: (init.headers || {})["x-hub-key"] }); return planner.fetch(new Request(u, init), plannerEnv, { waitUntil() {} }); } };
const env = { SSO_SECRET: SECRET, DB: d1(), HUB_URL: HUB, PROFILE, PLANNER, NOW_MS: String(NOW) };

// kegiatan di Content Planner: Program P, kegiatan edukasi K (bagian dari P), kegiatan cabang C
await planner.fetch(new Request("https://content-planner/__hub/members", { headers: { "x-hub-key": SECRET } }), plannerEnv, { waitUntil() {} });
const ins = (id, kind, t, date, program_id = "") => plannerEnv.DB.db.prepare("INSERT INTO items (id, date, title, kind, program_id, status, created_at) VALUES (?, ?, ?, ?, ?, 'rencana', ?)").run(id, date, t, kind, program_id, date + "T00:00:00Z");
ins("pP", "program", "Program Reksa Dana", "2026-10-01"); ins("kK", "edukasi", "Webinar Obligasi", "2026-10-20", "pP"); ins("cC", "cabang", "Gathering Surabaya", "2026-10-25");
const qrN = (id) => (plannerEnv.DB.db.prepare("SELECT n FROM qrclicks WHERE item_id = ?").get(id) || {}).n;

// kerja di belakang layar (ctx.waitUntil) ditunggu sampai selesai sebelum cek berikutnya
const run = async (req, e = env) => { const P = [], r = await worker.fetch(req, e, { waitUntil: (p) => P.push(p) }); await Promise.all(P); return r; };
const go = (p, ua = "Mozilla/5.0", method = "GET", e = env) => run(new Request(BASE + p, { method, headers: { "user-agent": ua }, redirect: "manual" }), e);
const raw = (path, { ck, body, headers = {} } = {}) => run(new Request(BASE + path, { method: body !== undefined ? "POST" : "GET", redirect: "manual",
  headers: { ...(ck ? { cookie: ck } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }));
const call = async (path, o = {}) => { const r = await raw(path, o); return { status: r.status, j: await r.json().catch(() => null) }; };
const sql = (q, ...a) => env.DB.db.prepare(q).get(...a);

/* ---------- dasar ---------- */
assert.deepEqual(Object.keys(KANAL), ["poster", "instagram", "whatsapp", "iklan", "email", "lainnya"]);
assert.deepEqual(KANAL.iklan.slice(1), ["iklan", "ads"]);
assert.ok(BOT_UA.test("WhatsApp/2.23") && !BOT_UA.test("Mozilla/5.0"));
assert.equal(wibDay(Date.parse("2026-10-30T18:00:00Z")), "2026-10-31", "hari WIB");
for (const p of ["/abcdef", "/23456z"]) assert.ok(CODE_RE.test(p), p);
for (const p of ["/abc", "/ABCDEF", "/abcde1", "/abcdel", "/logout", "/abcdefg"]) assert.ok(!CODE_RE.test(p), p);

/* ---------- sinkron Tool Hub ---------- */
assert.equal((await call("/__hub/users", { body: { users: [] } })).status, 403, "tanpa kunci hub ditolak");
let r = await call("/__hub/users", { body: { users: [{ email: "Sari@acme.test", name: "Sari", job: "partnership" }], branches: [], org: DEFAULT_ORG }, headers: { "x-hub-key": SECRET } });
assert.equal(r.status, 200); assert.equal(r.j.n, 1);

/* ---------- pengalih publik ---------- */
// link dibuat langsung di D1 (pembuatan lewat API dicek di bawah)
await go("/abcdef");   // memicu pembuatan tabel
const mk = (code, item, target, active = 1) => env.DB.db.prepare("INSERT INTO links (code, item_id, item_kind, item_title, target, channel, active, created_email, created_at) VALUES (?, ?, 'edukasi', 'x', ?, 'poster', ?, 'sari@acme.test', '2026-10-30')").run(code, item, target, active);
mk("abcdef", "kK", "https://tujuan.test/a"); mk("zzzzzz", "kK", "https://tujuan.test/b", 0);
let res = await go("/abcdef?to=https://jahat.test");
assert.equal(res.status, 302); assert.equal(res.headers.get("location"), "https://tujuan.test/a", "tujuan dari D1, bukan dari query");
assert.equal(res.headers.get("cache-control"), "no-store"); assert.equal(res.headers.get("x-robots-tag"), "noindex");
await go("/abcdef", "WhatsApp/2.23"); await go("/abcdef", "facebookexternalhit/1.1");
assert.equal((await go("/abcdef", "Mozilla/5.0", "HEAD")).status, 302);
assert.equal(sql("SELECT clicks FROM links WHERE code='abcdef'").clicks, 1, "bot, pratinjau & HEAD tidak dihitung");
assert.equal(sql("SELECT n FROM daily WHERE code='abcdef' AND day=?", wibDay(NOW)).n, 1, "klik harian (WIB)");
assert.deepEqual(plannerCalls.at(-1), { url: "https://content-planner/__hub/link-clicks", key: SECRET });
assert.equal(qrN("kK"), 1, "total klik masuk ke Content Planner");
res = await go("/zzzzzz");
assert.equal(res.status, 410, "nonaktif"); assert.equal(sql("SELECT clicks FROM links WHERE code='zzzzzz'").clicks, 0, "klik link nonaktif tidak dihitung");
const off = await res.text();
assert.ok(off.includes("Link ini sudah tidak aktif") && off.includes('href="https://kisi.test"') && off.includes("/brand/kisi-color.png"));
res = await go("/qqqqqq");
assert.equal(res.status, 404); assert.ok((await res.text()).includes("Link tidak ditemukan"));
for (const p of ["/abc", "/ABCDEF", "/abcde1"]) assert.notEqual((await go(p)).status, 302, p);
// Content Planner mati: tetap dialihkan, klik tetap tercatat di Studio
const envDown = { ...env, PLANNER: { fetch: () => Promise.reject(new Error("mati")) } };
res = await go("/abcdef", "Mozilla/5.0", "GET", envDown);
assert.equal(res.status, 302, "Planner mati: tetap dialihkan"); assert.equal(sql("SELECT clicks FROM links WHERE code='abcdef'").clicks, 2);
// kiriman berikutnya membawa total terbaru
await go("/abcdef"); assert.equal(qrN("kK"), 3);
// kegiatan dihapus di Content Planner: link tetap jalan, ditandai
plannerEnv.DB.db.prepare("DELETE FROM items WHERE id = 'kK'").run();
assert.equal((await go("/abcdef")).status, 302, "kegiatan dihapus: link tetap jalan");
assert.equal(sql("SELECT gone FROM links WHERE code='abcdef'").gone, 1, "ditandai kegiatan sudah dihapus");
ins("kK", "edukasi", "Webinar Obligasi", "2026-10-20", "pP");
env.DB.db.prepare("UPDATE links SET gone = 0").run();

/* ---------- login ---------- */
res = await raw("/");
assert.equal(res.status, 303); assert.ok(res.headers.get("location").startsWith(HUB + "/sso?app=go"), "tanpa sesi -> login lewat hub");
assert.equal((await call("/api/links")).status, 401);

console.log("semua cek lolos");
