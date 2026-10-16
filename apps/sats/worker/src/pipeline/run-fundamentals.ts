/**
 * Weekly fundamentals: Yahoo quoteSummary for every stock -> out/fundamentals.sql (table fund_latest, rebuilt).
 *
 *   npx tsx src/pipeline/run-fundamentals.ts            # all 963 (±2 minutes)
 *   npx tsx src/pipeline/run-fundamentals.ts --limit 30 # quick test
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { FUND_COLUMNS, FUND_DDL } from "../fundamentals/schema";
import { fetchFund, fxToIdr, normalise, yahooSession, type FundRow, type RawFund } from "../fundamentals/yahooFund";
import universe from "./universe.json";

const args = process.argv.slice(2);
const limit = Number(args[args.indexOf("--limit") + 1] ?? 0) || 0;
const CONCURRENCY = 4;
const q = (v: string | null | undefined) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "NULL" : String(v));

async function main() {
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  let codes = (universe as Array<{ code: string }>).map((u) => u.code);
  if (limit > 0) codes = codes.slice(0, limit);
  const s = await yahooSession();
  console.log(`Fundamental ${codes.length} saham (${today})...`);

  const raw: RawFund[] = [];
  let cursor = 0;
  const t0 = Date.now();
  async function worker() {
    while (cursor < codes.length) {
      const code = codes[cursor++];
      raw.push(await fetchFund(code, s));
      if (raw.length % 100 === 0) console.log(`  ${raw.length}/${codes.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const currencies = [...new Set(raw.map((r) => r.currency).filter(Boolean) as string[])];
  const fx: Record<string, number> = { IDR: 1 };
  for (const c of currencies) {
    if (c === "IDR") continue;
    try {
      fx[c] = await fxToIdr(c);
      console.log(`Kurs ${c}/IDR: ${fx[c].toFixed(0)}`);
    } catch (e) {
      console.warn(`Kurs ${c} gagal (${e instanceof Error ? e.message : e}) — PBV/laba emiten ${c} dikosongkan`);
    }
  }

  const rows: FundRow[] = raw.filter((r) => r.ok).map((r) => normalise(r, fx, today));
  const okShare = rows.length / codes.length;
  console.log(`OK ${rows.length}/${codes.length} (${(okShare * 100).toFixed(0)}%) · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (!limit && okShare < 0.8) {
    console.error("Kurang dari 80% berhasil — tabel lama tidak diganti.");
    process.exit(1);
  }

  const cols = FUND_COLUMNS.map(([c]) => c);
  const sql = [
    "DROP TABLE IF EXISTS fund_latest;",
    `${FUND_DDL};`,
    ...rows.map((r) => {
      const v: Record<string, string> = {
        code: q(r.code), as_of: q(today), currency: q(r.currency), last_quarter: q(r.last_quarter), sector: q(r.sector),
        industry: q(r.industry), market_cap: n(r.market_cap), per: n(r.per), pbv: n(r.pbv), roe: n(r.roe), der: n(r.der),
        rev_growth: n(r.rev_growth), eps_growth: n(r.eps_growth), div_yield: n(r.div_yield), net_income: n(r.net_income),
        profitable: n(r.profitable), equity_positive: n(r.equity_positive), stale: n(r.stale),
      };
      return `INSERT INTO fund_latest (${cols.join(", ")}) VALUES (${cols.map((c) => v[c]).join(", ")});`;
    }),
  ];
  mkdirSync("out", { recursive: true });
  writeFileSync("out/fundamentals.sql", sql.join("\n") + "\n");
  console.log(`SQL: ${sql.length} statements -> out/fundamentals.sql`);

  const show = ["BBCA", "ADRO", "BYAN", "TLKM", "AMMN"];
  for (const c of show) {
    const r = rows.find((x) => x.code === c);
    if (r) console.log(`  ${c.padEnd(5)} ${r.currency} PER ${r.per ?? "—"} PBV ${r.pbv ?? "—"} ROE ${r.roe ?? "—"}% DER ${r.der ?? "—"} div ${r.div_yield ?? "—"}%`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
