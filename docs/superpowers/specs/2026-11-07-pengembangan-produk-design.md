# Pengembangan produk di Content Planner — rancangan singkat

## Maksud
Tim Product Development mencatat **fitur baru, fungsi, dan perbaikan** di Content Planner, lalu memperbarui statusnya.
Hasilnya, progres produk terlihat di kalender dan Laporan Kegiatan bersama pekerjaan tim lain.
Fiturnya bebas, tidak terikat ke satu produk tertentu.

## Tujuan
- Jenis kegiatan baru **"Pengembangan produk"** (ikon 🧩).
  - **Jenis**: Fitur baru · Fungsi / peningkatan · Perbaikan · Lainnya (ketik sendiri).
  - **Isian**: nama fitur (judul), produk / aplikasi (teks bebas), deskripsi fungsi, tanggal mulai, target rilis (opsional), PIC, link dokumen, catatan.
  - **Status**: Ide → Rencana → Pengembangan → Uji → Rilis, atau Batal.
- **Update status bertanggal**: setiap pindah status atau setiap ada catatan update, satu baris masuk ke riwayat (siapa, kapan, status, catatan).
  Riwayat ini tampil di form. Polanya sama dengan update progres rencana galeri.
- Laporan Kegiatan mendapat bagian **Pengembangan produk**:
  - Tabel: tanggal, produk, fitur, jenis, PIC, status, target rilis, update terakhir.
  - Ikut masuk ke "Rekap per orang".

## Bukan tujuan
- Papan kanban, prioritas, estimasi, atau sambungan ke Jira / Feature Intelligence.
- Tugas di dalam fitur (sudah ada lewat Program bila perlu).

## Pendekatan
1. **Dipilih (A):** jenis kegiatan baru di tabel `items`, mengikuti pola Ops ETF dan Galeri.
   Kolom yang sudah ada dipakai ulang: `partner` = produk / aplikasi, `goal` = deskripsi fungsi, `end_date` = target rilis.
   Riwayat memakai tabel `comments` dengan kind `progres:<status>`, sama seperti galeri.
   Tidak ada tabel atau database baru (D1 sudah penuh).
2. Menumpang di jenis "Aktivitas". Ini paling kecil, tapi statusnya tidak cocok, tidak ada riwayat, dan fitur bercampur dengan rapat.
3. Halaman roadmap terpisah. Kodenya paling banyak, dan fitur tidak ikut kalender maupun laporan.

## Keputusan saya (bisa dikoreksi)
- **Yang boleh mencatat & mengubah**: hanya admin Tool Hub (saat ini hanya user). Anggota lain tetap bisa melihat di kalender & laporan,
  tapi pilihan jenis ini tidak muncul di form mereka dan server menolak simpanan mereka (pola sama dengan Ops ETF).
  Kalau nanti orang lain perlu ikut mengisi, hak ini bisa diperluas ke role tertentu.
- Endpoint riwayat galeri (`/api/galeri?id=`) diperluas supaya juga melayani riwayat jenis ini, tanpa endpoint baru.
- Teks baru ikut ditambahkan ke kamus EN (`i18n.js`).
- Tes ditambah di `test.mjs` untuk pembersihan isian dan pencatatan riwayat.
