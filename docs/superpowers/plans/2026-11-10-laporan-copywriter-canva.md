# Laporan Copywriter format Canva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laporan Copywriter di Content Planner berubah menjadi report bergaya deck Canva user (tabel ringkasan, tabel detail artikel, narasumber media, galeri kampanye), dengan isian otomatis dari link, kisi.co.id, dan YouTube tanpa API key.

**Architecture:** Semua di `apps/content-planner`. Worker: kolom baru di `items`, fungsi tebakan murni (diekspor & dites), endpoint `/api/linkmeta`, `/api/kisi/sync`, `/api/cw/cfg`, dan jalur YouTube tanpa key di `ytRefresh`. Page: isian baru di form kegiatan, perluasan pembuat PDF/PPT (blok & sel baru), lalu `cwData`/`cwDoc` ditulis ulang di atas fungsi hitung murni `cwCalc`.

**Tech Stack:** Cloudflare Worker + D1, vanilla JS di `page.html`, PptxGenJS 3.12.0 (sudah dipakai), test `node apps/content-planner/test.mjs` (Node 22.15+, D1 ditiru `node:sqlite`).

**Spec:** `docs/superpowers/specs/2026-11-10-laporan-copywriter-canva-design.md`

## Global Constraints
- Tanpa database baru (D1 10/10); kolom baru lewat `COLS` di `worker.js` (ALTER otomatis di `ensure`).
- Tanpa dependensi baru; tanpa cron / jadwal (aturan user).
- Logo hanya dari `brand/`; page memakai `MR_LOGO` (`/brand/logo-color.png`) yang sudah ada.
- Teks UI baru + English di `apps/content-planner/i18n.js`; literal `</script>` dalam string JS ditulis `<\/script>`.
- Pengambilan dari luar memakai `safeHttps` + `readCapped` + timeout 10 dtk (pola `linkImg`).
- Tebakan hanya mengisi isian yang kosong; impor/refresh hanya memperbarui views (dan judul/gambar/media bila kosong).
- Laporan PDF & PPT 16:9, latar putih, kepala kanan "Digital Marketing | <Bulan> <Tahun>", huruf Inter.
- Nilai: topik `branding|event|saham` (Branding / Event / Investasi Saham; ringkasan English: Stock Investment);
  kategori `hard|soft` (Hard Selling / Soft Selling); kanal baru `"Push notification"` di jenis Artikel.

## Review Focus
1. Respons kisi.co.id tanpa `<img>` di `news_content` atau `news_tag` bukan JSON sah → artikel tetap dibuat, tanpa gambar, `tags` = `[]` (test di Task 4).
2. Angka awal YTD dengan `upto` ≥ bulan periode → angka awal diabaikan, YTD External = hitungan Planner 1 Jan s.d. akhir periode (test di Task 8).
3. Halaman YouTube tanpa `viewCount` (halaman persetujuan/diblokir) → views tidak berubah, tidak ada error, `updated` tidak bertambah (test di Task 3).
4. Link yang bukan HTML / terlalu besar di `/api/linkmeta` → kegiatan tidak berubah, jawaban `{ok:false}` status 200 (test di Task 2).
5. Periode tanpa satu kegiatan pun → laporan tetap jadi: tabel ringkasan berisi 0 / "-", tanpa halaman detail & galeri (test di Task 8).

---

### Task 1: Kolom baru & fungsi tebakan (worker)

**Files:**
- Modify: `apps/content-planner/worker.js` (`KINDS.artikel.channels` baris ±110, `COLS` ±166, `SERVER_COLS` ±182, `cleanItem` ±235, helper baru dekat `ogImage` ±597)
- Test: `apps/content-planner/test.mjs`

**Interfaces:**
- Produces:
  - Kolom `items`: `topic TEXT, sell TEXT, media TEXT, press INTEGER, tags TEXT, live INTEGER`; `tags`, `live` masuk `SERVER_COLS` (hanya server).
  - `export const TOPICS = ["branding","event","saham"]`, `export const SELLS = ["hard","soft"]`
  - `export function mediaName(link: string, site?: string): string`
  - `export function guessTopic(o: {title:string, tags?:string[], internal:boolean, press:boolean}): "branding"|"event"|"saham"`
  - `export function guessSell(o: {internal:boolean, press:boolean, topic:string}): "hard"|"soft"`
  - `export function pageMeta(html: string): {title:string, site:string, date:string}` (date `YYYY-MM-DD` atau "")
  - `export const isInternal = (link) => boolean` (host kisi.co.id / www.kisi.co.id)

