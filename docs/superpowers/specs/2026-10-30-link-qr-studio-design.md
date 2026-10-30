# Link & QR Studio: rancangan

Tanggal: 30 Oktober 2026 · Status: draf, menunggu persetujuan

## Maksud dan alasan

Tim marketing dan cabang menaruh link dan QR di mana-mana: poster, brosur, standee, caption Instagram, iklan, broadcast WhatsApp, dan email. Saat ini tidak kelihatan materi mana yang benar-benar dibuka orang, jadi program atau kegiatan yang efektif tidak bisa dibedakan dari yang tidak.

Link & QR Studio adalah tool baru di Tool Hub untuk:

- membuat **link pendek** dan **QR** (dengan UTM otomatis) untuk sebuah kegiatan atau Program di Content Planner,
- **menghitung klik dan pindaian** setiap link,
- mengirim jumlah klik ke **Content Planner**, supaya ikut menjadi bahan evaluasi di laporan kegiatan dan Program.

## Tujuan

- Membuat link dan QR cukup beberapa langkah: pilih kegiatan atau Program, isi link tujuan, pilih kanal, lalu Buat.
- QR siap cetak (SVG) dan siap pakai digital (PNG): hijau tua dengan simbol 友 trueFriend di tengah (*keputusan pengguna*).
- Klik terlihat per link dan per kegiatan (total dan grafik harian).
- Total klik masuk otomatis ke kegiatan atau Program di Planner dan tampil di laporannya, tanpa diketik ulang.

## Bukan tujuan (saat ini)

- Membandingkan antar cabang atau antar kanal. Angka klik dipakai untuk menilai program atau kegiatan (*keputusan pengguna*). Kanal tetap dicatat per link sebagai keterangan.
- Mengganti tujuan link setelah dibuat (*keputusan pengguna: 1 QR = 1 tujuan*).
- Melacak pembukaan rekening atau transaksi di aplikasi. Yang dihitung hanya klik dan pindaian.
- Menyimpan data pribadi pengunjung (IP, perangkat, lokasi).
- Memindahkan link pelacak `/go/` lama di Content Planner. Link itu tetap jalan dan kliknya tetap dihitung di Planner (*keputusan saya*).
- Melacak QR yang dibuat Event & Lead dan Brand Kit. Bisa menyusul (*keputusan saya*).
- Domain sendiri. Mulai dengan alamat workers.dev.

## Yang dianggap gagal walaupun "jalan"

- QR yang sudah dicetak tiba-tiba membawa orang ke halaman lain, rusak, atau menampilkan halaman error.
- QR sulit dipindai dari jarak wajar, misalnya karena terlalu padat atau logonya terlalu besar.
- Angka klik membengkak oleh bot, pratinjau link WhatsApp, atau mesin pencari.
- Link bisa ditempel ke kegiatan yang tidak boleh dilihat orang itu di Planner.
- Pengalih link (redirect) bisa dipakai pihak luar untuk mengarahkan ke situs sembarang (open redirect).

## Pengguna dan hak akses

- Akses tool diberikan lewat Tool Hub → Admin → Atur akses, kategori Campaign & Distribution.
- **Membuat link:** semua pemegang akses. Kegiatan dan Program yang bisa dipilih mengikuti aturan Planner untuk orang itu (*keputusan saya*): tim regional hanya kegiatan cabang dan rencana galeri; selain itu semua jenis, termasuk Program partnership.
- **Siapa yang "regional"** ditentukan dari data tim Tool Hub (`/__hub/users`), bukan dari daftar anggota Planner. Jadi orang yang punya akses Link & QR tetapi tidak punya akses Planner tetap terkena aturan yang benar, dan tidak melihat kegiatan pusat (*keputusan saya*).
- **Melihat link dan klik:** semua pemegang akses melihat link pada kegiatan dengan jenis yang boleh mereka lihat. Kegiatan yang sudah selesai atau sudah lama tetap terlihat beserta kliknya, karena tujuannya evaluasi (*keputusan saya*).
- **Pilihan kegiatan saat membuat link:** semua kegiatan yang belum dihapus dengan jenis yang boleh, terbaru lebih dulu, bisa dicari. Tidak ada batas umur seperti di Event & Lead (*keputusan saya*).
- **Menonaktifkan link:** pembuatnya, Head (tim mana pun, dari `shared/jobs.js`), atau admin hub (*keputusan saya*).

