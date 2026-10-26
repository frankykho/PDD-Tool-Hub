-- Project Screener New — D1 schema (Cloudflare D1 / SQLite)
-- Apply:  npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --file=../database/schema.sql   (from /worker)
-- (wrangler.deploy.json dibuat oleh `node scripts/deploy.mjs --resolve sats` dari root repo; berisi ID database)
-- Idempotent: safe to run again.

-- Universe (963 saham dari Daftar_Saham_IDX.xlsx)
CREATE TABLE IF NOT EXISTS stocks (
  code        TEXT PRIMARY KEY,            -- 'BBCA'
  name        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,  -- 0 = di-skip pipeline (delisting, data Yahoo tidak ada)
  updated_at  TEXT NOT NULL
);

-- Satu baris per strategi per saham: kondisi terbaru untuk dashboard
CREATE TABLE IF NOT EXISTS sats_latest (
  strategy          TEXT NOT NULL,         -- SATS | SATS_F | TURTLE | UTBOT | FOLLOW
  code              TEXT NOT NULL REFERENCES stocks(code),
  as_of_date        TEXT NOT NULL,         -- tanggal bar terakhir (WIB, YYYY-MM-DD)
  close             REAL NOT NULL,
  prev_close        REAL,
  change_pct        REAL,
  volume            REAL,
  trend             TEXT,                  -- BULLISH | BEARISH | NULL (arti per strategi)

  signal_today      TEXT NOT NULL,         -- BUY | SELL | NONE (sinyal di as_of_date)
  last_signal       TEXT,                  -- BUY | SELL
  last_signal_date  TEXT,
  last_signal_bars  INTEGER,               -- umur sinyal dalam bar bursa
  last_signal_score REAL,                  -- hanya SATS: 0..102

  entry REAL, sl REAL, tp1 REAL, tp2 REAL, tp3 REAL,
  tp1_hit INTEGER, tp2_hit INTEGER, tp3_hit INTEGER,
  stop_now          REAL,                  -- stop / trailing / level keluar saat ini (posisi terbuka)
  trade_status      TEXT,                  -- ACTIVE | TP3 | SL | TIMEOUT
  trade_exit_date   TEXT,

  event_today       TEXT,                  -- mis. 'TP1', 'TP2,TP3', 'SL' (level tersentuh di as_of_date)
  value_20d         REAL,                  -- rata-rata nilai transaksi harian 20 hari (Rp)
  filter_signal     INTEGER,               -- 1/0: BUY terakhir lolos filter MA200 & IHSG saat sinyal
  filter_now        INTEGER,               -- 1/0: filter lolos di bar terakhir
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (strategy, code)
);
CREATE INDEX IF NOT EXISTS idx_latest_signal ON sats_latest(strategy, last_signal, last_signal_bars);
CREATE INDEX IF NOT EXISTS idx_latest_event  ON sats_latest(strategy, as_of_date, event_today);

-- Log tiap run pipeline
CREATE TABLE IF NOT EXISTS pipeline_runs (
  run_id       TEXT PRIMARY KEY,
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  as_of_date   TEXT,
  ok_count     INTEGER,
  fail_count   INTEGER,
  failed_codes TEXT                        -- JSON array
);

