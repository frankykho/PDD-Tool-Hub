# Brand Kit: rancangan

Tanggal: 30 Oktober 2026 · Status: draf, menunggu persetujuan

## Maksud dan alasan

Tim, terutama cabang, sering mencari logo, template, foto, dan disclaimer resmi di chat. Akibatnya mereka memakai versi lama, mengedit desain sendiri, atau lupa disclaimer.

Brand Kit adalah tool baru di Tool Hub yang menjadi **satu tempat untuk materi resmi**:

- **Template terkunci**: cabang mengganti isian yang diizinkan (nama cabang, tanggal, tempat, narasumber, QR), lalu mengunduh PNG atau PDF. Desain, logo, dan disclaimer tidak bisa diubah.
- **File unduhan** (logo, foto, panduan) dari folder Google Drive yang diisi admin.
- **Teks disclaimer resmi** dalam beberapa versi, bisa disalin dengan satu klik, dan dipakai juga oleh Copy Studio dan Edukasi Studio.

## Tujuan

- Cabang membuat poster atau story acara yang rapi dan resmi dalam beberapa menit, tanpa Canva dan tanpa desainer.
- Satu kali isi menghasilkan semua ukuran template: digital (PNG) dan cetak (PDF + PNG).
- Poster event bisa terisi otomatis dari Event & Lead, termasuk QR pendaftaran.
- Disclaimer cukup diubah di satu tempat, lalu Brand Kit, Copy Studio, dan Edukasi Studio ikut memakai teks baru.
- Admin mengisi materi tanpa ubah kode: file lewat Google Drive, template dan disclaimer lewat layar admin.

## Bukan tujuan (saat ini)

- Editor desain bebas seperti Canva. Cabang hanya mengisi kotak yang disediakan.
- Alur persetujuan materi. Admin satu-satunya pengisi, jadi semua yang ada dianggap resmi (*keputusan pengguna*).
- Link template Canva (cara C). Bisa menyusul nanti.
- Menghapus latar foto narasumber otomatis.
- Mengunggah file unduhan lewat Brand Kit. File unduhan diisi lewat Drive.

## Yang dianggap gagal walaupun "jalan"

- Cabang bisa menghapus atau mengubah logo, disclaimer, atau bagian desain di luar kotak isian.
- Teks panjang keluar dari kotak, tertimpa, atau terpotong tanpa tanda.
- Hasil cetak pecah atau buram, atau pembuatan gambar gagal di HP.
- Copy Studio atau Edukasi Studio rusak atau kehilangan disclaimer saat Brand Kit tidak bisa dihubungi.
- Daftar event di Brand Kit menampilkan event yang tidak boleh dilihat orang itu.

## Pengguna dan hak akses

- Akses tool diberikan lewat Tool Hub → Admin → Atur akses, seperti tool lain. Entri baru di `APPS` hub, kategori Campaign & Distribution.
- **Semua pemegang akses**: melihat dan mengunduh file, memakai template, menyalin disclaimer, dan menambah narasumber.
- **Narasumber**: diubah atau dihapus oleh pembuatnya, Head (role Head di tim mana pun, dibaca dari `shared/jobs.js`), dan admin (*keputusan saya*).
- **Admin hub saja**: membuat, mengubah, dan menghapus template; mengatur disclaimer; mengatur folder Drive.

## Alur

### 1. Halaman utama

Tiga bagian (tab atau bagian berurutan, diserahkan ke pembangun):

- **Template**: kartu per template, dengan gambar contoh dan daftar ukurannya.
- **File**: kategori dari subfolder Drive, pratinjau gambar, tombol Unduh, dan pencarian nama file.
- **Disclaimer**: semua versi, masing-masing dengan tombol **Salin**.

### 2. Admin mengatur template

- Satu **template** (mis. "Seminar") punya satu atau lebih **ukuran**. Setiap ukuran punya gambar latar dan kotak isiannya sendiri.
- Ukuran yang disediakan (*keputusan pengguna: digital dan cetak*):
  - **Digital (PNG):** Story 1080×1920, Feed 1080×1350, Feed persegi 1080×1080.
  - **Cetak (PDF + PNG):** A4 dan A3 pada 300 dpi; X-banner 60×160 cm pada 100 dpi (*keputusan saya*: pada 300 dpi gambarnya terlalu besar untuk dibuat di HP, dan X-banner dilihat dari jauh).
- **File cetak** (*keputusan pengguna*): bleed 3 mm di setiap sisi, tanpa crop marks, warna RGB.
  - Ukuran piksel cetak sudah termasuk bleed, mis. A4 = 216×303 mm pada 300 dpi.
  - Admin mengekspor gambar Canva dengan bleed. Layar admin menampilkan garis potong dan zona aman (mis. 3 mm ke dalam dari garis potong), supaya kotak isian, logo, dan disclaimer tidak terlalu dekat ke tepi.
  - Ukuran halaman PDF = ukuran kertas + bleed.
