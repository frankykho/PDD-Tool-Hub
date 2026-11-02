# Materi presentasi di Brand Kit: rancangan

Tanggal: 2 November 2026 · Status: draf, menunggu persetujuan
(Dulu direncanakan sebagai tool terpisah "Approval Desk"; pengguna memilih memasukkannya ke Brand Kit.)

## Maksud dan alasan

Deck presentasi (seminar, edukasi, kunjungan) sekarang dikirim untuk diperiksa lewat jalur tidak resmi, jadi statusnya tidak jelas, dan setelah disetujui cabang masih bisa memakai versi lama atau versi yang belum disetujui (*keputusan pengguna: kedua masalah ini nyata*).

Bagian baru **Materi presentasi** di Brand Kit:

- Investment Growth Specialist mengajukan deck.
- Pemilik tool (admin) atau Head Regional menyetujui atau meminta revisi.
- Deck yang sudah disetujui menjadi satu-satunya versi resmi. Sales mengunduhnya dari Brand Kit.
- File disimpan di Google Drive.

## Tujuan

- Alur pengajuan → periksa → revisi → setuju yang jelas statusnya bagi pengaju dan penyetuju.
- Hanya satu versi berlaku per deck. Versi baru yang disetujui otomatis menggantikan versi lama (*keputusan pengguna*).
- Sales menemukan dan mengunduh deck resmi dari satu daftar dengan pencarian judul (*keputusan pengguna*).
- File tersimpan di Google Drive (*keputusan pengguna*), dan perpindahan folder terjadi otomatis.

## Bukan tujuan (saat ini)

- Persetujuan poster, caption, atau artikel. Itu sudah ditangani Brand Kit (template terkunci), Content Planner (persetujuan caption), dan Copy Studio (cek teks).
- Kategori atau penanda deck. Cukup daftar dan pencarian (*keputusan pengguna*).
- Persetujuan berlapis. Satu penyetuju cukup (*keputusan pengguna*).
- Mengedit deck di dalam tool. Deck dibuat di PowerPoint, Canva, dan sebagainya, lalu diunggah sebagai file.
- Tool baru terpisah di Tool Hub (*keputusan pengguna: cara A*).

## Yang dianggap gagal walaupun "jalan"

- Sales bisa melihat atau mengunduh deck yang belum disetujui, termasuk lewat link Drive yang terbuka untuk umum.
- Setelah versi baru disetujui, versi lama masih muncul atau masih bisa diunduh sales.
- Persetujuan atau revisi tidak tercatat (siapa, kapan, versi mana).
- File di Drive dan status di Brand Kit tidak cocok, misalnya status "Resmi" tetapi file masih di folder "Menunggu".
- Unggahan besar gagal diam-diam atau membuat Brand Kit lambat untuk semua orang.

## Pengguna dan hak akses

- **Melihat dan mengunduh deck resmi:** semua pemegang akses Brand Kit.
- **Mengajukan:** hanya role **Investment Growth Specialist** (kunci role `is` di Tim & role Tool Hub) (*keputusan pengguna*). Penyetuju tidak mengajukan, jadi tidak ada yang menyetujui deck sendiri.
- **Versi baru untuk deck yang sudah Resmi:** semua Investment Growth Specialist, bukan hanya pengaju awal. Deck milik tim (*keputusan saya*).
- **Menyetujui, meminta revisi, menarik:** semua admin hub, atau Head di tim regional (role ber-`head` di tim `regional`, yaitu Head of Regional Management) (*keputusan pengguna*; cara mengenali Head Regional dari Tim & role adalah *keputusan saya*).
- **Deck yang masih menunggu atau sedang direvisi** hanya terlihat oleh pengaju (dan pengaju lain dengan role yang sama) serta penyetuju (*keputusan saya*).

## Alur

### 1. Mengajukan deck baru

- Isian: **judul** (wajib), **keterangan singkat** (opsional), **file** PPT, PPTX, atau PDF, maksimal 100 MB (*keputusan saya*).
- File diunggah langsung dari browser ke Google Drive, tidak lewat server Brand Kit (*keputusan saya*), dengan tanda kemajuan dan pesan jelas bila gagal.
- File masuk folder **Menunggu**. Status: **Menunggu persetujuan**.

### 2. Memeriksa

