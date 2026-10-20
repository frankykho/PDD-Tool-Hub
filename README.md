# Tool Hub

Kumpulan tool riset & konten investasi yang berjalan di **Cloudflare Workers paket gratis**, dengan satu pintu login (Tool Hub).

Semua nama brand, logo, link, dan sumber data diatur lewat **satu file profil** (`profile.json`) yang tidak masuk repo. Tanpa profil, semua tool tampil netral.

## Isi

| Tool | Folder | Fungsi |
|---|---|---|
| Tool Hub | `apps/tool-hub` | Login, admin, hak akses per tool, role pekerjaan wajib (Partnership, Investment Specialist, Copywriter, Social Media Specialist, Desainer, Lainnya), lonceng notifikasi tugas, dashboard: tool per kategori, pencarian Ctrl+K, favorit per akun, garis waktu "Ritme hari ini" (pagi/siang/sore, tanda selesai per langkah), ringkasan "Hari ini" (Market Recap, Content Planner, gerak harian tidak biasa & agenda Fund Insight, promo kompetitor baru, draf Edukasi), status otomatis (cron & GitHub Actions, termasuk langkah yang gagal), halaman detail tool |
| Email Studio | `apps/email-studio` | Generator email marketing (Market Insight, Weekly Picks, promo, webinar) |
| Story Generator | `apps/story-generator` | Generator Instagram Story (Morning, Halftime, Wrap, Weekly, RD Highlights, Bond Picks) |
| Story Data | `apps/story-data` | Data pasar untuk Story Generator + pemicu workflow data |
| Market Proxy | `apps/market-proxy` | Komoditas, market breadth & sektor (dipanggil Story Data) |
| Fund Insight | `apps/fund-insight` | Data & analisis reksa dana |
| Bond Insight | `apps/bond-insight` | Data & analisis obligasi |
| ETF Insight | `apps/etf-insight` | ETF KISI (XKMS, XKID): harga vs NAB, kinerja vs indeks, risiko & kinerja per tahun, simulasi investasi, arus dana, pembanding semua ETF di BEI, halaman nasabah `/p/<KODE>`; fakta produk dari `tools.etf.facts` di profil |
| Content Planner | `apps/content-planner` | Kalender kegiatan tim: konten sosmed, artikel, edukasi/narasumber, permintaan visual ke desainer (papan Tugas desain), laporan PPT/PDF per periode & orang; Program partnership (partner, periode, tujuan, target, hasil bisnis & biaya, kegiatan terkait) dengan tugas yang dibagi Partnership ke anggota tim + tampilan Tugas, notifikasi tugas, dan laporan program PPT/PDF; Paket Mingguan: rangkuman reksa dana, obligasi, agenda pekan depan + draf caption/email; tanpa cron |
| Competitor Intel | `apps/competitor-intel` | Pantau promo investasi kompetitor |
| Content Insight | `apps/content-insight` | Galeri konten media sosial kompetitor |
| Edukasi Studio | `apps/edukasi-studio` | Riset artikel edukasi & tulis konten orisinal (Workers AI) |
| SATS Radar | `apps/sats` | Sinyal & screener saham (API + tampilan React) |
| Tutorial | `apps/tutorial` | Pusat tutorial aplikasi (Firebase) |
| Market Recap | `apps/market-recap` | Rangkuman IHSG sesi 1 & penutupan setiap hari bursa sebagai carousel 5 slide 1080×1080 (PNG & PDF): sampul + outlook, penggerak indeks (poin) & sektor, grafik intraday, global/rupiah/komoditas, agenda & berita. Judul tiap slide ditulis AI, disunting & diterbitkan tim; publik di `/p`; arsip |
| Cron | `apps/cron` | Satu-satunya Cron Trigger: menjadwalkan Fund, Competitor, Edukasi, Story Data, SATS, Market Recap (tanpa halaman); mencatat jalan terakhir tiap tugas di tabel `cron_runs` (insight-db) |
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

- Daftar role ada di `shared/jobs.js`. Role dipilih saat daftar; akun lama tanpa role diminta memilih sekali saat masuk (`/role`). Setelah itu hanya admin yang bisa mengubahnya (halaman Atur akses).
- Role ikut di tiket SSO (`j`). Hub juga mengirim daftar anggota Content Planner (akun disetujui dengan akses Planner + role-nya) ke `POST /__hub/users` setiap kali akun berubah, dan sesekali saat beranda dibuka.
- Hanya **Partnership** (dan admin hub) yang bisa membuat Program dan memberi tugas. Penerima dipilih dari daftar anggota, bukan diketik, supaya notifikasinya pasti sampai. Penerima tugas hanya bisa mengubah status & link hasil.
- Notifikasi disimpan di Content Planner (tabel `notifs`): tugas baru/diubah, status tugas berubah (ke pemberi atau penerima), ditunjuk sebagai penanggung jawab, permintaan visual, dan pengingat tenggat (besok, hari ini, lewat; dibuat saat beranda meminta ringkasan, tanpa cron). Hub menampilkannya di lonceng dan menandai dibaca lewat `POST /__hub/notif`.
- Cek: `node apps/content-planner/test.mjs`

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