- Admin mendesain di Canva, mengekspor PNG tanpa logo dan disclaimer, lalu mengunggahnya di layar admin. Bila resolusi gambar lebih kecil dari ukuran target, tool memberi peringatan.
- Jenis kotak isian, digeser dan ditarik langsung di gambar:
  - **Teks**: label untuk form, font (Google Fonts: Montserrat, Poppins, Inter, Open Sans; *keputusan saya*), tebal, ukuran, warna, rata kiri/tengah/kanan, batas huruf, wajib atau tidak, isi bawaan, dan isi otomatis (nama cabang dari akun; judul, tanggal, jam, tempat dari event).
  - **Area narasumber**: maksimal 1–6 orang, diatur per ukuran (*keputusan pengguna: maks. 6*). Tool menata sendiri: 1–3 orang satu baris, 4 = 2×2, 5 = 3 + 2, 6 = 3×2. Setiap orang tampil sebagai foto bulat, nama, dan jabatan. Font dan warna nama/jabatan diatur admin.
  - **QR** (tidak wajib; *keputusan pengguna*): berisi link pendaftaran event bila event dipilih, atau link lain yang diisi cabang.
- Elemen terkunci yang ditaruh tool, bukan bagian dari gambar Canva:
  - **Logo perusahaan** (trueFriend Korea Investment & Sekuritas Indonesia), di tengah atas (*keputusan pengguna*). Admin menentukan "latar gelap" atau "latar terang"; tool memakai `kisi-white.png` atau `kisi-color.png` dari folder `brand/`. Ukuran dan jarak dari atas diatur admin.
  - **Disclaimer**: versi dipilih per ukuran. X-banner otomatis memakai versi **Singkat** (*keputusan pengguna*). Posisi, warna, dan ukuran huruf diatur admin, tapi isinya selalu dari pengaturan disclaimer.
- Kotak yang tidak wajib dan dibiarkan kosong **tidak digambar**. Tidak ada ruang kosong berbingkai.
- Template bisa disembunyikan dari cabang (draf) sebelum siap.

### 3. Cabang mengisi dan mengunduh

- Pilih template. Opsional: pilih event dari Event & Lead. Hanya event yang boleh dilihat orang itu yang muncul.
- Form berisi gabungan kotak dari semua ukuran template. Setiap isian diketik sekali, lalu dipakai di semua ukuran.
- Nama cabang terisi dari akun (`u.branch` di Atur akses) dan masih bisa diubah.
- Narasumber dipilih dari daftar tersimpan atau ditambah baru. Foto bisa digeser dan di-zoom di dalam lingkaran. Urutan narasumber bisa diubah.
- Jumlah narasumber di form dibatasi oleh maksimum terbesar di antara ukuran template. Ukuran dengan maksimum lebih kecil memakai N orang pertama, dan pratinjau ukuran itu memberi tanda, mis. "X-banner hanya memuat 3 narasumber pertama" (*keputusan saya*).
- Pratinjau diperbarui langsung saat mengetik. Teks yang melebihi kotak diperkecil otomatis sampai batas minimum; bila tetap tidak muat, form memberi tanda di isian itu.
- Unduh per ukuran atau **Unduh semua** (ZIP, *keputusan saya*). Gambar dibuat di browser (canvas). PDF cetak dibuat di browser dengan ukuran kertas yang benar.
- Isian tidak disimpan sebagai draf di server. Browser boleh mengingat isian terakhir.

### 4. Narasumber

- Data: nama, jabatan, dan foto. Foto dipotong persegi dan dikecilkan di browser ke sekitar 600×600 JPEG sebelum disimpan di database tool (*keputusan saya*).
- Daftar dipakai bersama semua cabang dan bisa dicari.
- Pembuat, Head, dan admin bisa mengubah atau menghapus.

### 5. File dari Google Drive

- Folder Drive "Brand Kit" milik admin, dibagikan "siapa saja yang memiliki link bisa melihat".
- Setiap subfolder menjadi satu kategori. File di akar folder masuk kategori "Lainnya".
- Daftar file dibaca lewat Google Drive API dengan API key (secret `DRIVE_API_KEY`, *keputusan saya*), lalu disimpan sementara selama 10 menit. File baru muncul paling lambat 10 menit; admin punya tombol **Muat ulang**.
- ID folder diatur admin di layar admin, tanpa ubah kode.
- Pratinjau dan unduhan memakai link publik Drive. Tool tidak menyalin file.
- Bila API key belum dipasang atau Drive gagal, bagian File menampilkan pesan yang jelas. Bagian lain tetap jalan.

