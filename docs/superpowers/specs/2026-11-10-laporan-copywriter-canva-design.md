# Laporan Copywriter format Canva (Content Planner) — design

## Maksud
Copywriter KISI tiap bulan menyusun report "Digital Marketing | <Bulan> <Tahun>" di Canva dengan tangan: tabel ringkasan,
tabel detail ±80 artikel/berita, tabel narasumber di media (Ticker Talk), dan galeri kampanye (KISI Challenge). Contoh
Oktober 2026 dikirim user (15 slide). User ingin tool hub yang menyusunnya, supaya copywriter cukup mencatat pekerjaan
per tanggal di Content Planner dan tool hub mengisi gambar, judul, views, dll. Hasilnya PPT yang diimpor ke Canva
(Create → Import file) lalu disatukan dengan deck tim.

Laporan Copywriter versi kartu (spec 2026-11-09-laporan-copywriter) **diganti** formatnya; kartu bergambar dipakai
ulang di bagian galeri.

## Tujuan
1. Copywriter mencatat tiap artikel / rilis / berita di Planner **pada tanggal tayang** dengan menempel link.
   Tool hub mengisi: gambar (sudah ada), **judul**, **nama media**, **topik** & **kategori** (tebakan, bisa dikoreksi).
2. **Artikel kisi.co.id tidak dicatat manual**: diambil dari API publik website (judul, tanggal, views, gambar, penulis,
   tag) saat Laporan Copywriter disusun, dan masuk ke Planner sebagai kegiatan.
3. **Views YouTube tanpa API key**: dibaca dari halaman publik video; gagal → angka manual tetap.
4. **Kolaborasi IG**: lewat bookmark "Angka IG ke Planner" yang sudah ada (buka link postingan di Instagram, klik
   bookmark); mitra kolaborasi dibaca dari data postingan.
5. **Push notification**: kanal baru; isi tanggal + unggah gambar saja.
6. **Laporan** PDF & PPT 16:9 meniru tampilan deck Canva user, isi seperti contoh (lihat Rancangan §6).
7. Jumlah **desain** (Article / IG Story / IG Feed), **proposal**, dan **Social Media (KISI Contents)** cukup **diketik**
   saat membuat laporan (keputusan user).

## Bukan tujuan
- YouTube Data API / akun kantor (user: tidak dipasang).
- Pencarian otomatis artikel media (Google News dll.). Dicek 10 Nov: hanya 5/19 ANALIS MARKET Pasardana dan 4/10
  Infobank ketemu, banyak hasil salah ("kisi-kisi saham"). Media tetap dicatat copywriter per tanggal.
- Mengisi Canva langsung (Canva Connect API butuh Enterprise + akun kantor).
- Jadwal otomatis (cron). Semua pengambilan terjadi saat link disimpan atau saat laporan disusun
  (aturan user: tanpa otomatisasi terjadwal).
- Mengubah laporan lain (Kegiatan, IG, Monthly, dll.).
- Mencatat pekerjaan desain & proposal per tanggal.

## Anti-tujuan
- **Artikel tercatat dobel**: impor kisi.co.id tidak boleh menggandakan artikel yang sudah dicatat manual → cocokkan
  per id artikel kisi.co.id di link (dan per link yang sama).
- **Koreksi manual tertimpa**: topik/kategori/nama media yang sudah diubah copywriter tidak boleh ditimpa tebakan atau
  impor ulang. Hanya views (dan judul/gambar bila kosong) yang diperbarui otomatis.
- **SSRF** lewat pengambil judul/meta link: aturan yang sama dengan `/api/linkimg` (https publik saja, ukuran & waktu dibatasi).
- **PPT yang berantakan di Canva**: tabel/huruf yang pecah saat diimpor membuat copywriter merapikan ulang → tujuan fitur gagal.

## Batasan
- D1 penuh (10/10): tidak ada database baru; tambah kolom di `items` lewat `COLS` (pola yang ada) dan `cfg` untuk angka simpanan.
- Tanpa dependensi baru; PPT/PDF memakai pembuat laporan yang sudah ada di page.html (blok `cover/page/table/posts/kpis`).
- Logo hanya dari `brand/` (aturan user): logo KISI `brand/kisi-color.png`.
- Teks UI baru + English di `apps/content-planner/i18n.js`; laporan ikut pilihan bahasa yang sudah ada
  (contoh user berbahasa Inggris).

## Pendekatan
- **A. Kembangkan Laporan Copywriter di Content Planner (dipilih user).** Kegiatan per tanggal, gambar dari link, bookmark
  IG, unggah gambar, Catat ke Planner dari Email Studio, dan pembuat PDF/PPT sudah ada. Data tidak diisi dua kali.
