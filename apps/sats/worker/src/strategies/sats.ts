/**
 * SATS (engine in ../sats, TradingView parity) mapped to the common strategy shape,
 * plus "SATS + filter": BUY only when close > SMA200 and IHSG close > its SMA200.
 */
import type { SatsInputBar, SatsResult } from "../sats/types";
import { sma } from "./series";
import type { StratResult, StratSignal, StratTrade } from "./types";

export function fromSats(bars: SatsInputBar[], r: SatsResult): StratResult {
  const signals: StratSignal[] = r.signalHistory.map((s) => ({
    barIndex: s.barIndex,
    side: s.signal,
    score: s.score.total ?? null,
  }));

  const trades: StratTrade[] = [];
  for (const s of r.signalHistory) {
    if (s.signal !== "BUY" || !s.trade) continue;
    const closed = r.closedTrades.find((t) => t.entryBar === s.barIndex && t.direction === "BUY");
    const t = closed ?? (r.trade && r.trade.entryBar === s.barIndex ? r.trade : s.trade);
    const trade: StratTrade = {
      entryBar: s.barIndex, entry: t.entry, sl: t.sl, tp1: t.tp1, tp2: t.tp2, tp3: t.tp3, score: s.score.total ?? null,
      exitBar: null, exitReason: null, exitPrice: null, tp1Hit: t.tp1Hit, tp2Hit: t.tp2Hit, tp3Hit: t.tp3Hit,
    };
    if (closed) {
      const xb = bars[closed.exitBar];
      trade.exitBar = closed.exitBar;
      if (closed.reason === "SL") {
        trade.exitReason = "SL";
        trade.exitPrice = Math.min(xb.open, closed.sl); // gap down through SL fills at the open
      } else if (closed.reason === "TP3") {
        trade.exitReason = "TP3";
        trade.exitPrice = Math.max(xb.open, closed.tp3);
      } else if (closed.reason === "REPLACED") {
        trade.exitReason = "SELL"; // closed by the SATS SELL signal
        trade.exitPrice = xb.close;
      } else {
        trade.exitReason = "TIMEOUT";
        trade.exitPrice = xb.close;
      }
    } else if (!(r.trade && r.trade.entryBar === s.barIndex)) {
      continue; // no record (should not happen)
    }
    trades.push(trade);
  }

  const last = r.bars[r.bars.length - 1];
  const ev = last?.tradeEvent;
  const openBuy = r.trade && r.trade.direction === "BUY" ? r.trade : null;
  // Only events of BUY positions (SELL = exit signal on IDX, its short levels are not used).
  const evIsBuy = ev ? (ev.closed ? ev.closed.direction === "BUY" : openBuy != null) : false;
  const eventToday = evIsBuy
    ? [ev!.tp1HitNow && "TP1", ev!.tp2HitNow && "TP2", ev!.tp3HitNow && "TP3", ev!.slHitNow && "SL"].filter(Boolean).join(",") || null
    : null;

  return {
    signals,
    trades,
    trend: r.trend,
    stopNow: openBuy ? openBuy.sl : null,
    eventToday,
  };
}

/** Per-bar filter: close > SMA200(close) and IHSG above its SMA200 on that date. */
export function satsFilterMask(bars: SatsInputBar[], ihsgAbove: (time: number) => boolean | null): boolean[] {
  const close = bars.map((b) => b.close);
  const ma = sma(close, 200);
  return bars.map((b, i) => !Number.isNaN(ma[i]) && b.close > ma[i] && ihsgAbove(b.time) === true);
}

/**
 * Per-bar filter for "SATS + dekat high 52M" (Lab Uji winner): close > SMA200 and close within 5% of the
 * highest high of the last 252 bars (same definition as the screener's dist_high52 >= -5%).
 */
export function nearHighMask(bars: SatsInputBar[]): boolean[] {
  const close = bars.map((b) => b.close);
  const ma = sma(close, 200);
  return bars.map((b, i) => {
    if (Number.isNaN(ma[i]) || b.close <= ma[i]) return false;
    let hi = -Infinity;
    for (let k = Math.max(0, i - 251); k <= i; k += 1) hi = Math.max(hi, bars[k].high);
    return b.close >= hi * 0.95;
  });
}

/**
 * Keep SATS BUYs that pass the filter (and their trades); keep a SELL only when it follows a kept BUY.
 */
export function applyFilter(base: StratResult, mask: boolean[]): StratResult {
  const signals: StratSignal[] = [];
  let lastKept: "BUY" | "SELL" | null = null;
  const keptBuyBars = new Set<number>();
  for (const s of base.signals) {
    if (s.side === "BUY" && mask[s.barIndex]) {
      signals.push(s);
      keptBuyBars.add(s.barIndex);
      lastKept = "BUY";
    } else if (s.side === "SELL" && lastKept === "BUY") {
      signals.push(s);
      lastKept = "SELL";
    }
  }
  const trades = base.trades.filter((t) => keptBuyBars.has(t.entryBar));
  const lastTrade = trades[trades.length - 1];
  const baseLastTrade = base.trades[base.trades.length - 1];
  const sameOpen = lastTrade && baseLastTrade && lastTrade === baseLastTrade && lastTrade.exitBar == null;
  const eventOnKept =
    lastTrade && baseLastTrade && lastTrade === baseLastTrade ? base.eventToday : null;
  return {
    signals,
    trades,
    trend: base.trend,
    stopNow: sameOpen ? base.stopNow : null,
    eventToday: eventOnKept,
  };
}
