# Laporan Social Media Specialist (Content Planner) — design

Tanggal: 2026-11-10 · Tool: Content Planner (apps/content-planner)

## Maksud
Social Media Specialist (SMS) KISI tiap bulan menyusun report "Digital Marketing | <Bulan> <Tahun>" di Canva dengan tangan
(contoh Oktober 2026, 4 slide, dikirim user). User ingin tool hub menyusunnya: angka yang bisa diambil sendiri diambil
otomatis, sisanya cukup diketik sekali di form, hasilnya PDF/PPT 16:9 yang diimpor ke Canva — pola yang sama dengan
Laporan Copywriter (spec 2026-11-10-laporan-copywriter-canva).

Isi contoh:
1. **Followers** — tabel Instagram & TikTok, 18 bulan (May 2025 … Oct 2026), satu angka per bulan.
2. **Instagram** — *Scheduled Content* (seri: BreakVest KISI · Every Tuesday - Friday · 14; Weekly BreakVest KISI ·
   Every Monday · 3; Weekly Update Reksa Dana · 4; Weekly Update Bonds · 4; Total 25), *Regular Content* (Total Post 66,
   Account Reach 3,415,684, Views 646,032, Total Likes 5,343), tabel iklan (Total Cost Ads, Total Post with Ads,
   Account Reach).
3. **YouTube Short Video** (Total Post, Total Post with Ads, Total Cost Ads, Impression, Interaction, Views, Views Rate)
   dan **TikTok Content** (Total Post, Profil Views, Video Views, Total Likes) + tabel iklan TikTok + catatan
   ("No TikTok Ads in October").
4. **Summary of Video Editing** (BreakVest KISI 14, Reels -, Total) dan **Summary of Design** (Monthly Outlook 1,
   Regular Education 13, Total).

## Tujuan
- Jenis laporan **"Laporan Social Media Specialist"** di dialog ⬇ Laporan Content Planner; PDF & PPT 16:9 meniru 4 slide
  contoh (header logo Korea Investment + "Digital Marketing | <Month> <Year>", garis hijau, tabel bergaris hijau), label
  English, **disusul kartu postingan IG dari Laporan IG**. Laporan IG **digabung** ke sini dan tidak lagi jadi pilihan
  sendiri (keputusan user).
- **Instagram otomatis lewat bookmark** di browser yang login akun KISI (tidak ada password di server):
  - followers (angka persis), semua postingan bulan itu (bukan hanya yang tampil di layar), likes, views, gambar;
  - di halaman **Content insights** (Professional dashboard): **reach (Viewers)** dan **shares** per postingan;
  - postingan yang belum ada di kalender **otomatis dibuat** sebagai Konten sosmed berstatus Terbit (keputusan user).
- **TikTok otomatis lewat bookmark baru "Angka TikTok ke Planner"** di profil TikTok KISI: followers, video bulan itu,
  views, likes (+ komentar/bagikan/simpan bila ada); video dibuat di kalender dengan kanal TikTok.
- **Form laporan**: semua angka hasil hitungan tampil dan bisa dikoreksi; kolom ketik untuk angka yang tidak bisa
  diambil; isian tersimpan per bulan.

## Bukan tujuan
- API resmi Instagram / TikTok / YouTube Analytics / Marketing API (user memilih jalur bookmark).
- Angka akun dari Professional dashboard selain followers (rentangnya hanya 7/14/30/90 hari terakhir, tidak bisa
  dicocokkan ke bulan kalender).
- Story Instagram tidak dimasukkan ke kalender dan tidak ada di laporan.
- Jadwal otomatis (cron). Data diambil hanya saat bookmark diklik atau laporan disusun (aturan user).
- Mengubah laporan lain (Kegiatan, Monthly, Copywriter, dll.) selain yang disebut di Rancangan §6 (Laporan IG digabung;
  postingan otomatis tidak tampil di Laporan Kegiatan & Monthly Report).

