# Laporan Social Media Specialist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laporan bulanan Social Media Specialist (4 slide contoh + kartu postingan IG) di Content Planner, dengan angka IG/TikTok dari tombol bookmark dan sisanya diketik di form.

**Architecture:** Semua di `apps/content-planner`. Server (worker.js): penanda kegiatan otomatis, caption, followers & isian per bulan di tabel `cfg`. Browser (page.html): hitungan murni `smCalc`, form, `smDoc` memakai pembuat PDF/PPT yang ada (mode `raw`/`plain` seperti `cwDoc`), bookmark IG yang diperluas dan bookmark TikTok baru.

**Tech Stack:** Cloudflare Workers + D1 (planner-db), JS biasa di page.html, test `node apps/content-planner/test.mjs` (node:sqlite meniru D1).

**Spec:** `docs/superpowers/specs/2026-11-10-laporan-social-media-design.md`

## Global Constraints
- Tidak ada database baru (D1 10/10). Kolom baru lewat `COLS`; data form di tabel `cfg`.
- Tidak ada dependensi baru. Tidak ada cron/jadwal (aturan user).
- Password/cookie akun KISI tidak pernah dikirim ke server; bookmark hanya mengirim angka, link, caption, tanggal, gambar.
- Isi laporan selalu English, angka koma ribuan (`toLocaleString("en-US")`), kosong = "-", 0 yang diketik = "0".
- Logo hanya dari `brand/` (sama seperti Laporan Copywriter).
- Semua teks UI baru punya English di `apps/content-planner/i18n.js`; `node scripts/i18n-check.mjs` lolos.
- Gambar dari bookmark ±320 px (`mx=320`).
- Story IG tidak dibuat sebagai kegiatan oleh bookmark.
- Test suite: `node apps/content-planner/test.mjs` → "semua cek lolos".

## Review Focus
1. Bookmark dijalankan dua kali untuk bulan yang sama → tidak ada kegiatan dobel, angka diperbarui, caption tim tidak tertimpa.
2. Postingan yang cocok dengan dua nama seri ("BreakVest KISI" & "Weekly BreakVest KISI") → masuk satu seri saja (terpanjang); sisanya Regular.
3. Kegiatan `auto` tetap muncul di kalender & Laporan SMS, tapi tidak di Laporan Kegiatan maupun Monthly Report; kegiatan yang disimpan ulang lewat form tetap `auto`.
4. Bulan tanpa isian: daftar seri/video editing/design ikut bulan sebelumnya, angkanya kosong ("-"), bukan 0.
5. Bookmark gagal membaca Content insights/TikTok (halaman berubah) → pesan jelas di jendela sinkron, tidak ada data rusak tersimpan.

---

### Task 1: Percobaan baca halaman Content insights & TikTok (bersama user)

**Files:**
- Create: `<scratchpad>/sm-spike/probe.js` (tidak di-commit)

**Interfaces:**
- Produces: catatan ledger `Task 1: Ruling: Content insights dibaca lewat <cara>` dan `... TikTok dibaca lewat <cara>`, dipakai Task 6 & 7.

- [ ] **Step 1:** Tulis bookmarklet percobaan yang, saat dijalankan di instagram.com (halaman Content insights) atau tiktok.com (profil), mengumpulkan **tanpa mengirim ke mana pun**: daftar request `fetch`/`XHR` yang dibuat halaman (bungkus `window.fetch` & `XMLHttpRequest.prototype.open` lalu minta user mengganti dropdown Views→Viewers→Shares / menggulir), potongan JSON jawabannya yang memuat kode postingan + angka, dan isi `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">` (TikTok). Hasil ditampilkan di textarea untuk disalin user (nilai dipotong, maks. ±20 KB).
- [ ] **Step 2:** Berikan ke user dengan langkah: login KISI, buka halaman, klik bookmark, ganti dropdown, salin isi textarea ke chat. Tunggu hasil. Selama menunggu, kerjakan Task 2–5.
- [ ] **Step 3:** Catat ruling cara baca di ledger (endpoint/field per postingan: kode postingan, viewers, shares; TikTok: followerCount, video id, createTime, playCount, diggCount, commentCount, shareCount, collectCount). Bila tidak bisa dibaca andal → ruling "jatuh ke angka diketik" dan beri tahu user.

### Task 2: Server — penanda `auto`, caption, followers, isian per bulan

**Files:**
- Modify: `apps/content-planner/worker.js` (`COLS`, `SERVER_COLS`, `cleanMetricRow`, `importMetrics`, route `/api/cw/cfg` area, komentar kepala file)
- Test: `apps/content-planner/test.mjs`

