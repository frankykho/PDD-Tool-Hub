// Cek filter "bukan promo" Competitor Intelligence dan input manual (promo tanpa link publik).
// Jalankan: node apps/competitor-intel/test.mjs   (Node 22.15+)
import assert from "node:assert";
import { DatabaseSync } from "node:sqlite";
import ci, { ciFoldTerms, ciHold, ciMigrate, ciNotPromo, ciPromoVerdict } from "./worker.js";

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
// isian wajib tiap promo yang disimpan lewat form
const REQ = { trx_start: "2026-10-06", trx_end: "2026-10-31", start_date: "2026-10-06", end_date: "2027-01-31", holding_period: "Dana ditahan s.d. 31 Jan 2027", terms: ["Berlaku untuk nasabah baru"] };

let [s, j] = await api("POST", { title: "Cashback di aplikasi X", ...REQ });
assert.equal(s, 400, "tanpa URL dan tanpa gambar ditolak");
assert.match(j.error, /URL sumber, atau unggah gambar/);
[s, j] = await api("POST", { title: "Cashback di aplikasi X", source_note: "Aplikasi X (screenshot)", image_data: IMG, benefit: "Rp50 rb", ...REQ });
assert.equal(s, 200, JSON.stringify(j));
const noUrl = j.id, row = db.prepare("SELECT source_url, source_note, status FROM ci_programs WHERE id=?").get(noUrl);
assert.deepEqual({ ...row }, { source_url: "", source_note: "Aplikasi X (screenshot)", status: "Aktif" }, "tanpa link: URL kosong, keterangan sumber tersimpan");
[s] = await api("POST", { title: "Promo di web", source_url: "https://contoh.co.id/promo", ...REQ });
assert.equal(s, 200, "dengan URL saja tetap boleh");
const withUrl = db.prepare("SELECT id FROM ci_programs WHERE source_url=?").get("https://contoh.co.id/promo").id;

// mengosongkan URL lewat edit hanya boleh bila ada gambar
[s, j] = await api("PATCH", { id: withUrl, source_url: "" });
assert.equal(s, 400, "promo tanpa gambar tidak boleh kehilangan URL");
[s] = await api("PATCH", { id: withUrl, source_url: "", image_data: IMG });
assert.equal(s, 200, "URL boleh dikosongkan sambil mengunggah gambar");
assert.equal(db.prepare("SELECT source_url FROM ci_programs WHERE id=?").get(withUrl).source_url, "");
[s] = await api("PATCH", { id: noUrl, holding_period: "Tidak ada" });
assert.equal(s, 200, "ubah satu isian saja (mode Lengkapi), sisanya sudah lengkap");
assert.equal(db.prepare("SELECT holding_period FROM ci_programs WHERE id=?").get(noUrl).holding_period, "Tidak ada");

/* ---------- 4 isian wajib: periode program, periode transaksi, holding / masa penilaian, S&K ---------- */
[s, j] = await api("POST", { title: "Tanpa isian wajib", source_url: "https://x.test/a" });
assert.equal(s, 400);
assert.equal(j.error, "Wajib diisi: periode program, periode transaksi, holding period / masa penilaian, syarat & ketentuan");
[s, j] = await api("POST", { title: "Program kosong", source_url: "https://x.test/b", ...REQ, start_date: "", end_date: "" });
assert.equal(s, 200, "periode program kosong = sama dengan periode transaksi");
assert.deepEqual({ ...db.prepare("SELECT start_date AS a, end_date AS b FROM ci_programs WHERE id=?").get(j.id) }, { a: "2026-10-06", b: "2026-10-31" });
[s, j] = await api("POST", { title: "Transaksi di luar program", source_url: "https://x.test/c", ...REQ, trx_end: "2027-02-15" });
assert.equal(j.error, "Periode transaksi harus berada di dalam periode program");
[s, j] = await api("POST", { title: "Tanggal terbalik", source_url: "https://x.test/d", ...REQ, trx_start: "2026-11-01", trx_end: "2026-10-01" });
assert.equal(j.error, "Tanggal mulai harus sebelum tanggal selesai");
[s, j] = await api("PATCH", { id: noUrl, terms: [] });
assert.equal(s, 400, "S&K tidak boleh dikosongkan lewat edit");
// hasil scan (belum lengkap) boleh tersimpan, tapi tidak bisa diverifikasi sebelum lengkap
db.prepare("INSERT INTO ci_programs (id, title, source_url, discovered_at, status, start_date, end_date) VALUES ('scan1', 'Hasil scan', 'https://x.test/s', '2026-10-01', 'Perlu verifikasi', '2026-10-01', '2026-10-31')").run();
[s, j] = await api("PATCH", { id: "scan1", status: "Aktif" });
assert.equal(s, 400, "verifikasi ditolak bila belum lengkap");
assert.match(j.error, /periode transaksi, holding period \/ masa penilaian, syarat & ketentuan/);
[s] = await api("PATCH", { id: "scan1", why_matters: "catatan tim" });
assert.equal(s, 200, "catatan tim tetap bisa disimpan walau isian wajib belum lengkap");
[s] = await api("PATCH", { id: "scan1", status: "Tidak relevan" });
assert.equal(s, 200, "tandai tidak relevan tidak perlu isian wajib");
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
// data lama: tanggal promo yang tercatat = periode transaksi; periode program tetap
db.prepare("INSERT INTO ci_programs (id, title, source_url, discovered_at, start_date, end_date) VALUES ('t1', 'x', 'https://x.test/t1', '2026-10-01', '2026-10-01', '2026-10-31')").run();
db.prepare("INSERT INTO ci_programs (id, title, source_url, discovered_at, start_date, end_date, trx_start, trx_end) VALUES ('t2', 'x', 'https://x.test/t2', '2026-10-01', '2026-10-01', '2027-01-31', '2026-10-01', '2026-10-15')").run();
await ciMigrate(env);
const tp = (id) => ({ ...db.prepare("SELECT start_date AS s, end_date AS e, trx_start AS ts, trx_end AS te FROM ci_programs WHERE id = ?").get(id) });
assert.deepEqual(tp("t1"), { s: "2026-10-01", e: "2026-10-31", ts: "2026-10-01", te: "2026-10-31" }, "tanggal lama disalin ke periode transaksi");
assert.deepEqual(tp("t2"), { s: "2026-10-01", e: "2027-01-31", ts: "2026-10-01", te: "2026-10-15" }, "periode transaksi yang sudah diisi tidak ditimpa");