## Anti-tujuan (gagal walau "jalan")
- Password / cookie akun KISI tersimpan atau terkirim ke server tool hub.
- **Postingan tercatat dobel** di kalender (cocokkan per link postingan yang dinormalkan, seperti `postKey` sekarang;
  TikTok per id video).
- **Koreksi manual tertimpa**: angka yang diketik di form dan isian kegiatan yang diubah tim tidak ditimpa diam-diam.
  Angka performa dari bookmark boleh memperbarui angka performa (perilaku sekarang: `COALESCE`, angka yang tidak dibawa
  tidak dihapus).
- Bookmark IG yang sudah ada berhenti bekerja untuk kartu postingan IG / Laporan Copywriter (kolaborasi IG).
- Database Planner membengkak: tidak boleh ada database baru (D1 10/10 penuh).
- Laporan menampilkan angka yang tidak pas tanpa tanda (mis. bookmark gagal membaca → kosong ditampilkan "-", bukan 0
  yang terlihat seperti data).

## Batasan
- **D1**: planner-db 14,7 MB (cek 10 Nov 2026; 13,5 MB gambar, 134 gambar rata-rata ±100 KB, 192 kegiatan). Batas paket
  gratis ±500 MB per database, 100 rb baris tulis/hari. Perkiraan ±90 postingan/bulan → gambar kegiatan yang **dibuat
  otomatis** dikecilkan ke **±320 px (±35 KB)** → ±40 MB/tahun. Tanpa tabel/database baru kecuali benar-benar perlu;
  angka diketik & riwayat followers di tabel `cfg` yang sudah ada.
- Tanpa dependensi baru; PDF/PPT memakai pembuat laporan di page.html (blok `sum`/`table`/`gallery`, mode `raw`/`plain`
  seperti `cwDoc`).
- Logo hanya dari `brand/` (aturan user) — sama dengan Laporan Copywriter.
- Teks UI baru + English di `apps/content-planner/i18n.js` (`node scripts/i18n-check.mjs`); isi laporan selalu English.
- Bookmark berjalan di halaman Instagram/TikTok; bagian dalam halaman itu tidak dijamin tetap → setiap pembacaan punya
  jalan mundur (angka diketik / CSV Meta yang sudah ada).

## Pendekatan
- **A. Lengkap sekaligus di Content Planner (dipilih user).** Laporan + form + perluasan bookmark IG (followers, satu
  bulan penuh, Content insights) + bookmark TikTok baru.
- B. Bertahap (laporan & IG dulu, TikTok menyusul) — tidak dipilih; lebih cepat tapi TikTok diketik dulu.
- C. Tool baru terpisah — dibuang: database baru (kuota habis), postingan IG diisi dua kali.
- API resmi Instagram (aplikasi Meta for Developers + izin akun) — ditawarkan, user memilih jalur bookmark.
- Login server dengan password lalu membaca halaman — dibuang: melanggar aturan Instagram, akun bisa dikunci,
  password tersimpan.

## Rancangan

### 1. Langkah pertama: percobaan baca halaman (bersama user)
Claude tidak bisa login akun KISI. Sebelum bookmark Content insights & TikTok dibangun, buat bookmark percobaan yang
menampilkan (di jendela kecil, tanpa mengirim ke server) data yang bisa dibaca dari:
- halaman **Content insights** (pilihan angka: Accounts engaged, Interactions, Shares, Viewers, Views; jenis: All,
  Posts, Reels, Stories; urutan Newest; tanpa filter tanggal) — cari cara mengambil Viewers & Shares per postingan
  beserta kode/link postingannya (data yang dipakai halaman itu sendiri, bukan angka di layar satu per satu bila bisa);
- **profil TikTok** KISI — followers, daftar video beserta tanggal, views, likes, angka persis (bukan "63,8K").
User menjalankannya dan mengirim hasilnya; rancangan bookmark final menyesuaikan. Bila salah satu tidak bisa dibaca
dengan andal, bagian itu jatuh ke angka diketik dan user diberi tahu.

