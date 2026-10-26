/** D1 tables of the daily frequency / HAKA-HAKI collection (pipeline/run-flow.ts). */
export const FLOW_DDL = [
  "CREATE TABLE IF NOT EXISTS flow_daily (date TEXT NOT NULL, code TEXT NOT NULL, freq INTEGER NOT NULL, lot INTEGER NOT NULL, " +
    "b_lot INTEGER NOT NULL, s_lot INTEGER NOT NULL, b_freq INTEGER NOT NULL, s_freq INTEGER NOT NULL, vwap REAL, PRIMARY KEY (date, code));",
  "CREATE INDEX IF NOT EXISTS flow_daily_code ON flow_daily (code, date);",
  "CREATE TABLE IF NOT EXISTS flow_latest (code TEXT PRIMARY KEY, date TEXT NOT NULL, levels TEXT NOT NULL);",
];

/** BEI "Ringkasan Saham" uploaded by an admin (/api/flow/upload): official daily volume & frequency, also for past dates. */
export const IDX_DDL = [
  "CREATE TABLE IF NOT EXISTS idx_daily (date TEXT NOT NULL, code TEXT NOT NULL, close REAL, volume INTEGER NOT NULL, value REAL, " +
    "freq INTEGER NOT NULL, nr_volume INTEGER NOT NULL DEFAULT 0, nr_freq INTEGER NOT NULL DEFAULT 0, foreign_buy INTEGER, foreign_sell INTEGER, " +
    "uploaded_by TEXT, PRIMARY KEY (date, code));",
  "CREATE INDEX IF NOT EXISTS idx_daily_code ON idx_daily (code, date);",
];
