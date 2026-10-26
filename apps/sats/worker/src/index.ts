/**
 * Screener API (Cloudflare Worker, read-only). Data is written by the EOD pipeline.
 * Every data endpoint takes ?s=<strategy> (SATS_H | SATS_F | SATS, default SATS_H).
 *
 *   GET /api/strategies                        available strategies
 *   GET /api/meta                              last pipeline run
 *   GET /api/indices                           index filters (KOMPAS100, LQ45, ...)
 *   GET /api/summary?s=&index=                 KPI cards
 *   GET /api/signals?s=&side=&maxAge=&limit=&index=   latest signal per stock
 *   GET /api/level-hits?s=&index=              TP/SL touched on the latest trading day (BUY positions; old name /api/events)
 *   GET /api/search?q=&s=                      code / name lookup
 *   GET /api/stocks/:code?s=                   latest state, closed trades (3y), last signal of every strategy
 *   GET /api/track?s=&period=&mode=whole|scaled&minScore=&minValue=&minPrice=&index=&code=   track record
 *       mode=scaled: 1/3 of the position sold at TP1, TP2, TP3 when reached, the rest at the actual exit
 *   GET /api/track/compare?period=&minValue=&minPrice=&index=              all strategies side by side
 *   GET /api/lab                               backtest of presets & patterns (weekly, run-lab.ts)
 *   GET /api/breadth                           market breadth history (liquid stocks, ≈ 1 year)
 *   GET /api/owners/*                          shareholders ≥ 1% (monthly, src/owners.ts)
 *   GET /api/flow/*                            Frequency Analyzer & HAKA/HAKI (daily, src/flowApi.ts)
 *   GET /api/screener                          technical metrics of every stock + SATS state + index membership
 *   GET /api/history/:code                     ±6 years of daily Yahoo data, passed through (Strategy Lab parses it in the browser)
 *   GET/POST /api/analyst/:code                AI analysis of one stock (src/analyst.ts)
 *   GET/POST /api/watchlist                    the logged-in user's watchlist (needs login)
 */
import { STRATEGIES, isStrategyId, type StrategyId } from "./strategies/types";
import { FUND_DDL } from "./fundamentals/schema";
import { accessEnabled, authEnabled, ensureAuthSchema, googleEnabled, handleGoogleAuth, handleHubAuth, handlePasswordAuth, hubEnabled, hubUrl, identify, loadMe, passwordEnabled, type AuthEnv, type Me } from "./auth";
import { profile } from "../../../../shared/profile.js";
import { shariaCached } from "../../../../shared/sharia.js";
import { withCron } from "../../../../shared/cron.js";
import { themeHead } from "../../../../shared/theme.js";
import { SATS_THEME_CSS } from "./theme";
import { analystRoute, type AnalystEnv } from "./analyst";
import { ownersRoute } from "./owners";
import { flowRoute } from "./flowApi";

interface Env extends AuthEnv, AnalystEnv {
  screener_db: D1Database;
  /** For the cron trigger: fine-grained GitHub token (Actions: read & write on the repo). `wrangler secret put GITHUB_TOKEN` */
  GITHUB_TOKEN?: string;
  /** "owner/repo", diisi scripts/deploy.mjs dari profil (github.repo) */
  GITHUB_REPO?: string;
  /** profil JSON (diisi scripts/deploy.mjs), dibaca lewat shared/profile.js */
  PROFILE?: string;
  /** tampilan React (../frontend/dist); "/" lewat worker dulu supaya bisa diberi header CSP */
  ASSETS: Fetcher;
}

const STALE_DAYS = 7; // rows older than this vs the latest as_of are hidden (suspended / no trades)
const FEE_PCT = 0.4; // biaya beli + jual (termasuk PPh final 0,1%), perkiraan untuk return bersih

const LATEST_COLUMNS = `
  l.strategy, l.code, s.name, l.as_of_date, l.close, l.prev_close, l.change_pct, l.volume, l.trend,
  l.signal_today, l.last_signal, l.last_signal_date, l.last_signal_bars, l.last_signal_score,
  l.entry, l.sl, l.tp1, l.tp2, l.tp3, l.tp1_hit, l.tp2_hit, l.tp3_hit, l.stop_now,
  l.trade_status, l.trade_exit_date, l.event_today, l.value_20d, l.filter_signal, l.filter_now,
  tl.candles, tl.chart_patterns, tl.dist_high52, tl.dist_ma200, rs.rs_rank,
  fl.profitable AS f_profitable, fl.equity_positive AS f_equity_positive, fl.der AS f_der, fl.stale AS f_stale,
  fl.per AS f_per, fl.roe AS f_roe`;

