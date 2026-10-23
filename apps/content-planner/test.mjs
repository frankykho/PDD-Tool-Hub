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
const { default: planner, dueNotifs, itemNotifs, taskNotifs, seen } = await import("./worker.js");

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
// login lewat tiket Tool Hub: user biasa (tanpa role, bukan admin) tidak menjadi anggota; yang punya role / admin menjadi anggota
await seen(env, { e: "eka@acme.test", n: "Eka", j: "" });
await seen(env, { e: "adm2@acme.test", n: "Adm", j: "", adm: true });
await seen(env, { e: "fajar@acme.test", n: "Fajar", j: "sosmed" });
U = (await call("/api/users", { ck: PART })).j.map((u) => u.email);
assert.ok(!U.includes("eka@acme.test"), "user biasa tidak bisa dipilih sebagai penerima tugas");
assert.ok(U.includes("adm2@acme.test") && U.includes("fajar@acme.test"));
// role dicabut admin: login berikutnya (tiket tanpa role) mengeluarkannya dari daftar anggota
await seen(env, { e: "cici@acme.test", n: "Cici", j: "" });
assert.ok(!(await call("/api/users", { ck: PART })).j.some((u) => u.email === "cici@acme.test"), "role dicabut -> bukan anggota lagi");
await seen(env, { e: "cici@acme.test", n: "Cici", j: "copy" });
await hub("/__hub/users", { users: [{ email: "pia@acme.test", name: "Pia", job: "partnership" }, { email: "dodi@acme.test", name: "Dodi", job: "design" }, { email: "cici@acme.test", name: "Cici", job: "copy" }] });
assert.deepEqual((await call("/api/users", { ck: PART })).j.map((u) => [u.email, u.role]), [["cici@acme.test", "copy"], ["dodi@acme.test", "design"], ["pia@acme.test", "partnership"]], "sinkron hub tetap jadi acuan");

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

/* ---------- persetujuan konten ---------- */
const { approvalStep, postKey, cleanMetricRow, utmUrl, channelOf, BOT_UA } = await import("./worker.js");
const K = { kind: "konten", title: "T", date: "2026-11-01", approver_email: "ap@a.test", approver: "Ap", copy: "c" };
assert.deepEqual(approvalStep(null, { ...K, approver_email: "" }).cols.approval, "", "tanpa penyetuju = tanpa persetujuan");
let s = approvalStep(null, { ...K, status: "draf" }, "me@a.test", "Me");
assert.equal(s.cols.approval, ""); assert.equal(s.notifs.length, 0);
s = approvalStep({ ...K, status: "draf", approval: "" }, { ...K, status: "review" }, "me@a.test", "Me");
assert.equal(s.cols.approval, "menunggu"); assert.equal(s.notifs[0].email, "ap@a.test"); assert.match(s.notifs[0].title, /^Minta persetujuan/);
assert.match(approvalStep({ ...K, status: "review", approval: "menunggu" }, { ...K, status: "terbit" }).error, /perlu disetujui Ap/, "belum disetujui tidak boleh terbit");
const ok = { ...K, status: "review", approval: "disetujui", approved_by: "Ap", approved_at: "2026-10-01T00:00:00Z" };
s = approvalStep(ok, { ...K, status: "terbit" });
assert.equal(s.cols.approval, "disetujui"); assert.equal(s.cols.approved_by, "Ap");
s = approvalStep(ok, { ...K, status: "review", copy: "caption baru" }, "me@a.test", "Me");
assert.equal(s.cols.approval, "menunggu", "caption diubah setelah disetujui -> menunggu lagi");
assert.match(s.notifs[0].title, /^Cek ulang/); assert.equal(s.cols.approved_by, "");
assert.equal(approvalStep({ ...ok, status: "terbit" }, { ...K, status: "terbit", copy: "ralat" }).cols.approval, "disetujui", "sudah terbit: ralat tidak memblokir");
assert.equal(approvalStep({ ...K, status: "review", approval: "menunggu" }, { ...K, status: "draf" }).cols.approval, "", "kembali ke draf membatalkan permintaan");
assert.equal(approvalStep(ok, { ...K, approver_email: "lain@a.test", status: "review" }, "me@a.test").cols.approval, "menunggu", "penyetuju baru mulai lagi");
assert.equal(approvalStep(null, { ...K, kind: "edukasi", status: "selesai" }).cols.approval, "", "edukasi tanpa persetujuan");

