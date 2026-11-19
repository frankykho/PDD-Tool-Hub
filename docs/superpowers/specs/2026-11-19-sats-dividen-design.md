# SATS — Menu Dividen (riwayat & perkiraan)

## Maksud
Satu menu insight di SATS: daftar **semua saham** yang pernah membagi dividen, bisa diurutkan, berisi riwayat dividen dan
**perkiraan dividen berikutnya** berdasarkan laporan keuangan terakhir. Dipakai untuk mencari saham dividen, bukan rekomendasi.

## Tujuan / bukan tujuan
- Tujuan: tabel yang bisa diurutkan & difilter; riwayat per saham saat baris dibuka; rumus yang jelas dan bisa dicek.
- Bukan tujuan (sekarang): tab dividen di halaman detail saham, kalender cum/ex-date, notifikasi.
- Anti-tujuan: angka perkiraan yang terlihat seperti kepastian. Setiap perkiraan diberi tingkat keyakinan dan catatan
  "keputusan dividen ditentukan RUPS".

## Pendekatan (dipilih: A)
- **A. Tumpang di job fundamental mingguan** (dipilih) — data serentak dengan EPS terbaru, tanpa jadwal baru; job +± 3–5 menit.
- B. Job dividen bulanan terpisah — terisolasi, tapi workflow baru dan EPS bisa tertinggal.
- C. Hitung saat halaman dibuka — tidak mungkin (±1.900 request Yahoo, batas CPU Workers gratis).

## Data (Yahoo, per saham, mingguan)
1. Riwayat dividen 10 tahun: `v8/finance/chart/{KODE}.JK?range=10y&interval=1mo&events=div` (rupiah per lembar, sudah disesuaikan stock split).
2. EPS: `ws/fundamentals-timeseries` → `annualDilutedEPS` (± 4 tahun buku) dan `trailingDilutedEPS` (12 bulan terakhir per kuartal).
   EPS dalam mata uang laporan (USD untuk sebagian emiten) → dikonversi ke rupiah dengan `fxToIdr` yang sudah ada.

## Rumus
- **Tahun buku sebuah pembayaran**: bulan bayar Okt–Des → tahun itu (dividen interim); Jan–Sep → tahun sebelumnya
  (final, atau interim yang dibayar Januari). Contoh BBRI: 2024-01-02 → TB 2023, 2025-12-30 → TB 2025, 2026-04-21 → TB 2025.
- **DPS tahun buku** = jumlah semua pembayaran untuk tahun buku itu.
- **Payout ratio TB** = DPS TB ÷ EPS TB (hanya bila EPS > 0).
- **Payout 3 skenario** (3 tahun buku terakhir yang punya data, tiap TB dibatasi 0–100% dulu): pesimis = terendah,
  base = rata-rata, optimis = tertinggi. (Revisi 2026-11-19 atas permintaan user; sebelumnya satu angka: median.)
- **Perkiraan DPS berikutnya** (per skenario) = payout skenario × EPS 12 bulan terakhir (laporan kuartal terbaru).
  Bila sebagian DPS tahun buku berjalan sudah dibayar (interim), ditampilkan juga "sisa perkiraan" = perkiraan − interim.
- **Perkiraan yield** (pesimis / base / optimis) = perkiraan DPS skenario ÷ harga penutupan terakhir (`tech_latest`).
- **Yield historis** = DPS tahun buku terakhir yang lengkap ÷ harga.
- **Konsistensi** = jumlah tahun buku berturut-turut (sampai yang terakhir) dengan dividen > 0, dari maks. 10.
- **Pertumbuhan DPS 3 th** = (DPS TB terakhir ÷ DPS 3 TB sebelumnya)^(1/3) − 1.
- **Keyakinan**: Tinggi = konsistensi ≥ 3 dan payout 3 TB tidak naik-turun lebih dari ±15 poin; Sedang = konsistensi ≥ 2;
  Rendah = lainnya. **Tanpa perkiraan** bila EPS 12 bulan ≤ 0 atau tidak ada dividen dalam 2 tahun buku terakhir.

## Penyimpanan
- Tabel baru `div_latest` di `sats-db` (dibangun ulang tiap minggu, seperti `fund_latest`): kode, as_of, dividen terakhir
  (tanggal, nominal), TB terakhir & DPS-nya, payout acuan, EPS 12 bln, perkiraan DPS, konsistensi, pertumbuhan 3 th, keyakinan,
  dan `history` (JSON ringkas: DPS/EPS/payout per TB + daftar pembayaran).
- File SQL terpisah `out/dividends.sql` + langkah workflow sendiri: kalau dividen < 80% berhasil, tabel lama tidak diganti dan
  data fundamental tetap tertulis.

## API & halaman
- `GET /api/dividends` — semua baris tanpa `history`, digabung nama saham, harga terakhir, keanggotaan indeks & syariah. Cache 1 jam.
- `GET /api/dividends/:code` — `history` satu saham.
- Halaman `#/dividen`, menu "Dividen" di Header. Kolom: Kode/Nama, Harga, Dividen terakhir, Yield historis, Payout,
  Yield pesimis / base / optimis (DPS di bawahnya), Konsistensi, Pertumbuhan 3 th, Keyakinan. Filter: indeks (LQ45, KOMPAS100, …), syariah,
  keyakinan minimal, cari kode. Klik baris → riwayat per tahun buku + daftar pembayaran. Penjelasan rumus lewat ikon info
  (komponen `Info` yang sudah ada). Teks EN masuk `i18n.ts`.

## Diputuskan oleh saya (bisa dikoreksi)
- Payout tiap tahun dibatasi 100% sebelum dirata-rata, supaya satu dividen spesial tidak mendongkrak skenario base.
- Payout dibatasi 100% untuk perkiraan.
- Daftar hanya berisi saham yang membagi dividen minimal sekali dalam 10 tahun.
- Akses halaman sama dengan Screener (semua pengguna yang login).

## Untuk pembuat
- Tes kecil untuk: atribusi tahun buku, payout & perkiraan (contoh BBRI di atas), aturan keyakinan, kasus EPS ≤ 0.
- Konkurensi & jeda request sama seperti `run-fundamentals.ts`.
