/**
 * UT Bot Alerts (Pine v4 script supplied by Franky), ported line by line.
 *   a = 1 (key value), c = 10 (ATR period), Heikin Ashi = false
 * BUY  = src > stop and crossover(ema(src,1) = src, stop)
 * SELL = src < stop and crossover(stop, src)
 * Long-only: BUY opens, the next SELL closes (at the close). No stop/target exits in the script.
 */
import type { SatsInputBar } from "../sats/types";
import { atr, crossover, nz, type Series } from "./series";
import type { StratResult, StratSignal, StratTrade } from "./types";

export interface UtBotParams {
  key: number;
  atrPeriod: number;
}
export const UTBOT_DEFAULT: UtBotParams = { key: 1, atrPeriod: 10 };

export function runUtBot(bars: SatsInputBar[], p: UtBotParams = UTBOT_DEFAULT): StratResult & { stop: Series; pos: number[] } {
  const n = bars.length;
  const src = bars.map((b) => b.close);
  const xATR = atr(bars, p.atrPeriod);
  const stop: Series = new Array(n).fill(NaN);
  const pos: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i += 1) {
    const nLoss = p.key * xATR[i];
    const prev = i > 0 ? stop[i - 1] : NaN;
    const p0 = nz(prev, 0);
    const s = src[i];
    const s1 = i > 0 ? src[i - 1] : NaN;
    // iff(src > nz(stop[1]) and src[1] > nz(stop[1]), max(nz(stop[1]), src - nLoss), iff(... < ..., min(...), iff(src > nz(stop[1]), src - nLoss, src + nLoss)))
    if (s > p0 && s1 > p0) stop[i] = Math.max(nz(prev), s - nLoss);
    else if (s < p0 && s1 < p0) stop[i] = Math.min(nz(prev), s + nLoss);
    else stop[i] = s > p0 ? s - nLoss : s + nLoss;

    // pos := iff(src[1] < nz(stop[1]) and src > nz(stop[1]), 1, iff(src[1] > nz(stop[1]) and src < nz(stop[1]), -1, nz(pos[1])))
    if (s1 < p0 && s > p0) pos[i] = 1;
    else if (s1 > p0 && s < p0) pos[i] = -1;
    else pos[i] = i > 0 ? pos[i - 1] : 0;
  }

  const signals: StratSignal[] = [];
  const trades: StratTrade[] = [];
  let open: StratTrade | null = null;
  for (let i = 0; i < n; i += 1) {
    const buy = src[i] > stop[i] && crossover(src, stop, i);
    const sell = src[i] < stop[i] && crossover(stop, src, i);
    if (buy) {
      signals.push({ barIndex: i, side: "BUY", score: null });
      if (!open) {
        open = {
          entryBar: i, entry: src[i], sl: Number.isNaN(stop[i]) ? null : stop[i], tp1: null, tp2: null, tp3: null, score: null,
          exitBar: null, exitReason: null, exitPrice: null, tp1Hit: false, tp2Hit: false, tp3Hit: false,
        };
        trades.push(open);
      }
    } else if (sell) {
      signals.push({ barIndex: i, side: "SELL", score: null });
      if (open) {
        open.exitBar = i;
        open.exitReason = "SELL";
        open.exitPrice = src[i];
        open = null;
      }
    }
  }
  const last = n - 1;
  return {
    signals,
    trades,
    trend: pos[last] === 1 ? "BULLISH" : pos[last] === -1 ? "BEARISH" : null,
    stopNow: open && !Number.isNaN(stop[last]) ? stop[last] : null,
    eventToday: null,
    stop,
    pos,
  };
}
