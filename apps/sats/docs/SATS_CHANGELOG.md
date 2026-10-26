# SATS engine — changelog (lanjutan dari handover)

## 2026-09-23 — Trade lifecycle + koreksi parity vs Pine v1.9.0

### Mismatch yang ditemukan & diperbaiki (Pine vs TypeScript)

| # | Pine v1.9.0 | TypeScript sebelumnya | Dampak |
|---|---|---|---|
| 1 | `effAtr = rawAtr * (0.5 + 0.5*ER)`; `atrValue = effAtr` dipakai untuk band, score, dan SL | `efficiencyWeightedAtr` ada di config tapi tidak pernah dipakai; band/score/SL pakai raw ATR | **Besar** — lebar band salah, jadi sinyal, SL, dan TP ikut berubah |
| 2 | Preset `Auto`: timeframe > 240 menit → **Swing** (ATR 21, mult 2.5, ER 30, RSI 21, SL 2.0) | Selalu nilai "Default" (14 / 2.0 / 20 / 14 / 1.5) | **Besar**, kecuali di TradingView preset diset "Default" |
| 3 | `warmup = max(50, max(...)+10)` → 50 | `max(50, ...)+10` → 60 | Sinyal di bar 50–59 hilang |
| 4 | Regime dashboard dari **ER** (0.25/0.50), vol regime 0.7/1.3 | Dari TQI (0.25/0.55), vol 0.8/1.2 | Label regime salah |
| 5 | `ta.highest/lowest(…,20)` = na di < 20 bar → structure TQI 0 | Pakai window parsial | Kecil (hanya awal histori, tapi ikut ke smoothing) |
| 6 | Volume score: `useVol and hasVolume` (bar sinyal); volume 0 → 12 | Tidak cek volume bar sinyal; volume 0 → z-score | Saham tidak likuid/suspend |
| 7 | Structure score: pivot na → pivDist 0 → 16 | 12 | Kecil |
| 8 | `atrLenInput` default 13 (hanya untuk preset Custom) | 14 | Hanya preset Custom |

Juga: log debug hardcoded `index === 469` dihapus; snapshot `trade` per bar sekarang di-copy (dulu satu objek dipakai bersama semua bar, jadi flag hit akan "bocor" ke bar lama).

### Trade lifecycle (baru: `src/sats/lifecycle.ts`)

Port langsung dari section Pine 5, 5.5, 6.5, 7.5, dan HIT DETECTION:
- Urutan dalam satu bar sama dengan Pine: sinyal baru → **menimpa** trade lama tanpa dicatat hasilnya (dicatat sebagai `REPLACED`, `counted=false`) → hit detection hanya jika `bar_index > entryBar`.
- TP1/TP2/TP3 hit via high/low; SL `low <= sl` (BUY) / `high >= sl` (SELL); timeout `age >= 100`.
- Close saat TP3 / SL / timeout. TP3 + SL di bar yang sama → TP3 (Pine cek `hitTp3` dulu).
- `calcRealizedR` / `calcTimeoutR`, clamp `[-1, tp3R]`.
- Buffer 100 sinyal, rolling stats window 20 (win rate, avg R, window DD), all-time DD, streak, regime grid 3×3 EWMA α 0.2.
- Self-learning (default OFF) dengan aturan drift/cooldown persis Pine; kalau ON, `effectiveQualityStrength` dipakai band di bar berikutnya.

Output baru di `SatsResult`: `closedTrades`, `performance`, `resolvedPreset`; di tiap bar: `tradeEvent`.

### Test
- `npx tsx src/sats/test-lifecycle.ts` → 48 test, semua PASS (nilai ekspektasi dihitung manual dari Pine).
- No-lookahead: hasil bar ≤ k identik saat data dipotong di k (dites di 3 dataset sintetis).
- Belum: parity numerik vs TradingView (butuh data asli + angka dari chart).

## 2026-09-23 (2) — Score parity + data cleaning → FULL PARITY BBCA

### Temuan 1 — Yahoo menyimpan bar di hari libur BEI
Yahoo mengisi hari libur dengan bar datar volume 0 (2026: 14–15 Mei, 27–28 Mei; total 64 bar dalam 10 tahun BBCA).
TradingView tidak punya bar di hari itu. Bar ekstra menggeser semua jendela N-bar (ER 30, ATR 21, pivot, RSI).
- Bukti: BBCA BUY 10 Jun 2026 — data mentah SL 5417,9 (salah), data bersih SL 5369,4 (TV label 5375), risk 280,6 (TV 279–281).
- Fix: `removeNonTradingBars()` di `src/data/yahoo.ts` — buang bar volume 0 (kecuali seri tanpa volume sama sekali, mis. indeks).
- **Aturan: adapter data apa pun (Yahoo / vendor lain) WAJIB hanya mengirim bar hari bursa.**

