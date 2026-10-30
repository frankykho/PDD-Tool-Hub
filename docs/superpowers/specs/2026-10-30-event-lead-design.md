# Event & Lead: rancangan

Tanggal: 30 Oktober 2026 · Status: draf, menunggu persetujuan

## Maksud dan alasan

Tim regional (Sales dan GI Coordinator) rutin mengadakan seminar, gathering nasabah, dan webinar. Kegiatannya sudah tercatat di Content Planner sebagai **Kegiatan cabang**, tetapi peserta dan tindak lanjutnya tidak tercatat di mana pun.

Event & Lead adalah tool baru di Tool Hub untuk tiga hal:

- Nasabah mendaftar sendiri lewat link atau QR.
- Sales mengonfirmasi peserta.
- Kehadiran dicatat di hari acara.

Hasilnya:

- **Daftar lead** per event.
- **Angka** (pendaftar, dikonfirmasi, hadir) yang ikut muncul di laporan Content Planner.

## Tujuan

- Sales membuat event dalam beberapa langkah. Event tersambung ke kegiatan cabang di Content Planner, jadi tidak perlu diketik dua kali.
- Setiap event punya link dan QR pendaftaran publik (tanpa login).
- Sales mengonfirmasi peserta lewat WhatsApp dengan satu klik, lalu mengubah status.
- Kehadiran dicatat:
  - lewat QR absen di lokasi untuk acara tatap muka,
  - lewat link absen untuk acara online,
  - atau dicentang manual oleh Sales.
- Laporan Content Planner menampilkan jumlah pendaftar, dikonfirmasi, dan hadir untuk kegiatan yang tersambung.

## Bukan tujuan (saat ini)

- Pesan otomatis ke nasabah (email atau WhatsApp). Keputusan pengguna: tidak perlu sekarang.
- Pembayaran, tiket, atau nomor kursi.
- Mencocokkan kode nasabah ke sistem inti KISI. Kode nasabah hanya dicatat apa adanya.
- CRM penuh di luar event (pipeline penjualan, pembelian produk).
- Menggantikan Content Planner. Sales tetap bebas mencatat kegiatan di Planner tanpa Event & Lead, karena tidak semua kegiatan butuh pendaftaran.

## Yang dianggap gagal walaupun "jalan"

- Data peserta bisa dilihat orang yang tidak berhak, atau halaman publik membocorkan data peserta lain.
- Form daftar panjang atau berbelit, sehingga nasabah malas mendaftar.
- Sales harus mengetik ulang kegiatan yang sudah ada di Planner.
- Antrean panjang di meja registrasi karena absen lambat.

## Pengguna dan hak akses

Sama dengan pola Content Planner sekarang.

**Akses ke tool**
- Diberikan lewat Tool Hub → Admin → Atur akses, seperti tool lain (entri baru di daftar `APPS` Tool Hub, kategori Campaign & Distribution).

**Yang bisa dilihat dan diurus**
- **Sales dan GI Coordinator** (role di tim regional): event di cabang atau galerinya sendiri. Cabang orang diambil dari pengaturan Atur akses (`u.branch`).
- **Head tim regional**: semua event di semua regional.
- **Admin hub**: semua event.
- **Pemegang akses yang bukan anggota tim regional** (mis. tim Product Development yang mengadakan webinar): hanya event yang ia buat sendiri. Head timnya dan admin juga bisa melihat. *Keputusan saya.*
- Data peserta dan ekspor Excel hanya untuk orang yang bisa melihat event tersebut.

## Alur

### 1. Membuat event

- Sales memilih **kegiatan yang sudah ada** di Content Planner, atau **membuat baru**.
  - Kegiatan yang bisa dipilih: jenis Kegiatan cabang di cabangnya, yang belum selesai atau batal.
  - Kalau membuat baru, kegiatan otomatis tercatat di Planner sebagai Kegiatan cabang, lewat endpoint `/__hub/item` yang sudah ada.
  - Pembuat yang **bukan anggota tim regional** (tanpa cabang) menyambungkan event ke kegiatan jenis **Edukasi / narasumber** (mis. kanal Webinar), bukan Kegiatan cabang. *Keputusan saya.*