// alur lewat API: Cici minta persetujuan Pia -> Pia meminta revisi -> Cici ubah -> Pia setujui -> terbit
const CI = await cookie({ e: "cici@acme.test", n: "Cici", j: "copy" });
const base = { kind: "konten", title: "Reels RDPU", date: plus(3), channel: "IG Reels", status: "review", copy: "Mulai dari Rp10 ribu.", approver: "Pia", approver_email: "pia@acme.test", owner: "Cici", owner_email: "cici@acme.test" };
r = await call("/api/items", { ck: CI, body: base });
assert.equal(r.status, 200);
const cid = r.j.id;
let it = (await call("/api/items?id=" + cid, { ck: CI })).j;
assert.equal(it.approval, "menunggu");
assert.ok((await today("?email=pia@acme.test")).notif.items.some((n) => n.title === "Minta persetujuan: Reels RDPU"));
assert.equal((await call("/api/approvals", { ck: PART })).j[0].id, cid);
assert.equal((await call("/api/approval", { ck: CI, body: { id: cid, action: "setujui", checked: true } })).status, 400, "bukan penyetuju");
assert.equal((await call("/api/approval", { ck: PART, body: { id: cid, action: "setujui" } })).status, 400, "wajib centang cek kepatuhan");
assert.equal((await call("/api/approval", { ck: PART, body: { id: cid, action: "revisi" } })).status, 400, "revisi wajib catatan");
assert.equal((await call("/api/approval", { ck: PART, body: { id: cid, action: "revisi", note: "Tambah S&K" } })).status, 200);
it = (await call("/api/items?id=" + cid, { ck: CI })).j;
assert.deepEqual([it.approval, it.status, it.approval_note], ["revisi", "draf", "Tambah S&K"]);
assert.ok((await today("?email=cici@acme.test")).notif.items.some((n) => n.title === "Perlu revisi: Reels RDPU"));
assert.equal((await call("/api/items", { ck: CI, body: { ...it, status: "terbit" } })).status, 400, "revisi belum disetujui tidak bisa terbit");
await call("/api/items", { ck: CI, body: { ...it, copy: it.copy + " S&K berlaku.", status: "review" } });
assert.equal((await call("/api/approval", { ck: PART, body: { id: cid, action: "setujui", checked: true, note: "OK" } })).status, 200);
it = (await call("/api/items?id=" + cid, { ck: CI })).j;
assert.deepEqual([it.approval, it.approved_by], ["disetujui", "Pia"]);
assert.equal((await call("/api/items", { ck: CI, body: { ...it, status: "terbit" } })).status, 200, "sudah disetujui -> boleh terbit");
await call("/api/comments", { ck: DES, body: { item_id: cid, text: "Visual siap" } });
const C = (await call("/api/comments?item=" + cid, { ck: CI })).j;
assert.deepEqual(C.map((c) => c.kind), ["revisi", "disetujui", "komentar"]);
assert.ok((await today("?email=cici@acme.test")).notif.items.some((n) => n.title === "Komentar: Reels RDPU"));
assert.equal((await call("/api/comments", { ck: DES, body: { item_id: cid, text: " " } })).status, 400);

/* ---------- link pelacak ---------- */
assert.equal(utmUrl("https://acme.test/p?x=1", { channel: "IG Reels", title: "Reels RDPU!" }, "abc123"), "https://acme.test/p?x=1&utm_source=instagram&utm_medium=social&utm_campaign=reels-rdpu&utm_content=abc123");
assert.match(utmUrl("https://acme.test/?utm_source=wa", { channel: "Website", title: "a" }, "k"), /utm_source=wa&utm_medium=social/, "UTM yang sudah ada tidak ditimpa");
assert.equal((await call("/api/links", { ck: CI, body: { item_id: cid, target: "javascript:alert(1)" } })).status, 400);
r = await call("/api/links", { ck: CI, body: { item_id: cid, target: "acme.test/app", utm: true } });
assert.equal(r.status, 200); assert.match(r.j.code, /^[a-z0-9]{6}$/);
const code = r.j.code;
const hit = (ua) => planner.fetch(new Request(BASE + "/go/" + code, { headers: { "user-agent": ua } }), env, { waitUntil: (p) => p });
let g = await hit("Mozilla/5.0 (iPhone)");
assert.equal(g.status, 302); assert.match(g.headers.get("location"), /^https:\/\/acme\.test\/app\?utm_source=instagram/);
await hit("WhatsApp/2.23"); await hit("facebookexternalhit/1.1"); await hit("Mozilla/5.0 Chrome");
await new Promise((res) => setTimeout(res, 20));
assert.equal((await call("/api/links?item=" + cid, { ck: CI })).j[0].clicks, 2, "pratinjau chat tidak dihitung");
assert.equal((await call("/api/items?id=" + cid, { ck: CI })).j.clicks, 2);
assert.equal((await planner.fetch(new Request(BASE + "/go/zzzzzz"), env, { waitUntil() {} })).status, 404);
assert.ok(BOT_UA.test("TelegramBot (like TwitterBot)") && !BOT_UA.test("Mozilla/5.0 (Linux; Android 14)"));

