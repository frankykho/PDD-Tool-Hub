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
// kerja di belakang layar (ctx.waitUntil) ditunggu sampai selesai sebelum cek berikutnya
const ctx = () => { const P = []; return { waitUntil: (p) => P.push(p), done: () => Promise.all(P) }; };
const run = async (req, e = env) => { const c = ctx(), r = await worker.fetch(req, e, c); await c.done(); return r; };
const raw = (path, { ck, body, headers = {}, method, e = env } = {}) => run(new Request(BASE + path, { method: method || (body !== undefined ? "POST" : "GET"), redirect: "manual",
  headers: { ...(ck ? { cookie: ck } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }), e);
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

/* ---------- pendaftaran publik ---------- */
const { normPhone, cleanReg, formStamp } = W;
assert.equal(normPhone("0812-3456-789"), "628123456789");
assert.equal(normPhone("+62 812 3456 789"), "628123456789");
assert.equal(normPhone("8123456789"), "628123456789");
assert.equal(normPhone("62 812 3456 789"), "628123456789");
assert.equal(normPhone("12345"), "");
assert.equal(normPhone("0212345678"), "", "nomor rumah (bukan HP) ditolak");
const REG = { name: "Budi Santoso", phone: "0812-3456-789", email: "budi@mail.test", is_client: "0", consent: "1" };
assert.deepEqual(cleanReg(REG), { name: "Budi Santoso", phone: "628123456789", email: "budi@mail.test", is_client: 0, client_code: "" });
assert.equal(cleanReg({ ...REG, consent: "" }).error, "Persetujuan data pribadi wajib dicentang.");
assert.equal(cleanReg({ ...REG, is_client: "1" }).error, "Kode nasabah belum diisi.");
assert.equal(cleanReg({ ...REG, is_client: "1", client_code: " AB123 " }).client_code, "AB123");
assert.equal(cleanReg({ ...REG, is_client: "0", client_code: "AB123" }).client_code, "", "kode nasabah diabaikan kalau belum nasabah");
assert.equal(cleanReg({ ...REG, phone: "123" }).error, "Nomor HP (WhatsApp) belum benar.");
assert.equal(cleanReg({ ...REG, email: "budi" }).error, "Email belum benar.");
assert.equal(cleanReg({ ...REG, is_client: "" }).error, "Pilih apakah sudah menjadi nasabah KISI.");
assert.equal(cleanReg({ ...REG, name: " " }).error, "Nama belum diisi.");
assert.equal(cleanReg({ ...REG, consent: "" }, { consent: false }).error, undefined, "tambah manual oleh Sales tanpa centang persetujuan");

const T0 = Date.parse("2026-10-30T03:00:00Z");
env.NOW_MS = T0;
const addEvent = (o) => { const e = { id: "ev" + Math.random().toString(36).slice(2, 8), code: "c" + Math.random().toString(36).slice(2, 11), acode: "a" + Math.random().toString(36).slice(2, 11), title: "Seminar Reksa Dana", mode: "tatap",
  date: "2026-11-03", time_start: "09:00", time_end: "11:00", place: "Hotel Majapahit", online_url: "", branch: "Cabang Surabaya", region: "Jawa Timur", descr: "Belajar reksa dana untuk pemula.", quota: null, open: 1,
  wa_tpl: "", status: "aktif", creator_email: "sari@acme.test", creator_name: "Sari", creator_job: "sales", creator_team: "rm", created_at: "", updated_at: "", ...o };
  env.DB.db.prepare(`INSERT INTO events (${Object.keys(e).join(",")}) VALUES (${Object.keys(e).map(() => "?").join(",")})`).run(...Object.values(e)); return e; };
const people = (id) => env.DB.db.prepare("SELECT * FROM people WHERE event_id = ? ORDER BY created_at").all(id);
let ipN = 0;
// kirim form publik seperti browser (x-www-form-urlencoded); stamp dibuat 5 detik sebelum dikirim
async function submit(path, fields, { ip = "10.0.0." + ++ipN, age = 5000, at = T0 } = {}) {
  env.NOW_MS = at - age; const ts = await formStamp(env); env.NOW_MS = at;
  const r = await run(new Request(BASE + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip }, body: new URLSearchParams({ ts, website: "", ...fields }) }));
  return { status: r.status, html: await r.text() };
}
const page = async (path) => { const r = await raw(path); return { status: r.status, html: await r.text() }; };

