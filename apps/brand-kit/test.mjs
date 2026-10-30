// Cek Brand Kit: login, sinkron dari Tool Hub, aturan akses, disclaimer, template, narasumber, file Drive, sambungan Event & Lead.
// Jalankan: node apps/brand-kit/test.mjs   (Node 22.15+). D1 ditiru dengan node:sqlite, jadi query benar-benar dijalankan.
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
const { default: worker, canEditSpeaker, SIZES } = W;

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
function kv() {
  const m = new Map();
  return {
    m,
    async get(k, t) { const x = m.get(k); if (x == null) return null; return t === "json" ? JSON.parse(x.v) : t === "arrayBuffer" ? x.v.buffer.slice(0) : typeof x.v === "string" ? x.v : new TextDecoder().decode(x.v); },
    async getWithMetadata(k, t) { const x = m.get(k); return { value: x == null ? null : await this.get(k, t), metadata: x ? x.meta : null }; },
    async put(k, v, o = {}) { m.set(k, { v: typeof v === "string" ? v : new Uint8Array(v instanceof ArrayBuffer ? v : v.buffer ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v), meta: o.metadata }); },
    async delete(k) { m.delete(k); },
  };
}
const SECRET = "s".repeat(40), HUB = "https://hub.acme.test", BASE = "https://brand.acme.test";
const env = { SSO_SECRET: SECRET, DB: d1(), BRAND_KV: kv(), HUB_URL: HUB, PROFILE: JSON.stringify({ urls: { hub: HUB, brand: BASE, event: "https://event.acme.test" } }) };
const ORG = DEFAULT_ORG;

// cookie sesi Brand Kit, ditandatangani sama seperti HUBSSO.ticket
const te = new TextEncoder(), b64 = (buf) => Buffer.from(buf).toString("base64url");
async function cookie(p) {
  const body = b64(te.encode(JSON.stringify({ app: "brand", x: Date.now() + 3600e3, ...p })));
  const key = await crypto.subtle.importKey("raw", te.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `hub_brand=${body}.${b64(await crypto.subtle.sign("HMAC", key, te.encode(body)))}`;
}
// kerja di belakang layar (ctx.waitUntil) ditunggu sampai selesai sebelum cek berikutnya
const ctx = () => { const P = []; return { waitUntil: (p) => P.push(p), done: () => Promise.all(P) }; };
const run = async (req, e = env) => { const c = ctx(), r = await worker.fetch(req, e, c); await c.done(); return r; };
const raw = (path, { ck, body, headers = {}, method, e = env } = {}) => run(new Request(BASE + path, { method: method || (body !== undefined ? "POST" : "GET"), redirect: "manual",
  headers: { ...(ck ? { cookie: ck } : {}), ...(body !== undefined && !(body instanceof Uint8Array) ? { "content-type": "application/json" } : {}), ...headers },
  body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body) }), e);
const call = async (path, o = {}) => { const r = await raw(path, o); return { status: r.status, j: await r.json().catch(() => null) }; };

/* ---------- aturan akses ---------- */
const sp = { created_by: "s@x" };
assert.equal(canEditSpeaker({ e: "s@x", j: "sales" }, sp, ORG), true, "pembuat");
assert.equal(canEditSpeaker({ e: "t@x", j: "sales" }, sp, ORG), false, "orang lain");
assert.equal(canEditSpeaker({ e: "h@x", j: "head_rm" }, sp, ORG), true, "Head");
assert.equal(canEditSpeaker({ e: "a@x", adm: true }, sp, ORG), true, "admin");
assert.equal(SIZES.a3.w * SIZES.a3.h > 16e6, true, "A3 melewati batas canvas HP");
assert.deepEqual(Object.keys(SIZES), ["story", "feed45", "feed11", "a4", "a3", "xbanner"]);
assert.deepEqual([SIZES.a4.w, SIZES.a4.h, SIZES.xbanner.w, SIZES.xbanner.h], [2551, 3579, 2386, 6323]);

/* ---------- login ---------- */
let r = await call("/api/templates");
assert.equal(r.status, 401); assert.equal(r.j.error, "Sesi habis. Muat ulang halaman.");
let res = await raw("/");
assert.equal(res.status, 303); assert.ok(res.headers.get("location").startsWith(HUB + "/sso?app=brand"), "tanpa cookie -> login lewat hub");

