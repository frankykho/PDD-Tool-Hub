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

export type ChartId =
  | "double_bottom" | "double_top" | "asc_triangle" | "bull_flag"
  | "cup_handle" | "inv_hs" | "hs_top" | "falling_wedge" | "rising_wedge" | "sym_triangle" | "channel_up"
  | "rounding_bottom" | "wyckoff_accum" | "new_uptrend" | "channel_down" | "desc_triangle" | "bear_flag" | "vcp";

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
const argMinLow = (bars: SatsInputBar[], a: number, b: number) => {
  let m = a;
  for (let k = a + 1; k <= b; k += 1) if (bars[k].low < bars[m].low) m = k;
  return m;
};
const argMaxHigh = (bars: SatsInputBar[], a: number, b: number) => {
  let m = a;
  for (let k = a + 1; k <= b; k += 1) if (bars[k].high > bars[m].high) m = k;
  return m;
};

/** Least-squares line through (x, y) points. */
function fitLine(pts: Array<[number, number]>): { m: number; b: number } {
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const d = n * sxx - sx * sx;
  const m = d === 0 ? 0 : (n * sxy - sx * sy) / d;
  return { m, b: (sy - m * sx) / n };
}
const lineAt = (f: { m: number; b: number }, x: number) => f.m * x + f.b;

