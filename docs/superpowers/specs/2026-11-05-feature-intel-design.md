# Feature Intelligence (fitur aplikasi kompetitor → report & BRD) — rancangan

## Maksud
Tim produk iKISI perlu tahu fitur apa yang diluncurkan aplikasi kompetitor, membandingkannya dengan iKISI,
memutuskan mana yang dikejar, lalu menyerahkan hasilnya ke dua pihak:
- **management**: report sesekali tentang perkembangan fitur kompetitor dan usulan yang dikejar;
- **IT**: BRD (file Word) dalam format formulir resmi **F-IT-BRD-0624-00**.

Sekarang belum ada tool yang mencatat fitur aplikasi kompetitor. Competitor Intelligence hanya mencatat promo,
Content Insight hanya mencatat konten sosmed.

## Tujuan
- Satu tool baru di Tool Hub: **Feature Intelligence** (id `feature`, folder `apps/feature-intel`, kategori Research & Intelligence).
- Kompetitor yang dipantau: **Stockbit** dan **IPOT** (Indo Premier). Admin bisa menambah atau menonaktifkan kompetitor.
- Fitur kompetitor dikumpulkan dari tiga sumber:
  1. **Instagram kompetitor**: caption postingan yang sudah diambil Content Insight (tabel `ci_content`) dibaca AI untuk mencari pengumuman fitur baru;
  2. **Catatan rilis aplikasi**: App Store (iTunes Lookup API, JSON) dan Play Store (bagian "Yang baru");
  3. **Isian manual** tim, bisa dengan screenshot.
- Temuan dari sumber otomatis masuk sebagai **Perlu verifikasi**. Tim menyetujuinya ke fitur yang sudah ada atau sebagai fitur baru, atau menolaknya.
- **Perbandingan**: tabel fitur × aplikasi (Stockbit, IPOT, iKISI) dengan status iKISI *Sudah ada / Sebagian / Belum ada*,
  keputusan *Kejar / Pantau / Abaikan*, dan prioritas H/M/L.
- **Report management (PDF)**: dibuat sesekali. Tim memilih periode, dan bisa memilih fitur mana yang dibahas.
- **BRD (.docx)**: dari satu fitur (atau beberapa yang digabung jadi satu proyek), AI menyusun draf mengikuti susunan contoh BRD.
  Tim menyunting per bagian di tool, lalu mengunduh Word untuk direvisi lebih lanjut dan ditandatangani.

## Bukan tujuan
- Tidak memantau promo (sudah ada di Competitor Intelligence) atau konten sosmed umum (sudah ada di Content Insight).
- Tidak mengambil Instagram sendiri. Tool ini hanya membaca data yang sudah dikumpulkan Content Insight.
- Tidak ada report terjadwal atau kirim otomatis ke management. Report dibuat hanya saat tombol diklik.
- Tidak ada PPT pada tahap ini (bisa ditambah nanti dengan pola PPT di Content Insight).
- Tidak ada alur persetujuan atau tanda tangan BRD di dalam tool. Itu dikerjakan di Word dan di luar tool.
- Tidak mencatat fitur yang hanya dimiliki iKISI (tabel perbandingan berangkat dari fitur kompetitor).

## Anti-tujuan (gagal walau jalan)
- BRD keluar dengan susunan atau kepala halaman yang berbeda dari formulir F-IT-BRD-0624-00, sehingga IT menolak atau tim harus menyusun ulang.
- AI mengarang fitur kompetitor yang tidak ada di sumber. Setiap fitur wajib punya bukti (link atau teks sumber).
- Isi BRD mengarang angka, nama orang, tanggal, atau nomor dokumen. Kolom-kolom itu harus dibiarkan kosong (`___`) seperti di contoh.
- Daftar "Perlu verifikasi" penuh dengan postingan promo, edukasi, atau catatan rilis "perbaikan bug" yang bukan fitur.

## Batasan
- **D1 sudah penuh (10/10).** Tool menumpang di `insight-db` (dipakai bersama Competitor Intelligence, Content Insight, Fund Insight, ETF, Planner),
  dengan semua tabel berawalan **`ft_`**. Jangan memakai nama tabel umum seperti `meta`, karena sudah dipakai tool lain.
- **AI hanya yang gratis**, lewat `shared/ai.js` (Gemini → Groq → Workers AI). Jangan memasang `ANTHROPIC_API_KEY`.
  Perlu binding `"ai": { "binding": "AI" }`, batas panggilan AI per hari lewat var (pola `CI_AI_DAILY`), dan id `feature` masuk ke `AI_APPS` di `scripts/deploy.mjs`.
