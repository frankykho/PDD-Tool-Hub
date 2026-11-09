# Laporan Postingan Instagram (Content Planner) — design

## Maksud
Social Media Specialist butuh **laporan bulanan** akun Instagram **KISI**: semua postingan bulan itu (gambar +
judul + tanggal) dengan angka like, comment, share, views, save, repost. Postingan di Content Planner memang konten
tim sendiri, jadi "akun KISI" = konten IG di Planner (tidak perlu filter akun). Dibangun di Content Planner (bukan tool baru) karena angka performa, tombol bookmark IG, impor CSV
Meta, dan template PDF Monthly Report sudah ada di sana; tool baru berarti isi angka dua kali dan D1 sudah penuh.

## Tujuan
- Gambar postingan tersimpan per konten, diambil otomatis saat tombol bookmark "Angka IG ke Planner" dijalankan.
- Angka baru **repost** di samping 5 angka yang sudah ada (views, suka, komentar, simpan, bagikan).
- Jenis laporan baru "Laporan IG" di dialog ⬇ Laporan: PDF 16:9 berisi kartu per postingan.

## Bukan tujuan
- Tidak membuat tool / database baru.
- Tidak mengubah Monthly Report, laporan kegiatan, atau laporan program yang sudah ada.
- Tidak scraping dari server (Planner tidak mengunduh dari CDN Instagram).
- TikTok / YouTube tidak ikut (hanya kanal IG).

## Pendekatan (dipilih: B)
- **A. Server Planner mengunduh gambar** dari link CDN Instagram saat Simpan. Ditolak: Content Insight mencatat cara ini
  kalah andal dibanding gambar dari browser.
- **B. Tab Instagram mengambil gambar** (fetch → canvas → WebP/JPEG ±480px), dikirim bersama angka. **Dipilih** — sudah
  terbukti di bookmarklet Content Insight (`grab` + `jpg`), tinggal dipakai ulang.
- Menyimpan link gambar Instagram saja: dibuang, link kedaluwarsa dalam beberapa hari.

## Rancangan
1. **Tabel gambar** `item_img (id TEXT PRIMARY KEY, img TEXT, at TEXT)` di planner-db, terpisah dari `items` supaya
   kalender tidak ikut memuat gambar. Isinya data URL `image/webp|jpeg|png`, maks. ±950 KB (validasi seperti `ciDataImg`).
   Dibaca lewat `GET /api/img?id=` (gambar), dihapus ikut saat kegiatan dihapus.
2. **Bookmarklet "Angka IG ke Planner"**: per postingan ambil `image_versions2.candidates` (atau sampul carousel/reel)
   yang lebarnya terdekat ke 480, jadikan data URL lewat `grab`/`jpg` versi Content Insight, kirim di `row.img`.
   Juga baca `repost_count` kalau ada. Jendela `/ig-sync` menampilkan thumbnail kecil di tabelnya.
3. **`/api/metrics/import`**: kalau baris membawa `img` valid, simpan/ganti di `item_img` untuk kegiatan yang cocok/dibuat.
4. **Repost**: kolom `m_reposts INTEGER` di `items`, masuk `METRICS`, isian dialog Performa ("Repost"), tabel tab
   Performa, peta header CSV (`/^reposts?|dibagikan ulang/i`), dan hitungan interaksi/ER.
5. **Unggah manual**: di dialog Performa, tombol "Gambar postingan" (file / tempel screenshot), dikecilkan di browser
   ke ±480px lalu `POST /api/img`. Tampilkan pratinjau + tombol hapus.
6. **Laporan IG Bulanan** (`rType` baru "Laporan IG"): periode bawaan = bulan lalu (tombol Bulan ini / Bulan lalu /
   tanggal bebas tetap ada); ambil semua konten kanal IG KISI yang tayang di periode itu, urut tanggal tayang.
   Judul sampul "Laporan Instagram KISI — <bulan tahun>". Halaman 1: jumlah postingan + total 6 angka + 3 postingan
   teratas (urut interaksi). Halaman berikutnya: grid kartu (gambar, tanggal tayang, judul, 6 angka), ±8 kartu per
   halaman. Alur pakai tiap bulan: buka profil IG KISI → gulir sampai postingan bulan itu tampil → klik bookmark
   (centang "buat kegiatan" untuk postingan yang belum ada di kalender) → ⬇ Laporan → Laporan IG. Postingan tanpa gambar memakai kotak abu "Tanpa
   gambar". Dicetak lewat `mrPrint` + gaya `MR_CSS` yang sudah ada.

## Keputusan yang saya ambil (bisa dikoreksi)
- Urutan "teratas" = interaksi (suka + komentar + simpan + bagikan + repost); views tidak ikut karena reel mendominasi.
- 8 kartu per halaman; logo sesuai aturan brand (iKISI "Elevate Your Investing" untuk report PDF).
- Siapa yang boleh: sama dengan yang boleh mengisi angka Performa sekarang.

## Untuk pembangun
- Tata letak kartu dan ukuran huruf mengikuti MR_CSS.
- Teks UI baru masuk `i18n.js` Content Planner.
- Cek tambahan di `test.mjs`: validasi data URL gambar & kolom repost ikut impor.
