# Konten WA Channel dari Bandingkan — rencana kerja

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tombol "Buat konten" di Bandingkan (Fund Insight). Hasilnya PNG 2160×3840 berisi tabel + grafik, plus caption WA Channel yang ditulis AI. Hanya admin hub dan Investment Growth Specialist yang bisa memakainya.

**Architecture:** Gambar digambar di kanvas browser dari data yang sudah dimuat layar Bandingkan (`byId`, `getNav`, `cut`, `PERIODS`). Endpoint baru `POST /api/caption` menyusun fakta dari data server (`meta.latest` + `FUNDS`), lalu memanggil `ai()` dari `shared/ai.js` dengan `RULES_PROMPT`. Browser memeriksa caption dengan `Compliance.check(teks,{platform:"wa"})`.

**Tech Stack:** Cloudflare Worker (`apps/fund-insight/worker.js`, halaman = string JSON `const HTML = "..."` di satu baris, CRLF), Workers AI, Canvas 2D, tes `node apps/fund-insight/test.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-04-konten-bandingkan-design.md`

## Global Constraints
- Gratis saja. Tidak ada tabel D1 baru, tidak ada cron, tidak ada batas AI harian.
- Akses = `hu.adm || hu.j === "is"` (payload cookie hub; `j` = kunci jabatan, `is` = Investment Growth Specialist). Kunci admin (`isKey`) juga boleh, untuk tes.
- Gambar 2160×3840 PNG, satu gambar per konten.
- Logo `brand/ikisi-white.png` disalin ke `apps/fund-insight/assets/brand/ikisi-white.png` (pola Content Insight).
- Di gambar publik tidak ada Rasio Sharpe, NAB per unit, rating bintang, atau tanda ▲.
- Teks tampilan Bahasa Indonesia. Kunci terjemahan baru masuk ke `apps/fund-insight/i18n.js`, dan `node scripts/i18n-check.mjs` harus lolos.
- Edit `const HTML` lewat skrip node: JSON.parse → `rep(a,b,n)` → JSON.stringify, pertahankan CRLF.

## Review Focus
1. Pilihan 1 produk saja → gambar dan caption tetap jadi (tabel 1 kolom, grafik 1 garis).
2. Nama produk panjang (mis. "Batavia Dana Kas Maxima Syariah…") → dibungkus jadi 2–3 baris, tidak keluar kolom.
3. Return kosong (produk baru, tidak ada `y3`/`y5`) → ditulis "–", AI tidak mengarang angka.
4. Jenis berbeda → peringatan "jenis berbeda" ada di gambar dan diteruskan ke AI.
5. AI gagal atau kuota habis → pesan dari `AiError` tampil, gambar tetap bisa diunduh.

---

### Task 1: Endpoint caption + akses

**Files:**
- Modify: `apps/fund-insight/worker.js` (impor `ai, AiError` dari `../../shared/ai.js` dan `RULES_PROMPT, complianceScript` dari `../../shared/compliance.js`; flag `ko` di objek `me`; route baru dekat `/api/proposal`).
- Modify: `apps/fund-insight/wrangler.jsonc` (tambah `"ai": { "binding": "AI" }`, `"assets": { "directory": "./assets" }`, dan perbarui komentar secret).
- Create: `apps/fund-insight/assets/brand/ikisi-white.png` (salinan).
- Test: `apps/fund-insight/test.mjs`.

**Interfaces:**
- Produces:
  - `me.ko: boolean` dikirim ke browser lewat `window.ME`.
  - `POST /api/caption {ids:string[]}` → `200 {text, model}` | `401` tanpa login | `403 {error}` peran lain | `400` tanpa produk sah | `502 {error}` AiError.
  - `capFacts(L, ids) -> string`: satu blok teks fakta per produk (nama, jenis, profil risiko, MI, return per periode memakai label `PERIODS` atau "–", naik-turun 1 th, dana kelolaan, min. pembelian), tanggal data `L.at`, dan baris "Jenis berbeda" bila jenisnya campur.