const E1 = addEvent({});
let p = await page("/d/" + E1.code);
assert.equal(p.status, 200);
assert.match(p.html, /Seminar Reksa Dana/); assert.match(p.html, /Selasa, 3 November 2026/); assert.match(p.html, /09\.00–11\.00 WIB/); assert.match(p.html, /Hotel Majapahit/);
assert.match(p.html, /\/brand\/ikisi-color\.png/, "logo iKISI");
assert.match(p.html, /name="website"/, "kolom jebakan");
assert.match(p.html, /<label id="cc" hidden>/); assert.match(p.html, /\[hidden\]\{display:none!important\}/, "kode nasabah tersembunyi sampai memilih Ya");
assert.match(p.html, /Saya setuju nama, nomor HP, email, dan kode nasabah saya dipakai penyelenggara/, "teks persetujuan bawaan");
for (const f of ["name", "phone", "email", "is_client", "client_code", "consent"]) assert.match(p.html, new RegExp(`name="${f}"`), "isian " + f);
assert.equal((await page("/d/tidakada123")).status, 404);
assert.match((await page("/d/tidakada123")).html, /Acara tidak ditemukan\./);

p = await submit("/d/" + E1.code, REG);
assert.equal(p.status, 200); assert.match(p.html, /Terima kasih/);
assert.equal(people(E1.id).length, 1);
let row = people(E1.id)[0];
assert.equal(row.phone, "628123456789"); assert.equal(row.status, "terdaftar"); assert.equal(row.src, "form"); assert.equal(row.consent_ver, 1); assert.ok(row.consent_at);
assert.equal(env.DB.db.prepare("SELECT n_reg FROM events WHERE id = ?").get(E1.id).n_reg, 1, "angka pendaftar ikut dihitung");
// nomor sama, ditulis lain -> data lama diperbarui, bukan peserta ganda
p = await submit("/d/" + E1.code, { ...REG, phone: "+62 812 3456 789", name: "Budi S." });
assert.equal(people(E1.id).length, 1); assert.equal(people(E1.id)[0].name, "Budi S.");
// kolom jebakan terisi -> tampak berhasil, tapi tidak disimpan
p = await submit("/d/" + E1.code, { ...REG, phone: "081300000001", website: "spam.test" });
assert.equal(p.status, 200); assert.match(p.html, /Terima kasih/); assert.equal(people(E1.id).length, 1);
// terlalu cepat setelah halaman dibuka
p = await submit("/d/" + E1.code, { ...REG, phone: "081300000002" }, { age: 1000 });
assert.equal(p.status, 400); assert.match(p.html, /Coba kirim lagi\./); assert.equal(people(E1.id).length, 1);
// isian salah -> form tampil lagi dengan pesannya, isian tetap
p = await submit("/d/" + E1.code, { ...REG, phone: "081300000003", consent: "" });
assert.equal(p.status, 400); assert.match(p.html, /Persetujuan data pribadi wajib dicentang\./); assert.match(p.html, /value="Budi Santoso"/);
// kuota penuh
const E2 = addEvent({ quota: 1 });
await submit("/d/" + E2.code, REG);
p = await submit("/d/" + E2.code, { ...REG, phone: "081300000004" });
assert.match(p.html, /Kuota pendaftaran sudah penuh\./); assert.equal(people(E2.id).length, 1);
assert.match((await page("/d/" + E2.code)).html, /Kuota pendaftaran sudah penuh\./);
assert.doesNotMatch((await page("/d/" + E2.code)).html, /name="phone"/, "form tidak tampil saat kuota penuh");
p = await submit("/d/" + E2.code, { ...REG, name: "Budi Baru" });
assert.equal(people(E2.id)[0].name, "Budi Baru", "peserta yang sudah terdaftar tetap bisa memperbarui datanya");
// ditutup / dibatalkan / sudah lewat
const E3 = addEvent({ open: 0 }), E4 = addEvent({ status: "batal" }), E5 = addEvent({ date: "2026-10-29" });
for (const [E, msg] of [[E3, /Pendaftaran sudah ditutup\./], [E4, /Acara ini dibatalkan\./], [E5, /Pendaftaran sudah ditutup\./]]) {
  assert.match((await page("/d/" + E.code)).html, msg);
  p = await submit("/d/" + E.code, REG); assert.match(p.html, msg); assert.equal(people(E.id).length, 0);
}
// acara online: link hanya tampil setelah mendaftar
const E6 = addEvent({ mode: "online", place: "", online_url: "https://zoom.test/j/123" });
assert.doesNotMatch((await page("/d/" + E6.code)).html, /zoom\.test/);
assert.match((await page("/d/" + E6.code)).html, /Online/);
p = await submit("/d/" + E6.code, REG);
assert.match(p.html, /https:\/\/zoom\.test\/j\/123/);
// batas kiriman per IP per jam, per event (peserta seminar sering memakai Wi-Fi yang sama)
for (let i = 0; i < 60; i++) assert.notEqual((await submit("/d/" + E1.code, { ...REG, website: "x" }, { ip: "9.9.9.9" })).status, 429);
p = await submit("/d/" + E1.code, REG, { ip: "9.9.9.9" });
assert.equal(p.status, 429); assert.match(p.html, /Terlalu banyak pendaftaran dari jaringan ini\. Coba lagi nanti\./);
assert.notEqual((await submit("/d/" + E6.code, { ...REG, website: "x" }, { ip: "9.9.9.9" })).status, 429, "event lain tidak ikut terhitung");
// klik Daftar dua kali bersamaan: satu baris, tidak ada halaman error
{
  const E7 = addEvent({}), DB0 = env.DB, tick = () => new Promise((r) => setTimeout(r, 5));
  // D1 di jaringan: setiap query butuh waktu, jadi dua kiriman bisa sama-sama belum melihat baris yang lain
  env.DB = { ...DB0, prepare: (sql) => { const w = (st) => ({ bind: (...a) => w(st.bind(...a)), all: async () => (await tick(), st.all()), first: async () => (await tick(), st.first()), run: async () => (await tick(), st.run()), _st: st }); return w(DB0.prepare(sql)); },
    batch: async (l) => { await tick(); return DB0.batch(l.map((x) => x._st)); } };
  const two = await Promise.all([submit("/d/" + E7.code, { ...REG, phone: "081300007777" }), submit("/d/" + E7.code, { ...REG, phone: "081300007777" })].map((x) => x.catch((e) => ({ status: "error " + e.message }))));
  env.DB = DB0;
  assert.deepEqual(two.map((x) => x.status), [200, 200]); assert.equal(people(E7.id).length, 1);
}