/* ---------- siapa boleh ikut, kuota, mekanisme, cara ikut, pengecualian -> butir S&K ---------- */
const f = ciFoldTerms({
  terms: JSON.stringify(["Berlaku untuk nasabah baru"]), eligibility: "Nasabah baru", quota_limits: "1.000 nasabah", mechanism: "Cashback dikreditkan 14 hari kerja",
  participation: "Masukkan kode PROMO\nBeli minimal Rp1 jt", exclusions: "Tidak berlaku untuk karyawan",
  tiers: JSON.stringify({ head: ["Tier", "Min. pembelian", "Hadiah"], rows: [["1", "Rp10 jt", "Rp100 rb"], ["2", "", "Rp750 rb"]] }),
});
assert.deepEqual(JSON.parse(f.terms), [
  "Berlaku untuk nasabah baru", "Siapa yang boleh ikut: Nasabah baru", "Kuota: 1.000 nasabah", "Mekanisme: Cashback dikreditkan 14 hari kerja",
  "Cara ikut: Masukkan kode PROMO", "Cara ikut: Beli minimal Rp1 jt", "Pengecualian: Tidak berlaku untuk karyawan",
  "Mekanisme: Tier 1 · Min. pembelian Rp10 jt · Hadiah Rp100 rb", "Mekanisme: Tier 2 · Hadiah Rp750 rb",
], "urutan: S&K lama, lalu isian lama dengan labelnya, lalu baris tabel tier (kolom kosong dilewati)");
assert.deepEqual([f.eligibility, f.quota_limits, f.mechanism, f.participation, f.exclusions, f.tiers], [null, null, null, null, null, null], "isian lama dikosongkan");
assert.equal(ciFoldTerms({ mechanism: "Beli lewat aplikasi", participation: "Beli lewat aplikasi" }).terms, JSON.stringify(["Cara ikut: Beli lewat aplikasi"]), "mekanisme hasil scan = cara ikut tidak ditulis dua kali");
assert.equal(ciFoldTerms({ terms: JSON.stringify(["Kuota: 5"]), quota_limits: "5" }).terms, JSON.stringify(["Kuota: 5"]), "tidak ada butir kembar");
assert.equal(ciFoldTerms({}).terms, null);
// data lama di database ikut dipindah saat migrasi
db.prepare("INSERT INTO ci_programs (id, title, source_url, discovered_at, terms, quota_limits, exclusions) VALUES ('f1', 'x', 'https://x.test/f1', '2026-10-01', ?, '16 voucher', 'Tidak untuk switching')").run(JSON.stringify(["S&K lama"]));
await ciMigrate(env);
const f1 = db.prepare("SELECT terms, quota_limits AS q, exclusions AS e FROM ci_programs WHERE id = 'f1'").get();
assert.deepEqual([JSON.parse(f1.terms), f1.q, f1.e], [["S&K lama", "Kuota: 16 voucher", "Pengecualian: Tidak untuk switching"], null, null]);
await ciMigrate(env);
assert.equal(JSON.parse(db.prepare("SELECT terms FROM ci_programs WHERE id = 'f1'").get().terms).length, 3, "migrasi aman diulang");
// isian lama tidak bisa diisi lagi lewat API dan tidak dikirim ke tampilan
[s] = await api("PATCH", { id: noUrl, quota_limits: "100 orang", tiers: { head: ["a"], rows: [["b"]] } });
assert.equal(db.prepare("SELECT quota_limits AS q, tiers AS t FROM ci_programs WHERE id = ?").get(noUrl).q, null);
const one2 = await (await ci.fetch(new Request("https://ci.test/api/ci/programs?key=k&id=f1"), env, { waitUntil() {} })).json();
assert.equal(["eligibility", "quota_limits", "mechanism", "participation", "exclusions", "tiers"].some((k) => k in one2), false);
const one = await (await ci.fetch(new Request("https://ci.test/api/ci/programs?key=k&id=m1"), env, { waitUntil() {} })).json();
assert.equal("assessment_period" in one, false, "kolom lama tidak dikirim ke tampilan");
console.log("semua cek lolos");
