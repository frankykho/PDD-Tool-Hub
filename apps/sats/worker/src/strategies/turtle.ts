/**
 * Turtle-style breakout (Donchian), daily, long only.
 *   BUY  : close > highest high of the previous 20 bars
 *   Stop : entry − 2 × ATR(20) (fixed). Hit intraday (low ≤ stop) -> exit at min(open, stop)
 *   Exit : close < lowest low of the previous 10 bars -> exit at the close
 * stopNow = max(stop, lowest low of the last 10 bars incl. today) = level to watch for tomorrow.
 */
import type { SatsInputBar } from "../sats/types";
import { atr, highestPrev, lowestPrev } from "./series";
import type { StratResult, StratSignal, StratTrade } from "./types";

export interface TurtleParams {
  entry: number;
  exit: number;
  atrLen: number;
  stopAtr: number;
}
export const TURTLE_DEFAULT: TurtleParams = { entry: 20, exit: 10, atrLen: 20, stopAtr: 2 };

export function runTurtle(bars: SatsInputBar[], p: TurtleParams = TURTLE_DEFAULT): StratResult {
  const n = bars.length;
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const N = atr(bars, p.atrLen);
  const hh = highestPrev(highs, p.entry);
  const ll = lowestPrev(lows, p.exit);

  const signals: StratSignal[] = [];
  const trades: StratTrade[] = [];
  let open: StratTrade | null = null;
  let eventLast: string | null = null;

  for (let i = 0; i < n; i += 1) {
    const b = bars[i];
    if (open) {
      if (b.low <= (open.sl as number)) {
        open.exitBar = i;
        open.exitReason = "SL";
        open.exitPrice = Math.min(b.open, open.sl as number);
        signals.push({ barIndex: i, side: "SELL", score: null });
        if (i === n - 1) eventLast = "SL";
        open = null;
      } else if (b.close < ll[i]) {
        open.exitBar = i;
        open.exitReason = "SELL";
        open.exitPrice = b.close;
        signals.push({ barIndex: i, side: "SELL", score: null });
        open = null;
      }
      continue; // no re-entry on the exit bar
    }
    if (!Number.isNaN(N[i]) && b.close > hh[i]) {
      open = {
        entryBar: i, entry: b.close, sl: b.close - p.stopAtr * N[i], tp1: null, tp2: null, tp3: null, score: null,
        exitBar: null, exitReason: null, exitPrice: null, tp1Hit: false, tp2Hit: false, tp3Hit: false,
      };
      trades.push(open);
      signals.push({ barIndex: i, side: "BUY", score: null });
    }
  }

  let stopNow: number | null = null;
  if (open) {
    let ll10 = Infinity;
    for (let k = Math.max(0, n - p.exit); k < n; k += 1) ll10 = Math.min(ll10, lows[k]);
    stopNow = Math.max(open.sl as number, ll10);
  }
  return { signals, trades, trend: open ? "BULLISH" : null, stopNow, eventToday: eventLast };
}
