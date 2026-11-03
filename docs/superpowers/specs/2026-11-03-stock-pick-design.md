# Hasil stock pick di Content Planner

## Tujuan
Tim Investment Growth Specialist (IGS) butuh satu laporan per bulan tentang hasil stock pick: tiap pick kena SL, TP1, TP2, atau masih on going; winrate; dan return bulan itu dibanding IHSG.

## Yang diputuskan user
- Tempatnya di Content Planner (cara A), bukan tool baru.
- Tim mengisi tiap pick: kode saham, entry, SL, TP1, TP2.
- Harga: penutupan harian (EOD). Status dicek dari **semua harga penutupan sejak pick dibuat**; yang tercapai duluan menentukan.
- Aturan status:
  - Tutup ≤ SL sebelum TP1 → **SL**, pick ditutup (kalah).
  - Tutup ≥ TP1 → **TP1**, pick dihitung menang dan tidak bisa jadi SL lagi.
  - Setelah TP1 tetap dipantau; tutup ≥ TP2 → status naik jadi **TP2** (info saja).
  - Belum kena apa-apa → **On going**.
- Winrate = pick kena TP (TP1/TP2) ÷ pick yang sudah ditutup (TP + SL). On going tidak dihitung.
- Return bulan itu = akumulasi return pick yang ditutup: kena SL dihitung di harga SL, kena TP1/TP2 dihitung di harga TP1. Dibanding return IHSG bulan yang sama.

## Bukan tujuan
- Tidak ada jadwal/cron. Harga diambil saat halaman atau laporan dibuka.
- Tidak ada short/jual; semua pick posisi beli.
- Hitungan WA "Stockpick" (tombol + / −) tetap seperti sekarang, tidak otomatis dari daftar pick.
- Tidak ada rekomendasi atau sinyal; hanya mencatat hasil.

## Batasan
- Harga EOD dari Yahoo chart (`<KODE>.JK`, `^JKSE`), gratis, sama seperti tool lain di repo.
- Workers Free: maks. 50 subrequest per request. Hanya pick yang masih on going (atau TP1 yang menunggu TP2) yang diambil harganya; satu request per kode saham, maks. 40 kode per kali buka.
- D1 penuh: tabel baru `stockpick` di database Content Planner.

## Rancangan
- **Isian** (tab Harian, di kotak Posting WA Channel): bagian "Stock pick" dengan form kode, entry, SL, TP1, TP2, dan daftar pick bulan ini dengan statusnya, harga terakhir, dan return.
- **Validasi server**: kode 4 huruf kode saham IDX; angka > 0; SL < entry < TP1 < TP2; tanggal pick tidak di masa depan. Pemilik atau admin boleh ubah/hapus.
- **Status**: server mengambil harga penutupan harian sejak tanggal pick (termasuk hari itu), menerapkan aturan di atas, lalu menyimpan status, tanggal kena, dan harga terakhir. Pick yang sudah SL atau TP2 tidak diambil harganya lagi.
- **Laporan** (⬇ Laporan bulanan, tim yang punya pick): bagian "Hasil stock pick" berisi angka utama (jumlah pick, kena TP, kena SL, on going, winrate, return akumulasi, return IHSG) dan tabel tiap pick (tanggal, kode, entry, SL, TP1, TP2, harga terakhir, status, tanggal kena, return). Ikut ekspor PDF/PPT yang sudah ada.

## Keputusan saya (boleh dikoreksi)
- Return pick = (harga keluar − entry) ÷ entry. "Akumulasi" = jumlah persentase semua pick yang ditutup.
- Return IHSG = penutupan terakhir bulan itu ÷ penutupan terakhir bulan sebelumnya − 1 (bulan berjalan: sampai harga terakhir).
- Pick masuk bulan menurut tanggal pick dibuat.
- On going ditampilkan dengan return sementara di harga terakhir, tetapi tidak masuk winrate atau return akumulasi.
- Harga penutupan hari pick ikut dicek.
- TP2 boleh kosong; kalau kosong, pick berhenti di TP1.

## Diserahkan ke pembuat
Tata letak form dan tabel, mengikuti gaya Content Planner yang ada.
