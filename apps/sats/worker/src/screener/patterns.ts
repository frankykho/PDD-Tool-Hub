/**
 * Candlestick & chart pattern detection on daily bars.
 * Definitions follow the common textbook versions (Nison / Bulkowski) with explicit tolerances.
 * Reversal candles require the preceding trend: bullish after a 5-bar decline, bearish after a 5-bar rise.
 */
import type { SatsInputBar } from "../sats/types";

export type CandleId =
  | "hammer" | "inverted_hammer" | "bull_engulfing" | "bull_harami" | "piercing" | "morning_star"
  | "three_white" | "bull_marubozu" | "tweezer_bottom" | "dragonfly_doji"
  | "hanging_man" | "shooting_star" | "bear_engulfing" | "bear_harami" | "dark_cloud" | "evening_star"
  | "three_black" | "bear_marubozu" | "tweezer_top" | "gravestone_doji"
  | "doji";

export type ChartId = "double_bottom" | "double_top" | "asc_triangle" | "bull_flag";

/** Candle patterns completed at bar i (empty when none). */
export function candlesAt(bars: SatsInputBar[], i: number): CandleId[] {
  if (i < 12) return [];
  const o = (k: number) => bars[k].open;
  const h = (k: number) => bars[k].high;
  const l = (k: number) => bars[k].low;
  const c = (k: number) => bars[k].close;
  const body = (k: number) => Math.abs(c(k) - o(k));
  const range = (k: number) => h(k) - l(k);
  const upper = (k: number) => h(k) - Math.max(o(k), c(k));
  const lower = (k: number) => Math.min(o(k), c(k)) - l(k);
  const green = (k: number) => c(k) > o(k);
  const red = (k: number) => c(k) < o(k);
  let avgBody = 0;
  for (let k = i - 10; k < i; k += 1) avgBody += body(k);
  avgBody /= 10;
  const big = (k: number) => body(k) >= 1.2 * avgBody; // "long" candle
  // trend before the pattern (pattern may span up to 3 bars, so look before them)
  const down = (start: number) => c(start - 1) < c(start - 6);
  const up = (start: number) => c(start - 1) > c(start - 6);

  const out: CandleId[] = [];
  const r = range(i);
  const b = body(i);
  if (r <= 0) return out;

  const isDoji = b <= 0.1 * r;
  // ---- single candle
  const hammerShape = !isDoji && lower(i) >= 2 * b && upper(i) <= 0.3 * b;
  const invShape = !isDoji && upper(i) >= 2 * b && lower(i) <= 0.3 * b;
  if (hammerShape && down(i)) out.push("hammer");
  if (hammerShape && up(i)) out.push("hanging_man");
  if (invShape && down(i)) out.push("inverted_hammer");
  if (invShape && up(i)) out.push("shooting_star");
  if (isDoji) {
    if (lower(i) >= 0.6 * r && upper(i) <= 0.1 * r && down(i)) out.push("dragonfly_doji");
    else if (upper(i) >= 0.6 * r && lower(i) <= 0.1 * r && up(i)) out.push("gravestone_doji");
    else out.push("doji");
  }
  if (b >= 0.9 * r && b >= 1.5 * avgBody) out.push(green(i) ? "bull_marubozu" : "bear_marubozu");

  // ---- two candles (i-1, i)
  const p = i - 1;
  if (down(p) && red(p) && green(i) && o(i) <= c(p) && c(i) >= o(p) && b > body(p)) out.push("bull_engulfing");
  if (up(p) && green(p) && red(i) && o(i) >= c(p) && c(i) <= o(p) && b > body(p)) out.push("bear_engulfing");
  if (down(p) && red(p) && big(p) && green(i) && o(i) > c(p) && c(i) < o(p) && b < body(p)) out.push("bull_harami");
  if (up(p) && green(p) && big(p) && red(i) && o(i) < c(p) && c(i) > o(p) && b < body(p)) out.push("bear_harami");
  const midP = (o(p) + c(p)) / 2;
  if (down(p) && red(p) && big(p) && green(i) && o(i) <= c(p) && c(i) > midP && c(i) < o(p)) out.push("piercing");
  if (up(p) && green(p) && big(p) && red(i) && o(i) >= c(p) && c(i) < midP && c(i) > o(p)) out.push("dark_cloud");
  const tol = c(i) * 0.003;
  if (down(p) && red(p) && green(i) && Math.abs(l(i) - l(p)) <= tol) out.push("tweezer_bottom");
  if (up(p) && green(p) && red(i) && Math.abs(h(i) - h(p)) <= tol) out.push("tweezer_top");

  // ---- three candles (i-2, i-1, i)
  const a = i - 2;
  const midA = (o(a) + c(a)) / 2;
  if (down(a) && red(a) && big(a) && body(p) <= 0.5 * avgBody && green(i) && c(i) > midA) out.push("morning_star");
  if (up(a) && green(a) && big(a) && body(p) <= 0.5 * avgBody && red(i) && c(i) < midA) out.push("evening_star");
  const soldier = (k: number, prev: number) =>
    green(k) && c(k) > c(prev) && o(k) >= o(prev) && o(k) <= c(prev) && body(k) >= 0.6 * avgBody && upper(k) <= 0.4 * body(k);
  if (green(a) && body(a) >= 0.6 * avgBody && soldier(p, a) && soldier(i, p)) out.push("three_white");
  const crow = (k: number, prev: number) =>
    red(k) && c(k) < c(prev) && o(k) <= o(prev) && o(k) >= c(prev) && body(k) >= 0.6 * avgBody && lower(k) <= 0.4 * body(k);
  if (red(a) && body(a) >= 0.6 * avgBody && crow(p, a) && crow(i, p)) out.push("three_black");

  return out;
}

