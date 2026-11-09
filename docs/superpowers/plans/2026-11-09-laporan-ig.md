# Laporan IG Bulanan KISI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laporan PDF/PPT bulanan postingan Instagram KISI (gambar + like, comment, share, views, save, repost) di Content Planner.

**Architecture:** Gambar postingan diambil di tab Instagram oleh bookmarklet `plBookmark` (pola `grab`/`jpg` Content Insight), dikirim lewat `/ig-sync` → `/api/metrics/import`, disimpan di tabel `item_img` (planner-db). Angka baru `m_reposts` masuk `METRICS`. Jenis laporan baru `ig` memakai model dokumen laporan yang sudah ada (blok `cover/page/kpis/table`) ditambah blok baru `posts` (kartu bergambar) di `pdfDoc` dan `pptDoc`.

**Tech Stack:** Cloudflare Worker + D1, HTML/JS tanpa build (page.html), pptxgenjs 3.12 (sudah dimuat), test `node apps/content-planner/test.mjs` (node:sqlite).

**Spec:** `docs/superpowers/specs/2026-11-09-laporan-ig-design.md`

## Global Constraints
- Tidak ada tool/database baru; semua di `apps/content-planner/` (planner-db).
- Data URL gambar sah: `/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/`, panjang ≤ 950000.
- Gambar ±480px sisi lebar, WebP 0.75 (fallback JPEG 0.75) — sama dengan `jpg()` Content Insight.
- Kanal IG di laporan: `channel` cocok `/^IG|instagram/i` dan tidak cocok `/story/i`; `kind === "konten"`.
- Interaksi (urutan "teratas" & ER) = suka + komentar + simpan + bagikan + repost. Views tidak ikut.
- Teks UI baru Bahasa Indonesia di kode, padanan English di `apps/content-planner/i18n.js`.
- Literal `</script>` di dalam string JS wajib ditulis `<\/script>`.
- Tim regional tidak boleh memakai endpoint baru (tidak ditambahkan ke `REG_GET`/`REG_POST`).

## Review Focus
- Postingan tanpa gambar (gagal ambil, IG Story, isian manual lama) → kartu tetap tampil dengan kotak "Tanpa gambar", laporan tidak error.
- Bulan tanpa postingan IG → laporan tetap jadi, halaman ringkasan menulis "Belum ada postingan Instagram di periode ini."
- Impor 60 postingan bergambar sekaligus → tidak melewati batas D1 (gambar disimpan dalam batch kecil, 10 per batch).
- Gambar bukan data URL sah / terlalu besar dari bookmarklet → baris angka tetap tersimpan, gambarnya saja dilewati.
- Kegiatan dihapus → gambarnya ikut terhapus (tidak menumpuk di D1 yang penuh).

---

### Task 1: Server — repost, tabel gambar, endpoint gambar

**Files:**
- Modify: `apps/content-planner/worker.js` (COLS ±164, METRICS ±174, ensure() ±180, cleanMetricRow ±546, importMetrics ±557, deleteItem ±590, router GET/POST ±1320/±1345, komentar daftar rute di kepala file)
- Test: `apps/content-planner/test.mjs` (setelah blok impor metrics ±295)

**Interfaces:**
- Produces:
  - Kolom `items.m_reposts INTEGER`; `METRICS` = `[..., "m_shares", "m_reposts", "m_follows"]`.
  - `export const imgOk = (v) => string|null` — data URL sah atau null.
  - `cleanMetricRow(r)` mengembalikan juga `img` (hasil `imgOk(r.img)`, boleh null).
  - `GET /api/imgs?ids=a,b,c` (maks. 100 id) → `{ [id]: dataUrl }` (id tanpa gambar tidak ada di objek).
  - `POST /api/img { id, img }` → `{ ok: true }`; `img: ""` menghapus. Tolak `{error}` 400 kalau img tidak sah; 403 kalau `!canEditItem(me, item)`; 404-ish `{error:"Kegiatan ini sudah dihapus."}` kalau item tidak ada.
  - Tabel `item_img (id TEXT PRIMARY KEY, img TEXT NOT NULL, at TEXT)`.

- [ ] **Step 1: Tulis test yang gagal** di test.mjs (pakai `call`, `CI`, item `RR1` dari blok impor yang sudah ada):