**Interfaces:**
- Produces:
  - kolom `items.auto INTEGER` (1 = dibuat impor/bookmark), di `SERVER_COLS`.
  - `cleanMetricRow(r)` menerima `r.caption` → `out.caption` (string ≤ 2200, spasi dirapikan per baris, null bila kosong).
  - `importMetrics`: kegiatan baru → `auto=1`, `copy=caption`; kegiatan cocok → `copy = COALESCE(NULLIF(copy,''), caption)`. Baris `channelOf(...) === "IG Story"` tidak dibuat (tetap diperbarui bila cocok).
  - `GET /api/sm/followers?to=YYYY-MM` → `{ months: { "YYYY-MM": {ig, tt} } }` 18 bulan s.d. `to` (bulan tanpa data tidak ada di objek).
  - `POST /api/sm/followers {month?: "YYYY-MM", ig?: int|null, tt?: int|null}` → simpan ke `cfg` kunci `sm_fol:YYYY-MM` (gabung dengan yang ada; `null` menghapus angka itu); tanpa `month` = bulan berjalan WIB (UTC+7).
  - `GET /api/sm/cfg?m=YYYY-MM` → `{ v: obj|null, prev: obj|null }` (prev = isian bulan terakhir sebelum m yang ada, untuk daftar baris); `POST /api/sm/cfg {m, v}` → simpan `sm_n:YYYY-MM`. Validasi: objek, JSON ≤ 8000 karakter, string ≤ 120 karakter, angka bilangan bulat 0..1e13 atau null, larik ≤ 20 baris.

- [ ] **Step 1: Test gagal dulu** — di test.mjs: impor 2 baris (1 baru dengan caption "Weekly BreakVest KISI\nisi", 1 cocok kegiatan yang `copy`-nya "caption tim") dengan `create:true` → kegiatan baru `auto===1` & `copy` berisi caption; kegiatan lama `copy` tetap "caption tim"; impor kedua kali → jumlah kegiatan tidak bertambah; baris Story tidak membuat kegiatan; simpan kegiatan auto lewat `/api/items` → `auto` tetap 1. Followers: POST `{ig:37792}` lalu `{tt:63762}` di bulan yang sama → GET berisi keduanya; POST `{month:"2025-05", ig:16841}` muncul di `to=2026-10`, `2025-04` tidak. `/api/sm/cfg`: simpan Okt, GET Nov → `v:null, prev` = isian Okt; string 200 karakter → 400.
- [ ] **Step 2:** Run `node apps/content-planner/test.mjs` → FAIL pada cek baru.
- [ ] **Step 3:** Implementasi sesuai Interfaces (kunci `cfg` baru dicek regex `^sm_(fol|n):\d{4}-\d{2}$`; `prev` = `SELECT k, v FROM cfg WHERE k LIKE 'sm_n:%' AND k < ? ORDER BY k DESC LIMIT 1`).
- [ ] **Step 4:** Run test → "semua cek lolos".
- [ ] **Step 5: Commit** `Content Planner: penanda kegiatan otomatis, caption, followers & isian Laporan SMS`

### Task 3: Hitungan murni `smCalc`

**Files:**
- Modify: `apps/content-planner/page.html` (blok baru `/* ---------- Laporan Social Media Specialist ---------- */` di dekat `cwCalc`)
- Test: `apps/content-planner/test.mjs` (ambil fungsi lewat regex `function smCalc\(L,o\)\{[\s\S]*?\n\}\n` seperti `cwCalc`)

**Interfaces:**
- Produces: `smCalc(L, o)` — `L` = kegiatan bulan itu; `o = {month:"YYYY-MM", fol:{"YYYY-MM":{ig,tt}}, v:{...isian sm_n}}` →
  `{ months:[{m:"YYYY-MM", label:"May 25", ig, tt}] (18), ser:[{n,s,c,auto}], serTotal, reg:{post,reach,views,likes}, ads:{cost,posts,reach}, yt:{post,adPosts,cost,impr,inter,views,rate}, tt:{post,prof,views,likes}, ttAds:{cost,posts,reach}, ttNote, ve:[{n,c}], veTotal, de:[{n,c}], deTotal, igPosts:[...] }`.
  Angka tidak diketahui = `null`. Isian `v` menimpa hitungan bila bukan null.
- Aturan: postingan IG = `kindOf==="konten"`, kanal `/^IG/` atau link instagram, bukan Story. Seri: cocok bila `title+"\n"+copy` (huruf kecil) memuat nama seri; nama terpanjang yang cocok menang; tiap postingan maks. satu seri. Regular = postingan IG tanpa seri. YouTube post = link memuat `/shorts/`. TikTok = kanal `TikTok` atau link tiktok.com. `rate` = `views/impr*100` dibulatkan 2 desimal bila keduanya ada & impr>0, selain itu null.