/** Line through two points, value at x. */
const line2 = (x1: number, y1: number, x2: number, y2: number, x: number) => y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);

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

  // ---- Descending triangle (warning): ≥ 2 pivot lows at the same level (±2%) + falling pivot highs, within 60 bars.
  // "Breakout" = close below the support.
  {
    const highs = pivots(bars, i - 60, i, "high");
    const lows = pivots(bars, i - 60, i, "low");
    if (highs.length >= 2 && lows.length >= 2) {
      const ls = lows.slice(-3).map((k) => bars[k].low);
      const sup = Math.min(...ls);
      const flat = Math.max(...ls) <= sup * 1.02;
      const hA = bars[highs[highs.length - 2]].high;
      const hB = bars[highs[highs.length - 1]].high;
      if (flat && hB <= hA / 1.03 && hB > sup * 1.03) {
        if (crossedDown(sup * 0.995)) out.push("desc_triangle:breakout");
        else if (c(i) >= sup && c(i) <= sup * 1.05) out.push("desc_triangle:forming");
      }
    }
  }

  // ---- Bear flag (warning): drop ≥ 15% in ≤ 10 bars ending 3–15 bars ago, then a bounce of 10–50% on lower volume.
  // "Breakout" = close below the flag low.
  {
    let best: { bottom: number; start: number } | null = null;
    for (let t = i - 15; t <= i - 3; t += 1) {
      for (let s = t - 10; s < t; s += 1) {
        if (c(t) / c(s) - 1 <= -0.15 && (!best || c(t) < c(best.bottom))) best = { bottom: t, start: s };
      }
    }
    if (best && c(best.bottom) <= minLow(bars, best.bottom, i) * 1.02) {
      const t = best.bottom;
      const poleHigh = c(best.start);
      const flagHigh = maxHigh(bars, t + 1, i);
      const bounce = (flagHigh - c(t)) / (poleHigh - c(t));
      let vPole = 0;
      let vFlag = 0;
      for (let k = best.start + 1; k <= t; k += 1) vPole += bars[k].volume ?? 0;
      for (let k = t + 1; k <= i; k += 1) vFlag += bars[k].volume ?? 0;
      vPole /= t - best.start;
      vFlag /= i - t;
      const flagLow = minLow(bars, t + 1, i - 1);
      if (bounce >= 0.1 && bounce <= 0.5 && vFlag < vPole) {
        if (c(i) < flagLow && c(i - 1) >= flagLow) out.push("bear_flag:breakout");
        else out.push("bear_flag:forming");
      }
    }
  }

  // ---- Cup & handle (O'Neil): rims ±5% apart 30–120 bars, U-shaped cup 12–35% deep (bottom in the middle 60%,
  // ≥ 15% of the cup near the bottom = not a V), then a handle 5–25 bars long that pulls back 3–15% and stays in the
  // upper half of the cup. Breakout = close above the right rim.
  if (i >= 150) {
    const highs = pivots(bars, i - 145, i, "high", 5);
    const R = highs.filter((k) => k >= i - 25).at(-1);
    if (R != null) {
      const rimR = bars[R].high;
      for (const L of highs.filter((k) => R - k >= 30 && R - k <= 120).reverse()) {
        const rimL = bars[L].high;
        if (Math.abs(rimL - rimR) / rimL > 0.05) continue;
        const top = Math.max(rimL, rimR);
        if (maxHigh(bars, L + 1, R - 1) > top * 1.02) continue;
        const kb = argMinLow(bars, L, R);
        const bottom = bars[kb].low;
        const depth = 1 - bottom / top;
        const pos = (kb - L) / (R - L);
        if (depth < 0.12 || depth > 0.35 || pos < 0.2 || pos > 0.8) continue;
        let nearBottom = 0;
        for (let k = L; k <= R; k += 1) if (c(k) <= bottom + (top - bottom) / 3) nearBottom += 1;
        if (nearBottom < 0.15 * (R - L)) continue;
        const handleLow = minLow(bars, R + 1, i);
        const pull = 1 - handleLow / rimR;
        // handle 0–15% deep (0 = the handle has only just started; breakout still needs the close above the rim)
        if (pull <= 0.15 && handleLow >= bottom + (top - bottom) / 2) {
          if (crossedUp(rimR)) out.push("cup_handle:breakout");
          else if (c(i) <= rimR) out.push("cup_handle:forming");
        }
        break;
      }
    }
  }

  // ---- Head & shoulders top / inverse: 3 consecutive pivots, head ≥ 3% beyond both shoulders, shoulders within 5%,
  // 5–40 bars apart, after a ≥ 10% move into the pattern. Trigger = neckline through the two troughs (peaks).
  if (i >= 120) {
    const hs = (kind: "high" | "low") => {
      const piv = pivots(bars, i - 80, i, kind);
      if (piv.length < 3) return null;
      const [p1, p2, p3] = piv.slice(-3);
      if (p2 - p1 < 5 || p2 - p1 > 40 || p3 - p2 < 5 || p3 - p2 > 40 || i - p3 > 25) return null;
      const v = (k: number) => (kind === "high" ? bars[k].high : bars[k].low);
      const [s1, hd, s2] = [v(p1), v(p2), v(p3)];
      if (Math.abs(s1 - s2) / s1 > 0.05) return null;
      if (kind === "high" ? hd < Math.max(s1, s2) * 1.03 : hd > Math.min(s1, s2) / 1.03) return null;
      const before = c(Math.max(0, p1 - 30));
      if (kind === "high" ? s1 < before * 1.1 : s1 > before / 1.1) return null;
      const t1 = kind === "high" ? argMinLow(bars, p1, p2) : argMaxHigh(bars, p1, p2);
      const t2 = kind === "high" ? argMinLow(bars, p2, p3) : argMaxHigh(bars, p2, p3);
      const tv = (k: number) => (kind === "high" ? bars[k].low : bars[k].high);
      return { neck: line2(t1, tv(t1), t2, tv(t2), i), s2 };
    };
    const top = hs("high");
    if (top) {
      if (crossedDown(top.neck)) out.push("hs_top:breakout");
      else if (c(i) > top.neck && c(i) < top.s2 * 1.02) out.push("hs_top:forming");
    }
    const inv = hs("low");
    if (inv) {
      if (crossedUp(inv.neck)) out.push("inv_hs:breakout");
      else if (c(i) < inv.neck && c(i) > inv.s2 / 1.02) out.push("inv_hs:forming");
    }
  }

  // ---- Wedges, symmetrical triangle, channel: trendlines fitted through the last 3–4 pivot highs and lows of the
  // last 60 bars. Slopes in % of price per bar. Converging = the gap at the last bar is < 70% of the gap at the start.
  if (i >= 90) {
    const ph = pivots(bars, i - 60, i, "high").slice(-4);
    const pl = pivots(bars, i - 60, i, "low").slice(-4);
    if (ph.length >= 3 && pl.length >= 3) {
      const up = fitLine(ph.map((k) => [k, bars[k].high]));
      const lo = fitLine(pl.map((k) => [k, bars[k].low]));
      const start = Math.min(ph[0], pl[0]);
      const sh = (up.m / c(i)) * 100;
      const sl = (lo.m / c(i)) * 100;
      const gap0 = lineAt(up, start) - lineAt(lo, start);
      const gapI = lineAt(up, i) - lineAt(lo, i);
      const upperI = lineAt(up, i);
      const lowerI = lineAt(lo, i);
      const converging = gap0 > 0 && gapI > 0 && gapI < 0.7 * gap0;
      const inside = c(i) <= upperI && c(i) >= lowerI;
      if (converging && sh < -0.05 && sl < 0 && sh < sl) {
        if (crossedUp(upperI)) out.push("falling_wedge:breakout");
        else if (inside) out.push("falling_wedge:forming");
      }
      if (converging && sl > 0.05 && sh > 0 && sl > sh) {
        if (crossedDown(lowerI)) out.push("rising_wedge:breakout");
        else if (inside) out.push("rising_wedge:forming");
      }
      if (converging && sh < -0.05 && sl > 0.05) {
        if (crossedUp(upperI)) out.push("sym_triangle:breakout");
        else if (inside) out.push("sym_triangle:forming");
      }
      // channel: parallel lines (slopes within 0.05 %/bar), flat or rising, at least 6% wide
      const parallel = Math.abs(sh - sl) <= 0.05 && sl > -0.05 && gapI >= c(i) * 0.06 && gap0 > 0;
      if (parallel && !converging) {
        if (crossedUp(upperI)) out.push("channel_up:breakout");
        else if (c(i) <= upperI && c(i) >= (upperI + lowerI) / 2) out.push("channel_up:forming"); // upper half of the channel
      }
      // falling channel (both lines down, parallel): a close above the upper line ends the downtrend
      const fallingChannel = Math.abs(sh - sl) <= 0.05 && sh < -0.05 && sl < -0.05 && gapI >= c(i) * 0.06 && gap0 > 0;
      if (fallingChannel && !converging) {
        if (crossedUp(upperI)) out.push("channel_down:breakout");
        else if (c(i) <= upperI && c(i) >= upperI * 0.97) out.push("channel_down:forming"); // pressing on the upper line
      }
    }
  }

  // ---- Rounding bottom (saucer): parabola fitted to the last 100 closes opens upward (R² ≥ 0.7), lowest point in the
  // middle 40%, ≥ 15% below the left rim, price back in the upper 40%. Breakout = close above the left rim high.
  if (i >= 110) {
    const s = i - 100;
    let sx = 0, sx2 = 0, sx3 = 0, sx4 = 0, sy = 0, sxy = 0, sx2y = 0;
    const N = i - s + 1;
    for (let k = s; k <= i; k += 1) {
      const x = (k - s) / (N - 1);
      const y = c(k);
      sx += x; sx2 += x * x; sx3 += x ** 3; sx4 += x ** 4; sy += y; sxy += x * y; sx2y += x * x * y;
    }
    // normal equations for y = a x² + b x + d (Cramer's rule)
    const det3 = (m: number[][]) =>
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const M = [[sx4, sx3, sx2], [sx3, sx2, sx], [sx2, sx, N]];
    const D = det3(M);
    if (D !== 0) {
      const a = det3([[sx2y, sx3, sx2], [sxy, sx2, sx], [sy, sx, N]]) / D;
      const b = det3([[sx4, sx2y, sx2], [sx3, sxy, sx], [sx2, sy, N]]) / D;
      const d = det3([[sx4, sx3, sx2y], [sx3, sx2, sxy], [sx2, sx, sy]]) / D;
      const mean = sy / N;
      let ssRes = 0, ssTot = 0;
      for (let k = s; k <= i; k += 1) {
        const x = (k - s) / (N - 1);
        ssRes += (c(k) - (a * x * x + b * x + d)) ** 2;
        ssTot += (c(k) - mean) ** 2;
      }
      const vertex = a > 0 ? -b / (2 * a) : -1;
      const rim = maxHigh(bars, s, s + 10);
      const low = minLow(bars, s, i);
      if (a > 0 && ssTot > 0 && 1 - ssRes / ssTot >= 0.7 && vertex >= 0.3 && vertex <= 0.7 && low <= rim / 1.15 && c(i) >= low + 0.6 * (rim - low)) {
        if (crossedUp(rim)) out.push("rounding_bottom:breakout");
        else if (c(i) <= rim) out.push("rounding_bottom:forming");
      }
    }
  }

  // ---- Wyckoff accumulation: after a ≥ 20% decline, a 40-bar trading range (6–25% wide); a "spring" (low below the
  // range, close back inside) in the last 30 bars. Breakout (sign of strength) = close above the range high.
  if (i >= 130) {
    const hi = maxHigh(bars, i - 45, i - 6);
    const lo = minLow(bars, i - 45, i - 6);
    const width = hi / lo - 1;
    const priorHigh = maxHigh(bars, i - 125, i - 46);
    if (width >= 0.06 && width <= 0.25 && priorHigh >= hi * 1.25) {
      let spring = false;
      for (let k = i - 30; k <= i && !spring; k += 1) {
        if (bars[k].low < lo * 0.99) for (let j = k; j <= Math.min(i, k + 3); j += 1) if (c(j) > lo) spring = true;
      }
      if (spring && crossedUp(hi)) out.push("wyckoff_accum:breakout");
      else if (spring && c(i) > lo && c(i) <= hi) out.push("wyckoff_accum:forming");
    }
  }

  // ---- VCP (Minervini), swing-based: in an uptrend (close > MA50 > MA200, ≤ 25% below the 52-week high) a base starts at
  // its highest high of the last 120 bars; every pullback from a swing high to the next low is shallower than the one before
  // (e.g. 22% -> 11% -> 5%) with lows that hold (≥ the previous low − 2%), at least 2 of them, the first 8–40% deep, the last ≤ 12%, no new high above the base, volume
  // drying up (10-bar average < 50-bar average). Pivot = high of the last contraction: breakout = close above it.
  if (i >= 260) {
    const avg = (to: number, len: number) => {
      let sum = 0;
      for (let k = to - len + 1; k <= to; k += 1) sum += c(k);
      return sum / len;
    };
    const ma50 = avg(i, 50);
    const k0 = argMaxHigh(bars, i - 120, i - 15);
    const top = bars[k0].high;
    if (c(i) > ma50 && ma50 > avg(i, 200) && c(i) >= maxHigh(bars, i - 250, i) * 0.75 && maxHigh(bars, k0 + 1, i) <= top * 1.02) {
      const highs = [k0, ...pivots(bars, k0 + 1, i, "high").filter((k) => k > k0 + 2)];
      const depths: number[] = [];
      const lows: number[] = [];
      for (let j = 0; j < highs.length; j += 1) {
        const end = j + 1 < highs.length ? highs[j + 1] : i;
        lows.push(minLow(bars, highs[j], end));
        depths.push(1 - lows[j] / bars[highs[j]].high);
      }
      const lastLow = lows[lows.length - 1];
      // shallower each time, and the lows hold (equal or higher, 2% tolerance)
      let tighter = depths.length >= 2;
      for (let j = 1; j < depths.length && tighter; j += 1) if (depths[j] >= depths[j - 1] || lows[j] < lows[j - 1] * 0.98) tighter = false;
      let v10 = 0;
      let v50 = 0;
      for (let k = i - 9; k <= i; k += 1) v10 += bars[k].volume ?? 0;
      for (let k = i - 49; k <= i; k += 1) v50 += bars[k].volume ?? 0;
      const pivot = bars[highs[highs.length - 1]].high;
      if (tighter && depths[0] >= 0.08 && depths[0] <= 0.4 && depths[depths.length - 1] <= 0.12 && v10 / 10 < v50 / 50) {
        if (crossedUp(pivot)) out.push("vcp:breakout");
        else if (c(i) <= pivot && c(i) >= lastLow) out.push("vcp:forming");
      }
    }
  }

  // ---- New uptrend: below MA200 60 bars ago, now above MA50 and MA200 with higher highs and higher lows (last two
  // pivots); breakout = close above the latest pivot high, forming = within 5% below it.
  if (i >= 260) {
    const avg = (to: number, len: number) => {
      let sum = 0;
      for (let k = to - len + 1; k <= to; k += 1) sum += c(k);
      return sum / len;
    };
    const wasDown = c(i - 60) < avg(i - 60, 200);
    const ph = pivots(bars, i - 50, i, "high");
    const pl = pivots(bars, i - 50, i, "low");
    if (wasDown && c(i) > avg(i, 50) && c(i) > avg(i, 200) && ph.length >= 2 && pl.length >= 2) {
      const [h1, h2] = ph.slice(-2).map((k) => bars[k].high);
      const [l1, l2] = pl.slice(-2).map((k) => bars[k].low);
      if (h2 > h1 && l2 > l1) {
        if (crossedUp(h2)) out.push("new_uptrend:breakout");
        else if (c(i) <= h2 && c(i) >= h2 * 0.95) out.push("new_uptrend:forming"); // structure in place, within 5% of the last high
      }
    }
  }
  return out.length ? out.join(",") : null;
}
