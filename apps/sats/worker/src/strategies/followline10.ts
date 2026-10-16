/**
 * Follow Line + MACD Shield V10 — V9 with logic fixes (no parameter changes):
 *  1. Line restarts when the trend flips (V9 kept the old line, so it could sit above price after a BUY).
 *  2. Exit on the CONDITION close < line (+ mode filter) instead of the one-bar crossunder event,
 *     so an exit is not missed when the filter confirms a few bars later.
 *  3. Exit when the trend turns down (close < lower Bollinger band), in every mode.
 *  4. Real stop: line − 0.5×ATR, only moves up; exit when the close is below the previous bar's stop.
 *  5. (Pine only) signals are printed on confirmed bars only — the EOD engine is confirmed by definition.
 * Entry is identical to V9. Exits happen at the close of the exit bar.
 */
import type { SatsInputBar } from "../sats/types";
import { atr, ema, macdHist, sma, stdev, type Series } from "./series";
import { FOLLOW_DEFAULT, type FollowParams } from "./followline";
import type { StratResult, StratSignal, StratTrade } from "./types";

export function runFollowLine10(bars: SatsInputBar[], p: FollowParams = FOLLOW_DEFAULT): StratResult & { line: Series } {
  const n = bars.length;
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => (b.volume == null ? NaN : b.volume));
  const atrv = atr(bars, p.atrLook);
  const basis = sma(close, p.bbPeriod);
  const sd = stdev(close, p.bbPeriod);
  const upper = basis.map((b, i) => b + p.bbDev * sd[i]);
  const lower = basis.map((b, i) => b - p.bbDev * sd[i]);
  const emaF = ema(close, p.emaFast);
  const emaS = ema(close, p.emaSlow);
  const hist = macdHist(close, 12, 26, 9);
  const volAvg = sma(volume, 20);

  const line: Series = new Array(n).fill(NaN);
  let trend = 0;
  let lineVal = NaN;
  let inPosition = false;
  let stop = NaN;

  const signals: StratSignal[] = [];
  const trades: StratTrade[] = [];
  let open: StratTrade | null = null;

  for (let i = 0; i < n; i += 1) {
    const prevTrend = trend;
    const prevLine = lineVal;
    if (i > 0 && close[i] > upper[i - 1]) trend = 1;
    else if (i > 0 && close[i] < lower[i - 1]) trend = -1;
    const flip = trend !== prevTrend;

    // [FIX 1] restart the line on a trend flip
    if (trend === 1) lineVal = flip || Number.isNaN(prevLine) ? bars[i].low - atrv[i] : Math.max(bars[i].low - atrv[i], prevLine);
    else if (trend === -1) lineVal = flip || Number.isNaN(prevLine) ? bars[i].high + atrv[i] : Math.min(bars[i].high + atrv[i], prevLine);
    line[i] = lineVal;

    const volActive = volume[i] > volAvg[i] * p.volMult;
    const bullishBar = close[i] > bars[i].open;
    const buyCond = !inPosition && trend === 1 && close[i] > emaF[i] && hist[i] > 0 && volActive && bullishBar;

    // [FIX 2] condition, not crossunder
    const below = close[i] < lineVal;
    const exitLine =
      p.mode === "Agresif" ? below : p.mode === "Aman" ? below && close[i] < emaS[i] : below && (close[i] < emaF[i] || hist[i] < 0);
    const exitTrend = trend === -1; // [FIX 3]
    const exitStop = close[i] < stop; // [FIX 4] stop of the previous bar (NaN when flat -> false)
    const sellCond = inPosition && (exitLine || exitTrend || exitStop);

    if (buyCond) inPosition = true;
    if (sellCond) inPosition = false;
    // [FIX 4] stop only moves up while in position
    const ref = lineVal - atrv[i] * 0.5;
    stop = buyCond ? ref : inPosition ? Math.max(stop, ref) : NaN;

    if (buyCond) {
      signals.push({ barIndex: i, side: "BUY", score: null });
      open = {
        entryBar: i, entry: close[i], sl: Number.isNaN(stop) ? null : stop, tp1: null, tp2: null, tp3: null, score: null,
        exitBar: null, exitReason: null, exitPrice: null, tp1Hit: false, tp2Hit: false, tp3Hit: false,
      };
      trades.push(open);
    }
    if (sellCond) {
      signals.push({ barIndex: i, side: "SELL", score: null });
      if (open) {
        open.exitBar = i;
        open.exitReason = exitStop && !exitLine && !exitTrend ? "SL" : "SELL";
        open.exitPrice = close[i];
        open = null;
      }
    }
  }
  const last = n - 1;
  return {
    signals,
    trades,
    trend: trend === 1 ? "BULLISH" : trend === -1 ? "BEARISH" : null,
    stopNow: open && !Number.isNaN(stop) ? stop : null,
    eventToday: trades.length && trades[trades.length - 1].exitBar === last && trades[trades.length - 1].exitReason === "SL" ? "SL" : null,
    line,
  };
}
