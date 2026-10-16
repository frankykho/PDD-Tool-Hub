/** Shared definition of the fundamentals table (pipeline writes it, the API reads it). */
export const FUND_COLUMNS: Array<[string, "TEXT" | "REAL" | "INTEGER"]> = [
  ["code", "TEXT"],
  ["as_of", "TEXT"], // date the data was fetched
  ["currency", "TEXT"], // reporting currency (IDR, USD, ...)
  ["last_quarter", "TEXT"], // most recent reported quarter end
  ["sector", "TEXT"],
  ["industry", "TEXT"],
  ["market_cap", "REAL"], // IDR
  ["per", "REAL"], // trailing P/E (null when loss-making)
  ["pbv", "REAL"], // price / book, currency-corrected
  ["roe", "REAL"], // %
  ["der", "REAL"], // × (null for banks / not reported)
  ["rev_growth", "REAL"], // % YoY latest quarter
  ["eps_growth", "REAL"], // % YoY latest quarter
  ["div_yield", "REAL"], // % trailing 12 months (may include special dividends)
  ["net_income", "REAL"], // IDR, trailing 12 months
  ["profitable", "INTEGER"], // 1 = net income > 0
  ["equity_positive", "INTEGER"], // 1 = book value > 0
  ["stale", "INTEGER"], // 1 = latest report older than 9 months
];

export const FUND_DDL =
  `CREATE TABLE IF NOT EXISTS fund_latest (` +
  FUND_COLUMNS.map(([c, t]) => (c === "code" ? `${c} TEXT PRIMARY KEY` : `${c} ${t}`)).join(", ") +
  `)`;
