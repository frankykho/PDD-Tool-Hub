// Cek filter "bukan promo" Competitor Intelligence dan input manual (promo tanpa link publik).
// Jalankan: node apps/competitor-intel/test.mjs   (Node 22.15+)
import assert from "node:assert";
import { DatabaseSync } from "node:sqlite";
import ci, { ciHold, ciMigrate, ciNotPromo, ciPromoVerdict } from "./worker.js";

// bukan promo: pengumuman pemenang & artikel update mingguan (judul nyata dari beranda Tool Hub)
assert.equal(ciNotPromo("Selamat! Ini Pemenang Promo Saham September 2026 Berhadiah hingga Rp250 Ribu"), "pengumuman pemenang");
assert.equal(ciNotPromo("Selamat! Ini Pemenang Promo of The Month Mei 2026 Reksa Dana USD Berhadiah hingga Rp500 Ribu"), "pengumuman pemenang");
assert.equal(ciNotPromo("Daftar Pemenang Undian Investasi Akhir Tahun"), "pengumuman pemenang");
assert.equal(ciNotPromo("Cermati Invest Weekly Update 19 Oktober 2026"), "artikel update/rekap");
assert.equal(ciNotPromo("Rekap Mingguan Reksa Dana"), "artikel update/rekap");

// tetap promo
assert.equal(ciNotPromo("Buka Rekening dengan RDN CIMB, Raih Cashback Senilai Rp50.000"), "");
assert.equal(ciNotPromo("Promo Reksa Dana Oktober: 100 Pemenang Dapat Cashback"), "", "promo yang menyebut jumlah pemenang tetap promo");
assert.equal(ciNotPromo("Kompetisi Trading Saham, Hadiah Total Rp100 Juta"), "");
assert.equal(ciNotPromo(""), "");
assert.equal(ciNotPromo(null), "");

// berita/edukasi & halaman daftar promo
assert.equal(ciNotPromo("Bareksa Insight: MSCI Kaji Turunkan Status Bursa RI, IHSG Turun"), "berita/edukasi");
assert.equal(ciNotPromo("🤝 DOOH Berencana Akuisisi 29,88% Saham INET Senilai Rp2 T &mdash; Stockbit Snips | Berita Saham"), "berita/edukasi");
assert.equal(ciNotPromo("Kelas Investasi"), "berita/edukasi");
assert.equal(ciNotPromo("Promo &amp; Campaign - Ajaib"), "halaman daftar promo");
assert.equal(ciNotPromo("Promo spesial untuk kamu!"), "halaman daftar promo");
assert.equal(ciNotPromo("Kategori: Ayovest Promo"), "halaman daftar promo");
assert.equal(ciNotPromo("Promo Spesial Akhir Tahun: Cashback Rp100 Ribu"), "", "promo sungguhan yang diawali 'Promo Spesial' tetap promo");

// ciPromoVerdict: judul promo jelas -> antrean; tanpa tanda promo -> butuh periode DAN benefit
const V = (title, o = {}) => ciPromoVerdict({ title, ...o });
assert.equal(V("Dapatkan Cashback hingga Rp15 Juta! Investasi SBR015 di BRIGHTS"), "");
assert.equal(V("Isi Survey 5 Menit, Dapatkan Saldo RDN/Reksadana & 100 Lembar Saham BBRI!"), "");
assert.equal(V("High Spender Summit 2026 Kompetisi Trading Eksklusif"), "");
assert.equal(V("Reksa Dana - Ajaib"), "tidak ada periode & benefit promo yang jelas");
assert.equal(V("Leverage 101", { end_date: "2026-11-01" }), "tidak ada periode & benefit promo yang jelas", "tanggal saja tidak cukup");
assert.equal(V("Mutual Fund Investasi Bersama MI X", { end_date: "2026-11-01", benefit: "reward Rp100 ribu" }), "", "periode + benefit terbaca -> antrean");
assert.equal(V("Selamat! Ini Pemenang Promo Saham September 2026 Berhadiah Rp250 Ribu"), "pengumuman pemenang", "pemenang dicek sebelum kata promo");

