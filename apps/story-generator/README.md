# Story Generator

Pembuat gambar IG Story (1080×1920) harian dan pekanan. Dibuka dari dalam Tool Hub (login SSO); cara deploy umum ada di README root.

## Struktur

| Path | Isi |
|---|---|
| `worker.js` | Worker: cek login Tool Hub, buang tab yang tidak diizinkan, sisipkan `window.PROFILE`, API draf tim (`/api/draft`, KV `DRAFTS`) |
| `site/index.html` | seluruh tampilan generator (disajikan sebagai static assets) |
| `site/data/` | `stocks.js`, `rd_list.js` (dibuat dari Excel), `macro.js` (agenda makro), Excel sumbernya |
| `site/img/` | gambar latar (Weekly Bond Picks) |
| `site/public/` | `wrap.json`, `calendar.json`, `lme.json` — diisi GitHub Actions |
| `scripts/` | `fetch_idx_data.py` (data harian), `update_lists.py` (Excel → JS) |

Hanya isi `site/` yang tersaji. Secret: `SSO_SECRET` (sama dengan Tool Hub).

## Tab

Kode tab (dipakai di hak akses Tool Hub): `morning`, `halftime`, `wrap`, `weekly`, `rdh`, `bondpicks`, atau `*` untuk semua.
Nama tab di gambar memakai awalan `brand.short` dari profil bila diisi ("<short> Morning").

| Tab | Sumber data |
|---|---|
| Morning | worker Story Data `?part=morning` (indeks global, kurs, komoditas), `public/lme.json`, kalender (`public/calendar.json` + `data/macro.js` + tempel dari bookmark Kalender IDX) |
| Halftime | Story Data `?part=halftime` (IHSG sesi 1, breadth, sektor) + foreign flow |
| Wrap | `public/wrap.json` (penutupan resmi IDX) + foreign flow |
| Weekly Update, RD Highlights | Fund Insight `/api/funds` (alamat dari `urls.fund`); cadangan: upload workbook |
| Weekly Bond Picks | Story Data `?part=bonds` (API obligasi di profil `sources.bondApi`), cadangan langsung ke API itu dari browser |

## Data harian

- Workflow **Data IDX (Wrap & Kalender)** (`.github/workflows/story-data.yml`) menulis ke `site/public/`, commit, lalu deploy ulang Story Generator (situs ini Worker dengan static assets, jadi data baru tampil setelah deploy).
- Jadwal: kalender 00:00 WIB lewat jadwal GitHub; Wrap 16:50 & 17:25 WIB dan LME 02:30 & 06:00 WIB dinyalakan oleh cron worker `story-data` (butuh secret `GH_TOKEN` di worker itu: token GitHub fine-grained untuk repo ini, izin Actions: Read and write).
- Tombol **▶ Ambil ulang dari IDX sekarang** di tab Wrap memanggil `?part=runwrap` (hari bursa 15:30–22:00 WIB).
- **Daftar saham & RD:** ganti `site/data/Daftar_Saham_IDX.xlsx` atau `site/data/RD_list.xlsx` lalu push. Workflow `story-lists.yml` membuat ulang `stocks.js` / `rd_list.js` dan deploy ulang.
- **Akhir tahun:** perbarui `site/data/macro.js` (jadwal RDG BI, FOMC, rilis BPS tahun berikutnya).

## Timah & nikel (LME)

LME menolak permintaan dari Cloudflare, jadi harga LME Closing Price 3-month diambil GitHub Actions mode `lme`
ke `site/public/lme.json`. Worker `story-data` juga menyimpan closing harian di KV `LME_KV` sebagai cadangan;
Business Insider (lewat Market Proxy) cadangan terakhir. Tes manual: Actions → Data IDX (Wrap & Kalender) → Run workflow → mode `lme`.

## Bookmarklet

Beberapa sumber memblok server, jadi diambil dari browser pengguna lewat bookmark. Seret tombol ungu di generator ke Bookmarks bar (sekali saja), buka halaman sumbernya, klik bookmark, lalu tempel (Ctrl+V) di kotak yang disediakan.

- **📋 Kalender IDX** (tab Morning): halaman Kalender Perusahaan Tercatat IDX.
- **📋 Wrap IDX** (tab Wrap, cadangan kalau IDX memblok GitHub): halaman Ringkasan Saham IDX, klik **Salin**.
- **📋 Foreign Flow** (tab Halftime & Wrap): hanya tampil bila profil `sources.foreignLens` diisi (alamat aplikasi foreign flow internal). Tanpa itu, foreign buy/sell diisi manual.

Format salinan bookmark berubah dari versi lama: bookmark lama harus diseret ulang.

## Profil yang dipakai

`brand.short`, `brand.company`, `brand.license`, `brand.logo` (latar terang), `brand.logoDark` (latar gelap), `app.name`,
`sources.bondApi`, `sources.bondPage`, `sources.foreignLens`, `tools.story.bondLink` (link CTA Bond Picks), `urls.storydata`, `urls.fund`.
Logo ikut digambar ke PNG, jadi alamatnya harus mengizinkan CORS (mis. file di repo lewat raw.githubusercontent.com).
Kosong = elemen disembunyikan (logo diganti teks `brand.short`).
