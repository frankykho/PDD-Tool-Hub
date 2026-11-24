# Tab Copywriter (Copy Studio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satu tab "Copywriter" di Copy Studio dengan empat jenis: Artikel berita (IGS → website), Cek wording file (Word/Excel + Track Changes), Brief KISI Challenge, dan Press release.

**Architecture:**
- **Worker** (`apps/copy-studio/worker.js`) mendapat `kind` AI baru di `prompt()`/`parse()`, rute simpan/baca `cw_program` & `cw_pr` di tabel `meta`, dan `GET /api/quota`.
- **Logika browser** ada di dua modul ES di `assets/` (publik, di-`import()` lazy seperti `/banner.js`, dan bisa diuji Node):
  - `assets/office.js`: XML docx/xlsx murni, tanpa DOM dan tanpa zip.
  - `assets/cw.js`: helper teks dan UI tab.
- **Zip** dibuka/ditulis di halaman dengan JSZip dari cdnjs. PDF dibaca dengan pdf.js dari cdnjs.

**Tech Stack:** Cloudflare Workers, D1 `copy-db` (tabel `meta`), `shared/ai.js`, `shared/compliance.js` (browser: `window.Compliance.check`), JSZip 3.10.1, pdf.js 3.11.174, tes `node apps/copy-studio/test.mjs` (Node 22.15+, `node:sqlite`).

**Spec:** `docs/superpowers/specs/2026-11-24-copywriter-tab-design.md`

## Global Constraints

- `COPY_AI_DAILY` = `"100"` di `apps/copy-studio/wrangler.jsonc` **dan** `apps/copy-studio/wrangler.deploy.json`.
- Tidak ada database D1 baru. Simpan hanya di tabel `meta` `copy-db`, dengan kunci `cw_program` dan `cw_pr`.
- File Word/Excel/PDF diolah di browser. Ke `/api/ai` hanya dikirim teks.
- AI tidak boleh mengarang angka, nama, gelar, jabatan, tanggal, link, atau kutipan. Semua prompt `cw_*` memuat kalimat: `Gunakan HANYA fakta dari bahan. Jangan mengarang angka, nama, gelar, jabatan, tanggal, link, atau kutipan.`
- Teks baku persis (salin dari lampiran spec, jangan diubah):
  - `DISC_ARTICLE` = `Disclaimer: Semua investasi memiliki risiko. Lakukan analisis mandiri dan pahami potensi kerugian sebelum mengambil keputusan.`
  - `BYLINE` = `Dimuat oleh Tim Investment Growth Specialist KISI.`
  - `OPENER` = `Behind The Candle – `
  - `FIXED_TAGS` = `["iKISI", "KISI", "Behind The Candle"]`
  - `PRIZE_DISC` = `Hadiah adalah bentuk apresiasi aktivitas transaksi, bukan jaminan keuntungan investasi. Pastikan Anda memahami risiko sebelum bertransaksi.`
  - 4 baris disclaimer SNS dan teks "Tentang KISI" dari lampiran spec.
- Media Contact **tidak** ditulis di repo. Isi awal `cw_pr.contact` = `""`.
- Logo kop press release = `brand/kisi-color.png`, disalin ke `apps/copy-studio/assets/brand/kisi-color.png`.
- Track Changes: penulis `"Copy Studio"`, tanggal ISO tanpa milidetik (`2026-11-24T10:00:00Z`).
- Semua teks UI baru dalam bahasa Indonesia, dengan padanan Inggris di `apps/copy-studio/i18n.js`. Hasil AI dan isian pengguna diberi `translate="no"`.
- Ikuti gaya kode yang ada: helper `str()`, `json()`, `HUBSSO.sameOrigin`, `canEdit` untuk simpan.

## Review Focus

1. **Teks asli yang terpecah di beberapa run** (`<w:r>`), misalnya "Adver" + "stisement" karena bekas edit atau spellcheck. Saran harus tetap bisa diterapkan. Uji: `applyDocx` dengan anchor lintas run (Task 4).
2. **Karakter XML** `& < > "` di teks asli maupun saran (contoh "Garmen & Alas Kaki"). Hasilnya harus di-escape dan file tetap terbuka di Word/Excel. Uji di Task 4 dan Task 5.
3. **Shared string dipakai beberapa sel Excel.** Mengubah satu sel tidak boleh ikut mengubah sel lain. Sel yang berubah ditulis sebagai `inlineStr`. Uji di Task 5.
4. **Teks asli tidak ditemukan** (AI salah kutip). Temuan tetap tampil dengan status "tidak bisa diterapkan otomatis", dan file tidak rusak. Uji di Task 4.
5. **Format angka Indonesia di artikel** (`90,4%`, `0%`, `2027`). Cek angka harus mengenali angka yang sama walau spasinya berbeda, dan menandai angka yang hilang atau berubah. Uji di Task 3.

---

### Task 1: Fondasi: kuota 100, data cw_*, kuota sisa, tab kosong

**Files:**
- Modify: `apps/copy-studio/wrangler.jsonc` (vars), `apps/copy-studio/wrangler.deploy.json:33`
- Modify: `apps/copy-studio/worker.js`: rute baru di blok `fetch` (setelah `/api/style`), default `|| 60` menjadi `|| 100`, komentar kepala file
- Modify: `apps/copy-studio/page.html`: `TABS` (tambah `["cw", "Copywriter"]` setelah `"cek"`), `<section data-tab="cw">`
- Create: `apps/copy-studio/assets/cw.js` (kerangka modul)
- Copy: `brand/kisi-color.png` → `apps/copy-studio/assets/brand/kisi-color.png`
- Test: `apps/copy-studio/test.mjs`