- **Scan otomatis mingguan** lewat `apps/cron` (satu-satunya Cron Trigger di akun), memakai service binding seperti tool lain.
  Ini sudah diminta pengguna ("ambil otomatis") dan tidak memakai Claude. Ada juga tombol **Scan sekarang**.
- Login lewat Tool Hub (pola `HUBSSO` di Competitor Intelligence). Hak akses: **viewer** (lihat saja), **editor** (tambah, verifikasi, keputusan, BRD, report), **admin** (daftar kompetitor, scan).
- Teks tampilan dalam Bahasa Indonesia, dengan kamus EN di `apps/feature-intel/i18n.js` (pola tool lain).
- Logo hanya dari `brand/`: **iKISI "Elevate Your Investing"** (`ikisi-color.png`) untuk report; **logo KISI** (`kisi-color.png`) untuk kepala BRD karena itu formulir IT.
- Batas CPU Workers gratis. Pembuatan file (.docx dan PDF) dilakukan di browser, bukan di worker.

## Pendekatan
1. **Dipilih: tool baru terpisah di Tool Hub.** Pemakainya (tim produk) dan isinya (BRD untuk IT) berbeda dari tool promo, dan hak aksesnya ingin dipisah.
   Polanya disalin dari tool yang sudah jalan: SSO dan scan + AI dari Competitor Intelligence, laporan PDF via `window.print` dari Competitor Intelligence,
   pembuatan file di browser dari PPT Content Insight. Kekurangannya: kodenya paling banyak (halaman dan menu dibuat dari awal).
2. Menu baru di Competitor Intelligence. Kodenya paling sedikit, tapi pekerjaan produk bercampur dengan promo marketing dan hak aksesnya ikut sama. Tidak dipilih.
3. Spreadsheet + template Word tanpa tool. Tidak ada sumber otomatis dan draf AI, padahal itu inti permintaan. Tidak dipilih.

## Yang sudah diputuskan pengguna
- Tool tersendiri (pendekatan 1).
- Kompetitor: Stockbit dan IPOT.
- Sumber: otomatis (Instagram, catatan rilis aplikasi) **dan** manual.
- Hasil: report ke management (dibuat sesekali) dan BRD untuk IT berupa **file Word**.
- BRD mengikuti contoh `BRD_Pengembangan_Reksa_Dana_iKISI_v1_2_ID.pdf` (formulir F-IT-BRD-0624-00).

## Usulan saya (boleh dikoreksi)
- **Report berupa PDF** (pengguna belum memilih PDF/PPT). Isinya: ringkasan AI, fitur baru per kompetitor dalam periode,
  tabel perbandingan, dan daftar fitur yang dikejar beserta status BRD-nya.
- **Status iKISI diisi tim** per fitur, karena tidak ada sumber otomatis untuk fitur iKISI.
- **Area fitur** (untuk pengelompokan): Saham, Reksa Dana, Obligasi/SBN, Akun & Onboarding, Pembayaran/RDN, Riset & Konten, Lainnya.
- **Bukti kompetitor di BRD masuk Lampiran**, bukan bagian baru, supaya susunan formulir tidak berubah: "Lampiran E – Referensi Kompetitor"
  (kompetitor yang sudah punya, tanggal peluncuran, link bukti), ditambah satu kalimat di Ringkasan Eksekutif.
- **Versi BRD** diketik tim (bawaan "1.0 – Draft untuk direview", seperti contoh). Tidak ada riwayat versi; versi lama ada di file Word yang sudah diunduh.
- **Status BRD**: Draf / Diserahkan ke IT / Disetujui / Dibatalkan, diubah manual oleh editor. Status ini yang tampil di report.
- **Periode report memakai tanggal peluncuran.** Saat temuan disetujui, tanggal peluncuran wajib terisi. Bawaannya tanggal postingan IG,
  tanggal rilis aplikasi, atau tanggal input untuk isian manual.
- **Tool ini tidak mengubah daftar akun Content Insight.** Kalau akun IG kompetitor belum dipantau di sana, Pengaturan hanya menampilkan peringatan.
- **Nama tool** "Feature Intelligence", ikon `target` atau ikon baru yang mirip.

## Alur dan layar
1. **Temuan** (bawaan untuk editor): daftar "Perlu verifikasi" dari scan. Isinya sumber, kompetitor, tanggal, teks bukti, dan usulan AI (nama fitur, area, deskripsi).
   Aksi: *Gabung ke fitur yang ada* / *Jadikan fitur baru* / *Tolak*. Tombol **+ Tambah manual** (nama, kompetitor, area, deskripsi, tanggal, link, screenshot).
