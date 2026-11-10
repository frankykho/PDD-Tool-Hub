# Banner What's New Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Di tab What's New Copy Studio, user upload 1–3 screenshot + isi teks → banner PNG 1920×1080 dengan mockup HP dari 22 template (11 susunan × latar terang/gelap).

**Architecture:** Semua gambar dibuat di browser dengan Canvas 2D. Geometri, pemotongan screenshot, pengepasan teks, dan `draw()` ada di modul ES murni `apps/copy-studio/assets/banner.js` (disajikan statis lewat binding `assets`, diuji langsung di Node, pola sama dengan `apps/brand-kit/assets/render.js`). `page.html` hanya membuat kontrol, memanggil `import("/banner.js")`, menampilkan pratinjau, dan mengunduh. Tidak ada perubahan worker/D1; screenshot tidak pernah dikirim ke server.

**Tech Stack:** Cloudflare Workers (static assets), Canvas 2D, Google Fonts Inter, Node 22 `node:assert` untuk tes.

**Spec:** `docs/superpowers/specs/2026-11-10-banner-whats-new-design.md` · mockup acuan: `.superpowers/brainstorm/1430-1794282215/content/semua-template.html`

## Global Constraints
- Ukuran keluaran: 1920×1080 px, PNG.
- Logo hanya salinan `brand/ikisi-color.png` (latar terang) dan `brand/ikisi-white.png` (latar gelap), tinggi 60 px (susunan tengah 54 px).
- Latar terang: gradasi vertikal #ffffff → #e8f4ee; judul #136F4A; penjelasan #3a4a42; label latar #136F4A huruf #ffffff.
- Latar gelap (G2): radial dari pusat HP (x 75% kanan / 25% kiri / 50% tengah, y 45%) #1a6b48 0 → #0d3b28 55% → #08261a 100%; judul #ffffff; penjelasan rgba(255,255,255,.88); label latar #F5A623 huruf #17251d.
- Font Inter (400, 800). Download ditolak bila font gagal dimuat.
- Isi banner selalu Bahasa Indonesia (`translate="no"`); label kontrol masuk `apps/copy-studio/i18n.js`.
- Batas teks: judul 40 huruf (`wn_title`), penjelasan 150 huruf (`wn_short`), label 24 huruf.
- Screenshot tidak keluar dari browser dan tidak disimpan (localStorage hanya teks & pilihan).
- Tes: `node apps/copy-studio/test.mjs` → "semua cek lolos"; `node scripts/i18n-check.mjs` lolos.

## Review Focus
1. Screenshot berasio jauh berbeda (landscape, atau sangat panjang) → dipotong cover rata atas, tidak gepeng. (Task 1 `coverTop`)
2. Satu kata sangat panjang tanpa spasi di judul → tidak melewati lebar kolom; dipecah per huruf atau ditandai overflow. (Task 1 `fitText`)
3. Kotak teks menabrak HP yang diputar di versi kiri (kipas kiri, miring kiri). (Task 1 tes bbox semua kombinasi)
4. Ganti jumlah HP 3 → 1 → 3: screenshot yang sudah dipilih tidak hilang/tertukar. (Task 3)
5. Font Google gagal dimuat (jaringan kantor memblokir) → pesan jelas, unduh ditolak, pratinjau tetap tampil. (Task 3)

---

### Task 1: Modul banner — geometri, potong screenshot, pengepasan teks

**Files:**
- Create: `apps/copy-studio/assets/banner.js`
- Create: `apps/copy-studio/assets/brand/ikisi-color.png`, `apps/copy-studio/assets/brand/ikisi-white.png` (salin dari `brand/`)
- Modify: `apps/copy-studio/wrangler.jsonc` (tambah `"assets": { "directory": "./assets" }`; komentar: logo & banner.js publik)
- Test: `apps/copy-studio/test.mjs` (blok baru sebelum `console.log("semua cek lolos")`)

