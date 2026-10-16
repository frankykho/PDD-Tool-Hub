/**
 * Laboratorium uji: did the screener presets and candle / chart patterns actually work on IDX?
 *
 * For the last 3 years, every time a test turns TRUE on a liquid stock (fresh trigger: false yesterday, true today),
 * buy at the NEXT day's open and measure the close 5 / 10 / 20 trading days later, minus 0.4% round-trip costs.
 * Each return is also compared with the average return of ALL liquid stocks over the same days ("excess"), so a
 * bull market does not make every test look good.
 *
 *   npx tsx src/pipeline/run-lab.ts                 # all stocks (~10-15 min)
 *   npx tsx src/pipeline/run-lab.ts --limit 50      # quick local try
 *
 * Output: out/lab.sql (table lab_results, rebuilt) + out/lab.json
 * Not testable without look-ahead bias: fundamental presets (we only have today's fundamentals) and SATS
 * (already measured properly in Track Record).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { cleanBars } from "../data/clean";
import { fetchYahooDaily } from "../data/yahoo";
import type { SatsInputBar } from "../sats/types";
import { computeTech } from "../screener/metrics";
import { runSats } from "../sats/engine";
import { fromSats } from "../strategies/sats";
import { sma } from "../strategies/series";
import { candlesAt } from "../screener/patterns";
import universe from "./universe.json";
// Same definitions the website uses (type-only imports there, so they run in Node as-is).
import { PRESETS, presetById } from "../../../frontend/src/screener/presets";
import { CANDLES, CHARTS, parseCharts } from "../../../frontend/src/screener/patternMeta";
import type { ScreenerRow } from "../../../frontend/src/api";

const TEST_YEARS = 3;
const FETCH_YEARS = TEST_YEARS + 2; // + warm-up for MA200 / 52-week metrics
const WINDOW = 400; // bars handed to computeTech per day
const HORIZONS = [5, 10, 20, 60] as const;
// 5th result per signal: max 60 days with exits — stop loss −8% (intraday low; gap below = exit at open)
// or a close below MA50 (from day 2). Closer to how the strategy would actually be traded.
const STOP_PCT = 8;
const SLOTS = HORIZONS.length + 1;
const SUFFIX = ["5", "10", "20", "60", "S"]; // column suffix per slot
const COST = 0.4; // % round trip (buy + sell fees)
const MIN_VALUE = 1e9; // liquid: value_20d >= Rp 1 M/day
const MIN_PRICE = 50;
const MIN_N = 100; // signals needed before a verdict
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const limit = Number(args[args.indexOf("--limit") + 1] ?? 0) || 0;
const outDir = "out";

const wib = (t: number) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = (v: string | null) => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null, d = 3) => (v == null || !Number.isFinite(v) ? "NULL" : String(Number(v.toFixed(d))));

async function fetchBars(code: string): Promise<SatsInputBar[]> {
  const now = Math.floor(Date.now() / 1000);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchYahooDaily(`${code}.JK`, now - FETCH_YEARS * 365 * 86400, now);
    } catch (error) {
      if (attempt >= 2) throw error;
      await sleep(1500 * 2 ** attempt);
    }
  }
}

// ---------- tests
interface LabTest {
  id: string;
  kind: "preset" | "candle" | "chart" | "combo" | "sats";
  name: string;
  expect: "up" | "down"; // bearish patterns "work" when the stock underperforms afterwards
  hit: (row: ScreenerRow, bars: SatsInputBar[], k: number, ctx: StockCtx) => boolean;
}

/** Per-stock data some tests need. */
interface StockCtx {
  satsBuy: Set<number>; // bar indices with a SATS v1.9 BUY signal
}

const TESTS: LabTest[] = [
  ...PRESETS.filter((p) => p.group !== "Fundamental" && p.group !== "SATS").map(
    (p): LabTest => ({ id: `preset:${p.id}`, kind: "preset", name: p.name, expect: p.id === "distribution" ? "down" : "up", hit: (r) => p.test(r) }),
  ),
  ...CANDLES.filter((c) => c.bias !== "neutral").map(
    (c): LabTest => ({
      id: `candle:${c.id}`, kind: "candle", name: c.name, expect: c.bias === "bear" ? "down" : "up",
      hit: (_r, bars, k) => (candlesAt(bars, k) as string[]).includes(c.id),
    }),
  ),
  ...CHARTS.map(
    (c): LabTest => ({
      id: `chart:${c.id}`, kind: "chart", name: `${c.name.replace(/ — waspada$/, "")} · breakout`, expect: c.bias === "bear" ? "down" : "up",
      hit: (r) => parseCharts(r.chart_patterns).some((x) => x.id === c.id && x.status === "breakout"),
    }),
  ),
];