```js
const PNG = "data:image/png;base64,iVBORw0KGgo=";
assert.equal(imgOk(PNG), PNG);
assert.equal(imgOk("data:image/svg+xml;base64,AAAA"), null, "svg ditolak");
assert.equal(imgOk("data:image/png;base64," + "A".repeat(950000)), null, "terlalu besar");
r = await call("/api/metrics/import", { ck: CI, body: { rows: [
  { link: "https://www.instagram.com/reel/RR1/", date: plus(3), m_likes: "250", m_reposts: "7", img: PNG },
  { link: "https://www.instagram.com/p/NEW1/", date: plus(1), m_likes: "31", img: "bukan-gambar" },
] } });
assert.equal(r.j.matched, 2, "gambar rusak tidak menggagalkan angka");
it = (await call("/api/items?id=" + cid, { ck: CI })).j;
assert.equal(it.m_reposts, 7);
let im = (await call(`/api/imgs?ids=${cid},${L.id}`, { ck: CI })).j;
assert.deepEqual(Object.keys(im), [cid]); assert.equal(im[cid], PNG);
assert.equal((await call("/api/img", { ck: CI, body: { id: L.id, img: "x" } })).status, 400);
assert.equal((await call("/api/img", { ck: DES, body: { id: L.id, img: PNG } })).status, 403, "bukan pembuat/PIC");
await call("/api/img", { ck: CI, body: { id: L.id, img: PNG } });
await call("/api/img", { ck: CI, body: { id: cid, img: "" } });
im = (await call(`/api/imgs?ids=${cid},${L.id}`, { ck: CI })).j;
assert.deepEqual(Object.keys(im), [L.id], "img kosong = hapus");
await call("/api/items/delete", { ck: CI, body: { id: L.id } });
assert.deepEqual((await call(`/api/imgs?ids=${L.id}`, { ck: CI })).j, {}, "ikut terhapus bersama kegiatan");
```
Tambahkan `imgOk` ke import `./worker.js` di atas file. (Kalau `DES` ternyata bisa mengedit `L` menurut `canEditItem`, ganti dengan sesi lain yang bukan pembuat/PIC/desainer/admin, mis. `COPY`.)

- [ ] **Step 2: Jalankan, pastikan gagal**
Run: `node apps/content-planner/test.mjs` — Expected: FAIL (`imgOk` tidak diekspor).

- [ ] **Step 3: Implementasi** di worker.js:
  - `COLS`: tambah `m_reposts: "INTEGER"` setelah `m_shares`; `METRICS` sesuai Interfaces.
  - `ensure()`: tambah `CREATE TABLE IF NOT EXISTS item_img (...)` ke batch.
  - `imgOk` (pola `ciDataImg` Content Insight) — diekspor.
  - `cleanMetricRow`: `out.img = imgOk(r.img)`; syarat "ada angka" tetap hanya `METRICS`.
  - `importMetrics`: catat `[id, img]` untuk baris cocok/dibuat yang punya `img`; setelah batch angka, `INSERT OR REPLACE INTO item_img` dalam batch berisi 10.
  - `deleteItem`: setelah item terhapus, `DELETE FROM item_img WHERE id=?`.
  - `GET /api/imgs`: `ensure`, id dari `ids` dipisah koma, dipotong 100, `SELECT id, img FROM item_img WHERE id IN (...)`.
  - `POST /api/img`: cek item ada + `canEditItem`; `img === ""` → DELETE, selain itu `imgOk` lalu `INSERT OR REPLACE` dengan `at = now`.
  - Daftar rute di komentar kepala file: tambah dua baris untuk `/api/imgs` & `/api/img`.

- [ ] **Step 4: Jalankan, pastikan lolos**
Run: `node apps/content-planner/test.mjs` — Expected: `semua cek lolos`.

- [ ] **Step 5: Commit** `Content Planner: angka repost & tabel gambar postingan (item_img)`

---

### Task 2: Bookmarklet & jendela /ig-sync — gambar + repost otomatis

**Files:**
- Modify: `apps/content-planner/page.html` — `function plBookmark(W)` (±722–750)
- Modify: `apps/content-planner/worker.js` — `IG_SYNC` (±1224) dan header CSP rute `/ig-sync` (izinkan `img-src data:` kalau CSP-nya membatasi gambar)
- Modify: `apps/content-planner/i18n.js` — teks baru /ig-sync

**Interfaces:**
- Consumes: `/api/metrics/import` menerima `row.img` dan `row.m_reposts` (Task 1).
- Produces: setiap pesan `{pl:"row", row}` dari bookmarklet membawa `row.img` (data URL atau `""`) dan `row.m_reposts` (angka atau `""`).

