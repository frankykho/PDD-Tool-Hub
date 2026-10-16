-- Jalankan SEKALI (sesudah itu schema.sql sudah memuat kolom-kolom ini):
--   npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --file=../database/migrations/002_liquidity.sql
-- Lalu jalankan workflow EOD SATS dengan opsi "full" untuk mengisi ulang data.
ALTER TABLE sats_latest ADD COLUMN value_20d REAL;
DROP TABLE IF EXISTS sats_trades;
CREATE TABLE sats_trades (
  code         TEXT NOT NULL,
  entry_date   TEXT NOT NULL,
  entry        REAL NOT NULL,
  sl REAL, tp1 REAL, tp2 REAL, tp3 REAL,
  score        REAL,
  exit_date    TEXT NOT NULL,
  exit_reason  TEXT NOT NULL,
  exit_price   REAL NOT NULL,
  return_pct   REAL NOT NULL,
  bars_held    INTEGER NOT NULL,
  tp1_hit INTEGER, tp2_hit INTEGER, tp3_hit INTEGER,
  value_20d    REAL,
  PRIMARY KEY (code, entry_date)
);
CREATE INDEX IF NOT EXISTS idx_trades_entry ON sats_trades(entry_date);
