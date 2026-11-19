# SATS Menu Dividen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu "Dividen" di SATS: daftar semua saham pembagi dividen, bisa diurutkan, dengan riwayat dan perkiraan dividen berikutnya.

**Architecture:** Skrip mingguan baru (`run-dividends.ts`) dijalankan di workflow fundamental sesudah data fundamental ditulis; ia mengambil
riwayat dividen + EPS dari Yahoo, menghitung ringkasan dengan fungsi murni (`dividends.ts`), dan menulis `out/dividends.sql`
(tabel `div_latest`). Worker menyajikan `/api/dividends` dan `/api/dividends/:code`; halaman React `#/dividen` menampilkannya.

**Tech Stack:** TypeScript, tsx (skrip & tes `node:assert`), Cloudflare Worker + D1 (`sats-db`), React 19 + Vite.

**Spec:** `docs/superpowers/specs/2026-11-19-sats-dividen-design.md`

## Global Constraints
- Tidak ada database D1 baru; tabel `div_latest` di `sats-db`.
- Tidak ada jadwal baru: langkah tambahan di `.github/workflows/sats-fundamentals.yml`.
- Dividen < 80% berhasil → `out/dividends.sql` tidak ditulis (exit 1) dan tabel lama tetap; fundamental sudah tertulis sebelumnya.
- Teks UI Bahasa Indonesia; terjemahan EN di `apps/sats/worker/src/i18n.ts`.
- Setiap perkiraan diberi keyakinan + catatan "Keputusan dividen ditentukan RUPS. Perkiraan berdasar kebiasaan masa lalu, bukan rekomendasi."

## Review Focus
1. Emiten berlaporan USD (mis. ADRO/AADI): EPS harus dikonversi ke rupiah sebelum payout dihitung, kalau tidak payout ≈ 16.000%. → tes di Task 1.
2. Saham yang baru IPO / dividen hanya sekali: tidak boleh crash; keyakinan "rendah", pertumbuhan 3 th null. → tes di Task 1.
3. Perusahaan rugi (EPS 12 bln ≤ 0): perkiraan null, tetap tampil di daftar dengan riwayatnya. → tes di Task 1.
4. Dividen spesial satu tahun (payout > 100%): median + batas 100% mencegah perkiraan meledak. → tes di Task 1.
5. Halaman dibuka sebelum job pertama jalan: `/api/dividends` mengembalikan `rows: []`, halaman menampilkan "Data dividen belum tersedia". → Task 2 (DDL dipastikan seperti `FUND_DDL`) & Task 3.

---

### Task 1: Perhitungan dividen (fungsi murni) + skrip mingguan

**Files:**
- Create: `apps/sats/worker/src/fundamentals/dividends.ts`
- Create: `apps/sats/worker/src/pipeline/run-dividends.ts`
- Create: `apps/sats/worker/src/test-dividends.ts`
- Modify: `.github/workflows/sats-fundamentals.yml` (2 langkah sesudah "Verify"; `timeout-minutes: 35`)

**Interfaces:**
- Produces (dari `dividends.ts`):
  - `type Payment = { date: string; amount: number }` (YYYY-MM-DD, rupiah/lembar)
  - `fiscalYear(date: string): number` — bulan 10–12 → tahun itu, bulan 1–9 → tahun − 1
  - `targetFy(today: string): number` — tahun dari (today − 270 hari)
  - `summarize(input: { payments: Payment[]; annualEps: Record<number, number>; epsTtm: number | null; today: string }): DivSummary | null` — EPS sudah dalam rupiah; null bila `payments` kosong
  - `interface DivSummary { last_date; last_amount; fy_last; dps_last; payout; eps_ttm; est_dps; est_paid; streak; dps_cagr3; confidence: "tinggi"|"sedang"|"rendah"|null; history: { years: Array<{ fy; dps; eps: number|null; payout: number|null }>; payments: Payment[] } }`
  - `DIV_COLUMNS`, `DIV_DDL` (tabel `div_latest`, kolom = `code`, `as_of` + field DivSummary; `history` TEXT JSON)
  - `fetchPayments(code: string): Promise<Payment[] | null>` — chart `range=10y&interval=1mo&events=div` (pola `corporateActions` di `analyst.ts`), null bila gagal
  - `fetchEps(code: string): Promise<{ currency: string | null; annual: Record<number, number>; ttm: number | null } | null>` — `ws/fundamentals-timeseries/v1/finance/timeseries/{code}.JK?type=annualDilutedEPS,trailingDilutedEPS&period1=<10 th lalu>&period2=<sekarang>`; `ttm` = nilai `asOfDate` terbaru; mata uang dari `currencyCode`

