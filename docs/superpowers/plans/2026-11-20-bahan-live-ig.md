# Bahan Live IG mingguan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab "Live IG" di Market News: susun bahan live mingguan (angka kunci, naskah, pertanyaan cadangan) dan olah pertanyaan follower dari screenshot.

**Architecture:** Fungsi murni di `apps/market-news/live.js` (tanpa I/O, dites), I/O + rute di `worker.js`, tabel `mn_live` di news-db,
tampilan di `page.html` (view `live`). Gambar ke AI lewat fungsi baru `aiVision()` di `shared/ai.js` (pemanggil `ai()` lama tidak berubah).

**Tech Stack:** Cloudflare Worker (JS ESM), D1, Workers AI / Gemini / Claude lewat `shared/ai.js`, TradingView scanner, tes `node:assert` + `node:sqlite`.

**Spec:** `docs/superpowers/specs/2026-11-20-bahan-live-ig-design.md`

## Global Constraints
- Tanpa jadwal otomatis baru; tanpa database D1 baru (tabel `mn_live` di news-db).
- Teks AI tanpa rekomendasi beli/jual/target harga: dicek `checkCopy` (`shared/compliance.js`), temuan level `error` ditampilkan, tidak dihapus.
- Angka kunci dihitung kode, bukan AI. AI hanya memakai angka dari data yang diberikan.
- Gambar screenshot tidak disimpan; nama akun penanya disimpan; Groq tidak menerima gambar.
- Susun/sunting/unggah/hapus: editor & admin; lihat: semua pengguna Market News. Teks EN di `i18n.js`.

## Review Focus
1. Minggu dengan libur bursa (rekap < 5 hari) → angka tetap benar (awal = prev rekap pertama, akhir = close rekap terakhir).
2. Disusun saat minggu berikutnya sudah berjalan → penggerak dari jumlah rekap harian, berlabel "perkiraan".
3. Jawaban AI bukan JSON murni (pakai ```json, teks pembuka) → tetap terbaca; rusak total → pesan jelas, data lama tidak hilang.
4. Unggahan kedua → digabung, duplikat persis dibuang.
5. `ai()` lama tetap sama untuk pemanggil teks (tes lama Market News tetap lolos).

---

### Task 1: `aiVision()` di shared/ai.js
**Files:** Modify `shared/ai.js`; Test `apps/market-news/test-live.mjs`
**Produces:** `aiVision(env, system, text, images: Array<{mime, b64}>, maxTokens) -> {text, model}`; urutan Claude (ANTHROPIC_API_KEY) → Gemini (GEMINI_API_KEY) → Workers AI `@cf/meta/llama-4-scout-17b-16e-instruct` (content `image_url` data URL); AiError bila semua gagal.
- [ ] Tes: fetch ditiru; dengan GEMINI_API_KEY body berisi `inline_data` sebanyak gambar; tanpa key apa pun → `env.AI.run` menerima `image_url` `data:image/jpeg;base64,...`; dengan GROQ_API_KEY saja → tidak ada fetch ke groq.
- [ ] Implementasi, jalankan `node apps/market-news/test-live.mjs` dan `node apps/market-news/test.mjs` → lolos.

### Task 2: `live.js` — hitungan murni
**Files:** Create `apps/market-news/live.js`; Test `apps/market-news/test-live.mjs`
**Produces:**
- `weekOf(dateWib: 'YYYY-MM-DD') -> {mon, fri}` (Senin–Jumat minggu itu).
- `buildWeek(day: string)` → minggu yang disusun: hari Sabtu/Minggu/Senin sebelum 17.00 → minggu lalu; selain itu minggu berjalan.
- `weekNumbers(recaps: Array<data>) -> {days, ihsg:{open, close, pct, high, low}, foreign:{net}, sectors:[{name,pct}], moversDaily:{up,down}}` — sektor = gabungan % harian ((Π(1+p))−1); penggerak harian = jumlah `pts` per kode dari `movers.up/down` 5 hari.
- `weekMovers(tvRows: [code, close, perfW, cap], ihsgPrevWeek) -> {up, down}` (rumus sama `contributions` di market-recap/calc.js, memakai Perf.W).
- `hypeStocks(news: [{tickers, score}], tvRows: [code, close, perfW, relVol, value], n=5)` → [{code, pct, mentions, relVol}] skor = mentions berbobot skor + |perfW|/10 + relVol; hanya nilai transaksi ≥ Rp1 M.
- `parseJsonLoose(text)` → objek/array atau null (buang ```json, ambil `{…}`/`[…]` terluar).
- `mergeQuestions(old, add)` → gabungan {akun, q} tanpa duplikat persis (huruf kecil, spasi dirapikan).
- `flags(text)` → temuan `checkCopy(text,{platform:'wa', license:false})` level `error`.
- Prompt: `SCRIPT_RULES`, `BACKUP_RULES`, `QUESTIONS_RULES`, `OCR_RULES` (string), `factsText(live)` → ringkasan data untuk AI.
- [ ] Tes per fungsi (minggu libur 4 hari; perkiraan penggerak; JSON berpagar; duplikat; flag "beli BBRI target harga 5000").
- [ ] Implementasi → tes lolos.