- [ ] **Step 1: Ubah `plBookmark`**
  - Salin `jpg(el,w0,h0)` dan `grab(url)` dari bookmarklet Content Insight (`apps/content-insight/worker.js`, cari `function jpg(el,w0,h0)`), dengan `mx=480`.
  - Sumber gambar per postingan: `(it.image_versions2 || (it.carousel_media && it.carousel_media[0] && it.carousel_media[0].image_versions2) || {}).candidates`; pilih kandidat dengan `width >= 480` yang terkecil, kalau tidak ada pakai yang terbesar.
  - `o.m_reposts = it.repost_count ?? it.reshare_count ?? ""` (angka ≥ 0 saja).
  - `grab(src).then(img => { o.img = img; t.postMessage(...) })` — postMessage menunggu gambar; jeda antar postingan tetap 600 ms.
  - Pesan `alert(...)` baru wajib berupa string literal dalam kutip dua (diterjemahkan otomatis oleh regex `alert\("..."\)`).
- [ ] **Step 2: Ubah `IG_SYNC`**: kolom pertama tabel = thumbnail 36×36 (`<img src=row.img>` kalau ada, kosong kalau tidak), tambah kolom "Repost"; teks kecil di bawah diganti: "Angka publik (suka, komentar, views, repost) dan gambar postingan. Jangkauan, simpan, dan bagikan diisi dari CSV Meta Business Suite atau manual." Ingat `<\/script>` dan `\\/` sesuai string template yang ada.
- [ ] **Step 3: Cek sintaks** — Run: `node apps/content-planner/test.mjs` (worker termuat) dan
  `node -e "const s=require('fs').readFileSync('apps/content-planner/page.html','utf8');const m=s.match(/function plBookmark\(W\)\{[\s\S]*?\n\}\n/);new Function('return '+m[0])"` — Expected: tanpa error.
- [ ] **Step 4: Uji manual (oleh user, butuh login IG)**: profil IG KISI → klik bookmark → jendela /ig-sync menampilkan thumbnail; Simpan → `/api/imgs` berisi gambar. Catat hasilnya di laporan akhir.
- [ ] **Step 5: Commit** `Content Planner: bookmark IG ikut ambil gambar postingan & repost`

---

### Task 3: Dialog Performa & tab Performa — repost + gambar manual

**Files:**
- Modify: `apps/content-planner/page.html` — grup `#gMet` (±380), `MK`/`inter` (±698–700), tabel tab Performa (±712), peta header CSV (±760), isi/simpan dialog (±981–1025)
- Modify: `apps/content-planner/i18n.js`

**Interfaces:**
- Consumes: `GET /api/imgs?ids=`, `POST /api/img` (Task 1).

- [ ] **Step 1: Repost**
  - HTML: input `#mReposts` label "Repost" setelah `#mShares`.
  - `MK`: sisipkan `["mReposts","m_reposts","Repost"]` setelah Bagikan; tabel bulan ini memakai `MK.slice(0,7)` dan `colspan` +1.
  - `inter`: tambah `(+i.m_reposts||0)`; catatan ER di bawah tabel ikut menyebut repost.
  - Peta CSV: `["m_reposts",/^reposts?|dibagikan ulang|posting ulang/i]` — taruh **sebelum** entri `m_shares` supaya "Reposts" tidak tertangkap regex bagikan.
- [ ] **Step 2: Gambar postingan** di `#gMet` (hanya tampil kalau kegiatan sudah tersimpan / punya id):
  - Pratinjau `<img id="mImg">` maks. 120px + tombol "🖼 Pilih gambar" (file `image/*`), "Hapus gambar", dan tempel (`paste` event pada dialog saat `#gMet` terlihat).
  - Kecilkan di browser ke 480px WebP 0.75 / JPEG 0.75 (pola `shrinkCover` Content Insight), lalu `api("/api/img",{id,img})`. Saat dialog dibuka: `api("/api/imgs?ids="+id)` untuk pratinjau.
  - Gagal simpan → pesan di `#mInfo` (bukan alert).
- [ ] **Step 3: Verifikasi** — Run: `node apps/content-planner/test.mjs` lalu buka page.html lewat headless Chrome `--dump-dom` seperti sebelumnya: tidak ada kode yang bocor ke halaman, script utama utuh.
- [ ] **Step 4: Commit** `Content Planner: isian repost & unggah gambar postingan di Performa`

---