Aturan `summarize` (dari spec):
- `fy_last = targetFy(today) − 1`; `dps(fy)` = jumlah pembayaran dengan `fiscalYear = fy`; `dps_last = dps(fy_last)`.
- `payout(fy) = dps/eps×100` bila eps > 0; `payout` = median 3 TB terakhir ≤ fy_last yang punya payout, dibatasi 0–100.
- `est_dps = payout/100 × eps_ttm`, dibulatkan 2 desimal; null bila eps_ttm ≤ 0/null, payout null, atau dps(fy_last) dan dps(fy_last−1) keduanya 0.
- `est_paid = dps(targetFy)` (interim yang sudah dibayar).
- `streak` = TB berturut-turut dengan dps > 0, mundur dari fy_last, maks. 10.
- `dps_cagr3 = ((dps_last / dps(fy_last−3))^(1/3) − 1) × 100` bila keduanya > 0, else null.
- `confidence`: null bila est_dps null; "tinggi" bila streak ≥ 3 dan (maks − min payout 3 TB) ≤ 30; "sedang" bila streak ≥ 2; selain itu "rendah".

- [ ] **Step 1: Tulis tes `src/test-dividends.ts`** (gaya `test-warrant.ts`, `node:assert/strict`, akhir `console.log("semua PASS")`), memakai data BBRI nyata:
  - `fiscalYear("2024-01-02") === 2023`, `fiscalYear("2025-12-30") === 2025`, `fiscalYear("2026-04-21") === 2025`
  - `targetFy("2026-11-19") === 2026`, `targetFy("2026-05-10") === 2025`
  - BBRI: payments `[2023-01-10 57, 2023-03-24 231.22, 2024-01-02 84, 2024-03-14 235, 2024-12-27 135, 2025-04-11 208.4, 2025-12-30 137, 2026-04-21 209]`, annualEps `{2022:338, 2023:398, 2024:398, 2025:376}`, epsTtm 422, today `2026-11-19` →
    `fy_last 2025`, `dps_last 346`, payout per TB 2023 = 319/398 (80,2), 2024 = 343,4/398 (86,3), 2025 = 346/376 (92,0) →
    `payout ≈ 86,28` (±0,01), `est_dps ≈ 364,1` (±0,1), `streak 4` (TB 2022–2025), `confidence "tinggi"` (rentang 11,8), `est_paid 0`
  - EPS ≤ 0: `epsTtm -5` → `est_dps null`, `confidence null`, `history.years` tetap terisi
  - Dividen sekali: satu pembayaran 2025-05-01 → `streak 1`, `dps_cagr3 null`, `confidence "rendah"`
  - Dividen spesial: payout 3 TB = 40, 45, 250 → `payout 45`; payout semua > 100 → 100
  - `summarize({ payments: [] , ...})` → `null`
- [ ] **Step 2:** `cd apps/sats/worker && npx tsx src/test-dividends.ts` → gagal (modul belum ada).
- [ ] **Step 3:** Implementasikan `dividends.ts` sesuai Interfaces & aturan di atas.
- [ ] **Step 4:** Tes → `semua PASS`.
- [ ] **Step 5: `run-dividends.ts`** — pola `run-fundamentals.ts` (universe.json, `--limit`, CONCURRENCY 4, jeda 120 ms). Per saham: `fetchPayments` + `fetchEps`; EPS non-IDR dikali `fxToIdr(currency)` (cache per mata uang; gagal kurs → EPS null).
  Sukses = `fetchPayments` tidak null. < 80% sukses (tanpa `--limit`) → `process.exit(1)`. Tulis `DROP TABLE IF EXISTS div_latest; DIV_DDL; INSERT…` hanya untuk `summarize` non-null ke `out/dividends.sql`. Cetak BBRI, TLKM, ADRO, ITMG sebagai contoh.
  `// shortcut: EPS lama dikonversi dengan kurs hari ini, payout emiten USD sedikit meleset; pakai kurs historis bila ada keluhan.`
