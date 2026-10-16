/**
 * Unit tests for SATS v1.9.0 trade lifecycle (lifecycle.ts).
 * Run:  npx tsx src/sats/test-lifecycle.ts
 * Every expected value is derived by hand from the Pine source.
 */
import { SatsLifecycle, calcRealizedR, calcTimeoutR } from "./lifecycle";
import { SATS_DEFAULT_CONFIG } from "./config";
import type { SatsInputBar, SatsTrade } from "./types";

let failed = 0;
function eq(name: string, actual: unknown, expected: unknown): void {
  const ok =
    typeof expected === "number" && typeof actual === "number"
      ? Math.abs(actual - expected) < 1e-9
      : JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
  if (!ok) failed += 1;
}

const cfg = { ...SATS_DEFAULT_CONFIG };
const bar = (i: number, high: number, low: number, close = (high + low) / 2): SatsInputBar => ({
  time: 1000 + i, open: close, high, low, close, volume: 1,
});
function buy(entryBar: number): SatsTrade {
  // entry 1000, SL 900 -> risk 100, TP 1100/1200/1300 (fixed 1R/2R/3R)
  return { direction: "BUY", entryBar, entry: 1000, sl: 900, tp1: 1100, tp2: 1200, tp3: 1300,
    tp1R: 1, tp2R: 2, tp3R: 3, risk: 100, tp1Hit: false, tp2Hit: false, tp3Hit: false };
}
function sell(entryBar: number): SatsTrade {
  return { direction: "SELL", entryBar, entry: 1000, sl: 1100, tp1: 900, tp2: 800, tp3: 700,
    tp1R: 1, tp2R: 2, tp3R: 3, risk: 100, tp1Hit: false, tp2Hit: false, tp3Hit: false };
}
function run(trade: SatsTrade, path: Array<[number, number]>) {
  const lc = new SatsLifecycle(cfg);
  lc.openTrade(trade, bar(trade.entryBar, 1005, 995), trade.entryBar, 0.3, 1);
  // entry bar itself: Pine skips hit detection (bar_index > tradeEntryBar is false)
  const onEntry = lc.updateTrade(bar(trade.entryBar, 5000, 1), trade.entryBar);
  eq("no hit detection on the entry bar", onEntry, null);
  path.forEach(([h, l], k) => lc.updateTrade(bar(trade.entryBar + 1 + k, h, l), trade.entryBar + 1 + k));
  return lc;
}

// --- formulas
eq("calcRealizedR TP3", calcRealizedR(false, true, true, true, 1, 2, 3), 2);
eq("calcRealizedR SL only", calcRealizedR(true, false, false, false, 1, 2, 3), -1);
eq("calcRealizedR TP1 then SL", calcRealizedR(true, true, false, false, 1, 2, 3), 1 / 3 - 2 / 3);
eq("calcRealizedR TP2 then SL", calcRealizedR(true, true, true, false, 1, 2, 3), 1 / 3 + 2 / 3 - 1 / 3);
eq("calcTimeoutR TP1 only", calcTimeoutR(true, false, false, 1, 2, 3), 1 / 3);

// --- BUY paths
let lc = run(buy(10), [[1050, 990], [1320, 1010]]);
eq("BUY TP3 reason", lc.closedTrades[0].reason, "TP3");
eq("BUY TP3 R", lc.closedTrades[0].realizedR, 2);
eq("BUY TP3 hits", [lc.closedTrades[0].tp1Hit, lc.closedTrades[0].tp2Hit, lc.closedTrades[0].tp3Hit], [true, true, true]);
eq("BUY TP3 closes trade", lc.activeTrade, null);

lc = run(buy(10), [[1110, 1000], [1050, 890]]);
eq("BUY TP1 then SL reason", lc.closedTrades[0].reason, "SL");
eq("BUY TP1 then SL R", lc.closedTrades[0].realizedR, -1 / 3);

lc = run(buy(10), [[1050, 900]]);
eq("BUY SL touch (low == sl) counts", lc.closedTrades[0].reason, "SL");
eq("BUY SL R", lc.closedTrades[0].realizedR, -1);

lc = run(buy(10), [[1310, 890]]);
eq("BUY TP3 and SL same bar -> TP3 wins (Pine checks hitTp3 first)", lc.closedTrades[0].reason, "TP3");
eq("BUY TP3+SL same bar R", lc.closedTrades[0].realizedR, 2);