### 2. Bookmark Instagram (perluasan "Angka IG ke Planner")
- **Followers**: angka persis akun yang sedang dibuka (data profil web Instagram), disimpan sebagai followers IG untuk
  **bulan berjalan** (zona WIB) — klik berikutnya di bulan yang sama menimpa.
- **Satu bulan penuh**: selain mode sekarang (postingan yang tampil), ambil daftar postingan dari feed akun sampai
  melewati awal bulan yang dipilih (bulan berjalan atau bulan lalu), bukan dibatasi 60 yang tampil.
- **Content insights**: dijalankan di halaman itu → reach (`m_reach` = Viewers) & `m_shares` per postingan, dicocokkan
  lewat link; postingan belum ada → dibuat (dengan opsi yang sama).
- Kegiatan baru: kind `konten`, kanal IG Feed/IG Reels (seperti `channelOf` sekarang), status `terbit`, judul = baris
  pertama caption, **caption utuh disimpan di `copy`** (untuk menebak seri), gambar ±320 px.
- Jendela `/ig-sync` tetap: daftar, progres, tombol Simpan; centang "Buat kegiatan…" tetap ada.

### 3. Bookmark TikTok (baru: "Angka TikTok ke Planner")
- Dijalankan di profil TikTok KISI; jendela kecil pola `/ig-sync` (mis. `/tt-sync`), hanya menerima pesan dari
  tiktok.com.
- Followers → followers TikTok bulan berjalan. Video bulan itu → kegiatan kind `konten` kanal `TikTok`, link
  `https://www.tiktok.com/@<akun>/video/<id>`, angka `m_views`, `m_likes`, `m_comments`, `m_shares`, `m_saves` bila
  tersedia, gambar sampul ±320 px. Lewat `/api/metrics/import` (atau perluasannya).
- Tombol bookmark ditaruh di samping tombol IG (tab Performa).

### 4. Form "Laporan Social Media Specialist" (dialog ⬇ Laporan)
Periode **satu bulan kalender** (Bulan ini / Bulan lalu / pilih bulan). Isian tersimpan per bulan di `cfg`
(kunci baru, mis. `sm_n:<YYYY-MM>`), muat ulang saat bulan berganti; daftar baris (seri, video editing, design)
**ikut dari bulan sebelumnya** bila bulan ini masih kosong, angkanya tidak.
- **Followers 18 bulan**: tabel IG & TikTok (bulan laporan dan 17 bulan sebelumnya), bisa diketik; isi dari bookmark
  tampil otomatis (`cfg` per bulan, mis. `sm_fol:<YYYY-MM>` `{ig, tt}`).
- **Scheduled Content**: baris {nama seri, jadwal (teks bebas), jumlah}. Jumlah **ditebak** = postingan IG bulan itu
  yang judul/caption-nya memuat nama seri (tanpa beda huruf besar/kecil); satu postingan masuk paling banyak satu seri,
  **nama seri terpanjang yang cocok menang** ("Weekly BreakVest KISI" mengalahkan "BreakVest KISI"). Bisa dikoreksi.
  Bawaan baris pertama kali: 4 seri dari contoh.
- **Regular Content** = postingan IG bulan itu yang **tidak masuk seri mana pun** (keputusan user: 25 seri + 66 regular
  = 91 postingan Oktober). Total Post, Views, Total Likes dihitung dari postingan itu saja (prefill, bisa dikoreksi);
  Account Reach diketik.
- **Instagram Ads**: Total Cost Ads, Total Post with Ads, Account Reach — diketik.
- **YouTube Short Video**: Total Post (prefill dari kegiatan kanal YouTube bulan itu, bisa dikoreksi), Total Post with
  Ads, Total Cost Ads, Impression, Interaction, Views — diketik; **Views Rate = Views ÷ Impression** dihitung (2 desimal,
  "%"), kosong bila Impression kosong.
- **TikTok Content**: Total Post, Video Views, Total Likes = hitungan dari kegiatan TikTok bulan itu (prefill); Profil
  Views diketik. **TikTok Ads**: 3 angka diketik + catatan bebas (mis. "No TikTok Ads in October").