### Temuan 2 — History operator di dalam `calcScoreBreakdown`
Pine hanya mengeksekusi `calcScoreBreakdown` di bar flip (call site BUY di flipUp, SELL di flipDown, termasuk sebelum warm-up).
Akibatnya di TradingView:
- `upperBand[1]` / `lowerBand[1]` (break depth) = nilai band saat pemanggilan sebelumnya di call site yang sama (sinyal BUY/SELL sebelumnya), bukan bar sebelumnya.
- `ta.lowest/ta.highest(rsiVal, 20)` = 20 pemanggilan terakhir (na jika < 20 → RSI score 0).
- `close[1]`, `close[3]`, `volZ`, `erValue`, `lastPivot*` tetap per bar.
- Implementasi: `scoreHistoryMode: "PINE_CALL"` (default). Mode lama `"BAR"` disimpan untuk audit.

### Hasil parity BBCA (10 tahun data, preset Auto→Swing)
- `test-score-debug.ts`: 8/8 label score Jan–Sep 2026 cocok, termasuk rincian 6 komponen di 3 sinyal yang ada breakdown-nya.
- `test-parity-bbca.ts`: PARITY OK (arah, tanggal, entry, SL, TP1–3, score sinyal terakhir, urutan 6 sinyal).
- Sinyal, entry, SL, TP, dan score **identik dengan TradingView**.

### Catatan untuk tahap berikut
- Angka Performance (win rate dll.) tidak akan sama persis dengan TV karena TV memakai seluruh histori sejak listing.
- Jaringan kantor: jalankan Node dengan `$env:NODE_OPTIONS="--use-system-ca"` (SSL inspection).

### Status
```
SATS engine            ✅ parity TradingView (BBCA)
Trade lifecycle        ✅
Data cleaning Yahoo    ✅
Engine cleanup/perf    ⏳ berikutnya
Pipeline EOD → D1      ⏳
API + Frontend         ⏳
```

## 2026-09-23 (3) — Engine cleanup + EOD pipeline

### Engine
- Hapus modul mati: `sats/tqi.ts`, `sats/pivot.ts`, `sats/indicators.ts` (tidak di-import; logikanya ada di `engine.ts`).
- Performa: tanpa slice array per bar, RSI dihitung sekali per seri. 2.400 bar: 235 ms → 62 ms.
- Output **bit-identik** dengan sebelum refactor (golden test 10 skenario × 2 mode score).

### Pipeline EOD (`worker/src/pipeline/run-eod.ts`)
- Jalan di Node (GitHub Actions), bukan di Worker (limit CPU Free 10 ms).
- 963 saham (`pipeline/universe.json`), Yahoo 10 tahun, konkurensi 4, retry 3×, buang bar hari libur, buang candle hari ini jika < 16:30 WIB.
- Output `out/eod.sql` → `wrangler d1 execute --remote --file`.
- Mode harian: tulis `sats_latest` (963 baris) + 2 sinyal terakhir per saham (~2 rb baris). `--full`: riwayat sinyal 1 tahun.
- Job gagal jika > 10% saham gagal diambil (indikasi Yahoo memblokir).

### D1 (`database/schema.sql`)
`stocks`, `sats_latest` (satu baris per saham untuk dashboard), `sats_signals` (riwayat + outcome), `pipeline_runs` (log).

### GitHub Actions (`.github/workflows/eod.yml`)
Senin–Jumat 17:00 WIB + tombol manual (opsi `full`, `codes`). Secrets: `CLOUDFLARE_API_TOKEN` (izin D1 Edit), `CLOUDFLARE_ACCOUNT_ID`.

## 2026-09-23 (4) — API + Dashboard v1

