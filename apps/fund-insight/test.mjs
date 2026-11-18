// Cek halaman nasabah Fund Insight: kuis profil risiko (/profil), proposal dari sales (/api/proposal -> /r/<kode>),
// dan hitungan kartu "Berapa lama sebaiknya disimpan" + skor kuis. Jalankan: node apps/fund-insight/test.mjs   (Node 22.15+)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import fund from "./worker.js";

function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
  });
  return { db, prepare: (sql) => st(sql), batch: async (list) => { const out = []; for (const x of list) out.push(await x.all()); return out; } };
}
const env = { DB: d1(), ADMIN_KEY: "kunci-admin", SSO_SECRET: "s".repeat(40), HUB_URL: "https://hub.acme.test" };
const O = "https://fund.acme.test";
const call = (path, init = {}) => fund.fetch(new Request(O + path, init), env, { waitUntil() {} });
const post = (path, body, extra = {}) => call(path, { method: "POST", headers: { "content-type": "application/json", ...extra }, body: JSON.stringify(body) });

/* ---------- kuis profil risiko: publik, tanpa login ---------- */
let r = await call("/profil");
assert.equal(r.status, 200);
const page = await r.text();
assert.match(page, /window\.NAS_VIEW="quiz";/);
assert.match(page, /<base href="\/">/, "fetch relatif tetap ke /api/... ");

/* ---------- proposal: hanya pengguna masuk (atau kunci admin) yang bisa membuat ---------- */
r = await post("/api/proposal", { ids: ["2914"] }, { origin: O });
assert.equal(r.status, 401, "tanpa login ditolak");
r = await post("/api/proposal", { ids: ["2914"] }, { origin: "https://jahat.test" });
assert.equal(r.status, 403, "dari situs lain ditolak");
r = await post("/api/proposal?key=kunci-admin", { ids: ["tidak-ada"] });
assert.equal(r.status, 400, "produk tidak dikenal ditolak");

const note = "Cocok untuk dana darurat.\n</script><script>alert(1)</script>";
r = await post("/api/proposal?key=kunci-admin", { ids: ["2914", "3026", "2914", "x", "3026"], name: " Bapak Budi ", goal: "Dana pendidikan", note: note + "z".repeat(600) });
assert.equal(r.status, 200);
const { id } = await r.json();
assert.match(id, /^[a-f0-9]{10}$/);
const saved = JSON.parse((await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind("prop:" + id).first()).v);
assert.deepEqual(saved.ids, ["2914", "3026"], "produk unik & dikenal saja");
assert.equal(saved.name, "Bapak Budi");
assert.equal(saved.note.length, 500, "catatan dipotong 500 karakter");
assert.equal(saved.by, "admin");

r = await call("/r/" + id);
assert.equal(r.status, 200);
const pp = await r.text(), inj = /window\.PROP=(.*?);<\/script>/.exec(pp);
assert.ok(inj, "data proposal disisipkan ke halaman");
assert.ok(!inj[1].includes("</script>"), "catatan tidak bisa menutup tag script");
assert.equal(JSON.parse(inj[1]).note, saved.note, "isi catatan utuh setelah di-escape");
assert.match(pp, /window\.NAS_VIEW="prop";/);
assert.equal((await call("/r/0000000000")).status, 404);
assert.equal((await call("/r/bukan-kode")).status, 404);
assert.equal((await call("/api/users")).status, 404, "kelola pengguna lama sudah dihapus (pindah ke Tool Hub)");

