/**
 * EOD pipeline: Yahoo OHLCV -> 5 strategies (SATS, SATS+filter, Turtle, UT Bot, Follow Line) -> SQL file for D1.
 *
 * Runs in Node (GitHub Actions or locally), NOT inside the Worker (CPU limits).
 *
 *   npx tsx src/pipeline/run-eod.ts                       # all codes, daily mode
 *   npx tsx src/pipeline/run-eod.ts --full                # also (re)write 3 years of closed trades
 *   npx tsx src/pipeline/run-eod.ts --full --strategies UTBOT,FOLLOW   # split a big backfill over days
 *   npx tsx src/pipeline/run-eod.ts --codes BBCA,TLKM     # subset (testing)
 *
 * Output: out/eod.sql (apply with wrangler d1 execute) + out/eod-summary.json
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchYahooDaily } from "../data/yahoo";
import { cleanBars } from "../data/clean";
import type { SatsInputBar } from "../sats/types";
import { runAllStrategies, satsFilterMask, STRATEGIES, isStrategyId, type StratResult, type StrategyId } from "../strategies";
import { sma } from "../strategies/series";
import { computeTech, TECH_COLUMNS, TECH_TEXT_COLUMNS } from "../screener/metrics";
import universe from "./universe.json";

// ---------- config
const YEARS = 10; // same depth as the BBCA parity test (bands/smoothing are path-dependent)
const CONCURRENCY = 4;
const RETRIES = 3;
const TRADE_YEARS_FULL = 3; // track record window written by --full (D1 free tier: 100k writes/day)
const TRADE_EXIT_BARS_DAILY = 5; // daily: write trades that closed in the last 5 bars
const MIN_VALUE_FOR_HISTORY = 1e9; // store closed trades only when entry value_20d >= Rp 1 M/day
const IHSG_SYMBOL = "^JKSE";
const BREADTH_DAYS = 260; // ≈ 1 year of daily market breadth, rebuilt every full run
const BREADTH_MIN_VALUE = 1e9; // breadth counts liquid stocks only (value_20d >= Rp 1 M/day)

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const FULL = args.includes("--full");
const INDICES_ONLY = args.includes("--indices-only");
const onlyCodes = arg("--codes")?.split(",").map((c) => c.trim().toUpperCase());
const limit = Number(arg("--limit") ?? 0);
const outDir = arg("--out") ?? "out";
const onlyStrategies = arg("--strategies")
  ?.split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(isStrategyId);

// ---------- helpers
const wib = (t: number) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);
const nowWib = () => new Date(Date.now() + 7 * 3600 * 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = (v: string | null | undefined) => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null | undefined, d = 4) =>
  v == null || !Number.isFinite(v) ? "NULL" : String(Number(v.toFixed(d)));
const b = (v: boolean | null | undefined) => (v == null ? "NULL" : v ? "1" : "0");

async function fetchWithRetry(symbol: string): Promise<SatsInputBar[]> {
  const now = Math.floor(Date.now() / 1000);
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      return await fetchYahooDaily(symbol, now - YEARS * 365 * 86400, now);
    } catch (error) {
      lastError = error;
      await sleep(1500 * 2 ** attempt + Math.random() * 500);
    }
  }
  throw lastError;
}

/** Drop today's bar while the session is not finished yet (manual runs during market hours). */
function dropIncompleteBar(bars: SatsInputBar[]): SatsInputBar[] {
  if (bars.length === 0) return bars;
  const now = nowWib();
  const today = now.toISOString().slice(0, 10);
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const lastIsToday = wib(bars[bars.length - 1].time) === today;
  return lastIsToday && minutes < 16 * 60 + 30 ? bars.slice(0, -1) : bars;
}

/** Average daily traded value (close × volume, Rupiah) over the 20 bars ending at index i. */
function value20(bars: SatsInputBar[], i: number): number | null {
  const start = Math.max(0, i - 19);
  let sum = 0;
  let count = 0;
  for (let k = start; k <= i; k += 1) {
    sum += bars[k].close * (bars[k].volume ?? 0);
    count += 1;
  }
  return count ? sum / count : null;
}

interface StockOutput {
  code: string;
  sql: string[];
  latestRows: number;
  tradeRows: number;
  asOf: string;
}