/** sats_latest + stock name + candle/chart patterns from the screener table */
const LATEST_FROM =
  "sats_latest l JOIN stocks s ON s.code = l.code LEFT JOIN tech_latest tl ON tl.code = l.code LEFT JOIN fund_latest fl ON fl.code = l.code " +
  // RS rank 0–100: 6-month return percentile among liquid stocks, same formula as the Screener
  "LEFT JOIN (SELECT code, CAST(ROUND(PERCENT_RANK() OVER (ORDER BY chg126) * 100) AS INTEGER) AS rs_rank " +
  "FROM tech_latest WHERE value_20d >= 1e9 AND chg126 IS NOT NULL) rs ON rs.code = l.code";

function json(data: unknown, status = 200, maxAge = 300): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // private: only the viewer's browser may cache it (office proxies must not keep old data)
      "cache-control": status === 200 && maxAge > 0 ? `private, max-age=${Math.min(maxAge, 60)}` : "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

function minDate(asOf: string, days: number): string {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const strategyOf = (url: URL): StrategyId => {
  const v = (url.searchParams.get("s") ?? "SATS_H").toUpperCase();
  return isStrategyId(v) ? v : "SATS_H";
};

const indexOf = (url: URL) => (url.searchParams.get("index") ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "");

/** WHERE builder with positional parameters. */
class Where {
  parts: string[] = [];
  params: unknown[] = [];
  add(sql: string, ...params: unknown[]) {
    this.parts.push(sql);
    this.params.push(...params);
    return this;
  }
  index(alias: string, index: string) {
    if (index) this.add(`${alias}.code IN (SELECT code FROM index_members WHERE index_code = ?)`, index);
    return this;
  }
  get sql() {
    return this.parts.length ? `WHERE ${this.parts.join(" AND ")}` : "";
  }
}

/** Track-record filters shared by /api/track and /api/track/compare. */
function tradeWhere(url: URL, asOf: string, strategy: StrategyId | null) {
  const period = url.searchParams.get("period") ?? "all";
  const minScore = Math.max(0, Math.min(102, Number(url.searchParams.get("minScore") ?? 0)));
  const minValueB = Math.max(0, Number(url.searchParams.get("minValue") ?? 0));
  const minPrice = Math.max(0, Number(url.searchParams.get("minPrice") ?? 0));
  const code = (url.searchParams.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const threeY = minDate(asOf, 1096);
  const oneY = minDate(asOf, 365);
  const w = new Where();
  if (strategy) w.add("t.strategy = ?", strategy);
  if (period === "recent") w.add("t.entry_date >= ?", oneY);
  else if (period === "before") w.add("t.entry_date >= ? AND t.entry_date < ?", threeY, oneY);
  else w.add("t.entry_date >= ?", threeY);
  if (minScore > 0) w.add("COALESCE(t.score, 0) >= ?", minScore);
  if (minValueB > 0) w.add("COALESCE(t.value_20d, 0) >= ?", minValueB * 1e9);
  if (minPrice > 0) w.add("t.entry >= ?", minPrice);
  if (code) w.add("t.code = ?", code);
  w.index("t", indexOf(url));
  const since = period === "recent" ? oneY : threeY;
  const until = period === "before" ? oneY : asOf;
  return { w, period, minScore, minValueB, minPrice, code, since, until };
}

/** Gross return of a trade under the chosen exit model (percent). */
const GROSS_WHOLE = "t.return_pct";
// Scale-out: 1/3 sold at TP1, 1/3 at TP2, 1/3 at TP3 when reached (same idea as the SATS Pine performance table);
// thirds whose target was not reached are sold at the actual exit price.
const GROSS_SCALED = `((
    (CASE WHEN t.tp1_hit = 1 AND t.tp1 IS NOT NULL THEN t.tp1 ELSE t.exit_price END) +
    (CASE WHEN t.tp2_hit = 1 AND t.tp2 IS NOT NULL THEN t.tp2 ELSE t.exit_price END) +
    (CASE WHEN t.tp3_hit = 1 AND t.tp3 IS NOT NULL THEN t.tp3 ELSE t.exit_price END)
  ) / 3.0 / t.entry - 1) * 100`;

type ExitMode = "whole" | "scaled";
const exitModeOf = (url: URL): ExitMode => (url.searchParams.get("mode") === "scaled" ? "scaled" : "whole");
const netOf = (mode: ExitMode) => `((${mode === "scaled" ? GROSS_SCALED : GROSS_WHOLE}) - ${FEE_PCT})`;
const aggOf = (NET: string) => `COUNT(*) AS n,
  AVG(${NET}) AS avg_net,
  AVG(CASE WHEN ${NET} > 0 THEN 1.0 ELSE 0 END) AS win_rate,
  AVG(CASE WHEN ${NET} > 0 THEN ${NET} END) AS avg_win,
  AVG(CASE WHEN ${NET} <= 0 THEN ${NET} END) AS avg_loss,
  SUM(CASE WHEN ${NET} > 0 THEN ${NET} ELSE 0 END) AS sum_win,
  SUM(CASE WHEN ${NET} < 0 THEN -${NET} ELSE 0 END) AS sum_loss,
  AVG(t.bars_held) AS avg_bars,
  AVG(t.tp1_hit) AS tp1_rate, AVG(t.tp2_hit) AS tp2_rate, AVG(t.tp3_hit) AS tp3_rate,
  AVG(CASE WHEN t.exit_reason = 'SL' THEN 1.0 ELSE 0 END) AS exit_sl,
  AVG(CASE WHEN t.exit_reason = 'TP3' THEN 1.0 ELSE 0 END) AS exit_tp3,
  AVG(CASE WHEN t.exit_reason = 'SELL' THEN 1.0 ELSE 0 END) AS exit_sell,
  AVG(CASE WHEN t.exit_reason = 'TIMEOUT' THEN 1.0 ELSE 0 END) AS exit_timeout`;

type Agg = Record<string, number | null>;

/** Median + average without the best 1% of trades, for any WHERE. */
async function robustStats(db: D1Database, w: Where, n: number, NET: string) {
  if (n === 0) return { median: null, avg_ex_top1: null };
  const mid = await db
    .prepare(`SELECT ${NET} AS net FROM sats_trades t ${w.sql} ORDER BY net LIMIT 2 OFFSET ?`)
    .bind(...w.params, Math.floor((n - 1) / 2))
    .all<{ net: number }>();
  const m = mid.results;
  const median = n % 2 === 1 || m.length < 2 ? (m[0]?.net ?? null) : (m[0].net + m[1].net) / 2;
  const trimmed = await db
    .prepare(`SELECT AVG(net) AS v FROM (SELECT ${NET} AS net FROM sats_trades t ${w.sql} ORDER BY net DESC LIMIT -1 OFFSET ?)`)
    .bind(...w.params, Math.ceil(n * 0.01))
    .first<{ v: number | null }>();
  return { median, avg_ex_top1: trimmed?.v ?? null };
}

const withPf = (a: Agg | null) => ({
  ...(a ?? {}),
  profit_factor: a && a.sum_loss ? (a.sum_win ?? 0) / (a.sum_loss as number) : null,
});

let fundReady = false;

async function handle(url: URL, env: Env): Promise<Response> {
  const db = env.screener_db;
  if (!fundReady) {
    // the weekly fundamentals job rebuilds it; make sure joins never fail before its first run
    await db.prepare(FUND_DDL).run().catch(() => undefined);
    fundReady = true;
  }
  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/api/strategies") return json({ rows: STRATEGIES }, 200, 3600);

  if (path === "/api/meta") {
    const run = await db
      .prepare("SELECT run_id, started_at, finished_at, as_of_date, ok_count, fail_count, failed_codes FROM pipeline_runs ORDER BY started_at DESC LIMIT 1")
      .first<Record<string, unknown>>();
    const universe = await db.prepare("SELECT COUNT(*) AS n FROM stocks").first<{ n: number }>();
    return json({ lastRun: run, universe: universe?.n ?? 0 }, 200, 60);
  }

  // saham syariah (anggota ISSI, JII70, JII) dari scanner TradingView, cache 12 jam (shared/sharia.js)
  if (path === "/api/sharia") {
    try {
      return json(await shariaCached(undefined), 200, 3600);
    } catch (e) {
      return json({ codes: {}, error: (e as Error).message }, 200, 300);
    }
  }

  if (path === "/api/indices") {
    const { results } = await db
      .prepare("SELECT index_code, name, effective, member_count, updated_at FROM indices ORDER BY index_code")
      .all();
    return json({ rows: results });
  }

  if (path === "/api/lab") {
    const { results } = await db
      .prepare("SELECT * FROM lab_results ORDER BY kind, ex10 DESC")
      .all()
      .catch(() => ({ results: [] as unknown[] })); // table appears after the first lab run
    return json({ rows: results });
  }

  const owners = await ownersRoute(db, path, url, json);
  if (owners) return owners;
  const flow = await flowRoute(db, path, url, json);
  if (flow) return flow;

  if (path === "/api/breadth") {
    const { results } = await db
      // SELECT *: idx30_n / idx30_above60 exist only after the first EOD run that rebuilds the table
      .prepare("SELECT * FROM breadth_daily ORDER BY date")
      .all()
      .catch(() => ({ results: [] as unknown[] })); // table appears after the first full EOD run
    return json({ rows: results });
  }

  // Strategy Lab: riwayat harian ±6 tahun dari Yahoo diteruskan apa adanya. Tidak diurai di sini (batas CPU paket gratis);
  // browser yang mengurai & membersihkan dengan parseYahooChart + cleanBars, sama dengan pipeline EOD.
  const histMatch = path.match(/^\/api\/history\/([A-Za-z0-9]{2,6})$/);
  if (histMatch) {
    const code = histMatch[1].toUpperCase();
    if (code !== "IHSG" && !(await db.prepare("SELECT 1 AS x FROM stocks WHERE code = ?").bind(code).first())) return json({ error: "unknown code" }, 404);
    const sym = code === "IHSG" ? "^JKSE" : `${code}.JK`, p2 = Math.floor(Date.now() / 1000), p1 = p2 - Math.round(6.1 * 365 * 86400);
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${p1}&period2=${p2}&interval=1d&events=history&includeAdjustedClose=true`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, signal: AbortSignal.timeout(15000) },
    );
    if (!r.ok) return json({ error: `Yahoo HTTP ${r.status}` }, 502, 0);
    return new Response(r.body, { headers: { "content-type": "application/json", "cache-control": "private, max-age=21600" } });
  }

  const asOfRow = await db.prepare("SELECT MAX(as_of_date) AS d FROM sats_latest").first<{ d: string | null }>();
  const asOf = asOfRow?.d ?? null;
  if (!asOf) return json({ error: "no data yet" }, 503);
  const fresh = minDate(asOf, STALE_DAYS);
  const strategy = strategyOf(url);
  const index = indexOf(url);

  if (path === "/api/summary") {
    const w = new Where().add("l.strategy = ?", strategy).add("l.as_of_date >= ?", fresh).index("l", index);
    const row = await db
      .prepare(
        `SELECT
           SUM(CASE WHEN l.as_of_date = ? AND l.signal_today = 'BUY'  THEN 1 ELSE 0 END) AS buy_today,
           SUM(CASE WHEN l.as_of_date = ? AND l.signal_today = 'SELL' THEN 1 ELSE 0 END) AS sell_today,
           SUM(CASE WHEN l.last_signal = 'BUY' AND l.trade_status = 'ACTIVE' THEN 1 ELSE 0 END) AS buy_active,
           SUM(CASE WHEN l.last_signal = 'BUY' THEN 1 ELSE 0 END) AS in_buy_phase,
           SUM(CASE WHEN l.last_signal = 'SELL' THEN 1 ELSE 0 END) AS in_sell_phase,
           SUM(CASE WHEN l.as_of_date = ? AND l.last_signal = 'BUY' AND l.event_today LIKE '%TP%' THEN 1 ELSE 0 END) AS tp_today,
           SUM(CASE WHEN l.as_of_date = ? AND l.last_signal = 'BUY' AND l.event_today LIKE '%SL%' THEN 1 ELSE 0 END) AS sl_today,
           COUNT(*) AS stocks
         FROM sats_latest l ${w.sql}`,
      )
      .bind(asOf, asOf, asOf, asOf, ...w.params)
      .first<Record<string, number>>();
    const market = await db
      .prepare("SELECT as_of_date, ihsg_close, ihsg_ma200, above FROM market_status ORDER BY as_of_date DESC LIMIT 1")
      .first<Record<string, unknown>>()
      .catch(() => null);
    return json({ asOf, strategy, index: index || null, market, ...row });
  }

  if (path === "/api/signals") {
    const side = (url.searchParams.get("side") ?? "ALL").toUpperCase();
    const maxAge = Math.max(0, Math.min(500, Number(url.searchParams.get("maxAge") ?? 20)));
    const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") ?? 200)));
    const w = new Where()
      .add("l.strategy = ?", strategy)
      .add("l.as_of_date >= ?", fresh)
      .add("l.last_signal IS NOT NULL")
      .add("l.last_signal_bars <= ?", maxAge);
    if (side === "BUY" || side === "SELL") w.add("l.last_signal = ?", side);
    w.index("l", index);
    const { results } = await db
      .prepare(
        `SELECT ${LATEST_COLUMNS} FROM ${LATEST_FROM} ${w.sql}
         ORDER BY l.last_signal_bars ASC, l.last_signal_score DESC, l.code ASC LIMIT ?`,
      )
      .bind(...w.params, limit)
      .all();
    return json({ asOf, strategy, side, maxAge, index: index || null, count: results.length, rows: results });
  }

  // "/api/events" is often blocked by ad blockers (tracking filter lists) -> neutral alias "/api/level-hits".
  if (path === "/api/level-hits" || path === "/api/events") {
    const w = new Where()
      .add("l.strategy = ?", strategy)
      .add("l.as_of_date = ?", asOf)
      .add("l.event_today IS NOT NULL")
      .add("l.last_signal = 'BUY'")
      .index("l", index);
    const { results } = await db
      .prepare(`SELECT ${LATEST_COLUMNS} FROM ${LATEST_FROM} ${w.sql} ORDER BY l.code`)
      .bind(...w.params)
      .all();
    return json({ asOf, strategy, count: results.length, rows: results });
  }

  if (path === "/api/search") {
    const q = (url.searchParams.get("q") ?? "").trim().toUpperCase();
    if (q.length < 1) return json({ rows: [] });
    const { results } = await db
      .prepare(
        `SELECT s.code, s.name, l.close, l.last_signal, l.last_signal_bars
         FROM stocks s LEFT JOIN sats_latest l ON l.code = s.code AND l.strategy = ?
         WHERE s.code LIKE ? OR UPPER(s.name) LIKE ?
         ORDER BY CASE WHEN s.code = ? THEN 0 WHEN s.code LIKE ? THEN 1 ELSE 2 END, s.code
         LIMIT 20`,
      )
      .bind(strategy, `${q}%`, `%${q}%`, q, `${q}%`)
      .all();
    return json({ rows: results });
  }

  const stockMatch = path.match(/^\/api\/stocks\/([A-Za-z0-9]{2,6})$/);
  if (stockMatch) {
    const code = stockMatch[1].toUpperCase();
    const name = await db.prepare("SELECT code, name FROM stocks WHERE code = ?").bind(code).first<{ code: string; name: string }>();
    if (!name) return json({ error: "unknown code" }, 404);
    const latest = await db
      .prepare(`SELECT ${LATEST_COLUMNS} FROM ${LATEST_FROM} WHERE l.code = ? AND l.strategy = ?`)
      .bind(code, strategy)
      .first<Record<string, unknown>>();
    const { results: trades } = await db
      .prepare(
        `SELECT t.*, ${netOf("whole")} AS net_pct, ${netOf("scaled")} AS net_scaled FROM sats_trades t
         WHERE t.code = ? AND t.strategy = ? AND t.entry_date >= ?
         ORDER BY t.entry_date DESC LIMIT 100`,
      )
      .bind(code, strategy, minDate(asOf, 1096))
      .all();
    const { results: others } = await db
      .prepare(
        `SELECT strategy, last_signal, last_signal_date, last_signal_bars, trade_status, entry, stop_now, sl
         FROM sats_latest WHERE code = ?`,
      )
      .bind(code)
      .all();
    const tech = await db
      .prepare("SELECT candles, chart_patterns, as_of_date FROM tech_latest WHERE code = ?")
      .bind(code)
      .first<Record<string, unknown>>()
      .catch(() => null);
    const fund = await db
      .prepare("SELECT * FROM fund_latest WHERE code = ?")
      .bind(code)
      .first<Record<string, unknown>>()
      .catch(() => null);
    const stock = latest ?? { code, name: name.name };
    return json({
      asOf,
      strategy,
      stock: { ...stock, code, name: name.name, stale: !latest || String(latest.as_of_date) < fresh },
      trades,
      others,
      patterns: tech,
      fundamentals: fund,
    });
  }

  if (path === "/api/screener") {
    const { results } = await db
      .prepare(
        `SELECT t.*, s.name,
                l.last_signal AS sats_signal, l.last_signal_bars AS sats_bars, l.filter_signal AS sats_filter,
                l.filter_now AS filter_now, l.trend AS sats_trend,
                (SELECT GROUP_CONCAT(m.index_code) FROM index_members m WHERE m.code = t.code) AS indexes,
                f.market_cap, f.per, f.pbv, f.roe, f.der, f.rev_growth, f.eps_growth, f.div_yield,
                f.profitable, f.equity_positive, f.stale AS fund_stale, f.sector, f.industry, f.last_quarter
         FROM tech_latest t
         JOIN stocks s ON s.code = t.code
         LEFT JOIN sats_latest l ON l.code = t.code AND l.strategy = 'SATS'
         LEFT JOIN fund_latest f ON f.code = t.code
         WHERE t.as_of_date >= ?
         ORDER BY t.code`,
      )
      .bind(fresh)
      .all();
    return json({ asOf, count: results.length, rows: results });
  }

  if (path === "/api/track") {
    const f = tradeWhere(url, asOf, strategy);
    const { w } = f;
    const mode = exitModeOf(url);
    const NET = netOf(mode);
    const AGG = aggOf(NET);
    const overall = await db.prepare(`SELECT ${AGG} FROM sats_trades t ${w.sql}`).bind(...w.params).first<Agg>();
    const n = Number(overall?.n ?? 0);
    const robust = await robustStats(db, w, n, NET);
    const histogram = n
      ? (
          await db
            .prepare(
              `SELECT CASE WHEN ${NET} < -20 THEN 0 WHEN ${NET} < -10 THEN 1 WHEN ${NET} < -5 THEN 2 WHEN ${NET} < 0 THEN 3
                           WHEN ${NET} < 5 THEN 4 WHEN ${NET} < 10 THEN 5 WHEN ${NET} < 20 THEN 6 WHEN ${NET} < 50 THEN 7 ELSE 8 END AS bin,
                      COUNT(*) AS n
               FROM sats_trades t ${w.sql} GROUP BY bin ORDER BY bin`,
            )
            .bind(...w.params)
            .all()
        ).results
      : [];
    const { results: buckets } = await db
      .prepare(
        `SELECT CASE WHEN COALESCE(t.score,0) < 10 THEN '0–9' WHEN t.score < 20 THEN '10–19' WHEN t.score < 30 THEN '20–29'
                     WHEN t.score < 40 THEN '30–39' ELSE '40+' END AS bucket, ${AGG}
         FROM sats_trades t ${w.sql} GROUP BY bucket ORDER BY MIN(COALESCE(t.score,0))`,
      )
      .bind(...w.params)
      .all();
    const { results: byYear } = await db
      .prepare(`SELECT substr(t.entry_date, 1, 4) AS year, ${AGG} FROM sats_trades t ${w.sql} GROUP BY year ORDER BY year`)
      .bind(...w.params)
      .all();
    let stocks: unknown[] = [];
    let trades: unknown[] = [];
    if (f.code) {
      trades = (
        await db
          .prepare(`SELECT t.*, ${netOf("whole")} AS net_pct, ${netOf("scaled")} AS net_scaled FROM sats_trades t ${w.sql} ORDER BY t.entry_date DESC LIMIT 100`)
          .bind(...w.params)
          .all()
      ).results;
    } else {
      stocks = (
        await db
          .prepare(
            `SELECT t.code, s.name, ${AGG} FROM sats_trades t JOIN stocks s ON s.code = t.code ${w.sql}
             GROUP BY t.code HAVING COUNT(*) >= 5 ORDER BY avg_net DESC`,
          )
          .bind(...w.params)
          .all()
      ).results;
    }
    return json({
      asOf, strategy, mode, period: f.period, since: f.since, until: f.until, minScore: f.minScore, minValue: f.minValueB,
      minPrice: f.minPrice, feePct: FEE_PCT, index: index || null, code: f.code || null,
      overall: { ...withPf(overall), ...robust }, histogram, buckets, byYear, stocks, trades,
    });
  }

  if (path === "/api/track/compare") {
    const rows = [];
    const mode = exitModeOf(url);
    const NET = netOf(mode);
    const AGG = aggOf(NET);
    for (const s of STRATEGIES) {
      const f = tradeWhere(url, asOf, s.id);
      const a = await db.prepare(`SELECT ${AGG} FROM sats_trades t ${f.w.sql}`).bind(...f.w.params).first<Agg>();
      const robust = await robustStats(db, f.w, Number(a?.n ?? 0), NET);
      rows.push({ strategy: s.id, name: s.name, ...withPf(a), ...robust });
    }
    const f0 = tradeWhere(url, asOf, null);
    return json({ asOf, mode, period: f0.period, since: f0.since, until: f0.until, feePct: FEE_PCT, rows });
  }

  return json({ error: "not found" }, 404);
}

/**
 * Cloudflare Cron Trigger -> start the "EOD SATS" GitHub workflow (sats-eod.yml) on time.
 * GitHub's own schedule can be delayed by hours; Cloudflare cron fires within a minute.
 * Every cron run does the same thing (the cron expression is not inspected); running EOD twice is safe.
 */
async function dispatchEod(env: Env): Promise<void> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    console.log("dispatchEod: GITHUB_TOKEN / GITHUB_REPO not set, skipped");
    return;
  }
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/sats-eod.yml/dispatches`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "sats-radar-cron",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ref: profile(env).github.branch || "main" }), // inputs fall back to their defaults (full = false, all codes)
  });
  console.log(`dispatchEod: GitHub responded ${res.status}${res.ok ? "" : ` ${await res.text()}`}`);
}

