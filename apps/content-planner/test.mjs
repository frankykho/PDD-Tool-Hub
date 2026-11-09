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
assert.equal(r.status, 400); assert.match(r.j.error, /hak Program & tugas/);
r = await call("/api/items", { ck: await cookie({ e: "adm@acme.test", n: "Admin", adm: true }), body: { ...prog, title: "Program admin" } });
assert.equal(r.status, 200, "admin hub boleh membuat program");
r = await call("/api/items", { ck: PART, body: prog });
assert.equal(r.status, 200, JSON.stringify(r.j));
const P = r.j.id;
const saved = (await call("/api/items?id=" + P, { ck: COPY })).j;
assert.deepEqual([saved.partner, saved.end_date, saved.result_num, saved.reach, saved.leads, saved.accounts, saved.aum, saved.budget, saved.cost, saved.d_need, saved.program_id],
  ["BEM Kampus X", plus(20), 250, 12000, 80, 45, 150000000, 10000000, 8500000, 0, ""]);
assert.equal((await call("/api/items", { ck: COPY, body: { ...saved, title: "diubah" } })).status, 403, "selain pembuat / PIC tidak bisa mengubah program");
r = await call("/api/items", { ck: PART, body: { ...prog, title: "Program terbalik", end_date: plus(-5) } });
assert.equal((await call("/api/items?id=" + r.j.id, { ck: PART })).j.end_date, plus(1), "tanggal selesai sebelum mulai -> sama dengan tanggal mulai");
await call("/api/items/delete", { ck: PART, body: { id: r.j.id } });
assert.equal((await call("/api/items", { ck: PART, body: { ...prog, title: "Program lama", date: plus(-40), end_date: plus(-30) } })).status, 200);
assert.equal((await call("/api/programs", { ck: COPY })).j.length, 3);

/* ---------- tugas ---------- */
const task = { item_id: P, title: "Visual banner acara", job: "design", who: "dodi@acme.test", due: plus(1), brief: "Ukuran 1080x1080" };
r = await call("/api/tasks", { ck: COPY, body: task });
assert.equal(r.status, 400); assert.match(r.j.error, /hak Program & tugas/, "hanya role dengan hak Program & tugas yang memberi tugas");
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
// benchmark promo reksa dana kompetitor (Competitor Intelligence lewat service binding)
let benchUrl = "";
env.COMPETITOR = { fetch: async (u, init) => { benchUrl = String(u); assert.equal(init.headers["x-hub-key"], SECRET); return Response.json({ items: [{ title: "Cashback RD", platform: "Sekuritas X", reward_rp: 50000, min_rp: 1e6 }] }); } };
rep = (await call("/api/program-report?id=" + P, { ck: COPY })).j;
assert.equal(rep.bench[0].title, "Cashback RD");
assert.match(benchUrl, /\/__hub\/benchmark\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}&cat=Reksa%20dana/);
env.COMPETITOR = { fetch: async () => { throw new Error("mati"); } };
assert.deepEqual((await call("/api/program-report?id=" + P, { ck: COPY })).j.bench, [], "Competitor mati: laporan tetap jalan");
delete env.COMPETITOR;

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
assert.ok(!html.includes('id="lkTarget"') && html.includes('id="lkStudio"'), "buat link pindah ke Link & QR Studio");
assert.ok(html.includes('"toolhub-apps"') && html.includes('app:"go"'), "halaman mendengar daftar tool & membuka Studio");
assert.ok(html.includes("const canEditItem=") && html.includes("Hanya pembuat, PIC, desainer, atau admin yang bisa mengubah kegiatan ini.") && html.includes("draggable=\"${canEditItem(i)}\""), "form terkunci & tidak bisa digeser bila tidak berhak");
assert.ok(html.includes('["Klik link",int(p.clicks)'), "laporan Program menampilkan klik");
assert.equal(cfg.roles.partnership, "Mutual Fund Partnership Specialist");
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
const { approvalStep, postKey, cleanMetricRow, imgOk, ytId, ogImage, utmUrl, channelOf, BOT_UA } = await import("./worker.js");
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
// gambar postingan (item_img) & repost: ikut impor bookmarklet, unggah manual, terhapus bersama kegiatan
const PNG = "data:image/png;base64,iVBORw0KGgo=";
assert.equal(imgOk(PNG), PNG);
assert.equal(imgOk("data:image/svg+xml;base64,AAAA"), null, "svg ditolak");
assert.equal(imgOk("data:image/png;base64," + "A".repeat(950000)), null, "terlalu besar");
r = await call("/api/metrics/import", { ck: CI, body: { rows: [
  { link: "https://www.instagram.com/reel/RR1/", date: plus(3), m_likes: "250", m_reposts: "7", img: PNG },
  { link: "https://www.instagram.com/p/NEW1/", date: plus(1), m_likes: "31", img: "bukan-gambar" },
] } });
assert.equal(r.j.matched, 2, "gambar rusak tidak menggagalkan angka");
it = (await call("/api/items?id=" + cid, { ck: CI })).j;
assert.equal(it.m_reposts, 7);
assert.deepEqual([it.m_reach, it.m_views], [3200, 5000], "impor bookmark tidak menghapus angka dari CSV/manual");
await call("/api/metrics/import", { ck: CI, body: { rows: [{ link: "https://www.instagram.com/reel/RR1/", m_reach: "3300" }] } });
assert.equal((await call("/api/items?id=" + cid, { ck: CI })).j.m_reposts, 7, "CSV tanpa kolom Reposts tidak menghapus repost");
let im = (await call(`/api/imgs?ids=${cid},${L.id}`, { ck: CI })).j;
assert.deepEqual(Object.keys(im), [cid]); assert.equal(im[cid], PNG);
assert.equal((await call("/api/img", { ck: CI, body: { id: L.id, img: "x" } })).status, 400);
assert.equal((await call("/api/img", { ck: DES, body: { id: L.id, img: PNG } })).status, 403, "bukan pembuat/PIC");
await call("/api/img", { ck: CI, body: { id: L.id, img: PNG } });
await call("/api/img", { ck: CI, body: { id: cid, img: "" } });
im = (await call(`/api/imgs?ids=${cid},${L.id}`, { ck: CI })).j;
assert.deepEqual(Object.keys(im), [L.id], "img kosong = hapus");
await call("/api/items/delete", { ck: CI, body: { id: L.id } });
assert.deepEqual((await call(`/api/imgs?ids=${L.id}`, { ck: CI })).j, {}, "ikut terhapus bersama kegiatan");
// Laporan Copywriter: gambar dari link artikel / YouTube & statistik YouTube
assert.equal(ytId("https://www.youtube.com/watch?v=abcDEF12345&t=3"), "abcDEF12345");
assert.equal(ytId("https://youtu.be/abcDEF12345"), "abcDEF12345");
assert.equal(ytId("https://youtube.com/shorts/abcDEF12345"), "abcDEF12345");
assert.equal(ytId("https://example.com/v=abc"), "");
assert.equal(ogImage('<meta property="og:image" content="/img/a.jpg">', "https://kisi.co.id/artikel/x"), "https://kisi.co.id/img/a.jpg");
assert.equal(ogImage('<meta name="twitter:image" content="https://cdn.x/b.png">', "https://x"), "https://cdn.x/b.png");
assert.equal(ogImage("<p>tanpa</p>", "https://x"), "");
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => String(u).includes("artikel")
    ? new Response('<meta property="og:image" content="https://cdn.test/a.jpg">', { headers: { "content-type": "text/html" } })
    : String(u).includes("googleapis.com/youtube")
    ? Response.json({ items: [{ id: "abcDEF12345", statistics: { viewCount: "1200", likeCount: "45", commentCount: "6" } }] })
    : new Response(new Uint8Array([255, 216, 255]), { headers: { "content-type": "image/jpeg" } });
  try {
    r = await planner.fetch(new Request(BASE + "/api/linkimg?url=" + encodeURIComponent("https://kisi.test/artikel/a"), { headers: { cookie: CI } }), env);
    assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/jpeg");
    for (const bad of ["http://kisi.test/a", "https://127.0.0.1/a", "https://localhost/a", "javascript:alert(1)"])
      assert.equal((await planner.fetch(new Request(BASE + "/api/linkimg?url=" + encodeURIComponent(bad), { headers: { cookie: CI } }), env)).status, 400, bad);
    const yid = (await call("/api/items", { ck: CI, body: { kind: "konten", channel: "YouTube", title: "Video", date: plus(2), status: "terbit", link: "https://youtu.be/abcDEF12345", m_shares: "3" } })).j.id;
    assert.deepEqual((await call("/api/yt/refresh", { ck: CI, body: { ids: [yid] } })).j, { updated: 0, skipped: "no-key" });
    env.YOUTUBE_API_KEY = "k";
    assert.equal((await call("/api/yt/refresh", { ck: CI, body: { ids: [yid] } })).j.updated, 1);
    const yv = (await call("/api/items?id=" + yid, { ck: CI })).j;
    assert.deepEqual([yv.m_views, yv.m_likes, yv.m_comments, yv.m_shares, yv.m_src], [1200, 45, 6, 3, "yt"]);
  } finally { delete env.YOUTUBE_API_KEY; globalThis.fetch = realFetch; }
}
// email blast dari Email Studio (/__hub/email): buat / perbarui kegiatan, link pelacak dipakai ulang, gambar email
{
  const hub = (b, key = SECRET) => planner.fetch(new Request(BASE + "/__hub/email", { method: "POST", headers: { ...(key ? { "x-hub-key": key } : {}), "content-type": "application/json" }, body: JSON.stringify(b) }), env).then(async (x) => ({ status: x.status, j: await x.json().catch(() => null) }));
  const by = { email: "cici@acme.test", name: "Cici", job: "copy" };
  const e1 = await hub({ by, item: { title: "Promo RD Oktober", date: plus(1), email_tpl: "Promo Reksa Dana" }, target: "https://kisi.test/promo?utm_campaign=x", img: PNG });
  assert.equal(e1.status, 200, JSON.stringify(e1.j)); assert.match(e1.j.url, /\/go\/[a-z0-9]{6}$/);
  const e2 = await hub({ by, id: e1.j.id, item: { title: "Promo RD Oktober (rev)", date: plus(1), email_tpl: "Promo Reksa Dana" }, target: "https://kisi.test/promo?utm_campaign=x" });
  assert.deepEqual([e2.j.id, e2.j.code], [e1.j.id, e1.j.code], "tekan ulang = perbarui, link dipakai ulang");
  const ev = (await call("/api/items?id=" + e1.j.id, { ck: CI })).j;
  assert.deepEqual([ev.kind, ev.channel, ev.title, ev.email_tpl, ev.owner_email], ["artikel", "Email / Newsletter", "Promo RD Oktober (rev)", "Promo Reksa Dana", "cici@acme.test"]);
  assert.ok((await call("/api/imgs?ids=" + e1.j.id, { ck: CI })).j[e1.j.id], "gambar email tersimpan");
  const e3 = await hub({ by, id: e1.j.id, item: { title: "Promo RD Oktober (rev)", date: plus(1) }, target: "https://kisi.test/lain" });
  assert.equal(e3.j.id, e1.j.id); assert.notEqual(e3.j.code, e1.j.code, "tujuan beda = link baru");
  assert.equal((await hub({ by: { email: "dodi@acme.test", name: "Dodi" }, id: e1.j.id, item: { title: "x", date: plus(1) }, target: "https://kisi.test/" })).status, 403);
  assert.equal((await hub({ by, item: { title: "x", date: plus(1) }, target: "ftp://x" })).status, 400);
  assert.equal((await hub({ by, item: { title: "x", date: plus(1) }, target: "https://kisi.test/" }, "")).status, 403, "tanpa x-hub-key");
}