/** SQL for one stock and one strategy: 1 row in sats_latest + closed trades. */
function strategySql(
  strategy: StrategyId,
  code: string,
  bars: SatsInputBar[],
  r: StratResult,
  values: Array<number | null>,
  stamp: string,
  mask: boolean[] | null,
): { latest: string; trades: string[] } {
  const i = bars.length - 1;
  const bar = bars[i];
  const prev = bars[i - 1];
  const lastSig = r.signals[r.signals.length - 1] ?? null;
  const lastTrade = r.trades[r.trades.length - 1] ?? null;
  const tradeOfLast = lastSig?.side === "BUY" && lastTrade && lastTrade.entryBar === lastSig.barIndex ? lastTrade : null;

  const status = tradeOfLast ? (tradeOfLast.exitBar == null ? "ACTIVE" : tradeOfLast.exitReason) : null;
  const entry = lastSig ? (tradeOfLast ? tradeOfLast.entry : bars[lastSig.barIndex].close) : null;

  const latest =
    `INSERT OR REPLACE INTO sats_latest (strategy, code, as_of_date, close, prev_close, change_pct, volume, trend, ` +
    `signal_today, last_signal, last_signal_date, last_signal_bars, last_signal_score, ` +
    `entry, sl, tp1, tp2, tp3, tp1_hit, tp2_hit, tp3_hit, stop_now, trade_status, trade_exit_date, ` +
    `event_today, value_20d, filter_signal, filter_now, updated_at) VALUES (` +
    [
      q(strategy), q(code), q(wib(bar.time)), n(bar.close), n(prev?.close ?? null),
      n(prev ? ((bar.close - prev.close) / prev.close) * 100 : null), n(bar.volume ?? null, 0), q(r.trend),
      q(lastSig && lastSig.barIndex === i ? lastSig.side : "NONE"), q(lastSig?.side ?? null),
      q(lastSig ? wib(bars[lastSig.barIndex].time) : null), lastSig ? String(i - lastSig.barIndex) : "NULL",
      n(lastSig?.score ?? null, 2),
      n(entry), n(tradeOfLast?.sl), n(tradeOfLast?.tp1), n(tradeOfLast?.tp2), n(tradeOfLast?.tp3),
      b(tradeOfLast ? tradeOfLast.tp1Hit : null), b(tradeOfLast ? tradeOfLast.tp2Hit : null), b(tradeOfLast ? tradeOfLast.tp3Hit : null),
      n(tradeOfLast && tradeOfLast.exitBar == null ? r.stopNow : null),
      q(status), q(tradeOfLast?.exitBar != null ? wib(bars[tradeOfLast.exitBar].time) : null),
      q(r.eventToday), n(values[i], 0),
      b(mask && lastSig?.side === "BUY" ? mask[lastSig.barIndex] : null), b(mask ? mask[i] : null),
      q(stamp),
    ].join(", ") +
    `);`;

  const cutoff = wib(Math.floor(Date.now() / 1000) - TRADE_YEARS_FULL * 365 * 86400);
  const trades = r.trades
    .filter((t) => t.exitBar != null && t.exitPrice != null && t.exitReason != null)
    .filter((t) => (values[t.entryBar] ?? 0) >= MIN_VALUE_FOR_HISTORY)
    .filter((t) => (FULL ? wib(bars[t.entryBar].time) >= cutoff : (t.exitBar as number) >= i - TRADE_EXIT_BARS_DAILY))
    .map(
      (t) =>
        `INSERT OR REPLACE INTO sats_trades (strategy, code, entry_date, entry, sl, tp1, tp2, tp3, score, exit_date, exit_reason, ` +
        `exit_price, return_pct, bars_held, tp1_hit, tp2_hit, tp3_hit, value_20d) VALUES (` +
        [
          q(strategy), q(code), q(wib(bars[t.entryBar].time)), n(t.entry), n(t.sl), n(t.tp1), n(t.tp2), n(t.tp3), n(t.score, 2),
          q(wib(bars[t.exitBar as number].time)), q(t.exitReason), n(t.exitPrice), n((((t.exitPrice as number) - t.entry) / t.entry) * 100),
          String((t.exitBar as number) - t.entryBar), b(t.tp1Hit), b(t.tp2Hit), b(t.tp3Hit), n(values[t.entryBar], 0),
        ].join(", ") +
        `);`,
    );
  return { latest, trades };
}

