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
for (const p of ["/abc", "/abcde1", "/abcdel", "/logout", "/LOGOUT", "/abcdefg", "/abcdef//"]) assert.ok(!CODE_RE.test(p), p);
for (const p of ["/ABCDEF", "/Abcdef", "/abcdef/"]) assert.ok(CODE_RE.test(p), p + " (diketik dari poster: huruf besar / garis miring di akhir)");

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
for (const p of ["/abc", "/abcde1"]) assert.notEqual((await go(p)).status, 302, p);
for (const p of ["/Abcdef", "/abcdef/"]) assert.equal((await go(p, "WhatsApp/2.23")).headers.get("location"), "https://tujuan.test/a", p);
assert.equal((await go("/Qqqqqq")).status, 404, "kode tidak ada: halaman pemberitahuan, bukan login");
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

/* ---------- API: buat link, daftar, grafik, nonaktif ---------- */
const te = new TextEncoder(), b64 = (buf) => Buffer.from(buf).toString("base64url");
async function cookie(p) {
  const body = b64(te.encode(JSON.stringify({ app: "go", x: Date.now() + 3600e3, ...p })));
  const key = await crypto.subtle.importKey("raw", te.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `hub_go=${body}.${b64(await crypto.subtle.sign("HMAC", key, te.encode(body)))}`;
}
const SARI = await cookie({ e: "sari@acme.test", n: "Sari", j: "partnership" }), REG = await cookie({ e: "rina@acme.test", n: "Rina", j: "sales" });
const HEAD = await cookie({ e: "hadi@acme.test", n: "Hadi", j: "head_rm" }), ADMIN = await cookie({ e: "adm@acme.test", n: "Adm", adm: true });
const OTHER = await cookie({ e: "tono@acme.test", n: "Tono", j: "copy" }), OLDREG = await cookie({ e: "lama@acme.test", n: "Lama" });   // tiket lama tanpa role
await call("/__hub/users", { body: { users: [{ email: "lama@acme.test", name: "Lama", job: "galeri" }], org: DEFAULT_ORG }, headers: { "x-hub-key": SECRET } });
const api = (ck, path, body, headers) => call(path, { ck, body, headers });

// pilihan kegiatan dari Content Planner (aturan regional)
assert.deepEqual((await api(SARI, "/api/items?q=a")).j.items.map((i) => i.id).sort(), ["cC", "kK", "pP"]);
assert.deepEqual((await api(REG, "/api/items?q=a")).j.items.map((i) => i.id), ["cC"], "regional: hanya cabang & galeri");
assert.deepEqual((await api(OLDREG, "/api/items?q=a")).j.items.map((i) => i.id), ["cC"], "tiket tanpa role: role dari daftar Tool Hub");
assert.equal((await api(SARI, "/api/items?id=kK")).j.item.title, "Webinar Obligasi");
assert.equal((await api(REG, "/api/items?id=pP")).status, 404);
assert.equal((await api(SARI, "/api/items")).j.items.length, 3, "tanpa pencarian: terbaru");

// buat link
assert.equal((await api(SARI, "/api/links", { item_id: "kK", target: "javascript:alert(1)", channel: "poster" })).status, 400, "hanya http/https");
assert.equal((await api(SARI, "/api/links", { item_id: "kK", target: "https://x.test/" + "a".repeat(500), channel: "poster" })).status, 400, "maks 500 karakter");
assert.equal((await api(SARI, "/api/links", { item_id: "kK", target: "https://x.test", channel: "fax" })).status, 400, "kanal tidak dikenal");
assert.equal((await api(SARI, "/api/links", { item_id: "hilang", target: "https://x.test", channel: "poster" })).status, 400, "kegiatan tidak ada");
let c = await api(SARI, "/api/links", { item_id: "kK", target: "https://x.test/p?utm_source=lama", channel: "instagram", name: "Caption IG 1" });
assert.equal(c.status, 200); c = c.j;
assert.match(c.code, /^[a-km-np-z2-9]{6}$/); assert.equal(c.url, BASE + "/" + c.code);
const t = new URL(c.target);
assert.deepEqual([t.searchParams.get("utm_source"), t.searchParams.get("utm_medium"), t.searchParams.get("utm_campaign"), t.searchParams.get("utm_content")], ["lama", "social", "webinar-obligasi", c.code], "UTM lama tidak ditimpa");
const plain = (await api(SARI, "/api/links", { item_id: "kK", target: "https://x.test/q", channel: "poster", utm: false })).j;
assert.equal(plain.target, "https://x.test/q", "UTM bisa dimatikan");
assert.equal(new URL((await api(SARI, "/api/links", { item_id: "pP", target: "https://x.test", channel: "iklan" })).j.target).searchParams.get("utm_medium"), "ads");
assert.equal((await api(REG, "/api/links", { item_id: "pP", target: "https://x.test", channel: "poster" })).status, 400, "regional tidak bisa menempel ke Program lewat API");
const rc = (await api(REG, "/api/links", { item_id: "cC", target: "https://x.test/c", channel: "whatsapp" })).j;
assert.equal(sql("SELECT item_kind FROM links WHERE code = ?", rc.code).item_kind, "cabang");
assert.equal((await api(SARI, "/api/links", { item_id: "kK", target: "https://x.test", channel: "poster" }, { origin: "https://jahat.test" })).status, 403, "CSRF");

// daftar
let L = (await api(SARI, "/api/links")).j.links;
assert.ok(L.some((x) => x.code === c.code) && L.some((x) => x.code === rc.code));
const row = L.find((x) => x.code === c.code);
assert.deepEqual([row.name, row.channel, row.item_title, row.url, row.can], ["Caption IG 1", "instagram", "Webinar Obligasi", c.url, true]);
assert.deepEqual((await api(REG, "/api/links")).j.links.map((x) => x.code), [rc.code], "regional tidak melihat link kegiatan pusat");
assert.ok((await api(SARI, "/api/links?item=kK")).j.links.every((x) => x.item_id === "kK"));
assert.ok((await api(OTHER, "/api/links?mine=1")).j.links.length === 0, "buatanku");
assert.equal((await api(OTHER, "/api/links")).j.links.find((x) => x.code === c.code).can, false);
// judul kegiatan diperbarui dari Content Planner; kegiatan dihapus ditandai
plannerEnv.DB.db.prepare("UPDATE items SET title = 'Webinar Obligasi Baru' WHERE id = 'kK'").run();
plannerEnv.DB.db.prepare("DELETE FROM items WHERE id = 'cC'").run();
L = (await api(SARI, "/api/links")).j.links;
assert.equal(L.find((x) => x.code === c.code).item_title, "Webinar Obligasi Baru");
assert.equal(L.find((x) => x.code === rc.code).gone, 1, "kegiatan sudah dihapus di Content Planner");
assert.equal((await go("/" + rc.code)).status, 302, "link kegiatan terhapus tetap jalan");
// daftar membuka -> total klik dikirim ulang (memperbaiki kiriman yang dulu gagal)
plannerEnv.DB.db.prepare("DELETE FROM qrclicks").run();
await api(SARI, "/api/links");
assert.equal(qrN("kK"), 4, "dikirim ulang saat daftar dibuka");
{ const tc = () => sql("SELECT total_changes() AS n").n, c0 = tc();
  await api(SARI, "/api/links");
  assert.equal(tc() - c0, 0, "tidak ada yang berubah: tidak ada baris yang ditulis ulang"); }

// nonaktif & aktif lagi
assert.equal((await api(REG, "/api/links/active", { code: c.code, active: false })).status, 403, "bukan pembuat / Head / admin");
assert.equal((await api(OTHER, "/api/links/active", { code: c.code, active: false })).status, 403);
assert.equal((await api(HEAD, "/api/links/active", { code: c.code, active: false })).status, 200, "Head boleh");
assert.equal((await go("/" + c.code)).status, 410);
assert.equal((await api(SARI, "/api/links?state=off")).j.links.map((x) => x.code).includes(c.code), true);
assert.equal((await api(SARI, "/api/links/active", { code: c.code, active: true })).status, 200, "pembuat boleh");
assert.equal((await go("/" + c.code)).headers.get("location"), c.target, "aktif lagi, tujuan tetap");
assert.equal((await api(ADMIN, "/api/links/active", { code: plain.code, active: false })).status, 200, "admin boleh");
assert.equal((await api(SARI, "/api/links/active", { code: "qqqqqq", active: false })).status, 404);
assert.equal((await api(SARI, "/api/links", { code: c.code, target: "https://jahat.test" })).status, 400, "tidak ada cara mengubah tujuan");
assert.equal(sql("SELECT target FROM links WHERE code = ?", c.code).target, c.target);

// grafik harian
let S = (await api(SARI, "/api/stats?code=" + c.code)).j.days;
assert.equal(S.length, 30); assert.equal(S.at(-1).day, wibDay(NOW)); assert.equal(S.at(-1).n, 1); assert.equal(S[0].n, 0);
assert.equal((await api(SARI, "/api/stats?code=abcdef&days=90")).j.days.length, 90);
assert.equal((await api(SARI, "/api/stats?item=kK")).j.days.at(-1).n, 5, "per kegiatan = semua link kegiatan itu");
assert.equal((await api(REG, "/api/stats?item=kK")).status, 404, "regional tidak melihat grafik kegiatan pusat");
assert.equal((await api(REG, "/api/stats?code=" + c.code)).status, 404);

/* ---------- banyak link: filter regional di SQL, halaman berikutnya, daftar kegiatan ---------- */
{
  const ins = env.DB.db.prepare("INSERT INTO links (code, item_id, item_kind, item_title, target, channel, active, created_email, created_at) VALUES (?, 'kK', 'edukasi', 'Webinar Obligasi Baru', 'https://x.test', 'poster', 1, 'sari@acme.test', ?)");
  for (let i = 0; i < 305; i++) ins.run('m' + String(i).padStart(5, 'a'), '2026-12-01T00:00:' + String(i % 60).padStart(2, '0') + 'Z');
  let R = (await api(REG, '/api/links')).j;
  assert.deepEqual(R.links.map((x) => x.code), [rc.code], 'regional tetap melihat link-nya walau ada 300+ link pusat yang lebih baru');
  assert.deepEqual(R.items.map((x) => x.id), ['cC'], 'pilihan kegiatan regional');
  R = (await api(SARI, '/api/links')).j;
  assert.equal(R.links.length, 300); assert.equal(R.more, true);
  assert.deepEqual(R.items.map((x) => x.id).sort(), ['cC', 'kK', 'pP'], 'pilihan kegiatan dari semua link, bukan hanya halaman ini');
  const R2 = (await api(SARI, '/api/links?offset=300')).j;
  assert.equal(R2.more, false); assert.ok(R2.links.some((x) => x.code === rc.code), 'link lama ada di halaman berikutnya');
  env.DB.db.prepare("DELETE FROM links WHERE code LIKE 'm%'").run();
}

/* ---------- halaman ---------- */
{
  const pg = await raw('/', { ck: SARI });
  assert.equal(pg.status, 200); assert.match(pg.headers.get('content-security-policy'), /frame-ancestors 'self' https:\/\/hub\.acme\.test/);
  const LQ_RE = /window\.LQ=(.*?);<\/script>/s, h = await pg.text(), cfg = JSON.parse(LQ_RE.exec(h)[1]);
  assert.deepEqual([cfg.me.email, cfg.me.reg, cfg.base, Object.keys(cfg.kanal).length], ['sari@acme.test', false, BASE, 6]);
  assert.equal(JSON.parse(LQ_RE.exec(await (await raw('/', { ck: REG })).text())[1]).me.reg, true);
  assert.ok(h.includes('qrcode-generator/1.4.4') && h.includes('qrcode(0,"H")') && h.includes('/brand/truefriend-mark.png'), 'halaman Studio: QR H berlogo');
  assert.ok(h.includes('id="fMake"') && h.includes('id="list"') && h.includes('/api/stats?'), 'buat link, daftar, grafik');
}

console.log("semua cek lolos");