- Penyetuju melihat daftar yang menunggu, membuka file (PDF tampil langsung di browser lewat Brand Kit; PPT/PPTX diunduh) (*keputusan saya*), lalu memilih:
  - **Setujui**, atau
  - **Minta revisi** dengan catatan wajib, misalnya "Slide 5 angkanya salah".
- **Cukup salah satu penyetuju.** Keputusan pertama yang berlaku. Versi yang sudah diminta revisi tidak bisa disetujui lagi. Penyetuju menunggu versi baru (*keputusan pengguna + keputusan saya untuk aturan bentrok*).

### 3. Revisi

- Pengaju melihat catatan revisi, lalu mengunggah **versi baru** untuk deck yang sama. Status kembali **Menunggu persetujuan**.
- File versi yang diminta revisi pindah ke **Arsip**.

### 4. Disetujui

- File pindah ke folder **Resmi**. Deck tampil di daftar sales.
- Kalau deck itu sudah punya versi resmi sebelumnya, versi lama pindah ke **Arsip** dengan tanda "Tidak berlaku" dan hilang dari daftar sales (*keputusan pengguna: versi baru menimpa; arsip disimpan untuk riwayat adalah keputusan saya yang disetujui pengguna*).
- Selama versi baru belum disetujui, versi resmi lama tetap dipakai sales.

### 5. Menarik deck

- Penyetuju bisa menarik deck resmi yang sudah tidak berlaku walaupun belum ada versi baru. File pindah ke Arsip, deck hilang dari daftar sales, dan alasannya dicatat (*keputusan saya, disetujui pengguna*).

### 6. Sales

- Satu daftar deck resmi, terbaru di atas, dengan pencarian judul (*keputusan pengguna*).
- Per deck: judul, keterangan, tanggal disetujui, tombol **Unduh**.
- Setiap unduhan dicatat (email, cabang, deck, versi) untuk Laporan KPI, seperti catatan unduhan poster yang sudah ada (*keputusan saya*).
- **Sales diberi tahu saat deck yang pernah mereka unduh diganti atau ditarik** (*keputusan pengguna*): lewat beranda Tool Hub ("Deck X sudah diganti, unduh versi terbaru" / "Deck X ditarik"), memakai catatan unduhan. Di daftar, deck yang baru diganti diberi tanda "Diperbarui".

### 7. Riwayat dan pemberitahuan

- Per deck tersimpan semua versi, pengaju, catatan revisi, siapa yang menyetujui atau menarik, dan kapan.
- Penyetuju diberi tahu ada deck menunggu. Pengaju diberi tahu saat disetujui atau diminta revisi.
- Pemberitahuan muncul di beranda Tool Hub (bagian "Hari ini") lewat `/__hub/today` Brand Kit, ditambah ke daftar `FEEDS` hub (*keputusan saya*). Bukan lonceng: lonceng saat ini milik Content Planner dan hanya muncul untuk pengguna Planner atau Market News. Tanpa cron, pemberitahuan terlihat saat hub dibuka. Di Brand Kit sendiri, tab Materi presentasi menampilkan jumlah yang menunggu.

## Google Drive

- **Folder materi presentasi terpisah dan privat**, bukan di dalam folder Brand Kit yang sekarang (*keputusan saya*). Alasannya, folder Brand Kit dibagikan publik dan setiap subfolder di dalamnya tampil sebagai kategori di tab File. Kalau "Menunggu" ada di sana, deck yang belum disetujui jadi terbuka.
- Isinya tiga folder: **Menunggu**, **Resmi**, **Arsip**. Dibuat otomatis oleh Brand Kit.
- **Arsip: simpan 3 versi terakhir per deck** (*keputusan pengguna*). Versi arsip yang lebih lama dipindah ke Trash Drive (masih bisa dipulihkan 30 hari). Catatan riwayatnya di Brand Kit tetap ada. Alasannya, kuota Gmail pribadi 15 GB dipakai bersama email dan foto.
- **Sales mengunduh lewat Brand Kit**, bukan lewat link Drive publik, supaya deck yang ditarik atau diarsipkan langsung tidak bisa diunduh dan setiap unduhan tercatat.
- **Hanya Brand Kit yang mengisi folder ini.** File yang ditaruh manual lewat Drive tidak terlihat tool (izin `drive.file` hanya menjangkau file buatan tool).
- **Deck yang sekarang beredar** diajukan ulang lewat alur ini oleh Investment Growth Specialist. Deck lama di folder publik Brand Kit sebaiknya dikeluarkan pemiliknya supaya tidak ada jalur kedua (*keputusan saya*).
- **Izin Google Drive diberikan sekali** oleh pemilik akun Google (pengguna). Tool menyimpan izin itu sebagai secret. Gratis. Langkah pemasangannya ditulis di README seperti langkah `DRIVE_API_KEY`.