/**
 * SATS hanya boleh ditampilkan di dalam dashboard Tool Hub. Alamat hub datang dari profil (HUB_URL), jadi header
 * frame-ancestors dipasang di sini, bukan di file _headers statis. Hanya halaman HTML ("/") yang lewat worker
 * (assets.run_worker_first di wrangler.jsonc); JS/CSS/gambar tetap dilayani langsung tanpa memakai kuota worker.
 */
async function serveAsset(request: Request, env: Env): Promise<Response> {
  // tanpa If-None-Match: HTML diubah di bawah, jadi 304 dari aset bisa membuat browser memakai halaman lama
  const req = new Request(request);
  req.headers.delete("if-none-match");
  const res = await env.ASSETS.fetch(req);
  let hub = "";
  try {
    hub = env.HUB_URL ? new URL(env.HUB_URL).origin : "";
  } catch {
    /* HUB_URL tidak sah: cukup 'self' */
  }
  const out = new Response(res.body, res);
  out.headers.set("content-security-policy", `frame-ancestors 'self'${hub ? ` ${hub}` : ""}`);
  if (!(out.headers.get("content-type") || "").includes("text/html")) return out;
  out.headers.delete("etag");
  out.headers.delete("content-length");
  // tema terang/gelap mengikuti tombol tema Tool Hub (shared/theme.js)
  return new HTMLRewriter().on("head", { element(el) { el.append(themeHead(SATS_THEME_CSS), { html: true }); } }).transform(out);
}