- Worker API (`worker/src/index.ts`): `/api/summary`, `/api/signals`, `/api/events`, `/api/search`, `/api/stocks/:code`, `/api/meta`. Read-only, cache 5 menit, data > 7 hari (suspensi) disembunyikan. TP/SL "hari ini" hanya untuk posisi BUY.
- Frontend React + TypeScript (`frontend/`), hash routing (`#/`, `#/saham/BBCA`):
  - Dashboard: KPI, tabel sinyal (filter BUY/SELL + umur), Entry/SL/TP1–3 dibulatkan ke fraksi BEI, bar posisi SL→TP3, status, daftar TP/SL tersentuh.
  - Detail: strip level SATS, chart TradingView Advanced Chart (widget), tangga level, riwayat sinyal ±1 tahun.
  - SELL ditampilkan sebagai sinyal keluar (engine tetap parity penuh dengan Pine).
- Hosting: frontend di-serve oleh Worker yang sama (`assets.directory = ../frontend/dist`).
- Deploy: `cd frontend && npm install && npm run build` → `cd ../worker && npx wrangler deploy`.

## 2026-09-23 (5) — Filter indeks
- Keanggotaan indeks dari file `worker/src/pipeline/indices/<INDEKS>.txt` (satu file per indeks, isi = daftar kode; baris `# name:` dan `# effective:` opsional).
- Pipeline menyinkronkan ke D1 (`indices`, `index_members`) setiap run; `--indices-only` untuk sinkron cepat tanpa hitung SATS.
- API: `/api/indices`; `summary`, `signals`, `events` menerima `&index=KOMPAS100`.
- Dashboard: dropdown "Indeks" (tersimpan di browser), KPI/tabel/kejadian ikut terfilter.
- Wajib diperbarui tiap evaluasi mayor (efektif Februari & Agustus).

## 2026-09-23 (6) — Pantauan intraday (±30 menit)
- `worker/src/pipeline/run-intraday.ts` + `.github/workflows/intraday.yml`: 09:30–16:00 WIB tiap 30 menit (Sen–Jum).
- Yahoo (tertunda ±10–15 menit), candle hari ini yang belum tutup. Menulis tabel `sats_intraday` saja (EOD tidak disentuh).
- Calon sinyal = SATS flip di candle hari ini → label "CALON BUY/SELL · belum terkonfirmasi".
- TP/SL tersentuh hari ini = dicek dari high/low hari ini terhadap level posisi BUY yang sudah terkonfirmasi.
- Dashboard: panel "Pantauan Intraday", harga ● intraday di tabel, badge calon sinyal & "TP1 hari ini", auto-refresh 5 menit.
- Data intraday otomatis disembunyikan setelah EOD sore masuk (trade_date ≤ as_of_date).
- Kedua workflow memakai concurrency group `d1-writer` supaya tidak tumpang tindih.

## 2026-09-23 (7) — Intraday DIBATALKAN
- Update (6) ditarik kembali: risiko blokir Yahoo (±13 rb request/hari) dan jadwal GitHub Actions yang sering molor.
- Dihapus: `run-intraday.ts`, `.github/workflows/intraday.yml`, `frontend/src/components/Intraday.tsx`; API/frontend kembali ke versi (5).
- Tetap dipertahankan (tidak berpengaruh): `fetchYahooDailyWithMeta` di `yahoo.ts`, concurrency group `d1-writer` di `eod.yml`.
- Tabel D1 `sats_intraday` yang sempat dibuat di-drop manual (`DROP TABLE IF EXISTS sats_intraday`).
- Data tetap EOD (17:00 WIB). Jika kelak butuh intraday: pakai feed data berlisensi (dari broker/penyedia data), bukan Yahoo.

## 2026-09-24 — Track Record + Kalkulator Posisi
- Tabel D1 `sats_trades`: posisi BUY selesai (long only). Keluar di SL / TP3 (harga open jika gap) / sinyal SELL (close) / timeout 100 bar.
  `--full` menulis 5 tahun; mode harian menulis ulang trade yang masuk ≤ 160 bar terakhir.
- API `/api/track?years=&minScore=&index=&code=`: agregat (win rate, rata-rata return bersih setelah biaya 0,4%, TP1–3 tercapai, cara keluar),
  per bucket score, per tahun, per saham (≥ 5 trade), atau daftar trade satu saham.
- Halaman `#/track-record` + ringkasan per saham di halaman detail.
- Kalkulator posisi di halaman detail (posisi BUY aktif): modal, risiko %, harga beli → jumlah lot; fee 0,15% beli / 0,25% jual ikut dihitung.