## Batasan teknis (mengikuti proyek yang ada)

- Kode di `apps/brand-kit` (worker, halaman, i18n, tes), ditambah perubahan kecil di Tool Hub untuk pemberitahuan (`FEEDS`, tampilan "Hari ini"). Tanpa tool baru di `APPS` Tool Hub.
- **Database:** `brand-db` milik Brand Kit. Akun gratis sudah memakai 10 dari 10 database D1, jadi tidak boleh ada database baru.
- **Penyimpanan file:** hanya Google Drive. Bukan D1 atau KV (batas ukuran dan kuota).
- **Login dan hak akses:** HUBSSO yang sudah ada. Role dan tim dari sinkron Tool Hub (`/__hub/users`: `job`, `adm`, `org`).
- **Tampilan:** tema terang/gelap dan bahasa Inggris memakai pola Brand Kit. Nyaman di HP (target sentuh ≥44 px).
- **Tes:** `apps/brand-kit/test.mjs` dengan Google Drive tiruan. Tes Brand Kit, Tool Hub, dan `scripts/i18n-check.mjs` tetap lolos.
- **Semua gratis.** Tanpa cron baru (5 slot cron gratis sudah terpakai).

## Cara membangun yang dipertimbangkan

- **A. Bagian baru di Brand Kit, Drive otomatis:** **dipilih pengguna.** Sales sudah mengambil materi resmi di Brand Kit, Brand Kit punya database sendiri, dan logo, disclaimer, serta deck jadi satu tempat. Konsekuensinya, Brand Kit menjadi lebih besar.
- **B. Tool baru Approval Desk, Drive otomatis:** ditolak. Sales harus membuka dua tempat, dan datanya harus menumpang di database tool lain.
- **C. Hanya link, Drive manual:** ditolak. Paling cepat dibuat, tetapi versi lama masih bisa beredar kalau orang lupa memindahkan atau menghapus file.

## Keputusan pengguna

- Materi yang perlu persetujuan adalah deck presentasi.
- Masalahnya dua: status tidak jelas, dan versi lama atau yang belum disetujui tetap dipakai. Versi baru harus menimpa versi lama.
- Versi lama disimpan di arsip, bukan dihapus.
- Penyetuju: pengguna dan Head Regional. Cukup salah satu. Ada permintaan revisi.
- File disimpan di Google Drive. Sales mengunduh untuk memakainya.
- Dibangun di Brand Kit (cara A).
- Pengaju: hanya Investment Growth Specialist.
- Sales cukup daftar dan pencarian.
- Usulan tambahan disetujui: tarik deck, format PPT/PPTX/PDF maksimal 100 MB, catatan unduhan, folder dibuat otomatis.
- Penyetuju: semua admin hub + Head Regional.
- Sales yang pernah mengunduh diberi tahu saat deck diganti atau ditarik.
- Arsip: 3 versi terakhir per deck.

## Diserahkan ke pembangun

- Cara izin Google Drive (OAuth satu kali dengan refresh token, scope sesempit mungkin, misalnya `drive.file` kalau folder dibuat oleh tool), termasuk syarat agar izin tidak kedaluwarsa setelah 7 hari (aplikasi Google dalam status "Testing").
- Cara unggah langsung dari browser ke Drive (misalnya sesi unggah *resumable* yang dibuat server) dan cara unduh lewat Brand Kit (diteruskan dari Drive).
- Skema tabel di `brand-db`, cara menjaga status dan letak file tetap cocok bila pemindahan di Drive gagal di tengah jalan.
- Jalur pemberitahuan di Tool Hub (lonceng atau ringkasan "Hari ini"), dan perubahan di Tool Hub yang dibutuhkan.
- Susunan layar (tab baru di Brand Kit untuk sales, antrean untuk penyetuju, pengajuan untuk Investment Growth Specialist).