2. **Perbandingan**: tabel fitur (dikelompokkan per area) × kolom Stockbit, IPOT, iKISI. Filter area, keputusan, dan prioritas.
   Klik fitur untuk melihat detail: semua bukti per kompetitor, status iKISI, keputusan, prioritas, catatan, dan tombol **Buat BRD**.
3. **BRD**: daftar BRD (judul, fitur terkait, versi, terakhir diubah). Halaman satu BRD menampilkan bagian-bagian formulir.
   Tiap bagian bisa disunting, dan tiap bagian bisa *Tulis ulang dengan AI*. Tombol **Unduh Word**.
   Sebelum AI menyusun draf, tim mengisi arahan singkat: modul aplikasi iKISI yang terdampak, catatan/kebutuhan khusus, dan target pengguna.
4. **Report**: pilih periode (bawaan 3 bulan terakhir), centang fitur yang dibahas, buat ringkasan AI (bisa disunting), lalu **Simpan PDF**.
5. **Pengaturan** (admin): daftar kompetitor (nama, id Play Store, id App Store, akun Instagram), status scan terakhir, Scan sekarang.

## Data (semua di `insight-db`, awalan `ft_`)
- `ft_competitors`: id, nama, play_id, appstore_id, ig_account, aktif. Diisi awal dengan Stockbit dan IPOT. Id aplikasi dicek builder.
- `ft_features`: fitur kanonik. Kolom: id, nama, area, deskripsi, status_ikisi, keputusan, prioritas, catatan, dibuat/diubah oleh & kapan.
- `ft_evidence`: satu bukti per kompetitor per sumber. Kolom: id, feature_id (kosong selama belum diverifikasi), competitor_id,
  sumber (`ig` / `playstore` / `appstore` / `manual`), url, teks bukti, gambar, tanggal peluncuran, usulan AI (JSON),
  status (`Perlu verifikasi` / `Terverifikasi` / `Ditolak`), dan hash isi UNIQUE supaya scan ulang tidak membuat duplikat.
  Satu fitur dianggap "dimiliki" kompetitor kalau punya minimal satu bukti terverifikasi dari kompetitor itu.
- `ft_brds`: id, judul, feature_ids (JSON), arahan, isi per bagian (JSON), versi (teks), status, dibuat/diubah oleh & kapan.
- `ft_meta`: penanda scan, misalnya `saved_at` terakhir dari `ci_content` yang sudah dibaca (id-nya acak, jadi tidak bisa dipakai sebagai penanda)
  dan versi aplikasi terakhir per kompetitor.

## Scan otomatis (mingguan + tombol)
- **Instagram**: baca baris `ci_content` baru dari akun IG kompetitor. AI menjawab "apakah ini pengumuman fitur aplikasi? kalau ya: nama, area, deskripsi".
  Hanya yang "ya" yang masuk Temuan. Akun IG Stockbit dan IPOT sudah dipantau di Content Insight (dikonfirmasi pengguna 2026-11-05), jadi tidak ada biaya Apify tambahan.
- **App Store**: `https://itunes.apple.com/lookup?id=<id>&country=id` memberi `version`, `releaseNotes`, dan tanggal rilis.
  Catatan rilis hanya diproses kalau versinya baru, dan catatan berisi "perbaikan bug" saja dilewati.
- **Play Store**: ambil bagian "Yang baru" dari halaman aplikasi. Kalau gagal atau diblokir, sumber ini dilewati dan statusnya ditampilkan
  di Pengaturan, tanpa menggagalkan sumber lain.
- AI juga diberi daftar fitur yang sudah ada, supaya bisa mengusulkan *gabung ke fitur X* dan mencegah duplikat.

## BRD (.docx)
- **Template resmi:** `docs/superpowers/specs/assets/BRD Template.docx`. Kepala halaman (logo, "Business Requirements Document / IT Division"),
  kaki halaman (`F-IT-BRD-0624-00`, "Page X of Y"), gaya judul, dan 13 tabel kosong sudah ada di template.
  Template ini **diisi, bukan disusun ulang**. Template belum punya penanda isian, jadi builder menyalinnya ke
  `apps/feature-intel/assets/brd-template.docx` lalu menambahkan penanda tanpa mengubah gaya. Penanda bisa pola docxtemplater,
  termasuk baris tabel yang diulang untuk BR-x.y.
- **Contoh terisi:** `docs/superpowers/specs/assets/BRD_Pengembangan_Reksa_Dana_iKISI_v1_2_ID.docx`. Ini acuan isi dan gaya bahasa,
  termasuk modul Kebutuhan Bisnis, sub-bagian Data & Integrasi / Non-Fungsional, dan Lampiran. Contoh ini juga bahan *few-shot* prompt AI.