/** IHSG > SMA200 lookup by date (for SATS + filter). */
interface MarketInfo {
  date: string;
  close: number;
  ma200: number;
  above: boolean;
}
let marketInfo: MarketInfo | null = null;
const ihsgClose = new Map<string, number>();

/** Per-date market breadth counters, summed over all stocks. */
interface Breadth {
  n: number; above200: number; above50: number; up: number; down: number; hi52: number; lo52: number;
  idx30: number; idx30Up: number; k100: number; k100Up: number;
}
const breadth = new Map<string, Breadth>();
const emptyBreadth = (): Breadth => ({ n: 0, above200: 0, above50: 0, up: 0, down: 0, hi52: 0, lo52: 0, idx30: 0, idx30Up: 0, k100: 0, k100Up: 0 });

/** Index members, for the "% above SMA60" breadth (all members, no liquidity filter). */
interface IndexSets { idx30: Set<string>; k100: Set<string> }

function addBreadth(code: string, bars: SatsInputBar[], values: Array<number | null>, sets: IndexSets): void {
  const close = bars.map((x) => x.close);
  const ma200 = sma(close, 200);
  const ma50 = sma(close, 50);
  // KOMPAS100 / IDX30 breadth: % of members closing above SMA60. Test Okt 2023–Okt 2026: with KOMPAS100 >= 50% liquid
  // stocks averaged +2,4% over 20 days vs −1,4% below it; breakout + RS signals +12,8% vs +3,0% (IDX30: similar, a bit weaker).
  const in30 = sets.idx30.has(code), in100 = sets.k100.has(code);
  if (in30 || in100) {
    const ma60 = sma(close, 60);
    for (let k = Math.max(1, bars.length - BREADTH_DAYS); k < bars.length; k += 1) {
      if (Number.isNaN(ma60[k])) continue;
      const d = wib(bars[k].time);
      const b0 = breadth.get(d) ?? emptyBreadth();
      const up = close[k] > ma60[k] ? 1 : 0;
      if (in30) { b0.idx30 += 1; b0.idx30Up += up; }
      if (in100) { b0.k100 += 1; b0.k100Up += up; }
      breadth.set(d, b0);
    }
  }
  for (let k = Math.max(1, bars.length - BREADTH_DAYS); k < bars.length; k += 1) {
    if ((values[k] ?? 0) < BREADTH_MIN_VALUE || Number.isNaN(ma200[k])) continue;
    const d = wib(bars[k].time);
    const b0 = breadth.get(d) ?? emptyBreadth();
    const c = close[k];
    const win = close.slice(Math.max(0, k - 251), k); // previous ≈ 52 weeks
    b0.n += 1;
    if (c > ma200[k]) b0.above200 += 1;
    if (c > ma50[k]) b0.above50 += 1;
    if (c > close[k - 1]) b0.up += 1;
    else if (c < close[k - 1]) b0.down += 1;
    if (win.length >= 200 && c > Math.max(...win)) b0.hi52 += 1;
    if (win.length >= 200 && c < Math.min(...win)) b0.lo52 += 1;
    breadth.set(d, b0);
  }
}