- Sambungan event dengan kegiatan Planner (*keputusan saya*):
  - Judul, tanggal, atau cabang event diubah: kegiatan Planner ikut diperbarui.
  - Event dibatalkan: kegiatan Planner jadi berstatus batal.
  - Kegiatan Planner dihapus lebih dulu: event tetap ada, sambungannya putus, dan ini ditandai di halaman event.
  - Planner sekarang hanya bisa membuat kegiatan lewat `/__hub/item` (tanpa ubah atau hapus), jadi perlu endpoint baru.
- Isian event:
  - judul,
  - jenis: **tatap muka** atau **online**,
  - tanggal, jam mulai, jam selesai,
  - lokasi (tatap muka) atau link acara (online; tidak ditampilkan di halaman publik sebelum peserta mendaftar),
  - cabang atau galeri,
  - deskripsi singkat,
  - kuota (opsional),
  - pendaftaran dibuka/ditutup.
  - Judul, tanggal, dan cabang terisi dari kegiatan Planner kalau dipilih.
- Setelah disimpan, tool menampilkan:
  - **link dan QR pendaftaran**, yang bisa diunduh sebagai PNG untuk poster atau story,
  - **link dan QR absen**.

### 2. Nasabah mendaftar (halaman publik)

- Alamatnya `/<kode>`. Kode acak dan tidak bisa ditebak, minimal 8 karakter.
- Isi halaman:
  - judul, tanggal, jam, dan lokasi (atau "online"),
  - deskripsi,
  - logo brand dari `profile.json`.
- Isian:
  - **nama**,
  - **nomor HP (WhatsApp)**, dinormalkan ke format 62…,
  - **email**,
  - **sudah nasabah KISI?** (ya/tidak),
  - **kode nasabah**: muncul dan wajib hanya kalau "ya",
  - **centang persetujuan data pribadi**: wajib, teksnya menjelaskan untuk apa data dipakai.
- Setelah kirim:
  - Muncul halaman "Terima kasih" berisi ringkasan acara.
  - Untuk acara online, link acara ditampilkan di halaman ini, dan ikut di teks WhatsApp konfirmasi. *Keputusan pengguna.*
- Nomor HP yang sama di event yang sama memperbarui data lama, tidak membuat peserta ganda.
- Kuota penuh, atau pendaftaran ditutup: tampil pesan yang jelas, form tidak muncul.
- Penahan spam:
  - kolom jebakan (honeypot),
  - batas jumlah kirim per IP per jam,
  - tolak kiriman yang terlalu cepat setelah halaman dibuka.
  - Cloudflare Turnstile bisa ditambah nanti kalau spam tetap masuk.
- Persetujuan data pribadi disimpan bersama waktu persetujuan dan versi teksnya.

### 3. Konfirmasi oleh Sales

- Daftar peserta per event, bisa disaring per status dan dicari.
- Status peserta:
  - **Terdaftar**: awal, setelah daftar,
  - **Dikonfirmasi**,
  - **Hadir**,
  - **Batal**,
  - **Tidak bisa dihubungi**.
- Setiap baris punya tombol **WhatsApp**:
  - Membuka `wa.me/<nomor>` dengan teks konfirmasi yang sudah terisi (nama peserta, nama acara, tanggal, jam, tempat).
  - Template teks bisa diubah per event, dan masih bisa diedit di WhatsApp sebelum dikirim.
- Setiap perubahan status mencatat siapa yang mengubah dan kapan.
- Sales bisa menambah peserta manual, misalnya nasabah yang mendaftar lewat telepon.

### 4. Absen di hari acara