/* ---------- Proposal saya: status dibuka, berlaku 90 hari, cabut link ---------- */
{
  const { propExpired, PREVIEW_UA } = await import("./worker.js");
  const row = async (k) => JSON.parse((await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind("prop:" + k).first()).v);
  assert.match(pp, /"exp":"/, "nasabah melihat sampai kapan link berlaku");
  assert.doesNotMatch(pp, /"u":"admin"/, "username/email pembuat tidak ikut ke halaman publik");
  assert.ok((await row(id)).o, "pembukaan pertama oleh nasabah dicatat");
  // pratinjau link WhatsApp tidak dihitung sebagai dibuka
  r = await post("/api/proposal?key=kunci-admin", { ids: ["2914"], name: "Ani" });
  const id2 = (await r.json()).id;
  await call("/r/" + id2, { headers: { "user-agent": "WhatsApp/2.23.20.0 A" } });
  assert.equal((await row(id2)).o, undefined, "pratinjau WhatsApp bukan pembukaan nasabah");
  assert.ok(PREVIEW_UA.test("facebookexternalhit/1.1") && !PREVIEW_UA.test("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari"));
  // daftar: tanpa catatan & tanpa username, terbaru dulu, ada tanggal berlaku
  r = await call("/api/proposal?key=kunci-admin");
  let L = await r.json();
  assert.deepEqual(L.map((p) => p.id), [id2, id]);
  assert.ok(L.every((p) => p.exp && !("note" in p) && !("u" in p)));
  assert.equal(L[1].o != null, true);
  assert.equal((await call("/api/proposal")).status, 401, "daftar butuh login");
  // kedaluwarsa: link 404 dan baris dihapus saat daftar dibuka
  const tua = await row(id2); tua.at = new Date(Date.now() - 91 * 864e5).toISOString();
  await env.DB.prepare("UPDATE meta SET v=? WHERE k=?").bind(JSON.stringify(tua), "prop:" + id2).run();
  assert.equal(propExpired(tua), true);
  assert.equal(propExpired({ at: new Date().toISOString() }), false);
  assert.equal(propExpired({ at: "bukan tanggal" }), true, "tanggal rusak dianggap kedaluwarsa");
  r = await call("/r/" + id2);
  assert.equal(r.status, 404);
  assert.match(await r.text(), /90 hari/);
  L = await (await call("/api/proposal?key=kunci-admin")).json();
  assert.deepEqual(L.map((p) => p.id), [id]);
  assert.equal(await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind("prop:" + id2).first(), null, "baris kedaluwarsa dihapus");
  // cabut link
  r = await post("/api/proposal?key=kunci-admin", { del: id });
  assert.equal(r.status, 200);
  assert.equal((await call("/r/" + id)).status, 404, "link yang dicabut tidak bisa dibuka");
  assert.equal((await post("/api/proposal?key=kunci-admin", { del: id })).status, 404);
}

/* ---------- fungsi murni di halaman (diambil dari HTML yang disajikan) ---------- */
const grab = (from, to) => { const i = page.indexOf(from), j = page.indexOf(to, i); assert.ok(i >= 0 && j > i, "potongan kode " + from); return page.slice(i, j); };
const src = grab("const monthEnds=", "\n") + grab("const HZ=", "\n// Kalimat kesimpulan") + grab("function qzScore(", "\n");
const { horizons, qzScore } = new Function(src + "; return { horizons, qzScore };")();

// NAB naik 1% tiap bulan selama 6 tahun (data harian awal & akhir bulan): semua periode untung
const navUp = [];
for (let m = 0; m < 72; m++) { const y = 2020 + Math.floor(m / 12), mo = String((m % 12) + 1).padStart(2, "0"); navUp.push({ d: `${y}-${mo}-01`, n: 1000 * 1.01 ** m }, { d: `${y}-${mo}-28`, n: 1000 * 1.01 ** (m + 0.9) }); }
let H = horizons(navUp, 4);
assert.deepEqual(H.map((h) => h.l), ["3 bulan", "6 bulan", "1 tahun", "3 tahun", "5 tahun"]);
assert.ok(H.every((h) => h.pos === 100));
assert.equal(H[2].n, 72 - 12, "periode 1 tahun bergulir");
assert.ok(Math.abs(H[2].med - (1.01 ** 12 - 1) * 100) < 1e-9);
assert.equal(H[2].beat, 100, "12,7% setahun mengalahkan deposito 4% setelah pajak");

// naik 1% sebulan, anjlok 20% di bulan ke-20: periode 1 tahun yang melewati anjlok rugi, periode 3 tahun tetap untung
const navCrash = Array.from({ length: 50 }, (_, m) => ({ d: `${2022 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}-28`, n: 1000 * 1.01 ** m * (m >= 20 ? 0.8 : 1) }));
H = horizons(navCrash, 4);
const h12 = H.find((h) => h.k === 12), h36 = H.find((h) => h.k === 36);
assert.equal(h12.n - Math.round(h12.pos / 100 * h12.n), 12, "12 periode 1 tahun melewati anjlok");
assert.ok(Math.abs(h12.min - (1.01 ** 12 * 0.8 - 1) * 100) < 1e-9);
assert.equal(h36.pos, 100);
assert.equal(H.find((h) => h.k === 60), undefined, "5 tahun tidak tampil bila periode < 6");
assert.deepEqual(horizons(navCrash.slice(0, 8), 4), [], "riwayat < 9 bulan: tidak ada baris");

// skor kuis: 0–6 konservatif, 7–12 moderat, 13–18 agresif; jangka pendek membatasi profil
assert.equal(qzScore([3, 3, 3, 3, 3, 3]).p, "a");
assert.equal(qzScore([2, 2, 2, 2, 1, 1]).p, "m");
assert.equal(qzScore([1, 1, 1, 1, 1, 1]).p, "k");
assert.equal(qzScore([0, 3, 3, 3, 3, 3]).p, "k", "dana dipakai < 1 tahun -> konservatif");
assert.equal(qzScore([1, 3, 3, 3, 3, 3]).p, "m", "dana dipakai 1–3 tahun -> paling tinggi moderat");
// hasil kuis dikirim nasabah ke sales lewat WhatsApp
{
  const qzWaText = new Function("location", grab("function qzWaText(", "\n") + "; return qzWaText;")({ origin: O });
  const t = qzWaText("Moderat", [{ l: "Pasar uang", w: 20, f: [{ name: "RD A" }] }, { l: "Campuran", w: 80, f: [{ name: "RD B" }, { name: "RD C" }] }]);
  assert.equal(t, `Halo, saya sudah mengisi kuis profil risiko. Hasil saya: Moderat. Contoh pembagian dana: pasar uang 20%, campuran 80%. Produk yang disarankan: RD A; RD B; RD C. Mohon dibantu penjelasannya. (${O}/profil)`);
  assert.ok(page.includes("Kirim hasil ke sales via WhatsApp"));
}
/* ---------- data pasar: lengkap khusus internal, halaman nasabah memakai data ringkas /api/rt ---------- */
{
  const { rtValid } = await import("./worker.js");
  env.DB.db.exec("CREATE TABLE IF NOT EXISTS mktsnap (d TEXT PRIMARY KEY, v TEXT)");
  assert.equal((await call("/api/mkt")).status, 200, "sebelum data ringkas pertama ada, halaman nasabah masih memakai data lengkap");
  assert.equal((await call("/api/mkt?key=kunci-admin")).status, 200);
  assert.equal((await call("/api/rt")).status, 404, "belum dibuat");
  const rt = { v: 1, at: "2026-11-18", rf: { s: 4.75, l: 6.5 }, m: { latest: { f: { 2914: [1] }, types: [] } }, rt: { y1: {}, q: {} }, cat: {}, ktop: {} };
  assert.equal((await post("/api/rt", rt, { origin: O })).status, 403, "hanya admin / job dengan ADMIN_KEY");
  assert.equal((await post("/api/rt", { v: 1 }, { "x-edit-key": "kunci-admin" })).status, 400, "bentuk tidak sah ditolak");
  assert.equal(rtValid(null), false);
  assert.equal((await post("/api/rt", rt, { "x-edit-key": "kunci-admin" })).status, 200);
  assert.equal((await call("/api/mkt")).status, 401, "setelah data ringkas ada: data pasar lengkap tidak terbuka untuk umum");
  r = await call("/api/rt");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), rt);
  assert.ok(page.includes('fetch(NASV?"api/rt":"api/mkt")') && page.includes('if(NASV&&!m)m=await fetch("api/mkt")'), "halaman nasabah memuat data ringkas, cadangan data lengkap");

  // hasil versi ringkas = hitungan dari data pasar lengkap (pasar sintetis 3 jenis x 12 produk, hari kerja 420 hari)
  const F = new Function("const ok=v=>v!=null&&isFinite(v);const KC={tr:{top:.75}};" + grab("const RATED=", "const starTxt") + grab("function rateAll(", "// Rating pada snapshot") +
    grab("function riskOf(", "function ownRisk") + grab("function catRaw(", "const ihsgSeries") + grab("function kTopOf(", "\nfunction kTrend") + grab("function slimOf(", "// Dipanggil job PDF") +
    ";return {rateAll,riskOf,catSeries,kTopOf,slimOf,set:(m,c)=>{MKT=m;CAT=c}};")();
  const types = ["Pasar Uang", "Saham", "Campuran"], m = { latest: { at: "2026-11-13T10:00:00Z", types, f: {} } }, days = [];
  for (let t = Date.UTC(2025, 8, 19); t <= Date.UTC(2026, 10, 13); t += 864e5) { const d = new Date(t); if (d.getUTCDay() % 6) days.push(d.toISOString().slice(0, 10)); }
  const ym = (d, k = 1) => { const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1 - k, 1)); return x.getUTCFullYear() * 100 + x.getUTCMonth() + 1; };
  for (let i = 0; i < 36; i++) {
    const p = String(1000 + i), ty = i % 3, g = (1 + (i % 7) * 0.01) ** (1 / 260), nav = (k) => 1000 * g ** k * (1 + 0.01 * Math.sin(k / (3 + (i % 5))));
    days.forEach((d, k) => { (m[d] ||= {})[p] = [nav(k), 50 + i * 5 + k * 0.1 * (i % 4), ym(d)]; });
    const n = days.length - 1, ret = (b) => (nav(n) / nav(n - b) - 1) * 100;
    m.latest.f[p] = [nav(n), 50 + i * 5 + n * 0.1 * (i % 4), ym(days[n]), ty, ret(130), ret(260), null, days[n]];
  }
  const own = ["1000", "1004", "1008"], rf = { s: 4.75, l: 6.5 }, s = JSON.parse(JSON.stringify(F.slimOf(m, rf, own))), R = JSON.parse(JSON.stringify(F.rateAll(m, rf)));
  assert.ok(Object.keys(R.y1).length > 20, "pasar sintetis menghasilkan rating");
  for (const id of own) { assert.ok(s.rt.y1[id], "produk kita berating"); assert.deepEqual(s.rt.y1[id], R.y1[id]); assert.deepEqual(s.rt.p6[id], R.p6[id]); assert.deepEqual(s.rt.q.y1[id], R.q.y1[id]); assert.deepEqual(s.rt.flow[id], R.flow[id]); }
  assert.deepEqual(Object.keys(s.m.latest.f).sort(), own, "hanya produk kita yang ikut");
  assert.deepEqual(s.ktop, JSON.parse(JSON.stringify(F.kTopOf(R, m.latest))));
  const fri = days.filter((d) => new Date(d + "T00:00:00Z").getUTCDay() === 5).slice(-53);
  for (const id of own) assert.deepEqual(F.riskOf(fri.map((d) => s.m[d][id]?.[0]), 0.05), F.riskOf(fri.map((d) => m[d][id][0]), 0.05));
  for (const t of ["Saham", "Pasar Uang"]) for (const from of ["2025-11-13", "2026-05-02", "2026-11-12", "2030-01-01"]) {
    F.set(m, null); const a = F.catSeries(t, from); F.set(s.m, s.cat); const b = F.catSeries(t, from);
    assert.equal(b.length, a.length, `median ${t} sejak ${from}`); a.forEach((x, i) => { assert.equal(b[i].d, x.d); assert.ok(Math.abs(b[i].v - x.v) <= 0.005 + 1e-9); });
  }
}
/* ---------- semua reksa dana di pasar: /api/xfund (NAB 1 th + portofolio dari Bareksa, disimpan 12 jam) ---------- */
{
  const { parseNav, xfund } = await import("./worker.js");
  assert.deepEqual(parseNav({ status: true, data: { auth: true, datas: [{ nav: [{ date: "2026-10-22", value: "1607.33" }, { date: "2026-10-21", value: "1607.1" }, { date: "x", value: "1" }] }] } }),
    [["2026-10-21", 1607.1], ["2026-10-22", 1607.33]]);
  assert.equal(parseNav({ status: true, data: { auth: false, redirect_url: "https://www.bareksa.com/id/member/langganan" } }), null, "butuh login -> null");
  const realFetch = globalThis.fetch, seen = [];
  globalThis.fetch = async (u, init = {}) => {
    seen.push([String(u), init.headers || {}]);
    if (String(u).includes("/ajax/mutualfund/nav/product1/")) return Response.json({ status: true, data: { auth: true, datas: [{ nav: [{ date: "2026-10-21", value: "100" }, { date: "2026-10-22", value: "101" }] }] } });
    return new Response('<div>Bank Kustodian</div><div>PT Bank Contoh</div>', { status: 200 });
  };
  try {
    let r = await call("/api/xfund?pid=2072");
    assert.equal(r.status, 401, "tanpa login ditolak");
    r = await call("/api/xfund?pid=12ab&key=kunci-admin");
    assert.equal(r.status, 400);
    r = await call("/api/xfund?pid=2072&key=kunci-admin");
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(j.nav, [["2026-10-21", 100], ["2026-10-22", 101]]);
    assert.equal(j.hold.custodian, "PT Bank Contoh");
    assert.ok(seen.some(([u, h]) => u.includes("cperiod=1y") && h["X-Requested-With"] === "XMLHttpRequest"), "tanpa header ini Bareksa mengalihkan ke beranda");
    const n = seen.length;
    await xfund(env, "2072");
    assert.equal(seen.length, n, "dalam 12 jam dibaca dari simpanan, tidak menarik ulang");
    globalThis.fetch = async () => { throw new Error("offline"); };
    const st = await xfund(env, "2072", true);
    assert.equal(st.stale, true, "sumber gagal -> data lama tetap dipakai");
    await assert.rejects(() => xfund(env, "9999"), /tidak bisa dihubungi/);
  } finally { globalThis.fetch = realFetch; }
}
// penanda syariah dari kategori Bareksa
{
  const { syOf } = await import("./worker.js");
  assert.equal(syOf({ category: { id: "1", name: "" } }), 1);
  assert.equal(syOf({ category: { id: 2, name: "Konvensional" } }), 0);
  assert.equal(syOf({ category: { id: "0" } }), null);
  assert.equal(syOf({}), null);
  const { staleNav } = await import("./worker.js");
  assert.deepEqual(staleNav([{ pid: "1", name: "A", navDate: "2026-10-22" }, { pid: "2", name: "B", navDate: "2026-10-16" }, { pid: "3", name: "C", navDate: "2026-10-19" }, { pid: "4", name: "D", navDate: null }]).map((x) => x.name), ["B"], "tertinggal > 4 hari dari NAB terbaru");
  assert.deepEqual(staleNav([]), []);
}
/* ---------- konten WA Channel: caption AI hanya untuk admin hub & Investment Growth Specialist (j:"is") ---------- */
{
  const { RULES_PROMPT } = await import("../../shared/compliance.js");
  const te = new TextEncoder(), b64 = (b) => Buffer.from(b).toString("base64url");
  const hubCookie = async (p) => {
    const body = b64(te.encode(JSON.stringify({ u: "budi", e: "budi@acme.test", n: "Budi", a: "viewer", app: "fund", x: Date.now() + 3600e3, ...p })));
    const k = await crypto.subtle.importKey("raw", te.encode(env.SSO_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return `hub_fund=${body}.${b64(await crypto.subtle.sign("HMAC", k, te.encode(body)))}`;
  };
  let sent = null;
  env.AI = { run: async (m, x) => { sent = x.messages; return { response: "Perbandingan reksa dana pekan ini. Kinerja masa lalu tidak menjamin kinerja masa depan." }; } };
  await env.DB.prepare("INSERT OR REPLACE INTO meta VALUES ('latest', ?)").bind(JSON.stringify({ at: "2026-11-01T00:00:00Z", funds: { 2914: { im: "MI Contoh", aum: 5e11, ret: { y1: 7.123 }, vol: 2.5, navDate: "2026-11-01" } } })).run();
  // NAB 1 tahun: puncak 110 (Jan), turun 10% ke 99 (1 Mar), kembali ke 110+ pada 1 Jun = 92 hari; data lebih tua dari 1 tahun diabaikan
  env.DB.db.exec("CREATE TABLE nav (pid TEXT, date TEXT, nav REAL)");
  for (const [d, n] of [["2025-06-01", 50], ["2025-11-01", 100], ["2026-01-01", 110], ["2026-03-01", 99], ["2026-06-01", 111], ["2026-11-01", 115]]) env.DB.db.prepare("INSERT INTO nav VALUES ('2914', ?, ?)").run(d, n);
  let r = await post("/api/caption", { ids: ["2914"] }, { origin: O });
  assert.equal(r.status, 401, "tanpa login ditolak");
  r = await post("/api/caption", { ids: ["2914"] }, { origin: O, cookie: await hubCookie({ j: "sales" }) });
  assert.equal(r.status, 403, "jabatan lain ditolak");
  r = await post("/api/caption", { ids: ["2914"] }, { origin: O, cookie: await hubCookie({ j: "is" }) });
  assert.equal(r.status, 200);
  assert.ok((await r.json()).text.length > 20);
  assert.match(sent[1].content, /7[.,]12/, "angka return 1 tahun dari server");
  assert.match(sent[1].content, /Turun terdalam 1 th: -10,00%/, "drawdown 1 tahun dari NAB server");
  assert.match(sent[1].content, /pulih dalam 92 hari/);
  assert.doesNotMatch(sent[1].content, /Manajer investasi|Naik-turun/, "baris yang tidak ada di gambar tidak dikirim");
  assert.ok(sent[0].content.includes(RULES_PROMPT), "aturan kepatuhan ikut ke AI");
  r = await post("/api/caption?key=kunci-admin", { ids: ["x"] });
  assert.equal(r.status, 400, "tanpa produk sah");
  r = await call("/", { headers: { cookie: await hubCookie({ j: "is" }) } });
  const koPage = await r.text();
  assert.match(koPage, /"ko":true/, "tombol Buat konten muncul untuk IGS");
  assert.ok(koPage.includes('data-th="light"') && koPage.includes("brand/ikisi-color.png") && fs.existsSync(new URL("./assets/brand/ikisi-color.png", import.meta.url)), "template gambar terang + logo berwarna");
  r = await call("/", { headers: { cookie: await hubCookie({ j: "sales" }) } });
  const salesPage = await r.text();
  assert.match(salesPage, /"ko":false/);
  // tab Insight: admin hub, Investment Growth Specialist, dan Mutual Fund Partnership Specialist
  assert.match(koPage, /"ins":true/, "tab Insight untuk IGS");
  assert.match(salesPage, /"ins":false/, "jabatan lain tidak melihat Insight");
  r = await call("/", { headers: { cookie: await hubCookie({ j: "partnership" }) } });
  const ptPage = await r.text();
  assert.match(ptPage, /"ins":true/, "tab Insight untuk Partnership");
  assert.match(ptPage, /"ko":false/, "Partnership tidak ikut dapat Buat konten");
  assert.ok(ptPage.includes('body:not(.can-ins) [data-v=\\"insight\\"]') || ptPage.includes('body:not(.can-ins) [data-v="insight"]'), "tombol Insight disembunyikan lewat can-ins, bukan role-admin");
  assert.ok(ptPage.includes('v==="insight"&&!ME.ins'), "pindah ke tab Insight dicek dengan ME.ins");
  // Proposal saya per pemilik: sales lain tidak melihat & tidak bisa mencabut; sales yang sedang masuk tidak menandai "dibuka"
  const budi = { origin: O, cookie: await hubCookie({}) }, sari = { origin: O, cookie: await hubCookie({ u: "sari", e: "sari@acme.test", n: "Sari" }) };
  r = await post("/api/proposal", { ids: ["2914"], name: "Pak Joko" }, budi);
  const pid = (await r.json()).id;
  await call("/r/" + pid, { headers: { cookie: budi.cookie } });
  let mine = await (await call("/api/proposal", { headers: budi })).json();
  assert.deepEqual(mine.map((p) => p.id), [pid]);
  assert.equal(mine[0].o, undefined, "dibuka oleh sales sendiri tidak dihitung");
  assert.deepEqual(await (await call("/api/proposal", { headers: sari })).json(), [], "proposal orang lain tidak terlihat");
  assert.equal((await post("/api/proposal", { del: pid }, sari)).status, 403);
  assert.equal((await post("/api/proposal", { del: pid }, budi)).status, 200);
  // akun hub tanpa username (pemiliknya = email): email tidak muncul di halaman nasabah
  const tanpaU = { origin: O, cookie: await hubCookie({ u: undefined }) };
  const pe = (await (await post("/api/proposal", { ids: ["2914"] }, tanpaU)).json()).id;
  const pubPage = await (await call("/r/" + pe)).text();
  assert.match(pubPage, /window\.PROP=/);
  assert.doesNotMatch(pubPage, /budi@acme\.test/);
  assert.deepEqual((await (await call("/api/proposal", { headers: tanpaU })).json()).map((p) => p.id), [pe]);
  delete env.AI;
}
console.log("semua cek lolos");