## 2026-09-24 (2) — Likuiditas, penanda risiko, median
- Pipeline menyimpan `value_20d` (rata-rata nilai transaksi 20 hari, Rp) di `sats_latest` dan di `sats_trades` (saat masuk).
- Migrasi sekali jalan: `database/migrations/002_liquidity.sql` (ALTER sats_latest, buat ulang sats_trades) → lalu EOD `full`.
- Track Record: filter nilai transaksi minimal & harga minimal, median return, rata-rata tanpa 1% trade terbaik, histogram return.
- Dashboard & detail: penanda ⚠ Tidak likuid (< Rp 1 M/hari), SL > 15%, Harga < Rp 50; opsi "Sembunyikan sinyal berisiko" (URL `safe=1`).

## 2026-09-24 (3) — Multi-strategi
- Strategi: `SATS`, `SATS_F` (BUY SATS hanya jika close > SMA200 dan IHSG ^JKSE > SMA200), `TURTLE` (Donchian 20/10, stop 2×ATR20),
  `UTBOT` (script Franky, key 1, ATR 10), `FOLLOW` (Follow Line + MACD Shield V9, mode Adaptive, input default).
- Engine: `worker/src/strategies/*` — port baris per baris; UT Bot & Follow Line dicek identik dengan port Python independen
  (3 dataset sintetis). Semua long-only, SELL/EXIT = keluar di harga penutupan.
- DB (migrasi `003_strategies.sql`): `sats_latest` & `sats_trades` punya kolom `strategy`; `sats_latest.stop_now`; `sats_signals` dihapus
  (riwayat di halaman detail dari `sats_trades`). Riwayat trade `--full` = 3 tahun, hanya saham ≥ Rp 1 M/hari saat masuk.
  Harian: hanya trade yang ditutup ≤ 5 bar terakhir. `--strategies` untuk memecah backfill jika mendekati limit D1.
- API: semua endpoint menerima `?s=`; `/api/strategies`, `/api/track/compare`, `period=all|before|recent` (12 bulan terakhir = data uji),
  profit factor.
- Frontend: pilihan Strategi di header (tersimpan), dashboard/detail/track record ikut strategi; kolom trailing stop untuk strategi
  tanpa target; tabel "Perbandingan strategi"; chip "Sinyal di semua strategi" di detail.
- Pine: `pine/turtle_donchian_20_10.pine`, `pine/sats_filter_ma200_ihsg.pine` untuk cek di TradingView.
- Parity: `npx tsx src/data/test-strategies-bbca.ts BBCA` → cocokkan tanggal sinyal dengan chart TradingView.

## 2026-09-24 (4) — Follow Line V10
- Strategi `FOLLOW10`: V9 + perbaikan logika (reset garis saat tren berbalik, exit berbasis kondisi, exit saat tren turun,
  stop sungguhan yang hanya naik, sinyal Pine hanya di candle tutup). Entry & parameter identik dengan V9.
- Engine `worker/src/strategies/followline10.ts` dicek identik dengan port Python independen (4 dataset). Pine: `pine/follow_line_macd_shield_v10.pine`.
- Menghapus V9 nanti: hapus entri `FOLLOW` di `worker/src/strategies/types.ts`, `worker/src/strategies/index.ts`, `frontend/src/strategy.ts`,
  lalu `DELETE FROM sats_latest WHERE strategy='FOLLOW'; DELETE FROM sats_trades WHERE strategy='FOLLOW';`.

## 2026-09-24 (5) — SATS dengan setting IDX Core
- Strategi `SATS_IDX`: engine SATS v1.9.0 yang sama (parity TradingView), input Preset = Custom:
  ATR 14, band 2.2, ER 20, RSI 14, adaptasi 0.35, asimetri 0.35, char-flip min age 6, SL 1.5×ATR, TP Dynamic.
- Catatan: di SATS v1.9.0 character flip praktis tidak aktif (syarat close < source), jadi input char-flip tidak mengubah sinyal.
- Backfill: workflow full dengan strategi `SATS_IDX`.

## 2026-09-25 — Varian dirampingkan
Hasil `compare-variants.ts` (data asli s/d 2026-09-23, transaksi ≥ Rp 5 M/hari, return bersih):
- Follow Line — pembentukan: V9 +2,94% vs V10 +2,71% (sama). Uji 12 bln: V9 −2,76% (PF 0,65; CI seluruhnya negatif) vs V10 −1,03% (PF 0,86),
  peluang V10 lebih baik 94%. → **V10 dipertahankan**, V9 dihapus.
- SATS — pembentukan: v1.9.0 +0,73% vs IDX Core +0,58%. Uji: +0,24% (PF 1,04) vs −0,21% (PF 0,97); tidak beda nyata.
  → **v1.9.0 default dipertahankan**, IDX Core dihapus.
