/**
 * Supertrend (Pine v4 script "Supertrend", KivancOzbilgic-style), ported line by line.
 *   src = hl2, atr = changeATR ? atr(P) (RMA) : sma(tr, P)
 *   up := close[1] > up1 ? max(up, up1) : up        (up1 = nz(up[1], up))
 *   dn := close[1] < dn1 ? min(dn, dn1) : dn        (dn1 = nz(dn[1], dn))
 *   trend := trend == -1 and close > dn1 ? 1 : trend == 1 and close < up1 ? -1 : trend
 * Long only: BUY on flip up, exit at the close of the flip down.
 */
import type { SatsInputBar } from "../sats/types";
import { atr as atrRma, sma, type Series } from "./series";
import type { StratResult, StratSignal, StratTrade } from "./types";

export interface SupertrendParams {
  period: number;
  multiplier: number;
  rmaAtr: boolean; // "Change ATR Calculation Method" (default true)
}
export const SUPERTREND_DEFAULT: SupertrendParams = { period: 10, multiplier: 3, rmaAtr: true };

export function runSupertrend(bars: SatsInputBar[], p: SupertrendParams = SUPERTREND_DEFAULT): StratResult & { line: Series } {
  const n = bars.length;
  const src = bars.map((b) => (b.high + b.low) / 2);
  let atr: Series;
  if (p.rmaAtr) atr = atrRma(bars, p.period);
  else {
    // v4 `tr` is na on the first bar
    const tr = bars.map((b, i) =>
      i === 0 ? NaN : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)),
    );
    atr = sma(tr, p.period);
  }
  const up: Series = new Array(n).fill(NaN);
  const dn: Series = new Array(n).fill(NaN);
  const trendArr: number[] = new Array(n).fill(1);
  const line: Series = new Array(n).fill(NaN);

  const signals: StratSignal[] = [];
  const trades: StratTrade[] = [];
  let open: StratTrade | null = null;

  for (let i = 0; i < n; i += 1) {
    const upRaw = src[i] - p.multiplier * atr[i];
    const dnRaw = src[i] + p.multiplier * atr[i];
    const up1 = i > 0 && !Number.isNaN(up[i - 1]) ? up[i - 1] : upRaw;
    const dn1 = i > 0 && !Number.isNaN(dn[i - 1]) ? dn[i - 1] : dnRaw;
    const c1 = i > 0 ? bars[i - 1].close : NaN;
    up[i] = c1 > up1 ? Math.max(upRaw, up1) : upRaw;
    dn[i] = c1 < dn1 ? Math.min(dnRaw, dn1) : dnRaw;

    const prev = i > 0 ? trendArr[i - 1] : 1;
    const c = bars[i].close;
    const trend = prev === -1 && c > dn1 ? 1 : prev === 1 && c < up1 ? -1 : prev;
    trendArr[i] = trend;
    line[i] = trend === 1 ? up[i] : dn[i];

    if (i > 0 && trend === 1 && prev === -1) {
      signals.push({ barIndex: i, side: "BUY", score: null });
      open = {
        entryBar: i, entry: c, sl: Number.isNaN(up[i]) ? null : up[i], tp1: null, tp2: null, tp3: null, score: null,
        exitBar: null, exitReason: null, exitPrice: null, tp1Hit: false, tp2Hit: false, tp3Hit: false,
      };
      trades.push(open);
    } else if (i > 0 && trend === -1 && prev === 1) {
      signals.push({ barIndex: i, side: "SELL", score: null });
      if (open) {
        open.exitBar = i;
        open.exitReason = "SELL";
        open.exitPrice = c;
        open = null;
      }
    }
  }
  const last = n - 1;
  return {
    signals,
    trades,
    trend: trendArr[last] === 1 ? "BULLISH" : "BEARISH",
    stopNow: open && !Number.isNaN(up[last]) ? up[last] : null,
    eventToday: null,
    line,
  };
}
