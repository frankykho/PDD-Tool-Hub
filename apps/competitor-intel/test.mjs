// Cek filter "bukan promo" Competitor Intelligence. Jalankan: node apps/competitor-intel/test.mjs
import assert from "node:assert";
import { ciNotPromo, ciPromoVerdict } from "./worker.js";

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
console.log("semua cek lolos");
