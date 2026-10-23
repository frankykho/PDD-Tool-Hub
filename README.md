# Tool Hub

Kumpulan tool riset & konten investasi yang berjalan di **Cloudflare Workers paket gratis**, dengan satu pintu login (Tool Hub).

Semua nama brand, logo, link, dan sumber data diatur lewat **satu file profil** (`profile.json`) yang tidak masuk repo. Tanpa profil, semua tool tampil netral.

## Isi

| Tool | Folder | Fungsi |
|---|---|---|
| Tool Hub | `apps/tool-hub` | Login, admin, hak akses per tool, role pekerjaan opsional yang ditentukan admin (Partnership, Investment Specialist, Copywriter, Social Media Specialist, Desainer, Lainnya), lonceng notifikasi tugas, dashboard: tool per kategori, pencarian Ctrl+K, favorit per akun, garis waktu "Ritme hari ini" (pagi/siang/sore, tanda selesai per langkah), ringkasan "Hari ini" (Market Recap, Content Planner, gerak harian tidak biasa & agenda Fund Insight, promo kompetitor baru, draf Edukasi), status otomatis (cron & GitHub Actions, termasuk langkah yang gagal), halaman detail tool |
| Email Studio | `apps/email-studio` | Generator email marketing (Market Insight, Weekly Picks, promo, webinar) |
| Story Generator | `apps/story-generator` | Generator Instagram Story (Morning, Halftime, Wrap, Weekly, RD Highlights, Bond Picks) |
| Story Data | `apps/story-data` | Data pasar untuk Story Generator + pemicu workflow data |
| Market Proxy | `apps/market-proxy` | Komoditas, market breadth & sektor (dipanggil Story Data) |
| Fund Insight | `apps/fund-insight` | Data & analisis reksa dana |
| Bond Insight | `apps/bond-insight` | Data & analisis obligasi |
| ETF Insight | `apps/etf-insight` | ETF KISI (XKMS, XKID): harga vs NAB, kinerja vs indeks, risiko & kinerja per tahun, simulasi investasi, arus dana, pembanding semua ETF di BEI, halaman nasabah `/p/<KODE>`; fakta produk dari `tools.etf.facts` di profil |
| Content Planner | `apps/content-planner` | Kalender kegiatan tim: konten sosmed, artikel, edukasi/narasumber, permintaan visual ke desainer (papan Tugas desain), laporan PPT/PDF per periode & orang; Program partnership (partner, periode, tujuan, target, hasil bisnis & biaya, kegiatan terkait) dengan tugas yang dibagi Partnership ke anggota tim + tampilan Tugas, notifikasi tugas, dan laporan program PPT/PDF; Paket Mingguan: rangkuman reksa dana, obligasi, agenda pekan depan + draf caption/email; kalender momen; persetujuan caption + komentar; Performa konten (manual, CSV Meta Business Suite, bookmarklet IG, link pelacak klik); tanpa cron |
| Competitor Intel | `apps/competitor-intel` | Pantau promo investasi kompetitor |
| Content Insight | `apps/content-insight` | Galeri konten media sosial kompetitor; ide tim (semua anggota, banyak ide per konten); konsep konten orisinal dibuat AI untuk Social Media Specialist (hook, sudut beda, alur slide/naskah, caption, brief visual, catatan kepatuhan) dan satu tombol ke Content Planner (+ permintaan visual ke desainer) |
| Copy Studio | `apps/copy-studio` | Untuk Copywriter & Social Media Specialist: cek caption per platform (batas karakter, hashtag, aturan iklan produk investasi, glosarium tim), perbaikan dengan AI, variasi A/B (headline, subject, hook, CTA), push notif & banner in-app, naskah Reels/TikTok/Shorts, subtitle otomatis (.srt/.vtt, Whisper Workers AI), ubah satu gambar ke banyak ukuran, panduan gaya & glosarium |
| Edukasi Studio | `apps/edukasi-studio` | Riset artikel edukasi & tulis konten orisinal (Workers AI) |
| SATS Radar | `apps/sats` | Sinyal & screener saham (API + tampilan React) |
| Tutorial | `apps/tutorial` | Pusat tutorial aplikasi (Firebase) |
| Market Recap | `apps/market-recap` | Rangkuman IHSG sesi 1 & penutupan setiap hari bursa sebagai carousel 5 slide 1080×1080 (PNG & PDF): sampul + outlook, penggerak indeks (poin) & sektor, grafik intraday, global/rupiah/komoditas, agenda & berita. Judul tiap slide ditulis AI, disunting & diterbitkan tim; publik di `/p`; arsip |
| Market News | `apps/market-news` | Berita pilihan makro, pasar & emiten dari 7 media (RSS & halaman daftar berita), skor hype, ringkasan AI, terbit oleh tim; publik di `/p`, per berita `/n/<id>` (pratinjau WhatsApp dengan banner) |
| Cron | `apps/cron` | Satu-satunya Cron Trigger: menjadwalkan Fund, Competitor, Edukasi, Story Data, SATS, Market Recap, Market News (tanpa halaman); mencatat jalan terakhir tiap tugas di tabel `cron_runs` (insight-db) |
| PDF Generator | `jobs/pdf-generator` | PDF produk harian (GitHub Actions) |