**Interfaces:**
- Produces (worker):
  - `export const CW_DEFAULT = { program: {...data program awal dari lampiran spec, link_aset: ""}, pr: { about: "<Tentang KISI>", contact: "" } }`
  - `export function cleanProgram(b) -> {name, theme, period, platforms, event_url, account_url, prizes:[{emoji,text,main:boolean}], general:{count,rule}, uni:{total,teams:[string],individual:[string]}, previous, partners:[string], asset_url}`: string dipotong dengan `str()`, maksimal 30 hadiah dan 20 partner.
  - `export function cleanPr(b) -> {about, contact}`: `about` ≤ 3000, `contact` ≤ 600.
  - `GET /api/cw` mengembalikan `{program, pr}`. Belum tersimpan = `CW_DEFAULT`.
  - `POST /api/cw` dengan `{program?, pr?}` hanya untuk `canEdit` (selain itu 403). Masing-masing disimpan ke `meta` `cw_program` / `cw_pr` dan mengembalikan `{ok:true, program, pr}`.
  - `GET /api/quota` mengembalikan `{used, limit}` untuk `ai` hari ini (WIB, kunci sama dengan `spend`).
- Produces (page): `<section data-tab="cw">` berisi `<select id="cwKind">` dengan opsi `article|review|brief|pr`, empat `<div data-cw="article|review|brief|pr">`, dan `import("/cw.js")` saat tab dibuka pertama kali, yang memanggil `mod.init(window.CS)`.
- Produces (cw.js): `export function init(cs)`, `export const libs = { jszip: () => Promise<JSZip>, pdf: () => Promise<pdfjsLib> }`. Keduanya memuat skrip cdnjs sekali (jszip/3.10.1/jszip.min.js; pdf.js/3.11.174/pdf.min.js + worker).

- [ ] **Step 1: Tulis tes yang gagal** di `test.mjs` bagian worker:
```js
const q0 = await (await call("/api/quota", { cookie: user })).json();
assert.deepEqual(q0, { used: 0, limit: 2 });               // env tes COPY_AI_DAILY "2"
const cw0 = await (await call("/api/cw", { cookie: user })).json();
assert.equal(cw0.pr.contact, "");
assert.match(cw0.pr.about, /kode broker BQ/);
assert.ok(cw0.program.prizes.some((p) => p.main && /BYD Denza D9/.test(p.text)));
assert.equal((await call("/api/cw", { cookie: user, json: { pr: { contact: "x" } } })).status, 403);
const cw1 = await (await call("/api/cw", { cookie: editor, json: { pr: { about: "A", contact: "B" } } })).json();
assert.deepEqual(cw1.pr, { about: "A", contact: "B" });
assert.equal((await (await call("/api/cw", { cookie: user })).json()).pr.contact, "B");
assert.ok(page.includes('["cw", "Copywriter"]') && page.includes('id="cwKind"') && page.includes('import("/cw.js")'));
assert.ok(fs.existsSync(new URL("./assets/brand/kisi-color.png", import.meta.url)));
for (const f of ["wrangler.jsonc", "wrangler.deploy.json"]) assert.match(fs.readFileSync(new URL("./" + f, import.meta.url), "utf8"), /"COPY_AI_DAILY": "100"/);
```
- [ ] **Step 2: Jalankan dan pastikan gagal.** `node apps/copy-studio/test.mjs`. Harus gagal karena `/api/quota` 404 (JSON parse error).
- [ ] **Step 3: Implementasi.** Kerjakan `CW_DEFAULT`, `cleanProgram`, `cleanPr`, ketiga rute, kuota 100, salin logo, section dan tab, lalu `assets/cw.js` dengan `init` (pemilih `cwKind` menampilkan satu `div[data-cw]`, pilihan diingat di `localStorage` `cs_cw` dalam try/catch) dan `libs`. Tambahkan kunci i18n "Copywriter", "Artikel berita", "Cek wording file", "Brief KISI Challenge", "Press release".
- [ ] **Step 4: Jalankan dan pastikan lolos.** `node apps/copy-studio/test.mjs`, harus selesai tanpa error.
- [ ] **Step 5: Commit** `git add apps/copy-studio && git commit -m "Copy Studio: tab Copywriter (kerangka), data program & press release, kuota AI 100"`

### Task 2: office.js: baca docx dan buat docx baru

**Files:**
- Create: `apps/copy-studio/assets/office.js`
- Test: `apps/copy-studio/test.mjs` (bagian baru `/* ---------- office.js ---------- */`, `const O = await import("./assets/office.js")`)

**Interfaces:**
- Produces:
  - `export const xmlEsc = (s) => string`, escape `& < > "`.
  - `export function docxParagraphs(documentXml) -> [{ i:number, text:string, inTable:boolean }]`
    - `i` = urutan `<w:p>` di `<w:body>`, termasuk paragraf di dalam tabel.
    - `text` = gabungan semua `<w:t>`, dengan `<w:tab/>` menjadi `\t` dan `<w:br/>` menjadi `\n`.
  - `export function makeDocx(blocks, opts) -> { [path]: string | Uint8Array }`
    - `blocks`: `[{ t:"p"|"h1"|"h2"|"li"|"img", runs?:[{text, b?, i?}], img?:{data:Uint8Array, w, h, ext:"png"|"jpeg"} }]`
    - `opts`: `{ logo?: {data, w, h} }`. Logo dipasang di header.
    - Isi wajib: `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/styles.xml` (Heading1/Heading2/ListBullet), `word/_rels/document.xml.rels`, dan bila ada gambar: `word/media/*` + `word/header1.xml`.
  - `export function zipFiles(JSZip, files) -> Promise<Blob>` dan `export function unzip(JSZip, blob) -> Promise<{[path]: string|Uint8Array}>`. File `.xml`/`.rels` sebagai string, lainnya `Uint8Array`.