- Urutan bagian mengikuti template. Bagian yang hanya ada di contoh (Data & Integrasi, Non-Fungsional) menjadi sub-bagian di bawah Kebutuhan Bisnis seperti di contoh.
  "Definisi Metrik dan Isi Pop-up Informasi" diisi istilah/teks UI baru fitur itu, atau "Tidak ada" kalau tidak relevan.
  Lampiran ditambahkan setelah Persetujuan seperti di contoh.
- Bagian, mengikuti contoh: kotak identitas (Nama Proyek, No. Dokumen `IT-BRD-2026-___`, Versi, Tanggal, Disusun Oleh, Referensi);
  Ringkasan Eksekutif; Referensi Kompetitor (tambahan); Tujuan Proyek; Ruang Lingkup Proyek; Kebutuhan Bisnis per modul (tabel ID BR-x.y / Pri. H/M/L / Deskripsi);
  Kebutuhan Data dan Integrasi; Kebutuhan Non-Fungsional; Kebutuhan Keamanan; Pemangku Kepentingan Utama (jabatan & tugas, nama kosong);
  Kendala Proyek; Hal Tambahan yang Direkomendasikan; Jadwal (fase terisi, durasi & tanggal `___`); Open Items; Persetujuan (kosong);
  Lampiran (termasuk Lampiran E – Referensi Kompetitor).
- Bagian yang hampir baku (Keamanan, Non-Fungsional, status loading/kosong/error, Pemangku Kepentingan, fase Jadwal) disimpan sebagai **kerangka tetap**
  yang disesuaikan AI, bukan ditulis bebas.
- AI membuat isi sebagai JSON per bagian (dari fitur, bukti, status iKISI, dan arahan tim). File Word dibuat di browser dengan mengisi template.
- Tes: hasil .docx dibuka ulang (unzip) dan dicek bahwa kepala/kaki halaman dan jumlah tabel template tetap utuh dan tidak ada penanda yang tersisa.

## Report management (PDF)
- Halaman HTML siap cetak (`window.print`, pola Laporan Kompetitor). Logo iKISI, periode, tanggal dibuat.
- Isi: ringkasan (AI, disunting tim) → fitur baru per kompetitor dalam periode (dengan tanggal & link bukti) → tabel perbandingan → fitur yang dikejar
  (prioritas, status BRD) → catatan sumber data.

## Sambungan ke Tool Hub dan deploy
- `apps/tool-hub/worker.js`: entri `APPS` (id `feature`, levels viewer/editor/admin, blurb, features, `ai`, `kw`, `guide`) dan service binding.
- `apps/tool-hub/wrangler.jsonc` / `wrangler.deploy.json`: binding `FEATURE`.
- `apps/cron`: service binding `FEATURE` + satu baris jadwal di `scheduled()`. **Tidak ada Cron Trigger baru**: akun hanya memakai 1 dari 5
  (`tool-cron`, `*/5 * * * *`). Slot :05/:10/:15/:25 sudah dipakai pekerjaan berat, jadi scan mingguan memakai menit :00 hari **Minggu 01:00 UTC (08.00 WIB)**.
  Di hari Minggu menit itu kosong (Story Data dan Bond hanya jalan Senin–Jumat), dan jamnya setelah scan IG Content Insight pukul 07.00 WIB.
- `scripts/deploy.mjs`: daftar tool dan `AI_APPS`.
- `apps/tool-hub/i18n.js`: kamus EN untuk teks hub baru.

## Tes
- Tes skrip `apps/feature-intel/test.mjs` (pola `apps/competitor-intel/test.mjs`) dengan D1 tiruan yang **juga membuat tabel Competitor Intelligence dan Content Insight**,
  supaya nama tabel yang bentrok di `insight-db` ketahuan.
- Minimal: hash bukti mencegah duplikat; filter catatan rilis "perbaikan bug"; pembacaan `ci_content` hanya dari akun kompetitor dan hanya yang baru;
  hak akses (viewer tidak bisa mengubah); BRD tidak mengisi No. Dokumen, nama, dan tanggal.

## Diserahkan ke builder
- Pemilihan library pengisi template .docx di browser (mis. docxtemplater + pizzip) dari CDN yang diizinkan, dengan versi pasti.
- Bentuk prompt AI dan skema JSON-nya.
- Tata letak layar dan nama tombol, mengikuti gaya `GLASS_CSS` dan tool lain.
- Menit cron yang dipakai dan cara membagi scan supaya tetap di bawah batas CPU.