Setiap tool adalah satu Worker di `https://<nama-tool>.<subdomain>.workers.dev`. Nama worker ada di `wrangler.jsonc` masing-masing.

## Cara kerja

```
                       Tool Hub ── login & hak akses (SSO_SECRET sama di semua tool)
                          │
  ┌──────┬───────┬────────┼────────┬──────────┬─────────┬────────┬────────┐
 Email  Story   Fund     Bond   Competitor  Content  Edukasi   SATS   Tutorial
          │       │                  │          │
          │       └──── D1 insight-db ──────────┘   (dipakai bersama)
          ├─► Story Data ──service binding──► Market Proxy
          └─► Fund Insight /api/funds (dari browser)

 GitHub Actions (repo ini):
   pdf.yml            PDF Fund & Bond → rilis "pdf" → disajikan Fund/Bond Insight di /pdf/...
   story-data.yml     data Wrap / kalender / LME → apps/story-generator/site/public → deploy ulang Story
   story-lists.yml    daftar saham & RD dari Excel → site/data → deploy ulang Story
   sats-*.yml         hitung sinyal SATS, fundamental, lab → D1 sats-db
   deploy.yml         setiap push ke main: deploy tool yang berubah
```

### Dashboard Tool Hub

- Daftar tool, kategori, ikon, dan isi halaman detail ada di satu tempat: `APPS` dan `CATEGORIES` di `apps/tool-hub/worker.js`. Tool baru cukup ditambahkan di sana.
- Tampilan ada di `apps/tool-hub/shell.html`; worker hanya menyuntikkan data pengguna (tool yang boleh dibuka, favorit).
- Beranda sengaja ringkas, hanya berisi apa yang perlu diperhatikan hari ini: baris "Tool kamu" (favorit, lalu terakhir dibuka), Ritme hari ini, kartu Reksa dana / Promo kompetitor / Tugasmu / Draf edukasi, dan kartu merah "Tugas otomatis bermasalah" (cron atau GitHub Actions yang gagal, lengkap dengan langkahnya) yang hanya muncul bila ada yang gagal. Daftar lengkap tool ada di Semua tools.
- Ringkasan "Hari ini" dibaca lewat service binding `GET /__hub/today` dengan header `x-hub-key` = `SSO_SECRET` (`shared/hubfeed.js`) dari Market Recap, Content Planner, Fund Insight, Competitor Intelligence, dan Edukasi Studio. Hanya tool yang boleh diakses pengguna yang ditanya; kartu baru cukup ditambahkan di `FEEDS` (`apps/tool-hub/worker.js`) dan `PANELS` (`shell.html`). Karena memakai service binding, hub di-deploy paling akhir.
- Ritme hari ini: langkah harian menurut jam bursa (WIB) ada di `RHYTHM` (`apps/tool-hub/worker.js`), lengkap dengan jadwal, batas wajar, dan sumber tanda selesainya (run GitHub, tarikan Fund Insight, status Market Recap). Kegiatan Content Planner hari ini yang punya jam ikut tampil dengan statusnya. Bila jadwal tool berubah, ubah juga `RHYTHM`.
- Status otomatis: jadwal cron (dibaca dari worker Cron lewat service binding; merah bila ada tugas gagal atau cron tidak jalan lebih dari 15 menit) dan GitHub Actions repo di profil (`github.repo`), termasuk nama langkah yang gagal. `GITHUB_TOKEN` hub dipakai bila ada.
- Favorit disimpan di KV hub (`pref:<email>`); riwayat "Terakhir dibuka" disimpan di browser per akun.
- Cek: `node apps/tool-hub/test.mjs`

### Role pekerjaan, tugas, dan notifikasi

- Daftar role ada di `shared/jobs.js`. Role **tidak** dipilih saat daftar; admin yang menentukannya di halaman Atur akses. Akun tanpa role adalah **user biasa**: bisa memakai tool sesuai haknya, tetapi tidak masuk daftar anggota Content Planner sehingga tidak bisa dipilih sebagai penanggung jawab atau penerima tugas. Admin hub tidak wajib punya role (admin sudah punya semua hak). `/role` sekarang hanya mengarahkan ke beranda.
- Role ikut di tiket SSO (`j`). Hub juga mengirim daftar anggota Content Planner (admin hub, ditambah akun disetujui yang punya role dan akses Planner) ke `POST /__hub/users` setiap kali akun berubah, dan sesekali saat beranda dibuka. Saat user biasa membuka Planner lewat tiket, ia tidak dicatat sebagai anggota.
- Hanya **Partnership** (dan admin hub) yang bisa membuat Program dan memberi tugas. Penerima dipilih dari daftar anggota, bukan diketik, supaya notifikasinya pasti sampai. Penerima tugas hanya bisa mengubah status & link hasil.
- Notifikasi disimpan di Content Planner (tabel `notifs`): tugas baru/diubah, status tugas berubah (ke pemberi atau penerima), ditunjuk sebagai penanggung jawab, permintaan visual, dan pengingat tenggat (besok, hari ini, lewat; dibuat saat beranda meminta ringkasan, tanpa cron). Hub menampilkannya di lonceng dan menandai dibaca lewat `POST /__hub/notif`.
- Cek: `node apps/content-planner/test.mjs`

