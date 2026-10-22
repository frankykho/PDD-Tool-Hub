// Cek halaman nasabah Fund Insight: kuis profil risiko (/profil), proposal dari sales (/api/proposal -> /r/<kode>),
// dan hitungan kartu "Berapa lama sebaiknya disimpan" + skor kuis. Jalankan: node apps/fund-insight/test.mjs   (Node 22.15+)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
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
console.log("semua cek lolos");