lc = run(buy(10), [[1150, 950], [1150, 950], [1250, 950]]);
eq("BUY TP2 reached, trade still open", lc.activeTrade?.tp2Hit, true);
eq("BUY TP2 reached, nothing closed", lc.closedTrades.length, 0);

// timeout: tradeAge >= 100 -> close at bar entry+100 with only realized partials
const quiet: Array<[number, number]> = Array.from({ length: 100 }, (_, k) => (k === 5 ? [1105, 950] : [1050, 950]));
lc = run(buy(10), quiet);
eq("BUY timeout reason", lc.closedTrades[0].reason, "TIMEOUT");
eq("BUY timeout exit bar", lc.closedTrades[0].exitBar, 110);
eq("BUY timeout R (TP1 hit)", lc.closedTrades[0].realizedR, 1 / 3);
lc = run(buy(10), quiet.slice(0, 99));
eq("BUY not timed out at age 99", lc.closedTrades.length, 0);

// --- SELL mirror
lc = run(sell(10), [[1010, 890], [1005, 690]]);
eq("SELL TP3 R", lc.closedTrades[0].realizedR, 2);
lc = run(sell(10), [[1010, 790], [1100, 950]]);
eq("SELL TP2 then SL R", lc.closedTrades[0].realizedR, 1 / 3 + 2 / 3 - 1 / 3);

// --- new signal overwrites trade without recording a result
lc = new SatsLifecycle(cfg);
lc.openTrade(buy(10), bar(10, 1005, 995), 10, 0.3, 1);
lc.updateTrade(bar(11, 1110, 1000), 11); // TP1 hit
const replaced = lc.openTrade(sell(12), bar(12, 1005, 995), 12, 0.3, 1);
eq("replaced trade logged as REPLACED", replaced?.reason, "REPLACED");
eq("replaced trade not counted", replaced?.counted, false);
eq("replaced trade has no R", replaced?.realizedR, null);
eq("replaced trade kept TP1 flag", replaced?.tp1Hit, true);
eq("performance ignores replaced trade", lc.performance(0.3, 1).sampleCount, 0);

// --- performance / streaks
lc = new SatsLifecycle(cfg);
const outcomes: Array<Array<[number, number]>> = [
  [[1320, 1000]], // +2
  [[1050, 890]],  // -1
  [[1050, 890]],  // -1
  [[1320, 1000]], // +2
];
let b = 0;
for (const path of outcomes) {
  lc.openTrade(buy(b), bar(b, 1005, 995), b, 0.3, 1);
  b += 1;
  for (const [h, l] of path) { lc.updateTrade(bar(b, h, l), b); b += 1; }
}
const p = lc.performance(0.3, 1);
eq("win rate", p.winRate, 0.5);
eq("avg R", p.avgR, 0.5);
eq("window DD (min running cum from 0)", p.windowDrawdownR, 0);
eq("all-time DD (peak 2 -> 0)", p.allTimeDrawdownR, -2);
eq("streaks", [p.curWinStreak, p.maxWinStreak, p.curLossStreak, p.maxLossStreak], [1, 1, 0, 2]);
eq("regime edge EWMA (cell ER 0.3 / vol 1.0)", p.regimeEdgeR, ((2 * 0.8 - 0.2) * 0.8 - 0.2) * 0.8 + 0.4);
eq("quality strength unchanged when calibration off", p.effectiveQualityStrength, 0.4);

// --- auto-calibration (Pine default OFF; exact drift rule when ON)
{
  const cal = new SatsLifecycle({ ...cfg, autoCalibration: true });
  const qs: number[] = [];
  let i = 0;
  for (let n = 0; n < 25; n += 1) {
    cal.openTrade(buy(i), bar(i, 1005, 995), i, 0.3, 1);
    i += 1;
    cal.updateTrade(bar(i, 1050, 890), i); // SL -> -1R
    i += 1;
    qs.push(cal.effectiveQualityStrength);
  }
  eq("no calibration before 20 samples", qs[18], 0.4);
  eq("20th loss: eff == input -> drift +step", qs[19], 0.45);
  eq("cooldown 5 signals", qs[23], 0.45);
  eq("25th loss: eff > input -> drift -step", qs[24], 0.4);
}

console.log(failed === 0 ? "\nALL LIFECYCLE TESTS PASSED" : `\n${failed} TEST(S) FAILED`);
if (failed) process.exit(1);