### AI penulis & cek orisinalitas (Edukasi Studio)

- `shared/ai.js`: Claude bila secret `ANTHROPIC_API_KEY` ada → Gemini bila secret `GEMINI_API_KEY` ada (paket gratis Google AI Studio; model dicoba berurutan `GEMINI_MODELS`, bisa didahului variabel `GEMINI_MODEL`; 404/403/429 lanjut ke model berikutnya) → Workers AI. Gemini gagal semua = otomatis Workers AI. Paket gratis Gemini: input/output boleh dipakai Google untuk melatih model, jadi jangan kirim data nasabah.
- Gemini dipakai di semua tool yang memakai `shared/ai.js`: Edukasi Studio, Market Recap, Content Insight, Competitor Intelligence, Market News. Secret bersifat per worker, jadi pasang key yang sama di semuanya: `npx wrangler secret put GEMINI_API_KEY --name <edukasi-studio|market-recap|content-insight|competitor-intel|market-news>`.
- Cek kemiripan di browser: frasa 6 kata yang sama persis dengan artikel bahan **dan** artikel lain di bank. Bank dicari di server (`POST /api/similar`: 2 frasa per kalimat, `LIKE` per 30 frasa, maks. 8 artikel), lalu teksnya ikut dicek di browser. Struktur dianggap mirip bila ≥2 subjudul (dan ≥50%) hampir sama (kata ≥60% sama) dengan satu sumber.
- Draf tidak bisa disimpan selama masih ada kalimat yang sama persis; tombol "Tulis ulang kalimat yang ditandai" memperbaikinya. Cek: `node apps/edukasi-studio/test.mjs`.

### Content Insight: simpan dari profil Instagram (gratis)

- Tombol bookmark yang sama (`ciBookmark`) di halaman **profil** IG (bukan postingan) menyimpan semua postingan yang tampil di grid (maks. 60): membuka `/save?bulk=1`, lalu mengirim postingan satu per satu lewat postMessage; jendela itu memanggil `POST /api/content` per postingan (yang sudah ada = dup, dilewati).
- Detail dibaca di browser tim memakai login IG yang terbuka (`/p/<kode>/?__a=1&__d=dis`, jeda ±0,6 detik). Bila tidak tersedia, yang tersimpan cukup link, sampul grid, dan teks alt.
- Kode bookmark tertanam saat diseret ke bookmark bar, jadi perubahan `ciBookmark` butuh pasang ulang. Kunci `ci_bm_hide2` memunculkan lagi kartu cara pasang untuk semua orang.

### Content Insight: pantau Instagram otomatis (Apify)

- Secret `APIFY_TOKEN` di worker `content-insight` (akun Apify paket Free: kredit US$5/bulan, tanpa kartu). Tanpa secret, fitur ini mati dan tidak ada yang berubah.
- Akun yang dipantau = `ci_accounts` dengan `watch=1` (diatur Editor/admin di kotak "Pantau Instagram otomatis"). Actor `apify/instagram-post-scraper`, `basicData`, `skipPinnedPosts`.
- Hanya postingan baru: akun baru → 12 postingan terakhir; akun lama → `onlyPostsNewerThan` = postingan terbaru yang pernah diambil + 1 detik (`ci_accounts.ig_seen`). URL yang sudah ada dilewati. Biaya Apify per postingan (±US$0,0017), jadi scan tanpa postingan baru ≈ gratis.
- Jadwal: apps/cron memanggil tiap 5 menit; 07.00 WIB memulai scan harian (sekali sehari), selain itu hanya melanjutkan scan yang berjalan. Hasil disimpan bertahap 6 postingan per langkah (batas CPU paket gratis). Tombol "Ambil postingan baru" jeda 30 menit sejak scan terakhir.
- Pengaman kuota: scan tidak dimulai bila pemakaian Apify bulan ini ≥ US$4,50 (`/users/me/limits`); tiap scan dibatasi `maxTotalChargeUsd=0.5`. Riwayat scan di tabel `ci_ig_runs`.
- Catatan: scraping melanggar ketentuan Instagram (dijalankan Apify, bukan akun KISI). Like/komentar tidak diperbarui setelah tersimpan.

### Content Insight: ide & konsep otomatis

- Semua yang bisa membuka Content Insight (termasuk akses lihat saja) boleh menambah ide pada konten kompetitor (tabel `ci_ideas`). Kolom ide lama dipindah otomatis jadi ide pertama.
- Social Media Specialist (role `sosmed`) & admin memilih ide yang dipakai, lalu AI menulis konsep baru (tabel `ci_concepts`). AI: Claude bila secret `ANTHROPIC_API_KEY` dipasang di Content Insight, selain itu Workers AI (binding `AI`). Konsep yang terlalu mirip caption kompetitor (rangkaian 4 kata yang sama > 20%) ditulis ulang sekali.
- "Masukkan ke Content Planner" membuat kegiatan konten berstatus Ide lewat service binding `PLANNER` (`POST /__hub/item`), opsional dengan permintaan visual ke desainer (desainer dapat notifikasi). Konten kompetitornya ditandai sudah dipakai. Karena itu Content Insight di-deploy setelah Content Planner.
- Cek: `node apps/content-insight/test.mjs`