- Catatan: di periode uji belum ada strategi di atas yang untung secara meyakinkan (median −4,7% s/d −5,9%).
- Hapus dari engine & UI; data: `database/migrations/004_remove_variants.sql`. `followline.ts` (V9) tetap ada karena dipakai V10 untuk parameter.
- `compare-variants.ts --all`: statistik & interval keyakinan tiap strategi per periode.

## 2026-09-25 (2) — Strategi final: SATS + filter (utama) & SATS (pantauan)
Hasil `compare-variants.ts --all` (data s/d 2026-09-23, transaksi ≥ Rp 5 M/hari, bersih):
| Strategi | Pembentukan | Uji 12 bln | Uji tanpa 1% terbaik | Uji ≥ Rp 20 M |
|---|---|---|---|---|
| SATS + filter | +1,84% PF 1,37 | +2,66% PF 1,37 (CI > 0) | +0,85% | +3,12% PF 1,46 |
| SATS | +0,73% PF 1,15 | +0,24% PF 1,04 | −1,23% | +0,14% |
| UT Bot | +0,60% PF 1,16 | +0,33% PF 1,07 | −0,90% | +0,34% |
| Follow Line V10 | +2,71% PF 1,57 | −1,03% PF 0,86 | −2,67% | −0,98% |
| Turtle | +3,40% PF 1,59 | −3,20% PF 0,59 (CI < 0) | −4,39% | −3,28% |
- Terdaftar: `SATS_F` (default) dan `SATS`. Engine Turtle/UT Bot/Follow Line tetap di `worker/src/strategies` (tidak didaftarkan).
- `sats_latest.filter_signal` / `filter_now` + tabel `market_status` (IHSG vs SMA200). Migrasi `005_final_strategies.sql`.
- Dashboard: banner "Filter pasar TERBUKA/TERTUTUP"; di strategi SATS, badge "✓ lolos filter / ✕ tidak lolos" untuk BUY.

## 2026-09-29 — Screener teknikal (10 preset)
- Pipeline menghitung indikator per saham (`worker/src/screener/metrics.ts`, dicek sama dengan pandas): perubahan 1/5/20/60 hari & YTD,
  jarak ke MA20/50/200, MA berurut, golden/death cross (hari lalu), RSI14 (Wilder), MACD hist & cross naik, volume vs rata-rata 20 hari
  sebelumnya, nilai transaksi 20 hari, jarak ke high/low 52 minggu, breakout 20 hari, ATR%, lebar BB(20,2) & peringkatnya 6 bulan.
  Disimpan di tabel `tech_latest` (1 baris/saham/hari).
- API `/api/screener`: semua baris + status SATS + daftar indeks; penyaringan di browser.
- Halaman `#/screener`: 10 preset (Uptrend kuat, Breakout 20 hari + volume, Dekat high 52 minggu, Pullback di tren naik,
  Oversold di tren naik, Golden cross baru, MACD cross naik baru, Lonjakan volume, Squeeze, SATS BUY lolos filter),
  filter kustom, transaksi minimal, indeks, urut per kolom, simpan preset pribadi, URL bisa dibagikan, export CSV.

## 2026-09-29 (2) — Preset aliran dana (proksi "bandar")
- Metrik baru di `tech_latest`: `cmf20` (Chaikin Money Flow 20), `obv20` (OBV bersih 20 hari ÷ total volume), `updown_vol20`
  (volume hari naik ÷ hari turun). Dicek sama dengan pandas. Migrasi `006_money_flow.sql` (tabel dibuat ulang, diisi tiap EOD).
- Preset: Akumulasi diam-diam, Aliran dana kuat, Distribusi (waspada). Hanya dari harga & volume; data broker/asing belum ada.

## 2026-09-29 (3) — Screener: 12 preset baru, review preset lama
- Indikator baru di `tech_latest` (migrasi `007_presets_v2.sql`), semua dicek dengan pandas: MA150 & kemiringan MA150/MA200, perubahan 6 bln &
  12−1 bln, ADX/+DI/−DI (Wilder), Stochastic 14/1/3, pocket pivot, VCP sederhana, NR7, inside day, gap, body, Ichimoku 9/26/52,
  divergensi bullish RSI, hari naik beruntun. RS rank (persentil 6 bln di saham ≥ Rp 1 M/hari) dihitung di browser.