- [ ] **Step 1: Write failing tests** di `test.mjs`. Pasang `env.AI` palsu yang menyimpan pesan terakhir dan menjawab teks >40 karakter. Isi `meta.latest` dengan `ret.y1` untuk 2914. Tandatangani cookie `hub_fund` (APP dari worker) seperti harness, dengan `{u, e, n, a:"viewer", j}`.
  - tanpa login → 401
  - cookie `j:"sales"` → 403
  - cookie `j:"is"` dan `ids:["2914"]` → 200; `text` tidak kosong; pesan user yang dikirim ke AI memuat angka `ret.y1` dari server; pesan system memuat `RULES_PROMPT`
  - `?key=` dengan `ids:["x"]` → 400
  - halaman `/` dengan cookie `j:"is"` memuat `"ko":true`
- [ ] **Step 2: Run** `node apps/fund-insight/test.mjs`. Expected: FAIL di assert 401/403 caption (route belum ada).
- [ ] **Step 3: Implement.**
  - Server membaca `ids` sama seperti `/api/proposal` (filter `PIDS`, maks. 3).
  - Prompt system: penulis caption WA Channel untuk masyarakat umum. Bahasa Indonesia awam. Struktur: 1 kalimat pembuka, 3–5 poin angka, 1 kalimat netral, lalu disclaimer "Kinerja masa lalu tidak menjamin kinerja masa depan…". Tanpa ajakan beli, tanpa kata "terbaik". Hanya angka dari fakta. Plus `RULES_PROMPT`.
  - `maxTokens` 700.
- [ ] **Step 4: Run** `node apps/fund-insight/test.mjs`. Expected: semua lolos.
- [ ] **Step 5: Commit** pesan Indonesia + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Task 2: Generator gambar + panel caption di Bandingkan

**Files:**
- Modify: `apps/fund-insight/worker.js` (`const HTML`: tombol `#cmpKo` di sebelah `#cmpPdf`, panel `#koBox`, fungsi `koDraw()`, `koCap()`, sisip `complianceScript()`).
- Modify: `apps/fund-insight/i18n.js`.

**Interfaces:**
- Consumes: `ME.ko`, `POST api/caption` (Task 1), `/brand/ikisi-white.png`.
- Produces: `koDraw(): Promise<HTMLCanvasElement>` (2160×3840); tombol "Unduh PNG" → `konten-reksa-dana-YYYY-MM-DD.png`.

- [ ] **Step 1: Implement UI.**
  - `#cmpKo` "Buat konten" muncul bila `ME.ko && fs.length`. Klik membuka `#koBox` yang berisi pratinjau kanvas (diperkecil CSS, `max-width:360px`), tombol Unduh PNG, tombol "Tulis caption dengan AI", textarea caption, tombol Salin caption, dan daftar hasil `Compliance.check`.
  - Susunan kanvas dari atas: logo; judul "Perbandingan Reksa Dana" + "Data per {tanggal}"; tabel (baris sesuai Global Constraints); grafik garis sejak tanggal sama (rentang `cmpRange`, warna sama dengan layar); peringatan jenis berbeda; disclaimer OJK di kaki.
  - Latar gelap tema Fund Insight. Teks tabel minimal 44px di kanvas.
- [ ] **Step 2: Verify** di harness `fi_harness.mjs` (8841) dengan `shot.mjs`, cookie diberi `j:"is"`:
  - 1 produk dan 3 produk (jenis campur, nama panjang) → screenshot kanvas, cek tidak ada teks keluar kolom.
  - Cookie `j:"sales"` → tombol tidak ada.
  - Expected: tidak ada page error; ukuran PNG 2160×3840.
- [ ] **Step 3: Run** `node apps/fund-insight/test.mjs && node scripts/i18n-check.mjs`. Expected: lolos.
- [ ] **Step 4: Commit.**