### Fund Insight: halaman untuk nasabah

- Semua tanpa login. `/p/<id>` = halaman produk. Halaman ini (juga tampilan internal) punya kartu **Seandainya rutin investasi** (setoran bulanan 1/3/5 tahun terakhir vs deposito, memakai `simulate()` Simulator) dan **Berapa lama sebaiknya disimpan** (persen periode bergulir 3 bulan–5 tahun yang berakhir untung, dari NAB akhir bulan).
- `/profil` = kuis profil risiko 6 pertanyaan. Hasilnya profil (konservatif/moderat/agresif), contoh pembagian dana (`QZ_ALLOC`), dan 2 produk per kelompok yang risikonya sesuai `PROF`. Kelompok tanpa produk yang sesuai dibagi ke kelompok lain. Link kuis ada di Panduan.
- `/r/<kode>` = proposal dari sales. Di Bandingkan, tombol **Kirim ke nasabah** (perlu login) menyimpan produk pilihan, nama, tujuan, dan catatan ke `meta` (`prop:<kode>`). Nasabah melihat perbandingan dengan data terbaru.
- Cek: `node apps/fund-insight/test.mjs`

### Tutorial: masukan, asisten, konten

- Worker tutorial sekarang punya D1 `tutorial-db` dan binding AI (tanpa aturan Firestore baru): `POST /api/view` (hitung dibuka per topik), `POST /api/fb` (**Membantu? Ya/Tidak** di langkah terakhir, + catatan bila tidak), `GET /api/faq`, `POST /api/ask` (**Tanya asisten**: browser memilih ≤ 4 tutorial yang cocok, AI menjawab hanya dari isinya dan menautkan topiknya; batas 15 pertanyaan/pengunjung/hari dan `TUTOR_AI_DAILY` per hari). Pengunjung hanya disimpan sebagai hash (IP + tanggal + SSO_SECRET), dihapus setelah 2 hari.
- Admin (`admin.html`): bagian **Statistik, Masukan & FAQ** (paling sering dibuka, dinilai kurang membantu, masukan, pertanyaan yang belum ada tutorialnya) dan editor FAQ. Endpoint admin memakai izin 8 jam dari Tool Hub (header `x-hub-admin`, HMAC SSO_SECRET yang sama dengan `/gh`), jadi secret `SSO_SECRET` juga harus terpasang di worker `tutorial`.
- `site/annotate.js`: **editor anotasi screenshot** (kotak, panah, nomor langkah, sensor kotak-kotak untuk data pribadi) sebelum gambar dikecilkan, di form usulan dan saat admin mengganti gambar.
- Halaman tutorial: tombol **Buka aplikasi** (App Store/Play sesuai perangkat, atau `app.download`), dan di dalam Tool Hub tombol **Konten**: carousel 4:5 / story 9:16 PNG (sampul + tiap langkah + penutup) dan teks WhatsApp bernomor. Semua fitur baru disembunyikan di file offline hasil Export HTML.
- Cek: `node apps/tutorial/test.mjs`

### Partnership & Product Marketing

- Fund Insight tab **Manajer Investasi**: pilih MI → produk yang kita jual (rating, return, peringkat return 1 tahun di jenisnya se-pasar dengan dana kelolaan ≥ Rp 10 M), produk MI yang belum dijual, komposisi produk MI di pasar, pangsa dana kelolaan; tombol Salin ringkasan (email/rapat) dan PDF.
- Copy Studio tab **Paket Produk**: pilih reksa dana / obligasi / ETF (data `GET /api/products` dari Fund, Bond, ETF Insight lewat service binding, cache 10 menit), mode peluncuran atau **co-marketing dengan MI**; AI menulis headline, caption feed, frame story, WhatsApp, email (subject/preheader/isi), push notif, FAQ untuk CS, brief visual, dan catatan compliance hanya dari fakta produk. Tiap teks dicek `shared/compliance.js`.
- Competitor Intelligence: kategori **Derivatif/SW** (waran terstruktur, derivatif, futures). `GET /__hub/benchmark?from=&to=&cat=` dipakai laporan program Content Planner (service binding `COMPETITOR`): tabel **Benchmark promo reksa dana kompetitor** di PDF & PPT laporan program.
- SATS menu **Waran**: kalkulator waran terstruktur (call, gaya Eropa, tunai): status ITM/ATM/OTM, titik impas, premium, gearing, nilai intrinsik & waktu, sisa hari, skenario nilai saat jatuh tempo; harga saham induk otomatis dari data SATS (`#/waran?u=KODE`, link dari halaman saham). Hitungan di `frontend/src/warrant.ts`, cek `npx tsx src/test-warrant.ts`.
- SATS Radar: tombol **Bahan konten edukasi** menyalin 5 hasil teratas beserta alasannya dalam bahasa informasi + disclaimer, untuk ditulis ulang di Copy Studio.

### Syariah