/* ---------- API event & peserta ---------- */
const { waText, WA_DEFAULT } = W;
const SARI = await cookie({ e: "sari@acme.test", n: "Sari", j: "sales", c: "Cabang Surabaya" });
const TONO = await cookie({ e: "tono@acme.test", n: "Tono", j: "sales", c: "Cabang Sudirman" });
const HEADRM = await cookie({ e: "rina@acme.test", n: "Rina", j: "head_rm" });
const PIA = await cookie({ e: "pia@acme.test", n: "Pia", j: "partnership" });
const ADM = await cookie({ e: "adm@acme.test", n: "Admin", adm: true });
const OLDSARI = await cookie({ e: "sari@acme.test", n: "Sari", j: "sales" });   // tiket lama tanpa cabang: cabang dari daftar anggota hub
const NEW = { title: "Gathering Nasabah Surabaya", mode: "tatap", date: "2026-11-10", time_start: "18:30", time_end: "21:00", place: "Galaxy Mall", branch: "Cabang Surabaya", descr: "", quota: "", open: true };
r = await call("/api/events", { ck: SARI, body: NEW });
assert.equal(r.status, 200, JSON.stringify(r.j));
assert.match(r.j.code, /^[a-z0-9]{10}$/); assert.match(r.j.acode, /^[a-z0-9]{10}$/); assert.notEqual(r.j.code, r.j.acode);
const G = env.DB.db.prepare("SELECT * FROM events WHERE id = ?").get(r.j.id);
assert.equal(G.region, "Jawa Timur", "regional diisi dari daftar cabang"); assert.equal(G.creator_email, "sari@acme.test"); assert.equal(G.creator_team, "rm"); assert.equal(G.status, "aktif");
assert.equal((await call("/api/events", { ck: SARI, body: { ...NEW, branch: "Cabang Sudirman" } })).j.error, "Cabang ini bukan cabangmu.");
assert.equal((await call("/api/events", { ck: SARI, body: { ...NEW, branch: "Cabang Sudirman" } })).status, 400);
assert.equal((await call("/api/events", { ck: OLDSARI, body: NEW })).status, 200, "tiket tanpa cabang: cabang dari daftar anggota");
assert.equal((await call("/api/events", { ck: HEADRM, body: { ...NEW, title: "Gathering Sudirman", branch: "Cabang Sudirman" } })).status, 200, "Head regional boleh memilih cabang mana pun");
assert.equal((await call("/api/events", { ck: HEADRM, body: { ...NEW, branch: "Cabang Antah" } })).j.error, "Cabang tidak ada di daftar.");
assert.equal((await call("/api/events", { ck: SARI, body: { ...NEW, time_end: "" } })).j.error, "Jam selesai harus setelah jam mulai.");
assert.equal((await call("/api/events", { ck: SARI, body: { ...NEW, time_end: "18:00" } })).j.error, "Jam selesai harus setelah jam mulai.");
assert.equal((await call("/api/events", { ck: SARI, body: { ...NEW, mode: "online", online_url: "" } })).j.error, "Link acara online belum diisi.");
assert.equal((await call("/api/events", { ck: SARI, body: { ...NEW, title: "" } })).j.error, "Judul acara belum diisi.");
assert.equal((await call("/api/events", { ck: SARI, body: NEW, headers: { origin: "https://jahat.test" } })).status, 403, "hanya dari halaman tool sendiri");
// pembuat di luar tim regional: tanpa cabang
r = await call("/api/events", { ck: PIA, body: { ...NEW, title: "Webinar Obligasi", mode: "online", online_url: "zoom.test/j/9", place: "" } });
assert.equal(r.status, 200);
const PW = env.DB.db.prepare("SELECT * FROM events WHERE id = ?").get(r.j.id);
assert.equal(PW.branch, ""); assert.equal(PW.creator_team, "pd"); assert.equal(PW.online_url, "https://zoom.test/j/9");
// daftar event: hanya yang boleh dilihat
const titles = async (ck) => (await call("/api/events", { ck })).j.map((e) => e.title);
assert.ok((await titles(SARI)).includes("Gathering Nasabah Surabaya")); assert.ok(!(await titles(SARI)).includes("Webinar Obligasi"));
assert.ok(!(await titles(TONO)).includes("Gathering Nasabah Surabaya"));
assert.ok((await titles(TONO)).includes("Gathering Nasabah Surabaya") === false && (await call("/api/events", { ck: TONO })).j.every((e) => e.branch === "Cabang Sudirman"));
assert.ok((await titles(PIA)).includes("Webinar Obligasi")); assert.ok(!(await titles(PIA)).includes("Gathering Nasabah Surabaya"));
assert.ok((await titles(ADM)).includes("Webinar Obligasi") && (await titles(ADM)).includes("Gathering Nasabah Surabaya"));
// mengubah event cabang lain -> tidak ditemukan
assert.equal((await call("/api/events", { ck: TONO, body: { ...NEW, id: G.id, branch: "Cabang Sudirman" } })).status, 404);
r = await call("/api/events", { ck: SARI, body: { ...NEW, id: G.id, title: "Gathering Nasabah Surabaya Barat", quota: "50" } });
assert.equal(r.status, 200); assert.equal(r.j.code, G.code, "kode tetap saat diubah");
assert.equal(env.DB.db.prepare("SELECT title, quota FROM events WHERE id = ?").get(G.id).quota, 50);