/* ---------- anggota, cabang, tim & role dari Tool Hub ---------- */
const BRANCHES = [{ r: "Jawa Timur", c: "Cabang Surabaya", t: "cabang" }, { r: "Jakarta", c: "Cabang Sudirman", t: "cabang" }];
const hubPush = (path, body) => call(path, { body, headers: { "x-hub-key": SECRET } });
assert.equal((await call("/__hub/users", { body: { users: [] } })).status, 403, "tanpa kunci hub ditolak");
r = await hubPush("/__hub/users", { users: [{ email: "Sari@acme.test", name: "Sari", job: "sales", branch: "Cabang Surabaya" }, { email: "adm@acme.test", name: "Adm", job: "", branch: "", adm: true }], branches: BRANCHES, org: ORG });
assert.equal(r.status, 200);
const U = JSON.parse(env.DB.db.prepare("SELECT v FROM cfg WHERE k = 'users'").get().v);
assert.deepEqual(U[0], { email: "sari@acme.test", name: "Sari", job: "sales", branch: "Cabang Surabaya", adm: false });
assert.equal(U[1].adm, true, "status admin ikut tersimpan");
assert.deepEqual(await W.getBranches(env), BRANCHES);

// halaman: cabang dari daftar anggota bila tiket tidak membawanya
const SARI = await cookie({ e: "sari@acme.test", n: "Sari", j: "sales" });
res = await raw("/", { ck: SARI });
assert.equal(res.status, 200);
assert.match(await res.text(), /window\.BK=\{[^<]*"branch":"Cabang Surabaya"/);
const ADM = await cookie({ e: "adm@acme.test", n: "Adm", adm: true });
const HEAD = await cookie({ e: "head@acme.test", n: "Hana", j: "head_rm" });
const TONO = await cookie({ e: "tono@acme.test", n: "Tono", j: "sales", c: "Cabang Sudirman" });

/* ---------- disclaimer ---------- */
// kiriman ke Copy Studio & Edukasi Studio dicatat (alamat, kunci, isi)
const pushes = [];
const rec = (name, fail = () => false) => ({ fetch: async (u, init) => { const req = new Request(u, init); if (fail()) throw new Error("mati");
  pushes.push({ name, url: req.url, key: req.headers.get("x-hub-key"), body: await req.json() }); return Response.json({ ok: true }); } });
let copyDown = false;
env.COPY = rec("copy", () => copyDown); env.EDUKASI = rec("edukasi");
r = await call("/api/disclaimers", { ck: SARI });
assert.equal(r.status, 200);
assert.deepEqual(r.j.list.map((x) => x.key), ["umum", "reksadana", "obligasi", "syariah", "edukasi", "singkat"]);
assert.equal(r.j.list.find((x) => x.key === "singkat").text, "PT Korea Investment And Sekuritas Indonesia berizin dan diawasi oleh OJK.");
assert.ok(r.j.list.find((x) => x.key === "edukasi").text.startsWith(W.EDU_DEFAULT), "isi awal Edukasi = teks Edukasi Studio sekarang");
assert.equal(r.j.list.find((x) => x.key === "umum").text, "");
// bukan admin: ditolak, tidak berubah
r = await call("/api/disclaimers", { ck: SARI, body: { key: "umum", text: "x" }, headers: { origin: BASE } });
assert.equal(r.status, 403);
assert.equal(env.DB.db.prepare("SELECT text FROM disclaimers WHERE key = 'umum'").get().text, "");
r = await call("/api/disclaimers", { ck: ADM, body: { key: "umum", text: "x" }, headers: { origin: "https://jahat.test" } });
assert.equal(r.status, 403, "permintaan dari situs lain ditolak");
// admin menyimpan -> riwayat + terkirim ke dua tool
r = await call("/api/disclaimers", { ck: ADM, body: { key: "umum", text: "  Teks umum  " } });
assert.equal(r.status, 200);
assert.equal(env.DB.db.prepare("SELECT text FROM disclaimers WHERE key = 'umum'").get().text, "Teks umum");
assert.equal(env.DB.db.prepare("SELECT COUNT(*) n FROM disc_history WHERE key = 'umum'").get().n, 1);
assert.deepEqual(pushes.map((p) => [p.name, p.url, p.key]), [["copy", "https://copy/__hub/disclaimers", SECRET], ["edukasi", "https://edukasi/__hub/disclaimers", SECRET]]);
assert.equal(pushes[0].body.versions.length, 6);
assert.deepEqual(pushes[0].body.versions[0], { key: "umum", label: "Umum", text: "Teks umum" });
assert.deepEqual(r.j.push.ok, { copy: true, edukasi: true });
// teks Edukasi diubah dua kali: teks lama ikut terkirim (supaya artikel lama tidak berakhir dengan dua disclaimer)
const edu0 = env.DB.db.prepare("SELECT text FROM disclaimers WHERE key = 'edukasi'").get().text;
await call("/api/disclaimers", { ck: ADM, body: { key: "edukasi", text: "Teks A" } });
pushes.length = 0;
await call("/api/disclaimers", { ck: ADM, body: { key: "edukasi", text: "Teks B" } });
assert.deepEqual(pushes[1].body.old.edukasi, ["Teks A", edu0]);
// Copy Studio mati: tetap tersimpan, status kiriman tercatat
copyDown = true;
r = await call("/api/disclaimers", { ck: ADM, body: { key: "syariah", text: "Teks syariah" } });
assert.equal(r.status, 200); assert.deepEqual(r.j.push.ok, { copy: false, edukasi: true });
assert.equal((await call("/api/disclaimers", { ck: ADM })).j.push.ok.copy, false);
copyDown = false;
r = await call("/api/disclaimers/push", { ck: ADM, body: {} });
assert.deepEqual(r.j.push.ok, { copy: true, edukasi: true }, "kirim ulang");
assert.equal((await call("/api/disclaimers/push", { ck: SARI, body: {} })).status, 403);
assert.equal((await call("/api/disclaimers", { ck: ADM, body: { key: "lain", text: "x" } })).status, 400, "versi tidak dikenal");

/* ---------- template & ukuran ---------- */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
assert.equal((await call("/api/templates", { ck: SARI, body: { name: "x" } })).status, 403, "bukan admin");
assert.equal((await raw("/bg/x", { ck: SARI, method: "PUT", body: PNG })).status, 403, "bukan admin: unggah gambar latar ditolak");
assert.equal(env.DB.db.prepare("SELECT COUNT(*) n FROM templates").get().n, 0);
r = await call("/api/templates", { ck: ADM, body: { name: "  Seminar  " } });
assert.equal(r.status, 200); const TID = r.j.id;
assert.equal((await call("/api/templates", { ck: ADM, body: { name: "" } })).status, 400, "nama kosong");
const SLOT = { id: "s1", type: "text", field: "cabang", label: "Nama cabang", x: 5000, y: 100, w: 400, h: 60, font: "Montserrat", weight: 700, size: 44, minSize: 24,
  color: "#ffffff", align: "left", max: 30, required: true, def: "", auto: "branch" };
const SIZE = { template_id: TID, kind: "story", dark: true, logo: { y: 80, h: 90 }, disc: { key: "reksadana", x: 60, y: 1800, w: 960, size: 18, color: "#ffffff", align: "center" },
  slots: [SLOT, { id: "sp", type: "speakers", x: 40, y: 900, w: 1000, h: 600, max: 6, font: "Poppins", nameSize: 30, nameColor: "#0b5d3b", titleSize: 22, titleColor: "#445566" },
    { id: "q", type: "qr", x: 820, y: 1500, size: 200, color: "#000000" }] };
r = await call("/api/sizes", { ck: ADM, body: SIZE });
assert.equal(r.status, 200, JSON.stringify(r.j)); const SID = r.j.id;
const srow = env.DB.db.prepare("SELECT * FROM sizes WHERE id = ?").get(SID), sl = JSON.parse(srow.slots);
assert.ok(sl[0].x + sl[0].w <= 1080 && sl[0].x >= 0, "kotak dijaga di dalam gambar");
assert.equal(sl.length, 3); assert.equal(srow.dark, 1);
assert.equal((await call("/api/sizes", { ck: ADM, body: { ...SIZE, id: SID, slots: [{ ...SLOT, font: "Comic Sans" }] } })).status, 400, "font di luar daftar");
assert.equal((await call("/api/sizes", { ck: ADM, body: { ...SIZE, id: SID, slots: [{ ...SLOT, color: "red" }] } })).status, 400, "warna bukan #rrggbb");
assert.equal((await call("/api/sizes", { ck: ADM, body: { ...SIZE, kind: "poster" } })).status, 400, "ukuran tidak dikenal");
assert.equal((await call("/api/sizes", { ck: ADM, body: SIZE })).status, 400, "ukuran yang sama dua kali di satu template");
assert.equal((await call("/api/sizes", { ck: ADM, body: { ...SIZE, id: SID, slots: [SIZE.slots[1], { ...SIZE.slots[1], id: "sp2" }] } })).status, 400, "satu area narasumber per ukuran");
assert.equal((await call("/api/sizes", { ck: ADM, body: { ...SIZE, id: SID, slots: [{ ...SIZE.slots[1], max: 7 }] } })).status, 400, "maks. 6 narasumber");
// belum boleh tampil: gambar latar belum ada, lalu disclaimer kosong
r = await call("/api/templates", { ck: ADM, body: { id: TID, name: "Seminar", status: "live" } });
assert.equal(r.status, 400); assert.equal(r.j.error, "Gambar latar Story belum diunggah.");
assert.equal((await raw("/bg/" + SID, { ck: ADM, method: "PUT", body: new TextEncoder().encode("bukan gambar") })).status, 400, "bukan PNG / JPEG");
assert.equal((await raw("/bg/" + SID, { ck: ADM, method: "PUT", body: PNG, headers: { origin: "https://jahat.test" } })).status, 403);
assert.equal((await raw("/bg/" + SID, { ck: ADM, method: "PUT", body: PNG })).status, 200);
assert.equal(env.DB.db.prepare("SELECT has_bg FROM sizes WHERE id = ?").get(SID).has_bg, 1);
r = await call("/api/templates", { ck: ADM, body: { id: TID, name: "Seminar", status: "live" } });
assert.equal(r.status, 400); assert.equal(r.j.error, "Disclaimer Reksa Dana belum diisi.");
assert.equal((await call("/api/templates", { ck: SARI })).j.templates.length, 0, "draf tidak terlihat cabang");
await call("/api/sizes", { ck: ADM, body: { ...SIZE, id: SID, disc: { ...SIZE.disc, key: "umum" } } });
r = await call("/api/templates", { ck: ADM, body: { id: TID, name: "Seminar", status: "live" } });
assert.equal(r.status, 200, JSON.stringify(r.j));
r = await call("/api/templates", { ck: SARI });
assert.equal(r.j.templates.length, 1); assert.equal(r.j.templates[0].name, "Seminar");
assert.equal(r.j.templates[0].sizes[0].slots.length, 3); assert.equal(r.j.templates[0].sizes[0].has_bg, 1);
res = await raw("/bg/" + SID, { ck: SARI });
assert.equal(res.status, 200); assert.equal(res.headers.get("content-type"), "image/png");
assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PNG);
assert.equal((await raw("/bg/" + SID)).status, 401, "gambar latar perlu login");
// X-banner selalu disclaimer Singkat
r = await call("/api/sizes", { ck: ADM, body: { ...SIZE, kind: "xbanner", disc: { ...SIZE.disc, key: "umum" } } });
assert.equal(r.status, 200);
assert.equal(JSON.parse(env.DB.db.prepare("SELECT disc FROM sizes WHERE id = ?").get(r.j.id).disc).key, "singkat");
const XID = r.j.id;
// catatan unduhan
assert.equal((await call("/api/usage", { ck: SARI, body: { template_id: TID, kind: "story" } })).status, 200);
assert.equal((await call("/api/usage", { ck: TONO, body: { template_id: TID, kind: "a4", event_id: "ev1" } })).status, 200);
assert.equal((await call("/api/usage", { ck: TONO, body: { template_id: "tidakada", kind: "a4" } })).status, 404);
assert.equal((await call("/api/usage", { ck: SARI })).status, 403, "ringkasan pemakaian khusus admin");
r = await call("/api/usage", { ck: ADM });
assert.deepEqual(r.j.byTemplate, [{ name: "Seminar", n: 2 }]);
assert.deepEqual(r.j.byBranch, [{ branch: "Cabang Sudirman", n: 1 }, { branch: "Cabang Surabaya", n: 1 }]);
// hapus ukuran / template: gambar latarnya ikut terhapus
await raw("/bg/" + XID, { ck: ADM, method: "PUT", body: PNG });
assert.equal((await call("/api/sizes", { ck: ADM, body: { id: XID, delete: true } })).status, 200);
assert.equal(env.BRAND_KV.m.has("bg:" + XID), false);
const T2 = (await call("/api/templates", { ck: ADM, body: { name: "Hapus aku" } })).j.id;
const S2 = (await call("/api/sizes", { ck: ADM, body: { ...SIZE, template_id: T2 } })).j.id;
await raw("/bg/" + S2, { ck: ADM, method: "PUT", body: PNG });
assert.equal((await call("/api/templates/delete", { ck: SARI, body: { id: T2 } })).status, 403);
assert.equal((await call("/api/templates/delete", { ck: ADM, body: { id: T2 } })).status, 200);
assert.equal(env.BRAND_KV.m.has("bg:" + S2), false); assert.equal(env.DB.db.prepare("SELECT COUNT(*) n FROM sizes WHERE template_id = ?").get(T2).n, 0);