// ───────────────────────────── watchlist (per user)

const WATCHLIST_DDL =
  "CREATE TABLE IF NOT EXISTS watchlist (email TEXT NOT NULL, code TEXT NOT NULL, added_at TEXT NOT NULL, PRIMARY KEY (email, code))";

/** GET -> {codes}; POST {code, on} -> add/remove, then {codes}. */
async function watchlist(request: Request, env: Env, email: string): Promise<Response> {
  const db = env.screener_db;
  await db.prepare(WATCHLIST_DDL).run();
  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { code?: string; on?: boolean };
    const code = String(body.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (code.length < 2) return json({ error: "kode tidak valid" }, 400, 0);
    if (body.on === false) {
      await db.prepare("DELETE FROM watchlist WHERE email = ? AND code = ?").bind(email, code).run();
    } else {
      const c = await db.prepare("SELECT COUNT(*) AS n FROM watchlist WHERE email = ?").bind(email).first<{ n: number }>();
      if ((c?.n ?? 0) >= 200) return json({ error: "Watchlist maksimal 200 saham" }, 400, 0);
      await db
        .prepare("INSERT OR IGNORE INTO watchlist (email, code, added_at) VALUES (?, ?, ?)")
        .bind(email, code, new Date().toISOString())
        .run();
    }
  }
  const { results } = await db.prepare("SELECT code FROM watchlist WHERE email = ? ORDER BY added_at").bind(email).all<{ code: string }>();
  return json({ codes: results.map((r) => r.code) }, 200, 0);
}

