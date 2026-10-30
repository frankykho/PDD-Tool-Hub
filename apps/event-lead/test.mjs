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
async function submit(path, fields, { ip = "10.0.0." + ++ipN, age = 5000 } = {}) {
  env.NOW_MS = T0 - age; const ts = await formStamp(env); env.NOW_MS = T0;
  const r = await worker.fetch(new Request(BASE + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip }, body: new URLSearchParams({ ts, website: "", ...fields }) }), env, { waitUntil() { } });
  return { status: r.status, html: await r.text() };
}
const page = async (path) => { const r = await raw(path); return { status: r.status, html: await r.text() }; };

const E1 = addEvent({});
let p = await page("/d/" + E1.code);
assert.equal(p.status, 200);
assert.match(p.html, /Seminar Reksa Dana/); assert.match(p.html, /Selasa, 3 November 2026/); assert.match(p.html, /09\.00–11\.00 WIB/); assert.match(p.html, /Hotel Majapahit/);
assert.match(p.html, /\/brand\/ikisi-color\.png/, "logo iKISI");
assert.match(p.html, /name="website"/, "kolom jebakan");
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
// batas kiriman per IP per jam
for (let i = 0; i < 10; i++) assert.notEqual((await submit("/d/" + E1.code, { ...REG, website: "x" }, { ip: "9.9.9.9" })).status, 429);
p = await submit("/d/" + E1.code, REG, { ip: "9.9.9.9" });
assert.equal(p.status, 429); assert.match(p.html, /Terlalu banyak pendaftaran dari jaringan ini\. Coba lagi nanti\./);

console.log("semua cek lolos");
