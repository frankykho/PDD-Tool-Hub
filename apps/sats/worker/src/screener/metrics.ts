/**
 * Technical metrics for the screener, computed once per stock per EOD run (last bar only).
 * All moving averages are SMA, RSI/ATR use Wilder smoothing (same as TradingView defaults).
 */
import type { SatsInputBar } from "../sats/types";
import { atr, ema, highestPrev, sma, stdev, type Series } from "../strategies/series";
import { chartPatterns, recentCandles } from "./patterns";

export interface TechRow {
  close: number;
  chg1: number | null;
  chg5: number | null;
  chg20: number | null;
  chg60: number | null;
  chg_ytd: number | null;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  dist_ma20: number | null;
  dist_ma50: number | null;
  dist_ma200: number | null;
  ma_stack: number | null; // 1 = close > MA20 > MA50 > MA200
  golden_days: number | null; // bars since MA50 crossed above MA200 (only while still above)
  death_days: number | null;
  rsi14: number | null;
  macd_hist: number | null;
  macd_up_days: number | null; // bars since MACD crossed above signal (only while still above)
  vol_ratio: number | null; // volume today / average volume of the previous 20 bars
  value_20d: number | null;
  high52: number | null;
  low52: number | null;
  dist_high52: number | null; // % below the 52-week high (<= 0)
  dist_low52: number | null; // % above the 52-week low (>= 0)
  breakout20_days: number | null; // bars since the last close above the previous 20-bar high (<= 60)
  atr_pct: number | null;
  bb_width: number | null; // (upper − lower) / basis × 100, BB(20, 2)
  bb_pctile: number | null; // rank of today's width within the last 126 bars (0 = narrowest)
  // money-flow proxies (price × volume only; no broker / foreign data)
  cmf20: number | null; // Chaikin Money Flow 20: −1..1
  obv20: number | null; // net OBV change over 20 bars / total volume of those bars: −1..1
  updown_vol20: number | null; // volume on up days / volume on down days, 20 bars
  // ---- extra (presets v2)
  ma150: number | null;
  dist_ma150: number | null;
  ma150_slope20: number | null; // % change of MA150 over 20 bars
  ma200_slope22: number | null; // % change of MA200 over 22 bars (≈ 1 month)
  chg126: number | null; // ≈ 6 months
  chg_12_1: number | null; // 12-month return excluding the last month (close[t-21] / close[t-252])
  adx14: number | null;
  pdi14: number | null;
  mdi14: number | null;
  stoch_k: number | null; // Stochastic(14, 1, 3) like TradingView default
  stoch_d: number | null;
  stoch_up_days: number | null; // bars since %K crossed above %D while %K < 20 (<= 5)
  pocket_pivot_days: number | null; // bars since the last pocket pivot (<= 10)
  vcp: number | null; // 1 = simple volatility contraction pattern in an uptrend
  nr7: number | null; // 1 = narrowest daily range of the last 7 bars
  inside_day: number | null; // 1 = high <= high[1] and low >= low[1]
  gap_pct: number | null; // open vs previous high (%), 0 when no gap up
  body_pct: number | null; // close vs open today (%)
  ichi_above: number | null; // 1 = close above the Ichimoku cloud (9/26/52, displaced 26)
  ichi_tk: number | null; // 1 = Tenkan > Kijun
  ichi_green: number | null; // 1 = forward cloud green (Senkou A > Senkou B, unshifted)
  rsi_div_days: number | null; // bars since the latest pivot low of a bullish RSI divergence (<= 10)
  up_streak: number | null; // consecutive higher closes up to today
  // ---- patterns (text)
  candles: string | null; // "id@daysAgo,…" candle patterns of the last 5 bars
  chart_patterns: string | null; // "id:forming|breakout,…"
}

const r2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const pct = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? (a / b - 1) * 100 : null);