/** "id@daysAgo" for every candle pattern completed in the last `days` bars, newest first. */
export function recentCandles(bars: SatsInputBar[], days = 5): string | null {
  const n = bars.length;
  const out: string[] = [];
  for (let k = n - 1; k >= Math.max(0, n - days); k -= 1) for (const id of candlesAt(bars, k)) out.push(`${id}@${n - 1 - k}`);
  return out.length ? out.join(",") : null;
}

// ───────────────────────────── chart patterns

function pivots(bars: SatsInputBar[], from: number, to: number, kind: "high" | "low", w = 3): number[] {
  const out: number[] = [];
  for (let k = Math.max(w, from); k <= to - w; k += 1) {
    const v = kind === "high" ? bars[k].high : bars[k].low;
    let ok = true;
    for (let j = k - w; j <= k + w && ok; j += 1) {
      if (j === k) continue;
      const x = kind === "high" ? bars[j].high : bars[j].low;
      if (kind === "high" ? x > v || (x === v && j < k) : x < v || (x === v && j < k)) ok = false;
    }
    if (ok) out.push(k);
  }
  return out;
}

const maxHigh = (bars: SatsInputBar[], a: number, b: number) => {
  let m = -Infinity;
  for (let k = a; k <= b; k += 1) m = Math.max(m, bars[k].high);
  return m;
};
const minLow = (bars: SatsInputBar[], a: number, b: number) => {
  let m = Infinity;
  for (let k = a; k <= b; k += 1) m = Math.min(m, bars[k].low);
  return m;
};

/**
 * "id:status" (status = forming | breakout) for chart patterns present at the last bar.
 * breakout = the close crossed the trigger level in the last 3 bars and is still above it.
 */