- **Tatap muka**: QR absen dipasang di meja registrasi.
  - Peserta scan lalu mengetik nomor HP. Kalau terdaftar, statusnya langsung jadi **Hadir** dan muncul pesan "Kehadiran tercatat", **tanpa nama**, supaya orang lain tidak bisa mengecek siapa yang terdaftar. *Keputusan saya.*
  - Kalau nomor tidak terdaftar (walk-in), muncul form singkat yang sama dengan form daftar. Peserta tercatat **Hadir** dengan tanda *walk-in*.
- **Online**: link absen dibagikan saat acara, alurnya sama.
- **Manual**: Sales mencentang Hadir di daftar peserta dari HP.
- Absen hanya bisa dipakai pada jendela waktu acara. Usulan saya: 1 jam sebelum mulai sampai 2 jam setelah selesai. Di luar jendela itu muncul pesan "absen belum/sudah ditutup".
- Halaman absen tidak pernah menampilkan data peserta lain. Setelah mengetik nomor, peserta hanya melihat namanya sendiri.

### 5. Laporan dan sambungan ke Content Planner

- **Di Event & Lead**:
  - ringkasan per event (pendaftar, dikonfirmasi, hadir, walk-in, sudah/belum nasabah),
  - ekspor Excel daftar peserta.
- **Di Content Planner** (*keputusan pengguna*):
  - Kegiatan yang tersambung ke event mendapat kolom hasil yang **terisi otomatis**:
    - Hadir → **Peserta** (`result_num`),
    - Pendaftar → **Leads**.
  - Kedua kolom itu **dikunci** di Planner (tidak bisa diketik manual) selama kegiatan tersambung ke event, supaya tidak dobel.
  - Kolom hasil lain (rekening, AUM, dll.) tetap diisi manual seperti sekarang.
  - Kegiatan tanpa event tetap diisi manual seperti biasa.
  - Laporan Kegiatan tim dan Monthly Report sekarang hanya menjumlah kegiatan berstatus **selesai**. Aturan ini tetap: angka event ikut terhitung setelah kegiatannya ditandai selesai.
  - Angka dikirim Event & Lead setiap kali berubah, atau dibaca Planner saat laporan dibuat; pilihan cara diserahkan ke pembangun (lihat di bawah).

### 6. Penyimpanan dan penghapusan data pribadi (*keputusan pengguna*)

- Data peserta disimpan **12 bulan setelah tanggal acara**, lalu dihapus otomatis.
  - Angka ringkasan event (pendaftar, dikonfirmasi, hadir) tetap disimpan.
  - Hanya data pribadinya yang dihapus: nama, HP, email, kode nasabah.
- **Admin dan Head** bisa menghapus satu peserta kapan saja, misalnya atas permintaan nasabah.
- Penghapusan otomatis tidak boleh memakai cron baru, karena kuota cron gratis sudah habis. Jalankan saat tool dibuka, atau numpang di cron yang sudah ada (`apps/cron`); pilihan diserahkan ke pembangun.

## Batasan teknis (mengikuti proyek yang ada)

- **Bentuk tool**:
  - Cloudflare Worker baru `apps/event-lead` dengan database D1 sendiri (mis. `event-db`), di monorepo yang sama.
  - Didaftarkan di `scripts/deploy.mjs` setelah `planner`, karena memakai Planner lewat service binding.
  - Ditambahkan di daftar `APPS` Tool Hub.
- **Login internal**:
  - Pola SSO yang sama dengan Content Planner: tiket dari `/sso` di hub, lalu cookie sesi; `SSO_SECRET` sama.
  - Halaman internal tampil di dalam bingkai Tool Hub.
- **Halaman publik** (daftar dan absen):
  - tanpa login, tidak di dalam bingkai,
  - tetap bisa dibuka langsung dari HP nasabah,
  - tidak memuat skrip internal.
- **Tampilan**:
  - Tema terang/gelap dan bahasa Inggris memakai `shared/theme.js` dan `shared/i18n.js`, dengan kamus `apps/event-lead/i18n.js`.
  - Halaman publik memakai logo **iKISI "Elevate Your Investing"** dari folder `brand/`, sebagai aset statis tool (*keputusan pengguna*). Kolom brand di `profile.json` sengaja kosong, jadi jangan bergantung padanya. Warna hijau mengikuti logo; tema terang saja.