- `shared/sharia.js`: daftar saham syariah dari anggota indeks **ISSI** (semua saham syariah tercatat, mengikuti Daftar Efek Syariah OJK), **JII70**, dan **JII** lewat scanner TradingView (`groups: index`), gratis tanpa akun, cache Cloudflare 12 jam. Tidak perlu unggah daftar DES.
- SATS: `/api/sharia`; opsi indeks "Syariah" (ISSI / JII70 / JII) di Screener & Radar, label di daftar dan halaman saham, serta kartu "Syariah" di Fundamental: status anggota indeks + indikasi rasio (utang ÷ aset ≤ 45% dari batas atas DER ÷ (1 + DER); pendapatan non-halal tidak tersedia dari data gratis; catatan usaha berbasis bunga). Indikasi, bukan penetapan syariah.
- Market News: label "Syariah" di kode saham (halaman tim & publik).
- Fund Insight: penanda syariah dari kategori Bareksa (`category.id` 1 = Syariah; cadangan tebakan nama), tab **Syariah** (RD syariah yang dijual per jenis, pangsa syariah di pasar, syariah terbaik yang belum dijual), filter syariah di Semua RD.
- Bond Insight: chip **Sukuk Ritel (SR/ST)** di Katalog. ETF Insight: pembanding indeks JII, ISSI, IHSG dan daftar ETF syariah di BEI.
- Content Planner: momen Ramadan/THR/Idul Fitri/Idul Adha/Tahun Baru Islam dengan ide syariah; Paket Mingguan punya mode **🕌 Syariah** (RD syariah + sukuk, caption & email bertema syariah).

### ETF Insight: ops

- **Perkiraan iNAV** = NAB terakhir × pergerakan indeks berjalan sejak tanggal NAB (XKID: IDX30; XKMS: LQ45 sebagai pendekatan MSCI Indonesia) dan premium/diskon harga terhadapnya.
- **Tracking error** 1 & 3 tahun = deviasi standar selisih return bulanan NAB − indeks × √12 (indeks: IDX30 dari Yahoo `IDX30.JK`; MSCI Indonesia dari EIDO × kurs).
- **Kalender ops** 120 hari (perkiraan): review MSCI (Feb/Mei/Agu/Nov), evaluasi IDX30 (mayor Jan & Jul, minor Apr & Okt), perkiraan dividen dari riwayat Yahoo, fund fact sheet & laporan bulanan.
- **Peringatan**: NAB terlambat > 2 hari bursa, premium/diskon ≥ 1%, harga vs iNAV ≥ 1%, ≥ 5/20 hari tanpa transaksi, selisih NAB vs indeks 1 bulan ≥ 1 poin, tracking error > 2%, penebusan > 10% AUM. Tampil di halaman, kartu "Ops ETF" di beranda Tool Hub (`/__hub/today`, binding `ETF`), dan lonceng untuk role **Ops ETF & Fund** & admin (bersama gerak harian tidak biasa dan NAB tertinggal dari Fund Insight).
- Halaman nasabah `/p/<KODE>`: tombol Bagikan ke WhatsApp, salin link, dan QR (unduh aplikasi bila `app.download` diisi).
- Role baru di `shared/jobs.js`: Product Marketing, Ops ETF & Fund, Syariah.
- Cek: `node apps/etf-insight/test.mjs`

### Content Planner: momen, persetujuan, performa

- **Kalender momen** (`shared/moments.js`, tanpa sumber luar): hari nasional, hari besar (Paskah dihitung; hari besar Islam dari kalender Hijriah tabular = perkiraan ±1 hari; Imlek/Nyepi/Waisak dari tabel), momen keuangan & pasar modal (batas laporan keuangan, musim dividen, Bulan Inklusi Keuangan, Hari Menabung), Harbolnas, dan tanggal gajian. Ramadan, THR, Idul Fitri, Idul Adha, dan Tahun Baru Islam diberi ide konten syariah. Momen tim (masa penawaran SBN, HUT perusahaan) disimpan di tabel `moments`. Tampil di sel kalender dan panel "✨ Momen"; "+ Kegiatan" membuat kegiatan berisi idenya.
- **Persetujuan** (konten & artikel): kolom Caption/naskah final dicek `shared/compliance.js` (glosarium dari Copy Studio lewat service binding `COPY`). Bila ada Penyetuju, status Review = minta persetujuan (notifikasi), penyetuju menyetujui (wajib centang cek kepatuhan) atau meminta revisi (wajib catatan, status kembali Draf). Terbit hanya bila sudah disetujui; caption/judul yang diubah setelah disetujui kembali menunggu. Komentar & riwayat di tabel `comments`. Tampilan Tugas punya kolom "Menunggu persetujuanmu".
- **Performa** (tampilan 📈 Performa): angka per konten (views, jangkauan, suka, komentar, simpan, bagikan, pengikut baru) diisi manual, dari CSV Meta Business Suite (`/api/metrics/import`, dicocokkan lewat link postingan; bisa membuat kegiatan untuk postingan yang belum ada), atau dari tombol bookmark "Angka IG ke Planner" (angka publik dibaca di browser yang login IG, jendela `/ig-sync` menyimpan setelah tim menekan Simpan). Link pelacak `/go/<kode>` (publik) menghitung klik di tabel `links`, dengan UTM otomatis; pratinjau aplikasi chat & bot tidak dihitung. Angka hasil di laporan konten sosmed = jangkauan (atau views).