**Interfaces:**
- Produces (semua di `banner.js`, ES module, tanpa DOM):
  - `W = 1920, H = 1080`
  - `LAYOUTS`: array 6 entri `{ id, name, n, mid?: true, tw, p: [[x,y,w,h,rotDeg], ...] }` — posisi versi kanan, urutan = urutan gambar (belakang dulu). Nilai persis:
    - `tegak` "1 HP tegak", tw 1000: `[[1280,150,520,1070,0]]`
    - `miring` "1 HP miring", tw 1000: `[[1250,170,540,1110,-8]]`
    - `utuh` "1 HP utuh", tw 1000: `[[1330,90,440,900,0]]`
    - `dua` "2 HP bertumpuk", tw 820: `[[1060,230,440,900,0],[1400,120,440,900,0]]`
    - `kipas` "3 HP kipas", tw 760: `[[950,260,380,780,-6],[1530,260,380,780,6],[1210,150,440,900,0]]`
    - `tengah` "3 HP tengah", mid: `[[460,470,360,740,0],[1100,470,360,740,0],[780,420,360,740,0]]`
  - `combos(n?: number) -> [{ id, side: "kanan"|"kiri"|"tengah", name }]` — 11 tanpa argumen; disaring jumlah HP bila `n` diberikan.
  - `layoutFor(id, side) -> { phones: [{ x, y, w, h, rot, no }], text: { x, y, w, align: "left"|"center" } , logo: { x, y, h, align }, desc: boolean, glow: [cxFrac, cyFrac] }` — versi kiri dicerminkan (`x' = W - x - w`, `rot' = -rot`); `no` (1..n) = peringkat x kiri→kanan; urutan array tetap urutan gambar. Teks/logo di sisi seberang HP: kanan → x 120; kiri → x `W - 120 - tw`; tengah → teks tengah y 160, logo tengah y 60 h 54, `desc:false`.
  - `coverTop(iw, ih, w, h) -> { sx, sy, sw, sh }` — potongan sumber agar mengisi w×h tanpa gepeng; sisa horizontal dibagi rata, sisa vertikal dibuang dari bawah (sy = 0).
  - `fitText(measure, text, { w, size, minSize, maxLines, lh }) -> { size, lines: string[], overflow: boolean }` — `measure(text, size) -> px`; kecilkan 2 px per langkah sampai muat atau `minSize` (= 60% ukuran awal); kata yang lebih lebar dari `w` dipecah per huruf.
  - `fileName(title) -> string` — `"whats-new-<slug>.png"`, slug huruf kecil a–z0–9 dan "-", maks 40, kosong → `"whats-new-banner.png"`.

- [ ] **Step 1: Tulis tes yang gagal** di `test.mjs`:

```js
/* ---------- banner What's New (assets/banner.js) ---------- */
const B = await import("./assets/banner.js");
assert.equal(B.combos().length, 11);
assert.deepEqual(B.combos(2).map((c) => c.side), ["kanan", "kiri"]);
assert.equal(B.combos(3).length, 3, "kipas kanan/kiri + tengah");
const kn = B.layoutFor("dua", "kanan"), kr = B.layoutFor("dua", "kiri");
assert.deepEqual(kr.phones.map((p) => p.x), [1920 - 1060 - 440, 1920 - 1400 - 440], "dicerminkan, urutan gambar tetap");
assert.deepEqual(kn.phones.map((p) => p.no), [1, 2]);
assert.deepEqual(kr.phones.map((p) => p.no), [2, 1], "nomor = urutan kiri→kanan");
assert.equal(B.layoutFor("miring", "kiri").phones[0].rot, 8);
assert.equal(B.layoutFor("tengah", "tengah").desc, false);
// teks tidak menabrak HP (bbox setelah diputar) dan tetap di dalam banner, semua kombinasi
const bbox = (p) => { const r = Math.abs(p.rot) * Math.PI / 180, hw = (p.w * Math.cos(r) + p.h * Math.sin(r)) / 2, cx = p.x + p.w / 2; return [cx - hw, cx + hw]; };
for (const c of B.combos()) {
  const L = B.layoutFor(c.id, c.side);
  assert.ok(L.text.x >= 0 && L.text.x + L.text.w <= 1920, c.id + c.side);
  if (c.side === "kanan") assert.ok(L.text.x + L.text.w < Math.min(...L.phones.map((p) => bbox(p)[0])), "teks vs HP " + c.id);
  if (c.side === "kiri") assert.ok(L.text.x > Math.max(...L.phones.map((p) => bbox(p)[1])), "teks vs HP " + c.id);
}
assert.deepEqual(B.coverTop(1080, 2340, 480, 1030), { sx: 0, sy: 0, sw: 1080, sh: 1080 * 1030 / 480 }, "screenshot lebih panjang: bawah dibuang");
const wide = B.coverTop(2000, 1000, 480, 1030);
assert.equal(wide.sy, 0); assert.equal(wide.sh, 1000); assert.ok(Math.abs(wide.sx - (2000 - wide.sw) / 2) < 1e-9, "landscape: dipotong rata kiri-kanan");
const ms = (t, s) => t.length * s * 0.55;
const f1 = B.fitText(ms, "Auto-invest Reksa Dana", { w: 1000, size: 88, minSize: 53, maxLines: 3, lh: 1.05 });
assert.equal(f1.overflow, false); assert.equal(f1.size, 88);
const f2 = B.fitText(ms, "x".repeat(150), { w: 1000, size: 36, minSize: 22, maxLines: 3, lh: 1.4 });
assert.ok(f2.lines.every((l) => ms(l, f2.size) <= 1000), "kata panjang dipecah, tidak melebihi lebar");
assert.equal(B.fitText(ms, "kata ".repeat(200), { w: 300, size: 36, minSize: 22, maxLines: 3, lh: 1.4 }).overflow, true);
assert.equal(B.fileName("Auto-invest Reksa Dana!"), "whats-new-auto-invest-reksa-dana.png");
assert.equal(B.fileName("  "), "whats-new-banner.png");
```

- [ ] **Step 2: Jalankan, pastikan gagal**
Run: `node apps/copy-studio/test.mjs`
Expected: FAIL `Cannot find module ... assets/banner.js`

- [ ] **Step 3: Buat `banner.js`** sesuai Interfaces; salin dua logo ke `assets/brand/`; tambah `assets` di `wrangler.jsonc`.

- [ ] **Step 4: Jalankan, pastikan lolos**
Run: `node apps/copy-studio/test.mjs`
Expected: `semua cek lolos`. Kalau tes bbox gagal untuk satu susunan, geser posisi HP/tw di `LAYOUTS` (bukan melonggarkan tes) dan catat sebagai Ruling.

- [ ] **Step 5: Commit**
```bash
git add apps/copy-studio/assets apps/copy-studio/wrangler.jsonc apps/copy-studio/test.mjs
git commit -m "Copy Studio: modul banner What's New (susunan HP, potong screenshot, pengepasan teks)"
```

---

### Task 2: `draw()` — menggambar banner ke canvas

**Files:**
- Modify: `apps/copy-studio/assets/banner.js`
- Test: `apps/copy-studio/test.mjs`