- **Alamat halaman publik** (*keputusan pengguna dan saya*):
  - Belum ada domain sendiri.
  - Worker dinamai pendek supaya alamatnya `event.<subdomain>.workers.dev`.
  - Kalau nanti domain dibeli, misalnya lewat Cloudflare Registrar sekitar US$10 per tahun, domain itu dipasang ke worker yang sama, dan alamat workers.dev tetap aktif. Jadi QR yang sudah tercetak tidak rusak.
  - Semua link dan QR dibangun dari satu pengaturan alamat publik (`profile.urls`), supaya penggantian domain cukup di satu tempat.
- **Tim dan cabang**: daftar cabang, regional, dan tim & role dibaca dari Tool Hub, dengan pola yang sama seperti Content Planner menerimanya (`/__hub/users` dengan `branches` dan `org`). Kunci role tidak boleh dianggap tetap: hak "regional" dan "Head" dibaca dari pengaturan tim & role (`shared/jobs.js`).
- **Tes**: `apps/event-lead/test.mjs` seperti tool lain, dan `scripts/i18n-check.mjs` harus lolos.

## Cara membangun yang dipertimbangkan

- **A. Tool baru terpisah**: **dipilih pengguna.**
  - Database dan halaman publik sendiri, akses diatur sendiri, tersambung ke Planner lewat service binding.
  - Dipilih karena data pribadi nasabah tidak tercampur dengan data kerja tim, halaman publik terpisah dari tool internal, dan hak akses bisa diatur sendiri.
  - Konsekuensinya: kerja lebih banyak (database dan deploy baru).
- **B. Tab baru di Content Planner**: ditolak.
  - Paling cepat, tetapi data nasabah bercampur dengan data kerja tim, siapa pun yang bisa membuka Planner berpotensi melihat peserta, dan Planner makin berat.
- **C. Google Form**: dibuang sejak awal. Absen, status, dan sambungan ke Planner tidak bisa jalan rapi.

## Keputusan pengguna

- Nasabah mendaftar sendiri lewat link atau QR.
- Isian: nama, nomor HP WhatsApp, email, sudah nasabah atau belum, kode nasabah (kalau sudah nasabah), centang persetujuan data pribadi.
- Status: Terdaftar → Dikonfirmasi → Hadir, ditambah Batal dan Tidak bisa dihubungi.
- Absen di hari acara: QR di lokasi, form singkat untuk walk-in, centang manual oleh Sales. Untuk acara online: link absen.
- Tombol WhatsApp berisi teks konfirmasi.
- Tidak ada pesan otomatis.
- Content Planner tetap dipakai seperti biasa; Event & Lead hanya untuk acara yang butuh pendaftaran.
- Dibangun sebagai tool baru terpisah.
- Angka event mengisi kolom Peserta dan Leads di Planner secara otomatis, dan kolom itu dikunci.
- Belum ada domain; mulai dengan alamat workers.dev.
- Data pribadi disimpan 12 bulan setelah acara; Admin dan Head bisa menghapus.
- Logo iKISI "Elevate Your Investing" di halaman publik.
- Link acara online tampil di halaman Terima kasih dan di teks WhatsApp.

## Diserahkan ke pembangun

- Skema tabel D1, format kode event, dan susunan halaman internal.
- Cara angka masuk ke Planner: Event & Lead mengirim (push), atau Planner membaca saat laporan dibuat (pull). Planner perlu endpoint baru di salah satu sisi.
- Bentuk QR (dibuat di browser atau di server) dan ukuran unduhan.
- Batas spam yang tepat (jumlah per IP, jeda minimal).
- Format ekspor (XLSX atau CSV yang terbaca Excel).
- Teks bawaan template WhatsApp dan teks persetujuan data pribadi. Teks persetujuan harus bisa diganti admin tanpa ubah kode.