### Copy Studio & cek kepatuhan bersama

- `shared/compliance.js`: satu aturan cek teks pemasaran untuk semua tool, dipakai di server (`checkCopy`) dan browser (`complianceScript()` -> `window.Compliance.check`). Menandai janji untung / tanpa risiko dan ajakan beli-jual saham tertentu / target harga (harus diperbaiki); superlatif, bahasa mendesak, angka kinerja tanpa "kinerja masa lalu…", promo tanpa "S&K berlaku", dan teks panjang tanpa keterangan OJK (periksa); produk investasi tanpa pengingat risiko (saran). Batas karakter & hashtag per platform ada di `PLATFORMS`. Kode produk sendiri (ETF di `tools.etf.facts` dan `tools.copy.allow` di profil) boleh disebut bersama "beli".
- Panduan gaya & glosarium disimpan di D1 `copy-db` (tabel `meta`), diubah Editor/admin, dan ikut di semua prompt AI Copy Studio. Tool lain bisa membacanya lewat `GET /__hub/style` (header `x-hub-key`).
- AI lewat `shared/ai.js` (Gemini gratis bila `GEMINI_API_KEY` dipasang di `copy-studio`, selain itu Workers AI). Batas per hari: `COPY_AI_DAILY` (bawaan 60).
- Subtitle: browser mengubah suara video/audio menjadi WAV 16 kHz mono, memotongnya per ±20 detik di jeda paling sunyi, lalu tiap potongan ditulis `@cf/openai/whisper-large-v3-turbo`. Batas: `COPY_STT_DAILY` potongan per hari (bawaan 360 ≈ 2 jam audio). Ubah ukuran gambar sepenuhnya di browser.
- Cek: `node apps/copy-studio/test.mjs`
### Competitor Intelligence: input manual

- Promo yang tidak terbaca scan diisi tim. Ada tiga cara: **+ Tambah manual**; **+ Isi promo** di baris sumber yang Gagal atau Manual (kompetitor, jenis, dan URL sudah terisi); dan **Lengkapi** (form yang hanya berisi field yang belum terbaca, dari kartu Kelengkapan detail, kartu daftar, atau dialog Export PDF). Field yang memang tidak ada diisi "Tidak ada" supaya tidak dihitung kurang.
- Promo tanpa link publik (aplikasi, Instagram, brosur) boleh tanpa URL asalkan ada gambar unggahan sebagai bukti. Keterangan sumbernya disimpan di `source_note` dan tampil di detail serta PDF.
- KPI dan filter "Belum lengkap" menunjukkan promo yang masih perlu dilengkapi. Sebelum Export PDF, dialog menyebut promo yang belum lengkap.
- Empat isian wajib tiap promo (`ciRequired`): periode program (`start_date`–`end_date`, sampai akhir holding; kosong = sama dengan periode transaksi), periode transaksi (`trx_start`–`trx_end`, harus di dalam periode program), holding period / masa penilaian, dan minimal satu butir S&K ("Tidak ada" bila memang tidak ada). Server menolak simpan dari form dan "Tandai terverifikasi" bila belum lengkap; hasil scan boleh tersimpan belum lengkap sebagai "Perlu verifikasi". Promo lama: tanggal promo yang tercatat disalin ke periode transaksi.
- Siapa yang boleh ikut, kuota, mekanisme (teks & tabel tier), cara ikut, dan pengecualian tidak lagi punya isian sendiri: ditulis sebagai butir S&K berlabel (`ciFoldTerms`, mis. "Kuota: 16 voucher"). Data lama dan hasil scan dipindah otomatis; kolomnya tetap ada di tabel tapi selalu kosong.
- Cek: `node apps/competitor-intel/test.mjs`

### Market News