- [ ] **Step 1: Tulis tes yang gagal:**
```js
const DOC = `<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Adver</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">stisement &amp; Co</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Termyn</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>I</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>`;
assert.deepEqual(O.docxParagraphs(DOC), [{ i: 0, text: "Adverstisement & Co", inTable: false }, { i: 1, text: "Termyn\tI", inTable: true }]);
const f = O.makeDocx([{ t: "h1", runs: [{ text: "Judul & <x>", b: true }] }, { t: "p", runs: [{ text: "Jakarta", b: true }, { text: " – isi", i: true }] }], {});
assert.ok(f["[Content_Types].xml"] && f["word/document.xml"] && f["word/styles.xml"]);
assert.match(f["word/document.xml"], /Judul &amp; &lt;x&gt;/);
assert.match(f["word/document.xml"], /<w:b\/>[\s\S]*Jakarta/);
assert.deepEqual(O.docxParagraphs(f["word/document.xml"]).map((p) => p.text), ["Judul & <x>", "Jakarta – isi"]);
const fl = O.makeDocx([{ t: "p", runs: [{ text: "x" }] }], { logo: { data: new Uint8Array([137, 80]), w: 200, h: 60 } });
assert.ok(fl["word/media/logo.png"] && /header1\.xml/.test(fl["word/_rels/document.xml.rels"]));
```
- [ ] **Step 2: Jalankan dan pastikan gagal.** Harus gagal karena modul tidak ada (ERR_MODULE_NOT_FOUND).
- [ ] **Step 3: Implementasi** dengan string/regex saja, tanpa DOMParser, supaya bisa diuji di Node. Ukuran gambar dalam EMU = px × 9525.
- [ ] **Step 4: Jalankan dan pastikan lolos.**
- [ ] **Step 5: Commit** `"Copy Studio: office.js baca & buat docx"`

### Task 3: Artikel berita (IGS → website)

**Files:**
- Modify: `apps/copy-studio/worker.js` (`prompt`/`parse` kind `cw_article`, komentar kepala file)
- Modify: `apps/copy-studio/assets/cw.js` (helper + formulir artikel)
- Modify: `apps/copy-studio/page.html` (markup `div[data-cw="article"]`)
- Modify: `apps/copy-studio/i18n.js`
- Test: `apps/copy-studio/test.mjs`

**Interfaces:**
- Consumes: `docxParagraphs`, `makeDocx`, `unzip`, `zipFiles` (Task 2), `libs.jszip` (Task 1), `GET /api/cw` (program untuk bridging).
- Produces (worker):
  - `prompt("cw_article", { text, title, close:"none"|"brand"|"promo", promo?:{name, url} })`. Mengembalikan `null` bila `text` kosong. `text` ≤ 12000.
  - Isi prompt: 3–5 judul dari judul IGS; perbaikan ejaan/kalimat sebagai daftar `edits`; isi tidak boleh ditulis ulang; angka, nama, dan kutipan dilarang berubah; 3–4 tag; paragraf penutup 2–3 kalimat hanya untuk `brand`/`promo`.
  - Format JSON: `{"titles":[""],"edits":[{"from":"","to":"","why":""}],"tags":[""],"closing":""}`
  - `parse("cw_article")` mengembalikan `{titles≤5, edits≤40 (from wajib ada & ≠ to), tags≤4, closing}`.
- Produces (cw.js):
  - `export const OPENER, BYLINE, DISC_ARTICLE, FIXED_TAGS, PRIZE_DISC` (nilai dari Global Constraints).
  - `export function numbers(text) -> string[]`: semua token angka, dinormalkan (spasi dibuang). Contoh `"90,4%"`, `"21 November 2026"` → `["90,4%","21","2026"]`. Regex: `/\d+(?:[.,]\d+)*%?/g`.
  - `export function missingNumbers(src, out) -> string[]`: angka di `src` yang jumlah kemunculannya di `out` berkurang.
  - `export function applyEdits(text, edits) -> { text, skipped: edits[] }`: setiap `from` diganti satu kali, sesuai urutan. Yang tidak ketemu masuk `skipped`.
  - `export function buildArticle({ body, title, closing, close, tags }) -> { title, text, tags }`
    - `text` = body yang diawali `OPENER` (kalau belum), lalu `closing` (kalau ada) sebelum `BYLINE`, lalu `BYLINE` dan `DISC_ARTICLE`. Keduanya tidak digandakan kalau sudah ada di body.
    - Kalau `close==="promo"`, `PRIZE_DISC` ditambahkan setelah `closing`.
    - `tags` = tag AI + `FIXED_TAGS`, tanpa duplikat (tidak peka huruf besar/kecil).

- [ ] **Step 1: Tulis tes yang gagal:**
```js
const CW = await import("./assets/cw.js");
const IGS = "Indonesia dan Uni Eropa resmi menandatangani IEU-CEPA pada 21 November 2026. Sebanyak 90,4% pos tarif mendapat bea masuk 0% pada 2027.\nDimuat oleh Tim Investment Growth Specialist KISI.";
assert.deepEqual(CW.numbers("90,4% pos, 0% pada 2027"), ["90,4%", "0%", "2027"]);
assert.deepEqual(CW.missingNumbers(IGS, IGS.replace("90,4%", "90%")), ["90,4%"]);
assert.deepEqual(CW.missingNumbers(IGS, IGS), []);
const ae = CW.applyEdits("Termyn I dan Termyn II", [{ from: "Termyn", to: "Termin" }, { from: "tidak ada", to: "x" }]);
assert.equal(ae.text, "Termin I dan Termyn II"); assert.equal(ae.skipped.length, 1);
const art = CW.buildArticle({ body: IGS, title: "Deal Indonesia-Eropa, Peluang Baru Buat Sektor Ini!", closing: "Ikuti KISI Challenge.", close: "promo", tags: ["IEU-CEPA", "kisi"] });
assert.ok(art.text.startsWith("Behind The Candle – Indonesia"));
assert.equal(art.text.split("Dimuat oleh Tim Investment Growth Specialist KISI.").length, 2, "byline tidak dobel");
assert.ok(art.text.indexOf("Ikuti KISI Challenge.") < art.text.indexOf("Dimuat oleh"));
assert.ok(art.text.includes(CW.PRIZE_DISC) && art.text.endsWith(CW.DISC_ARTICLE));
assert.deepEqual(art.tags, ["IEU-CEPA", "kisi", "iKISI", "Behind The Candle"]);
assert.equal(prompt("cw_article", { text: " " }), null);
const pa = prompt("cw_article", { text: IGS, title: "Deal Indonesia-Eropa", close: "brand" }).user;
assert.match(pa, /Deal Indonesia-Eropa/); assert.match(pa, /Jangan mengarang angka/); assert.match(pa, /penutup/i);
assert.doesNotMatch(prompt("cw_article", { text: IGS, close: "none" }).user, /paragraf penutup/i);
const ra = parse("cw_article", '{"titles":["A","B"],"edits":[{"from":"x","to":"y","why":"typo"},{"from":"z","to":"z"},{"to":"q"}],"tags":["t1"],"closing":""}');
assert.deepEqual(ra.edits, [{ from: "x", to: "y", why: "typo" }]);
```
- [ ] **Step 2: Jalankan dan pastikan gagal.**
- [ ] **Step 3: Implementasi** worker `cw_article` (temperature 0.4) dan helper `cw.js`. Lalu UI artikel:
  - Input: unggah .docx (dibaca lewat `unzip` + `docxParagraphs`, disatukan dengan `\n`) atau tempel teks, judul IGS, dan pilihan penutup. Kalau pilihannya promo, nama/link diisi otomatis dari `program` tapi masih bisa diubah.
  - Tombol "Buat artikel".
  - Hasil:
    - pilihan judul (radio)
    - daftar edit dengan centang terima (default semua)
    - kotak teks akhir yang bisa diedit
    - tag
    - peringatan `missingNumbers` (merah) dan hasil `window.Compliance.check`
  - Tombol "Salin" dan "Unduh .docx" (`makeDocx`: h1 judul, paragraf per baris, baris "Tag: …").
- [ ] **Step 4: Jalankan dan pastikan lolos.**
- [ ] **Step 5: Commit** `"Copy Studio Copywriter: artikel berita dari naskah IGS (judul, perbaikan, penutup branding/promo, cek angka)"`

### Task 4: office.js: terapkan saran ke Word (Track Changes / bersih) dan sisipkan versi Inggris

**Files:**
- Modify: `apps/copy-studio/assets/office.js`
- Test: `apps/copy-studio/test.mjs`

**Interfaces:**
- Consumes: `docxParagraphs`, `xmlEsc` (Task 2).
- Produces:
  - `export function applyDocx(documentXml, edits, { track:boolean, author:string, date:string }) -> { xml, applied:number[], failed:number[] }`
    - `edits`: `[{ id, p:number, from, to }]`, dengan `p` = indeks dari `docxParagraphs`. `applied`/`failed` berisi `id`.
    - Algoritme yang tidak ditentukan tes: di paragraf `p`, cari `from` di teks gabungan semua run. Pecah run di batas awal dan akhir kecocokan (rPr disalin ke tiap potongan).
    - `track:true`: run yang tercakup dibungkus `<w:del w:id w:author w:date>` (dengan `<w:t>` menjadi `<w:delText>`), lalu disusul `<w:ins …><w:r>{rPr run pertama}<w:t xml:space="preserve">to</w:t></w:r></w:ins>`.
    - `track:false`: run yang tercakup dibuang dan diganti run baru dengan rPr run pertama.
    - `w:id` unik, mulai 9001.
    - `from` yang tidak ketemu: XML paragraf tidak berubah dan id masuk `failed`.
  - `export function hasLangMarkers(documentXml) -> boolean`: true bila ada paragraf yang teksnya persis "ENGLISH" dan paragraf lain persis "INDONESIA" (tanpa peduli huruf besar/kecil, setelah trim).
  - `export function bodyBlocks(documentXml) -> string[]`: potongan XML level atas `<w:p>…</w:p>` dan `<w:tbl>…</w:tbl>` di body, tanpa `<w:sectPr>`.
  - `export function insertEnglish(documentXml, translated, { track, author, date }) -> string`
    - `translated`: `Map<paragraphIndex, string>`.
    - Semua `bodyBlocks` disalin. Di salinan, teks tiap paragraf diganti terjemahannya (semua run digabung menjadi run pertama).
    - Paragraf penanda "ENGLISH" disisipkan di depan salinan, paragraf "INDONESIA" sebelum blok asli. Seluruh isi baru dibungkus `<w:ins>` per run bila `track`.
    - `<w:sectPr>` tetap paling akhir.

- [ ] **Step 1: Tulis tes yang gagal** (`DOC` dari Task 2):
```js
const T = { track: true, author: "Copy Studio", date: "2026-11-24T10:00:00Z" };
const r1 = O.applyDocx(DOC, [{ id: "a", p: 0, from: "Adverstisement", to: "Advertisement" }, { id: "b", p: 1, from: "Termyn", to: "Termin" }, { id: "c", p: 0, from: "tidak ada", to: "x" }], T);
assert.deepEqual([r1.applied, r1.failed], [["a", "b"], ["c"]]);
assert.match(r1.xml, /<w:del [^>]*w:author="Copy Studio"[^>]*>[\s\S]*<w:delText[^>]*>Adver<\/w:delText>/);
assert.match(r1.xml, /<w:ins [^>]*w:date="2026-11-24T10:00:00Z"[^>]*>[\s\S]*Advertisement/);
assert.match(r1.xml, /<w:t xml:space="preserve"> &amp; Co<\/w:t>/, "sisa run tebal tetap, & tetap di-escape");
const clean = O.applyDocx(DOC, [{ id: "a", p: 0, from: "Adverstisement", to: "Advertisement & <b>" }], { ...T, track: false });
assert.equal(O.docxParagraphs(clean.xml)[0].text, "Advertisement & <b> & Co");
assert.doesNotMatch(clean.xml, /w:del|w:ins/);
assert.equal(O.applyDocx(DOC, [], T).xml, DOC);
assert.equal(O.hasLangMarkers(DOC), false);
const en = O.insertEnglish(DOC, new Map([[0, "Advertisement & Co"], [1, "Term\tI"]]), T);
assert.deepEqual(O.docxParagraphs(en).map((p) => p.text), ["ENGLISH", "Advertisement & Co", "Term\tI", "INDONESIA", "Adverstisement & Co", "Termyn\tI"]);
assert.ok(O.hasLangMarkers(en));
assert.ok(/<w:sectPr\/><\/w:body>/.test(en), "sectPr tetap di akhir");
```
- [ ] **Step 2: Jalankan dan pastikan gagal.**
- [ ] **Step 3: Implementasi** sesuai Interfaces.
- [ ] **Step 4: Jalankan dan pastikan lolos.**
- [ ] **Step 5: Commit** `"Copy Studio: office.js terapkan saran ke Word (Track Changes/bersih) & sisipkan versi Inggris"`

### Task 5: office.js: Excel (baca sel teks, ganti per sel, sheet Catatan Review & EN)

**Files:**
- Modify: `apps/copy-studio/assets/office.js`
- Test: `apps/copy-studio/test.mjs`

**Interfaces:**
- Consumes: `xmlEsc`.
- Produces:
  - `export function xlsxCells(files) -> [{ sheet:string, path:string, ref:string, text:string }]`
    - `files` = hasil `unzip`. Hanya sel `t="s"` (teks dari `xl/sharedStrings.xml`) dan `t="inlineStr"`. Sel angka dan sel rumus (`<f>`) dilewati.
    - Nama sheet diambil dari `xl/workbook.xml` + `xl/_rels/workbook.xml.rels`.
  - `export function applyXlsx(files, edits) -> { files, applied, failed }`
    - `edits`: `[{ id, path, ref, from, to }]`.
    - Sel yang diubah ditulis ulang sebagai `t="inlineStr"` `<is><t xml:space="preserve">…</t></is>`, dengan atribut `s` (style) tetap.
    - `sharedStrings.xml` tidak diubah.
  - `export function addSheet(files, name, rows) -> files`
    - `rows`: `string[][]`. Sheet baru `xl/worksheets/sheetN.xml` dengan sel `inlineStr`.
    - Daftarkan di `workbook.xml`, `workbook.xml.rels`, dan `[Content_Types].xml`. Nama dipotong 31 karakter, unik.
  - `export function copySheetTranslated(files, path, name, translated) -> files`
    - `translated`: `Map<ref, string>`. Salin sheet `path` dengan nama `name`, dan sel teks yang ada di `translated` diganti `inlineStr`.

- [ ] **Step 1: Tulis tes yang gagal:**
```js
const X = {
  "[Content_Types].xml": `<Types xmlns="t"><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  "xl/workbook.xml": `<workbook><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  "xl/sharedStrings.xml": `<sst><si><t>Adverstisement</t></si><si><t>Meta &amp; Google</t></si></sst>`,
  "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="s" s="3"><v>0</v></c><c r="B1" t="s"><v>0</v></c><c r="C1"><v>45000000</v></c><c r="D1"><f>C1*2</f><v>90000000</v></c><c r="E1" t="s"><v>1</v></c></row></sheetData></worksheet>`,
};
assert.deepEqual(O.xlsxCells(X).map((c) => [c.sheet, c.ref, c.text]), [["Budget", "A1", "Adverstisement"], ["Budget", "B1", "Adverstisement"], ["Budget", "E1", "Meta & Google"]]);
const xr = O.applyXlsx(X, [{ id: 1, path: "xl/worksheets/sheet1.xml", ref: "A1", from: "Adverstisement", to: "Advertisement & Co" }]);
const s1 = xr.files["xl/worksheets/sheet1.xml"];
assert.match(s1, /<c r="A1" t="inlineStr" s="3"><is><t xml:space="preserve">Advertisement &amp; Co<\/t><\/is><\/c>/);
assert.match(s1, /<c r="B1" t="s"><v>0<\/v><\/c>/, "sel lain yang memakai shared string sama tidak berubah");
assert.match(s1, /<f>C1\*2<\/f>/);
assert.equal(xr.files["xl/sharedStrings.xml"], X["xl/sharedStrings.xml"]);
const xs = O.addSheet(xr.files, "Catatan Review", [["Sel", "Sebelum", "Sesudah"], ["Budget!A1", "Adverstisement", "Advertisement & Co"]]);
assert.deepEqual(O.xlsxCells(xs).filter((c) => c.sheet === "Catatan Review").map((c) => c.text), ["Sel", "Sebelum", "Sesudah", "Budget!A1", "Adverstisement", "Advertisement & Co"]);
assert.match(xs["[Content_Types].xml"], /sheet2\.xml/);
const xe = O.copySheetTranslated(X, "xl/worksheets/sheet1.xml", "EN", new Map([["E1", "Meta and Google"]]));
assert.ok(O.xlsxCells(xe).some((c) => c.sheet === "EN" && c.ref === "E1" && c.text === "Meta and Google"));
assert.match(Object.entries(xe).find(([k, v]) => /sheet2/.test(k))[1], /<f>C1\*2<\/f>/, "rumus ikut tersalin");
```
- [ ] **Step 2: Jalankan dan pastikan gagal.**
- [ ] **Step 3: Implementasi** sesuai Interfaces.
- [ ] **Step 4: Jalankan dan pastikan lolos.**
- [ ] **Step 5: Commit** `"Copy Studio: office.js ganti teks sel Excel tanpa menyentuh rumus, sheet Catatan Review & EN"`

### Task 6: Cek tanpa AI: format angka, hitungan total, konsistensi EN–ID

**Files:**
- Modify: `apps/copy-studio/assets/cw.js`
- Test: `apps/copy-studio/test.mjs`

**Interfaces:**
- Consumes: `numbers` (Task 3).
- Produces (semua mengembalikan temuan `{ kind:"angka"|"hitungan"|"konsistensi", loc, from, to, why }`, dengan `to` boleh `""` bila tidak ada saran otomatis):
  - `export function numberFormatFindings(units)`
    - `units`: `[{ loc, text }]`. Ambil angka ribuan bertitik (`\d{1,3}(\.\d{3})+`) dan berkoma (`\d{1,3}(,\d{3})+`), lalu tentukan mayoritas (seri = titik).
    - Setiap angka minoritas jadi temuan dengan `to` = angka yang dikonversi.
  - `export function totalFindings(rows)`
    - `rows`: `[{ loc, label, value:number }]`, berurutan.
    - Untuk setiap baris yang `label` cocok `/^(grand\s*)?total$/i`: jumlah semua `value` sebelumnya sejak total terakhir dibandingkan dengan `value` total. Kalau beda, jadi temuan dengan `why` = `"Jumlah baris = <angka bertitik>"`.
  - `export function langFindings(enUnits, idUnits)`
    - Pasangkan menurut indeks. Untuk tiap pasangan, `numbers()` keduanya dibandingkan sebagai multiset, dengan koma dan titik dinormalkan dulu.
    - Pasangan yang beda jadi temuan konsistensi, `loc` = loc ID.
  - `export function parseIdr(s) -> number|null`: `"2.543.204.033"` atau `"2,543,204,033"` menjadi `2543204033`.

- [ ] **Step 1: Tulis tes yang gagal:**
```js
const nf = CW.numberFormatFindings([{ loc: "p3", text: "- 277,500,000 Termyn I" }, { loc: "p4", text: "188.700.000 dan 377.400.000" }]);
assert.deepEqual(nf.map((x) => [x.loc, x.from, x.to]), [["p3", "277,500,000", "277.500.000"]]);
assert.equal(CW.parseIdr("2.543.204.033"), 2543204033);
const rows = [["Prize", 2363404000], ["Uni", 34333333], ["Meta", 45000000], ["Google", 45000000], ["DBL", 55466700], ["IDX", 0], ["Grand Total", 2543204033]].map(([label, value], i) => ({ loc: "r" + i, label, value }));
assert.deepEqual(CW.totalFindings(rows), []);
rows[6].value = 2543204000;
assert.match(CW.totalFindings(rows)[0].why, /2\.543\.204\.033/);
assert.deepEqual(CW.langFindings([{ loc: "e1", text: "run from 1 October to 30 November 2026" }], [{ loc: "i1", text: "berlangsung 1 Oktober–30 November 2026" }]), []);
assert.equal(CW.langFindings([{ loc: "e1", text: "Total 555.000.000" }], [{ loc: "i1", text: "Total 550.000.000" }])[0].loc, "i1");
```
- [ ] **Step 2: Jalankan dan pastikan gagal.**
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4: Jalankan dan pastikan lolos.**
- [ ] **Step 5: Commit** `"Copy Studio Copywriter: cek format angka, total tabel, dan kesesuaian EN–ID"`

### Task 7: Cek wording file: AI, UI, unduhan

**Files:**
- Modify: `apps/copy-studio/worker.js` (kind `cw_review`, `cw_translate`)
- Modify: `apps/copy-studio/assets/cw.js` (alur review)
- Modify: `apps/copy-studio/page.html` (markup `div[data-cw="review"]`), `apps/copy-studio/i18n.js`
- Test: `apps/copy-studio/test.mjs`

**Interfaces:**
- Consumes: Task 2 (`unzip`, `zipFiles`, `docxParagraphs`), Task 4 (`applyDocx`, `hasLangMarkers`, `insertEnglish`), Task 5 (semua), Task 6 (semua), `GET /api/quota`, `libs.pdf`.
- Produces (worker):
  - `prompt("cw_review", { units:[{id, text}], lang:"id"|"en"|"mix" })`.
    - Mengembalikan `null` kalau tidak ada unit. Maks. 120 unit, total 9000 karakter.
    - Instruksi: cari typo, kalimat janggal/tata bahasa, istilah tidak konsisten, dan pelanggaran aturan iklan. Kutip `from` **persis** dari teks unit, sesingkat mungkin.
    - Format: `{"findings":[{"id":"","from":"","to":"","kind":"typo|kalimat|istilah|ojk","why":""}]}`
  - `parse("cw_review")` mengembalikan `{findings≤80}` yang `id` ada di input, `from` tidak kosong, dan `from` ≠ `to`. `parse` tidak tahu input, jadi penyaringan `id` dilakukan di browser.
  - `prompt("cw_translate", { units:[{id, text}] })` dengan format `{"items":[{"id":"","en":""}]}`. Terjemahan formal bahasa Inggris bisnis. Istilah tetap: iKISI, KOINS, KISI Challenge, nama produk. Angka tidak diubah.
  - `parse("cw_translate")` mengembalikan `{items}`.
- Produces (cw.js):
  - `export function chunks(units, maxChars = 9000, maxUnits = 120) -> units[][]`
  - `export function estimateCalls(units, translate:boolean) -> number` = `chunks(units).length * (translate ? 2 : 1)`
- Alur UI:
  1. Unggah .docx/.xlsx/.pdf.
  2. Unit = paragraf docx (`id` = `"p"+i`), sel xlsx (`id` = `path+"!"+ref`), atau baris pdf (`id` = `"h"+halaman+"-"+n`). PDF hanya untuk temuan.
  3. Centang "Tambah versi Inggris" (hanya docx tanpa penanda / xlsx).
  4. Tampilkan perkiraan permintaan vs sisa `limit-used`. Kalau kurang, beri peringatan dan proses tetap boleh dijalankan.
  5. Panggil `/api/ai` per potongan. Kalau 429: berhenti, tampilkan temuan yang sudah ada, dan label "Hasil sebagian: kuota AI hari ini habis".
  6. Gabungkan temuan AI dengan temuan Task 6 (untuk docx dengan `hasLangMarkers`, unit dipisah di penanda untuk `langFindings`; nilai tabel dari unit yang cocok `parseIdr`) dan dengan `Compliance.check` per unit.
  7. Daftar temuan dengan Terima/Tolak (default terima, kecuali `to` kosong).
  8. Unduhan:
     - docx: "Unduh (Track Changes)" dan "Unduh versi bersih".
     - xlsx: "Unduh" (sel diganti + `addSheet("Catatan Review")` + `copySheetTranslated` per sheet ke "<nama> EN" bila terjemahan dicentang).
     - Nama file = nama asli + ` - review`.
  9. Temuan yang `failed` diberi label "tidak bisa diterapkan otomatis".

- [ ] **Step 1: Tulis tes yang gagal:**
```js
assert.equal(prompt("cw_review", { units: [] }), null);
assert.match(prompt("cw_review", { units: [{ id: "p0", text: "Detailed of Budget" }] }).user, /p0[\s\S]*Detailed of Budget/);
assert.deepEqual(parse("cw_review", '{"findings":[{"id":"p0","from":"Detailed of Budget","to":"Budget Details","kind":"kalimat","why":"x"},{"id":"p1","from":"a","to":"a"}]}').findings.length, 1);
assert.match(prompt("cw_translate", { units: [{ id: "p0", text: "Tujuan" }] }).user, /iKISI[\s\S]*KOINS/);
assert.deepEqual(parse("cw_translate", '{"items":[{"id":"p0","en":"Purpose"},{"id":"","en":"x"}]}').items, [{ id: "p0", en: "Purpose" }]);
const U = Array.from({ length: 5 }, (_, i) => ({ id: "p" + i, text: "x".repeat(4000) }));
assert.deepEqual(CW.chunks(U).map((c) => c.length), [2, 2, 1]);
assert.equal(CW.estimateCalls(U, true), 6);
assert.equal(CW.chunks([{ id: "p0", text: "y".repeat(20000) }]).length, 1, "unit lebih panjang dari batas tetap satu potongan sendiri");
```
- [ ] **Step 2: Jalankan dan pastikan gagal.**
- [ ] **Step 3: Implementasi** worker (temperature 0.2), `chunks`/`estimateCalls`, lalu UI sesuai alur.
- [ ] **Step 4: Jalankan dan pastikan lolos.** Setelah itu cek manual di browser (`npx wrangler dev` di `apps/copy-studio`): buat .docx berisi "Adverstisement" di Word, review, unduh versi Track Changes, buka di Word, pastikan coretan muncul dan "Accept All" berjalan. Lakukan hal yang sama untuk .xlsx dengan satu sel rumus.
- [ ] **Step 5: Commit** `"Copy Studio Copywriter: cek wording Word/Excel/PDF dengan AI, Track Changes, versi bersih, terjemahan Inggris"`

### Task 8: Brief KISI Challenge

**Files:**
- Modify: `apps/copy-studio/worker.js` (kind `cw_brief`)
- Modify: `apps/copy-studio/assets/cw.js`, `apps/copy-studio/page.html` (`div[data-cw="brief"]`), `apps/copy-studio/i18n.js`
- Test: `apps/copy-studio/test.mjs`

**Interfaces:**
- Consumes: `GET/POST /api/cw` (Task 1), `makeDocx`/`zipFiles` (Task 2), `PRIZE_DISC` (Task 3).
- Produces (worker):
  - `prompt("cw_brief", { program, type:"media"|"sns", partners?:[string], format?:"single"|"carousel"|"reels"|"story", platform?:string, date?:string, highlight?:string })`. Mengembalikan `null` kalau `program.name` kosong, atau kalau `type==="sns"` tanpa partner.
  - Program dikirim dari browser dan dibersihkan lagi dengan `cleanProgram`.
  - **media:** ±350 kata dengan urutan dari spec.
  - **sns:** satu entri per partner, hook tiap partner berbeda.
    - carousel: 3–5 slide.
    - single: 1 frame berisi judul, periode, highlight, CTA, dan link event.
    - story: 2–4 frame.
    - reels: adegan `{visual, onscreen}`.
  - Format JSON: `{"media":{"title":"","body":[""]},"sns":[{"partner":"","frames":[{"label":"","lines":[""]}]}]}`.
  - `parse("cw_brief")` merapikan hasil ke bentuk itu (maks. 10 partner, 8 frame, 8 baris per frame).
- Produces (cw.js):
  - `export function snsDisclaimer(partner, assetUrl, format) -> string`
    - Judul: `"Tambahin tulisan kecil di setiap slide:"` untuk carousel/story/reels, `"Tambahin tulisan kecil:"` untuk single.
    - Diikuti `"Disclaimer:"`, 4 baris `"● …"` dengan `{Partner}` diganti, lalu `"Link aset: " + assetUrl` (dihilangkan bila kosong).
  - `export function briefText(res, { format, platform, date }) -> string`: per partner `"<Partner>: <platform> <Format label>"` (label: single→`Single Post`, carousel→`Carousel`, reels→`Reels`, story→`Story`), `"Posting tanggal <date>"`, frame (`"Slide n:"` untuk carousel), lalu `snsDisclaimer`.
- UI:
  - Kartu "Data program" (formulir untuk semua kolom `cleanProgram`). Tombol "Simpan" hanya untuk `canEdit`, yang lain hanya baca.
  - Pilihan jenis brief dan isian SNS.
  - Hasil bisa diedit, dengan tombol Salin dan Unduh .docx.

- [ ] **Step 1: Tulis tes yang gagal:**
```js
const sd = CW.snsDisclaimer("Kuliah Saham", "https://drive.example/x", "single");
assert.ok(sd.startsWith("Tambahin tulisan kecil:\nDisclaimer:\n● Hadiah adalah bentuk apresiasi"));
assert.match(sd, /● Kuliah Saham tidak terafiliasi sebagai pegawai PT KISI dan tidak memiliki izin dari Otoritas Jasa Keuangan \(OJK\)\./);
assert.ok(sd.endsWith("Link aset: https://drive.example/x"));
assert.ok(CW.snsDisclaimer("Sahamology", "", "carousel").startsWith("Tambahin tulisan kecil di setiap slide:"));
assert.doesNotMatch(CW.snsDisclaimer("Sahamology", "", "carousel"), /Link aset/);
const { CW_DEFAULT } = await import("./worker.js");
assert.equal(prompt("cw_brief", { program: CW_DEFAULT.program, type: "sns", partners: [] }), null);
const pb = prompt("cw_brief", { program: CW_DEFAULT.program, type: "sns", partners: ["Sahamology", "Kuliah Saham"], format: "carousel", highlight: "hadiah utama" }).user;
assert.match(pb, /Sahamology[\s\S]*Kuliah Saham/); assert.match(pb, /BYD Denza D9/); assert.match(pb, /berbeda/);
assert.match(prompt("cw_brief", { program: CW_DEFAULT.program, type: "media" }).user, /350 kata/);
const rb = parse("cw_brief", '{"sns":[{"partner":"Sahamology","frames":[{"label":"Slide 1","lines":["KOMPETISI DIMULAI!",""]}]}]}');
assert.deepEqual(rb.sns[0].frames[0].lines, ["KOMPETISI DIMULAI!"]);
assert.match(CW.briefText(rb, { format: "carousel", platform: "IG", date: "1 September" }), /^Sahamology: IG Carousel[\s\S]*Posting tanggal 1 September[\s\S]*Slide 1:\nKOMPETISI DIMULAI![\s\S]*● Sahamology tidak terafiliasi/);
```
- [ ] **Step 2: Jalankan dan pastikan gagal.**
- [ ] **Step 3: Implementasi** worker (temperature 0.8), helper, dan UI.
- [ ] **Step 4: Jalankan dan pastikan lolos.**
- [ ] **Step 5: Commit** `"Copy Studio Copywriter: brief KISI Challenge (media & SNS per partner, disclaimer otomatis)"`

### Task 9: Press release + README

**Files:**
- Modify: `apps/copy-studio/worker.js` (kind `cw_pr`)
- Modify: `apps/copy-studio/assets/cw.js`, `apps/copy-studio/page.html` (`div[data-cw="pr"]`), `apps/copy-studio/i18n.js`
- Modify: `README.md:25` (baris Copy Studio) dan bagian "Copy Studio & cek kepatuhan bersama" (±baris 205)
- Test: `apps/copy-studio/test.mjs`

**Interfaces:**
- Consumes: `cw_pr` (Task 1), `makeDocx`/`zipFiles` (Task 2), logo `/brand/kisi-color.png`.
- Produces (worker):
  - `prompt("cw_pr", { hl:{ event, date, city, partners, guests, numbers, speaker, quote, contact, doc_url, free } })`. Mengembalikan `null` kalau `event` dan `free` kosong.
  - Format JSON: `{"title":"","paras":[{"runs":[{"text":"","b":false,"i":false}]}],"quote":{"text":"","speaker":"","ai":true},"closing":[""],"missing":[""]}`
  - Prompt memuat aturan:
    - baris pembuka `"<Kota>, <tanggal> – PT Korea Investment And Sekuritas Indonesia (KISI)"` dengan kota/tanggal tebal
    - nama, acara, dan angka tebal; istilah asing miring
    - `missing` untuk data yang kurang
    - `quote.ai=true` bila kutipan disusun AI
  - `parse("cw_pr")` merapikan hasil ke bentuk itu.
- Produces (cw.js): `export function prBlocks(res, { about, contact, photo? }) -> blocks`
  - Urutan: `{t:"p", runs:[{text:"PRESS RELEASE", b:true, i:true}]}` → judul tebal → foto (opsional) → `paras` → kutipan miring + `ujar <b>speaker</b>` → `closing` → `"Tentang PT Korea Investment And Sekuritas Indonesia (KISI)"` tebal → `about` (dipecah per paragraf) → `"Media Contact:"` tebal miring + baris `contact` (hanya bila `contact` tidak kosong).
  - Unduhan memakai `makeDocx(prBlocks(...), { logo })`.
- UI:
  - Isian highlight dan foto.
  - Kartu "Teks baku" (about/contact). Simpan hanya untuk `canEdit`.
  - Hasil: pratinjau, daftar `missing` (kuning), label "Kutipan perlu disetujui narasumber" bila `quote.ai`.
  - Tombol Salin teks dan Unduh .docx.

- [ ] **Step 1: Tulis tes yang gagal:**
```js
assert.equal(prompt("cw_pr", { hl: {} }), null);
const pp = prompt("cw_pr", { hl: { event: "GI BEI Award 2026", city: "Jakarta", date: "23 November 2026", speaker: "Mr. Yang Seok Mo, Online Business Associate Director KISI" } }).user;
assert.match(pp, /Jakarta, 23 November 2026 – PT Korea Investment And Sekuritas Indonesia \(KISI\)/); assert.match(pp, /missing/); assert.match(pp, /Jangan mengarang/);
const rp = parse("cw_pr", '{"title":"KISI Raih Penghargaan","paras":[{"runs":[{"text":"Jakarta, 23 November 2026","b":true},{"text":" – isi"}]}],"quote":{"text":"Kami bangga.","speaker":"Mr. Yang Seok Mo","ai":true},"closing":["KISI berkomitmen."],"missing":["Jabatan Dedy Lasmono"]}');
const pbk = CW.prBlocks(rp, { about: "Para 1\n\nPara 2", contact: "" });
assert.deepEqual(pbk[0].runs[0], { text: "PRESS RELEASE", b: true, i: true });
assert.ok(pbk.some((b) => b.runs && b.runs[0].text === "Tentang PT Korea Investment And Sekuritas Indonesia (KISI)"));
assert.ok(!pbk.some((b) => b.runs && /Media Contact/.test(b.runs[0].text)), "kontak kosong -> tanpa Media Contact");
assert.ok(CW.prBlocks(rp, { about: "x", contact: "Nama\nTelp" }).some((b) => b.runs && /Media Contact/.test(b.runs[0].text)));
assert.match(fs.readFileSync(new URL("../../README.md", import.meta.url), "utf8"), /Copywriter.*artikel.*brief KISI Challenge.*press release.*cek wording/i);
```
- [ ] **Step 2: Jalankan dan pastikan gagal.**
- [ ] **Step 3: Implementasi** worker (temperature 0.5), `prBlocks`, UI, dan README.
  - README baris 25: tambahkan "tab Copywriter: artikel berita dari naskah IGS, brief KISI Challenge (media & SNS), press release (.docx berkop), cek wording Word/Excel (Track Changes, versi Inggris)".
  - Bagian 205: tambahkan satu bullet tentang `cw_program`/`cw_pr`, kuota 100, dan file yang diolah di browser.
- [ ] **Step 4: Jalankan dan pastikan lolos.** Cek manual juga: unduh press release dari `wrangler dev`, buka di Word, pastikan kop logo, tebal/miring, dan foto tampil.
- [ ] **Step 5: Commit** `"Copy Studio Copywriter: press release berkop (.docx), README"`
