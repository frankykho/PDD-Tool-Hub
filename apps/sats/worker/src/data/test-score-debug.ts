/**
 * Score audit: TypeScript vs TradingView labels for BBCA signals Jan–Sep 2026.
 * Compares two readings of Pine's calcScoreBreakdown history operators:
 *   BAR       = previous bar / last 20 bars (textbook)
 *   PINE_CALL = previous call of the same call site (how Pine runs a function that
 *               is only called on flip bars) — engine default
 *
 * Run:  $env:NODE_OPTIONS="--use-system-ca"; npx tsx src/data/test-score-debug.ts
 */
import { fetchYahooDaily } from "./yahoo";
import { runSats } from "../sats/engine";
import type { SatsScore } from "../sats/types";

// TradingView label values (screenshots). Breakdown where the dashboard showed it.
const TV: Record<string, { label: number; parts?: number[] }> = {
  "2026-01-30": { label: 32 },
  "2026-02-11": { label: 7 },
  "2026-05-07": { label: 27 },
  "2026-05-22": { label: 14, parts: [0, 1.7, 6.4, 0, 6.0, 0] },
  "2026-06-10": { label: 35, parts: [0, 1.9, 8.4, 0, 8.9, 16.0] },
  "2026-06-24": { label: 22 },
  "2026-07-03": { label: 6 },
  "2026-09-09": { label: 34, parts: [0, 0, 11.6, 0, 6.0, 16.0] },
};
const wib = (t: number) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);
const parts = (s: SatsScore) =>
  [s.momentum, s.er, s.volume, s.rsi, s.structure, s.breakDepth].map((v) => (v ?? 0).toFixed(1).padStart(4)).join(" ");

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const raw = await fetchYahooDaily("BBCA.JK", now - 10 * 365 * 86400, now);

  // fetchYahooDaily now removes Yahoo's zero-volume holiday bars (see yahoo.ts).
  const clean = raw;
  const runs = {
    "PINE_CALL": runSats(clean, { config: { scoreHistoryMode: "PINE_CALL" } }),
    "BAR      ": runSats(clean, { config: { scoreHistoryMode: "BAR" } }),
  };
  if (JSON.stringify(runs["PINE_CALL"].signalHistory.map((x) => x.score)) === JSON.stringify(runs["BAR      "].signalHistory.map((x) => x.score))) {
    console.log("!! PINE_CALL and BAR give identical scores -> engine/score/config/types from sats-score-fix.zip are NOT installed.\n");
  }

  for (const [name, r] of Object.entries(runs)) {
    let hits = 0;
    console.log(`--- ${name}`);
    for (const [date, ref] of Object.entries(TV)) {
      const s = r.signalHistory.find((x) => wib(x.time) === date);
      if (!s) {
        console.log(`  ${date}  TV ${String(ref.label).padStart(2)} | signal not found on this date`);
        continue;
      }
      const tot = s.score.total ?? 0;
      const ok = Math.round(tot) === ref.label;
      if (ok) hits += 1;
      console.log(`  ${date}  ${s.signal.padEnd(4)} TV ${String(ref.label).padStart(2)} | ${ok ? "OK" : "XX"} ${tot.toFixed(1).padStart(5)} (${parts(s.score)})${ref.parts ? `  TV (${ref.parts.map((v) => v.toFixed(1).padStart(4)).join(" ")})` : ""}`);
    }
    const j = r.signalHistory.find((x) => wib(x.time) === "2026-06-10");
    const t = j?.trade;
    const risk = t ? t.entry - t.sl : NaN;
    console.log(`  Jun 10 levels: entry ${t?.entry} SL ${t?.sl.toFixed(1)} TP ${t ? [t.tp1, t.tp2, t.tp3].map((v) => v.toFixed(1)).join("/") : "-"}  risk ${risk.toFixed(1)} ${risk >= 279 && risk <= 281.5 ? "OK" : "XX"} (TV: SL 5375, TP 5925/6200/6500 -> risk 279–281)`);
    console.log(`  Signals total ${r.signalHistory.length}, label matches ${hits}/8\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