- Preset baru: Minervini Trend Template, Stage 2, Momentum 6 bln, ADX, Ichimoku, Pocket Pivot, Gap naik + volume, Stochastic keluar oversold,
  NR7/Inside day, VCP, Divergensi RSI, Pantulan dari low 52 minggu.
- Dihapus: "Uptrend kuat" (duplikat longgar dari Minervini Trend Template). Preset lain dipertahankan.
- Preset dikelompokkan: Tren · Entry & breakout · Volatilitas · Aliran dana · Pembalikan (berisiko) · SATS (24 preset).

## 2026-09-30 — Pipeline: tech_latest dibangun ulang setiap run
- Run 29 Sep gagal kemungkinan karena kolom baru screener belum ada di D1 (migrasi belum dijalankan) → seluruh import dibatalkan.
- `run-eod.ts` kini menulis `DROP TABLE IF EXISTS tech_latest` + `CREATE TABLE` sesuai `TECH_COLUMNS` di setiap run universe penuh,
  jadi penambahan indikator screener tidak lagi butuh migrasi dan tidak bisa menggagalkan update harian.

## 2026-09-30 (2) — Track Record: ambil untung bertahap
- API `mode=scaled`: return = rata-rata harga jual 3 bagian (TP1/TP2/TP3 bila tersentuh, selain itu harga keluar) ÷ entry − 1, lalu −0,4% biaya.
  Dihitung langsung di SQL dari kolom yang sudah ada (tidak perlu backfill). `/api/stocks` mengembalikan `net_pct` dan `net_scaled`.
- Track Record: tombol "Cara keluar: Utuh | Bertahap ⅓" (tersimpan di browser, berlaku juga di halaman detail);
  riwayat posisi di halaman detail menampilkan kedua versi return.

## 2026-10-02 — Cari pola candle & chart
- `worker/src/screener/patterns.ts`: 21 pola candle (hammer, engulfing, harami, piercing/dark cloud, morning/evening star,
  three white soldiers/black crows, marubozu, tweezer, doji & variannya). Pola reversal butuh tren 5 hari sebelumnya.
  4 pola chart dari pivot 3/3: double bottom, double top, ascending triangle, bull flag — status "forming" / "breakout" (≤ 3 hari).
  Diuji dengan data buatan untuk setiap pola utama.
- `tech_latest.candles` ("id@hariLalu", 5 hari terakhir) dan `tech_latest.chart_patterns` ("id:status"), kolom TEXT.
  Tidak perlu migrasi: tabel dibuat ulang setiap run.
- Screener: panel "Cari pola candle & chart" (multi-pilih, umur ≤ hari ini/2/5 hari, status chart), kolom "Pola", ikut di URL & CSV.
  Halaman detail: "Pola terdeteksi (5 hari)".

## 2026-10-05 — Pola di dashboard
- API: `/api/signals`, `/api/level-hits`, `/api/stocks` ikut mengembalikan `candles` & `chart_patterns` (LEFT JOIN `tech_latest`).
- Dashboard: badge pola (maks. 2; candle ≤ 2 hari + pola chart) di bawah nama saham; filter "Ada pola bullish" (URL `pb=1`).

## 2026-10-05 (2) — Login & persetujuan akses
- Login: Cloudflare Access (email + one-time PIN, policy Allow Everyone). Worker memverifikasi JWT Access (RS256, AUD, issuer, expiry)
  di `worker/src/auth.ts`.
- Izin: tabel `users` (pending/approved/rejected/revoked, role user/admin). Semua endpoint data butuh status approved.
  Endpoint: `GET /api/me`, `POST /api/access/request`, `GET/POST /api/admin/users` (approve, reject, revoke, make_admin, remove_admin).
  Admin utama dari var `ADMIN_EMAILS`. Auth baru aktif setelah `ACCESS_TEAM` & `ACCESS_AUD` diisi (deploy tanpa itu = terbuka seperti sebelumnya).
- Frontend: halaman pengajuan akses / menunggu persetujuan, halaman `#/admin` (badge jumlah pengajuan), email + tombol Keluar di header.
- Diuji: tanpa token, AUD salah, token kedaluwarsa, tanda tangan diubah → 401; alur ajukan → setujui → cabut; non-admin ke /api/admin → 403.

