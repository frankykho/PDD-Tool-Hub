# Ops ETF di Content Planner — rancangan singkat

## Maksud
Tim ETF & Fund Ops mencatat pekerjaannya di Content Planner, supaya pekerjaan itu masuk ke **report bulanan** (Laporan Kegiatan).
Contoh utama: rebalancing ETF, lengkap dengan fee, nominal transaksi, saham masuk, dan saham keluar.

## Tujuan
- Jenis kegiatan baru **"Ops ETF"**, dengan dua pilihan pekerjaan:
  - **Rebalancing ETF:** nama ETF, tanggal, fee (Rp), nominal transaksi (Rp), saham masuk (kode), saham keluar (kode).
  - **Pekerjaan ETF lainnya:** judul, tanggal, nominal (Rp, boleh kosong), catatan.
- Status: rencana, berjalan, selesai, kendala (sama dengan Aktivitas).
- Laporan Kegiatan mendapat bagian **Ops ETF**:
  - Kotak angka: jumlah rebalancing, total fee, total nominal transaksi.
  - Tabel: tanggal, ETF, pekerjaan, fee, nominal, saham masuk, saham keluar, status.
  - Ops ETF juga masuk ke "Rekap per orang".

## Bukan tujuan
- Jenis pekerjaan lain (creation/redemption, dividen, listing): ditambah nanti oleh user bila perlu.
- Tidak ada impor, otomatisasi, atau sambungan ke ETF Insight.

## Pendekatan
1. **Dipilih:** jenis kegiatan baru, dengan data ETF dalam satu kolom JSON `ops`. Polanya sama dengan kolom `docs` di rencana galeri.
   Jenis pekerjaan baru nanti cukup menambah isian, tanpa kolom database baru.
2. Satu kolom per isian. Tabel sudah punya sekitar 50 kolom, dan tiap jenis pekerjaan baru akan menambah kolom lagi.
3. Tool atau tab terpisah. Pekerjaannya tidak masuk kalender dan Laporan Kegiatan, padahal tujuannya report bulanan.

## Keputusan pembuat (boleh dikoreksi)
- Kunci jenis `ops`, label "Ops ETF". Jenis pekerjaan disimpan di `channel`, sama seperti jenis lain.
- Isi kolom `ops` = `{ etf, fee, trx, in: [kode], out: [kode] }`. Server merapikan isiannya:
  - Rupiah berupa bilangan bulat ≥ 0.
  - Kode saham 4 huruf kapital, maks. 60 per daftar.
  - Nama ETF maks. 80 karakter.
- Saham masuk dan keluar diketik sebagai daftar kode, dipisah koma atau spasi.
- Untuk "Pekerjaan ETF lainnya", nominal memakai `trx`, judul memakai `title`, dan catatan memakai `note` yang sudah ada.
- **Yang bisa mencatat dan mengubah:** jabatan ETF & Fund Ops (`ops`) dan admin hub. Dicek di server.
  Tim lain tetap bisa melihatnya di kalender dan laporan.
- Pekerjaan masuk laporan menurut tanggalnya, dalam periode laporan.