// Combinations suggested by the first lab run: strong trend + quiet entry, breakout without a volume blow-off.
const presetTest = (id: string) => {
  const p = presetById(id);
  if (!p) throw new Error(`preset ${id} hilang`);
  return p.test;
};
const near52 = presetTest("high52");
const ascBreakout = (r: ScreenerRow) => parseCharts(r.chart_patterns).some((x) => x.id === "asc_triangle" && x.status === "breakout");
// (high52 + RS ≥ 80, high52 + calm volume and calm breakout are presets now, group "✓ Teruji BEI")
const top = presetTest("high52_rs80");
const sats = (k: number, ctx: StockCtx) => ctx.satsBuy.has(k);
TESTS.push(
  { id: "combo:high52_nr7", kind: "combo", name: "Dekat high 52M + NR7/Inside day", expect: "up", hit: (r) => near52(r) && (r.nr7 === 1 || r.inside_day === 1) },
  { id: "combo:asc_ma200", kind: "combo", name: "Ascending triangle breakout + > MA200", expect: "up", hit: (r) => ascBreakout(r) && (r.dist_ma200 ?? -1) > 0 },
  // SATS v1.9 BUY measured with the same lab rule (next open, fixed holding), alone and with the winning filters
  { id: "sats:all", kind: "sats", name: "SATS BUY (semua)", expect: "up", hit: (_r, _b, k, ctx) => sats(k, ctx) },
  { id: "sats:ma200", kind: "sats", name: "SATS BUY + harga > MA200", expect: "up", hit: (r, _b, k, ctx) => sats(k, ctx) && (r.dist_ma200 ?? -1) > 0 },
  { id: "sats:rs80", kind: "sats", name: "SATS BUY + RS ≥ 80", expect: "up", hit: (r, _b, k, ctx) => sats(k, ctx) && (r.rs_rank ?? 0) >= 80 },
  { id: "sats:high52", kind: "sats", name: "SATS BUY + dekat high 52M", expect: "up", hit: (r, _b, k, ctx) => sats(k, ctx) && near52(r) },
  { id: "sats:top", kind: "sats", name: "SATS BUY + dekat high 52M + RS ≥ 80", expect: "up", hit: (r, _b, k, ctx) => sats(k, ctx) && top(r) },
);

/** Return (%) of the stop-loss variant, or null when the 60-day window is not complete yet and no exit happened. */
function stopRet(bars: SatsInputBar[], ma50: number[], k: number): number | null {
  const entry = bars[k + 1].open;
  const stop = entry * (1 - STOP_PCT / 100);
  const last = k + 60;
  for (let t = k + 1; t <= Math.min(last, bars.length - 1); t += 1) {
    let exit: number | null = null;
    if (bars[t].low <= stop) exit = Math.min(bars[t].open, stop);
    else if (t > k + 1 && !Number.isNaN(ma50[t]) && bars[t].close < ma50[t]) exit = bars[t].close;
    else if (t === last) exit = bars[t].close;
    if (exit != null) return (exit / entry - 1) * 100 - COST;
  }
  return null;
}

// ---------- main
interface Signal {
  date: string;
  ret: Array<number | null>; // per horizon, % after costs
}