## 2026-10-05 (3) — Login dengan Google (tanpa kartu kredit)
- Alternatif Cloudflare Access: OAuth Google (scope openid email profile) → cookie sesi `sats_session` (HMAC-SHA256, 30 hari,
  HttpOnly/Secure/SameSite=Lax). Rute: `/api/auth/login`, `/api/auth/callback` (cek state, aud, issuer, expiry, email_verified),
  `/api/auth/logout`. Aktif bila `GOOGLE_CLIENT_ID` (var) + secret `GOOGLE_CLIENT_SECRET` & `SESSION_SECRET` diisi.
- Alur persetujuan admin tidak berubah. `/api/me` mengembalikan `logoutUrl` sesuai metode login.
- Diuji: state salah, aud salah, email belum terverifikasi → ditolak; cookie dengan tanda tangan palsu / isi ditukar → 401.

## 2026-10-05 (4) — Login email + password bawaan (tanpa layanan luar)
- `LOGIN: "password"` di wrangler vars → daftar/masuk langsung di dashboard. Password PBKDF2-SHA256 (20.000 iterasi, salt per user),
  kunci 15 menit setelah 5 kali salah. Cookie sesi HMAC 30 hari; kunci sesi dibuat otomatis & disimpan di D1 (`app_settings`).
- Tabel `users` dibuat/dilengkapi otomatis oleh Worker (tidak perlu SQL manual).
- Pendaftar baru = pending → disetujui admin. Email di `ADMIN_EMAILS` langsung admin saat daftar. Admin bisa "Reset password"
  (pengguna daftar ulang dengan email yang sama; status akses tetap) dan "Tambahkan langsung" (pra-setujui email).
- Login Google / Cloudflare Access tetap didukung bila dikonfigurasi.

## 2026-10-05 (5) — Fundamental (Yahoo, mingguan)
- Cek kelengkapan (963 saham): KOMPAS100/LQ45 ±90–100% untuk PBV, ROE, DER, pertumbuhan, dividen; PER 60% di semua saham (279 emiten rugi).
- `worker/src/fundamentals/*`: quoteSummary (+ assetProfile untuk sektor), koreksi mata uang laporan (±108 emiten USD: PBV ÷ kurs,
  laba × kurs), PER dihitung ulang bila kosong, nilai ekstrem dibuang (PER > 1000, PBV > 200, dll.), tanda laporan lama (> 9 bulan).
- `run-fundamentals.ts` → tabel `fund_latest` (dibuat ulang; tidak ditulis bila < 80% berhasil). Workflow `fundamentals.yml` Sabtu 08:00 WIB.
- API: screener & sinyal ikut membawa data fundamental; `/api/stocks` mengembalikan `fundamentals`.
- Screener: 10 kolom fundamental + "Fundamental sehat"; grup preset Fundamental (Kualitas + tren, Murah + momentum, Dividen + tren naik,
  Pertumbuhan + kekuatan harga, ⚠ Fundamental lemah). Dashboard: filter "Fundamental sehat", penanda ⚠ Ekuitas negatif.
  Halaman detail: kartu Fundamental.

## 2026-10-16 — Pindah ke monorepo
- Lokasi: `apps/sats/` (worker, frontend, database, docs, pine). Worker `sats-radar`, database D1 `sats-db` (ID dicari menurut nama oleh
  `scripts/deploy.mjs`). Workflow pindah ke root repo: `sats-eod.yml`, `sats-fundamentals.yml`, `sats-lab.yml`.
- `HUB_URL`, `ADMIN_EMAILS`, `GITHUB_REPO` disuntik `scripts/deploy.mjs` dari profil; tidak ada lagi alamat bawaan di kode.
- Header `frame-ancestors` tidak lagi dari `frontend/public/_headers`: halaman `/` lewat worker (`assets.run_worker_first`) yang menambahkan
  `frame-ancestors 'self' <HUB_URL>`.
- Cron worker satu ekspresi `17 10,12 * * 1-5` (17:17 & 19:17 WIB) memicu `sats-eod.yml`; jadwal GitHub di workflow tetap sebagai cadangan.
- Perintah D1 manual (dari `apps/sats/worker`, setelah `node scripts/deploy.mjs --resolve sats` di root):
  `npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --file=../database/schema.sql`.