/* ---------- narasumber ---------- */
const jpeg = (n) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); return "data:image/jpeg;base64," + Buffer.from(b).toString("base64"); };
assert.equal((await call("/api/speakers", { ck: SARI, body: { name: "Budi", title: "Analis" } })).status, 400, "narasumber baru wajib ada foto");
assert.equal((await call("/api/speakers", { ck: SARI, body: { name: "Budi", title: "Analis", photo: "data:image/png;base64,iVBORw0KGgo=" } })).status, 400, "hanya JPEG");
assert.equal((await call("/api/speakers", { ck: SARI, body: { name: "Budi", title: "Analis", photo: jpeg(250 * 1024) } })).status, 400, "foto terlalu besar");
assert.equal((await call("/api/speakers", { ck: SARI, body: { name: "", title: "Analis", photo: jpeg(1000) } })).status, 400, "nama kosong");
r = await call("/api/speakers", { ck: SARI, body: { name: " Budi Santoso ", title: "Head of Research, KISI", photo: jpeg(60 * 1024) } });
assert.equal(r.status, 200); const SPK = r.j.id;
let L = (await call("/api/speakers", { ck: SARI })).j.speakers;
assert.equal(L.length, 1); assert.equal(L[0].name, "Budi Santoso"); assert.equal(L[0].canEdit, true); assert.equal(L[0].photo, undefined, "foto tidak ikut di daftar");
assert.ok(L[0].v, "penanda versi foto");
assert.equal((await call("/api/speakers", { ck: TONO })).j.speakers[0].canEdit, false, "dipakai bersama, tapi hanya pembuat yang boleh ubah");
assert.equal((await call("/api/speakers", { ck: TONO, body: { id: SPK, name: "X", title: "" } })).status, 403);
assert.equal((await call("/api/speakers/delete", { ck: TONO, body: { id: SPK } })).status, 403);
assert.equal((await call("/api/speakers", { ck: HEAD, body: { id: SPK, name: "Budi S.", title: "Head of Research" } })).status, 200, "Head boleh ubah (foto lama tetap)");
res = await raw("/photo/" + SPK, { ck: TONO });
assert.equal(res.status, 200); assert.equal(res.headers.get("content-type"), "image/jpeg");
assert.equal(new Uint8Array(await res.arrayBuffer())[1], 0xd8);
assert.equal((await raw("/photo/" + SPK)).status, 401);
assert.equal((await call("/api/speakers/delete", { ck: SARI, body: { id: SPK } })).status, 200);
assert.equal((await call("/api/speakers", { ck: SARI })).j.speakers.length, 0);

console.log("semua cek lolos");
