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
| Content Planner | `apps/content-planner` | Kalender kegiatan tim: konten sosmed, artikel, edukasi/narasumber, permintaan visual ke desainer (papan Tugas desain), laporan PPT/PDF per periode & orang; Program partnership (partner, periode, tujuan, target, hasil bisnis & biaya, kegiatan terkait) dengan tugas yang dibagi Partnership ke anggota tim + tampilan Tugas, notifikasi tugas, dan laporan program PPT/PDF; Paket Mingguan: rangkuman reksa dana, obligasi, agenda pekan depan + draf caption/email; tanpa cron |
| Competitor Intel | `apps/competitor-intel` | Pantau promo investasi kompetitor |
| Content Insight | `apps/content-insight` | Galeri konten media sosial kompetitor; ide tim (semua anggota, banyak ide per konten); konsep konten orisinal dibuat AI untuk Social Media Specialist (hook, sudut beda, alur slide/naskah, caption, brief visual, catatan kepatuhan) dan satu tombol ke Content Planner (+ permintaan visual ke desainer) |
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