// peserta
assert.equal((await call("/api/people?event=" + G.id, { ck: TONO })).status, 404, "event cabang lain: tidak ditemukan");
assert.equal((await call("/api/people?event=" + E1.id, { ck: SARI })).j.people.length, 1);
r = await call("/api/people", { ck: SARI, body: { event_id: G.id, name: "Ani", phone: "0813 1111 2222", email: "", is_client: "1", client_code: "K001" } });
assert.equal(r.status, 200, JSON.stringify(r.j));
let L = (await call("/api/people?event=" + G.id, { ck: SARI })).j;
assert.equal(L.people.length, 1); assert.equal(L.people[0].src, "manual"); assert.equal(L.people[0].consent_ver, 0); assert.equal(L.people[0].status, "terdaftar");
assert.equal(L.waDefault, WA_DEFAULT); assert.equal(L.event.n_reg, 1);
const ani = L.people[0].id;
assert.equal((await call("/api/people", { ck: TONO, body: { id: ani, status: "dikonfirmasi" } })).status, 404, "peserta event cabang lain");
assert.equal((await call("/api/people", { ck: SARI, body: { id: ani, status: "datang" } })).status, 400);
r = await call("/api/people", { ck: SARI, body: { id: ani, status: "dikonfirmasi" } });
assert.equal(r.status, 200);
const H = env.DB.db.prepare("SELECT * FROM history WHERE person_id = ? ORDER BY id").all(ani);
assert.deepEqual(H.map((h) => [h.from_status, h.to_status, h.by_name]), [["", "terdaftar", "Sari"], ["terdaftar", "dikonfirmasi", "Sari"]]);
assert.equal(env.DB.db.prepare("SELECT n_conf FROM events WHERE id = ?").get(G.id).n_conf, 1);
// ubah data peserta
r = await call("/api/people", { ck: SARI, body: { event_id: G.id, id: ani, name: "Ani Wijaya", phone: "081311112222", email: "ani@mail.test", is_client: "1", client_code: "K001" } });
assert.equal(r.status, 200); assert.equal(env.DB.db.prepare("SELECT name, status FROM people WHERE id = ?").get(ani).name, "Ani Wijaya");
assert.equal(env.DB.db.prepare("SELECT status FROM people WHERE id = ?").get(ani).status, "dikonfirmasi", "ubah data tidak mengubah status");
// tambah manual dengan nomor yang sudah terdaftar: ditolak, data nasabah tidak tertimpa
r = await call("/api/people", { ck: SARI, body: { event_id: G.id, name: "Ani", phone: "+62 813-1111-2222", is_client: "0" } });
assert.equal(r.status, 400); assert.equal(r.j.error, "Nomor HP ini sudah terdaftar di acara ini.");
assert.deepEqual({ ...env.DB.db.prepare("SELECT name, is_client, client_code FROM people WHERE id = ?").get(ani) }, { name: "Ani Wijaya", is_client: 1, client_code: "K001" });
// riwayat status bisa dilihat
L = (await call("/api/people?event=" + G.id, { ck: SARI })).j;
assert.deepEqual(L.history[ani].map((h) => [h.from_status, h.to_status, h.by_name]), [["", "terdaftar", "Sari"], ["terdaftar", "dikonfirmasi", "Sari"]]);
assert.ok(L.history[ani][1].at);
// hapus: hanya admin / Head
await call("/api/people", { ck: SARI, body: { event_id: G.id, name: "Bayu", phone: "081322223333", is_client: "0" } });
assert.equal(env.DB.db.prepare("SELECT n_reg FROM events WHERE id = ?").get(G.id).n_reg, 2);
assert.equal((await call("/api/people/delete", { ck: SARI, body: { id: ani } })).status, 403);
assert.equal((await call("/api/people/delete", { ck: HEADRM, body: { id: ani } })).status, 200);
assert.equal(env.DB.db.prepare("SELECT COUNT(*) AS n FROM people WHERE id = ?").get(ani).n, 0);
assert.equal(env.DB.db.prepare("SELECT COUNT(*) AS n FROM history WHERE person_id = ?").get(ani).n, 0, "riwayatnya ikut terhapus");
assert.equal(env.DB.db.prepare("SELECT n_reg FROM events WHERE id = ?").get(G.id).n_reg, 1, "angka ikut turun");
// teks WhatsApp
const wa = waText(WA_DEFAULT, { title: "Seminar RD", date: "2026-11-03", time_start: "09:00", time_end: "11:00", place: "Hotel Majapahit", mode: "tatap" }, { name: "Budi" });
assert.match(wa, /Halo Budi/); assert.match(wa, /Selasa, 3 November 2026/); assert.match(wa, /09\.00–11\.00 WIB/); assert.match(wa, /Hotel Majapahit/);
const wo = waText(WA_DEFAULT, { title: "Webinar", date: "2026-11-03", time_start: "19:00", time_end: "20:00", place: "", mode: "online", online_url: "https://zoom.test/j/1" }, { name: "Budi" });
assert.match(wo, /di online/); assert.match(wo, /https:\/\/zoom\.test\/j\/1/, "link acara online ikut di teks WhatsApp");
assert.equal(waText("{nama} {link}", { mode: "online", online_url: "https://z.test" }, { name: "A" }), "A https://z.test", "link tidak ditulis dua kali");
// persetujuan data: hanya admin; versi naik saat diganti
assert.equal((await call("/api/settings", { ck: SARI })).status, 403);
assert.equal((await call("/api/settings", { ck: ADM })).j.consent.ver, 1);
r = await call("/api/settings", { ck: ADM, body: { consent: "Teks persetujuan baru dari legal." } });
assert.equal(r.status, 200); assert.equal(r.j.consent.ver, 2);
assert.match((await page("/d/" + E1.code)).html, /Teks persetujuan baru dari legal\./);
// setiap versi teks tetap tersimpan: versi yang disetujui peserta bisa dibaca lagi
await call("/api/settings", { ck: ADM, body: { consent: "Versi tiga." } });
const vers = (await call("/api/settings", { ck: ADM })).j.versions;
assert.deepEqual(vers.map((v) => [v.ver, v.text.slice(0, 20)]), [[1, "Saya setuju nama, no"], [2, "Teks persetujuan bar"], [3, "Versi tiga."]]);
assert.ok(vers[1].at, "kapan versi itu mulai berlaku");
await call("/api/settings", { ck: ADM, body: { consent: "Teks persetujuan baru dari legal." } });
assert.equal((await call("/api/settings", { ck: ADM, body: { consent: " " } })).status, 400);

