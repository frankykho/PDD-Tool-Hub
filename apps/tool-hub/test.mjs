// Cek Tool Hub: dashboard, hak akses, favorit, dan ringkasan "Hari ini" dari Market Recap & Content Planner
// (lewat service binding, shared/hubfeed.js). Jalankan: node apps/tool-hub/test.mjs   (Node 22.15+)
// KV & GitHub ditiru di memori; D1 ditiru dengan node:sqlite, jadi query ringkasan benar-benar dijalankan.
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

// worker mengimpor halaman .html sebagai teks (seperti wrangler)
registerHooks({
  load(url, ctx, next) {
    if (url.startsWith("file:") && url.endsWith(".html")) return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(fs.readFileSync(fileURLToPath(url), "utf8")) };
    return next(url, ctx);
  },
});
const { default: hub, hashPw } = await import("./worker.js");
const { default: recap } = await import("../market-recap/worker.js");
const { default: planner } = await import("../content-planner/worker.js");

/* ---------- tiruan ---------- */
function kv() {
  const m = new Map();
  return {
    m,
    async get(k, t) { const x = m.get(k); return x == null ? null : t === "json" ? JSON.parse(x.v) : x.v; },
    async put(k, v, o = {}) { m.set(k, { v: String(v), meta: o.metadata }); },
    async delete(k) { m.delete(k); },
    async list({ prefix = "" } = {}) { return { keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, x]) => ({ name, metadata: x.meta })), list_complete: true }; },
  };
}
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
  });
  return { db, prepare: (sql) => st(sql), batch: async (list) => { for (const x of list) await x.run(); } };
}
const SECRET = "s".repeat(40), ADMIN = "admin@acme.test", HUB = "https://hub.acme.test";
const IDS = ["email", "story", "fund", "competitor", "content", "edukasi", "bond", "etf", "recap", "planner", "sats", "tutorial"];
const PROFILE = JSON.stringify({ urls: Object.fromEntries([["hub", HUB], ...IDS.map((id) => [id, `https://${id}.acme.test`])]), github: { repo: "acme/tools" }, brand: { short: "Acme" } });
const recapEnv = { SSO_SECRET: SECRET, DB: d1(), PROFILE, HUB_URL: HUB };
const plannerEnv = { SSO_SECRET: SECRET, DB: d1(), PROFILE, HUB_URL: HUB };
const bind = (w, e) => ({ fetch: (u, init) => w.fetch(new Request(u, init), e, { waitUntil() { } }) });
const env = { ADMIN_EMAILS: ADMIN, SSO_SECRET: SECRET, HUB_KV: kv(), PROFILE, HUB_URL: HUB, GITHUB_REPO: "acme/tools", RECAP: bind(recap, recapEnv), PLANNER: bind(planner, plannerEnv) };

let ghCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => {
  const url = String((u && u.url) || u);
  if (url.startsWith("https://api.github.com/repos/acme/tools/actions/runs")) {
    ghCalls++;
    const run = (id, name, status, conclusion, at) => ({ workflow_id: id, name, status, conclusion, updated_at: at, html_url: `https://github.com/acme/tools/actions/runs/${id}${at}`, event: "schedule" });
    return Response.json({ workflow_runs: [
      run(2, "Deploy", "in_progress", null, "2026-10-20T01:05:00Z"),
      run(1, "Buat PDF produk", "completed", "failure", "2026-10-20T00:31:40Z"),
      run(3, "Data Story", "completed", "success", "2026-10-20T00:20:00Z"),
      run(1, "Buat PDF produk", "completed", "success", "2026-10-16T09:03:00Z"),   // lebih lama: diabaikan
    ] });
  }
  return realFetch(u, init);
};