- Sumber (`apps/market-news/news.js` `SOURCES`): RSS CNBC Indonesia (market & news), Kontan, IDX Channel, Bloomberg Technoz; halaman daftar berita Bisnis.com (market & ekonomi), EmitenNews, Investor Daily (market & makro; artikel PREMIUM dilewati). Bloomberg Technoz & Investor Daily memakai proteksi CloudFront dan kadang menolak (403); status tiap sumber tampil di halaman tim.
- Cron :20/:50 UTC setiap hari (05.00–23.00 WIB): 3 sumber per jalan bergiliran (batas CPU), data pasar TradingView pada jam bursa (`mn_meta` `mkt`: % per kode, breadth, top gainer dengan nilai >= Rp1 M & harga >= 50, top value), hitung ulang skor 48 jam, lalu ringkas maks. 2 berita teratas (skor >= 8) dengan AI. Batas AI per hari: var `NEWS_AI_DAILY` (bawaan 40).
- Klasifikasi: emiten (kode saham terdaftar / aksi korporasi), makro (BI-Rate, The Fed, inflasi, PDB, kredit, neraca dagang, cadangan devisa, PMI, APBN), pasar (IHSG, asing, sektor, komoditas, rupiah). Rekomendasi/target harga analis, video, dan kripto tidak dipantau. Skor hype = media berbeda dalam 24 jam (kelompok per kode saham atau tema) + aksi korporasi + rilis data/keputusan makro + saham ikut naik + kebaruan.
- AI membaca artikel (gambar og:image untuk banner, paragraf isi tanpa biodata penulis) dan menulis judul, ringkasan 2–3 kalimat, "mengapa penting", kategori, dan kode saham; kalimat bernada rekomendasi dibuang. Bukan berita pasar -> diabaikan otomatis.
- Ringkasan pasar: IHSG, sektor, penggerak (poin), dan komoditas dibaca dari tabel `recaps` Market Recap (binding `RECAP_DB` ke recap-db, hanya baca); komoditas yang bergerak >= 2% disorot bersama emiten sektornya.
- Gambar berita lewat `/img/<id>` (hotlink media sering diblokir; di-cache 1 hari). Halaman publik mencantumkan media sumber, link artikel asli, dan disclaimer profil.
- **Laporan keuangan emiten**: berita kinerja (laba/pendapatan/kuartal/semester + kode saham) masuk antrean `fin_state`; AI (`FIN_RULES`, suhu 0.1) mengambil kode, periode (`Q1–Q4`, `H1`, `9M`, `FY`), pendapatan & laba bersih (miliar rupiah / juta USD), angka tahun lalu, YoY, dan penyebab. Proyeksi/target analis tidak dihitung. Satu baris per emiten & periode (`mn_fin`); berita emiten yang sama dalam 3 hari cukup jadi sumber tambahan (tanpa AI). Tab **Laporan Keuangan** (salin / WhatsApp), kartu "Laporan keuangan emiten" di beranda Tool Hub (`/__hub/today`, binding `NEWS`).
- Notifikasi laporan baru: Telegram (secret `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`) dan/atau webhook (`NOTIFY_WEBHOOK`, POST `{text, content}`, mis. gateway WhatsApp). Tanpa saluran, laporan tetap ditandai terkirim supaya tidak membanjiri saat saluran dipasang.
- Cek: `node apps/market-news/test.mjs`

### Competitor Intelligence: AI perapi promo

- Otomatis: promo baru hasil scan (dan promo yang teks halamannya berubah) masuk antrean `ai_state='pending'`. Cron (:10/:40) merapikan 2 promo per putaran lewat `shared/ai.js` (Workers AI gratis; Claude bila secret `ANTHROPIC_API_KEY` ada): periode program & transaksi, holding, min. transaksi, benefit per poin, produk, MI (dicocokkan ke daftar MI data pasar), dan S&K per poin. Promo yang dinilai bukan promo ditandai "Tidak relevan" (tercatat di riwayat). Promo yang sudah dicek tim (Aktif / terverifikasi / tidak relevan) tidak disentuh. Scan ulang dengan teks halaman yang sama tidak menimpa hasil AI.
- Manual (hanya mengisi form, tim mengecek lalu Simpan): **Rapikan dengan AI** di detail / **Isi dengan AI dari teks sumber** di form (arsip teks halaman), dan **Isi dengan Claude**: perintah disalin ke claude.ai (akun Claude Pro tim, bisa dengan screenshot/banner promo), jawaban JSON-nya ditempel balik.
- Isian laporan per promo (diisi AI, bisa diedit di form): ringkasan satu kalimat, reward maks., lock-in, `min_rp` & `reward_rp` (angka untuk grafik benchmark), cara kerja (baris "Judul: keterangan"), komponen program (baris "a | b | c"), serta draf "Mengapa penting?" & "Apa yang bisa dilakukan …?" (catatan tim yang sudah ada tidak ditimpa antrean). Tombol **Buat draf catatan dengan AI** di detail menulis kedua catatan dari isian promo (tanpa perlu teks halaman).
- **Pengaturan laporan** (`meta` k=`ci_report`): nama perusahaan, singkatan, divisi, logo, dan konteks perusahaan untuk AI (produk, MI satu grup, program yang sudah jalan). Nama/singkatan kosong = dari profil.
- **Export PDF → Laporan lengkap** (A4 landscape, gaya slide): cover, ringkasan (KPI + tabel status Berjalan/Masa tahan), timeline periode pembelian & holding, 1 halaman per promo, benchmark reward ÷ minimum & bulan holding, lalu bagian analisis lintas promo yang dibuat AI di dialog (pola, ide program, rekomendasi, langkah berikutnya, keputusan; bisa diedit, bagian kosong tidak dicetak) dan daftar sumber. Tata letak "Ringkas" (A4 tegak) tetap ada.
- Batas panggilan AI per hari: var `CI_AI_DAILY` (bawaan 30) supaya kuota Workers AI gratis tersisa untuk tool lain. Promo lama yang masih "Perlu verifikasi" ikut antre sekali saat migrasi.

### SATS: Opportunity Radar

- Menu **Radar** (`#/radar`) memakai data `/api/screener` yang sama dengan Screener, tanpa tabel atau API baru. Setiap saham diberi skor 0–100 dari empat pilar: momentum, breakout, volume, dan likuiditas. Skor dikurangi bila ada peringatan (RSI ≥ 80, terlalu jauh dari MA50, ledakan volume, death cross, candle bearish, rugi, tidak likuid).
- Setiap poin berasal dari alasan yang ditampilkan. Aturan skornya ada di `frontend/src/radar/score.ts`; fokus (bobot pilar), skor minimal, likuiditas, indeks, dan syarat lain bisa diatur pengguna dan disimpan di browser.
- Cek: `npx tsx src/screener/test-radar.ts` (dari `apps/sats/worker`)