- B. Tool baru khusus laporan copywriter — ditolak: butuh database baru (kuota habis), pencatatan dua tempat.
- C. Ekspor spreadsheet → Bulk Create Canva — ditolak: Bulk Create membuat satu halaman per baris, tidak cocok untuk
  tabel 20 baris/halaman; butuh Canva Pro.
- Di dalam A: format laporan kartu yang sekarang **diganti** (bukan dua pilihan berdampingan) — keputusan user.

## Rancangan

### 1. Isian baru di kegiatan (kolom `items`)
- `topic TEXT` — `branding` | `event` | `saham` (label: Branding / Event / Investasi Saham; English summary: Stock Investment).
- `sell TEXT` — `hard` | `soft` (Hard Selling / Soft Selling).
- `media TEXT` — nama media / mitra (Pasardana.id, IDX Channel, Sahamology, …).
- `press INTEGER` — 1 = artikel ini liputan press release (judul di laporan diberi awalan "[Press Release]").
- Tampil di form kegiatan jenis Artikel dan konten YouTube/IG (topik, kategori, media), dengan nilai tebakan terisi
  bila masih kosong. Tebakan hanya mengisi yang kosong; pilihan copywriter disimpan apa adanya.

**Aturan tebakan** (fungsi murni, ada test):
- Topik: tag/judul memuat "KISI Challenge" → `event`; tag "Behind The Candle" → `saham`; press release, "ANALIS MARKET",
  "IHSG" → `branding`; selain itu internal → `saham`, eksternal → `branding`.
- Kategori: eksternal **dan** (press release **atau** topik event) → `hard`; selain itu `soft`
  (contoh Oktober: artikel KISI Challenge di website = Soft, di Emiten News = Hard).
- Nama media: peta domain kecil untuk media yang sering muncul (pasardana.id → Pasardana.id, infobanknews.com →
  Infobanknews.com, idxchannel.com → IDX Channel, emitennews.com → Emiten News, kontan.co.id → Kontan.co.id,
  metrotvnews.com → Metro TV News, katadata.co.id → Katadata.co.id, kompas.com → Kompas.com, bisnis.com → Bisnis.com,
  antaranews.com → Antara News, wartaekonomi.co.id → Warta Ekonomi, swa.co.id → SWA.co.id, …); di luar peta →
  `og:site_name`; tidak ada → nama domain. kisi.co.id → "Company Website".

### 2. Judul & meta dari link
- Saat kegiatan berlink (bukan Instagram) disimpan dan judul masih kosong / sama dengan link, Planner mengambil
  `og:title` (atau `<title>`), `og:site_name`, dan `article:published_time` dari halaman itu, memakai jalur pengambilan
  `/api/linkimg` yang sudah ada (batas ukuran, https publik, timeout). Bentuk endpoint diserahkan ke pembangun
  (perluas `/api/linkimg` atau endpoint meta terpisah).
- Hasil mengisi judul (kalau kosong), `media` (kalau kosong), lalu tebakan topik/kategori (kalau kosong).

### 3. Artikel kisi.co.id
- Sumber: `GET https://api-compro.kisi.co.id/api/v1/kisiNews/list?limit=<n>&offset=<k>&active=1` (publik, JSON; dicek
  10 Nov dari PC kantor: 24 artikel Oktober). Field: `news_id, news_title, news_date, news_content` (HTML; gambar =
  `<img>` pertama), `news_tag` (JSON string), `views`, `created_by` (email penulis).
- Link artikel: `https://kisi.co.id/blog/artikel/<news_id>` (route situs mengalihkan ke URL lengkap).
- Saat Laporan Copywriter disusun: server Planner membaca halaman demi halaman (urut terbaru) sampai melewati awal
  periode, lalu untuk tiap artikel di periode: buat kegiatan (jenis Artikel, kanal Website, tanggal = `news_date`,
  PIC = `created_by` bila terdaftar di Planner, `media` "Company Website", topik/kategori tebakan dari tag) atau
  perbarui yang sudah ada (cocok lewat `news_id` di link) — **hanya `m_views` (sumber `kisi`) dan judul/gambar kosong**
  yang diperbarui. Gambar disimpan di `item_img` (pola gambar-dari-link yang ada).
- Gagal (situs/API mati, atau diblokir dari Cloudflare): laporan tetap jadi dari data Planner, dengan catatan kecil
  "Artikel kisi.co.id tidak bisa diambil".