- [ ] **Step 1: Test gagal dulu** — data: 3 postingan "BreakVest KISI …", 1 "Weekly BreakVest KISI …" (caption saja), 2 postingan biasa (views 100 & 50, likes 5 & 7), 1 Story, 1 YouTube `/shorts/` + 1 YouTube `watch?v=`, 2 TikTok (views 10/20, likes 1/2). Harapan: seri `[3,1,0,0]`, `serTotal 4`, `reg {post:2, views:150, likes:12, reach:null}`, `yt.post 1`, `tt {post:2, views:30, likes:3, prof:null}`; `v.reg.post=66` menimpa jadi 66; `yt {views:9752, impr:419374}` → `rate 2.33`; `months` 18 item, pertama `2025-05` label "May 25", terakhir `2026-10`; bulan tanpa followers → `ig:null`.
- [ ] **Step 2:** Run test → FAIL (`smCalc` tidak ada).
- [ ] **Step 3:** Implementasi `smCalc`.
- [ ] **Step 4:** Run test → lolos.
- [ ] **Step 5: Commit** `Content Planner: hitungan Laporan Social Media Specialist`

### Task 4: Form, laporan PDF/PPT, gabung Laporan IG, sembunyikan `auto` dari laporan lain

**Files:**
- Modify: `apps/content-planner/page.html` (tombol `rType`, blok form `rSmF` di samping `rCwF`, `setRT`, `REP`, `repData`, `monData`, `rHelp`), `apps/content-planner/i18n.js`, `apps/content-planner/test.mjs`

**Interfaces:**
- Consumes: `smCalc` (Task 3), `/api/sm/cfg`, `/api/sm/followers` (Task 2), `igData`/`igCard` yang ada.
- Produces: `REP.sm = {data:smData, doc:smDoc, name:"Laporan Social Media Specialist"}`; tombol `data-t="sm"` menggantikan `data-t="ig"`.

- [ ] **Step 1: Test gagal dulu** — page.html: ada `data-t="sm">Laporan Social Media Specialist<`, tidak ada `data-t="ig"`; `REP` memuat `sm:{data:smData,doc:smDoc`; `repData` & `monData` membuang `i.auto` (cek regex `!i\.auto` di kedua fungsi); `smDoc` dari data contoh (ambil `smDoc` + helper lewat regex) menghasilkan `head` "Digital Marketing | October 2026", blok tabel followers dengan 18 kolom, teks "3,415,684", sel kosong "-", dan blok `posts` untuk kartu IG; i18n-check lolos.
- [ ] **Step 2:** Run test → FAIL.
- [ ] **Step 3:** Implementasi:
  - Form `rSmF` (tampil hanya `t==="sm"`, periode dipaksa satu bulan; Bulan ini / Bulan lalu): tabel followers 18 bulan (2 baris IG/TikTok, input angka), daftar seri {nama, jadwal, jumlah}, kolom Regular/Ads/YouTube/TikTok/TikTok Ads/catatan, daftar Video Editing & Design {nama, jumlah} dengan tombol tambah/hapus baris. Hitungan tampil sebagai `placeholder`; isian user = `value`. Bawaan seri pertama kali: BreakVest KISI · Every Tuesday - Friday; Weekly BreakVest KISI · Every Monday; Weekly Update Reksa Dana · Every Monday; Weekly Update Bonds · Every Monday. Muat saat bulan berganti (`prev` → baris tanpa angka).
  - `smData()`: simpan isian (`/api/sm/cfg`) & followers yang diubah (`/api/sm/followers` per bulan), ambil kegiatan bulan itu, gambar lewat `/api/imgs`, panggil `smCalc`.
  - `smDoc(R)`: `{raw:true, plain:true, head:"Digital Marketing | <Month> <Year>", blocks:[...]}` — 4 halaman sesuai contoh (judul besar + subjudul seperti "Instagram / Followers"), lalu halaman "Instagram Posts" (3 teratas + semua, kartu `posts` dengan label English Likes/Comments/Shares/Views/Saves/Reposts). Tata letak tabel mengikuti 4 slide contoh di spec.
  - Hapus tombol/teks Laporan IG; `rHelp` untuk `sm` menjelaskan bookmark & isian.
  - `repData` dan `monData`: kegiatan `auto` tidak ikut.
  - Nama file: "Laporan Social Media Specialist - <periode>" (English "Social Media Specialist Report - …").