/* ---------- input manual: URL sumber atau gambar bukti ---------- */
const db = new DatabaseSync(":memory:");
const st = (sql, args = []) => ({ bind: (...a) => st(sql, a), all: async () => ({ results: db.prepare(sql).all(...args) }), first: async () => db.prepare(sql).get(...args) ?? null, run: async () => { db.prepare(sql).run(...args); return {}; } });
const env = { DB: { prepare: (s) => st(s), batch: async (l) => { for (const x of l) await x.all(); return []; } }, ADMIN_KEY: "k", SSO_SECRET: "s".repeat(40), HUB_URL: "https://hub.test" };
const api = async (method, body) => { const r = await ci.fetch(new Request("https://ci.test/api/ci/programs?key=k", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env, { waitUntil() {} }); return [r.status, await r.json()]; };
const IMG = "data:image/png;base64,iVBORw0KGgo=";

let [s, j] = await api("POST", { title: "Cashback di aplikasi X" });
assert.equal(s, 400, "tanpa URL dan tanpa gambar ditolak");
assert.match(j.error, /URL sumber, atau unggah gambar/);
[s, j] = await api("POST", { title: "Cashback di aplikasi X", source_note: "Aplikasi X (screenshot)", image_data: IMG, benefit: "Rp50 rb" });
assert.equal(s, 200, JSON.stringify(j));
const noUrl = j.id, row = db.prepare("SELECT source_url, source_note, status FROM ci_programs WHERE id=?").get(noUrl);
assert.deepEqual({ ...row }, { source_url: "", source_note: "Aplikasi X (screenshot)", status: "Aktif" }, "tanpa link: URL kosong, keterangan sumber tersimpan");
[s] = await api("POST", { title: "Promo di web", source_url: "https://contoh.co.id/promo" });
assert.equal(s, 200, "dengan URL saja tetap boleh");
const withUrl = db.prepare("SELECT id FROM ci_programs WHERE source_url=?").get("https://contoh.co.id/promo").id;

// mengosongkan URL lewat edit hanya boleh bila ada gambar
[s, j] = await api("PATCH", { id: withUrl, source_url: "" });
assert.equal(s, 400, "promo tanpa gambar tidak boleh kehilangan URL");
[s] = await api("PATCH", { id: withUrl, source_url: "", image_data: IMG });
assert.equal(s, 200, "URL boleh dikosongkan sambil mengunggah gambar");
assert.equal(db.prepare("SELECT source_url FROM ci_programs WHERE id=?").get(withUrl).source_url, "");
[s] = await api("PATCH", { id: noUrl, holding_period: "Tidak ada" });
assert.equal(s, 200, "lengkapi satu field saja (mode Lengkapi)");
assert.equal(db.prepare("SELECT holding_period FROM ci_programs WHERE id=?").get(noUrl).holding_period, "Tidak ada");
const list = await (await ci.fetch(new Request("https://ci.test/api/ci/programs?key=k"), env, { waitUntil() {} })).json();
assert.equal(list.find((p) => p.id === noUrl).source_note, "Aplikasi X (screenshot)", "keterangan sumber ikut di daftar (dipakai tampilan & PDF)");

/* ---------- daftar manajer investasi untuk dropdown (dari snapshot pasar reksa dana) ---------- */
const mis = async () => (await (await ci.fetch(new Request("https://ci.test/api/ci/managers?key=k"), env, { waitUntil() {} })).json()).managers;
assert.deepEqual(await mis(), [], "belum ada data pasar -> daftar kosong, tidak error");
db.exec("CREATE TABLE mktsnap (d TEXT PRIMARY KEY, v TEXT)");
db.prepare("INSERT INTO mktsnap VALUES ('latest', ?)").run(JSON.stringify({ names: { 1: ["RD A", "Schroder Investment Management Indonesia"], 2: ["RD B", "Bahana TCW Investment Management"], 3: ["RD C", "Schroder Investment Management Indonesia"], 4: ["RD D", ""] } }));
assert.deepEqual(await mis(), ["Bahana TCW Investment Management", "Schroder Investment Management Indonesia"], "MI unik, urut abjad, tanpa nama kosong");

/* ---------- holding period & periode penilaian jadi satu kolom ---------- */
assert.equal(ciHold("30 hari", "1–31 Okt"), "30 hari; 1–31 Okt");
assert.equal(ciHold("30 hari", "30 hari"), "30 hari", "teks sama tidak dobel");
assert.equal(ciHold(null, "1–31 Okt"), "1–31 Okt");
assert.equal(ciHold("30 hari", null), "30 hari");
assert.equal(ciHold(null, null), null);
// data lama: periode penilaian digabung ke holding_period, lalu dikosongkan (sekali jalan, aman diulang)
const put = (id, h, a) => db.prepare("INSERT INTO ci_programs (id, title, source_url, discovered_at, holding_period, assessment_period) VALUES (?, 'x', 'https://x.test/' || ?, '2026-10-01', ?, ?)").run(id, id, h, a);
put("m1", "30 hari", "1–31 Okt"); put("m2", null, "saldo 30 Nov"); put("m3", "60 hari", "60 hari"); put("m4", "90 hari", null);
await ciMigrate(env); await ciMigrate(env);
const hp = (id) => db.prepare("SELECT holding_period AS h, assessment_period AS a FROM ci_programs WHERE id = ?").get(id);
assert.deepEqual({ ...hp("m1") }, { h: "30 hari; 1–31 Okt", a: null });
assert.deepEqual({ ...hp("m2") }, { h: "saldo 30 Nov", a: null });
assert.deepEqual({ ...hp("m3") }, { h: "60 hari", a: null });
assert.deepEqual({ ...hp("m4") }, { h: "90 hari", a: null }, "tanpa periode penilaian tidak berubah");
const one = await (await ci.fetch(new Request("https://ci.test/api/ci/programs?key=k&id=m1"), env, { waitUntil() {} })).json();
assert.equal("assessment_period" in one, false, "kolom lama tidak dikirim ke tampilan");
console.log("semua cek lolos");