### Task 4: Jenis laporan "Laporan IG" (PDF & PPT)

**Files:**
- Modify: `apps/content-planner/page.html` — tombol `rType` (±468), `setRT`/`openRep` (±1211–1228), `REP` (±1946), `repFile`, `pdfDoc` (loop blok ±1737), `pptDoc`, CSS `MR_CSS` (±1564)
- Modify: `apps/content-planner/i18n.js`

**Interfaces:**
- Consumes: `/api/items?from=&to=`, `/api/imgs?ids=` (Task 1), `inter` (Task 3).
- Produces:
  - `async function igData(div) -> { from, to, per, month, items: [item & {img}] }` (urut `date` naik).
  - `function igDoc(R) -> { div, per, blocks }`.
  - Blok baru `{ t:"posts", h3, items:[{ img, date, title, ch, m:[[label, value], ...6] }] }`.

- [ ] **Step 1: UI**
  - Tombol `<button type="button" data-t="ig">Laporan IG</button>` di `#rType`; disembunyikan untuk regional (aturan `openRep` yang sudah ada).
  - `setRT("ig")`: sembunyikan `rProgF`, `rWhoF`, `rKindsF`, `rBrF`, `rTeamF`; teks bantuan: "Laporan bulanan Instagram KISI: semua postingan IG yang tayang di periode ini beserta gambar, suka, komentar, bagikan, views, simpan, dan repost. Gambar & angka diambil lewat tombol bookmark \"Angka IG ke Planner\" di tab Performa." + teks `pdf` yang sudah ada.
  - Saat memilih `ig`, periode diisi bulan lalu (pakai logika tombol `data-per="-1"` yang ada).
- [ ] **Step 2: Data & dokumen**
  - `igData`: validasi periode seperti `monData`; filter kanal sesuai Global Constraints; ambil gambar lewat `/api/imgs` per 100 id.
  - `igDoc` blok berurutan:
    1. `cover`: `lines:["Laporan Instagram", R.per]`, `sub: B.company||R.div`.
    2. `page`: `h2:"Ringkasan"`, `sub:`${R.per} · ${n} postingan``.
    3. `kpis`: Postingan, Views, Suka, Komentar, Bagikan, Simpan, Repost (total).
    4. `posts` h3 "3 postingan teratas" (urut `inter` turun, maks. 3) — atau `page` berisi catatan kosong (lihat Review Focus).
    5. `page` h2 "Semua postingan" + `posts` (semua, urut tanggal).
  - `REP.ig = {data:igData, doc:igDoc, name:"Laporan Instagram"}`; `repFile` memakai nama itu + periode.
- [ ] **Step 3: Render blok `posts`**
  - `pdfDoc`: grid 4 kolom × 2 baris per halaman (8 kartu); kartu = gambar 1:1 `object-fit:cover` (atau kotak abu "Tanpa gambar"), tanggal, judul 2 baris terpotong, 6 angka dalam grid 3×2. Masukkan per baris (4 kartu) lewat `put()` supaya pindah halaman otomatis. Kelas CSS baru di `MR_CSS`: `.mr-posts`, `.mr-post`, `.mr-post img`, `.mr-noimg`.
  - `pptDoc`: susun kartu sama (4×2 per slide) dengan `s.addImage({data:img,...,sizing:{type:"cover"}})` dan `addText`; tanpa gambar → kotak abu + teks.
  - `trDoc` tidak perlu diubah (blok selain cover/page/kpis/table diteruskan apa adanya); label angka diterjemahkan lewat `T()` saat membuat dokumen.
- [ ] **Step 4: Verifikasi**
  - Run: `node apps/content-planner/test.mjs` — Expected: `semua cek lolos`.
  - Headless Chrome: halaman uji di scratchpad yang memanggil `pdfDoc(igDoc(R))` dengan 0, 3, dan 11 postingan contoh (sebagian tanpa gambar) → simpan screenshot; periksa 11 postingan = 2 halaman kartu, kotak "Tanpa gambar" muncul, bulan kosong tidak error.
- [ ] **Step 5: Commit** `Content Planner: Laporan IG bulanan (PDF & PPT, kartu bergambar)`

---

### Task 5: Dokumentasi
- [ ] Tambah ke komentar kepala `worker.js` & README Content Planner (kalau ada): Laporan IG, tabel `item_img`, kolom `m_reposts`.
- [ ] Commit `Content Planner: catatan Laporan IG`. Deploy hanya kalau user meminta.
