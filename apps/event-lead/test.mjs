// Cek Event & Lead: aturan akses, login, sinkron dari Tool Hub, pendaftaran publik, API peserta, absen, sambungan Content Planner.
// Jalankan: node apps/event-lead/test.mjs   (Node 22.15+). D1 ditiru dengan node:sqlite, jadi query benar-benar dijalankan.
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
const W = await import("./worker.js");
const { default: worker, canSee, canDelete } = W;

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
const SECRET = "s".repeat(40), HUB = "https://hub.acme.test", BASE = "https://event.acme.test";
const env = { SSO_SECRET: SECRET, DB: d1(), HUB_URL: HUB, PROFILE: JSON.stringify({ urls: { hub: HUB, event: BASE } }) };
const ORG = DEFAULT_ORG;

// cookie sesi Event & Lead, ditandatangani sama seperti HUBSSO.ticket
const te = new TextEncoder(), b64 = (buf) => Buffer.from(buf).toString("base64url");
async function cookie(p) {
  const body = b64(te.encode(JSON.stringify({ app: "event", x: Date.now() + 3600e3, ...p })));
  const key = await crypto.subtle.importKey("raw", te.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `hub_event=${body}.${b64(await crypto.subtle.sign("HMAC", key, te.encode(body)))}`;
}
const raw = (path, { ck, body, headers = {}, method, e = env } = {}) => worker.fetch(new Request(BASE + path, { method: method || (body !== undefined ? "POST" : "GET"), redirect: "manual",
  headers: { ...(ck ? { cookie: ck } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }), e, { waitUntil() { } });
const call = async (path, o = {}) => { const r = await raw(path, o); return { status: r.status, j: await r.json().catch(() => null) }; };

/* ---------- aturan akses ---------- */
const ev = { branch: "Cabang Surabaya", creator_email: "pia@acme.test", creator_team: "pd" };
assert.equal(canSee({ e: "a@x", adm: true }, ev, ORG), true, "admin");
assert.equal(canSee({ e: "s@x", j: "sales", c: "Cabang Surabaya" }, ev, ORG), true, "regional, cabang sama");
assert.equal(canSee({ e: "t@x", j: "sales", c: "Cabang Sudirman" }, ev, ORG), false, "regional, cabang lain");
assert.equal(canSee({ e: "r@x", j: "head_rm", c: "Cabang Sudirman" }, ev, ORG), true, "Head regional: semua event regional");
assert.equal(canSee({ e: "pia@acme.test", j: "partnership" }, ev, ORG), true, "pembuat");
assert.equal(canSee({ e: "h@x", j: "head_pd" }, ev, ORG), true, "Head tim pembuat");
assert.equal(canSee({ e: "c@x", j: "copy" }, ev, ORG), false);
assert.equal(canSee({ e: "r@x", j: "head_rm" }, { branch: "", creator_email: "pia@acme.test", creator_team: "pd" }, ORG), false, "Head regional tidak melihat event tim lain tanpa cabang");
assert.equal(canSee({ e: "s@x", j: "sales", c: "" }, { branch: "", creator_email: "x@x", creator_team: "" }, ORG), false, "sales tanpa cabang tidak melihat event tanpa cabang");
assert.equal(canDelete({ adm: true }, ORG), true);
assert.equal(canDelete({ j: "head_rm" }, ORG), true);
assert.equal(canDelete({ j: "sales" }, ORG), false);

/* ---------- login ---------- */
let r = await call("/api/events");
assert.equal(r.status, 401); assert.equal(r.j.error, "Sesi habis. Muat ulang halaman.");
let res = await raw("/");
assert.equal(res.status, 303); assert.ok(res.headers.get("location").startsWith(HUB + "/sso?app=event"), "tanpa cookie -> login lewat hub");

/* ---------- anggota, cabang, tim & role dari Tool Hub ---------- */
const BRANCHES = [{ r: "Jawa Timur", c: "Cabang Surabaya", t: "cabang" }, { r: "Jakarta", c: "Cabang Sudirman", t: "cabang" }, { r: "Jawa Timur", c: "Galeri UNAIR", t: "galeri" }];
const hubPush = (path, body) => call(path, { body, headers: { "x-hub-key": SECRET } });
assert.equal((await call("/__hub/users", { body: { users: [] } })).status, 403, "tanpa kunci hub ditolak");
r = await hubPush("/__hub/users", { users: [{ email: "Sari@acme.test", name: "Sari", job: "sales", branch: "Cabang Surabaya" }, { email: "pia@acme.test", name: "Pia", job: "partnership", branch: "" }], branches: BRANCHES, org: ORG });
assert.equal(r.status, 200);
assert.ok(env.DB.db.prepare("SELECT v FROM cfg WHERE k = 'org'").get(), "org tersimpan");
assert.deepEqual(await W.getBranches(env), BRANCHES);
assert.deepEqual((await W.getOrg(env)).roles.length, ORG.roles.length);
assert.deepEqual(JSON.parse(env.DB.db.prepare("SELECT v FROM cfg WHERE k = 'users'").get().v)[0], { email: "sari@acme.test", name: "Sari", job: "sales", branch: "Cabang Surabaya" });

console.log("semua cek lolos");
