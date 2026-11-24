# Copywriter Simpel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab Copywriter menjadi satu layar: unggah Word atau tempel teks → pilih tujuan → pilihan kecil → Buat. Semua isi diambil dari file, tanpa data contoh tersimpan.

**Architecture:** Worker (`apps/copy-studio/worker.js`): prompt `cw_brief` mengambil bahan dari teks file, dan data program dihapus. Browser (`apps/copy-studio/assets/cw.js` + `page.html`): empat panel input diganti satu panel bersama. Tampilan hasil dan mesin per jenis (artikel, review, brief, PR) dipakai ulang.

**Tech Stack:** Cloudflare Worker, ES module browser, tes `node apps/copy-studio/test.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-25-copywriter-simpel-design.md` (lanjutan dari `2026-11-24-copywriter-tab-design.md`)

## Global Constraints
- Tidak ada data contoh tersimpan: `CW_DEFAULT.program`, `cleanProgram`, kunci meta `cw_program`, dan teks "Beyond Tomorrow", "BYD Denza D9", "Sahamology", "Kuliah Saham" tidak boleh lagi ada di `worker.js`, `cw.js`, atau `page.html`.
- Bentuk hasil tidak berubah (artikel IGS, press release, brief per slide, review + Track Changes).
- Teks otomatis tetap persis sama: `DISC_ARTICLE`, `BYLINE`, `OPENER`, `PRIZE_DISC`, 4 baris disclaimer SNS, dan "Tentang KISI".
- Data yang tidak ada di file ditulis `[perlu dilengkapi: …]`, tidak dikarang. Kalimat anti-karang yang sudah ada tetap dipakai di semua prompt `cw_*`.
- Semua teks AI atau file yang masuk ke innerHTML lewat `esc()`. cw.js tidak boleh menyentuh DOM di level atas modul.
- Pesan commit diakhiri dengan `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. File Word kosong atau teks kosong lalu Buat ditekan → toast "Unggah file atau tempel teks dulu." dan tidak ada panggilan AI (Task 2).
2. Pengguna mengganti tujuan setelah hasil muncul → hasil lama disembunyikan, tidak tercampur (Task 2).
3. Brief SNS tanpa partner dan file juga tidak menyebut partner → satu versi umum, dan baris disclaimer "… tidak terafiliasi …" dilewati (tes `snsDisclaimer("", …)`, Task 1).
4. File .xlsx/.pdf dipilih saat tujuannya bukan Cek wording → toast "File Excel/PDF hanya untuk Cek wording." (Task 2).
5. Tombol Buat ditekan dua kali → tombol nonaktif dan bertuliskan "Menulis…"/"Mengecek…" sampai selesai (Task 2).

---

### Task 1: Worker & helper: brief dari teks file, data program dihapus

**Files:**
- Modify: `apps/copy-studio/worker.js` (CW_DEFAULT, cleanProgram, `/api/cw`, prompt/parse `cw_brief`, komentar kepala)
- Modify: `apps/copy-studio/assets/cw.js` (`snsDisclaimer`, `briefText`)
- Test: `apps/copy-studio/test.mjs`

**Interfaces:**
- Produces:
  - `CW_DEFAULT = { pr: { about, contact: "" } }`. `GET /api/cw` mengembalikan `{ pr }`, `POST /api/cw` hanya menerima `{ pr }`. `cleanProgram` dihapus.
  - `prompt("cw_brief", { text, type:"media"|"sns", partners?:string[], format?, platform?, date? })` mengembalikan `null` kalau `text` kosong. `text` dibatasi 12000.
    - Prompt meminta AI mengambil nama program, periode, hadiah, kategori, link, dan partner **hanya dari teks**. Yang tidak ada ditulis `[perlu dilengkapi: …]`.
    - SNS tanpa `partners`: AI memakai partner yang disebut di teks. Kalau tidak ada, satu entri dengan `partner: ""`.
  - Format JSON `cw_brief` ditambah `"asset_url":""` (diambil dari teks kalau ada). `parse` mengembalikan `{ media, sns, asset_url }`.
  - `snsDisclaimer(partner, assetUrl, format)`: kalau `partner` kosong, baris "… tidak terafiliasi …" dilewati.
  - `briefText(res, opts)`: entri dengan `partner` kosong berjudul `"<platform> <Format label>"` tanpa nama. Link aset diambil dari `res.asset_url`.

- [ ] **Step 1: Tulis tes yang gagal.** Ganti tes lama yang memakai `CW_DEFAULT.program` dan `cw0.program` dengan tes berikut:
```js
const BR = "KISI Challenge: Tantangan Baru. Periode 1–31 Januari 2027. Hadiah utama mobil listrik. Partner: Komunitas A, Komunitas B. Link aset: https://drive.example/a";
assert.equal(prompt("cw_brief", { text: " ", type: "media" }), null);
const pb2 = prompt("cw_brief", { text: BR, type: "sns", partners: [], format: "carousel" }).user;
assert.match(pb2, /Tantangan Baru/); assert.match(pb2, /perlu dilengkapi/); assert.match(pb2, /Jangan mengarang/);
assert.match(prompt("cw_brief", { text: BR, type: "media" }).user, /350 kata/);
assert.equal(parse("cw_brief", '{"asset_url":"https://drive.example/a","sns":[]}').asset_url, "https://drive.example/a");
assert.ok(!/tidak terafiliasi/.test(CW.snsDisclaimer("", "", "single")));
assert.match(CW.briefText({ sns: [{ partner: "", frames: [{ label: "Slide 1", lines: ["x"] }] }], asset_url: "" }, { format: "carousel", platform: "IG" }), /^IG Carousel/);
const cwx = await (await call("/api/cw", { cookie: user })).json();
assert.equal(cwx.program, undefined); assert.equal(cwx.pr.contact, "");
for (const f of ["worker.js", "assets/cw.js", "page.html"]) assert.doesNotMatch(fs.readFileSync(new URL("./" + f, import.meta.url), "utf8"), /Beyond Tomorrow|BYD Denza|Sahamology|Kuliah Saham|cleanProgram/, f);
```
  Catatan: tes `page.html` di baris terakhir baru bisa lolos setelah Task 2. Untuk Task 1, cek `worker.js` dan `assets/cw.js` saja, lalu tambahkan `page.html` di Task 2.
- [ ] **Step 2: Jalankan dan pastikan gagal.** Perintah: `node apps/copy-studio/test.mjs`.
- [ ] **Step 3: Implementasi** sesuai Interfaces. Hapus juga helper dan formulir program di cw.js yang tidak lagi dipanggil hanya kalau penghapusannya tidak merusak `initBrief`. Pembersihan UI selesai di Task 2.
- [ ] **Step 4: Jalankan dan pastikan lolos.**
- [ ] **Step 5: Commit** `"Copy Studio Copywriter: brief dari teks file, data program contoh dihapus"`

### Task 2: Satu layar: file/teks → tujuan → pilihan → Buat

**Files:**
- Modify: `apps/copy-studio/page.html` (bagian `section[data-tab="cw"]`: ganti `#cwKind` dan input keempat panel dengan satu panel input. Wadah hasil per jenis tetap ada)
- Modify: `apps/copy-studio/assets/cw.js` (`init`, `initArticle`, `initReview`, `initBrief`, `initPr` menjadi satu alur input; hasil tetap dirender oleh kode per jenis yang sudah ada)
- Modify: `apps/copy-studio/i18n.js`, `README.md` (baris Copy Studio: "tab Copywriter: unggah Word/tempel teks lalu pilih artikel, cek wording, press release, atau brief KISI Challenge")
- Test: `apps/copy-studio/test.mjs`