async function loadIhsgFilter(): Promise<((time: number) => boolean | null) | null> {
  try {
    const bars = await fetchWithRetry(IHSG_SYMBOL);
    const ma = sma(bars.map((x) => x.close), 200);
    const byDate = new Map<string, boolean>();
    bars.forEach((x, k) => {
      ihsgClose.set(wib(x.time), x.close);
      if (!Number.isNaN(ma[k])) byDate.set(wib(x.time), x.close > ma[k]);
    });
    const dates = [...byDate.keys()].sort();
    const li = bars.length - 1;
    if (li >= 0 && !Number.isNaN(ma[li])) {
      marketInfo = { date: wib(bars[li].time), close: bars[li].close, ma200: ma[li], above: bars[li].close > ma[li] };
    }
    console.log(`IHSG: ${bars.length} bars, last ${dates.at(-1)} above MA200 = ${byDate.get(dates.at(-1) ?? "")}`);
    return (time: number) => {
      const d = wib(time);
      if (byDate.has(d)) return byDate.get(d) as boolean;
      // stock traded on a day IHSG has no bar: use the last known day before it
      let lo = 0;
      let hi = dates.length - 1;
      let found: string | null = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (dates[mid] <= d) {
          found = dates[mid];
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return found ? (byDate.get(found) as boolean) : null;
    };
  } catch (error) {
    console.error(`IHSG (${IHSG_SYMBOL}) gagal diambil, SATS + filter dilewati:`, error instanceof Error ? error.message : error);
    return null;
  }
}

const BREADTH_DDL =
  "CREATE TABLE IF NOT EXISTS breadth_daily (date TEXT PRIMARY KEY, n INTEGER NOT NULL, above200 INTEGER NOT NULL, " +
  "above50 INTEGER NOT NULL, up INTEGER NOT NULL, down INTEGER NOT NULL, hi52 INTEGER NOT NULL, lo52 INTEGER NOT NULL, ihsg REAL, " +
  "idx30_n INTEGER, idx30_above60 INTEGER, k100_n INTEGER, k100_above60 INTEGER);";

// ---------- index membership (worker/src/pipeline/indices/<INDEX>.txt)
const INDEX_DIR = typeof __dirname !== "undefined" ? join(__dirname, "indices") : join(process.cwd(), "src/pipeline/indices");
function parseIndexCodes(text: string): string[] {
  const body = text.split(/\r?\n/).filter((l) => !l.trim().startsWith("#")).join(" ");
  return [...new Set(body.toUpperCase().split(/[^A-Z0-9]+/).filter((c) => /^[A-Z][A-Z0-9]{2,5}$/.test(c)))];
}
/** Members of one index file, e.g. IDX30 (empty when the file is missing). */
function indexCodes(name: string): Set<string> {
  const f = join(INDEX_DIR, `${name}.txt`);
  return new Set(existsSync(f) ? parseIndexCodes(readFileSync(f, "utf8")) : []);
}

function buildIndexSql(universeCodes: Set<string>, stamp: string): string[] {
  const dir = INDEX_DIR;
  if (!existsSync(dir)) return [];
  const sql: string[] = [];
  const seen: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt"))) {
    const indexCode = file.replace(/\.txt$/i, "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const text = readFileSync(join(dir, file), "utf8");
    const meta = (key: string) => text.match(new RegExp(`^#\\s*${key}\\s*:\\s*(.+)$`, "mi"))?.[1].trim() ?? null;
    const parsed = parseIndexCodes(text);
    const unknown = parsed.filter((c) => !universeCodes.has(c));
    const codes = parsed.filter((c) => universeCodes.has(c));
    if (codes.length === 0) {
      console.log(`Index ${indexCode}: file kosong, dilewati`);
      continue;
    }
    console.log(`Index ${indexCode}: ${codes.length} saham${unknown.length ? ` (tidak ada di universe: ${unknown.join(", ")})` : ""}`);
    seen.push(indexCode);
    sql.push(`DELETE FROM index_members WHERE index_code = ${q(indexCode)};`);
    for (const c of codes) sql.push(`INSERT INTO index_members (index_code, code) VALUES (${q(indexCode)}, ${q(c)});`);
    sql.push(
      `INSERT OR REPLACE INTO indices (index_code, name, effective, member_count, updated_at) VALUES (` +
        [q(indexCode), q(meta("name") ?? indexCode), q(meta("effective")), String(codes.length), q(stamp)].join(", ") + `);`,
    );
  }
  // index files that were deleted -> remove from D1
  const keep = seen.length ? seen.map((c) => q(c)).join(", ") : "''";
  sql.push(`DELETE FROM index_members WHERE index_code NOT IN (${keep});`);
  sql.push(`DELETE FROM indices WHERE index_code NOT IN (${keep});`);
  return sql;
}

// ---------- main
async function main() {
  const started = new Date().toISOString();
  const runId = started.replace(/[-:.TZ]/g, "").slice(0, 14);
  let list = universe as Array<{ code: string; name: string }>;
  if (onlyCodes) list = list.filter((s) => onlyCodes.includes(s.code));
  if (limit > 0) list = list.slice(0, limit);
  const strategies = (onlyStrategies && onlyStrategies.length ? onlyStrategies : STRATEGIES.map((s) => s.id)) as StrategyId[];

  const indexSets: IndexSets = { idx30: indexCodes("IDX30"), k100: indexCodes("KOMPAS100") };
  const indexSql = buildIndexSql(new Set((universe as Array<{ code: string }>).map((s) => s.code)), started);
  if (INDICES_ONLY) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${outDir}/eod.sql`, indexSql.join("\n") + "\n");
    console.log(`Indices only: ${indexSql.length} statements -> ${outDir}/eod.sql`);
    return;
  }
  console.log(
    `EOD run ${runId} (${nowWib().toISOString().slice(0, 16).replace("T", " ")} WIB): ${list.length} codes, mode ${FULL ? "FULL" : "DAILY"}, strategies ${strategies.join(", ")}`,
  );
  const ihsg = await loadIhsgFilter();

  const results: StockOutput[] = [];
  const failed: Array<{ code: string; error: string }> = [];
  const dataIssues: string[] = []; // what cleanBars fixed or flagged, "CODE 2026-01-02: ..."
  let cursor = 0;
  const t0 = Date.now();

  async function worker() {
    while (cursor < list.length) {
      const { code } = list[cursor++];
      try {
        const cleaned = cleanBars(dropIncompleteBar(await fetchWithRetry(`${code}.JK`)));
        const bars = cleaned.bars;
        for (const x of cleaned.issues) dataIssues.push(`${code} ${x}`);
        // New listings are fine: strategies simply have no signal before their warm-up.
        if (bars.length < 2) throw new Error(`only ${bars.length} trading bars`);
        const all = runAllStrategies(bars, ihsg);
        const values = bars.map((_, k) => value20(bars, k));
        const mask = ihsg ? satsFilterMask(bars, ihsg) : null;
        addBreadth(code, bars, values, indexSets);
        const out: StockOutput = { code, sql: [], latestRows: 0, tradeRows: 0, asOf: wib(bars[bars.length - 1].time) };
        // Screener metrics (one row per stock)
        const tech = computeTech(bars, values[bars.length - 1], wib);
        out.sql.push(
          `INSERT OR REPLACE INTO tech_latest (code, as_of_date, ${TECH_COLUMNS.join(", ")}, updated_at) VALUES (` +
            [
              q(code), q(out.asOf),
              ...TECH_COLUMNS.map((k) => (TECH_TEXT_COLUMNS.has(k) ? q(tech[k] as string | null) : n(tech[k] as number | null))),
              q(started),
            ].join(", ") +
            `);`,
        );
        for (const id of strategies) {
          const r = all[id];
          if (!r) continue;
          const s = strategySql(id, code, bars, r, values, started, mask);
          out.sql.push(s.latest, ...s.trades);
          out.latestRows += 1;
          out.tradeRows += s.trades.length;
        }
        results.push(out);
      } catch (error) {
        failed.push({ code, error: error instanceof Error ? error.message : String(error) });
      }
      const done = results.length + failed.length;
      if (done % 50 === 0 || done === list.length) {
        console.log(`  ${done}/${list.length}  ok ${results.length}  fail ${failed.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  results.sort((a, b2) => a.code.localeCompare(b2.code));
  const asOf = results.map((r) => r.asOf).sort().at(-1) ?? null;

  // Freshness check: after the session (>= 16:30 WIB on a weekday) most stocks should have today's bar.
  const nowW = nowWib();
  const todayW = nowW.toISOString().slice(0, 10);
  const minutesW = nowW.getUTCHours() * 60 + nowW.getUTCMinutes();
  const weekday = nowW.getUTCDay() >= 1 && nowW.getUTCDay() <= 5;
  const withToday = results.filter((r) => r.asOf === todayW).length;
  let freshness = `as_of ${asOf} · ${withToday}/${results.length} saham punya bar ${todayW} · dijalankan ${nowW.toISOString().slice(0, 16).replace("T", " ")} WIB`;
  if (weekday && minutesW >= 16 * 60 + 30 && withToday < results.length * 0.5) {
    freshness += " · PERINGATAN: data hari ini belum tersedia di Yahoo (libur bursa, atau Yahoo terlambat — jadwal cadangan 19:43 akan mencoba lagi)";
    console.log(`::warning::${freshness}`);
  }
  console.log(freshness);
  dataIssues.sort();
  console.log(`Pembersihan data Yahoo: ${dataIssues.length} temuan`);
  for (const x of dataIssues.slice(0, 200)) console.log(`  ${x}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### EOD SATS\n\n${freshness}\n\nok ${results.length}, gagal ${failed.length}\n\n` +
        `#### Pembersihan data Yahoo (${dataIssues.length})\n\n${dataIssues.slice(0, 100).map((x) => `- ${x}`).join("\n") || "- tidak ada"}\n`,
    );
  }

  const sql: string[] = [];
  // Universe upsert: writes only when a name changed.
  for (const s of list) {
    sql.push(
      `INSERT INTO stocks (code, name, active, updated_at) VALUES (${q(s.code)}, ${q(s.name)}, 1, ${q(started)}) ` +
        `ON CONFLICT(code) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at WHERE stocks.name <> excluded.name;`,
    );
  }
  // tech_latest is rebuilt from scratch every full-universe run, so a schema change (new screener columns)
  // can never break the import again. Subset runs (--codes / --limit) only create it if missing.
  const techDdl =
    `CREATE TABLE IF NOT EXISTS tech_latest (code TEXT PRIMARY KEY, as_of_date TEXT NOT NULL, ` +
    `${TECH_COLUMNS.map((c) => `${c} ${TECH_TEXT_COLUMNS.has(c) ? "TEXT" : "REAL"}`).join(", ")}, updated_at TEXT NOT NULL);`;
  if (!onlyCodes && !(limit > 0)) sql.push("DROP TABLE IF EXISTS tech_latest;");
  sql.push(techDdl);
  if (FULL) {
    // full backfill replaces the history of the processed strategies
    for (const id of strategies) sql.push(`DELETE FROM sats_trades WHERE strategy = ${q(id)};`);
  }
  for (const r of results) sql.push(...r.sql);
  sql.push(...indexSql);
  // Market breadth history: only from full-universe runs (a subset would give wrong percentages).
  if (!onlyCodes && !(limit > 0)) {
    // DROP + CREATE: the table is rebuilt in full anyway, and this adds new columns to an older table
    sql.push("DROP TABLE IF EXISTS breadth_daily;", BREADTH_DDL);
    for (const [d, x] of [...breadth].sort((a, b2) => a[0].localeCompare(b2[0]))) {
      if (x.n < 20) continue; // holiday / thin day
      sql.push(
        `INSERT INTO breadth_daily (date, n, above200, above50, up, down, hi52, lo52, ihsg, idx30_n, idx30_above60, k100_n, k100_above60) VALUES (` +
          [q(d), x.n, x.above200, x.above50, x.up, x.down, x.hi52, x.lo52, n(ihsgClose.get(d) ?? null, 2),
            x.idx30 || "NULL", x.idx30 ? x.idx30Up : "NULL", x.k100 || "NULL", x.k100 ? x.k100Up : "NULL"].join(", ") + `);`,
      );
    }
  }
  if (marketInfo) {
    sql.push(
      `INSERT OR REPLACE INTO market_status (as_of_date, ihsg_close, ihsg_ma200, above, updated_at) VALUES (` +
        [q(marketInfo.date), n(marketInfo.close), n(marketInfo.ma200), b(marketInfo.above), q(started)].join(", ") +
        `);`,
    );
  }
  sql.push(
    `INSERT OR REPLACE INTO pipeline_runs (run_id, started_at, finished_at, as_of_date, ok_count, fail_count, failed_codes) VALUES (` +
      [q(runId), q(started), q(new Date().toISOString()), q(asOf), String(results.length), String(failed.length), q(JSON.stringify(failed.map((f) => `${f.code}: ${f.error}`)))].join(", ") +
      `);`,
  );

  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/eod.sql`, sql.join("\n") + "\n");
  const latestRows = results.reduce((s2, r) => s2 + r.latestRows, 0);
  const tradeRows = results.reduce((s2, r) => s2 + r.tradeRows, 0);
  writeFileSync(
    `${outDir}/eod-summary.json`,
    JSON.stringify({ runId, asOf, ok: results.length, failed, strategies, latestRows, tradeRows, dataIssues }, null, 2),
  );

  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s. as_of ${asOf}. ok ${results.length}, failed ${failed.length}.`);
  console.log(`SQL: ${sql.length} statements (${latestRows} latest, ${tradeRows} trades) -> ${outDir}/eod.sql`);
  if (sql.length > 90_000) {
    console.warn("PERINGATAN: > 90.000 baris tulis, mendekati limit D1 gratis (100.000/hari). Pecah backfill dengan --strategies.");
  }
  if (failed.length) console.log("Failed:", failed.slice(0, 20).map((f) => `${f.code} (${f.error})`).join("; "));

  // Fail the job only if something is systematically wrong (e.g. Yahoo blocked).
  if (results.length < list.length * 0.9) {
    console.error("Too many failures (>10%). Not safe to publish.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
