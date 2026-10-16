/**
 * Pine-style series helpers. Every function returns one value per bar; NaN = Pine `na`.
 * NaN also mimics Pine comparisons: any comparison with na is false.
 */
import type { SatsInputBar } from "../sats/types";

export type Series = number[];

export const nz = (v: number, fallback = 0) => (Number.isNaN(v) ? fallback : v);

/** ta.tr(true) → ta.rma(tr, len) = ta.atr(len). na for the first len-1 bars. */
export function atr(bars: SatsInputBar[], length: number): Series {
  const out: Series = new Array(bars.length).fill(NaN);
  let prev = NaN;
  let seed = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i];
    const tr =
      i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close));
    if (i < length - 1) {
      seed += tr;
    } else if (i === length - 1) {
      seed += tr;
      prev = seed / length;
      out[i] = prev;
    } else {
      prev = (prev * (length - 1) + tr) / length;
      out[i] = prev;
    }
  }
  return out;
}

/** ta.sma — na until `length` non-na values are available in the window. */
export function sma(src: Series, length: number): Series {
  const out: Series = new Array(src.length).fill(NaN);
  for (let i = length - 1; i < src.length; i += 1) {
    let s = 0;
    let ok = true;
    for (let k = i - length + 1; k <= i; k += 1) {
      if (Number.isNaN(src[k])) {
        ok = false;
        break;
      }
      s += src[k];
    }
    if (ok) out[i] = s / length;
  }
  return out;
}

/** ta.stdev (biased = population, Pine default). */
export function stdev(src: Series, length: number): Series {
  const mean = sma(src, length);
  const out: Series = new Array(src.length).fill(NaN);
  for (let i = length - 1; i < src.length; i += 1) {
    if (Number.isNaN(mean[i])) continue;
    let s = 0;
    for (let k = i - length + 1; k <= i; k += 1) s += (src[k] - mean[i]) ** 2;
    out[i] = Math.sqrt(s / length);
  }
  return out;
}

/** ta.ema — seeded with the SMA of the first `length` non-na values (converges long before recent bars). */
export function ema(src: Series, length: number): Series {
  const out: Series = new Array(src.length).fill(NaN);
  const alpha = 2 / (length + 1);
  let prev = NaN;
  let run: number[] = [];
  for (let i = 0; i < src.length; i += 1) {
    const v = src[i];
    if (Number.isNaN(v)) {
      if (Number.isNaN(prev)) run = [];
      continue;
    }
    if (Number.isNaN(prev)) {
      run.push(v);
      if (run.length === length) {
        prev = run.reduce((a, b) => a + b, 0) / length;
        out[i] = prev;
      }
    } else {
      prev = alpha * v + (1 - alpha) * prev;
      out[i] = prev;
    }
  }
  return out;
}

/** Highest/lowest of the `length` bars BEFORE bar i (i.e. ta.highest(src, length)[1]). */
export function highestPrev(src: Series, length: number): Series {
  const out: Series = new Array(src.length).fill(NaN);
  for (let i = length; i < src.length; i += 1) {
    let m = -Infinity;
    for (let k = i - length; k < i; k += 1) m = Math.max(m, src[k]);
    out[i] = m;
  }
  return out;
}

export function lowestPrev(src: Series, length: number): Series {
  const out: Series = new Array(src.length).fill(NaN);
  for (let i = length; i < src.length; i += 1) {
    let m = Infinity;
    for (let k = i - length; k < i; k += 1) m = Math.min(m, src[k]);
    out[i] = m;
  }
  return out;
}

/** ta.macd(src, fast, slow, signal) -> histogram */
export function macdHist(src: Series, fast: number, slow: number, signal: number): Series {
  const f = ema(src, fast);
  const s = ema(src, slow);
  const line = src.map((_, i) => f[i] - s[i]);
  const sig = ema(line, signal);
  return line.map((v, i) => v - sig[i]);
}

/** ta.crossover(a, b) at bar i: a > b and a[1] <= b[1] (false if any value is na). */
export const crossover = (a: Series, b: Series, i: number) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
export const crossunder = (a: Series, b: Series, i: number) => i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1];