- [ ] **Step 1: Tulis test yang gagal** (blok baru di test.mjs, impor fungsi dari `./worker.js`)

```js
assert.equal(mediaName("https://pasardana.id/news/2026/10/1/x"), "Pasardana.id");
assert.equal(mediaName("https://www.idxchannel.com/market-news/x"), "IDX Channel");
assert.equal(mediaName("https://kisi.co.id/blog/artikel/239"), "Company Website");
assert.equal(mediaName("https://contoh-baru.co.id/a", "Contoh Baru"), "Contoh Baru");
assert.equal(mediaName("https://contoh-baru.co.id/a"), "contoh-baru.co.id");
assert.equal(guessTopic({ title: "Laba MYOR Melonjak", tags: ["Behind The Candle"], internal: true, press: false }), "saham");
assert.equal(guessTopic({ title: "Transaksi Rp1,46T, KISI Challenge: Beyond Tomorrow Makin Sengit", internal: false, press: false }), "event");
assert.equal(guessTopic({ title: "ANALIS MARKET (01/10/2026): IHSG Mixed", internal: false, press: false }), "branding");
assert.equal(guessTopic({ title: "Jembatan Modal Korea-RI", internal: false, press: true }), "branding");
assert.equal(guessSell({ internal: false, press: true, topic: "branding" }), "hard");
assert.equal(guessSell({ internal: false, press: false, topic: "event" }), "hard");
assert.equal(guessSell({ internal: true, press: false, topic: "event" }), "soft");
assert.equal(guessSell({ internal: false, press: false, topic: "branding" }), "soft");
assert.deepEqual(pageMeta('<meta property="og:title" content="Judul &amp; A"><meta property="og:site_name" content="Kontan"><meta property="article:published_time" content="2026-10-01T08:00:00+07:00">'), { title: "Judul & A", site: "Kontan", date: "2026-10-01" });
assert.deepEqual(pageMeta("<title> Hanya Title </title>"), { title: "Hanya Title", site: "", date: "" });
// simpan kegiatan dengan isian baru; nilai di luar daftar dibuang; tags/live dari form diabaikan
const ci = (await call("/api/items", { ck: COPY, body: { kind: "artikel", channel: "Push notification", title: "Push 1 Okt", date: "2026-10-01", topic: "event", sell: "x", media: "IDX Channel", press: 1, tags: "[\"a\"]", live: 1 } })).j.id;
const cr = (await call("/api/items?id=" + ci, { ck: COPY })).j;
assert.equal(cr.topic, "event"); assert.equal(cr.sell, null); assert.equal(cr.media, "IDX Channel"); assert.equal(cr.press, 1); assert.equal(cr.tags, null); assert.equal(cr.live, null);
assert.equal(cr.channel, "Push notification");
```

- [ ] **Step 2: Jalankan, pastikan gagal**
Run: `node apps/content-planner/test.mjs` — Expected: FAIL (`mediaName` bukan fungsi / undefined).