### Task 3: worker — tabel, susun, simpan, unggah
**Files:** Modify `apps/market-news/worker.js`; Test `apps/market-news/test-live.mjs`
**Consumes:** Task 1–2. **Produces:** rute
- `GET /api/live?week=` → {week, data, news, weekend, script, backup, questions, groups, model, updated_by, updated_at, flags, weeks:[…]}.
- `POST /api/live/build {week?, part: 'all'|'script'|'backup'|'groups'}` — `all`: angka (recap-db + TradingView `Perf.W, relative_volume_10d_calc, market_cap_basic, Value.Traded`) + salin berita + naskah + cadangan; `script` pada minggu yang sudah lewat: salin berita sejak Jumat 16.00 WIB ke `weekend` lalu tulis ulang naskah.
- `POST /api/live/save {week, field: 'script'|'backup'|'groups', value}`.
- `POST /api/live/upload {week, images:[{mime,b64}]}` (≤ 10 gambar, ≤ 1,5 MB tiap gambar) → baca → gabung → kelompokkan.
- `POST /api/live/clear {week}` → hapus pertanyaan & kelompok.
- Tabel `mn_live (week TEXT PRIMARY KEY, data TEXT, news TEXT, weekend TEXT, script TEXT, backup TEXT, questions TEXT, groups TEXT, model TEXT, updated_by TEXT, updated_at TEXT)`.
- Batas AI memakai `aiTake` yang sudah ada.
- [ ] Tes end-to-end dengan d1 tiruan, recap-db 4–5 hari, fetch & AI tiruan: build all → angka benar, berita tersalin; upload dua kali → gabung; viewer tanpa edit → 403; AI JSON rusak → 503 dan data lama tetap.
- [ ] Implementasi → `test-live.mjs` + `test.mjs` lolos.

### Task 4: tampilan `page.html` + i18n
**Files:** Modify `apps/market-news/page.html`, `apps/market-news/i18n.js`
- [ ] Chip "Live IG" di "Tampilan"; view `live`: pilih minggu, tombol Susun bahan / Susun ulang naskah / Susun ulang cadangan, kartu Angka kunci (teks salin), Naskah (textarea + Simpan + Salin), Cadangan (daftar + poin, Salin), Pertanyaan follower (unggah screenshot → kecilkan ke lebar ≤ 1080 px JPEG di browser, catatan privasi, kelompok + poin, Hapus pertanyaan), temuan kepatuhan.
- [ ] Cek di browser lokal (`wrangler dev`) dengan data tiruan; screenshot.

### Task 5: dokumen & selesai
- [ ] Header worker.js (rute baru), komentar wrangler.jsonc tidak berubah; commit.