**Interfaces:**
- Consumes: Task 1 (`cw_brief` dengan `text`, `/api/cw` hanya `pr`). Kind `cw_article`, `cw_review`/`cw_translate`, dan `cw_pr` (bahan di `hl.free`) tidak berubah.
- Produces: elemen `#cwFile` (input file: .docx, .xlsx, .pdf), `#cwPaste` (textarea, tersembunyi sampai tautan "atau tempel teks" diklik), tombol tujuan `[data-goal="article|review|pr|brief"]`, wadah pilihan `#cwOpts`, tombol `#cwGo`, dan tautan `#cwSettings` (hanya untuk `CS.canEdit`) yang membuka editor "Tentang KISI" dan Media Contact.
- Pilihan per tujuan (lihat spec bagian Tampilan):
  - artikel: penutup, plus nama/link promo kalau penutupnya promo
  - brief: media/SNS, format, platform (default "IG"), tanggal, partner (teks bebas dipisah koma)
  - review: centang "Tambah versi Inggris"
  - pr: tanpa pilihan
- Tombol `#cwGo` selama proses bertuliskan "Menulis…" (artikel/brief/pr) atau "Mengecek…" (review), nonaktif, lalu kembali seperti semula.

- [ ] **Step 1: Tulis tes yang gagal.** Ini cek statis di `page`, karena UI tidak diuji di Node:
```js
for (const id of ["cwFile", "cwPaste", "cwOpts", "cwGo", "cwSettings"]) assert.ok(page.includes(`id="${id}"`), id);
for (const g of ["article", "review", "pr", "brief"]) assert.ok(page.includes(`data-goal="${g}"`), g);
assert.ok(!page.includes('id="cwKind"') && !page.includes('id="prEvent"'), "formulir lama hilang");
```
  Tambahkan juga `page.html` ke pemeriksaan "tanpa data contoh" dari Task 1.
- [ ] **Step 2: Jalankan dan pastikan gagal.**
- [ ] **Step 3: Implementasi.**
  - Satu fungsi baca file dipakai bersama: docx → teks lewat `O.docxParagraphs`. Untuk review, file mentah tetap diteruskan ke alur review yang ada (Word/Excel/PDF + Track Changes).
  - Tujuan selain review dengan file .xlsx/.pdf → toast "File Excel/PDF hanya untuk Cek wording."
  - Teks kosong → toast "Unggah file atau tempel teks dulu."
  - Mengganti tujuan menyembunyikan hasil sebelumnya.
  - Tombol Buat diberi tulisan proses.
  - Hapus kode, markup, dan i18n formulir lama yang tidak terpakai lagi: data program, kolom highlight PR, centang partner, dan judul IGS terpisah. Judul kerja IGS diambil AI dari baris pertama naskah. Ubah prompt `cw_article` hanya kalau perlu, yaitu: "judul IGS = baris pertama bila pendek".
- [ ] **Step 4: Jalankan dan pastikan lolos.** Perintah: `node apps/copy-studio/test.mjs`.
- [ ] **Step 5: Commit** `"Copy Studio Copywriter: satu layar — unggah file, pilih tujuan, Buat"`