## 2026-10-26 — Preset "Breakout 20 hari + RS ≥ 70, volume tenang"
- Grup "✓ Teruji BEI", id `breakout_rs70`: close di atas high 20 hari hari ini, harga > MA50, RS (persentil kenaikan 6 bulan) ≥ 70, volume < 1,5× rata-rata 20 hari. Ikut diuji Lab Uji tiap minggu seperti preset lain.
- Asal: uji 22 sinyal alternatif tanpa filter high 52 minggu (904 saham, Okt 2023–Okt 2026, metode Lab Uji). Excess 20 hari +7,9%, win rate 51%, positif 3 tahun; stabil bila RS 50–90, breakout 10–40 hari, volume < 2×.
- Catatan: keunggulan terutama di saham Rp1–10 M/hari (+11,8%); saham ≥ Rp10 M/hari hanya +1,1%. Simulasi portofolio (mesin Strategy Lab, 10 posisi, slippage 0,25–1%) lebih baik dari preset 52M (CAGR ±45–72% vs ±13–25%, MDD ±−45% vs ±−60%), tetapi laba bergantung pada ±10 trade terbaik.
- Tidak berguna di BEI pada uji yang sama: EMA9/21 cross, Supertrend, MACD cross, RSI tembus 60, pullback MA20, RSI2 oversold, squeeze lalu breakout. Bandarmology broker summary (pilot 30 saham, 2 tahun) juga tidak memberi keunggulan.

## 2026-10-26 (2) — Breadth KOMPAS100 & IDX30 (% di atas SMA60) & saham suspensi
- `run-eod.ts` menghitung breadth KOMPAS100 dan IDX30: jumlah anggota `indices/KOMPAS100.txt` / `IDX30.txt` yang tutup di atas SMA60 per hari (kolom baru `k100_n`, `k100_above60`, `idx30_n`, `idx30_above60` di `breadth_daily`; tabel kini DROP + CREATE tiap EOD penuh sehingga kolom baru ikut). `/api/breadth` memakai `SELECT *` agar tetap jalan sebelum EOD pertama.
- Patokan utama KOMPAS100 (≥ 60% kuat, ≥ 50% sehat, < 50% lemah), IDX30 sebagai pembanding. Tampil di Hari Ini (kartu "Breadth KOMPAS100"), Screener (baris "Pasar sehat / lemah") dan Pasar (grafik + angka). Ide dari indikator TradingView "IDX Market Breadth (Kairi SMA60)".
- Uji (Okt 2023–Okt 2026, anggota indeks saat ini): KOMPAS100 ≥ 50% → saham likuid rata-rata +2,4% dalam 20 hari, sinyal Breakout + RS +12,8% (≥ 60%: +17,7%); < 50% → −1,4% dan +3,0%. IDX30: +1,5% / −0,8% (sinyal +13,0% / +3,9%), IHSG > MA200: +1,2% / −0,7%. Korelasi KOMPAS100 vs IDX30 0,94. Dipakai untuk besar posisi, bukan sinyal.
- Diuji juga, tidak ditambahkan: "Anti Nyangkut" harian (C > MA5 & > Bollinger atas) excess +0,9% (baru bagus setelah filter RS + volume tenang, dan saat itu sama dengan preset breakout_rs70).
- Screener & Hari Ini menyembunyikan saham tanpa transaksi di hari bursa terakhir (suspensi), supaya sinyal "hari ini" yang basi tidak tampil.

## 2026-10-26 (3) — Halaman Pola Chart (#/pola) + 10 pola chart baru
- Detektor baru di `screener/patterns.ts` (status `forming` / `breakout`, ikut `tech_latest.chart_patterns`, Screener, dan Lab Uji): cup & handle, channel breakout (`channel_up`), inverse head & shoulders, head & shoulders top, rounding bottom, falling wedge, rising wedge, symmetrical triangle, Wyckoff accumulation, tren naik baru. ±0,035 ms per saham.
- Halaman **Pola** (menu baru): kartu per pola dikelompokkan Breakout / Pembalikan / Konsolidasi / Wyckoff / Tren, berisi jumlah saham, jumlah breakout, top pick (breakout dulu, lalu RS), daftar lengkap, tautan ke Screener, dan vonis Lab Uji (admin). Saham suspensi tidak ikut; filter nilai transaksi, indeks, hanya breakout.
- Lab Uji lokal (Okt 2023–Okt 2026, excess 10 hari vs pasar): teruji = channel breakout +1,4%, tren naik baru +2,0%, ascending triangle +0,8%, tetapi ketiganya negatif bila 10 sinyal terbaik dibuang (bandingkan preset breakout_rs70: +6,5%, tanpa 10 terbaik +4,6%). Kalah dari pasar: double bottom, inverse H&S, falling wedge, symmetrical triangle. Netral: cup & handle, rounding bottom, H&S top, rising wedge, double top, VCP. Data kurang: bull flag (45 sinyal), Wyckoff (11).