## Alur

### 1. Membuat link

- Isian:
  - **Kegiatan atau Program** di Content Planner, **wajib** (*keputusan saya*: tujuan tool adalah evaluasi kegiatan). Dipilih dengan pencarian judul; kegiatan terbaru tampil lebih dulu.
  - **Link tujuan**, wajib. Hanya `http` atau `https`.
  - **Kanal:** Poster/cetak, Instagram, WhatsApp, Iklan, Email, Lainnya.
  - **Nama singkat** (opsional), misalnya "Poster lobby" atau "Caption IG 1".
  - **UTM otomatis**, menyala secara bawaan dan bisa dimatikan (*keputusan saya*): `utm_source` dari kanal, `utm_medium` (cetak/social/email/ads), `utm_campaign` dari judul kegiatan, `utm_content` = kode link. UTM yang sudah ada di link tujuan tidak ditimpa. Pola sama dengan `utmUrl` di Planner.
- Hasil:
  - Link pendek `https://go.<subdomain>.workers.dev/<kode>`. Kode pendek dan acak, tanpa huruf yang mirip (`0/o`, `1/l`).
  - QR yang mengarah ke link pendek itu.
- **Tujuan tidak bisa diubah setelah link dibuat** (*keputusan pengguna*). Kalau salah, buat link baru dan nonaktifkan yang lama.
- Satu kegiatan boleh punya banyak link, misalnya satu untuk poster dan satu untuk caption IG.

### 2. QR

- Hijau tua brand, latar putih, simbol 友 trueFriend (`brand/truefriend-mark.png`) kecil di tengah (*keputusan pengguna*).
- Tingkat koreksi error tinggi (H). Logo menutup sebagian kecil saja, supaya tetap mudah dipindai. Zona tenang (margin putih) cukup.
- Unduhan **PNG** (resolusi besar, untuk digital) dan **SVG** (untuk cetak, tajam di ukuran berapa pun). Tombol salin link.

### 3. Klik

- Setiap kali link dibuka atau QR dipindai, klik dihitung lalu pengunjung diarahkan ke tujuan.
- Tidak dihitung: bot, crawler, pratinjau link aplikasi chat (pola `BOT_UA` di Planner), dan permintaan selain GET.
- Yang disimpan hanya jumlah klik per link per hari. Tidak ada data pribadi.
- Di tool:
  - Daftar link dengan total klik.
  - Grafik harian per link dan per kegiatan.
  - Filter: kegiatan, link buatanku, aktif atau nonaktif.

### 4. Menonaktifkan link

- Link nonaktif tidak lagi mengarahkan ke tujuan. Pengunjung (termasuk dari QR yang sudah tercetak) melihat halaman sederhana: logo perusahaan, "Link ini sudah tidak aktif", dan tombol ke website KISI dari `profile.contact.website` (*keputusan saya*).
- Klik pada link nonaktif tidak dihitung.
- Bisa diaktifkan lagi oleh orang yang sama, dan tujuannya tetap yang lama.

### 5. Sambungan ke Content Planner

- Pilihan kegiatan dan Program diambil dari Planner lewat service binding, dengan email pengguna. Planner menerapkan aturan lihatnya sendiri.
- Jumlah klik dikirim ke Planner dan disimpan per kegiatan atau Program. Di Planner:
  - Angka "Klik link" (tampilan Performa, laporan konten, laporan Program) = klik link `/go/` lama + klik dari Link & QR Studio.
  - Kolom ini tidak diketik manual.
  - Angkanya **total sepanjang waktu per kegiatan**, sama seperti klik `/go/` lama. Laporan periode menampilkan total kegiatan yang masuk periode itu (berdasarkan tanggal kegiatan), bukan klik yang terjadi di dalam periode (*keputusan saya*: kegiatan sudah punya tanggal, dan klik `/go/` lama tidak punya tanggal sehingga tidak bisa dipecah).