// ───────────────────────────── access requests & admin

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function handleAuthRoutes(url: URL, request: Request, env: Env, me: Me): Promise<Response | null> {
  const db = env.screener_db;
  const path = url.pathname.replace(/\/+$/, "");
  const now = new Date().toISOString();

  if (path === "/api/me") return json(me, 200, 0);

  if (path === "/api/access/request" && request.method === "POST") {
    if (me.status === "approved") return json(me, 200, 0);
    const body = (await request.json().catch(() => ({}))) as { name?: string; reason?: string };
    const name = clean(body.name, 80);
    const reason = clean(body.reason, 300);
    if (name.length < 2) return json({ error: "Nama wajib diisi" }, 400, 0);
    await db
      .prepare(
        `INSERT INTO users (email, name, reason, status, role, requested_at) VALUES (?, ?, ?, 'pending', 'user', ?)
         ON CONFLICT(email) DO UPDATE SET name = excluded.name, reason = excluded.reason, status = 'pending',
           requested_at = excluded.requested_at, decided_at = NULL, decided_by = NULL
         WHERE users.status IN ('rejected', 'revoked', 'pending')`,
      )
      .bind(me.email, name, reason, now)
      .run();
    return json(await loadMe(me.email, env), 200, 0);
  }

  if (path.startsWith("/api/admin/")) {
    if (hubEnabled(env)) return json({ error: "Kelola pengguna sudah pindah ke Tool Hub" }, 404, 0);
    if (!me.isAdmin) return json({ error: "admin only" }, 403, 0);
    if (path === "/api/admin/users" && request.method === "GET") {
      const { results } = await db
        .prepare(
          `SELECT email, name, reason, status, role, requested_at, decided_at, decided_by, last_seen FROM users
           ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, requested_at DESC`,
        )
        .all();
      return json({ rows: results, admins: (env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean) }, 200, 0);
    }
    if (path === "/api/admin/users" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { email?: string; action?: string };
      const email = clean(body.email, 200).toLowerCase();
      const action = body.action;
      const map: Record<string, string> = { approve: "approved", reject: "rejected", revoke: "revoked" };
      if (!email || !action) return json({ error: "email & action wajib" }, 400, 0);
      if (action === "reset_password") {
        await db.prepare("UPDATE users SET password_hash = NULL, password_salt = NULL, failed_logins = 0, locked_until = NULL WHERE email = ?").bind(email).run();
      } else if (action === "make_admin" || action === "remove_admin") {
        await db
          .prepare("UPDATE users SET role = ?, decided_at = ?, decided_by = ? WHERE email = ?")
          .bind(action === "make_admin" ? "admin" : "user", now, me.email, email)
          .run();
      } else if (map[action]) {
        if (email === me.email) return json({ error: "Tidak bisa mengubah akses sendiri" }, 400, 0);
        await db
          .prepare(
            `INSERT INTO users (email, status, role, requested_at, decided_at, decided_by) VALUES (?, ?, 'user', ?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET status = excluded.status, decided_at = excluded.decided_at, decided_by = excluded.decided_by`,
          )
          .bind(email, map[action], now, now, me.email)
          .run();
      } else return json({ error: "action tidak dikenal" }, 400, 0);
      return json({ ok: true }, 200, 0);
    }
    return json({ error: "not found" }, 404, 0);
  }
  return null;
}

