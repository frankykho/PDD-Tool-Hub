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

/* ---------- Task 2: fitur, bukti, verifikasi, perbandingan ---------- */
const SB = "stockbit", IP = "ipot";
let pendingN = 0;
const insertPending = (competitor, source, text) => {
  const id = "ev" + ++pendingN;
  env.DB.db.prepare("INSERT INTO ft_evidence (id, competitor_id, source, url, text, launched_at, status, hash, created_at) VALUES (?, ?, ?, ?, ?, NULL, 'Perlu verifikasi', ?, ?)")
    .run(id, competitor, source, "https://contoh.test/" + id, text, "h-" + id, new Date().toISOString());
  return id;
};
const j = async (r) => [(await r).status, await (await r).clone().json()];
// isian manual wajib bukti: url ATAU gambar; tanggal peluncuran wajib
assert.equal((await call("POST", "/api/evidence", { competitor_id: SB, name: "Auto Invest", area: "Reksa Dana", launched_at: "2026-10-01" }, "editor")).status, 400, "tanpa url & gambar");
assert.equal((await call("POST", "/api/evidence", { competitor_id: SB, name: "Auto Invest", area: "Reksa Dana", url: "https://stockbit.com/x" }, "editor")).status, 400, "tanpa tanggal");
assert.equal((await call("POST", "/api/evidence", { competitor_id: SB, name: "Auto Invest", area: "Reksa Dana", launched_at: "2026-10-01", url: "javascript:alert(1)" }, "editor")).status, 400, "url bukan http");
assert.equal((await call("POST", "/api/evidence", { competitor_id: "tidakada", name: "Auto Invest", area: "Reksa Dana", launched_at: "2026-10-01", url: "https://x.test" }, "editor")).status, 400, "kompetitor tidak dikenal");
const [ms, m] = await j(call("POST", "/api/evidence", { competitor_id: SB, name: "Auto Invest", area: "Reksa Dana", description: "Beli rutin", launched_at: "2026-10-01", url: "https://stockbit.com/x" }, "editor"));
assert.equal(ms, 200, JSON.stringify(m));
assert.ok(m.feature_id && m.id);
// temuan otomatis: gabung ke fitur yang ada butuh launched_at
const evId = insertPending(IP, "ig", "Fitur Auto Invest kini hadir");
assert.equal((await call("POST", "/api/evidence/verify", { id: evId, action: "merge", feature_id: m.feature_id }, "editor")).status, 400);
assert.equal((await call("POST", "/api/evidence/verify", { id: evId, action: "merge", feature_id: m.feature_id, launched_at: "2026-10-05" }, "viewer")).status, 403);
assert.equal((await call("POST", "/api/evidence/verify", { id: evId, action: "merge", feature_id: m.feature_id, launched_at: "2026-10-05" }, "editor")).status, 200);
assert.equal((await call("POST", "/api/evidence/verify", { id: evId, action: "reject" }, "editor")).status, 400, "yang sudah diverifikasi tidak bisa diproses lagi");
let [, list] = await j(call("GET", "/api/features", null, "viewer"));
let f = list.features[0];
assert.deepEqual(f.has, { [SB]: "2026-10-01", [IP]: "2026-10-05" });
assert.equal(f.ikisi_status, "Belum ada");                               // bawaan
assert.deepEqual(list.competitors.map((c) => c.id).sort(), [IP, SB]);
assert.equal((await call("PATCH", "/api/features", { id: f.id, decision: "Beli" }, "editor")).status, 400);  // di luar FT.DECISIONS
assert.equal((await call("PATCH", "/api/features", { id: f.id, decision: "Kejar", priority: "H", ikisi_status: "Sebagian" }, "editor")).status, 200);
assert.equal((await call("PATCH", "/api/features", { id: f.id, priority: "H" }, "viewer")).status, 403);
// jadikan fitur baru dari temuan; area di luar daftar ditolak
const ev3 = insertPending(SB, "playstore", "[Baru] Pro Chart di Company Page");
assert.equal((await call("POST", "/api/evidence/verify", { id: ev3, action: "new", name: "Pro Chart", area: "Kripto", launched_at: "2026-11-01" }, "editor")).status, 400);
assert.equal((await call("POST", "/api/evidence/verify", { id: ev3, action: "new", name: "Pro Chart", area: "Saham", launched_at: "2026-11-01" }, "editor")).status, 200);
// bukti ditolak tidak dihitung
const ev2 = insertPending(IP, "appstore", "x");
assert.equal((await call("POST", "/api/evidence/verify", { id: ev2, action: "reject" }, "editor")).status, 200);
assert.equal(env.DB.db.prepare("SELECT status FROM ft_evidence WHERE id=?").get(ev2).status, "Ditolak");
[, list] = await j(call("GET", "/api/features?area=Saham", null, "viewer"));
assert.deepEqual(list.features.map((x) => [x.name, x.has]), [["Pro Chart", { [SB]: "2026-11-01" }]], "filter area; ditolak tidak dihitung");
[, list] = await j(call("GET", "/api/features?decision=Kejar&priority=H", null, "viewer"));
assert.deepEqual(list.features.map((x) => x.name), ["Auto Invest"]);
const [, pend] = await j(call("GET", "/api/evidence?status=Perlu%20verifikasi", null, "viewer"));
assert.equal(pend.evidence.length, 0);
const [, det] = await j(call("GET", "/api/features/" + f.id, null, "viewer"));
assert.equal(det.feature.name, "Auto Invest"); assert.equal(det.evidence.length, 2);
// gambar bukti: hanya data:image png/jpeg/webp
assert.equal((await call("POST", "/api/evidence", { competitor_id: IP, name: "Y", area: "Saham", launched_at: "2026-10-01", image_data: "data:text/html;base64,PGI+" }, "editor")).status, 400);
assert.equal((await call("POST", "/api/evidence", { competitor_id: IP, name: "Y", area: "Saham", launched_at: "2026-10-01", image_data: "data:image/png;base64,iVBORw0KGgo=" }, "editor")).status, 200);
// kompetitor: hanya admin
assert.equal((await call("POST", "/api/competitors", { name: "Ajaib" }, "editor")).status, 403);
assert.equal((await call("POST", "/api/competitors", { name: "Ajaib", enabled: 0 }, "admin")).status, 200);
assert.equal((await call("POST", "/api/competitors", { id: SB, name: "Stockbit", ig_account: "stockbit", play_id: "com.stockbit.android", appstore_id: "1184800207", enabled: 1 }, "admin")).status, 200);
const [, comps] = await j(call("GET", "/api/competitors", null, "viewer"));
assert.deepEqual(comps.competitors.map((c) => [c.name, c.enabled]).sort(), [["Ajaib", 0], ["IPOT", 1], ["Stockbit", 1]]);

console.log("feature-intel: semua tes lolos");