- **PIC & filter**: semua artikel kisi.co.id di periode **selalu dihitung** di laporan "Semua copywriter" (tidak kena
  filter PIC Copywriter, tidak masuk hitungan "dilewati"). PIC = `created_by` bila terdaftar di Planner, selain itu kosong.
  Bila Orang memilih satu orang, hanya artikel dengan PIC orang itu. (Oktober: ke-24 artikel ditulis satu orang.)
- **Tag** disimpan di kolom baru `tags TEXT` (JSON array dari `news_tag`) supaya pencocokan kampanye tetap jalan
  setelah impor.
- **Tidak dobel**: cocok bila link memuat `news_id` yang sama; kalau link tempelan tidak memuat id (format URL lengkap
  situs belum pasti), cocok lewat judul (dinormalkan) + tanggal yang sama. Kegiatan tempelan itu lalu dilengkapi
  (views, tag), bukan dibuat baru.
- **YTD Internal** dihitung langsung dari API kisi.co.id (semua artikel sejak 1 Januari s.d. akhir periode; ±5 halaman
  @60), bukan dari Planner — tidak bergantung pada laporan bulan lalu pernah dibuat. Angka awal YTD yang diketik
  hanya untuk **External**.

### 4. YouTube tanpa API
- Baca halaman `https://www.youtube.com/watch?v=<id>`: `"viewCount":"<n>"`, `"publishDate"`, `isLiveContent`
  (dicek 10 Nov dari PC kantor: terbaca). Judul & nama channel dari oEmbed (`/oembed?url=…`, tanpa key).
- Dipakai `/api/yt/refresh` bila `YOUTUBE_API_KEY` tidak ada (jalur API tetap ada bila kelak dipasang).
  Dipanggil saat kegiatan YouTube disimpan dan saat laporan disusun (sudah begitu sekarang).
- Program = teks setelah "|" terakhir di judul (mis. "TICKER TALK"); "LIVE" bila video siaran langsung.
  Media = nama channel oEmbed (IDX CHANNEL → "IDX Channel" lewat peta nama media).
- Gagal (YouTube menolak server): diam; views manual tetap dipakai.

### 5. Kolaborasi IG & push notification
- Bookmark "Angka IG ke Planner": baca mitra kolaborasi dari data postingan (`coauthor_producers` / `invited_coauthor_producers`,
  ambil akun selain kisi_sekuritas) → `media`. Postingan dengan mitra = "Social Media (Media & Community)".
  Pembangun memastikan nama field di respons Instagram yang sebenarnya; bila tidak ada, `media` diisi manual.
- Kanal baru **"Push notification"** di jenis Artikel (sebelah Email / Newsletter). Form cukup tanggal + gambar
  (kotak gambar yang ada); judul boleh kosong → otomatis "Push notification <tanggal>".