- **Klik Program = gabungan** (*keputusan pengguna*): link yang ditempel langsung ke Program ditambah link di semua kegiatan yang ditautkan ke Program itu (`program_id`). Setiap link dihitung sekali saja, tidak dobel.
- **Satu tempat membuat link** (*keputusan pengguna*): tombol buat link pelacak `/go/` di Planner diganti menjadi "Buat di Link & QR Studio", yang membuka Studio dengan kegiatan itu sudah terpilih. Link `/go/` lama tetap jalan dan kliknya tetap dihitung.
- Kegiatan yang dihapus di Planner: link tetap jalan, dan di tool ditandai "Kegiatan sudah dihapus di Planner".
- Pengiriman klik tidak boleh membuat pengalihan link lambat atau gagal. Pengunjung selalu diarahkan dulu.

## Batasan teknis (mengikuti proyek yang ada)

- **Bentuk tool:**
  - Cloudflare Worker baru `apps/link-qr`, nama worker `go` (alamat publik `go.<subdomain>.workers.dev`), D1 sendiri.
  - Didaftarkan di `scripts/deploy.mjs` setelah `planner`, karena memanggil Planner lewat service binding. Hub tetap paling akhir.
  - Ditambahkan di `APPS` Tool Hub.
- **Login internal:** pola HUBSSO yang sama, `SSO_SECRET` sama, tampil di dalam bingkai Tool Hub.
- **Pengalih `/<kode>`:**
  - Publik, tanpa login, cepat, `cache-control: no-store`.
  - Hanya mengarah ke tujuan yang tersimpan, tidak pernah ke alamat dari query.
- **Tim dan cabang:** dibaca dari Tool Hub lewat `/__hub/users` (anggota, cabang, tim & role, status admin), seperti Brand Kit.
- **Alamat publik:** dibangun dari `appUrl(env, "go")`. Kalau nanti memakai domain sendiri, cukup diisi di `profile.urls`; alamat workers.dev tetap aktif dan QR lama tidak rusak.
- **Tampilan:** tema terang/gelap dan bahasa Inggris memakai `shared/theme.js` dan `shared/i18n.js`. Nyaman di HP (target sentuh ≥44 px).
- **QR:** dibuat di browser dengan qrcode-generator 1.4.4 dari cdnjs (sama dengan Event & Lead).
- **Tes:** `apps/link-qr/test.mjs`; tes Content Planner dan Tool Hub tetap lolos; `scripts/i18n-check.mjs` lolos.
- **Semua gratis.** Tanpa cron baru (5 slot cron gratis sudah terpakai).

## Cara membangun yang dipertimbangkan

- **A. Perluas Content Planner:** ditolak. Paling cepat, tetapi alamat link panjang sehingga QR lebih padat dan lebih sulit dipindai, Planner makin berat, dan tidak muncul sebagai tool sendiri.
- **B. Tool baru Link & QR Studio dengan alamat pendek:** **dipilih pengguna.** Link pendek, QR renggang, punya menu sendiri, dan pola yang sama dengan Event & Lead (pilih kegiatan dari Planner, angka dikirim ke Planner). Konsekuensinya: kerja lebih banyak, dan link `/go/` lama di Planner tetap terpisah.
- **C. Data tetap di Planner + worker pengalih kecil:** ditolak. Dua worker harus selalu sinkron, dan hasilnya tidak lebih baik dari B.

## Keputusan pengguna

- Link dan QR dipakai untuk materi cetak dan digital.
- Angka klik dipakai untuk mengevaluasi program atau kegiatan mana yang efektif, bukan untuk membandingkan cabang atau kanal.
- Link menempel ke kegiatan atau Program di Content Planner.
- 1 QR = 1 tujuan; tujuan tidak bisa diubah.
- QR hijau tua dengan logo kecil 友 di tengah; unduhan PNG dan SVG.
- Dibangun sebagai tool baru (cara B).
- Klik Program menggabungkan link Program dan link semua kegiatan di bawahnya.
- Tombol buat link `/go/` di Planner diarahkan ke Link & QR Studio.

## Diserahkan ke pembangun

- Skema D1, panjang kode link, dan susunan halaman.
- Cara angka klik masuk ke Planner: kirim (push) per klik di belakang layar, kirim berkala dengan batasan, atau Planner membaca saat dibutuhkan (pull). Syaratnya: pengalihan tetap cepat, dan angka di Planner cukup segar untuk laporan.
- Kolom penyimpan klik di Planner dan cara menggabungkannya dengan klik `/go/` lama.
- Bentuk grafik harian.
- Ukuran unduhan PNG dan persentase logo di tengah QR, asalkan tetap mudah dipindai.