/* ---------- absen (publik) ---------- */
const { inWindow } = W;
const WEV = { date: "2026-11-03", time_start: "09:00", time_end: "11:00" };
assert.equal(inWindow(WEV, Date.parse("2026-11-03T01:00:00Z")), true, "08.00 WIB: 1 jam sebelum mulai");
assert.equal(inWindow(WEV, Date.parse("2026-11-02T23:59:00Z")), false, "06.59 WIB: belum dibuka");
assert.equal(inWindow(WEV, Date.parse("2026-11-03T05:59:00Z")), true, "12.59 WIB: masih dalam 2 jam setelah selesai");
assert.equal(inWindow(WEV, Date.parse("2026-11-03T06:01:00Z")), false, "13.01 WIB: sudah ditutup");
const DAY = Date.parse("2026-11-03T02:00:00Z");   // 09.00 WIB
const pageAt = async (path, at) => { env.NOW_MS = at; const x = await page(path); env.NOW_MS = T0; return x; };
const budi = () => env.DB.db.prepare("SELECT * FROM people WHERE event_id = ? AND phone = '628123456789'").get(E1.id);
assert.equal(budi().status, "terdaftar");
// di luar jendela waktu
assert.match((await pageAt("/h/" + E1.acode, Date.parse("2026-11-02T10:00:00Z"))).html, /Absen belum dibuka\./);
assert.match((await pageAt("/h/" + E1.acode, Date.parse("2026-11-04T02:00:00Z"))).html, /Absen sudah ditutup\./);
p = await submit("/h/" + E1.acode, { phone: "0812-3456-789" }, { at: Date.parse("2026-11-04T02:00:00Z") });
assert.match(p.html, /Absen sudah ditutup\./); assert.equal(budi().status, "terdaftar", "di luar jendela: tidak berubah");
assert.equal((await page("/h/tidakada123")).status, 404);
// dalam jendela: halaman berisi satu isian nomor HP, tanpa data peserta
p = await pageAt("/h/" + E1.acode, DAY);
assert.match(p.html, /name="phone"/); assert.doesNotMatch(p.html, /name="name"/); assert.doesNotMatch(p.html, /Budi/);
// terdaftar dengan +62, absen dengan 08 -> baris yang sama jadi Hadir, tanpa menampilkan nama
p = await submit("/h/" + E1.acode, { phone: "0812 3456 789" }, { at: DAY });
assert.equal(p.status, 200); assert.match(p.html, /Kehadiran tercatat/); assert.doesNotMatch(p.html, /Budi/);
assert.equal(budi().status, "hadir"); assert.equal(budi().walkin, 0);
assert.deepEqual({ ...env.DB.db.prepare("SELECT from_status, to_status, by_name FROM history WHERE person_id = ? ORDER BY id DESC").get(budi().id) }, { from_status: "terdaftar", to_status: "hadir", by_name: "Absen mandiri" });
assert.equal(env.DB.db.prepare("SELECT n_hadir FROM events WHERE id = ?").get(E1.id).n_hadir, 1);
// nomor belum terdaftar -> form walk-in (nomor sudah terisi), lalu tercatat Hadir + walk-in
p = await submit("/h/" + E1.acode, { phone: "0857 7777 8888" }, { at: DAY });
assert.match(p.html, /name="name"/); assert.match(p.html, /value="0857 7777 8888"/); assert.match(p.html, /belum terdaftar/);
assert.equal(people(E1.id).length, 1);
p = await submit("/h/" + E1.acode, { phone: "0857 7777 8888", name: "Citra", email: "citra@mail.test", is_client: "0", consent: "1" }, { at: DAY });
assert.match(p.html, /Kehadiran tercatat/); assert.doesNotMatch(p.html, /Citra/);
const citra = env.DB.db.prepare("SELECT * FROM people WHERE event_id = ? AND phone = '6285777778888'").get(E1.id);
assert.equal(citra.status, "hadir"); assert.equal(citra.walkin, 1); assert.equal(citra.src, "absen"); assert.ok(citra.consent_at);
assert.equal(env.DB.db.prepare("SELECT n_walkin FROM events WHERE id = ?").get(E1.id).n_walkin, 1);
// walk-in tanpa centang persetujuan -> ditolak
p = await submit("/h/" + E1.acode, { phone: "0857 1111 0000", name: "Dedi", email: "d@mail.test", is_client: "0" }, { at: DAY });
assert.equal(p.status, 400); assert.match(p.html, /Persetujuan data pribadi wajib dicentang\./);
// acara dibatalkan
assert.match((await pageAt("/h/" + E4.acode, DAY)).html, /Acara ini dibatalkan\./);
// banyak peserta dari Wi-Fi lokasi yang sama tetap bisa absen
for (let i = 0; i < 15; i++) assert.notEqual((await submit("/h/" + E1.acode, { phone: "0812 3456 789" }, { at: DAY, ip: "7.7.7.7" })).status, 429);

