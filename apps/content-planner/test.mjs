// Cek Content Planner: program partnership, tugas, notifikasi, sinkron anggota dari Tool Hub, data laporan program.
// Jalankan: node apps/content-planner/test.mjs   (Node 22.15+). D1 ditiru dengan node:sqlite, jadi query benar-benar dijalankan.
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

registerHooks({
  load(url, ctx, next) {
    if (url.startsWith("file:") && url.endsWith(".html")) return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(fs.readFileSync(fileURLToPath(url), "utf8")) };
    return next(url, ctx);
  },
});
const { default: planner, dueNotifs, itemNotifs, taskNotifs } = await import("./worker.js");

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
const SECRET = "s".repeat(40), HUB = "https://hub.acme.test", BASE = "https://planner.acme.test";
const env = { SSO_SECRET: SECRET, DB: d1(), HUB_URL: HUB, PROFILE: JSON.stringify({ urls: { hub: HUB } }) };

// cookie sesi Content Planner, ditandatangani sama seperti HUBSSO.ticket
const te = new TextEncoder(), b64 = (buf) => Buffer.from(buf).toString("base64url");
async function cookie(p) {
  const body = b64(te.encode(JSON.stringify({ app: "planner", x: Date.now() + 3600e3, ...p })));
  const key = await crypto.subtle.importKey("raw", te.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `hub_planner=${body}.${b64(await crypto.subtle.sign("HMAC", key, te.encode(body)))}`;
}
const PART = await cookie({ e: "pia@acme.test", n: "Pia", j: "partnership" });
const DES = await cookie({ e: "dodi@acme.test", n: "Dodi", j: "design" });
const COPY = await cookie({ e: "cici@acme.test", n: "Cici", j: "copy" });
const OLD = await cookie({ e: "lama@acme.test", n: "Lama" });   // sesi lama tanpa role di tiket
const call = async (path, { ck, body, headers = {} } = {}) => {
  const r = await planner.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() { } });
  return { status: r.status, j: await r.json().catch(() => null) };
};
const hub = (path, body) => call(path, { body, headers: { "x-hub-key": SECRET } });
const today = (path = "") => planner.fetch(new Request(BASE + "/__hub/today" + path, { headers: { "x-hub-key": SECRET } }), env).then((r) => r.json());
const wib = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const plus = (n) => { const d = new Date(wib + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* ---------- anggota dari Tool Hub ---------- */
assert.equal((await call("/__hub/users", { body: { users: [] } })).status, 403, "tanpa kunci hub ditolak");
assert.equal((await hub("/__hub/users", { users: [] })).status, 400, "daftar kosong tidak menghapus semua anggota");
let r = await hub("/__hub/users", { users: [
  { email: "pia@acme.test", name: "Pia", job: "partnership" }, { email: "dodi@acme.test", name: "Dodi", job: "design" },
  { email: "cici@acme.test", name: "Cici", job: "copy" }, { email: "BUDI@acme.test", name: "Budi", job: "bukan-role" },
] });
assert.equal(r.status, 200); assert.equal(r.j.n, 4);
let U = (await call("/api/users", { ck: PART })).j;
assert.deepEqual(U.map((u) => [u.email, u.role]), [["budi@acme.test", null], ["cici@acme.test", "copy"], ["dodi@acme.test", "design"], ["pia@acme.test", "partnership"]]);
await hub("/__hub/users", { users: [{ email: "pia@acme.test", name: "Pia", job: "partnership" }, { email: "dodi@acme.test", name: "Dodi", job: "design" }, { email: "cici@acme.test", name: "Cici", job: "copy" }] });
U = (await call("/api/users", { ck: PART })).j;
assert.ok(!U.some((u) => u.email === "budi@acme.test"), "akun yang tidak lagi boleh membuka Planner hilang dari pilihan");

/* ---------- program: hanya Partnership / admin ---------- */
const prog = { kind: "program", title: "Kelas investasi Kampus X", date: plus(1), end_date: plus(20), channel: "Kampus / sekolah", status: "rencana", partner: "BEM Kampus X",
  goal: "Mengenalkan reksa dana ke mahasiswa", target: "300 peserta, 50 akun baru", result_num: "250", reach: "12.000", leads: "80", accounts: "45", aum: "150.000.000", budget: "10.000.000", cost: "8.500.000" };
r = await call("/api/items", { ck: COPY, body: prog });
assert.equal(r.status, 400); assert.match(r.j.error, /Partnership atau admin/);
r = await call("/api/items", { ck: await cookie({ e: "adm@acme.test", n: "Admin", adm: true }), body: { ...prog, title: "Program admin" } });
assert.equal(r.status, 200, "admin hub boleh membuat program");
r = await call("/api/items", { ck: PART, body: prog });
assert.equal(r.status, 200, JSON.stringify(r.j));
const P = r.j.id;
const saved = (await call("/api/items?id=" + P, { ck: COPY })).j;
assert.deepEqual([saved.partner, saved.end_date, saved.result_num, saved.reach, saved.leads, saved.accounts, saved.aum, saved.budget, saved.cost, saved.d_need, saved.program_id],
  ["BEM Kampus X", plus(20), 250, 12000, 80, 45, 150000000, 10000000, 8500000, 0, ""]);
assert.equal((await call("/api/items", { ck: COPY, body: { ...saved, title: "diubah" } })).status, 400, "selain Partnership tidak bisa mengubah program");
r = await call("/api/items", { ck: PART, body: { ...prog, title: "Program terbalik", end_date: plus(-5) } });
assert.equal((await call("/api/items?id=" + r.j.id, { ck: PART })).j.end_date, plus(1), "tanggal selesai sebelum mulai -> sama dengan tanggal mulai");
await call("/api/items/delete", { ck: PART, body: { id: r.j.id } });
assert.equal((await call("/api/items", { ck: PART, body: { ...prog, title: "Program lama", date: plus(-40), end_date: plus(-30) } })).status, 200);
assert.equal((await call("/api/programs", { ck: COPY })).j.length, 3);

/* ---------- tugas ---------- */
const task = { item_id: P, title: "Visual banner acara", job: "design", who: "dodi@acme.test", due: plus(1), brief: "Ukuran 1080x1080" };
r = await call("/api/tasks", { ck: COPY, body: task });
assert.equal(r.status, 400); assert.match(r.j.error, /Partnership atau admin/, "hanya Partnership yang memberi tugas");
assert.match((await call("/api/tasks", { ck: PART, body: { ...task, who: "orang@luar.test" } })).j.error, /belum terdaftar/, "penerima harus anggota terdaftar");
assert.match((await call("/api/tasks", { ck: PART, body: { ...task, due: "" } })).j.error, /Tenggat/);
r = await call("/api/tasks", { ck: PART, body: task });
assert.equal(r.status, 200, JSON.stringify(r.j));
const T = r.j.id;
await call("/api/tasks", { ck: PART, body: { item_id: P, title: "Caption & email undangan", job: "copy", who: "cici@acme.test", due: plus(5) } });
let notif = (await today("?email=dodi@acme.test")).notif;
assert.equal(notif.unread, 2, "tugas baru + pengingat tenggat besok");
assert.ok(notif.items.some((n) => n.title === "Tugas baru: Visual banner acara" && /Kelas investasi Kampus X · tenggat .* · dari Pia/.test(n.body)));
assert.ok(notif.items.some((n) => n.title === "Tenggat besok: Visual banner acara"));
assert.equal((await today("?email=dodi@acme.test")).notif.unread, 2, "pengingat tenggat tidak dobel");
let t = await today("?email=dodi@acme.test");
assert.deepEqual(t.tasks.map((x) => [x.title, x.item_title, x.by_name]), [["Visual banner acara", "Kelas investasi Kampus X", "Pia"]]);

// penerima hanya boleh mengubah status & link; isi lain tetap
r = await call("/api/tasks", { ck: DES, body: { id: T, status: "selesai", link: "canva.com/x", title: "diganti", who: "cici@acme.test" } });
assert.equal(r.status, 200, JSON.stringify(r.j));
let tasks = (await call("/api/tasks?item=" + P, { ck: PART })).j;
const t1 = tasks.find((x) => x.id === T);
assert.deepEqual([t1.title, t1.who, t1.status, t1.link, !!t1.done_at, t1.who_name], ["Visual banner acara", "dodi@acme.test", "selesai", "https://canva.com/x", true, "Dodi"]);
notif = (await today("?email=pia@acme.test")).notif;
assert.ok(notif.items.some((n) => n.title === "Visual banner acara: Selesai" && /diubah Dodi/.test(n.body)), "pemberi tugas tahu tugasnya selesai");
assert.equal((await call("/api/tasks", { ck: COPY, body: { id: T, status: "belum" } })).status, 400, "orang lain tidak bisa mengubah tugas");
assert.equal((await call("/api/tasks/delete", { ck: DES, body: { id: T } })).status, 403, "penerima tidak bisa menghapus tugas");
assert.deepEqual((await today("?email=dodi@acme.test")).tasks, [], "tugas selesai tidak lagi di daftar beranda");
// daftar tugas: untukku & dariku; semua tim hanya untuk Partnership
assert.equal((await call("/api/tasks?mine=1", { ck: DES })).j.length, 1);
assert.equal((await call("/api/tasks?mine=1", { ck: PART })).j.length, 2);
assert.equal((await call("/api/tasks?all=1", { ck: COPY })).j.length, 1, "?all diabaikan untuk selain Partnership");

/* ---------- tandai dibaca ---------- */
assert.equal((await call("/__hub/notif", { body: { email: "dodi@acme.test", all: true } })).status, 403);
const first = (await today("?email=cici@acme.test")).notif;
await hub("/__hub/notif", { email: "cici@acme.test", ids: [first.items[0].id] });
assert.equal((await today("?email=cici@acme.test")).notif.unread, first.unread - 1);
await hub("/__hub/notif", { email: "dodi@acme.test", all: true });
assert.equal((await today("?email=dodi@acme.test")).notif.unread, 0);

/* ---------- kegiatan terkait program + notifikasi penanggung jawab & desainer ---------- */
r = await call("/api/items", { ck: COPY, body: { kind: "konten", title: "Story ajakan kelas", date: plus(2), channel: "IG Story", status: "draf", owner: "Cici", owner_email: "cici@acme.test", program_id: P, result_num: "3400",
  d_need: true, d_who: "dodi@acme.test", d_name: "Dodi", d_due: plus(1), d_status: "belum" } });
assert.equal(r.status, 200);
const K1 = r.j.id;
notif = (await today("?email=dodi@acme.test")).notif;
assert.ok(notif.items.some((n) => n.title === "Permintaan visual: Story ajakan kelas"), "desainer diberi tahu permintaan visual");
const k1 = (await call("/api/items?id=" + K1, { ck: DES })).j;
await call("/api/items", { ck: DES, body: { ...k1, d_status: "selesai" } });
assert.ok((await today("?email=cici@acme.test")).notif.items.some((n) => n.title === 'Visual "Story ajakan kelas": Selesai'), "peminta tahu visual selesai");
assert.ok(!(await today("?email=cici@acme.test")).notif.items.some((n) => /penanggung jawab/.test(n.title)), "menunjuk diri sendiri tidak membuat notifikasi");
await call("/api/items", { ck: PART, body: { kind: "artikel", title: "Artikel liputan kelas", date: plus(3), channel: "Website", owner: "Cici", owner_email: "cici@acme.test", program_id: P } });
assert.ok((await today("?email=cici@acme.test")).notif.items.some((n) => n.title === "Kamu penanggung jawab: Artikel liputan kelas" && /ditunjuk Pia/.test(n.body)));

/* ---------- laporan program ---------- */
let rep = (await call(`/api/program-report?from=${plus(0)}&to=${plus(30)}`, { ck: COPY })).j;
assert.deepEqual(rep.programs.map((p) => p.title).sort(), ["Kelas investasi Kampus X", "Program admin"], "program yang berjalan di periode itu (yang tanggalnya sudah lewat tidak)");
const rp = rep.programs.find((p) => p.id === P);
assert.deepEqual(rp.items.map((i) => i.title), ["Story ajakan kelas", "Artikel liputan kelas"]);
assert.deepEqual(rp.tasks.map((x) => [x.title, x.status]), [["Visual banner acara", "selesai"], ["Caption & email undangan", "belum"]]);
rep = (await call("/api/program-report?id=" + P, { ck: COPY })).j;
assert.equal(rep.programs.length, 1);
assert.deepEqual((await call(`/api/program-report?from=${plus(40)}&to=${plus(50)}`, { ck: COPY })).j.programs, []);

/* ---------- hapus program: tugas ikut terhapus, kegiatan terkait dilepas ---------- */
assert.equal((await call("/api/items/delete", { ck: PART, body: { id: P } })).status, 200);
assert.deepEqual((await call("/api/tasks?item=" + P, { ck: PART })).j, []);
assert.equal((await call("/api/items?id=" + K1, { ck: PART })).j.program_id, "");

/* ---------- sesi lama tanpa role di tiket memakai role tersimpan ---------- */
env.DB.db.prepare("INSERT INTO users (email, name, role) VALUES ('lama@acme.test', 'Lama', 'partnership')").run();
assert.equal((await call("/api/items", { ck: OLD, body: { ...prog, title: "Program dari sesi lama" } })).status, 200);

/* ---------- halaman ---------- */
const pg = await planner.fetch(new Request(BASE + "/", { headers: { cookie: PART } }), env, { waitUntil() { } });
const html = await pg.text(), cfg = JSON.parse(/window\.PL=(.*?);<\/script>/s.exec(html)[1]);
assert.deepEqual([cfg.me.role, cfg.me.assign], ["partnership", true]);
assert.equal(cfg.roles.partnership, "Partnership");
const cfg2 = JSON.parse(/window\.PL=(.*?);<\/script>/s.exec(await (await planner.fetch(new Request(BASE + "/", { headers: { cookie: COPY } }), env, { waitUntil() { } })).text())[1]);
assert.deepEqual([cfg2.me.role, cfg2.me.assign], ["copy", false]);
for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(code);

/* ---------- fungsi murni ---------- */
const due = dueNotifs("x@a.test", "2026-10-20", [{ id: "a", title: "A", due: "2026-10-21", item_title: "P" }, { id: "b", title: "B", due: "2026-10-20" }, { id: "c", title: "C", due: "2026-10-18" }, { id: "d", title: "D", due: "2026-10-25" }],
  [{ id: "v", title: "Banner", d_due: "2026-10-19", date: "2026-10-22" }]);
assert.deepEqual(due.map((n) => n.title), ["Tenggat besok: A", "Tenggat hari ini: B", "Lewat tenggat: C", "Lewat tenggat: visual Banner"]);
assert.equal(new Set(due.map((n) => n.key)).size, 4);
assert.deepEqual(itemNotifs(null, { kind: "konten", title: "X", date: "2026-10-21", owner_email: "a@a.test" }, "i", "a@a.test", "A"), [], "tidak memberi tahu diri sendiri");
assert.equal(taskNotifs({ who: "d@a.test", status: "belum", due: "x", brief: "", title: "T" }, { who: "d@a.test", status: "belum", due: "y", brief: "", title: "T", item_id: "p", by_email: "p@a.test" }, { title: "P" }, "p@a.test", "Pia", true)[0].title, "Tugas diperbarui: T");

console.log("semua cek lolos");