- [ ] **Step 3: Implementasi**
- `KINDS.artikel.channels`: sisipkan `"Push notification"` setelah `"Email / Newsletter"`.
- `COLS` + `SERVER_COLS` seperti Interfaces. `cleanItem`: `topic` ∈ `TOPICS` else null, `sell` ∈ `SELLS` else null, `media` string ≤ 80 else null, `press` → 1 bila truthy else 0/null.
- `mediaName`: host tanpa `www.`; kisi.co.id → "Company Website"; peta `MEDIA` (objek host → nama) berisi minimal: pasardana.id Pasardana.id, infobanknews.com Infobanknews.com, idxchannel.com IDX Channel, emitennews.com Emiten News, kontan.co.id Kontan.co.id, investor.id Investor Daily, investortrust.id Investortrust.id, stockwatch.id Stockwatch, bisnis.com Bisnis.com, iqplus.info IQ Plus, kompas.com Kompas.com, wartaekonomi.co.id Warta Ekonomi, swa.co.id SWA.co.id, financialreview.id Financial Review, antaranews.com Antara News, voi.id VOI, economixbuzz.com Economix Buzz, metrotvnews.com Metro TV News, topbusiness.id Top Business, emitentrust.com Emiten Trust, suara.com Suara.com, tribunnews.com Tribun News, katadata.co.id Katadata.co.id, youtube.com YouTube; subdomain dicocokkan ke domain induk (`market.bisnis.com` → Bisnis.com). Di luar peta → `site` bila ada, else host.
- `guessTopic`: urutan aturan persis spec §1 (KISI Challenge di judul/tag → event; tag "Behind The Candle" → saham; press / "ANALIS MARKET" / "IHSG" → branding; internal → saham; else branding). Pencocokan teks tanpa beda huruf besar/kecil.
- `pageMeta`: `og:title` → `twitter:title` → `<title>`; `og:site_name`; `article:published_time` 10 karakter pertama; entitas `&amp; &quot; &#39;` didekode; spasi dirapikan.

- [ ] **Step 4: Jalankan test** — Expected: `semua cek lolos`.

- [ ] **Step 5: Commit**
```bash
git add apps/content-planner/worker.js apps/content-planner/test.mjs
git commit -m "Content Planner: kolom topik/kategori/media & tebakan untuk Laporan Copywriter"
```

### Task 2: Judul & media otomatis dari link (`/api/linkmeta`)

**Files:**
- Modify: `apps/content-planner/worker.js` (fungsi baru dekat `linkImg`; rute POST di peta ±1493; komentar kepala rute ±20)
- Test: `apps/content-planner/test.mjs`

**Interfaces:**
- Consumes: `mediaName`, `guessTopic`, `guessSell`, `pageMeta`, `isInternal` (Task 1); `safeHttps`, `readCapped`, `UA_WEB`.
- Produces: `POST /api/linkmeta {id}` → `{ok:true, title, media, topic, sell}` atau `{ok:false}` (status 200). Hak: sama dengan menyimpan gambar (`saveImg`: pembuat, PIC, desainer, admin) → 403 bila tidak.

- [ ] **Step 1: Test gagal** (fetch ditiru seperti test linkimg yang ada ±337)
```js
// kegiatan artikel dengan judul = link; halaman berisi og:title & site
// -> judul diganti, media "Pasardana.id" (peta menang atas og:site_name), topik & kategori tebakan terisi
// kegiatan dengan topic "saham" yang sudah diisi -> topic tetap "saham" setelah linkmeta
// link Instagram -> {ok:false}, kegiatan tidak berubah
// halaman content-type image/png atau > 1,5 MB -> {ok:false}, kegiatan tidak berubah
// user lain (bukan pembuat/PIC/admin) -> status 403
```
Tulis assertion konkret untuk keempat kasus (judul, media, topic, sell dari `/api/items?id=`).

- [ ] **Step 2: Jalankan, pastikan gagal** — Expected: 404/route tidak ada.

- [ ] **Step 3: Implementasi `linkMeta(env, me, id)`**: baca item; link harus `safeHttps` dan bukan instagram.com; YouTube dilewati (Task 3 yang mengisi). Ambil HTML (≤ 1,5 MB, `text/html` saja). Isi hanya yang kosong: `title` (kosong atau sama dengan link), `media` = `mediaName(link, site)`, `topic` = `guessTopic(...)`, `sell` = `guessSell(...)` dengan `internal = isInternal(link)`, `press = !!item.press`. Satu UPDATE dengan `COALESCE(NULLIF(...))` per kolom.

- [ ] **Step 4: Jalankan test** — Expected: lolos.

- [ ] **Step 5: Commit** — `Content Planner: judul, media, topik & kategori otomatis dari link`

### Task 3: YouTube tanpa API key

**Files:**
- Modify: `apps/content-planner/worker.js` (`ytRefresh` ±634, helper baru `ytPage`)
- Test: `apps/content-planner/test.mjs` (perluas blok yt ±342)