/* ---------- angka performa: impor CSV ---------- */
assert.equal(postKey("https://www.instagram.com/reel/C9xYz_1/?igsh=abc"), "ig:C9xYz_1");
assert.equal(postKey("https://instagram.com/akunku/p/C9xYz_1"), "ig:C9xYz_1");
assert.equal(postKey("https://www.tiktok.com/@kisi/video/7312345678901234567?lang=id"), "tt:7312345678901234567");
assert.equal(postKey("https://youtu.be/AbCdEf12345"), "yt:AbCdEf12345");
assert.equal(postKey("https://www.Acme.test/Blog/a/?utm=1"), "acme.test/blog/a");
assert.equal(postKey(""), "");
assert.equal(channelOf("Reel IG", "https://www.instagram.com/reel/x"), "IG Reels");
assert.equal(channelOf("IG carousel", "https://www.instagram.com/p/x"), "IG Feed");
assert.equal(cleanMetricRow({ link: "https://www.instagram.com/p/X1/", m_views: "" }), null, "tanpa angka dilewati");
assert.deepEqual(cleanMetricRow({ link: "https://www.instagram.com/p/X1/", date: "2026-10-01", m_reach: "1.234", m_likes: "56" }).m_reach, 1234);
await call("/api/items", { ck: CI, body: { ...it, link: "https://www.instagram.com/reel/RR1/" } });
r = await call("/api/metrics/import", { ck: CI, body: { rows: [
  { link: "https://www.instagram.com/reel/RR1/?igsh=1", date: plus(3), m_views: "5000", m_reach: "3200", m_likes: "210", m_comments: "12", m_saves: "40", m_shares: "9" },
  { link: "https://www.instagram.com/p/NEW1/", date: plus(1), title: "Tips  DCA", type: "IG carousel", m_reach: "900", m_likes: "30" },
] } });
assert.deepEqual([r.j.matched, r.j.created, r.j.unmatched], [1, 0, 1]);
it = (await call("/api/items?id=" + cid, { ck: CI })).j;
assert.deepEqual([it.m_views, it.m_reach, it.m_src, it.result_num], [5000, 3200, "csv", 3200]);
r = await call("/api/metrics/import", { ck: CI, body: { create: true, rows: [{ link: "https://www.instagram.com/p/NEW1/", date: plus(1), title: "Tips  DCA", type: "IG carousel", m_reach: "900", m_likes: "30" }] } });
assert.equal(r.j.created, 1);
const L = (await call(`/api/items?from=${plus(0)}&to=${plus(5)}`, { ck: CI })).j.find((i) => i.link === "https://www.instagram.com/p/NEW1/");
assert.deepEqual([L.title, L.channel, L.status, L.m_reach, L.kind], ["Tips DCA", "IG Feed", "terbit", 900, "konten"]);
assert.equal((await call("/api/metrics/import", { ck: CI, body: { rows: [{ link: "x" }] } })).status, 400);
// isi manual lewat form: sumber "manual", hasil laporan ikut jangkauan
await call("/api/items", { ck: CI, body: { ...L, m_reach: "1000" } });
const L2 = (await call("/api/items?id=" + L.id, { ck: CI })).j;
assert.deepEqual([L2.m_reach, L2.m_src, L2.result_num], [1000, "manual", 1000]);

// jendela bookmarklet Instagram: perlu login, skripnya sah
assert.equal((await planner.fetch(new Request(BASE + "/ig-sync?n=3"), env)).status, 303);
const sync = await planner.fetch(new Request(BASE + "/ig-sync?n=3", { headers: { cookie: CI } }), env);
const sh = await sync.text();
assert.match(sh, /Angka Instagram/); assert.equal(sync.headers.get("content-security-policy"), "frame-ancestors 'none'");
for (const [, code] of sh.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(code);
assert.ok(/instagram\\\.com\$/.test(sh), "hanya menerima pesan dari instagram.com");

/* ---------- kalender momen ---------- */
r = await call("/api/moments?from=2026-12-20&to=2026-12-31", { ck: CI });
assert.ok(r.j.some((m) => m.name === "Hari Ibu" && m.date === "2026-12-22"));
assert.ok(r.j.some((m) => m.name === "Tanggal gajian" && m.payday));
assert.equal((await call("/api/moments", { ck: CI, body: { date: "2026-12-24", name: "" } })).status, 400);
r = await call("/api/moments", { ck: CI, body: { date: "2026-12-24", name: "Masa penawaran SR025", idea: "Edukasi sukuk ritel" } });
const mid = r.j.id;
const tm = (await call("/api/moments?from=2026-12-20&to=2026-12-31", { ck: CI })).j.find((m) => m.id === mid);
assert.deepEqual([tm.type, tm.created_by], ["tim", "Cici"]);
assert.equal((await call("/api/moments/delete", { ck: DES, body: { id: mid } })).status, 400, "bukan pembuatnya");
assert.equal((await call("/api/moments/delete", { ck: CI, body: { id: mid } })).status, 200);
const { momentsOf, hijriToIso, easter } = await import("../../shared/moments.js");
assert.equal(easter(2026), "2026-04-05"); assert.equal(easter(2027), "2027-03-28");
assert.equal(hijriToIso(1447, 10, 1), "2026-03-20", "Idul Fitri 1447 H (perkiraan)");
const m26 = momentsOf(2026);
assert.ok(m26.find((m) => m.name === "Idul Adha").date === "2026-05-27" && m26.find((m) => m.name === "Idul Adha").approx);
assert.equal(m26.filter((m) => m.payday).length, 12);
assert.ok(m26.every((m, i) => !i || m26[i - 1].date <= m.date), "urut tanggal");

console.log("semua cek lolos");