- [ ] **Step 4:** Run test + `node scripts/i18n-check.mjs` → lolos.
- [ ] **Step 5:** Render PDF & PPT satu kali dengan data contoh Oktober di Chrome headless (pola `drive.mjs` banner), bandingkan dengan 4 gambar contoh user; perbaiki tata letak.
- [ ] **Step 6: Commit** `Content Planner: Laporan Social Media Specialist (gabung Laporan IG)`

### Task 5: Bookmark IG — followers, satu bulan penuh, caption, 320 px

**Files:**
- Modify: `apps/content-planner/page.html` (`plBookmark`, teks tombol), `apps/content-planner/worker.js` (`IG_SYNC`: kirim `followers`), `apps/content-planner/test.mjs` (cek bookmark: ganti `mx=480` → `mx=320`)

**Interfaces:**
- Consumes: `/api/sm/followers`, `/api/metrics/import` dengan `caption` (Task 2).
- Produces: pesan bookmark → jendela `{pl:"row", row:{..., caption}}` dan `{pl:"fol", ig:<int>}`.

- [ ] **Step 1: Test gagal dulu** — bookmark memuat `web_profile_info`, `mx=320`, mengirim `caption`, dan berhenti menggulir feed bila `taken_at` < awal bulan (cek regex string); `IG_SYNC` menangani `pl==="fol"` dan memanggil `/api/sm/followers`.
- [ ] **Step 2:** Run test → FAIL.
- [ ] **Step 3:** Implementasi: di halaman profil, followers diambil dari `/api/v1/users/web_profile_info/?username=<akun>` (`data.user.edge_followed_by.count`); mode bulan: jendela sinkron menampilkan pilihan "Bulan ini / Bulan lalu" sebelum mulai, bookmark mengambil feed (`loadFeed`) halaman demi halaman sampai postingan lebih tua dari awal bulan (maks. 10 halaman), batas 60 dihapus untuk mode ini; Story dilewati; caption utuh dikirim.
- [ ] **Step 4:** Run test → lolos.
- [ ] **Step 5: Commit** `Content Planner: bookmark IG mencatat followers & satu bulan penuh`

### Task 6: Bookmark IG di Content insights — reach & shares

**Files:** `apps/content-planner/page.html` (`plBookmark` cabang halaman insights), `apps/content-planner/test.mjs`

**Interfaces:**
- Consumes: ruling Task 1 (cara baca), `/api/metrics/import` (baris `{link, m_reach, m_shares}`).

- [ ] **Step 1: Test gagal dulu** — cabang insights dikenali dari alamat halaman (sesuai ruling Task 1) dan mengirim `m_reach` & `m_shares`; skrip tetap sah (`new Function`).
- [ ] **Step 2:** Run test → FAIL.
- [ ] **Step 3:** Implementasi sesuai ruling Task 1; gagal baca → jendela menampilkan "Content insights tidak bisa dibaca; isi reach lewat CSV Meta atau ketik", tidak ada yang disimpan.
- [ ] **Step 4:** Run test → lolos.
- [ ] **Step 5:** Minta user mencoba sekali di akun KISI; catat hasilnya di ledger.
- [ ] **Step 6: Commit** `Content Planner: bookmark IG membaca reach & shares dari Content insights`

### Task 7: Bookmark TikTok + jendela `/tt-sync`

**Files:** `apps/content-planner/page.html` (`ttBookmark`, tombol "🎵 Angka TikTok ke Planner" di samping `bmLink`), `apps/content-planner/worker.js` (`TT_SYNC` + route `/tt-sync`, pesan hanya dari `https://www.tiktok.com`), `apps/content-planner/i18n.js`, `apps/content-planner/test.mjs`

**Interfaces:**
- Consumes: ruling Task 1, `/api/metrics/import` (link `https://www.tiktok.com/@<akun>/video/<id>`, `m_views`, `m_likes`, `m_comments`, `m_shares`, `m_saves`, `img`, `caption`, `date`), `/api/sm/followers {tt}`.

- [ ] **Step 1: Test gagal dulu** — `/tt-sync` (login) menjawab HTML dengan CSP `frame-ancestors 'none'`, hanya menerima origin tiktok.com, skrip sah; `ttBookmark` sah dan memakai `mx=320`; impor baris TikTok membuat kegiatan kanal `TikTok`, `auto=1`, dan dicocokkan ulang lewat `postKey` `tt:<id>`.
- [ ] **Step 2:** Run test → FAIL.
- [ ] **Step 3:** Implementasi sesuai ruling Task 1 (pola `plBookmark`/`IG_SYNC`).
- [ ] **Step 4:** Run test + i18n-check → lolos.
- [ ] **Step 5:** Minta user mencoba sekali di profil TikTok KISI; catat hasilnya.
- [ ] **Step 6: Commit** `Content Planner: bookmark Angka TikTok ke Planner`