- **Summary of Video Editing / Summary of Design**: daftar baris {nama, jumlah} diketik, Total dihitung.

Angka kosong tampil "-" di laporan (seperti contoh); 0 yang diketik tampil "0".

### 5. Laporan PDF/PPT
4 halaman seperti contoh, lalu bagian **Instagram Posts** dari Laporan IG (3 postingan teratas + semua postingan IG bulan
itu dalam kartu bergambar dengan Likes, Comments, Shares, Views, Saves, Reposts), label English, gaya polos yang sama.
Halaman utama: urutan & judul sama ("Instagram / Followers", "TikTok / Followers", "Instagram / Scheduled
Content", "Instagram / Regular Content", "Youtube / Short Video", "Tiktok / Content", "Summary of Video Editing",
"Summary of Design"). Header "Digital Marketing | <Month> <Year>" (salah ketik "Markeitng" di contoh dibetulkan).
Label bulan tabel followers utuh ("Oct 26"), tidak terpotong. Nama file mengikuti pola `repFile`
("Laporan Social Media Specialist - Oktober 2026"; English: "Social Media Specialist Report - October 2026").

### 6. Dampak ke laporan lain (keputusan user)
- **Laporan IG** dihapus dari pilihan jenis laporan; isinya pindah ke bagian akhir Laporan Social Media Specialist
  (`igData`/`igDoc` dipakai ulang; test yang mengecek `data-t="ig"` disesuaikan).
- **Postingan yang dibuat otomatis** (bookmark IG/TikTok, juga impor CSV Meta dengan "Buat kegiatan…") **hanya tampil di
  Laporan Social Media Specialist** — tidak ikut Laporan Kegiatan dan Monthly Report. Perlu penanda di kegiatan
  (mis. kolom baru lewat `COLS`) yang diisi saat kegiatan dibuat oleh impor; postingan yang dicatat tim sendiri tetap
  ikut laporan-laporan itu. Kegiatan lama hasil impor (sebelum penanda ada): ditandai bila bisa dikenali andal,
  kalau tidak dibiarkan — diserahkan ke pembangun.
- Kalender tetap menampilkan semua postingan.

## Keputusan Claude (bukan dari user — mohon dicek)
- Story tidak masuk kalender/laporan; gambar kegiatan otomatis ±320 px (alasan kuota di Batasan).
- Seri ditebak dari judul + caption; bookmark menyimpan caption utuh di `copy` untuk kegiatan yang dibuat **dan** untuk
  kegiatan yang cocok bila `copy`-nya masih kosong (isian tim tidak ditimpa), supaya postingan lama juga ikut terhitung.
- YouTube "Total Post" prefill = kegiatan dengan link YouTube `/shorts/` di bulan itu (bukan video panjang / tampil di
  media milik Laporan Copywriter); bisa dikoreksi.
- Format angka di laporan pakai koma ribuan (en-US), sama dengan contoh dan `cwDoc`.
- Nama seri terpanjang yang cocok menang; tiap postingan maksimal satu seri.
- Followers dicatat untuk bulan saat bookmark diklik (angka hari itu, bukan tepat akhir bulan); bisa dikoreksi di form.
- Views Rate dihitung dari Views ÷ Impression.
- Semua angka hasil hitungan bisa ditimpa di form; angka yang ditimpa tersimpan dan dipakai lagi saat laporan bulan
  itu dibuka ulang.

## Diserahkan ke pembangun
- Cara teknis membaca Content insights & TikTok (hasil langkah 1), nama endpoint/halaman sinkron baru.
- Bentuk kunci & validasi `cfg` baru (nilai berisi teks untuk nama seri/jadwal/catatan, beda dengan `cw_n` yang hanya
  angka); batas ukuran wajar.
- Tata letak tabel di PDF/PPT (ikuti contoh), termasuk tabel followers 18 kolom.
- Pengujian: hitungan laporan sebagai fungsi murni di `apps/content-planner/test.mjs` (pola `cwCalc`).