/* ---------- pembantu ---------- */
async function call(path, { method = "GET", cookie = "", form, json, origin } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  let body;
  if (form) { body = new URLSearchParams(form); headers["content-type"] = "application/x-www-form-urlencoded"; }
  if (json !== undefined) { body = JSON.stringify(json); headers["content-type"] = "application/json"; }
  return hub.fetch(new Request(HUB + path, { method, headers, body, redirect: "manual" }), env);
}
const cookieOf = (r) => (r.headers.get("set-cookie") || "").split(";")[0];
const bootOf = (html) => {
  const m = /window\.HUB=(.*?);<\/script>/s.exec(html);
  if (!m) throw new Error("data dashboard tidak ditemukan:\n" + html.slice(0, 400));
  return JSON.parse(m[1]);
};
const wib = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const plus = (n) => { const d = new Date(wib + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* ---------- admin: dashboard lengkap ---------- */
const reg = await call("/daftar", { method: "POST", form: { name: "Dewi </script><b>x", email: ADMIN, password: "rahasia-123" } });
assert.equal(reg.status, 303);
const admin = cookieOf(reg);
assert.match(admin, /^hub_sess=/);

let r = await call("/", { cookie: admin });
assert.equal(r.status, 200);
let html = await r.text(), boot = bootOf(html);
assert.equal(boot.apps.length, 12, "admin melihat semua 12 tool");
assert.deepEqual(boot.apps.map((a) => a.id).sort(), [...IDS].sort());
for (const a of boot.apps) {
  assert.ok(boot.cats[a.cat], `${a.id}: kategori sah`);
  assert.ok(a.icon && a.blurb && a.features.length, `${a.id}: ikon, ringkasan, dan fitur terisi`);
  assert.ok(a.src, `${a.id}: punya alamat buka`);
}
assert.deepEqual(boot.apps.filter((a) => a.ai).map((a) => a.id).sort(), ["edukasi", "recap"], "AI Workbench hanya tool yang memang memakai AI");
assert.deepEqual(boot.today, { recap: true, planner: true, jobs: true });
assert.deepEqual(boot.fav, []);
assert.equal(boot.me.admin, true);
assert.equal(boot.apps.find((a) => a.id === "recap").lvl, "Admin");
assert.equal(boot.apps.find((a) => a.id === "story").lvl, "Semua tab");
assert.equal(boot.apps.find((a) => a.id === "fund").src, "/sso?app=fund&back=" + encodeURIComponent("https://fund.acme.test/"), "tool tetap dibuka lewat SSO");
assert.equal(boot.apps.find((a) => a.id === "sats").src, "/sso?app=sats&back=" + encodeURIComponent("https://sats.acme.test/api/auth/hub?to=%2F"));
assert.match(html, /<title>Acme Tool Hub<\/title>/);
assert.ok(!html.includes("</script><b>"), "nama pengguna tidak bisa menutup tag script");
assert.ok(!html.includes('id="hub-theme-toggle"'), "tombol tema lama tidak ikut disuntikkan");

/* ---------- ringkasan Hari ini ---------- */
r = await call("/api/today", { cookie: admin });   // juga membuat tabel di kedua tool
assert.equal(r.status, 200);
recapEnv.DB.db.prepare("INSERT INTO recaps (date, session, data, narrative, status) VALUES (?, 's1', ?, ?, 'published')").run(wib, JSON.stringify({ ihsg: { pct: 0.42 } }), "IHSG naik tipis\nisi rangkuman");
const item = plannerEnv.DB.db.prepare("INSERT INTO items (id, date, title, kind, status, owner_email, time, d_need, d_who, d_status) VALUES (?, ?, ?, 'konten', ?, ?, ?, ?, ?, ?)");
item.run("a", wib, "Story pagi", "draf", "lain@acme.test", "08:00", 0, "", "");
item.run("b", plus(1), "Artikel ETF", "draf", ADMIN, "", 0, "", "");
item.run("c", plus(2), "Sudah terbit", "terbit", ADMIN, "", 0, "", "");
item.run("d", plus(20), "Di luar 7 hari", "ide", ADMIN, "", 0, "", "");
item.run("e", plus(3), "Banner webinar", "ide", "lain@acme.test", "", 1, ADMIN, "proses");
item.run("f", plus(3), "Banner selesai", "ide", "lain@acme.test", "", 1, ADMIN, "selesai");
item.run("g", plus(3), "Banner orang lain", "ide", "lain@acme.test", "", 1, "lain@acme.test", "belum");

r = await call("/api/today", { cookie: admin });
const t = await r.json();
assert.equal(t.recap.ok, true, JSON.stringify(t.recap));
assert.equal(t.recap.data.date, wib);
assert.deepEqual(t.recap.data.sessions.map((s) => [s.session, s.status, s.title || "", s.pct ?? null]), [["s1", "published", "IHSG naik tipis", 0.42], ["close", "none", "", null]]);
assert.equal(t.recap.data.last, null);
assert.equal(t.planner.ok, true, JSON.stringify(t.planner));
assert.deepEqual(t.planner.data.today.map((x) => x.id), ["a"]);
assert.deepEqual(t.planner.data.mine.map((x) => x.id), ["b"], "milik pengguna: 7 hari ke depan, belum selesai");
assert.deepEqual(t.planner.data.design.map((x) => x.id), ["e"], "tugas desain: hanya untuk pengguna ini dan belum selesai");
assert.equal(t.jobs.ok, true);
assert.deepEqual(t.jobs.data.runs.map((x) => [x.name, x.state]), [["Buat PDF produk", "err"], ["Deploy", "run"], ["Data Story", "ok"]]);
const calls = ghCalls;
await call("/api/today", { cookie: admin });
assert.equal(ghCalls, calls, "status GitHub disimpan sebentar, tidak diminta ulang tiap muat");

/* ---------- favorit ---------- */
r = await call("/api/prefs", { method: "POST", cookie: admin, json: { fav: ["fund"] } });
assert.equal(r.status, 403, "tanpa Origin ditolak");
r = await call("/api/prefs", { method: "POST", cookie: admin, origin: "https://jahat.test", json: { fav: ["fund"] } });
assert.equal(r.status, 403, "Origin lain ditolak");
r = await call("/api/prefs", { method: "POST", cookie: admin, origin: HUB, json: { fav: ["fund", "tidak-ada", "fund", "recap"] } });
assert.equal(r.status, 200);
assert.deepEqual((await r.json()).fav, ["fund", "recap"]);
assert.deepEqual(bootOf(await (await call("/", { cookie: admin })).text()).fav, ["fund", "recap"]);
assert.ok(env.HUB_KV.m.has("pref:" + ADMIN) && JSON.parse(env.HUB_KV.m.get("u:" + ADMIN).v).hash, "favorit di kunci sendiri, akun utuh");

/* ---------- pengguna terbatas ---------- */
await env.HUB_KV.put("u:user@acme.test", JSON.stringify({ role: "user", status: "approved", name: "Rina", access: { fund: "viewer" }, hash: await hashPw("rahasia-456") }));
const user = cookieOf(await call("/login", { method: "POST", form: { email: "user@acme.test", password: "rahasia-456" } }));
assert.match(user, /^hub_sess=/);
boot = bootOf(await (await call("/", { cookie: user })).text());
assert.deepEqual(boot.apps.map((a) => a.id), ["fund"], "hanya tool yang diberi akses");
assert.equal(boot.apps[0].lvl, "Lihat saja");
assert.deepEqual(boot.today, { recap: false, planner: false, jobs: true });
assert.equal(boot.me.admin, false);
const ut = await (await call("/api/today", { cookie: user })).json();
assert.deepEqual(Object.keys(ut), ["jobs"], "ringkasan tool tanpa akses tidak diminta");
r = await call("/api/prefs", { method: "POST", cookie: user, origin: HUB, json: { fav: ["fund", "recap"] } });
assert.deepEqual((await r.json()).fav, ["fund"], "tidak bisa memfavoritkan tool tanpa akses");
assert.equal((await call("/sso?app=recap&back=" + encodeURIComponent("https://recap.acme.test/"), { cookie: user })).status, 403, "SSO tetap menolak tool tanpa akses");

/* ---------- tanpa sesi ---------- */
assert.equal((await call("/api/today")).status, 401);
assert.equal((await call("/")).status, 303);

/* ---------- endpoint internal di tool ---------- */
const feed = (w, e, headers = {}, method = "GET") => w.fetch(new Request("https://x.test/__hub/today", { method, headers }), e, { waitUntil() { } });
for (const [w, e] of [[recap, recapEnv], [planner, plannerEnv]]) {
  assert.equal((await feed(w, e)).status, 403, "tanpa kunci ditolak");
  assert.equal((await feed(w, e, { "x-hub-key": "s".repeat(39) + "t" })).status, 403, "kunci salah ditolak");
  assert.equal((await feed(w, e, { "x-hub-key": SECRET }, "POST")).status, 403, "hanya GET");
  assert.equal((await feed(w, e, { "x-hub-key": SECRET })).status, 200);
}

/* ---------- tool belum tersambung / belum diperbarui ---------- */
const old = { RECAP: env.RECAP, PLANNER: env.PLANNER };
delete env.RECAP;
env.PLANNER = { fetch: async () => new Response("Tidak ditemukan", { status: 404 }) };
const bad = await (await call("/api/today", { cookie: admin })).json();
assert.equal(bad.recap.ok, false); assert.match(bad.recap.error, /belum tersambung/);
assert.equal(bad.planner.ok, false); assert.match(bad.planner.error, /belum diperbarui/);
assert.equal(bad.jobs.ok, true, "bagian lain tetap tampil");
Object.assign(env, old);

/* ---------- skrip halaman ---------- */
const page = fs.readFileSync(new URL("./shell.html", import.meta.url), "utf8");
for (const [, code] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(code);
assert.equal(page.split('"__BOOT__"').length, 2, "penanda data ada tepat sekali di shell.html (bukan juga di komentar)");

console.log("semua cek lolos");
