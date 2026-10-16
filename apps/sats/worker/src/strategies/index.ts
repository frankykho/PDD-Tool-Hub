import { runSats } from "../sats/engine";
import type { SatsInputBar } from "../sats/types";
import { applyFilter, fromSats, nearHighMask, satsFilterMask } from "./sats";

export { satsFilterMask };
import type { StratResult, StrategyId } from "./types";


export * from "./types";

/** Run every strategy on one stock. `ihsgAbove` = IHSG close > SMA200 on that date (null = unknown). */
export function runAllStrategies(
  bars: SatsInputBar[],
  ihsgAbove: ((time: number) => boolean | null) | null,
): Partial<Record<StrategyId, StratResult>> {
  const sats = fromSats(bars, runSats(bars));
  const out: Partial<Record<StrategyId, StratResult>> = {
    SATS: sats,
    SATS_H: applyFilter(sats, nearHighMask(bars)),
  };
  if (ihsgAbove) out.SATS_F = applyFilter(sats, satsFilterMask(bars, ihsgAbove));
  return out;
}