/* ---------- sambungan Content Planner (Planner asli, database sendiri) ---------- */
const { default: planner } = await import("../content-planner/worker.js");
const plEnv = { SSO_SECRET: SECRET, DB: d1(), HUB_URL: HUB, PROFILE: JSON.stringify({ urls: { hub: HUB } }) };
const plCalls = [];
env.PLANNER = { fetch: (u, init) => { plCalls.push(new URL(String(u)).pathname); return planner.fetch(new Request(u, init), plEnv, { waitUntil() { } }); } };
const plItem = (id) => plEnv.DB.db.prepare("SELECT * FROM items WHERE id = ?").get(id);
await planner.fetch(new Request("https://planner/__hub/users", { method: "POST", headers: { "x-hub-key": SECRET, "content-type": "application/json" },
  body: JSON.stringify({ users: [{ email: "sari@acme.test", name: "Sari", job: "sales", branch: "Cabang Surabaya" }, { email: "pia@acme.test", name: "Pia", job: "partnership" }], branches: BRANCHES, org: ORG }) }), plEnv, {});
// buat event + kegiatan baru di Planner
r = await call("/api/events", { ck: SARI, body: { ...NEW, title: "Seminar Obligasi Surabaya", link: { create: true } } });
assert.equal(r.status, 200, JSON.stringify(r.j));
let LE = env.DB.db.prepare("SELECT * FROM events WHERE id = ?").get(r.j.id);
assert.ok(LE.item_id, "tersambung ke kegiatan Planner"); assert.equal(LE.item_kind, "cabang");
let PI = plItem(LE.item_id);
assert.deepEqual([PI.kind, PI.title, PI.date, PI.time, PI.place, PI.branch, PI.status, PI.owner_email, PI.event_id], ["cabang", "Seminar Obligasi Surabaya", "2026-11-10", "18:30", "Galaxy Mall", "Cabang Surabaya", "rencana", "sari@acme.test", LE.id]);
// pilihan kegiatan yang sudah ada: hanya kegiatan cabang sendiri yang belum tersambung
const free = (await planner.fetch(new Request("https://planner/__hub/item", { method: "POST", headers: { "x-hub-key": SECRET, "content-type": "application/json" },
  body: JSON.stringify({ by: { email: "sari@acme.test", name: "Sari", job: "sales" }, item: { kind: "cabang", title: "Gathering Desember", date: "2026-12-05", channel: "Gathering nasabah", status: "rencana", branch: "Cabang Surabaya" } }) }), plEnv, {}).then((x) => x.json())).id;