**Interfaces:**
- Produces: `export function ytPage(html: string): {views:number|null, date:string, live:boolean, channel:string}` — dari `"viewCount":"<n>"`, `"publishDate":"<iso>"` (10 karakter), `"isLiveContent":true`, `"ownerChannelName":"<nama>"`.
- `ytRefresh` tanpa `YOUTUBE_API_KEY`: ambil `https://www.youtube.com/watch?v=<id>` (UA_WEB, `Accept-Language: id`, ≤ 3 MB, timeout 10 dtk; paling banyak 5 berjalan bersamaan) → `m_views` (COALESCE), `m_src='ytpage'`, `live`, `media = COALESCE(media, mediaName("https://youtube.com", channel) → nama channel dirapikan)`; peta tambahan nama channel `"IDX CHANNEL"` → `"IDX Channel"`. Jawaban `{updated:n}`. Jalur API key yang ada tetap.

- [ ] **Step 1: Test gagal**
```js
assert.deepEqual(ytPage('"viewCount":"5512" ... "publishDate":"2026-10-29T17:09:03-07:00" ... "isLiveContent":false ... "ownerChannelName":"IDX CHANNEL"'), { views: 5512, date: "2026-10-29", live: false, channel: "IDX CHANNEL" });
assert.deepEqual(ytPage("<html>consent</html>"), { views: null, date: "", live: false, channel: "" });
// ganti test "skipped: no-key" lama: tanpa key + fetch tiruan halaman watch -> updated 1, m_views 5512, media "IDX Channel"
// tanpa key + halaman tanpa viewCount -> updated 0, m_views tetap angka manual sebelumnya
```

- [ ] **Step 2: Jalankan, gagal.** **Step 3: Implementasi.** **Step 4: Lolos.**
- [ ] **Step 5: Commit** — `Content Planner: views YouTube dari halaman publik bila tanpa API key`

### Task 4: Artikel kisi.co.id, YTD Internal, dan simpanan angka laporan

**Files:**
- Modify: `apps/content-planner/worker.js` (fungsi baru `kisiRow`, `kisiSync`, `cwCfg`; rute; komentar kepala)
- Test: `apps/content-planner/test.mjs`

**Interfaces:**
- Consumes: `guessTopic`, `guessSell` (Task 1); tabel `item_img`, `users`.
- Produces:
  - `export const KISI_API = "https://api-compro.kisi.co.id/api/v1/kisiNews/list"`
  - `export function kisiRow(n): {id:number, link:string, title:string, date:string, views:number|null, img:string, tags:string[], by:string}` — `link = "https://kisi.co.id/blog/artikel/" + news_id`; `img` = src `<img>` pertama di `news_content` ("" bila tidak ada); `tags` = `JSON.parse(news_tag)` aman (array string, else `[]`); `by` = `created_by` huruf kecil.
  - `export async function kisiSync(env, from, to, get = fetch): Promise<{created:number, updated:number, ytdInt:number, error?:string}>` — halaman `?limit=60&offset=k&active=1`, berhenti saat `news_date` < `<tahun>-01-01` atau data habis (maks. 20 halaman). `ytdInt` = jumlah artikel 1 Jan s.d. `to`. Untuk artikel di `[from,to]`: cocokkan kegiatan lewat link yang memuat `/<news_id>` di akhir path kisi.co.id, lalu lewat judul dinormalkan (huruf kecil, spasi tunggal) + tanggal; buat bila tidak ada (`kind:"artikel"`, `channel:"Website"`, `status:"terbit"`, `owner_email` = `by` bila ada di `users` else null, `media:"Company Website"`, `topic`/`sell` tebakan dengan `internal:true`, `tags` JSON, `m_views`, `m_src:"kisi"`, `created_by:"kisi.co.id"`); bila ada → hanya `m_views`, `m_src`, `m_at`, `tags`, dan `title`/`link`/`media`/`topic`/`sell` yang kosong. Gambar: bila `item_img` belum ada dan `img` https → ambil (image/jpeg|png|webp ≤ 700 KB) dan simpan sebagai data URL apa adanya. Gagal ambil API → `{created:0, updated:0, ytdInt:0, error:"kisi.co.id tidak bisa diambil"}`.
  - `POST /api/kisi/sync {from,to}` → hasil `kisiSync` (siapa pun yang bisa membuat laporan; tim regional 403 seperti laporan lain).
  - `GET /api/cw/cfg?k=<key>` → `{v}`; `POST /api/cw/cfg {k, v}` → `{ok:true}`. `k` harus cocok `/^cw_(ytd:\d{4}|n:\d{4}-\d{2})$/`; `v` objek JSON ≤ 2 KB berisi angka bulat ≥ 0 (dan `upto` `YYYY-MM` untuk `cw_ytd`). Disimpan di tabel `cfg`.

