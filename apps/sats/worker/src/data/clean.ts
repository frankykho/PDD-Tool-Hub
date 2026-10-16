/**
 * Yahoo daily bars -> cleaned bars + a list of what was fixed.
 *
 * IDX cannot move more than its auto-rejection limit in one session (max ±35%), so a one-day move far beyond that is
 * either a data error or an unadjusted corporate action:
 *   1. broken OHLC (high < close, price <= 0)           -> repaired / dropped
 *   2. jump that matches a split ratio and stays        -> earlier bars adjusted (Yahoo sometimes adjusts days late)
 *   3. jump of > 45% that reverts the next day           -> bar dropped (bad print)
 *   4. any other move outside ±45%                       -> kept, reported (e.g. reopening after a long suspension)
 */
import type { SatsInputBar } from "../sats/types";

export interface CleanResult {
  bars: SatsInputBar[];
  issues: string[];
}

const SPLIT_RATIOS = [2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 40, 50, 100];
const EXTREME = 0.45; // one-day move beyond this cannot be a normal IDX session
const REVERT = 0.12; // "came back": next close within ±12% of the close before the spike

const day = (t: number) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);

/** Split factor (>1 = split, <1 = reverse split) that explains a close-to-close ratio, or null. */
function splitFactor(prev: number, cur: number): number | null {
  const f = prev / cur;
  for (const r of SPLIT_RATIOS) {
    if (Math.abs(f / r - 1) <= 0.06) return r;
    if (Math.abs(f * r - 1) <= 0.06) return 1 / r;
  }
  return null;
}

export function cleanBars(input: SatsInputBar[]): CleanResult {
  const issues: string[] = [];

  // 1. OHLC sanity
  let bars = input
    .filter((b) => b.close > 0 && b.open > 0 && b.high > 0 && b.low > 0)
    .map((b) => {
      const high = Math.max(b.open, b.high, b.low, b.close);
      const low = Math.min(b.open, b.high, b.low, b.close);
      return high === b.high && low === b.low ? b : { ...b, high, low };
    });
  if (bars.length < input.length) issues.push(`${input.length - bars.length} bar harga 0/negatif dibuang`);

  // 2 + 3 + 4. extreme one-day moves
  const out: SatsInputBar[] = [];
  for (let k = 0; k < bars.length; k += 1) {
    const b = bars[k];
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(b);
      continue;
    }
    const move = b.close / prev.close - 1;
    if (Math.abs(move) <= EXTREME) {
      out.push(b);
      continue;
    }
    const next = bars[k + 1];
    if (next && Math.abs(next.close / prev.close - 1) <= REVERT) {
      issues.push(`${day(b.time)}: lonjakan ${(move * 100).toFixed(0)}% yang langsung kembali — bar dibuang`);
      continue;
    }
    const f = splitFactor(prev.close, b.close);
    if (f != null && (!next || Math.abs(next.close / b.close - 1) <= 0.35)) {
      for (let j = 0; j < out.length; j += 1) {
        const x = out[j];
        out[j] = { ...x, open: x.open / f, high: x.high / f, low: x.low / f, close: x.close / f, volume: x.volume == null ? null : x.volume * f };
      }
      issues.push(
        `${day(b.time)}: ${f > 1 ? `stock split 1:${f}` : `reverse split ${Math.round(1 / f)}:1`} belum disesuaikan Yahoo — harga sebelumnya dikoreksi`,
      );
      out.push(b);
      continue;
    }
    issues.push(`${day(b.time)}: gerak ${(move * 100).toFixed(0)}% dalam sehari (di luar batas ARA/ARB) — dibiarkan, cek manual`);
    out.push(b);
  }
  bars = out;
  return { bars, issues };
}