export function chartPatterns(bars: SatsInputBar[]): string | null {
  const n = bars.length;
  const i = n - 1;
  if (n < 90) return null;
  const c = (k: number) => bars[k].close;
  const out: string[] = [];
  const crossedUp = (level: number) => c(i) > level && Math.min(c(i - 1), c(i - 2), c(i - 3)) <= level;
  const crossedDown = (level: number) => c(i) < level && Math.max(c(i - 1), c(i - 2), c(i - 3)) >= level;

  // ---- Double bottom (W): two lows within 3%, 10–60 bars apart, middle peak ≥ 7% above, no lower low since
  {
    const lows = pivots(bars, i - 80, i, "low");
    if (lows.length >= 2) {
      const p2 = lows[lows.length - 1];
      const p1 = lows[lows.length - 2];
      const l1 = bars[p1].low;
      const l2 = bars[p2].low;
      const peak = maxHigh(bars, p1, p2);
      const base = Math.max(l1, l2);
      if (p2 - p1 >= 10 && p2 - p1 <= 60 && Math.abs(l2 - l1) / l1 <= 0.03 && peak >= base * 1.07 && minLow(bars, p2, i) >= Math.min(l1, l2) * 0.98) {
        if (crossedUp(peak)) out.push("double_bottom:breakout");
        else if (c(i) <= peak && c(i) > base) out.push("double_bottom:forming");
      }
    }
  }

  // ---- Double top (M): mirror — warning pattern; "breakout" = close broke below the middle trough
  {
    const highs = pivots(bars, i - 80, i, "high");
    if (highs.length >= 2) {
      const p2 = highs[highs.length - 1];
      const p1 = highs[highs.length - 2];
      const h1 = bars[p1].high;
      const h2 = bars[p2].high;
      const trough = minLow(bars, p1, p2);
      const top = Math.min(h1, h2);
      if (p2 - p1 >= 10 && p2 - p1 <= 60 && Math.abs(h2 - h1) / h1 <= 0.03 && trough <= top / 1.07 && maxHigh(bars, p2, i) <= Math.max(h1, h2) * 1.02) {
        if (crossedDown(trough)) out.push("double_top:breakout");
        else if (c(i) >= trough && c(i) < top) out.push("double_top:forming");
      }
    }
  }

  // ---- Ascending triangle: ≥ 2 pivot highs at the same level (±2%) + rising pivot lows, within 60 bars
  {
    const highs = pivots(bars, i - 60, i, "high");
    const lows = pivots(bars, i - 60, i, "low");
    if (highs.length >= 2 && lows.length >= 2) {
      const hs = highs.slice(-3).map((k) => bars[k].high);
      const res = Math.max(...hs);
      const flat = Math.min(...hs) >= res * 0.98;
      const lA = bars[lows[lows.length - 2]].low;
      const lB = bars[lows[lows.length - 1]].low;
      if (flat && lB >= lA * 1.03 && lB < res * 0.97) {
        if (crossedUp(res * 1.005)) out.push("asc_triangle:breakout");
        else if (c(i) >= res * 0.95 && c(i) <= res) out.push("asc_triangle:forming");
      }
    }
  }

  // ---- Bull flag: pole (+15% in ≤ 10 bars) ending 3–15 bars ago, then a pullback ≤ 50% of the pole on lower volume
  {
    let best: { top: number; gain: number; start: number } | null = null;
    for (let t = i - 15; t <= i - 3; t += 1) {
      for (let s = t - 10; s < t; s += 1) {
        const gain = c(t) / c(s) - 1;
        if (gain >= 0.15 && (!best || c(t) > c(best.top))) best = { top: t, gain, start: s };
      }
    }
    if (best && c(best.top) >= maxHigh(bars, best.top, i) * 0.98) {
      const t = best.top;
      const poleLow = c(best.start);
      const flagLow = minLow(bars, t + 1, i);
      const retrace = (c(t) - flagLow) / (c(t) - poleLow);
      let vPole = 0;
      let vFlag = 0;
      for (let k = best.start + 1; k <= t; k += 1) vPole += bars[k].volume ?? 0;
      for (let k = t + 1; k <= i; k += 1) vFlag += bars[k].volume ?? 0;
      vPole /= t - best.start;
      vFlag /= i - t;
      const flagHigh = maxHigh(bars, t + 1, i - 1);
      if (retrace >= 0.1 && retrace <= 0.5 && vFlag < vPole) {
        if (c(i) > flagHigh && c(i - 1) <= flagHigh) out.push("bull_flag:breakout");
        else out.push("bull_flag:forming");
      }
    }
  }
  return out.length ? out.join(",") : null;
}