let opts = (await call("/api/planner-items", { ck: SARI })).j;
assert.deepEqual(opts.map((x) => x.id), [free]);
assert.equal((await call("/api/planner-items", { ck: TONO })).j.length, 0);
r = await call("/api/events", { ck: TONO, body: { ...NEW, title: "Curang", branch: "Cabang Sudirman", link: { item_id: free } } });
assert.equal(r.status, 400); assert.equal(r.j.error, "Kegiatan Content Planner ini tidak bisa dipilih.");
r = await call("/api/events", { ck: SARI, body: { ...NEW, title: "Gathering Desember", date: "2026-12-05", link: { item_id: free } } });
assert.equal(r.status, 200);
assert.equal(plItem(free).event_id, r.j.id); assert.equal(plItem(free).time, "18:30", "jam dari event ikut ke Planner");
// pendaftar & hadir -> Leads & Peserta
await submit("/d/" + LE.code, REG);
await submit("/d/" + LE.code, { ...REG, phone: "081399990000", name: "Eka" });
const evAt = Date.parse("2026-11-10T11:30:00Z");   // 18.30 WIB
await submit("/h/" + LE.acode, { phone: "081399990000" }, { at: evAt });
PI = plItem(LE.item_id);
assert.deepEqual([PI.leads, PI.result_num], [2, 1]);
// event diubah -> kegiatan ikut; event dibatalkan -> kegiatan batal
r = await call("/api/events", { ck: SARI, body: { ...NEW, id: LE.id, title: "Seminar Obligasi Surabaya Timur", time_start: "19:00" } });
assert.equal(r.status, 200);
PI = plItem(LE.item_id); assert.deepEqual([PI.title, PI.time], ["Seminar Obligasi Surabaya Timur", "19:00"]);
r = await call("/api/events", { ck: SARI, body: { ...NEW, id: LE.id, title: "Seminar Obligasi Surabaya Timur", time_start: "19:00", status: "batal" } });
assert.equal(plItem(LE.item_id).status, "batal");
// pembuat di luar tim regional -> kegiatan Edukasi (Webinar untuk online), hanya Peserta
r = await call("/api/events", { ck: PIA, body: { ...NEW, title: "Webinar SBN", mode: "online", online_url: "https://zoom.test/x", place: "", link: { create: true } } });
const PE = env.DB.db.prepare("SELECT * FROM events WHERE id = ?").get(r.j.id);
PI = plItem(PE.item_id);
assert.deepEqual([PE.item_kind, PI.kind, PI.channel, PI.branch, PI.owner_email, PI.place], ["edukasi", "edukasi", "Webinar", "", "pia@acme.test", "Online"]);
// kegiatan dihapus di Planner -> event tetap, ditandai tidak tersambung; tidak membuat kegiatan baru
const LE2 = env.DB.db.prepare("SELECT * FROM events WHERE item_id = ?").get(free);
plEnv.DB.db.prepare("DELETE FROM items WHERE id = ?").run(free);
const n0 = plEnv.DB.db.prepare("SELECT COUNT(*) AS n FROM items").get().n;
p = await submit("/d/" + LE2.code, { ...REG, phone: "081355550000" });
assert.match(p.html, /Terima kasih/);
assert.equal(env.DB.db.prepare("SELECT item_gone FROM events WHERE id = ?").get(LE2.id).item_gone, 1);
assert.equal(plEnv.DB.db.prepare("SELECT COUNT(*) AS n FROM items").get().n, n0, "kegiatan tidak dibuat ulang");
// Planner mati: pendaftaran tetap jalan
env.PLANNER = { fetch: async () => { throw new Error("Planner mati"); } };
p = await submit("/d/" + E1.code, { ...REG, phone: "081366660000" });
assert.match(p.html, /Terima kasih/);
r = await call("/api/events", { ck: SARI, body: { ...NEW, title: "Saat Planner mati", link: { create: true } } });
assert.equal(r.status, 200); assert.match(r.j.warn, /Content Planner/);