-- Keanggotaan indeks (KOMPAS100, LQ45, dst.) dari file worker/src/pipeline/indices/<INDEKS>.txt
CREATE TABLE IF NOT EXISTS indices (
  index_code   TEXT PRIMARY KEY,           -- 'KOMPAS100'
  name         TEXT NOT NULL,
  effective    TEXT,                       -- teks bebas, mis. '3 Agu 2026 s.d. 29 Jan 2027'
  member_count INTEGER NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS index_members (
  index_code TEXT NOT NULL,
  code       TEXT NOT NULL,
  PRIMARY KEY (index_code, code)
);
CREATE INDEX IF NOT EXISTS idx_members_code ON index_members(code);

-- Track record: satu baris per posisi BUY yang sudah selesai, per strategi (maks. 3 tahun, transaksi ≥ Rp 1 M/hari).
-- Long-only BEI: keluar di SL, TP3, sinyal SELL/EXIT, atau timeout (sesuai aturan masing-masing strategi).
CREATE TABLE IF NOT EXISTS sats_trades (
  strategy     TEXT NOT NULL,
  code         TEXT NOT NULL,
  entry_date   TEXT NOT NULL,
  entry        REAL NOT NULL,
  sl REAL, tp1 REAL, tp2 REAL, tp3 REAL,
  score        REAL,
  exit_date    TEXT NOT NULL,
  exit_reason  TEXT NOT NULL,              -- TP3 | SL | SELL | TIMEOUT
  exit_price   REAL NOT NULL,              -- SL/TP3: level, atau harga open jika gap melewati level
  return_pct   REAL NOT NULL,              -- kotor (belum biaya)
  bars_held    INTEGER NOT NULL,
  tp1_hit INTEGER, tp2_hit INTEGER, tp3_hit INTEGER,
  value_20d    REAL,                       -- rata-rata nilai transaksi 20 hari saat masuk (Rp)
  PRIMARY KEY (strategy, code, entry_date)
);
CREATE INDEX IF NOT EXISTS idx_trades_entry ON sats_trades(strategy, entry_date);
CREATE INDEX IF NOT EXISTS idx_trades_code ON sats_trades(strategy, code);

-- Kondisi pasar untuk filter SATS: IHSG vs SMA200 per hari
CREATE TABLE IF NOT EXISTS market_status (
  as_of_date  TEXT PRIMARY KEY,
  ihsg_close  REAL NOT NULL,
  ihsg_ma200  REAL NOT NULL,
  above       INTEGER NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Screener: indikator teknikal per saham (bar terakhir), dihitung oleh pipeline EOD
CREATE TABLE IF NOT EXISTS tech_latest (
  code            TEXT PRIMARY KEY,
  as_of_date      TEXT NOT NULL,
  close           REAL NOT NULL,
  chg1 REAL, chg5 REAL, chg20 REAL, chg60 REAL, chg_ytd REAL,
  ma20 REAL, ma50 REAL, ma200 REAL,
  dist_ma20 REAL, dist_ma50 REAL, dist_ma200 REAL,
  ma_stack INTEGER,
  golden_days INTEGER, death_days INTEGER,
  rsi14 REAL,
  macd_hist REAL, macd_up_days INTEGER,
  vol_ratio REAL, value_20d REAL,
  high52 REAL, low52 REAL, dist_high52 REAL, dist_low52 REAL,
  breakout20_days INTEGER,
  atr_pct REAL, bb_width REAL, bb_pctile REAL,
  cmf20 REAL, obv20 REAL, updown_vol20 REAL,
  ma150 REAL, dist_ma150 REAL, ma150_slope20 REAL, ma200_slope22 REAL,
  chg126 REAL, chg_12_1 REAL,
  adx14 REAL, pdi14 REAL, mdi14 REAL,
  stoch_k REAL, stoch_d REAL, stoch_up_days INTEGER,
  pocket_pivot_days INTEGER, vcp INTEGER, nr7 INTEGER, inside_day INTEGER,
  gap_pct REAL, body_pct REAL,
  ichi_above INTEGER, ichi_tk INTEGER, ichi_green INTEGER,
  rsi_div_days INTEGER, up_streak INTEGER,
  candles TEXT, chart_patterns TEXT,
  updated_at      TEXT NOT NULL
);

-- Pengguna dashboard: login lewat Cloudflare Access (email + kode OTP), izin diberikan admin.
CREATE TABLE IF NOT EXISTS users (
  email        TEXT PRIMARY KEY,
  name         TEXT,
  reason       TEXT,
  status       TEXT NOT NULL,              -- pending | approved | rejected | revoked
  role         TEXT NOT NULL DEFAULT 'user', -- user | admin
  requested_at TEXT,
  decided_at   TEXT,
  decided_by   TEXT,
  last_seen    TEXT
);

-- Watchlist per pengguna (dibuat otomatis oleh Worker)
CREATE TABLE IF NOT EXISTS watchlist (email TEXT NOT NULL, code TEXT NOT NULL, added_at TEXT NOT NULL, PRIMARY KEY (email, code));

-- Market breadth history (liquid stocks, value_20d >= Rp 1 M), rebuilt by every full EOD run
CREATE TABLE IF NOT EXISTS breadth_daily (
  date TEXT PRIMARY KEY, n INTEGER NOT NULL, above200 INTEGER NOT NULL, above50 INTEGER NOT NULL,
  up INTEGER NOT NULL, down INTEGER NOT NULL, hi52 INTEGER NOT NULL, lo52 INTEGER NOT NULL, ihsg REAL,
  idx30_n INTEGER, idx30_above60 INTEGER, -- IDX30 members with data / closing above SMA60
  k100_n INTEGER, k100_above60 INTEGER -- same for KOMPAS100
);

-- Laboratorium uji (rebuilt weekly by run-lab.ts; DROP + CREATE there, this is only for fresh databases)
CREATE TABLE IF NOT EXISTS lab_results (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, expect TEXT NOT NULL, verdict TEXT NOT NULL,
  n5 INTEGER, win5 REAL, avg5 REAL, med5 REAL, ex5 REAL, tr5 REAL, n10 INTEGER, win10 REAL, avg10 REAL, med10 REAL, ex10 REAL, tr10 REAL, n20 INTEGER, win20 REAL, avg20 REAL, med20 REAL, ex20 REAL, tr20 REAL, n60 INTEGER, win60 REAL, avg60 REAL, med60 REAL, ex60 REAL, tr60 REAL, nS INTEGER, winS REAL, avgS REAL, medS REAL, exS REAL, trS REAL,
  y1 REAL, y2 REAL, y3 REAL, period_from TEXT, updated_at TEXT NOT NULL
);
