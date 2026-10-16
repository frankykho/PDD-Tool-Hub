import { useSyncExternalStore } from "react";

export type StrategyId = "SATS_F" | "SATS" | "SATS_H";

export interface StrategyMeta {
  id: StrategyId;
  name: string;
  short: string;
  hasTargets: boolean; // TP1–TP3
  hasScore: boolean;
  stopLabel: string; // what the stop column means
  exitRule: string;
}

export const STRATEGIES: StrategyMeta[] = [
  {
    id: "SATS_H", name: "SATS + dekat high 52M (utama)", short: "SATS + high 52M", hasTargets: true, hasScore: true, stopLabel: "Stop Loss",
    exitRule: "BUY SATS hanya saat harga > MA200 dan ≤ 5% dari harga tertinggi 52 minggu (pemenang Lab Uji & Track Record). Keluar: kena SL, kena TP3, sinyal SELL, atau 100 hari bursa.",
  },
  {
    id: "SATS_F", name: "SATS + filter MA200 & IHSG", short: "SATS + filter", hasTargets: true, hasScore: true, stopLabel: "Stop Loss",
    exitRule: "BUY SATS hanya saat harga > MA200 dan IHSG > MA200. Keluar: kena SL, kena TP3, sinyal SELL, atau 100 hari bursa.",
  },
  {
    id: "SATS", name: "SATS v1.9.0 (pantauan)", short: "SATS", hasTargets: true, hasScore: true, stopLabel: "Stop Loss",
    exitRule: "Semua sinyal SATS, tanpa filter. Keluar: kena SL, kena TP3, sinyal SELL, atau 100 hari bursa.",
  },
];

export const strategyMeta = (id: StrategyId) => STRATEGIES.find((s) => s.id === id) ?? STRATEGIES[0];

const KEY = "sats.strategy.v2"; // v2: default moved to SATS_H, so old saved choices start fresh
const listeners = new Set<() => void>();

function read(): StrategyId {
  try {
    const v = localStorage.getItem(KEY) as StrategyId | null;
    return v && STRATEGIES.some((s) => s.id === v) ? v : "SATS_H";
  } catch {
    return "SATS_H";
  }
}

let current: StrategyId = read();

export function setStrategy(id: StrategyId): void {
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** Global strategy selection, shared by every page. */
export function useStrategy(): StrategyMeta {
  const id = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
  return strategyMeta(id);
}