/* ---------- halaman tim ---------- */
res = await raw("/", { ck: SARI });
assert.equal(res.status, 200);
let html = await res.text();
assert.match(html, /id="evList"/);
assert.match(res.headers.get("content-security-policy"), /frame-ancestors 'self' https:\/\/hub\.acme\.test/, "hanya tampil di dalam Tool Hub");
const cfgOf = (h) => JSON.parse(/window\.EV=(.*?);<\/script>/s.exec(h)[1]);
const EVCFG = cfgOf(html);
assert.deepEqual([EVCFG.me.reg, EVCFG.me.branch, EVCFG.me.canDelete, EVCFG.pub], [true, "Cabang Surabaya", false, BASE]);
assert.deepEqual(EVCFG.branches.map((x) => x.c), ["Cabang Surabaya"], "Sales hanya melihat cabangnya di pilihan");
assert.equal(cfgOf(await (await raw("/", { ck: HEADRM })).text()).branches.length, BRANCHES.length);
assert.deepEqual(cfgOf(await (await raw("/", { ck: PIA })).text()).branches, [], "di luar tim regional: tanpa pilihan cabang");
html = await (await raw("/", { ck: await cookie({ e: "x@acme.test", n: "X</script><b>", j: "copy" }) })).text();
assert.ok(!html.includes("X</script>"), "nama tidak bisa menutup tag skrip"); assert.equal(cfgOf(html).me.name, "X</script><b>");

/* ---------- data pribadi dihapus 12 bulan setelah acara ---------- */
{
  const { purgeOld } = W;
  const OLD = addEvent({ date: "2025-10-01", n_reg: 2, n_hadir: 1 }), KEEP = addEvent({ date: "2026-01-01" });
  const person = (e, ph) => env.DB.db.prepare("INSERT INTO people (id, event_id, name, phone, status, created_at) VALUES (?, ?, 'X', ?, 'terdaftar', '')").run(e.id + ph, e.id, ph);
  person(OLD, "6281100000001"); person(OLD, "6281100000002"); person(KEEP, "6281100000003");
  env.DB.db.prepare("INSERT INTO history (person_id, at, by_name, from_status, to_status) VALUES (?, '', 'x', '', 'terdaftar')").run(OLD.id + "6281100000001");
  const NOW = Date.parse("2026-10-30T03:00:00Z");
  assert.deepEqual(await purgeOld(env, NOW), { events: 1, people: 2 });
  const o = env.DB.db.prepare("SELECT purged, n_reg, n_hadir FROM events WHERE id = ?").get(OLD.id);
  assert.deepEqual([o.purged, o.n_reg, o.n_hadir], [1, 2, 1], "angka tetap");
  assert.equal(people(OLD.id).length, 0); assert.equal(people(KEEP.id).length, 1);
  assert.equal(env.DB.db.prepare("SELECT COUNT(*) AS n FROM history WHERE person_id = ?").get(OLD.id + "6281100000001").n, 0);
  assert.deepEqual(await purgeOld(env, NOW), { events: 0, people: 0 }, "tidak dihapus dua kali");
  // event lama tidak bisa ditambah peserta lagi, halaman publiknya tertutup
  env.DB.db.prepare("UPDATE events SET branch = 'Cabang Surabaya' WHERE id = ?").run(OLD.id);
  assert.equal((await call("/api/people", { ck: SARI, body: { event_id: OLD.id, name: "Baru", phone: "081311110000" } })).j.error, "Data peserta acara ini sudah dihapus.");
  // dijalankan saat daftar event dibuka, paling sering sekali per 6 jam
  const OLD2 = addEvent({ date: "2025-09-01" }); person(OLD2, "6281100000009");
  env.DB.db.prepare("DELETE FROM cfg WHERE k = 'purged_at'").run();   // cek sebelumnya di file ini ikut menjalankannya
  env.NOW_MS = NOW; await call("/api/events", { ck: SARI });
  assert.equal(people(OLD2.id).length, 0, "terhapus saat daftar event dibuka");
  const OLD3 = addEvent({ date: "2025-08-01" }); person(OLD3, "6281100000010");
  env.NOW_MS = NOW + 3600e3; await call("/api/events", { ck: SARI });
  assert.equal(people(OLD3.id).length, 1, "belum 6 jam: tidak dijalankan lagi");
  env.NOW_MS = NOW + 7 * 3600e3; await call("/api/events", { ck: SARI });
  assert.equal(people(OLD3.id).length, 0);
  env.NOW_MS = T0;
}

console.log("semua cek lolos");