export default withCron({
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(dispatchEod(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS" },
      });
    }
    if (url.pathname === "/" || url.pathname === "/index.html") return serveAsset(request, env);
    if (!url.pathname.startsWith("/api/")) {
      return new Response("Screener API", { headers: { "content-type": "text/plain" } });
    }
    try {
      // ---- authentication (Cloudflare Access) + authorization (approved users only)
      const hubRoute = await handleHubAuth(url, request, env);
      if (hubRoute) return hubRoute;
      const pwRoute = await handlePasswordAuth(url, request, env);
      if (pwRoute) return pwRoute;
      const authRoute = await handleGoogleAuth(url, request, env);
      if (authRoute) return authRoute;
      if (passwordEnabled(env)) await ensureAuthSchema(env);
      let actor: string | null = null; // nama pengguna untuk catatan "dibuat oleh" (analisis AI)
      if (authEnabled(env)) {
        const who = await identify(request, env);
        if (!who) {
          if (hubEnabled(env)) return json({ error: "login_required", methods: ["hub"], hub: hubUrl(env) }, 401, 0);
          const methods = [passwordEnabled(env) && "password", googleEnabled(env) && "google", accessEnabled(env) && "access"].filter(Boolean);
          return json({ error: "login_required", methods }, 401, 0);
        }
        const email = who.email;
        const me = await loadMe(email, env, who.name, who.admin);
        actor = me.name || email;
        const authRes = await handleAuthRoutes(url, request, env, me);
        if (authRes) return authRes;
        if (me.status !== "approved") return json({ error: "not_approved", status: me.status }, 403, 0);
        if (url.pathname.replace(/\/+$/, "") === "/api/watchlist") return await watchlist(request, env, email);
        // Track Record (all stocks) and Lab Uji are admin-only; a single stock's history stays visible on its detail page
        const p = url.pathname.replace(/\/+$/, "");
        if (!me.isAdmin && (p === "/api/lab" || p === "/api/track/compare" || (p === "/api/track" && !url.searchParams.get("code")))) {
          return json({ error: "admin only" }, 403, 0);
        }
        // last_seen, at most once per hour per user (cheap on D1 writes)
        env.screener_db
          .prepare("UPDATE users SET last_seen = ? WHERE email = ? AND (last_seen IS NULL OR last_seen < ?)")
          .bind(new Date().toISOString(), email, new Date(Date.now() - 3600_000).toISOString())
          .run()
          .catch(() => undefined);
      } else if (url.pathname.replace(/\/+$/, "") === "/api/me") {
        return json({ email: null, name: null, status: "approved", isAdmin: false, authDisabled: true, logoutUrl: "/" }, 200, 0);
      }
      const am = url.pathname.replace(/\/+$/, "").match(/^\/api\/analyst\/([A-Za-z0-9]{2,6})$/);
      if (am) return await analystRoute(request, env, am[1], actor);
      if (request.method !== "GET") return json({ error: "method not allowed" }, 405, 0);
      return await handle(url, env);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "internal error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>);
