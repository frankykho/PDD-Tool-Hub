// Cek Feature Intelligence: tabel ft_ di insight-db (bersama Competitor Intelligence & Content Insight), login & hak akses.
// Jalankan: node apps/feature-intel/test.mjs   (Node 22.15+). D1 ditiru dengan node:sqlite.
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";

registerHooks({
  load(url, ctx, next) {
    if (url.startsWith("file:") && url.endsWith(".html")) return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(fs.readFileSync(fileURLToPath(url), "utf8")) };
    return next(url, ctx);
  },
});
const { default: worker, ftMigrate } = await import("./worker.js");
const { ciMigrate } = await import("../competitor-intel/worker.js");

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
const SECRET = "s".repeat(40), HUB = "https://hub.acme.test", BASE = "https://feature.acme.test";
const env = { SSO_SECRET: SECRET, DB: d1(), HUB_URL: HUB, PROFILE: JSON.stringify({ urls: { hub: HUB, feature: BASE } }) };

// cookie sesi hub_feature yang sah untuk peran tertentu (format HUBSSO: base64url(JSON).hmac)
const te = new TextEncoder();
const b64 = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function cookie(role) {
  const body = b64(te.encode(JSON.stringify({ app: "feature", x: Date.now() + 36e5, e: role + "@acme.test", n: "Tim " + role, u: role, a: role === "hubadmin" ? "viewer" : role, adm: role === "hubadmin" })));
  const key = await webcrypto.subtle.importKey("raw", te.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `hub_feature=${body}.${b64(await webcrypto.subtle.sign("HMAC", key, te.encode(body)))}`;
}
const call = async (method, path, body, role) => {
  const headers = { origin: BASE };
  if (role) headers.cookie = await cookie(role);
  if (body != null) headers["content-type"] = "application/json";
  return worker.fetch(new Request(BASE + path, { method, headers, body: body == null ? undefined : JSON.stringify(body) }), env, { waitUntil() {} });
};

/* ---------- Task 1: tabel, login, hak akses ---------- */
// tabel Content Insight (DDL disalin dari apps/content-insight/worker.js) supaya nama yang bentrok ketahuan
env.DB.db.exec(`CREATE TABLE IF NOT EXISTS ci_content (id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, platform TEXT, account TEXT, format TEXT, caption TEXT, posted_at TEXT, likes INTEGER, comments INTEGER, pillar TEXT, topic TEXT, note TEXT, idea TEXT, image_data TEXT, image_url TEXT, saved_at TEXT NOT NULL, saved_by TEXT, edited_by TEXT);
CREATE TABLE IF NOT EXISTS ci_accounts (platform TEXT NOT NULL, account TEXT NOT NULL, kind TEXT, PRIMARY KEY (platform, account));`);
await ciMigrate(env); await ftMigrate(env); await ftMigrate(env);   // idempoten, tidak bentrok
const tabs = env.DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
assert.ok(["ft_competitors", "ft_features", "ft_evidence", "ft_brds", "ft_meta"].every((t) => tabs.includes(t)), tabs.join(","));
assert.deepEqual(env.DB.db.prepare("SELECT name FROM ft_competitors ORDER BY name").all().map((r) => r.name), ["IPOT", "Stockbit"]);
assert.equal((await call("GET", "/api/me", null, "viewer")).status, 200);
assert.deepEqual(await (await call("GET", "/api/me", null, "hubadmin")).json(), { name: "Tim hubadmin", role: "admin" }, "admin hub selalu admin");
assert.equal((await call("GET", "/api/me", null, null)).status, 401);
assert.equal((await call("POST", "/api/features", { name: "x" }, "viewer")).status, 403);
const page = await call("GET", "/", null, "viewer");
assert.equal(page.status, 200);
assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'self' https:\/\/hub\.acme\.test/);
assert.equal((await call("GET", "/", null, null)).status, 303, "tanpa sesi -> login lewat hub");
const cross = await worker.fetch(new Request(BASE + "/api/features", { method: "POST", headers: { origin: "https://evil.test", cookie: await cookie("editor"), "content-type": "application/json" }, body: "{}" }), env, {});
assert.equal(cross.status, 403, "POST dari situs lain ditolak");

console.log("feature-intel: semua tes lolos");