- [ ] **Step 6:** `npx tsx src/pipeline/run-dividends.ts --limit 30` → SQL tertulis, contoh masuk akal.
- [ ] **Step 7:** Run penuh lokal sekali → ≥ 80% sukses, ADRO payout < 150%.
- [ ] **Step 8: Workflow** — sesudah "Verify": langkah `Fetch dividends (Yahoo)` (`npx tsx src/pipeline/run-dividends.ts`) dan `Write dividends to D1` (`npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --file=out/dividends.sql`); `timeout-minutes: 35`.
- [ ] **Step 9: Commit** `SATS: data dividen mingguan (riwayat & perkiraan)`.

### Task 2: API

**Files:** Modify `apps/sats/worker/src/index.ts` (dokumentasi rute di kepala file, blok `fundReady`, rute baru dekat `/api/screener`).

**Interfaces:**
- Consumes: `DIV_DDL` (Task 1).
- Produces:
  - `GET /api/dividends` → `{ asOf: string|null, rows: DivListRow[] }`, cache 3600. `DivListRow` = semua kolom `div_latest` kecuali `history`, plus `name`, `close` (`tech_latest`), `indexes` (GROUP_CONCAT seperti screener), `hist_yield = ROUND(dps_last*100.0/close, 2)`, `est_yield = ROUND(est_dps*100.0/close, 2)`.
  - `GET /api/dividends/:code` → `{ code, history }` (history di-parse), 404 bila tidak ada.

- [ ] **Step 1:** Tambah `DIV_DDL` ke blok `fundReady` (ganti nama jadi `tablesReady`).
- [ ] **Step 2:** Implementasikan kedua rute (LEFT JOIN `tech_latest`, JOIN `stocks`).
- [ ] **Step 3:** `cd apps/sats/worker && npx tsc --noEmit` lulus; `npx wrangler dev` lalu `curl localhost:8787/api/dividends` → `rows: []` sebelum data ada (bukan 500).
- [ ] **Step 4: Commit.**

### Task 3: Halaman "Dividen"

**Files:**
- Create: `apps/sats/frontend/src/pages/Dividends.tsx`
- Modify: `apps/sats/frontend/src/api.ts` (tipe `DivListRow`, `DivHistory`; `api.dividends()`, `api.dividendHistory(code)`), `apps/sats/frontend/src/App.tsx` (rute `#/dividen` → page `"dividends"`), `apps/sats/frontend/src/components/Header.tsx` (link `nav-sec` "Dividen" setelah Pemegang + entri `SEC`), `apps/sats/worker/src/i18n.ts` (EN).

Isi halaman:
- Judul + catatan RUPS (Global Constraints) + "Data per {asOf}, diperbarui mingguan".
- Filter: cari kode/nama, indeks (`api.indices()`, seperti Screener), syariah (`useSharia`, `SHARIA_INDEXES`), keyakinan minimal (semua/sedang/tinggi).
- Tabel bisa diurutkan (klik header; default `est_yield` desc, null di bawah): Kode/Nama (klik → `openStock`), Harga, Dividen terakhir (nominal + tanggal), Yield historis, Payout, Perkiraan DPS (+ "interim sudah Rp x" bila `est_paid > 0`), Perkiraan yield, Konsistensi ("n th"), Pertumbuhan 3 th, Keyakinan (badge).
- Header kolom memakai `WithInfo` berisi rumus singkat dari spec.
- Tombol buka baris → `api.dividendHistory` → tabel per TB (DPS, EPS, payout) + daftar pembayaran.
- Kosong → "Data dividen belum tersedia (diperbarui tiap Sabtu)."; HP: tabel bisa digeser horizontal di dalam kartunya, seperti Screener.

- [ ] **Step 1:** api.ts + App.tsx + Header.tsx.
- [ ] **Step 2:** `Dividends.tsx` (pakai `useAsync`, `Loading`, `ErrorBox`, `fmtRp`/`fmtPct`/`fmtDate`).
- [ ] **Step 3:** Teks EN di `i18n.ts`.
- [ ] **Step 4:** `cd apps/sats/frontend && npm run build` lulus; `npm run lint` tanpa error baru.
- [ ] **Step 5:** Cek visual dengan data hasil run lokal Task 1 (dev server + D1 lokal), desktop & lebar 390 px, terang & gelap.
- [ ] **Step 6: Commit** `SATS: menu Dividen`.