// jendela bookmarklet Instagram: perlu login, skripnya sah
assert.equal((await planner.fetch(new Request(BASE + "/ig-sync?n=3"), env)).status, 303);
const sync = await planner.fetch(new Request(BASE + "/ig-sync?n=3", { headers: { cookie: CI } }), env);
const sh = await sync.text();
assert.match(sh, /Angka Instagram/); assert.equal(sync.headers.get("content-security-policy"), "frame-ancestors 'none'");
for (const [, code] of sh.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(code);
assert.ok(/instagram\\\.com\$/.test(sh), "hanya menerima pesan dari instagram.com");
assert.match(sh, /Repost/, "kolom repost di jendela sinkron");
assert.ok(/\^data:image/.test(sh), "thumbnail hanya dari data URL gambar");
{ // bookmarklet: skripnya sah, ikut mengambil gambar (±480px) & repost
  const bm = fs.readFileSync(new URL("./page.html", import.meta.url), "utf8").match(/function plBookmark\(W\)\{[\s\S]*?\n\}\n/)[0];
  new Function("return " + bm);
  assert.match(bm, /image_versions2/); assert.match(bm, /repost_count/); assert.match(bm, /mx=480/);
  // ?__a=1 sudah tidak melayani data: daftar postingan profil & info per postingan dicoba lebih dulu
  assert.match(bm, /\/api\/v1\/feed\/user\//); assert.match(bm, /\/api\/v1\/media\//);
  assert.match(sh, /Instagram menjawab/, "alasan gagal yang asli ditampilkan, bukan selalu \"login dulu\"");
  const pg = fs.readFileSync(new URL("./page.html", import.meta.url), "utf8");
  assert.match(pg, /id="mReposts"/); assert.match(pg, /id="mImgF"/); assert.match(pg, /api\("\/api\/img",/);
  assert.ok(pg.indexOf('["m_reposts",/') > 0 && pg.indexOf('["m_reposts",/') < pg.indexOf('["m_shares",/'), "CSV: kolom Reposts tidak tertangkap Bagikan");
  // Laporan IG: jenis laporan sendiri, blok kartu "posts" dirender di PDF & PPT
  assert.match(pg, /data-t="ig">Laporan IG</); assert.match(pg, /ig:\{data:igData,doc:igDoc,name:"Laporan Instagram"\}/);
  assert.match(pg, /b\.t==="posts"\)\{/, "pdfDoc"); assert.match(pg, /b\.t==="posts"\)await posts\(b\)/, "pptDoc");
  // PPT: ukuran asli gambar dikirim ke addImage supaya sizing cover memotong, bukan menarik (gambar IG 4:5 / 9:16)
  assert.match(pg, /w:r\.w\*sc,h:r\.h\*sc,sizing:\{type:"cover",w:im,h:im\}/);
  // Laporan Copywriter & gambar / angka otomatis setelah kegiatan disimpan
  assert.match(pg, /data-t="cw">Laporan Copywriter</); assert.match(pg, /cw:\{data:cwData,doc:cwDoc,name:"Laporan Copywriter"\}/);
  assert.match(pg, /api\("\/api\/yt\/refresh"/); assert.match(pg, /"\/api\/linkimg\?url="/); assert.match(pg, /id="mImgLink"/);
}

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
/* ---------- pekerjaan harian: semua bisa lihat, hanya pemilik yang mengubah, dikelompokkan per role ---------- */
{
  const log = (ck, body) => call("/api/logs", { ck, body });
  const KG = (await call("/api/items", { ck: COPY, body: { kind: "konten", title: "Promo RDPU November", date: wib, channel: "IG Feed", status: "draf" } })).j.id;
  r = await log(COPY, { date: wib, text: "Revisi caption promo", status: "selesai", item_id: KG, link: "contoh.test/hasil" });
  assert.equal(r.status, 200, JSON.stringify(r.j)); const L1 = r.j.id;
  assert.equal((await log(COPY, { date: wib, text: "  " })).status, 400, "isian kosong ditolak");
  assert.equal((await log(COPY, { date: wib, text: " - " })).status, 400, "isian cuma tanda ditolak");
  assert.equal((await log(COPY, { date: wib, text: "..." })).status, 400, "isian cuma titik ditolak");
  assert.equal((await log(COPY, { date: plus(1), text: "besok" })).status, 400, "hari yang belum datang ditolak");
  r = await log(DES, { date: plus(-1), text: "Banner webinar", status: "kendala", note: "tunggu foto narasumber", item_id: "tidak-ada" });
  assert.equal(r.status, 200); const L2 = r.j.id;
  assert.equal((await log(DES, { id: L1, date: wib, text: "ubah punya orang" })).status, 400, "bukan pemiliknya");
  const all = (await call(`/api/logs?from=${plus(-1)}&to=${wib}`, { ck: PART })).j;
  assert.deepEqual(all.map((x) => [x.name, x.job, x.status]), [["Dodi", "design", "kendala"], ["Cici", "copy", "selesai"]], "urut tanggal, role pemilik tercatat");
  assert.equal(all[1].item_title, "Promo RDPU November", "judul kegiatan terkait ikut");
  assert.equal(all[1].link, "https://contoh.test/hasil");
  assert.equal(all[0].item_id, null, "kegiatan yang tidak ada dilepas");
  assert.equal((await log(COPY, { id: L1, date: wib, text: "Revisi caption promo RDPU", status: "berjalan" })).status, 200);
  assert.equal((await call(`/api/logs?from=${wib}&to=${wib}`, { ck: DES })).j[0].text, "Revisi caption promo RDPU");
  assert.equal((await call(`/api/logs?from=2026-01-01&to=2026-12-31`, { ck: PART })).status, 400, "periode maks. 3 bulan");
  assert.equal((await call("/api/logs/delete", { ck: COPY, body: { id: L2 } })).status, 400, "hapus milik orang lain ditolak");
  const ADM = await cookie({ e: "adm@acme.test", n: "Admin", adm: true });
  assert.equal((await call("/api/logs/delete", { ck: ADM, body: { id: L2 } })).status, 200, "admin boleh menghapus");
  assert.equal((await call(`/api/logs?from=${plus(-1)}&to=${wib}`, { ck: PART })).j.length, 1);
}
/* ---------- posting WA Channel: jumlah per hari/orang/jenis, disimpan sekaligus lewat tombol Simpan ---------- */
{
  const wa = (ck, body) => call("/api/wa", { ck, body });
  assert.deepEqual((await wa(COPY, { date: wib, n: { insight: 2, berita: 0 } })).j.n, { insight: 2, berita: 0 });
  assert.deepEqual((await wa(COPY, { date: wib, n: { insight: 1 } })).j.n, { insight: 1 }, "angka diganti, bukan ditambah");
  assert.equal((await wa(COPY, { date: plus(-1), n: { stockpick: 0 } })).status, 200, "0 boleh");
  assert.equal((await wa(DES, { date: plus(-1), n: { berita: 1 } })).status, 200);
  assert.equal((await wa(COPY, { date: plus(1), n: { insight: 1 } })).status, 400, "hari yang belum datang ditolak");
  assert.equal((await wa(COPY, { date: wib, n: { gosip: 1 } })).status, 400, "jenis tidak dikenal ditolak");
  assert.equal((await wa(COPY, { date: wib, n: { insight: -1 } })).status, 400, "tidak boleh di bawah 0");
  assert.equal((await wa(COPY, { date: wib, n: { insight: 1.5 } })).status, 400, "harus bilangan bulat");
  assert.equal((await wa(COPY, { date: wib, n: { insight: 1000 } })).status, 400, "batas atas");
  assert.equal((await wa(COPY, { date: wib, n: {} })).status, 400, "kosong ditolak");
  const rows = (await call(`/api/wa?from=${plus(-1)}&to=${wib}`, { ck: PART })).j;
  assert.deepEqual(rows.map((x) => [x.name, x.job, x.kind, x.n]), [["Dodi", "design", "berita", 1], ["Cici", "copy", "insight", 1]], "jumlah 0 tidak ikut, role pencatat tersimpan");
  assert.equal((await call(`/api/wa?from=2024-01-01&to=2026-12-31`, { ck: PART })).status, 400, "periode maks. 1 tahun");
}

/* ---------- dua orang mengubah kegiatan yang sama: versi lama tidak menimpa diam-diam ---------- */
{
  const id = (await call("/api/items", { ck: COPY, body: { kind: "konten", title: "Konten bersama", date: plus(3), channel: "IG Feed", status: "ide", copy: "caption awal", d_need: true, d_who: "dodi@acme.test", d_name: "Dodi" } })).j.id;
  const v1 = (await call("/api/items?id=" + id, { ck: COPY })).j;           // Cici & Dodi membuka versi yang sama
  assert.equal((await call("/api/items", { ck: COPY, body: { ...v1, copy: "caption baru Cici", base: v1.updated_at } })).status, 200);
  r = await call("/api/items", { ck: DES, body: { ...v1, status: "draf", base: v1.updated_at } });
  assert.equal(r.status, 409, "Dodi masih memegang versi lama"); assert.equal(r.j.conflict, true); assert.equal(r.j.by, "Cici");
  assert.equal((await call("/api/items?id=" + id, { ck: COPY })).j.copy, "caption baru Cici", "caption Cici tidak tertimpa");
  const v2 = (await call("/api/items?id=" + id, { ck: DES })).j;           // muat versi terbaru, lalu ubah
  assert.equal((await call("/api/items", { ck: DES, body: { ...v2, status: "draf", base: v2.updated_at } })).status, 200);
  assert.deepEqual((({ copy, status }) => [copy, status])((await call("/api/items?id=" + id, { ck: COPY })).j), ["caption baru Cici", "draf"]);
  assert.equal((await call("/api/items", { ck: COPY, body: { ...v1, title: "Versi saya", base: v1.updated_at, force: true } })).status, 200, "tetap simpan versi sendiri");
  assert.equal((await call("/api/items", { ck: COPY, body: { ...v1, title: "Tanpa base (klien lama)" } })).status, 200, "tanpa base tetap bisa menyimpan");
}

/* ---------- Partnership di laporan & tugas ---------- */
{
  // program yang mulai sebelum periode tapi masih berjalan: ikut di laporan (overlap), kalender tetap menurut tanggal mulai
  const id = (await call("/api/items", { ck: PART, body: { ...prog, title: "Program lintas bulan", date: plus(-10), end_date: plus(10), status: "berjalan" } })).j.id;
  const has = async (q) => (await call(`/api/items?from=${wib}&to=${plus(5)}${q}`, { ck: COPY })).j.some((i) => i.id === id);
  assert.equal(await has(""), false, "kalender: menurut tanggal mulai");
  assert.equal(await has("&overlap=1"), true, "laporan: program yang masih berjalan ikut");
  // jenis di luar pilihan ditulis sendiri; kosong jadi "Lainnya"
  const ft = (await call("/api/items", { ck: PART, body: { ...prog, title: "Meeting dengan AM", channel: "Meeting kerja sama" } })).j.id;
  assert.equal((await call("/api/items?id=" + ft, { ck: PART })).j.channel, "Meeting kerja sama");
  const ft2 = (await call("/api/items", { ck: PART, body: { ...prog, title: "Tanpa jenis", channel: " " } })).j.id;
  assert.equal((await call("/api/items?id=" + ft2, { ck: PART })).j.channel, "Lainnya");
  // tanggal selesai sudah lewat tapi status masih "berjalan": tetap ikut; yang sudah selesai tidak
  const late = (await call("/api/items", { ck: PART, body: { ...prog, title: "Program molor", date: plus(-40), end_date: plus(-20), status: "berjalan" } })).j.id;
  const done = (await call("/api/items", { ck: PART, body: { ...prog, title: "Program tuntas", date: plus(-40), end_date: plus(-20), status: "selesai" } })).j.id;
  const rep = (await call(`/api/items?from=${wib}&to=${plus(5)}&overlap=1`, { ck: COPY })).j.map((i) => i.id);
  assert.ok(rep.includes(late) && !rep.includes(done), "program molor ikut, yang selesai tidak");
  // aktivitas: pekerjaan rutin dicatat sekali dengan periode; status Kendala sah; ikut laporan selama periodenya menyentuh
  r = await call("/api/items", { ck: COPY, body: { kind: "aktivitas", title: "Menaikkan Berita Pagi", channel: "Pekerjaan rutin", date: plus(-10), end_date: plus(10), status: "kendala", note: "server lambat" } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  const ak = (await call("/api/items?id=" + r.j.id, { ck: COPY })).j;
  assert.deepEqual([ak.kind, ak.status, ak.end_date, ak.d_need], ["aktivitas", "kendala", plus(10), 0]);
  assert.ok((await call(`/api/items?from=${wib}&to=${plus(5)}&overlap=1`, { ck: COPY })).j.some((i) => i.id === ak.id), "aktivitas lintas periode ikut laporan");
  const ak1 = (await call("/api/items", { ck: COPY, body: { kind: "aktivitas", title: "Rapat tim", date: wib, end_date: plus(-1) } })).j.id;
  assert.deepEqual((({ end_date, status }) => [end_date, status])((await call("/api/items?id=" + ak1, { ck: COPY })).j), ["", "rencana"], "tanggal selesai sebelum mulai diabaikan, status bawaan rencana");
  assert.ok((await call(`/api/program-report?from=${wib}&to=${plus(5)}`, { ck: COPY })).j.programs.some((p) => p.id === late), "laporan program: program molor ikut");
  // anggota Partnership bisa menerima tugas (dari admin atau sesama Partnership)
  r = await call("/api/tasks", { ck: await cookie({ e: "adm@acme.test", n: "Admin", adm: true }), body: { item_id: id, title: "Follow up partner", job: "partnership", who: "pia@acme.test", due: plus(2) } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.ok((await call("/api/tasks?mine=1", { ck: PART })).j.some((t) => t.id === r.j.id && t.job === "partnership"), "tugas muncul di daftar Partnership");
}

/* ---------- tim regional: hanya kegiatan cabang, cabang dari daftar Tool Hub ---------- */
{
  const SALES = await cookie({ e: "sari@acme.test", n: "Sari", j: "sales", c: "Galeri Blok M" });
  await seen(env, { e: "sari@acme.test", n: "Sari", j: "sales", c: "Galeri Blok M" });
  r = await hub("/__hub/users", { users: [{ email: "pia@acme.test", name: "Pia", job: "partnership" }, { email: "cici@acme.test", name: "Cici", job: "copy" },
    { email: "sari@acme.test", name: "Sari", job: "sales", branch: "Galeri Blok M" }, { email: "gani@acme.test", name: "Gani", job: "galeri", branch: "Cabang Surabaya" }],
    branches: [{ r: "Jakarta", c: "Galeri Blok M" }, { r: "Jawa Timur", c: "Cabang Surabaya" }, { r: "", c: "tanpa regional" }] });
  assert.equal(r.status, 200);
  assert.equal((await call("/api/users", { ck: SALES })).j.find((u) => u.email === "sari@acme.test").branch, "Galeri Blok M", "cabang anggota tersimpan");
  const cab = { kind: "cabang", title: "Gathering nasabah", date: wib, channel: "Gathering nasabah", status: "selesai", result_num: "45", leads: "12", accounts: "5", aum: "250.000.000", cost: "3.000.000" };
  // cabang wajib, harus ada di daftar (huruf besar/kecil dirapikan), regionalnya ikut
  assert.equal((await call("/api/items", { ck: SALES, body: { ...cab, branch: "" } })).status, 400, "cabang wajib");
  assert.equal((await call("/api/items", { ck: SALES, body: { ...cab, branch: "Cabang Antah" } })).status, 400, "cabang di luar daftar ditolak");
  const cid = (await call("/api/items", { ck: SALES, body: { ...cab, branch: "galeri blok m", program_id: "x", d_need: true } })).j.id;
  const ci = (await call("/api/items?id=" + cid, { ck: SALES })).j;
  assert.deepEqual([ci.branch, ci.region, ci.result_num, ci.accounts, ci.aum, ci.program_id, ci.d_need], ["Galeri Blok M", "Jakarta", 45, 5, 250000000, "", 0], "regional diisi, program & visual dilepas");
  // tim regional tidak bisa membuat / melihat kegiatan lain
  assert.equal((await call("/api/items", { ck: SALES, body: { kind: "konten", title: "Konten", date: wib } })).status, 400, "regional hanya kegiatan cabang");
  const kid = (await call("/api/items", { ck: COPY, body: { kind: "konten", title: "Konten pusat", date: wib, channel: "IG Feed" } })).j.id;
  const mineR = (await call(`/api/items?from=${wib}&to=${wib}&overlap=1`, { ck: SALES })).j;
  assert.ok(mineR.length && mineR.every((i) => i.kind === "cabang"), "kalender regional: kegiatan cabang saja");
  assert.equal((await call("/api/items?id=" + kid, { ck: SALES })).status, 404, "kegiatan pusat tidak bisa dibuka");
  assert.equal((await call("/api/items", { ck: SALES, body: { ...(await call("/api/items?id=" + kid, { ck: COPY })).j, kind: "cabang", branch: "Galeri Blok M" } })).status, 403, "kegiatan pusat tidak bisa diubah jadi kegiatan cabang");
  assert.deepEqual((await call(`/api/logs?from=${wib}&to=${wib}`, { ck: SALES })).j, [], "pekerjaan harian tim pusat tidak terlihat");
  assert.deepEqual((await call("/api/programs", { ck: SALES })).j, []);
  assert.equal((await call("/api/wa", { ck: SALES, body: { date: wib, n: { insight: 1 } } })).status, 403);
  assert.equal((await call("/api/items/bulk", { ck: SALES, body: { items: [cab] } })).status, 403);
  // tim pusat tetap melihat semuanya; cabang lama yang sudah dihapus dari daftar tetap bisa disimpan
  assert.ok((await call(`/api/items?from=${wib}&to=${wib}`, { ck: COPY })).j.some((i) => i.id === cid), "tim pusat melihat kegiatan cabang");
  await hub("/__hub/users", { users: [{ email: "sari@acme.test", name: "Sari", job: "sales", branch: "Galeri Blok M" }], branches: [{ r: "Jawa Timur", c: "Cabang Surabaya" }] });
  assert.equal((await call("/api/items", { ck: SALES, body: { ...ci, title: "Gathering (revisi)", base: ci.updated_at } })).status, 200, "cabang lama tetap tersimpan");
  assert.equal((await call("/api/items", { ck: SALES, body: { ...cab, branch: "Galeri Blok M" } })).status, 400, "kegiatan baru: cabang yang dihapus ditolak");
  // halaman: jenis kegiatan & cabang bawaan
  const html = await planner.fetch(new Request(BASE + "/paket", { headers: { cookie: SALES } }), env, { waitUntil() { } }).then((x) => x.text());
  const PLc = JSON.parse(html.match(/window\.PL=(\{.*?\});<\/script>/)[1]);
  assert.deepEqual([PLc.mode, Object.keys(PLc.kinds), PLc.me.reg, PLc.me.branch, PLc.branches], ["kalender", ["cabang", "galeri"], true, "Galeri Blok M", [{ r: "Jawa Timur", c: "Cabang Surabaya", t: "cabang" }]]);
  // beranda Tool Hub: tim regional melihat kegiatan cabang hari ini, tim pusat tidak
  assert.ok((await today("?email=sari@acme.test")).today.every((i) => i.kind === "cabang"));
  assert.ok((await today("?email=cici@acme.test")).today.every((i) => i.kind !== "cabang"));
}

/* ---------- rencana galeri baru: tahap + riwayat progres, usulan ke daftar Tool Hub ---------- */
{
  const GANI = await cookie({ e: "gani@acme.test", n: "Gani", j: "galeri", c: "Cabang Surabaya" });
  await seen(env, { e: "gani@acme.test", n: "Gani", j: "galeri", c: "Cabang Surabaya" });
  r = await hub("/__hub/users", { users: [{ email: "gani@acme.test", name: "Gani", job: "galeri", branch: "Cabang Surabaya" }, { email: "cici@acme.test", name: "Cici", job: "copy" }],
    branches: [{ r: "Jawa Timur", c: "Cabang Surabaya" }, { r: "Jawa Timur", c: "Galeri Investasi UB" }, { r: "Jawa Timur", c: "Pojok ITS", t: "galeri" }] });
  assert.equal(r.status, 200);
  const PLg = JSON.parse((await planner.fetch(new Request(BASE + "/", { headers: { cookie: GANI } }), env, { waitUntil() { } }).then((x) => x.text())).match(/window\.PL=(\{.*?\});<\/script>/)[1]);
  assert.deepEqual(PLg.branches.map((x) => x.t), ["cabang", "galeri", "galeri"], "jenis cabang / galeri: tertulis, atau ditebak dari nama");
  const g = { kind: "galeri", title: "Galeri Investasi Unair", date: wib, channel: "Kampus / universitas", status: "penjajakan", partner: "Universitas Airlangga", place: "Surabaya", region: "jawa timur", end_date: plus(60) };
  assert.equal((await call("/api/items", { ck: GANI, body: { ...g, region: "" } })).status, 400, "regional wajib");
  assert.equal((await call("/api/items", { ck: GANI, body: { ...g, region: "Bali" } })).status, 400, "regional di luar daftar ditolak");
  assert.equal((await call("/api/items", { ck: GANI, body: { ...g, branch: "Cabang Antah" } })).status, 400, "cabang pendamping di luar daftar ditolak");
  const gid = (await call("/api/items", { ck: GANI, body: { ...g, branch: "cabang surabaya", progress: "Kenalan dengan dekan FEB" } })).j.id;
  let gi = (await call("/api/items?id=" + gid, { ck: GANI })).j;
  assert.deepEqual([gi.region, gi.branch, gi.partner, gi.place, gi.end_date, gi.program_id, gi.d_need], ["Jawa Timur", "Cabang Surabaya", "Universitas Airlangga", "Surabaya", plus(60), "", 0]);
  // simpan tanpa perubahan tahap & tanpa update: tidak menambah riwayat; pindah tahap tercatat walau tanpa catatan
  await call("/api/items", { ck: GANI, body: { ...gi, note: "catatan umum", base: gi.updated_at } });
  gi = (await call("/api/items?id=" + gid, { ck: GANI })).j;
  await call("/api/items", { ck: GANI, body: { ...gi, status: "proposal", base: gi.updated_at } });
  gi = (await call("/api/items?id=" + gid, { ck: GANI })).j;
  await call("/api/items", { ck: GANI, body: { ...gi, status: "mou", progress: "MoU ditandatangani rektor", base: gi.updated_at } });
  // kolom sheet galeri: jumlah mahasiswa, rank, PIC coordinator mitra, dokumen kerja sama (perubahan dokumen ikut riwayat)
  gi = (await call("/api/items?id=" + gid, { ck: GANI })).j;
  await call("/api/items", { ck: GANI, body: { ...gi, result_num: "12.500", target: "Akreditasi Unggul", audience: "Dr. Rina (Kaprodi)", docs: { surat: { s: "selesai", d: plus(-20) }, bipartit: { s: "proses" }, tripartit: { s: "x" } }, base: gi.updated_at } });
  gi = (await call("/api/items?id=" + gid, { ck: GANI })).j;
  assert.deepEqual([gi.result_num, gi.target, gi.audience, JSON.parse(gi.docs)], [12500, "Akreditasi Unggul", "Dr. Rina (Kaprodi)", { surat: { s: "selesai", d: plus(-20) }, bipartit: { s: "proses", d: "" } }]);
  const [G] = (await call("/api/galeri?id=" + gid, { ck: GANI })).j;
  assert.deepEqual(G.log.map((l) => [l.st, l.text, l.by]), [["penjajakan", "Kenalan dengan dekan FEB", "Gani"], ["proposal", "", "Gani"], ["mou", "MoU ditandatangani rektor", "Gani"],
    ["mou", "Surat permohonan + profil: selesai · PKS bipartit: proses", "Gani"]], "riwayat progres (+ perubahan dokumen)");
  assert.equal((await call("/api/items", { ck: COPY, body: { kind: "konten", title: "Konten x", date: wib, docs: { surat: { s: "selesai" } } } })).status, 200);
  assert.ok(!(await call(`/api/items?from=${wib}&to=${wib}`, { ck: COPY })).j.find((i) => i.title === "Konten x").docs, "jenis lain tanpa dokumen");
  assert.ok((await call(`/api/items?from=${wib}&to=${wib}`, { ck: GANI })).j.some((i) => i.id === gid), "kalender regional memuat rencana galeri");
  assert.equal((await call("/api/galeri", { ck: COPY })).j.length, 1, "tim pusat juga bisa menarik laporannya");
  // impor dari sheet galeri: nama yang sudah ada diperbarui (kolom kosong tidak menimpa, dokumen digabung), yang baru dibuat;
  // regional dari cabang in charge, cabang di luar daftar dikosongkan; Remarks masuk riwayat dengan tanggal Last Update
  r = await call("/api/galeri/import", { ck: GANI, body: { rows: [
    { title: "galeri investasi unair", status: "mou", docs: { tripartit: { s: "proses", d: "" } }, progress: "Menunggu TTD BEI", log_date: plus(-3) },
    { title: "Galeri Investasi ITS", partner: "Institut Teknologi Sepuluh Nopember", branch: "Cabang Surabaya", result_num: "9000", status: "proposal", progress: "Surat permohonan dikirim", log_date: plus(-10) },
    { title: "Galeri Investasi Antah", branch: "Cabang Antah", region: "Jawa Timur" },
    { title: "Galeri tanpa regional" }, { title: "" }] } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.deepEqual([r.j.added, r.j.updated, r.j.errors.map((e) => e.row), r.j.warn.map((w) => w.row)], [2, 1, [4, 5], [3]], JSON.stringify(r.j));
  {
    const L = (await call("/api/galeri", { ck: GANI })).j, un = L.find((i) => i.id === gid), its = L.find((i) => i.title === "Galeri Investasi ITS");
    assert.deepEqual([un.partner, un.result_num, JSON.parse(un.docs).surat.s, JSON.parse(un.docs).tripartit.s, un.log.slice(-1)[0].text, un.log.slice(-1)[0].at.slice(0, 10)],
      ["Universitas Airlangga", 12500, "selesai", "proses", "Menunggu TTD BEI · PKS tripartit: proses", plus(-3)], "galeri lama diperbarui, isian lain tetap");
    assert.deepEqual([its.region, its.branch, its.result_num, its.status, its.owner, its.log[0].text, its.log[0].at.slice(0, 10)], ["Jawa Timur", "Cabang Surabaya", 9000, "proposal", "Gani", "Surat permohonan dikirim", plus(-10)]);
    assert.equal(L.find((i) => i.title === "Galeri Investasi Antah").branch, "");
  }
  // impor ulang sheet yang sama: tanpa perubahan, riwayat tidak dobel
  r = await call("/api/galeri/import", { ck: GANI, body: { rows: [{ title: "Galeri Investasi ITS", status: "proposal", progress: "Surat permohonan dikirim" }] } });
  assert.deepEqual([r.j.added, r.j.updated, r.j.same], [0, 0, 1]);
  // rekan tim galeri mengimpor sheet bersama: galeri buatan Gani tetap diperbarui (impor tidak lewat izin edit form)
  const ADMG = await cookie({ e: "adm@acme.test", n: "Admin", adm: true });
  const GITA = await cookie({ e: "gita@acme.test", n: "Gita", j: "galeri", c: "Cabang Surabaya" });
  r = await call("/api/galeri/import", { ck: GITA, body: { rows: [{ title: "Galeri Investasi ITS", status: "proposal", progress: "Proposal direvisi" }] } });
  assert.deepEqual([r.status, r.j.updated, r.j.errors], [200, 1, []], JSON.stringify(r.j));
  assert.equal((await call("/api/galeri", { ck: GANI })).j.find((i) => i.title === "Galeri Investasi ITS").log.slice(-1)[0].text, "Proposal direvisi");
  // ...tapi impor tidak bisa dipakai menjadikan diri PIC galeri orang lain (lalu mengubahnya lewat form); PIC/admin tetap bisa
  r = await call("/api/galeri/import", { ck: GITA, body: { rows: [{ title: "Galeri Investasi ITS", owner: "Gita", owner_email: "gita@acme.test", progress: "Ambil alih" }] } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.deepEqual((({ owner, owner_email }) => [owner, owner_email])((await call("/api/galeri", { ck: GANI })).j.find((i) => i.title === "Galeri Investasi ITS")), ["Gani", "gani@acme.test"], "PIC tetap");
  r = await call("/api/galeri/import", { ck: GANI, body: { rows: [{ title: "Galeri Investasi ITS", owner: "Gita", owner_email: "gita@acme.test" }] } });
  assert.equal((await call("/api/galeri", { ck: GANI })).j.find((i) => i.title === "Galeri Investasi ITS").owner_email, "gita@acme.test", "PIC lama boleh mengganti PIC lewat sheet");
  assert.equal((await call("/api/galeri/import", { ck: COPY, body: { rows: [] } })).status, 400);
  r = await call("/api/galeri/import", { ck: COPY, body: { rows: [{ title: "Galeri Investasi ITS", progress: "coba" }] } });
  assert.deepEqual([r.status, /Impor galeri/.test(r.j.error)], [400, true], "tanpa hak Impor galeri ditolak");
  assert.equal((await call("/api/galeri/import", { ck: ADMG, body: { rows: [{ title: "Galeri Investasi ITS" }] } })).status, 200, "admin selalu boleh impor");
  // usulan ke admin Tool Hub: sudah MoU, belum ada di daftar; setelah masuk daftar, hilang dari usulan
  const usul = (h) => planner.fetch(new Request(BASE + "/__hub/galeri", { headers: h }), env).then((x) => x.status === 200 ? x.json() : x.status);
  assert.equal(await usul({}), 403, "usulan galeri hanya untuk Tool Hub");
  assert.deepEqual(await usul({ "x-hub-key": SECRET }), [{ id: gid, r: "Jawa Timur", c: "Galeri Investasi Unair", city: "Surabaya", partner: "Universitas Airlangga", status: "mou", by: "Gani" }]);
  await hub("/__hub/users", { users: [{ email: "gani@acme.test", name: "Gani", job: "galeri" }], branches: [{ r: "Jawa Timur", c: "Galeri Investasi Unair", t: "galeri" }] });
  assert.deepEqual(await usul({ "x-hub-key": SECRET }), []);
  assert.ok((await today("?email=cici@acme.test")).today.every((i) => i.kind !== "galeri"), "beranda tim pusat tanpa rencana galeri");
}

/* ---------- tim & role dari Tool Hub: hak akses mengikuti pengaturan role, bukan kunci role tertentu ---------- */
{
  const { DEFAULT_ORG, cleanOrg } = await import("../../shared/jobs.js");
  const org = structuredClone(DEFAULT_ORG);
  org.roles.find((x) => x.k === "copy").assign = true;                                         // Copywriter diberi hak Program & tugas
  org.roles.push({ k: "dm", name: "Digital Marketing", team: "rm" });                            // role baru di tim regional
  org.roles = org.roles.filter((x) => x.k !== "partnership");                                    // role dihapus dari daftar
  r = await hub("/__hub/users", { users: [{ email: "cici@acme.test", name: "Cici", job: "copy" }, { email: "dina@acme.test", name: "Dina", job: "dm" }, { email: "pia@acme.test", name: "Pia", job: "partnership" }], org });
  assert.equal(r.status, 200);
  assert.deepEqual((await call("/api/users", { ck: COPY })).j.filter((u) => ["dina@acme.test", "pia@acme.test"].includes(u.email)).map((u) => [u.email, u.role]), [["dina@acme.test", "dm"], ["pia@acme.test", "partnership"]], "role yang tidak dikenal tidak menimpa catatan lama");
  assert.equal((await call("/api/items", { ck: COPY, body: { ...prog, title: "Program dari Copywriter" } })).status, 200, "hak Program & tugas dari pengaturan role");
  const DM = await cookie({ e: "dina@acme.test", n: "Dina", j: "dm" });
  assert.equal((await call("/api/items", { ck: DM, body: { kind: "konten", title: "Konten", date: wib } })).status, 400, "role baru di tim regional ikut aturan tim regional");
  assert.equal((await call("/api/items", { ck: PART, body: { ...prog, title: "Program dari role yang dihapus" } })).status, 400, "role yang dihapus kehilangan haknya");
  const cfgOf = async (ck) => JSON.parse(/window\.PL=(.*?);<\/script>/s.exec(await (await planner.fetch(new Request(BASE + "/", { headers: { cookie: ck } }), env, { waitUntil() { } })).text())[1]);
  const c1 = await cfgOf(DM);
  assert.deepEqual([c1.me.reg, c1.me.team, c1.me.head, c1.roles.dm, c1.org.teams.map((t) => t.id)], [true, "rm", false, "Digital Marketing", ["pd", "rm"]]);
  const HEAD = await cookie({ e: "hana@acme.test", n: "Hana", j: "head_pd" }), c2 = await cfgOf(HEAD);
  assert.deepEqual([c2.me.team, c2.me.head, c2.me.assign, c2.me.reg], ["pd", true, true, false], "Head of Product Development: pimpinan tim, boleh membuat program");
  // kiriman tanpa org (Tool Hub lama) tidak menghapus pengaturan yang sudah ada
  await hub("/__hub/users", { users: [{ email: "dina@acme.test", name: "Dina", job: "dm" }] });
  assert.equal((await cfgOf(DM)).roles.dm, "Digital Marketing");
  // org rusak / kosong = daftar bawaan; head tanpa tim tidak berlaku; tim yang dihapus = role tanpa tim
  assert.deepEqual(cleanOrg({ roles: [] }), DEFAULT_ORG);
  assert.deepEqual(cleanOrg({ teams: [{ id: "a", name: "A" }], roles: [{ k: "x", name: "X", team: "b", head: true }, { k: "X!", name: "Y" }] }).roles, [{ k: "x", name: "X", team: "", head: false, assign: false, ops: false, gal: false }]);
  await hub("/__hub/users", { users: [{ email: "pia@acme.test", name: "Pia", job: "partnership" }, { email: "cici@acme.test", name: "Cici", job: "copy" }], org: DEFAULT_ORG });
}
const { newKey } = await import("../../shared/jobs.js");
assert.equal(newKey("Digital Marketing Specialist", []), "digital_marketing_specia");
assert.equal(newKey("Sales", ["sales"]), "sales_2");
assert.equal(newKey("2nd Line", []), "r2nd_line");

const { momentsOf, hijriToIso, easter } = await import("../../shared/moments.js");
assert.equal(easter(2026), "2026-04-05"); assert.equal(easter(2027), "2027-03-28");
assert.equal(hijriToIso(1447, 10, 1), "2026-03-20", "Idul Fitri 1447 H (perkiraan)");
const m26 = momentsOf(2026);
assert.ok(m26.find((m) => m.name === "Idul Adha").date === "2026-05-27" && m26.find((m) => m.name === "Idul Adha").approx);
assert.equal(m26.filter((m) => m.payday).length, 12);
assert.ok(m26.every((m, i) => !i || m26[i - 1].date <= m.date), "urut tanggal");

/* ---------- sambungan Event & Lead: pilih kegiatan, sinkron perubahan, angka Peserta & Leads dikunci ---------- */
{
  const { DEFAULT_ORG } = await import("../../shared/jobs.js");
  await hub("/__hub/users", { users: [{ email: "sari@acme.test", name: "Sari", job: "sales", branch: "Cabang Surabaya" }, { email: "pia@acme.test", name: "Pia", job: "partnership" }],
    branches: [{ r: "Jawa Timur", c: "Cabang Surabaya" }, { r: "Jakarta", c: "Cabang Sudirman" }], org: DEFAULT_ORG });
  const SARI = await cookie({ e: "sari@acme.test", n: "Sari", j: "sales", c: "Cabang Surabaya" });
  const hubGet = async (p) => (await call(p, { headers: { "x-hub-key": SECRET } })).j;
  const mk = async (it, by = { email: "sari@acme.test", name: "Sari", job: "sales" }) => (await hub("/__hub/item", { by, item: it })).j.id;
  const C1 = await mk({ kind: "cabang", title: "Seminar RD Surabaya", date: plus(5), channel: "Edukasi / seminar", status: "rencana", branch: "Cabang Surabaya" });
  const C2 = await mk({ kind: "cabang", title: "Gathering Sudirman", date: plus(5), channel: "Gathering nasabah", status: "rencana", branch: "Cabang Sudirman" });
  const C3 = await mk({ kind: "cabang", title: "Sudah selesai", date: plus(-2), channel: "Lainnya", status: "selesai", branch: "Cabang Surabaya" });
  const K1 = await mk({ kind: "edukasi", title: "Webinar Obligasi", date: plus(7), channel: "Webinar", status: "rencana", owner: "Pia", owner_email: "pia@acme.test" }, { email: "pia@acme.test", name: "Pia", job: "partnership" });
  const items = async (q) => (await hubGet("/__hub/event-items?" + new URLSearchParams(q))).map((x) => x.id);
  assert.equal((await call("/__hub/event-items?branch=Cabang%20Surabaya&kind=cabang")).status, 403, "tanpa kunci hub ditolak");
  let ids = await items({ email: "sari@acme.test", branch: "Cabang Surabaya", kind: "cabang" });
  assert.ok(ids.includes(C1) && !ids.includes(C2) && !ids.includes(C3), "kegiatan cabang sendiri yang belum selesai");
  assert.deepEqual(await items({ email: "pia@acme.test", branch: "", kind: "edukasi" }), [K1]);
  // kegiatan cabang buatan rekan (bukan pembuat/PIC) tidak bisa disambungkan, kecuali admin
  const C4 = await mk({ kind: "cabang", title: "Kunjungan nasabah Rudi", date: plus(6), channel: "Lainnya", status: "rencana", branch: "Cabang Surabaya" }, { email: "rudi@acme.test", name: "Rudi", job: "sales" });
  assert.ok(!(await items({ email: "sari@acme.test", branch: "Cabang Surabaya", kind: "cabang" })).includes(C4), "kegiatan rekan tidak muncul");
  assert.ok((await items({ email: "sari@acme.test", branch: "Cabang Surabaya", kind: "cabang", adm: "1" })).includes(C4), "admin melihat semua kegiatan cabang");
  // sinkron dari event: event_id tercatat, judul ikut, angka terisi
  assert.equal((await call("/__hub/event-sync", { body: { item_id: C1, event_id: "ev1" } })).status, 403);
  r = await hub("/__hub/event-sync", { item_id: C1, event_id: "ev1", set: { title: "Seminar RD Surabaya (baru)", time: "09:00", place: "Hotel Majapahit" }, counts: { reg: 12, hadir: 9 } });
  assert.deepEqual(r.j, { ok: true });
  let it = (await call("/api/items?id=" + C1, { ck: SARI })).j;
  assert.deepEqual([it.event_id, it.title, it.time, it.place, it.result_num, it.leads], ["ev1", "Seminar RD Surabaya (baru)", "09:00", "Hotel Majapahit", 9, 12]);
  assert.ok(!(await items({ email: "sari@acme.test", branch: "Cabang Surabaya", kind: "cabang" })).includes(C1), "sudah tersambung: tidak bisa dipilih lagi");
  // simpan biasa dari Planner tidak bisa menimpa angka dari event
  r = await call("/api/items", { ck: SARI, body: { ...it, result_num: 999, leads: 999, status: "selesai" } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  it = (await call("/api/items?id=" + C1, { ck: SARI })).j;
  assert.deepEqual([it.result_num, it.leads, it.status, it.event_id], [9, 12, "selesai", "ev1"]);
  // event dibatalkan -> kegiatan ikut batal
  await hub("/__hub/event-sync", { item_id: C1, event_id: "ev1", set: { status: "batal" } });
  assert.equal((await call("/api/items?id=" + C1, { ck: SARI })).j.status, "batal");
  // edukasi: hanya Peserta
  await hub("/__hub/event-sync", { item_id: K1, event_id: "ev2", counts: { reg: 30, hadir: 20 } });
  it = (await call("/api/items?id=" + K1, { ck: PART })).j;
  assert.deepEqual([it.result_num, it.leads], [20, null]);
  // kegiatan sudah dihapus di Planner
  r = await hub("/__hub/event-sync", { item_id: "tidak-ada", event_id: "ev3", counts: { reg: 1, hadir: 0 } });
  assert.deepEqual(r.j, { gone: true });
  // kegiatan baru tanpa event: angka diisi manual seperti biasa
  r = await call("/api/items", { ck: SARI, body: { kind: "cabang", title: "Manual", date: plus(3), channel: "Lainnya", status: "rencana", branch: "Cabang Surabaya", result_num: "7", leads: "3", event_id: "palsu" } });
  it = (await call("/api/items?id=" + r.j.id, { ck: SARI })).j;
  assert.deepEqual([it.result_num, it.leads, it.event_id], [7, 3, null], "event_id tidak bisa diisi dari form");
}

/* ---------- Link & QR Studio: pilihan kegiatan & klik ---------- */
{
  const ins = (id, kind, title, date, program_id = "") => env.DB.db.prepare("INSERT INTO items (id, date, title, kind, program_id, status, created_at) VALUES (?, ?, ?, ?, ?, 'rencana', ?)").run(id, date, title, kind, program_id, date + "T00:00:00Z");
  ins("lqP", "program", "Program LQ", "2026-01-05"); ins("lqK", "edukasi", "Edukasi LQ", "2026-01-10", "lqP"); ins("lqC", "cabang", "Gathering LQ", "2026-01-12");
  const hubGet = (p) => planner.fetch(new Request(BASE + p, { headers: { "x-hub-key": SECRET } }), env, { waitUntil() {} });
  assert.equal((await planner.fetch(new Request(BASE + "/__hub/link-items"), env, { waitUntil() {} })).status, 403, "link-items tanpa kunci ditolak");
  let LI = (await (await hubGet("/__hub/link-items?reg=1&q=LQ")).json()).items;
  assert.deepEqual(LI.map((i) => i.id), ["lqC"], "regional: hanya cabang & galeri");
  LI = (await (await hubGet("/__hub/link-items?q=LQ")).json()).items;
  assert.deepEqual(LI.map((i) => i.id), ["lqC", "lqK", "lqP"], "non-regional: semua jenis, terbaru dulu");
  assert.deepEqual(Object.keys(LI[0]).sort(), ["branch", "date", "id", "kind", "status", "title"]);
  assert.deepEqual((await (await hubGet("/__hub/link-items?ids=lqK,hilang")).json()).items.map((i) => i.id), ["lqK"]);
  assert.deepEqual((await (await hubGet("/__hub/link-items?reg=1&ids=lqK,lqC")).json()).items.map((i) => i.id), ["lqC"], "ids tetap mengikuti aturan regional");
  assert.equal((await call("/__hub/link-clicks", { body: { items: { lqK: 1 } } })).status, 403, "link-clicks tanpa kunci ditolak");
  r = await hub("/__hub/link-clicks", { items: { lqK: 5, lqP: 2, hilang: 9 } });
  assert.deepEqual(r.j, { ok: true, gone: ["hilang"] });
  await hub("/__hub/link-clicks", { items: { lqK: 3 } });   // kiriman lama datang terlambat
  const it = async (id) => (await call("/api/items?id=" + id, { ck: PART })).j;
  assert.equal((await it("lqK")).clicks, 5, "MAX: angka tidak turun");
  const atOf = () => env.DB.db.prepare("SELECT at FROM qrclicks WHERE item_id = 'lqK'").get().at, at1 = atOf();
  await new Promise((ok) => setTimeout(ok, 5)); await hub("/__hub/link-clicks", { items: { lqK: 5 } });
  assert.equal(atOf(), at1, "angka sama: tidak ditulis ulang");
  assert.equal((await it("lqP")).clicks, 7, "Program = 2 sendiri + 5 kegiatan terkait");
  assert.equal((await it("lqC")).clicks, null, "tanpa klik tetap kosong");
  const PR = (await call("/api/program-report?id=lqP", { ck: PART })).j.programs[0];
  assert.equal(PR.clicks, 7); assert.equal(PR.items.find((i) => i.id === "lqK").clicks, 5);
}

/* ---------- izin mengubah kegiatan: pembuat, PIC, desainer (bila butuh visual), admin ---------- */
{
  const { canEditItem } = await import("./worker.js");
  const it = { created_email: "pia@acme.test", owner_email: "cici@acme.test", d_need: 1, d_who: "dodi@acme.test" };
  assert.deepEqual(["PIA@acme.test", "cici@acme.test", "dodi@acme.test", "x@acme.test"].map((e) => canEditItem({ e }, it)), [true, true, true, false]);
  assert.equal(canEditItem({ e: "x@acme.test", adm: true }, it), true);
  assert.equal(canEditItem({ e: "dodi@acme.test" }, { ...it, d_need: 0 }), false, "desainer hanya bila butuh visual");
  const ADM = await cookie({ e: "adm@acme.test", n: "Admin", adm: true }), OTHER = await cookie({ e: "oki@acme.test", n: "Oki", j: "copy" });
  const body = { kind: "konten", title: "Izin edit", date: plus(4), channel: "IG Feed", status: "draf", owner: "Cici", owner_email: "cici@acme.test", d_need: true, d_who: "dodi@acme.test", d_name: "Dodi", d_status: "belum" };
  const id = (await call("/api/items", { ck: PART, body })).j.id;
  const get = async () => (await call("/api/items?id=" + id, { ck: ADM })).j;
  const save = async (ck, patch) => call("/api/items", { ck, body: { ...(await get()), ...patch, id, base: undefined } });
  r = await save(OTHER, { title: "Diubah orang lain" });
  assert.deepEqual([r.status, r.j.error], [403, "Hanya pembuat, PIC, desainer, atau admin yang bisa mengubah kegiatan ini."]);
  assert.equal((await save(OTHER, { owner: "Oki", owner_email: "oki@acme.test" })).status, 403, "tidak bisa menjadikan diri PIC");
  assert.equal((await get()).title, "Izin edit");
  for (const [ck, t] of [[PART, "oleh pembuat"], [COPY, "oleh PIC"], [DES, "oleh desainer"], [ADM, "oleh admin"]]) {
    r = await save(ck, { title: t }); assert.equal(r.status, 200, t + " " + JSON.stringify(r.j)); assert.equal((await get()).title, t);
  }
  await save(PART, { d_need: false });
  assert.equal((await save(DES, { title: "x" })).status, 403, "desainer setelah visual tidak dibutuhkan");
}

/* ---------- stock pick: status dari harga penutupan sejak pick dibuat, yang tercapai duluan menentukan ---------- */
{
  const { pickStatus, pickReturn, cleanPick, eodSlot } = await import("./worker.js");
  const P = { date: "2026-10-01", entry: 1000, sl: 950, tp1: 1100, tp2: 1200 };
  const bars = (...c) => c.map((x, i) => ({ d: `2026-10-${String(i + 1).padStart(2, "0")}`, c: x }));
  assert.deepEqual(pickStatus(P, bars(1000, 1020)), { status: "open", hit_date: null, tp2_date: null, last: 1020, last_date: "2026-10-02" });
  assert.equal(pickStatus(P, bars(1000, 940, 1300)).status, "sl", "SL duluan: ditutup walau lalu naik");
  assert.equal(pickStatus(P, bars(1000, 940)).hit_date, "2026-10-02");
  const t1 = pickStatus(P, bars(1100, 900));
  assert.deepEqual([t1.status, t1.hit_date], ["tp1", "2026-10-01"], "TP1 duluan: tidak bisa jadi SL lagi");
  const t2 = pickStatus(P, bars(1100, 1050, 1250));
  assert.deepEqual([t2.status, t2.hit_date, t2.tp2_date], ["tp2", "2026-10-01", "2026-10-03"], "setelah TP1 tetap dipantau sampai TP2");
  assert.deepEqual([pickStatus(P, bars(1250)).status, pickStatus(P, bars(1250)).hit_date], ["tp2", "2026-10-01"], "loncat langsung lewat TP2");
  assert.equal(pickStatus({ ...P, tp2: null }, bars(1300)).status, "tp1", "TP2 kosong: berhenti di TP1");
  assert.equal(pickStatus({ ...P, date: "2026-10-02" }, bars(940, 1000)).status, "open", "harga sebelum tanggal pick tidak dihitung");
  assert.equal(pickStatus(P, bars(950)).status, "sl", "tepat di SL = kena");
  assert.equal(pickStatus(P, bars(1100)).status, "tp1", "tepat di TP1 = kena");
  assert.equal(pickStatus(P, []).status, "open");
  // return: SL di harga SL, TP1/TP2 di harga TP1, on going di harga terakhir
  assert.equal(pickReturn({ ...P, status: "sl", last: 900 }), -0.05);
  assert.equal(pickReturn({ ...P, status: "tp2", last: 1300 }), 0.1);
  assert.equal(pickReturn({ ...P, status: "open", last: 1020 }), 0.02);
  assert.equal(pickReturn({ ...P, status: "open", last: null }), null);
  assert.equal(pickReturn({ ...P, entry: 900, entry_hi: 1100, status: "tp1" }), 0.1, "entry rentang: return dari harga tengahnya");
  // isian: kode 4 huruf, harga rupiah bulat ("4.250" = 4250), SL < entry < TP1 < TP2
  assert.deepEqual(cleanPick({ date: "2026-10-01", code: " bbri ", entry: "4.250", sl: "4100", tp1: 4500, tp2: "" }, "2026-11-03"),
    { date: "2026-10-01", code: "BBRI", entry: 4250, entry_hi: null, sl: 4100, tp1: 4500, tp2: null });
  assert.deepEqual(["298 - 312", "298-312", "298 – 312", "312-298"].map((e) => cleanPick({ date: "2026-10-01", code: "RMKE", entry: e, sl: 284, tp1: 330, tp2: 350 }, "2026-11-03")).map((p) => [p.entry, p.entry_hi]),
    [[298, 312], [298, 312], [298, 312], [298, 312]], "entry boleh rentang, disimpan bawah dan atas");
  assert.equal(cleanPick({ date: "2026-10-01", code: "RMKE", entry: "300 - 300", sl: 284, tp1: 330 }, "2026-11-03").entry_hi, null, "rentang sama = satu harga");
  const bad = (x, m) => assert.ok(cleanPick({ date: "2026-10-01", code: "BBRI", entry: 4250, sl: 4100, tp1: 4500, ...x }, "2026-11-03").error, m);
  bad({ sl: 4300 }, "SL harus di bawah entry"); bad({ tp1: 4200 }, "TP1 harus di atas entry"); bad({ tp2: 4400 }, "TP2 harus di atas TP1");
  bad({ code: "BB" }, "kode 4 huruf"); bad({ date: "2026-11-04" }, "tanggal belum datang"); bad({ entry: "" }, "entry wajib"); bad({ entry: "4200 - 4600" }, "atas rentang harus di bawah TP1"); bad({ entry: "4000 - 4300" }, "bawah rentang harus di atas SL"); bad({ entry: "4200 - " }, "rentang tidak lengkap"); bad({ sl: "0" }, "harga > 0");
  // EOD: sebelum 16.30 WIB harga penutupan hari ini belum dipakai
  assert.equal(eodSlot(Date.parse("2026-11-03T15:00:00+07:00")), "2026-11-02");
  assert.equal(eodSlot(Date.parse("2026-11-03T17:00:00+07:00")), "2026-11-03");

  // API: harga dari Yahoo (ditiru), dicek saat dibuka, pick yang sudah ditutup tidak diambil lagi
  const realFetch = globalThis.fetch, hits = [];
  const S = { "BBRI.JK": [[plus(-3), 4200], [plus(-2), 4600]], "TLKM.JK": [[plus(-3), 2850]], "ASII.JK": [[plus(-2), 5050]], "^JKSE": [[plus(-9), 7000], [plus(-8), 7000], [plus(-2), 7140]] };
  globalThis.fetch = async (u) => {
    u = String(u); const sym = decodeURIComponent(u.split("/chart/")[1].split("?")[0]); hits.push(sym);
    if (sym === "GOTO.JK") return new Response("down", { status: 500 });
    const L = S[sym] || [];
    return Response.json({ chart: { result: [{ timestamp: L.map(([d]) => Date.parse(d + "T09:00:00+07:00") / 1000), indicators: { quote: [{ close: L.map(([, c]) => c) }] } }] } });
  };
  const ADM = await cookie({ e: "adm@acme.test", n: "Admin", adm: true });
  const pk = (ck, body) => call("/api/picks", { ck, body });
  let r = await pk(COPY, { date: plus(-3), code: "BBRI", entry: 4200, sl: 4000, tp1: 4500, tp2: 5000 });
  assert.equal(r.status, 200, JSON.stringify(r.j)); const BB = r.j.id;
  const TL = (await pk(COPY, { date: plus(-3), code: "TLKM", entry: 3000, sl: 2900, tp1: 3300 })).j.id;
  await pk(DES, { date: plus(-2), code: "ASII", entry: 5000, sl: 4800, tp1: 5500 });
  await pk(DES, { date: plus(-2), code: "GOTO", entry: 60, sl: 55, tp1: 70 });
  assert.equal((await pk(COPY, { date: plus(-3), code: "BBRI", entry: 4200, sl: 4300, tp1: 4500 })).status, 400, "isian salah ditolak");
  assert.equal((await pk(DES, { id: BB, date: plus(-3), code: "BBRI", entry: 4200, sl: 4000, tp1: 4500 })).status, 400, "ubah milik orang lain ditolak");
  const spw = (await call(`/api/wa?from=${plus(-5)}&to=${wib}`, { ck: PART })).j.filter((w) => w.kind === "stockpick");
  assert.deepEqual(spw.map((w) => [w.date, w.name, w.n]), [[plus(-3), "Cici", 2], [plus(-2), "Dodi", 2]], "stock pick terhitung sebagai posting WA Stockpick");
  const list = async (q = "") => (await call(`/api/picks?from=${plus(-5)}&to=${wib}${q}`, { ck: PART })).j;
  let L = await list("&ihsg=1"), by = (c) => L.picks.find((p) => p.code === c);
  assert.deepEqual(["BBRI", "TLKM", "ASII", "GOTO"].map((c) => by(c).status), ["tp1", "sl", "open", "open"], "Yahoo gagal: tetap on going, tidak error");
  assert.deepEqual([by("BBRI").hit_date, by("BBRI").last, by("BBRI").ret], [plus(-2), 4600, (4500 - 4200) / 4200]);
  assert.equal(by("TLKM").ret, (2900 - 3000) / 3000, "kena SL dihitung di harga SL");
  assert.deepEqual([by("ASII").last, by("ASII").name], [5050, "Dodi"]);
  assert.ok(Math.abs(L.ihsg.ret - 0.02) < 1e-9, "IHSG: penutupan terakhir dibanding penutupan sebelum periode");
  hits.length = 0; L = await list();
  assert.deepEqual(hits, ["GOTO.JK"], "yang sudah dicek di EOD yang sama tidak diambil lagi; yang gagal dicoba lagi");
  // ubah pick: status dihitung ulang dari awal
  assert.equal((await pk(COPY, { id: TL, date: plus(-3), code: "TLKM", entry: 3000, sl: 2800, tp1: 3300 })).status, 200);
  L = await list(); assert.equal(by("TLKM").status, "open", "SL baru 2800, harga 2850: on going");
  assert.equal((await call("/api/picks/delete", { ck: DES, body: { id: BB } })).status, 400, "hapus milik orang lain ditolak");
  assert.equal((await call("/api/picks/delete", { ck: ADM, body: { id: BB } })).status, 200, "admin boleh menghapus");
  L = await list(); assert.equal(by("BBRI"), undefined);
  assert.equal((await call(`/api/picks?from=2024-01-01&to=2026-12-31`, { ck: PART })).status, 400, "periode maks. 1 tahun");
  globalThis.fetch = realFetch;
}

/* ---------- Ops ETF: rebalancing (fee, nominal, saham masuk & keluar), hanya role ops & admin ---------- */
{
  const OPS = await cookie({ e: "oki@acme.test", n: "Oki", j: "ops" }), ADM = await cookie({ e: "adm@acme.test", n: "Admin", adm: true });
  const o = { kind: "ops", title: "Rebalancing XIIT Q4", date: wib, channel: "Rebalancing ETF", status: "selesai", d_need: true, program_id: "p1",
    ops: { etf: "XIIT", fee: "1.250.000", trx: "2.500.000.000", in: "bbca, tlkm;  BBCA x12 GOTO", out: ["asii", "ASII"] } };
  assert.equal((await call("/api/items", { ck: COPY, body: o })).status, 400, "selain ops & admin tidak bisa mencatat Ops ETF");
  r = await call("/api/items", { ck: OPS, body: o });
  assert.equal(r.status, 200);
  let it = (await call("/api/items?id=" + r.j.id, { ck: OPS })).j;
  assert.deepEqual([JSON.parse(it.ops), it.d_need, it.program_id], [{ etf: "XIIT", fee: 1250000, trx: 2500000000, in: ["BBCA", "TLKM", "GOTO"], out: ["ASII"] }, 0, ""]);
  assert.equal((await call("/api/items", { ck: ADM, body: { ...it, ops: { trx: "5000000" }, channel: "Pekerjaan ETF lainnya", base: it.updated_at } })).status, 200, "admin boleh mengubah");
  it = (await call("/api/items?id=" + r.j.id, { ck: OPS })).j;
  assert.deepEqual(JSON.parse(it.ops), { etf: "", fee: null, trx: 5000000, in: [], out: [] });
  const k = (await call("/api/items", { ck: COPY, body: { kind: "konten", title: "x", date: wib } })).j.id, ki = (await call("/api/items?id=" + k, { ck: COPY })).j;
  assert.equal((await call("/api/items", { ck: COPY, body: { ...ki, kind: "ops", base: ki.updated_at } })).status, 400, "kegiatan lama tidak bisa dijadikan Ops ETF");
  const { cleanOps } = await import("./worker.js");
  assert.equal(cleanOps({ etf: " ", in: "1234 AB" }), "", "isian kosong / kode salah -> kosong");
  const me = async (ck) => JSON.parse((await planner.fetch(new Request(BASE + "/", { headers: { cookie: ck } }), env, { waitUntil() { } }).then((x) => x.text())).match(/window\.PL=(\{.*?\});<\/script>/)[1]).me.ops;
  assert.deepEqual([await me(OPS), await me(ADM), await me(COPY)], [true, true, false]);
}

/* ---------- Terjemahan isian laporan (English) lewat AI: per kelompok, kelompok gagal dilewati ---------- */
{
  const { translateTexts } = await import("./worker.js"), { AiError } = await import("../../shared/ai.js");
  const seenU = [];
  const fake = async (env, sys, user, max, model, opts) => {
    seenU.push(JSON.parse(user)); assert.equal(opts.json, true);
    const o = JSON.parse(user);
    if (Object.values(o).includes("rusak")) throw new AiError("Kuota AI gratis hari ini sudah habis.");
    return { text: "```json\n" + JSON.stringify({ lang: "en", translations: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, "EN:" + v])) }) + "\n```" };
  };
  const long = "x".repeat(1400);
  let r = await translateTexts({}, { texts: ["Rapat koordinasi", " Rapat koordinasi ", "12", "", null, "https://a.b/c", long + "1", long + "2", long + "3", long + "4", long + "5"] }, fake);
  assert.equal(seenU.length, 2, "dibagi per ±6.000 karakter");
  assert.equal(r.map["Rapat koordinasi"], "EN:Rapat koordinasi");
  assert.ok(!("12" in r.map) && !("https://a.b/c" in r.map), "angka & link tidak dikirim");
  assert.deepEqual([Object.keys(r.map).length, r.failed, r.note], [6, 0, ""]);
  r = await translateTexts({}, { texts: ["Siap UAT", "rusak"] }, fake);
  assert.deepEqual([r.map, r.failed, r.note], [{}, 2, "Kuota AI gratis hari ini sudah habis."], "AI gagal -> kosong + alasan");
  assert.equal((await translateTexts({}, { texts: "bukan daftar" }, fake)).failed, 0);
  assert.equal((await call("/api/translate", { ck: COPY, body: { texts: [] } })).status, 200);
}

/* ---------- Pengembangan produk: hanya admin, riwayat update status ---------- */
{
  const ADM = await cookie({ e: "adm@acme.test", n: "Admin", adm: true });
  const p = { kind: "produk", title: "Filter reksa dana syariah", date: wib, channel: "Fitur baru", status: "ide", partner: "iKISI App", goal: "Saring RD syariah", end_date: "2000-01-01", d_need: true, program_id: "p1" };
  assert.equal((await call("/api/items", { ck: COPY, body: p })).status, 400, "selain admin tidak bisa mencatat produk");
  r = await call("/api/items", { ck: ADM, body: p });
  assert.equal(r.status, 200);
  let it = (await call("/api/items?id=" + r.j.id, { ck: ADM })).j;
  assert.deepEqual([it.partner, it.goal, it.end_date, it.program_id, it.d_need], ["iKISI App", "Saring RD syariah", "", "", 0], "target rilis sebelum mulai dikosongkan");
  assert.equal((await call("/api/items", { ck: COPY, body: { ...it, title: "x", base: it.updated_at } })).status, 403, "non-admin tidak bisa mengubah");
  assert.equal((await call("/api/items", { ck: ADM, body: { ...it, status: "uji", progress: "Siap UAT", base: it.updated_at } })).status, 200);
  it = (await call("/api/items?id=" + r.j.id, { ck: ADM })).j;
  assert.equal((await call("/api/items", { ck: ADM, body: { ...it, base: it.updated_at } })).status, 200, "simpan tanpa perubahan");
  const log = (await call("/api/galeri?id=" + r.j.id, { ck: ADM })).j[0].log;
  assert.deepEqual(log.map((l) => [l.st, l.text]), [["ide", ""], ["uji", "Siap UAT"]]);
  const all = (await call("/api/galeri?kind=produk", { ck: ADM })).j;
  assert.deepEqual(all.map((x) => [x.id, x.log.length]), [[r.j.id, 2]]);
  const k = (await call("/api/items", { ck: COPY, body: { kind: "konten", title: "y", date: wib } })).j.id, ki = (await call("/api/items?id=" + k, { ck: COPY })).j;
  assert.equal((await call("/api/items", { ck: COPY, body: { ...ki, kind: "produk", base: ki.updated_at } })).status, 400, "kegiatan lama tidak bisa dijadikan produk");
}

console.log("semua cek lolos");