- [ ] **Step 1: Test gagal** (fetch tiruan mengembalikan 2 halaman data contoh Oktober + 1 artikel September)
```js
// kisiRow: news_tag "bukan json" -> tags []; news_content tanpa <img> -> img ""
// sync pertama: created = jumlah artikel di periode; PIC = cici@acme.test untuk created_by cici, null untuk penulis tak terdaftar
// copywriter mengubah topic satu artikel jadi "event", lalu sync kedua dengan views baru:
//   created 0, m_views baru, topic tetap "event"
// kegiatan manual dengan link "https://kisi.co.id/blog/edukasi/slug-x" + judul & tanggal sama -> tidak dibuat dobel, dilengkapi views & tags
// ytdInt menghitung artikel 1 Jan..to (termasuk September)
// fetch gagal -> error "kisi.co.id tidak bisa diambil", tidak ada kegiatan dibuat
// /api/cw/cfg: k "cw_ytd:2026" simpan {upto:"2026-09", ext:496} lalu baca kembali sama; k "lain" -> 400; v berisi string -> 400
```

- [ ] **Step 2: Gagal.** **Step 3: Implementasi.** **Step 4: Lolos.**
- [ ] **Step 5: Commit** — `Content Planner: artikel kisi.co.id otomatis, YTD website & simpanan angka Laporan Copywriter`

### Task 5: Mitra kolaborasi dari bookmark IG

**Files:**
- Modify: `apps/content-planner/page.html` (fungsi `plBookmark`, ±765–770: tambah `o.media`), `apps/content-planner/worker.js` (`cleanMetricRow` ±657 & `importMetrics`: terima `media`, isi bila kosong)
- Test: `apps/content-planner/test.mjs`

**Interfaces:**
- Bookmark: `o.media` = `username` pertama dari `it.coauthor_producers` (lalu `it.invited_coauthor_producers`) yang bukan `kisi_sekuritas`, else "". Nama akun Instagram dipakai apa adanya (mis. "sahamology").
- `cleanMetricRow` menyimpan `media` (string ≤ 80); impor: `media = COALESCE(media, ?)`.

- [ ] **Step 1: Test gagal**: impor metrik dengan baris `{link, media:"sahamology", ...}` → kegiatan IG punya `media` "sahamology"; impor ulang dengan `media:"lain"` → tetap "sahamology". Test syntax bookmark yang ada (±382) tetap lolos.
- [ ] **Step 2: Gagal.** **Step 3: Implementasi.** **Step 4: Lolos.**
- [ ] **Step 5: Commit** — `Content Planner: mitra kolaborasi IG dari bookmark`

### Task 6: Form kegiatan — topik, kategori, media, press release, push notification

**Files:**
- Modify: `apps/content-planner/page.html` (form ±288–400, `afterSave` ±1083, simpan form), `apps/content-planner/i18n.js`
- Test: `apps/content-planner/test.mjs` (cek string page, gaya ±388–398)

**Interfaces:**
- Consumes: `POST /api/linkmeta {id}` (Task 2); kolom Task 1.
- Elemen baru: `#iTopicF` berisi `<select id="iTopic">` (kosong / Branding / Event / Investasi Saham), `<select id="iSell">` (kosong / Hard Selling / Soft Selling), `<input id="iMedia" maxlength="80">`, `<input type="checkbox" id="iPress">` "Liputan press release". Tampil untuk jenis Artikel dan Konten.
- Kanal "Push notification": isian link & catatan disembunyikan; judul boleh kosong → saat simpan diisi `"Push notification " + fmtShort(date)`; kotak gambar (`#mImgBox`) tampil.
- `afterSave(id, link)`: selain gambar & yt, panggil `api("/api/linkmeta",{id})` untuk link non-YouTube non-Instagram, lalu `loadCal()` bila `ok`.