### 6. Disclaimer

- Versi awal: **Umum, Reksa Dana, Obligasi, Syariah, Edukasi, Singkat**.
  - **Edukasi** berisi teks penutup artikel Edukasi Studio yang dipakai sekarang.
  - **Singkat** berisi "PT Korea Investment And Sekuritas Indonesia berizin dan diawasi oleh OJK".
  - Isi Umum, Reksa Dana, Obligasi, dan Syariah diisi admin. Versi kosong tidak tampil di mana pun.
- Admin bisa mengubah isi versi apa pun. Setiap perubahan dicatat (siapa, kapan, isi lama).
- **Cara sampai ke Copy Studio dan Edukasi Studio: Brand Kit mengirim (push)** (*keputusan saya*). Content Planner sudah memanggil Copy Studio, dan Event & Lead memanggil Planner. Kalau Copy Studio memanggil Brand Kit, urutan deploy jadi berputar dan tidak bisa dipasang dari nol.
  - Setiap kali admin menyimpan disclaimer, Brand Kit mengirim semua versi ke Copy Studio dan Edukasi Studio lewat service binding (`/__hub/...` dengan `x-hub-key`). Kedua tool menyimpan salinannya sendiri.
  - Bila pengiriman gagal, admin melihat peringatan dan bisa menekan **Kirim ulang**.
  - Copy Studio dan Edukasi Studio tidak pernah bergantung pada Brand Kit saat dipakai. Sebelum pernah menerima salinan, mereka memakai teks yang sekarang.
- **Copy Studio**: tombol "+ Izin & disclaimer" menjadi menu pilihan versi yang tidak kosong. Memilih satu versi menyisipkan teks versi itu saja (*keputusan saya*). Teks izin sudah termasuk di dalam teks versi, jadi admin menulis teks lengkap. Sebelum ada salinan, tombol memakai `brand.license` + `brand.disclaimer` dari profil seperti sekarang.
- **Edukasi Studio**: teks penutup artikel adalah isi versi Edukasi apa adanya. Edukasi Studio tidak lagi menambah baris izin sendiri (*keputusan saya*). Isi awal versi Edukasi = teks bawaan sekarang ditambah baris izin dari profil bila ada. Bila versi Edukasi kosong atau belum pernah diterima, memakai teks bawaan sekarang.
- `withDisclaimer` harus tetap membuang disclaimer lama di akhir artikel walaupun admin mengubah kata-katanya. Caranya diserahkan ke pembangun (mis. mengenali isi versi Edukasi yang sekarang dan semua versi lama dari riwayat, atau menyimpan isi artikel tanpa disclaimer). Artikel tidak boleh berakhir dengan dua disclaimer.
- **Versi kosong di template** (*keputusan saya*): ukuran template yang memakai versi kosong tidak bisa ditampilkan ke cabang. Admin melihat peringatan "Disclaimer <versi> belum diisi". Disclaimer yang hilang dari gambar termasuk kegagalan.

### 7. Sambungan ke Event & Lead

- Detail event di Event & Lead mendapat tombol **Buat poster**. Tombol ini membuka Brand Kit dengan event itu sudah terpilih.
- Brand Kit meminta daftar event dan data satu event ke Event & Lead lewat service binding. Brand Kit hanya mengirim email pengguna. Event & Lead mencari role, tim, cabang, dan status admin orang itu di datanya sendiri (dari Tool Hub), lalu menerapkan `canSee` yang sama dengan halaman timnya (*keputusan saya*).
- Orang yang tidak punya akses Event & Lead tidak melihat pilihan event sama sekali. Mereka tetap bisa memakai template dengan isian manual (*keputusan saya*).
- Data yang dipakai: judul, tanggal, jam + zona waktu, tempat atau "Online", cabang, dan link pendaftaran publik. Data peserta tidak pernah dikirim.

### 8. Catatan pemakaian

- Setiap unduhan dicatat: email, cabang, template, ukuran, event (bila ada), dan waktu (*keputusan saya*). Data ini disiapkan untuk Laporan KPI nanti.
- Admin bisa melihat ringkasan sederhana: jumlah unduhan per template dan per cabang.

## Batasan teknis (mengikuti proyek yang ada)

- **Bentuk tool**:
  - Cloudflare Worker baru `apps/brand-kit` (id deploy `brand`), dengan D1 sendiri, di monorepo yang sama.
  - Gambar latar template disimpan di KV (gratis 1 GB, maks. 25 MB per file).
  - Data lain (template, kotak, narasumber, disclaimer, catatan pemakaian) disimpan di D1.
