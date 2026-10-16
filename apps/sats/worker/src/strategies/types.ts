/** Common output of every strategy, so pipeline, API and UI treat them the same way. */

/** Active strategies. Engines for Turtle, UT Bot and Follow Line V9/V10 stay in this folder (not registered). */
export type StrategyId = "SATS_F" | "SATS" | "SATS_H";

export type ExitReason = "SL" | "TP3" | "SELL" | "TIMEOUT";

export interface StratSignal {
  barIndex: number;
  side: "BUY" | "SELL";
  score: number | null;
}

/** A long position opened by a BUY. exitBar null = still open. */
export interface StratTrade {
  entryBar: number;
  entry: number;
  sl: number | null; // initial stop / stop reference at entry
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  score: number | null;
  exitBar: number | null;
  exitReason: ExitReason | null;
  exitPrice: number | null;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
}

export interface StratResult {
  signals: StratSignal[];
  trades: StratTrade[]; // BUY trades in order; only the last one can be open
  trend: "BULLISH" | "BEARISH" | null;
  stopNow: number | null; // current stop / trailing / exit reference of the open trade
  eventToday: string | null; // e.g. "TP1", "TP1,TP2", "SL"
}

export interface StrategyInfo {
  id: StrategyId;
  name: string;
  hasTargets: boolean; // TP1–TP3 exist
}

export const STRATEGIES: StrategyInfo[] = [
  { id: "SATS_H", name: "SATS + dekat high 52M (utama)", hasTargets: true },
  { id: "SATS_F", name: "SATS + filter (MA200 & IHSG)", hasTargets: true },
  { id: "SATS", name: "SATS v1.9.0", hasTargets: true },
];

export const isStrategyId = (v: string): v is StrategyId => STRATEGIES.some((s) => s.id === v);
