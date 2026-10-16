/**
 * Follow Line + MACD Shield V9 UNIVERSAL (Pine v6 script supplied by Franky), ported line by line.
 * Defaults: mode Adaptive, BB 21 / 1.15, ATR 7, EMA 50/100, volume filter 1.2 × SMA20(volume).
 * Stateful (inPosition): BUY only when flat, EXIT only when in position. Exit at the close of the EXIT bar.
 * The script has no hard stop: "SL Reference" (line − 0.5 ATR) is only drawn, so it is shown as stop reference.
 */
import type { SatsInputBar } from "../sats/types";
import { atr, crossunder, ema, macdHist, nz, sma, stdev, type Series } from "./series";
import type { StratResult, StratSignal, StratTrade } from "./types";

export type FollowMode = "Agresif" | "Adaptive" | "Aman";
export interface FollowParams {
  mode: FollowMode;
  bbPeriod: number;
  bbDev: number;
  atrLook: number;
  emaFast: number;
  emaSlow: number;
  volMult: number;
}
export const FOLLOW_DEFAULT: FollowParams = {
  mode: "Adaptive", bbPeriod: 21, bbDev: 1.15, atrLook: 7, emaFast: 50, emaSlow: 100, volMult: 1.2,
};

export function runFollowLine(bars: SatsInputBar[], p: FollowParams = FOLLOW_DEFAULT): StratResult & { line: Series } {
  const n = bars.length;
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => (b.volume == null ? NaN : b.volume));
  const atrv = atr(bars, p.atrLook);
  const basis = sma(close, p.bbPeriod);
  const sd = stdev(close, p.bbPeriod);
  const upper = basis.map((b, i) => b + p.bbDev * sd[i]);
  const lower = basis.map((b, i) => b - p.bbDev * sd[i]);
  const ema50 = ema(close, p.emaFast);
  const ema100 = ema(close, p.emaSlow);
  const hist = macdHist(close, 12, 26, 9);
  const volAvg = sma(volume, 20);

  const line: Series = new Array(n).fill(NaN);
  const trendArr: number[] = new Array(n).fill(0);
  let trend = 0;
  let lineVal = NaN;
  let inPosition = false;

  const signals: StratSignal[] = [];
  const trades: StratTrade[] = [];
  let open: StratTrade | null = null;
  let slLevel = NaN;

  for (let i = 0; i < n; i += 1) {
    const prevLine = lineVal; // line_val[1]
    if (i > 0 && close[i] > upper[i - 1]) trend = 1;
    else if (i > 0 && close[i] < lower[i - 1]) trend = -1;

    if (trend === 1) lineVal = Math.max(bars[i].low - atrv[i], nz(prevLine));
    else if (trend === -1) lineVal = Math.min(bars[i].high + atrv[i], nz(prevLine));
    line[i] = lineVal;
    trendArr[i] = trend;

    const volActive = volume[i] > volAvg[i] * p.volMult;
    const bullishBar = close[i] > bars[i].open;
    const buyCond = !inPosition && trend === 1 && close[i] > ema50[i] && hist[i] > 0 && volActive && bullishBar;

    const cu = crossunder(close, line, i);
    const exitAgresif = cu;
    const exitAman = cu && (close[i] < ema100[i] || trend === -1);
    const exitAdaptive = cu && (close[i] < ema50[i] || hist[i] < 0);
    const exit = p.mode === "Agresif" ? exitAgresif : p.mode === "Aman" ? exitAman : exitAdaptive;
    const sellCond = inPosition && exit;

    if (buyCond) inPosition = true;
    if (sellCond) inPosition = false;
    slLevel = inPosition ? lineVal - atrv[i] * 0.5 : NaN;

    if (buyCond) {
      signals.push({ barIndex: i, side: "BUY", score: null });
      open = {
        entryBar: i, entry: close[i], sl: Number.isNaN(slLevel) ? null : slLevel, tp1: null, tp2: null, tp3: null, score: null,
        exitBar: null, exitReason: null, exitPrice: null, tp1Hit: false, tp2Hit: false, tp3Hit: false,
      };
      trades.push(open);
    }
    if (sellCond) {
      signals.push({ barIndex: i, side: "SELL", score: null });
      if (open) {
        open.exitBar = i;
        open.exitReason = "SELL";
        open.exitPrice = close[i];
        open = null;
      }
    }
  }
  const last = n - 1;
  return {
    signals,
    trades,
    trend: trendArr[last] === 1 ? "BULLISH" : trendArr[last] === -1 ? "BEARISH" : null,
    stopNow: open && !Number.isNaN(slLevel) ? slLevel : null,
    eventToday: null,
    line,
  };
}