/** Wilder RSI, NaN until `length` changes are available. */
export function rsi(close: Series, length: number): Series {
  const out: Series = new Array(close.length).fill(NaN);
  if (close.length <= length) return out;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= length; i += 1) {
    const d = close[i] - close[i - 1];
    g += Math.max(d, 0);
    l += Math.max(-d, 0);
  }
  g /= length;
  l /= length;
  out[length] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = length + 1; i < close.length; i += 1) {
    const d = close[i] - close[i - 1];
    g = (g * (length - 1) + Math.max(d, 0)) / length;
    l = (l * (length - 1) + Math.max(-d, 0)) / length;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

/** Wilder RMA seeded with the SMA of the first `length` values (ta.rma). */
function rma(src: Series, length: number): Series {
  const out: Series = new Array(src.length).fill(NaN);
  let prev = NaN;
  let run: number[] = [];
  for (let i = 0; i < src.length; i += 1) {
    const v = src[i];
    if (Number.isNaN(v)) continue;
    if (Number.isNaN(prev)) {
      run.push(v);
      if (run.length === length) {
        prev = run.reduce((a, b) => a + b, 0) / length;
        out[i] = prev;
        run = [];
      }
    } else {
      prev = (prev * (length - 1) + v) / length;
      out[i] = prev;
    }
  }
  return out;
}

const hiOf = (a: number[], from: number, to: number) => {
  let m = -Infinity;
  for (let k = Math.max(0, from); k <= to; k += 1) m = Math.max(m, a[k]);
  return m;
};
const loOf = (a: number[], from: number, to: number) => {
  let m = Infinity;
  for (let k = Math.max(0, from); k <= to; k += 1) m = Math.min(m, a[k]);
  return m;
};

/** Bars since the most recent bar k (<= maxBack) where cond(k) is true; null if none. */
function barsSince(last: number, maxBack: number, cond: (k: number) => boolean): number | null {
  for (let k = last; k >= Math.max(1, last - maxBack); k -= 1) if (cond(k)) return last - k;
  return null;
}

export function computeTech(bars: SatsInputBar[], value20: number | null, wibDate: (t: number) => string): TechRow {
  const n = bars.length;
  const i = n - 1;
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const vol = bars.map((b) => b.volume ?? 0);
  const c = close[i];

  const ma20 = sma(close, 20);
  const ma50 = sma(close, 50);
  const ma200 = sma(close, 200);
  const r = rsi(close, 14);

  const e12 = ema(close, 12);
  const e26 = ema(close, 26);
  const macd = close.map((_, k) => e12[k] - e26[k]);
  const sig = ema(macd, 9);

  const volAvgPrev = sma(vol, 20); // at k-1 = average of bars k-20..k-1
  const hh20 = highestPrev(high, 20);
  const a14 = atr(bars, 14);
  const basis = sma(close, 20);
  const sd = stdev(close, 20);
  const width = basis.map((b, k) => ((4 * sd[k]) / b) * 100);

  const chg = (nBack: number) => (i - nBack >= 0 ? pct(c, close[i - nBack]) : null);

  // YTD: vs the last close of the previous calendar year
  const year = wibDate(bars[i].time).slice(0, 4);
  let prevYearClose: number | null = null;
  for (let k = i; k >= 0; k -= 1) {
    if (wibDate(bars[k].time).slice(0, 4) < year) {
      prevYearClose = close[k];
      break;
    }
  }

  const start52 = Math.max(0, n - 252);
  let high52 = -Infinity;
  let low52 = Infinity;
  for (let k = start52; k < n; k += 1) {
    high52 = Math.max(high52, high[k]);
    low52 = Math.min(low52, low[k]);
  }

  const golden = ma50[i] > ma200[i] ? barsSince(i, 250, (k) => ma50[k] > ma200[k] && ma50[k - 1] <= ma200[k - 1]) : null;
  const death = ma50[i] < ma200[i] ? barsSince(i, 250, (k) => ma50[k] < ma200[k] && ma50[k - 1] >= ma200[k - 1]) : null;
  const macdUp = macd[i] > sig[i] ? barsSince(i, 60, (k) => macd[k] > sig[k] && macd[k - 1] <= sig[k - 1]) : null;
  const breakout = barsSince(i, 60, (k) => close[k] > hh20[k]);

  let bbPct: number | null = null;
  if (Number.isFinite(width[i])) {
    const win = width.slice(Math.max(0, i - 125), i + 1).filter(Number.isFinite);
    if (win.length >= 60) bbPct = (win.filter((w) => w < width[i]).length / (win.length - 1)) * 100;
  }

  // ---- money flow (last 20 bars)
  let mfv = 0;
  let vsum = 0;
  let obv = 0;
  let upV = 0;
  let dnV = 0;
  for (let k = Math.max(1, n - 20); k < n; k += 1) {
    const range = high[k] - low[k];
    const mult = range > 0 ? (close[k] - low[k] - (high[k] - close[k])) / range : 0;
    mfv += mult * vol[k];
    vsum += vol[k];
    if (close[k] > close[k - 1]) {
      obv += vol[k];
      upV += vol[k];
    } else if (close[k] < close[k - 1]) {
      obv -= vol[k];
      dnV += vol[k];
    }
  }
  const enough = n >= 21 && vsum > 0;

  // ---- MA150 / slopes / long momentum
  const ma150 = sma(close, 150);
  const slope = (a: Series, back: number) => (i - back >= 0 ? pct(a[i], a[i - back]) : null);
  const open = bars.map((b) => b.open);

  // ---- DMI / ADX (14), TradingView ta.dmi
  const plusDM: Series = close.map((_, k) => {
    if (k === 0) return NaN;
    const up = high[k] - high[k - 1];
    const dn = low[k - 1] - low[k];
    return up > dn && up > 0 ? up : 0;
  });
  const minusDM: Series = close.map((_, k) => {
    if (k === 0) return NaN;
    const up = high[k] - high[k - 1];
    const dn = low[k - 1] - low[k];
    return dn > up && dn > 0 ? dn : 0;
  });
  const trS: Series = close.map((_, k) =>
    k === 0 ? high[k] - low[k] : Math.max(high[k] - low[k], Math.abs(high[k] - close[k - 1]), Math.abs(low[k] - close[k - 1])),
  );
  const trR = rma(trS, 14);
  const pDI = rma(plusDM, 14).map((v, k) => (100 * v) / trR[k]);
  const mDI = rma(minusDM, 14).map((v, k) => (100 * v) / trR[k]);
  const dx = pDI.map((p, k) => (p + mDI[k] === 0 ? 0 : (100 * Math.abs(p - mDI[k])) / (p + mDI[k])));
  const adx = rma(dx, 14);

  // ---- Stochastic(14, 1, 3)
  const stochK: Series = close.map((_, k) => {
    if (k < 13) return NaN;
    const hh = hiOf(high, k - 13, k);
    const ll = loOf(low, k - 13, k);
    return hh === ll ? NaN : (100 * (close[k] - ll)) / (hh - ll);
  });
  const stochD = sma(stochK, 3);
  const stochUp = barsSince(i, 5, (k) => stochK[k] > stochD[k] && stochK[k - 1] <= stochD[k - 1] && stochK[k - 1] < 20);

  // ---- Pocket pivot (Kacher/Morales): up day, volume > largest down-day volume of the prior 10 bars,
  //      close >= MA10 and not extended (<= 5% above MA10), close > MA50
  const ma10 = sma(close, 10);
  const isPP = (k: number) => {
    if (k < 11 || !(close[k] > close[k - 1])) return false;
    let maxDown = 0;
    for (let j = k - 10; j < k; j += 1) if (close[j] < close[j - 1]) maxDown = Math.max(maxDown, vol[j]);
    return vol[k] > maxDown && close[k] >= ma10[k] && close[k] <= ma10[k] * 1.05 && close[k] > ma50[k];
  };
  const ppDays = barsSince(i, 10, isPP);

  // ---- VCP (simplified): uptrend + 3 successively tighter 15-bar ranges, last <= 10%, volume drying up
  let vcp: number | null = null;
  if (n >= 60 && Number.isFinite(ma200[i])) {
    const rng = (a: number, b: number) => {
      const h = hiOf(high, a, b);
      return ((h - loOf(low, a, b)) / h) * 100;
    };
    const r1 = rng(i - 44, i - 30);
    const r2_ = rng(i - 29, i - 15);
    const r3 = rng(i - 14, i);
    const v10 = vol.slice(i - 9, i + 1).reduce((a, b) => a + b, 0) / 10;
    const v50 = vol.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50;
    vcp = c > ma50[i] && ma50[i] > ma200[i] && r1 > r2_ && r2_ > r3 && r3 <= 10 && v10 < v50 ? 1 : 0;
  }

  // ---- NR7 / inside day / gap / streak
  const rangeToday = high[i] - low[i];
  let nr7: number | null = null;
  if (n >= 7) {
    nr7 = 1;
    for (let k = i - 6; k < i; k += 1) if (high[k] - low[k] <= rangeToday) nr7 = 0;
  }
  const inside = i >= 1 ? (high[i] <= high[i - 1] && low[i] >= low[i - 1] ? 1 : 0) : null;
  const gap = i >= 1 ? Math.max(0, (open[i] / high[i - 1] - 1) * 100) : null;
  let streak = 0;
  for (let k = i; k >= 1 && close[k] > close[k - 1]; k -= 1) streak += 1;

  // ---- Ichimoku (9, 26, 52, displacement 26)
  let ichiAbove: number | null = null;
  let ichiTk: number | null = null;
  let ichiGreen: number | null = null;
  const mid = (k: number, len: number) => (hiOf(high, k - len + 1, k) + loOf(low, k - len + 1, k)) / 2;
  if (n >= 52 + 26) {
    const tenkan = mid(i, 9);
    const kijun = mid(i, 26);
    const j = i - 25; // cloud plotted at bar i was computed 25 bars earlier (TradingView offset = displacement − 1)
    const spanA = (mid(j, 9) + mid(j, 26)) / 2;
    const spanB = mid(j, 52);
    ichiAbove = c > Math.max(spanA, spanB) ? 1 : 0;
    ichiTk = tenkan > kijun ? 1 : 0;
    ichiGreen = (tenkan + kijun) / 2 > mid(i, 52) ? 1 : 0;
  }

  // ---- Bullish RSI divergence: last two confirmed pivot lows (3/3) within 40 bars,
  //      price lower low, RSI higher low, previous RSI low < 40, latest pivot <= 10 bars ago
  let rsiDiv: number | null = null;
  const pivots: number[] = [];
  for (let k = i - 3; k >= Math.max(3, i - 40) && pivots.length < 2; k -= 1) {
    let isLow = true;
    for (let j = k - 3; j <= k + 3; j += 1) if (j !== k && low[j] <= low[k]) isLow = false;
    if (isLow) pivots.push(k);
  }
  if (pivots.length === 2) {
    const [p2, p1] = pivots; // p2 = latest
    if (low[p2] < low[p1] && r[p2] > r[p1] && r[p1] < 40 && i - p2 <= 10) rsiDiv = i - p2;
  }

  return {
    close: c,
    chg1: r2(chg(1)),
    chg5: r2(chg(5)),
    chg20: r2(chg(20)),
    chg60: r2(chg(60)),
    chg_ytd: r2(prevYearClose == null ? null : pct(c, prevYearClose)),
    ma20: r2(ma20[i]),
    ma50: r2(ma50[i]),
    ma200: r2(ma200[i]),
    dist_ma20: r2(pct(c, ma20[i])),
    dist_ma50: r2(pct(c, ma50[i])),
    dist_ma200: r2(pct(c, ma200[i])),
    ma_stack: Number.isFinite(ma200[i]) ? (c > ma20[i] && ma20[i] > ma50[i] && ma50[i] > ma200[i] ? 1 : 0) : null,
    golden_days: golden,
    death_days: death,
    rsi14: r2(r[i]),
    macd_hist: r2(macd[i] - sig[i]),
    macd_up_days: macdUp,
    vol_ratio: i >= 1 && volAvgPrev[i - 1] > 0 ? r2(vol[i] / volAvgPrev[i - 1]) : null,
    value_20d: value20 == null ? null : Math.round(value20),
    high52: n >= 20 ? high52 : null,
    low52: n >= 20 ? low52 : null,
    dist_high52: n >= 20 ? r2(pct(c, high52)) : null,
    dist_low52: n >= 20 ? r2(pct(c, low52)) : null,
    breakout20_days: breakout,
    atr_pct: r2((a14[i] / c) * 100),
    bb_width: r2(width[i]),
    bb_pctile: r2(bbPct),
    cmf20: enough ? r2(mfv / vsum) : null,
    obv20: enough ? r2(obv / vsum) : null,
    updown_vol20: enough && dnV > 0 ? r2(upV / dnV) : enough && upV > 0 ? 99 : null,
    ma150: r2(ma150[i]),
    dist_ma150: r2(pct(c, ma150[i])),
    ma150_slope20: r2(slope(ma150, 20)),
    ma200_slope22: r2(slope(ma200, 22)),
    chg126: r2(chg(126)),
    chg_12_1: i >= 252 ? r2(pct(close[i - 21], close[i - 252])) : null,
    adx14: r2(adx[i]),
    pdi14: r2(pDI[i]),
    mdi14: r2(mDI[i]),
    stoch_k: r2(stochK[i]),
    stoch_d: r2(stochD[i]),
    stoch_up_days: stochUp,
    pocket_pivot_days: ppDays,
    vcp,
    nr7,
    inside_day: inside,
    gap_pct: r2(gap),
    body_pct: r2(pct(c, open[i])),
    ichi_above: ichiAbove,
    ichi_tk: ichiTk,
    ichi_green: ichiGreen,
    rsi_div_days: rsiDiv,
    up_streak: streak,
    candles: recentCandles(bars, 5),
    chart_patterns: chartPatterns(bars),
  };
}

export const TECH_COLUMNS: Array<keyof TechRow> = [
  "close", "chg1", "chg5", "chg20", "chg60", "chg_ytd", "ma20", "ma50", "ma200", "dist_ma20", "dist_ma50", "dist_ma200",
  "ma_stack", "golden_days", "death_days", "rsi14", "macd_hist", "macd_up_days", "vol_ratio", "value_20d", "high52", "low52",
  "dist_high52", "dist_low52", "breakout20_days", "atr_pct", "bb_width", "bb_pctile", "cmf20", "obv20", "updown_vol20",
  "ma150", "dist_ma150", "ma150_slope20", "ma200_slope22", "chg126", "chg_12_1", "adx14", "pdi14", "mdi14", "stoch_k", "stoch_d",
  "stoch_up_days", "pocket_pivot_days", "vcp", "nr7", "inside_day", "gap_pct", "body_pct", "ichi_above", "ichi_tk", "ichi_green",
  "rsi_div_days", "up_streak", "candles", "chart_patterns",
];

/** Columns stored as TEXT (everything else is REAL). */
export const TECH_TEXT_COLUMNS = new Set<keyof TechRow>(["candles", "chart_patterns"]);