async function main() {
  const t0 = Date.now();
  let list = universe as Array<{ code: string }>;
  if (limit > 0) list = list.slice(0, limit);
  const cutoff = wib(Math.floor(Date.now() / 1000) - TEST_YEARS * 365 * 86400);

  // 1. fetch + clean
  const all = new Map<string, SatsInputBar[]>();
  let cursor = 0;
  let failed = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < list.length) {
        const { code } = list[cursor++];
        try {
          const bars = cleanBars(await fetchBars(code)).bars;
          if (bars.length > 260) all.set(code, bars);
        } catch {
          failed += 1;
        }
      }
    }),
  );
  console.log(`Data: ${all.size} saham (gagal ${failed}) · ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  // 2. per-stock series + cross-sectional RS rank (6-month return percentile among liquid stocks, as on the website)
  const value20 = new Map<string, number[]>();
  const rsPool = new Map<string, number[]>(); // date -> sorted chg126 of liquid stocks
  for (const [code, bars] of all) {
    const v: number[] = [];
    let sum = 0;
    bars.forEach((b, k) => {
      sum += b.close * (b.volume ?? 0);
      if (k >= 20) sum -= bars[k - 20].close * (bars[k - 20].volume ?? 0);
      v.push(sum / Math.min(k + 1, 20));
      const d = wib(b.time);
      if (d >= cutoff && k >= 126 && v[k] >= MIN_VALUE) {
        const arr = rsPool.get(d) ?? [];
        arr.push((b.close / bars[k - 126].close - 1) * 100);
        rsPool.set(d, arr);
      }
    });
    value20.set(code, v);
  }
  for (const arr of rsPool.values()) arr.sort((a, b) => a - b);
  const rsRank = (d: string, chg: number | null) => {
    const arr = rsPool.get(d);
    if (!arr || arr.length < 2 || chg == null) return null;
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < chg) lo = mid + 1;
      else hi = mid;
    }
    return Math.round((lo / (arr.length - 1)) * 100);
  };

  // 3. walk every liquid stock-day
  const signals = new Map<string, Signal[]>(TESTS.map((t) => [t.id, []]));
  const base = new Map<string, { sum: number[]; cnt: number[]; pos: number[] }>(); // date -> all liquid stocks' forward returns
  let done = 0;
  for (const [code, bars] of all) {
    const v = value20.get(code) as number[];
    const prev = new Map<string, boolean>();
    const ma50 = sma(bars.map((b) => b.close), 50);
    const ctx: StockCtx = {
      satsBuy: new Set(fromSats(bars, runSats(bars)).signals.filter((x) => x.side === "BUY").map((x) => x.barIndex)),
    };
    for (let k = 260; k < bars.length - 1; k += 1) {
      const d = wib(bars[k].time);
      if (d < cutoff) continue;
      if (v[k] < MIN_VALUE || bars[k].close < MIN_PRICE) {
        prev.clear();
        continue;
      }
      const entry = bars[k + 1].open;
      const ret = [...HORIZONS.map((h) => (k + h < bars.length ? (bars[k + h].close / entry - 1) * 100 - COST : null)), stopRet(bars, ma50, k)];
      const b0 = base.get(d) ?? { sum: Array(SLOTS).fill(0), cnt: Array(SLOTS).fill(0), pos: Array(SLOTS).fill(0) };
      ret.forEach((r, j) => {
        if (r != null) {
          b0.sum[j] += r;
          b0.cnt[j] += 1;
          if (r > 0) b0.pos[j] += 1;
        }
      });
      base.set(d, b0);

      const tech = computeTech(bars.slice(Math.max(0, k - WINDOW + 1), k + 1), v[k], wib);
      const row = { ...tech, code, value_20d: v[k], rs_rank: rsRank(d, tech.chg126) } as unknown as ScreenerRow;
      for (const t of TESTS) {
        const now = t.hit(row, bars, k, ctx);
        if (now && !prev.get(t.id)) (signals.get(t.id) as Signal[]).push({ date: d, ret });
        prev.set(t.id, now);
      }
    }
    done += 1;
    if (done % 100 === 0) console.log(`  ${done}/${all.size} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }

  // 4. statistics
  const baseAvg = (d: string, j: number) => {
    const b0 = base.get(d);
    return b0 && b0.cnt[j] ? b0.sum[j] / b0.cnt[j] : null;
  };
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const yearStart = (y: number) => wib(Math.floor(Date.now() / 1000) - (TEST_YEARS - y) * 365 * 86400);

  // baseline: every liquid stock-day
  const allDays = [...base.keys()];
  const baseline = Array.from({ length: SLOTS }, (_, j) => {
    let s = 0;
    let c = 0;
    let p = 0;
    for (const d of allDays) {
      const b0 = base.get(d) as { sum: number[]; cnt: number[]; pos: number[] };
      s += b0.sum[j];
      c += b0.cnt[j];
      p += b0.pos[j];
    }
    return { avg: c ? s / c : null, n: c, win: c ? (p / c) * 100 : null };
  });

  const rows = TESTS.map((t) => {
    const sig = signals.get(t.id) as Signal[];
    const per = Array.from({ length: SLOTS }, (_, j) => {
      const rs = sig.filter((s) => s.ret[j] != null);
      const r = rs.map((s) => s.ret[j] as number);
      const ex = rs.map((s) => (s.ret[j] as number) - (baseAvg(s.date, j) ?? 0));
      // robustness: excess without the 10 best signals (are a few "rockets" carrying the average?)
      const order = r.map((_, i) => i).sort((a, b) => r[b] - r[a]);
      const trim = r.length > 30 ? mean(order.slice(10).map((i) => ex[i])) : null;
      return { n: r.length, win: r.length ? (r.filter((x) => x > 0).length / r.length) * 100 : null, avg: mean(r), med: median(r), ex: mean(ex), trim };
    });
    // consistency: excess 10d per year (oldest -> newest)
    const years = [0, 1, 2].map((y) => {
      const ex = sig
        .filter((s) => s.ret[1] != null && s.date >= yearStart(y) && s.date < yearStart(y + 1))
        .map((s) => (s.ret[1] as number) - (baseAvg(s.date, 1) ?? 0));
      return ex.length >= 20 ? mean(ex) : null;
    });
    const ex10 = per[1].ex;
    const sign = t.expect === "up" ? 1 : -1;
    const goodYears = years.filter((y) => y != null && y * sign > 0).length;
    const verdict =
      per[1].n < MIN_N || ex10 == null
        ? "data_kurang"
        : ex10 * sign >= 0.5 && goodYears >= 2
          ? "teruji"
          : ex10 * sign <= -0.5
            ? "berlawanan"
            : "netral";
    return { ...t, per, years, verdict };
  });

  // 5. SQL
  const stamp = new Date().toISOString();
  const sql = [
    "DROP TABLE IF EXISTS lab_results;",
    "CREATE TABLE lab_results (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, expect TEXT NOT NULL, verdict TEXT NOT NULL, " +
      SUFFIX.map((x) => `n${x} INTEGER, win${x} REAL, avg${x} REAL, med${x} REAL, ex${x} REAL, tr${x} REAL`).join(", ") +
      ", y1 REAL, y2 REAL, y3 REAL, period_from TEXT, updated_at TEXT NOT NULL);",
  ];
  const rowSql = (id: string, kind: string, name: string, expect: string, verdict: string, per: typeof rows[number]["per"], years: Array<number | null>) =>
    `INSERT INTO lab_results VALUES (${[
      q(id), q(kind), q(name), q(expect), q(verdict),
      ...per.flatMap((x) => [x.n, n(x.win), n(x.avg), n(x.med), n(x.ex), n(x.trim)]),
      n(years[0]), n(years[1]), n(years[2]), q(cutoff), q(stamp),
    ].join(", ")});`;
  for (const r of rows) sql.push(rowSql(r.id, r.kind, r.name, r.expect, r.verdict, r.per, r.years));
  // baseline as a pseudo-test: what "buy any liquid stock" earned
  sql.push(
    rowSql("baseline", "baseline", "Semua saham likuid (pembanding)", "up", "netral",
      baseline.map((b) => ({ n: b.n, win: b.win, avg: b.avg, med: null, ex: 0, trim: null })), [null, null, null]),
  );

  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/lab.sql`, sql.join("\n") + "\n");
  writeFileSync(`${outDir}/lab.json`, JSON.stringify({ cutoff, baseline, rows: rows.map(({ hit, ...r }) => r) }, null, 2));
  console.log(`\nSelesai ${((Date.now() - t0) / 1000).toFixed(0)}s · periode ${cutoff} s/d hari ini · baseline 10H ${baseline[1].avg?.toFixed(2)}%`);
  for (const r of [...rows].sort((a, b) => (b.per[1].ex ?? -99) - (a.per[1].ex ?? -99))) {
    console.log(
      `  ${r.verdict.padEnd(11)} ${r.name.padEnd(36)} n=${String(r.per[1].n).padStart(5)} win10=${r.per[1].win?.toFixed(0) ?? "—"}% ` +
        `avg10=${r.per[1].avg?.toFixed(2) ?? "—"}% excess10=${r.per[1].ex?.toFixed(2) ?? "—"}%`,
    );
  }
  if (all.size < list.length * 0.9) {
    console.error("Terlalu banyak saham gagal diambil (>10%). Hasil tidak ditulis.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
