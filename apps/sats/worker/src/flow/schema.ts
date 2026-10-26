/** D1 tables of the daily frequency / HAKA-HAKI collection (pipeline/run-flow.ts). */
export const FLOW_DDL = [
  "CREATE TABLE IF NOT EXISTS flow_daily (date TEXT NOT NULL, code TEXT NOT NULL, freq INTEGER NOT NULL, lot INTEGER NOT NULL, " +
    "b_lot INTEGER NOT NULL, s_lot INTEGER NOT NULL, b_freq INTEGER NOT NULL, s_freq INTEGER NOT NULL, vwap REAL, PRIMARY KEY (date, code));",
  "CREATE INDEX IF NOT EXISTS flow_daily_code ON flow_daily (code, date);",
  "CREATE TABLE IF NOT EXISTS flow_latest (code TEXT PRIMARY KEY, date TEXT NOT NULL, levels TEXT NOT NULL);",
];