### 6. Laporan (PDF & PPT 16:9, gaya deck Canva user)
**Kerangka setiap halaman**: latar putih; kiri atas logo KISI (`brand/kisi-color.png`); kanan atas
"Digital Marketing | <Bulan> <Tahun>" abu-abu; garis hijau tua di bawah kepala; judul halaman besar (Inter bold, gelap).
Tabel: header hijau tua (#136F4A-an) teks putih, garis tipis hijau. Huruf Inter (ada di Canva).
Judul laporan & label mengikuti bahasa laporan (contoh user: English).

Isi, berurutan (mengikuti contoh):
1. **Articles/News** — tabel Channel × (<Bulan>, YTD <Tahun>): Internal (kisi.co.id), External (Media), Total.
   **Topic in <Bulan>** — Branding / Event / Stock Investment / Total.
2. **Copywriting for Publication** — Social Media (KISI Contents), Social Media (Media & Community for <kampanye>),
   Article Internal (kisi.co.id), Promo on Website, Press Release, Push Notifications, Total.
3. **Design for Publication** — Article / IG Story / IG Feed / Total (diketik).
   **Administration** — Proposal (including Distribution, Reimbursement, Report/LPJ) / Total (diketik).
   **Supporting Investment Specialist Involves in Media** — per program+media (mis. IDX Channel Program "Ticker Talk") / Total.
4. **Details Articles/News** — No, Topic (warna: Branding merah, Event abu, Investasi Saham biru), Title & Link
   (judul bisa diklik; awalan "[Press Release]"), Published Date, Category (Hard oranye-coklat / Soft biru), Channel
   (nama media / Company Website), Views ("-" bila kosong). Urut tanggal; 20 baris per halaman; baris "Total Views" di halaman terakhir.
5. **Details Speakers at Media** — No, Content (thumbnail), Title, Program ("LIVE" merah di atas nama program bila siaran
   langsung), Media, Date, Link, Views; 3 baris per halaman; "Total Views" di akhir.
6. **Galeri kampanye** (per kampanye yang diisi di dialog): Article for <kampanye> (www.kisi.co.id), Article for
   <kampanye> (Media), Social Media Content for <kampanye> (kolaborasi IG), Email Blast for <kampanye>, Push Notification
   for <kampanye>. Kartu: gambar + judul di atas / keterangan bernomor di bawah ("1) Article in IDX Channel",
   "2) Email Blast 13 October"), keterangan = link bila ada. Bagian tanpa isi tidak dibuat.

**Angka ringkasan** dihitung dari kegiatan periode itu (PIC Copywriter atau yang dipilih di Orang, seperti sekarang):
- Internal = artikel kanal Website/Blog (+ impor kisi.co.id); External = artikel kanal Media partner.
- Social Media (KISI Contents) = **diketik** copywriter di dialog (keputusan user); (Media & Community) = konten dengan `media` mitra.
- Article Internal = Internal; Promo on Website = artikel internal yang ditandai promo — **awal: angka diketik** (lihat dialog);
  Press Release = jumlah tanggal berbeda yang punya liputan press release (Oktober: 1 & 21 Okt = 2); Push = kanal Push notification.
- Supporting Investment Specialist = video YouTube, dikelompokkan per (media, program).

**Dialog Laporan Copywriter** (tambahan): Kampanye (teks, boleh beberapa dipisah koma; kegiatan cocok bila judul, tag
kisi.co.id, atau nama program tertautnya memuat teks itu); jumlah Social Media (KISI Contents); jumlah Desain Article /
IG Story / IG Feed; jumlah Proposal; Promo on Website; angka awal YTD External "s.d. akhir <bulan>" — disimpan sekali per tahun di `cfg`
(`cw_ytd:<tahun>` = {upto:"YYYY-MM", ext}), YTD External = angka awal + hitungan Planner setelah bulan itu s.d. akhir
periode; YTD Internal dari API kisi.co.id (§3).
Angka Social Media/Desain/Proposal/Promo diingat per periode di `cfg` (`cw_n:<YYYY-MM>`) supaya laporan bisa dibuat ulang.
Setiap angka ringkasan yang dihitung otomatis tampil juga sebagai kotak isian di dialog (terisi hitungan, boleh diubah)
— koreksi berlaku untuk laporan itu saja.

## Keputusan yang saya ambil (bisa dikoreksi)
- Kolom baru `topic`, `sell`, `media`, `press`, `tags` (bukan memakai ulang `partner`/`place`/`note`).
- Artikel kisi.co.id selalu dihitung di "Semua copywriter", apa pun PIC-nya; YTD Internal langsung dari API website.
- Link kisi.co.id tempelan tanpa id dicocokkan lewat judul + tanggal.
- Impor kisi.co.id berjalan otomatis setiap Laporan Copywriter disusun (tanpa tombol terpisah).
- Push notification = kanal di jenis Artikel (seperti email blast), bukan jenis kegiatan baru.
- Angka diketik (desain, proposal, promo, YTD awal) disimpan di `cfg` supaya tidak diketik ulang saat membuat ulang laporan.
- Angka ringkasan otomatis boleh dikoreksi di dialog (contoh user sendiri berisi selisih: topik 77 vs total 80).
- Kampanye ditentukan lewat isian teks di dialog, bukan daftar kampanye baru.
- PDF tetap dibuat dengan tata letak yang sama dengan PPT.

## Untuk pembangun
- Kode laporan sekarang: `apps/content-planner/page.html` (`cwData`, `cwDoc`, pembuat PPT/PDF blok), worker
  `apps/content-planner/worker.js` (`COLS`, `/api/linkimg`, `/api/yt/refresh`, `/api/metrics/import`, bookmark IG di page.html).
- Test: `node apps/content-planner/test.mjs` — tebakan topik/kategori/media; impor kisi.co.id dengan fetch tiruan
  (buat, perbarui views tanpa menimpa topik yang diubah, tidak dobel); parser halaman YouTube (viewCount, live);
  pemecahan tabel detail 20 baris/halaman.
- Uji dari Cloudflare setelah deploy: API kisi.co.id dan halaman YouTube terbuka untuk server (baru teruji dari PC kantor).
- Uji impor PPT ke Canva (Create → Import file) dengan data Oktober: tabel tetap tabel, link tetap bisa diklik, huruf
  tidak berubah. Hasilnya dilaporkan ke user; bila tabel pecah, cari bentuk tabel PPT yang diterima Canva.