### SATS: AI Stock Analyst

- Kartu **Analisis AI** di halaman saham. Tombol "Buat analisis AI" mengirim data saham ke AI: teknikal (`tech_latest`), sinyal semua strategi, rekam jejak SATS, skor Radar, fundamental, judul berita 7 hari (RSS `shared/news.js`), dan dividen & stock split 5 tahun (Yahoo). AI hanya menjelaskan data itu, tanpa rekomendasi beli/jual atau target harga; kalimat bernada rekomendasi ditandai di tampilan.
- AI lewat `shared/ai.js`: Workers AI gratis (binding `AI`), atau Claude bila secret `ANTHROPIC_API_KEY` dipasang di sats-radar. Hasil disimpan di tabel `ai_analysis` per saham per tanggal data dan dipakai bersama satu tim. Batas analisis baru per hari untuk semua pengguna = `ANALYST_DAILY` (bawaan 25, sesuai kuota gratis).
- Rights issue, RUPS, dan buyback belum tercakup (tidak ada sumber gratis yang bisa dibaca otomatis).
- Kode: `worker/src/analyst.ts`, `frontend/src/components/AnalystCard.tsx`. Cek: `npx tsx src/test-analyst.ts` (dari `apps/sats/worker`)

### SATS: Strategy Lab (Backtest)

- Menu **Backtest** (`#/backtest`): susun syarat beli (semua harus terpenuhi) dan jual (salah satu), stop loss / target / trailing / maks. hari, pilih saham (indeks, watchlist, satu saham, daftar kode; maks. 80) dan periode 1/3/5 tahun. Ada template, termasuk preset teruji Lab Uji dan sinyal SATS. Strategi bisa disimpan di browser dan dibagikan lewat URL.
- Data: `GET /api/history/:kode` meneruskan JSON Yahoo ±6 tahun apa adanya (worker tidak mengurai, supaya aman dari batas CPU paket gratis). Browser mengurai dan membersihkannya dengan `parseYahooChart` + `cleanBars`, sama dengan pipeline EOD. Tidak ada data yang disimpan di D1.
- Eksekusi (`frontend/src/backtest/engine.ts`): sinyal di harga penutupan, transaksi di pembukaan besok + slippage, fraksi harga BEI, per lot 100, biaya beli/jual, auto reject (beli tidak terisi saat ARA, jual tertunda saat ARB; batas 35/25/20% menurut harga), dana dibagi rata ke maks. N posisi. Asumsi yang diabaikan: saham delisting (survivorship bias), penyelesaian T+2, perubahan aturan ARA/ARB dari waktu ke waktu.
- Halaman ini dimuat terpisah (lazy) karena membawa mesin SATS. Cek: `npx tsx src/test-backtest.ts` (dari `apps/sats/worker`)

## Profil

- `profile.example.json` berisi semua kolom beserta penjelasannya. Salin menjadi `profile.json` lalu isi.
- `scripts/deploy.mjs` menyuntikkan profil ke setiap worker sebagai `PROFILE`, `HUB_URL`, `ADMIN_EMAILS`, dan `GITHUB_REPO`.
- Di kode server, profil dibaca lewat `shared/profile.js`. Di browser, profil tersedia sebagai `window.PROFILE`.
- Kolom yang kosong membuat bagian terkait disembunyikan (logo, tombol aplikasi, QR, sosmed, disclaimer).

## Deploy

```bash
npm install
cp profile.example.json profile.json        # lalu isi
npx wrangler login
node scripts/deploy.mjs                     # semua tool; D1 & KV dibuat otomatis
cp .secrets.example.json .secrets.json      # lalu isi
node scripts/deploy.mjs secrets             # kirim secret ke tiap tool
```

Perintah lain:
- `node scripts/deploy.mjs fund bond`: deploy tool tertentu saja.
- `node scripts/deploy.mjs --dry-run`: cek semua bundel tanpa menyentuh Cloudflare.

Setelah repo di GitHub punya secret `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, dan `PROFILE_JSON`, setiap push ke `main` otomatis men-deploy tool yang berubah.

## Batas paket gratis

| Batas | Pemakaian |
|---|---|
| 5 Cron Trigger per akun | **Terpakai 1**: hanya `apps/cron` (tiap 5 menit), yang memanggil `scheduled()` tool lain lewat service binding. Jadwal baru ditambahkan di `apps/cron/worker.js`, bukan sebagai cron baru; cek dengan `node apps/cron/test.mjs`. |
| CPU 10 ms per permintaan | Pekerjaan berat dipecah bertahap lewat cron, atau dikerjakan di GitHub Actions. |
| KV 1.000 tulis per hari | Bond Insight hanya menulis saat data berubah. |
| GitHub Actions | Gratis tanpa batas untuk repo publik. |

## Pindah dari akun lama

`scripts/migrate.mjs` memindahkan isi D1 dan KV dari akun Cloudflare lama ke akun baru. Penjelasannya ada di bagian atas file itu.