- [ ] **Step 1: Test gagal**
```js
assert.match(pg, /id="iTopic"/); assert.match(pg, /id="iSell"/); assert.match(pg, /id="iMedia"/); assert.match(pg, /id="iPress"/);
assert.match(pg, /api\("\/api\/linkmeta"/);
// i18n: setiap teks baru punya terjemahan (pola cek i18n yang sudah ada di test.mjs bila ada; kalau tidak, cek kunci "Liputan press release" & "Investasi Saham")
```
- [ ] **Step 2: Gagal.** **Step 3: Implementasi** (isian baru ikut dikirim di body simpan yang ada). **Step 4: Lolos; buka Planner lokal (`wrangler dev` / skill run) dan simpan satu artikel media & satu push notification untuk dicek tampilannya.**
- [ ] **Step 5: Commit** — `Content Planner: isian topik, kategori, media & push notification di form`

### Task 7: Pembuat PDF/PPT — gaya Canva & blok baru

**Files:**
- Modify: `apps/content-planner/page.html` (`pdfDoc` ±1789, `pptDoc` ±1845, `MR_CSS`)
- Test: `apps/content-planner/test.mjs` (syntax `<script>` yang sudah ada ±192 + cek string)

**Interfaces (dipakai Task 8; laporan lain tidak berubah karena semua opsional):**
- `doc.head?: string` — teks kanan atas pengganti `"${div} Report | ${per}"`; `doc.plain?: true` — latar putih, tanpa sampul berwarna, judul halaman 30 pt gelap.
- Blok `{t:"sum", items:[{h2, cols, rows}]}` — tabel kecil berjudul besar, 2 per baris (kiri/kanan), dibungkus bingkai sudut bulat garis hijau (#3F8A66). Baris terakhir yang ditandai tebal.
- Blok `table` tambahan: `b.per?: number` (maks. baris per halaman, mis. 20 / 3), `b.dark?: true` (kepala hijau tua `136F4A`, teks putih, rata tengah), `b.h2?: string` (judul halaman besar dipakai juga pada halaman lanjutan, tanpa "(lanjutan)"), baris `r.tot` (array dengan properti `tot:1`: latar hijau tua, teks putih tebal).
- Sel tambahan: `{t, href, a:1}` → teks itu sendiri jadi link (biru, garis bawah); `{t, c:"RRGGBB"}` → warna teks; `{img}` → gambar mengisi sel (PPT: `addImage` di atas sel dengan posisi dihitung dari `colW`/`rowH`); `{t, live:1}` → baris "LIVE" merah di atas teks.
- Blok `{t:"gallery", h2, cols:3|4, items:[{title?, img, cap, href?}]}` — judul kecil biru di atas gambar (bila ada), gambar 16:9 (rasio asli, dipotong `cover`), keterangan di bawah (hijau tua, tebal, garis bawah bila `href` → link).

- [ ] **Step 1: Test gagal**: `assert.match(pg, /b\.t==="sum"/); assert.match(pg, /b\.t==="gallery"/); assert.match(pg, /doc\.head/);` (dua kali: pdf & ppt — cek `matchAll` berjumlah ≥ 2).
- [ ] **Step 2: Gagal.** **Step 3: Implementasi** di kedua pembuat. **Step 4: Lolos; buat Laporan IG & Laporan Kegiatan sekali di lokal untuk memastikan tampilannya tidak berubah.**
- [ ] **Step 5: Commit** — `Content Planner: pembuat PDF/PPT mendukung tabel ringkasan, detail, galeri gaya Canva`

### Task 8: Laporan Copywriter baru (`cwCalc`, `cwData`, `cwDoc`, dialog)

**Files:**
- Modify: `apps/content-planner/page.html` (`cwData`/`cwDoc` ±2083–2119, dialog `#rep` ±474–490, `setRT` ±1285–1296), `apps/content-planner/i18n.js`
- Test: `apps/content-planner/test.mjs` (ekstrak `function cwCalc(` dari page.html dengan regex seperti `plBookmark` ±382, jalankan dengan data tiruan)

**Interfaces:**
- Consumes: `/api/kisi/sync`, `/api/cw/cfg` (Task 4), `/api/yt/refresh` (Task 3), blok Task 7, kolom Task 1/5.
- `function cwCalc(L,o){` (ditulis persis begini, tanpa spasi, agar regex test cocok) — murni, tanpa DOM. `L`: kegiatan periode (sudah difilter orang). `o = {from, to, camp:string[], typed:{sm, promo, dArt, dStory, dFeed, prop}, ytd:{upto, ext}|null, ytdInt:number, yearExt:number, extAfter:number}` (`yearExt` = jumlah artikel eksternal Planner 1 Jan s.d. `to`; `extAfter` = jumlah setelah bulan `upto` s.d. `to`; keduanya dihitung `cwData`). Mengembalikan:
  `{art:{int, ext, ytdInt, ytdExt}, topic:{branding, event, saham}, copy:{sm, collab, int, promo, press, push}, design:{art, story, feed}, prop, media:[{media, program, n}], rows:[artikel urut tanggal], yt:[video urut tanggal], camps:[{name, int:[], ext:[], ig:[], mail:[], push:[]}]}`.
  Aturan: internal = artikel kanal Website/Blog; eksternal = kanal Media partner; `press` = jumlah tanggal berbeda dari artikel eksternal `press=1`; `collab` = konten IG dengan `media`; `push` = kanal Push notification; program YouTube = teks setelah `|` terakhir di judul, dirapikan huruf besar (fallback = media); kampanye cocok bila judul, `tags`, atau nama program tertaut memuat teks kampanye (tanpa beda huruf besar/kecil); `ytdExt` = `ytd && ytd.upto < to.slice(0,7) ? ytd.ext + extAfter : yearExt`.
- `cwData`: urutan — `POST /api/kisi/sync {from,to}` (gagal → catatan), refresh YouTube (seperti sekarang), `GET /api/items?from=<tahun>-01-01&to=to` (untuk YTD External), gambar `/api/imgs`, angka diketik dari `/api/cw/cfg` (`cw_n:<YYYY-MM>`, `cw_ytd:<tahun>`) dan isian dialog; simpan isian dialog ke `/api/cw/cfg`. Filter orang sama seperti sekarang, kecuali artikel kanal Website ber-`m_src` "kisi" selalu ikut pada "Semua copywriter".
- `cwDoc(R)` → `{div:"Digital Marketing", per, head:"Digital Marketing | "+per, plain:true, blocks}` berurutan spec §6: `sum` (Articles/News + Topic in <Bulan>), `sum` (Copywriting for Publication), `sum` (Design for Publication + Administration + Supporting Investment Specialist…), `table` detail artikel (`dark`, `per:20`, `h2:"Details Articles/News"`, kolom No 6 / Topic 9 / Title & Link 36 / Published Date 12 / Category 12 / Channel 12 / Views 8, warna topik Branding `C0392B`, Event `555555`, Investasi Saham `2155C4`, kategori Hard `B35C00`, Soft `2E7BD6`, judul berawalan "[Press Release]\n" bila press, Views "-" bila kosong, baris `tot` "Total Views"), `table` speakers (`per:3`, kolom No / Content `{img}` / Title / Program `{live}` / Media / Date / Link `{t:"Link",href,a:1}` / Views, baris `tot`), lalu per kampanye `gallery` untuk setiap bagian yang berisi (keterangan "N) Article Internal www.kisi.co.id", "N) Article in <media>", "N) Instagram <Post|Reels> Collaboration with <media>", "N) Email Blast <tgl bulan>", "N) Push Notification <tgl bulan>").
- Dialog (hanya tampil untuk `cw`): `#rCamp` (Kampanye), `#rSm` (Social Media KISI Contents), `#rPromo`, `#rDArt`, `#rDStory`, `#rDFeed`, `#rProp`, `#rYtdUpto` (month) + `#rYtdExt`. Diisi dari `/api/cw/cfg` saat periode berubah.

- [ ] **Step 1: Test gagal** — data tiruan Oktober kecil:
```js
const calc = new Function(pg.match(/function cwCalc\(L,o\)\{[\s\S]*?\n\}\n/)[0] + "return cwCalc")();
const L = [
  { kind:"artikel", channel:"Website", date:"2026-10-01", title:"KISI Challenge dimulai", topic:"event", sell:"soft", media:"Company Website", m_views:39, tags:'["KISI Challenge"]', m_src:"kisi" },
  { kind:"artikel", channel:"Media partner", date:"2026-10-01", title:"Jembatan Modal", topic:"branding", sell:"hard", media:"Emiten News", press:1 },
  { kind:"artikel", channel:"Media partner", date:"2026-10-21", title:"Literasi Lampung", topic:"branding", sell:"soft", media:"Pasardana.id", press:1 },
  { kind:"artikel", channel:"Push notification", date:"2026-10-08", title:"Push notification 8 Okt" },
  { kind:"konten", channel:"IG Reels", date:"2026-10-19", title:"Kuliah Saham x KISI Challenge", media:"kuliahsaham" },
  { kind:"konten", channel:"YouTube", link:"https://youtu.be/SzA5WiqLaVk", date:"2026-10-30", title:"Pasar Tak Menentu | TICKER TALK", media:"IDX Channel", m_views:5127 },
];
const r = calc(L, { from:"2026-10-01", to:"2026-10-31", camp:["KISI Challenge"], typed:{ sm:19, promo:0, dArt:2, dStory:2, dFeed:7, prop:7 }, ytd:{ upto:"2026-09", ext:494 }, ytdInt:153, yearExt:3, extAfter:2 });
assert.deepEqual(r.art, { int:1, ext:2, ytdInt:153, ytdExt:496 });
assert.deepEqual(r.copy, { sm:19, collab:1, int:1, promo:0, press:2, push:1 });
assert.deepEqual(r.media, [{ media:"IDX Channel", program:"TICKER TALK", n:1 }]);
assert.equal(r.camps[0].int.length, 1); assert.equal(r.camps[0].ig.length, 1);
// angka awal YTD dengan upto >= bulan periode diabaikan
assert.equal(calc(L, { from:"2026-10-01", to:"2026-10-31", camp:[], typed:{}, ytd:{ upto:"2026-10", ext:999 }, ytdInt:0, yearExt:3, extAfter:0 }).art.ytdExt, 3);
// periode kosong
const e = calc([], { from:"2026-10-01", to:"2026-10-31", camp:["KISI Challenge"], typed:{}, ytd:null, ytdInt:0, yearExt:0, extAfter:0 });
assert.deepEqual(e.art, { int:0, ext:0, ytdInt:0, ytdExt:0 }); assert.equal(e.rows.length, 0); assert.equal(e.camps.every(c => !c.int.length && !c.ext.length), true);
assert.match(pg, /id="rCamp"/); assert.match(pg, /api\("\/api\/kisi\/sync"/);
```
- [ ] **Step 2: Gagal.** **Step 3: Implementasi** (`cwCalc` diakhiri `\n}\n` agar bisa diekstrak; `cwDoc` tidak membuat halaman detail/galeri bila kosong). **Step 4: Lolos; di lokal buat Laporan Copywriter Oktober (PDF & PPT) dan bandingkan dengan 15 slide contoh user.**
- [ ] **Step 5: Commit** — `Laporan Copywriter: format deck Canva (ringkasan, detail artikel, narasumber, galeri kampanye)`

### Task 9: Uji di Cloudflare & impor Canva

**Files:** tidak ada perubahan kode kecuali hasil uji menuntut.

- [ ] **Step 1:** Minta izin user untuk deploy Content Planner (skrip deploy yang ada di repo); jangan deploy tanpa izin.
- [ ] **Step 2:** Setelah deploy: buat Laporan Copywriter Oktober 2026. Cek catatan dialog: tidak ada "kisi.co.id tidak bisa diambil"; video YouTube tercatat views (bukan hanya angka manual). Catat hasilnya.
- [ ] **Step 3:** User mengimpor PPT ke Canva (Create → Import file). Cek: tabel tetap tabel yang bisa diedit, judul artikel tetap link, huruf Inter tidak berganti. Bila tabel pecah: kembali ke Task 7 dengan temuan konkret.
- [ ] **Step 4:** Laporkan ke user apa yang otomatis berjalan dan apa yang jatuh ke isian manual.