- **Urutan deploy**: service binding gagal bila worker tujuannya belum ada. Brand Kit memanggil Event & Lead, Copy Studio, dan Edukasi Studio, tetapi tidak ada tool yang memanggil Brand Kit kecuali hub. Jadi Brand Kit ditaruh setelah `event` di `scripts/deploy.mjs`, dan hub tetap paling akhir.
- **Login**: pola SSO yang sama dengan tool lain (tiket dari hub, cookie sesi, `SSO_SECRET` sama). Tampil di dalam bingkai Tool Hub.
- **Tim dan cabang**: dibaca dari Tool Hub lewat `/__hub/users`, sama seperti Event & Lead.
- **Sambungan antartool**: endpoint `/__hub/...` dengan `x-hub-key`, mengikuti pola yang ada.
- **Tampilan**: tema terang/gelap dan bahasa Inggris memakai `shared/theme.js` dan `shared/i18n.js`, dengan kamus `apps/brand-kit/i18n.js`. Nyaman di HP (target sentuh ≥44 px).
- **Library dari CDN**: hanya cdnjs dengan versi tetap, seperti Event & Lead (QR: qrcode-generator 1.4.4; PDF dan ZIP: library cdnjs pilihan pembangun).
- **Font**: Google Fonts. Font harus selesai dimuat sebelum canvas menggambar.
- **Gambar dari Drive dan KV** harus bisa digambar di canvas tanpa masalah CORS. Gambar latar dan logo disajikan dari domain Brand Kit sendiri.
- **Batas canvas di HP**: ukuran terbesar (A3 300 dpi = 3508×4961, ±17,4 MP) melewati batas canvas Safari iOS (±16,7 MP). Pembangun harus menangani ini, mis. A3 dibuat sedikit di bawah 300 dpi di perangkat yang membatasi, atau dibuat per bagian.
- **Tes**: `apps/brand-kit/test.mjs` seperti tool lain; `scripts/i18n-check.mjs` harus lolos; tes Copy Studio, Edukasi Studio, Event & Lead, dan Tool Hub tetap lolos.
- **Semua gratis**: tanpa R2, tanpa layanan berbayar.

## Cara membangun yang dipertimbangkan

- **A. Katalog link Canva**: ditolak. Paling cepat, tetapi cabang bisa mengubah apa saja, termasuk logo dan disclaimer, sehingga materi tidak lagi resmi. Elemen Canva Pro juga tidak bisa dipakai akun gratis.
- **B. Pengisi template di Brand Kit**: **dipilih pengguna.** Desain terkunci, yang berubah hanya kotak isian. Bisa terisi otomatis dari Event & Lead. Konsekuensinya: kerja lebih banyak (layar admin untuk kotak) dan font terbatas pada Google Fonts.
- **C. B ditambah link Canva per template**: ditunda. Bisa ditambah nanti bila ada kebutuhan yang tidak muat di kotak isian.
- **Penyimpanan file**: Google Drive untuk file unduhan (folder sudah dibuat pengguna, akses publik baca), KV/D1 untuk gambar template dan foto narasumber. R2 ditolak karena perlu kartu.

## Keputusan pengguna

- Template disimpan dan didesain di Canva, lalu dipakai lewat pengisi template di Brand Kit (cara B).
- Hanya admin (pengguna sendiri) yang mengisi materi; semua yang ada dianggap resmi.
- Isian yang bisa diganti cabang: nama cabang, tanggal, tempat, narasumber.
- Narasumber bisa lebih dari satu, maksimal 6 per template, dan bisa ditambah sendiri oleh cabang.
- Logo di tengah, memakai logo perusahaan.
- Ada pilihan ukuran digital dan cetak.
- QR pendaftaran Event & Lead tidak wajib.
- Disclaimer dalam beberapa versi; untuk banner hanya kalimat izin OJK.
- Copy Studio dan Edukasi Studio langsung mengambil disclaimer dari Brand Kit.
- File cetak: bleed 3 mm, tanpa crop marks, RGB.

## Diserahkan ke pembangun

- Skema D1 dan KV, susunan halaman, dan nama endpoint.
- Library PDF dan ZIP dari cdnjs.
- Cara menangani batas canvas iOS untuk A3.
- Batas ukuran unggahan gambar latar (mis. 15 MB) dan foto narasumber sebelum dikecilkan.
- Ukuran huruf minimum saat teks diperkecil otomatis.
- Tata letak area narasumber selain aturan baris di atas (jarak, ukuran foto terhadap area).
- Isi awal teks Umum, Reksa Dana, Obligasi, dan Syariah dibiarkan kosong untuk diisi admin.