**Interfaces:**
- Consumes: `layoutFor`, `coverTop`, `fitText`, `W`, `H` (Task 1)
- Produces:
  - `THEMES = { terang: {...}, gelap: {...} }` — nilai warna dari Global Constraints, plus `logo: "color"|"white"`.
  - `draw(ctx, o) -> { overflow: string[] }` dengan `o = { id, side, theme: "terang"|"gelap", logo: Image|null, shots: [Image|null ×3], tag, title, desc }`. Urutan gambar: latar → logo → label (pil berisi teks) → judul → penjelasan (lewati bila `desc:false` atau kosong) → HP sesuai urutan array (bayangan, badan #111 radius 64, layar inset 20 radius 46 di-`clip` lalu `drawImage` screenshot via `coverTop`, atau isi #d9dedb bila kosong; notch 110×30 di atas layar). Rotasi di pusat HP. `overflow` berisi `"title"` / `"desc"` / `"tag"` bila `fitText` overflow. Ukuran teks: label 30 (800, spasi huruf 3), judul 88 (800, lh 1.05, maks 3 baris; tengah 72, 1 baris), penjelasan 36 (400, lh 1.4, maks 3 baris), minSize 60%. Posisi y: label 300, judul mulai di bawah label + 34, penjelasan di bawah judul + 28; tengah: label 160, judul di bawahnya.

- [ ] **Step 1: Tulis tes yang gagal** — ctx tiruan yang mencatat panggilan:

```js
const fakeCtx = () => { const log = []; const c = new Proxy({ log, measureText: (t) => ({ width: t.length * 20 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (o, k) => k in o ? o[k] : (...a) => log.push([k, ...a]), set: (o, k, v) => (log.push(["set:" + k, v]), true) }); return c; };
const shot = { naturalWidth: 1080, naturalHeight: 2340 }, logo = { naturalWidth: 1200, naturalHeight: 390 };
let cx = fakeCtx(), r1 = B.draw(cx, { id: "kipas", side: "kanan", theme: "gelap", logo, shots: [shot, shot, null], tag: "FITUR BARU", title: "Auto-invest", desc: "Investasi rutin." });
assert.deepEqual(r1.overflow, []);
assert.equal(cx.log.filter((l) => l[0] === "drawImage" && l[1] === shot).length, 2, "dua screenshot digambar, slot kosong tidak");
assert.equal(cx.log.filter((l) => l[0] === "clip").length, 3, "tiap layar HP di-clip");
assert.ok(cx.log.some((l) => l[0] === "fillText" && l[1] === "Investasi rutin."));
cx = fakeCtx(); B.draw(cx, { id: "tengah", side: "tengah", theme: "terang", logo, shots: [], tag: "FITUR BARU", title: "Judul", desc: "Tidak tampil" });
assert.ok(!cx.log.some((l) => l[0] === "fillText" && l[1] === "Tidak tampil"), "susunan tengah tanpa penjelasan");
assert.deepEqual(B.draw(fakeCtx(), { id: "tegak", side: "kanan", theme: "terang", logo, shots: [], tag: "FITUR BARU", title: "Judul ".repeat(40), desc: "" }).overflow, ["title"]);
```

- [ ] **Step 2: Jalankan, pastikan gagal** — Run: `node apps/copy-studio/test.mjs` · Expected: FAIL `B.draw is not a function`
- [ ] **Step 3: Implement `THEMES` dan `draw`** sesuai Interfaces.
- [ ] **Step 4: Jalankan, pastikan lolos** — Expected: `semua cek lolos`
- [ ] **Step 5: Cek visual** — render ke-22 kombinasi dengan Chrome headless (halaman uji sementara di scratchpad yang meng-import `banner.js` dan menggambar ke canvas; Inter dari Google Fonts), bandingkan dengan `semua-template.html`. Expected: susunan, warna, logo sama dengan mockup yang disetujui.
- [ ] **Step 6: Commit**
```bash
git add apps/copy-studio/assets/banner.js apps/copy-studio/test.mjs
git commit -m "Copy Studio: gambar banner What's New (latar terang/gelap, bingkai HP, teks)"
```

---

### Task 3: Kontrol banner di tab What's New

**Files:**
- Modify: `apps/copy-studio/page.html` (kartu baru di `<section data-tab="wn">`, skrip di blok WHAT'S NEW, `<link>` Google Fonts Inter 400;800 di `<head>`, petunjuk "Cara pakai" tab wn di `HELP` baris ~368)
- Modify: `apps/copy-studio/i18n.js`
- Test: `apps/copy-studio/test.mjs`

**Interfaces:**
- Consumes: `combos`, `draw`, `fileName`, `W`, `H` dari `/banner.js` (dynamic `import()`); `wnOut` field `title` & `short` (`wnVal("title")`, `wnVal("short")` yang sudah ada); `badge(text, "wn_title"|"wn_short")`, `toast`, `esc`.
- Produces: elemen `#wbN` (1/2/3 HP), `#wbLay` (susunan; isi dari `combos(n)`), `#wbTheme` (terang/gelap), `#wbTag` (maxlength 24, default "FITUR BARU"), `#wbTitle` (maxlength 40), `#wbDesc` (maxlength 150), `#wbShots` (3 `<input type=file accept="image/*">`, yang di atas `n` disembunyikan), `#wbFill` ("Ambil dari hasil What's New"), `#wbCanvas` (1920×1080, tampil diperkecil), `#wbWarn`, `#wbDl` ("Unduh PNG").

Perilaku:
- Kartu "Banner" melebar penuh (`grid-column:1/-1`) di bawah dua kartu What's New; semua isian banner `translate="no"`.
- Setiap perubahan → `draw()` ulang (sekali per frame). `overflow` tidak kosong → `#wbWarn` "Teks terlalu panjang, pendekkan judul/penjelasan" dan unduh ditolak.
- Screenshot disimpan di array 3 slot di memori (`Image` dari `URL.createObjectURL`); mengganti jumlah HP tidak menghapus slot.
- Setelah "Buat What's New" sukses: isi `#wbTitle`/`#wbDesc` dari hasil **hanya bila kosong**; `#wbFill` menimpa dengan sengaja.
- Font: `document.fonts.load("800 88px Inter")` & `("400 36px Inter")` sebelum gambar pertama; gagal/timeout 5 dtk → tetap gambar, `#wbWarn` "Font Inter gagal dimuat; unduh dinonaktifkan", unduh ditolak.
- Unduh: slot HP yang kosong → `confirm("Ada HP tanpa screenshot. Tetap unduh?")`; lalu `canvas.toBlob` → PNG, nama `fileName(judul)`.
- localStorage `cs_wnb`: n, susunan, tema, label, judul, penjelasan (dibungkus try/catch seperti `cs_wn`). Screenshot tidak disimpan.

- [ ] **Step 1: Tulis tes yang gagal** di `test.mjs` (halaman yang sudah di-load sebagai `page` di baris ~174):

```js
for (const id of ["wbN", "wbLay", "wbTheme", "wbTag", "wbTitle", "wbDesc", "wbShots", "wbFill", "wbCanvas", "wbWarn", "wbDl"]) assert.ok(page.includes(`id="${id}"`), id);
assert.ok(page.includes('import("/banner.js")'));
assert.ok(/fonts\.googleapis\.com\/css2\?family=Inter/.test(page));
assert.ok(page.includes('"cs_wnb"'));
```
Run: `node apps/copy-studio/test.mjs` · Expected: FAIL `wbN`

- [ ] **Step 2: Implement kartu & skrip** sesuai Perilaku; tambah terjemahan semua label/pesan baru di `i18n.js`.
- [ ] **Step 3: Jalankan tes** — Run: `node apps/copy-studio/test.mjs && node scripts/i18n-check.mjs` · Expected: `semua cek lolos` dan i18n-check tanpa ✗ (cek sintaks semua `<script>` halaman sudah ada di baris 178).
- [ ] **Step 4: Cek di browser** — jalankan `npx wrangler dev` di `apps/copy-studio` (atau halaman uji statis bila SSO menghalangi), upload 1 screenshot portrait + 1 landscape, coba ke-11 susunan × 2 tema, judul 40 huruf, penjelasan 150 huruf, ganti jumlah HP 3→1→3, unduh PNG dan buka hasilnya. Expected: Review Focus 1–5 sesuai.
- [ ] **Step 5: Commit**
```bash
git add apps/copy-studio/page.html apps/copy-studio/i18n.js apps/copy-studio/test.mjs
git commit -m "Copy Studio: banner What's New di tab What's New (pratinjau, upload screenshot, unduh PNG)"
```

---

### Task 4: Dokumen & deploy

- [ ] **Step 1:** Commit spec + plan di branch ini (`docs/superpowers/specs/2026-11-10-banner-whats-new-design.md`, plan ini).
- [ ] **Step 2:** `node scripts/deploy.mjs --dry-run` · Expected: bundel copy-studio lolos tanpa error, dan `apps/copy-studio/wrangler.deploy.json` hasil `--resolve copy` memuat `assets`.
- [ ] **Step 3:** Final review seluruh branch; minta izin user sebelum merge ke `main` + push (push = deploy).
