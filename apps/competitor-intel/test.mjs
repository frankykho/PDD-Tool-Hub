// Cek filter "bukan promo" Competitor Intelligence. Jalankan: node apps/competitor-intel/test.mjs
import assert from "node:assert";
import { ciNotPromo } from "./worker.js";

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
console.log("semua cek lolos");
