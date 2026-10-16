/**
 * Parity check: TypeScript SATS vs TradingView SATS v1.9.0 on BBCA Daily.
 *
 * Reference = Franky's TradingView screenshot (23 Sep 2026, preset Auto -> Swing):
 *   Last signal : SELL, label score 34, "10 bars ago"
 *   Levels      : ENTRY 6525 | SL 7025 | TP1 6025 | TP2 5525 | TP3 5025  (labels rounded to tick 25)
 *   Score parts : Momentum 0 | Efficiency 0 | Volume 11.6 | RSI 0 | Structure 6.0 | ST Break 16.0
 *   Visible signals (Mar–Sep 2026): BUY 27 (~early May), SELL (~late May), BUY 35 (~early Jun),
 *                                   SELL 22 (~late Jun), BUY 6 (~early Jul), SELL 34 (~9 Sep)
 *
 * Run:  npx tsx src/data/test-parity-bbca.ts
 * Behind an office proxy with SSL inspection (SELF_SIGNED_CERT_IN_CHAIN):
 *   $env:NODE_OPTIONS="--use-system-ca"; npx tsx src/data/test-parity-bbca.ts
 */
import { fetchYahooDaily } from "./yahoo";
import { runSats } from "../sats/engine";

const REF = {
  signal: "SELL" as const,
  entry: 6525,
  sl: 7025,
  tp: [6025, 5525, 5025],
  score: { total: 34, momentum: 0, er: 0, volume: 11.6, rsi: 0, structure: 6.0, breakDepth: 16.0 },
  lastSix: ["BUY", "SELL", "BUY", "SELL", "BUY", "SELL"],
};
const TICK = 25; // TradingView labels use format.mintick (BBCA tick = 25)

let failed = 0;
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(28)} ${detail}`);
  if (!ok) failed += 1;
}
const near = (a: number | null | undefined, b: number, tol: number) => a != null && Math.abs(a - b) <= tol;
const wib = (t: number) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);

async function main() {
  // Longer history = closer to TradingView (it loads BBCA's full history; bands/smoothing are path-dependent).
  const now = Math.floor(Date.now() / 1000);
  const bars = await fetchYahooDaily("BBCA.JK", now - 10 * 365 * 86400, now);
  const r = runSats(bars); // defaults: preset AUTO + Daily -> SWING (same as the TradingView dashboard)

  console.log(`Bars: ${bars.length} (${wib(bars[0].time)} .. ${wib(bars[bars.length - 1].time)}), preset ${r.resolvedPreset}\n`);

  console.log("Last 8 signals (compare dates with the chart):");
  for (const s of r.signalHistory.slice(-8)) {
    console.log(`  ${wib(s.time)}  ${s.signal.padEnd(4)}  close ${bars[s.barIndex].close}  score ${s.score.total?.toFixed(1)}`);
  }
  console.log("");

  const last = r.lastSignal;
  if (!last || !last.trade) {
    check("last signal exists", false, "no signal");
    return;
  }
  const t = last.trade;
  const barsAgo = bars.length - 1 - last.barIndex;

  check("last signal direction", last.signal === REF.signal, `${last.signal} (ref ${REF.signal})`);
  check("last signal date", true, `${wib(last.time)}, ${barsAgo} bars before last Yahoo bar (TV said 10b ago incl. today)`);
  check("entry", near(t.entry, REF.entry, 0.5), `${t.entry} (ref ${REF.entry})`);
  check("stop loss", near(t.sl, REF.sl, TICK / 2), `${t.sl.toFixed(1)} (ref ${REF.sl} ±${TICK / 2})`);
  [t.tp1, t.tp2, t.tp3].forEach((v, i) =>
    check(`TP${i + 1}`, near(v, REF.tp[i], TICK / 2 * (i + 2)), `${v.toFixed(1)} (ref ${REF.tp[i]})`),
  );

  const s = last.score;
  check("score total", near(s.total, REF.score.total, 0.5), `${s.total?.toFixed(2)} (ref ${REF.score.total})`);
  for (const k of ["momentum", "er", "volume", "rsi", "structure", "breakDepth"] as const) {
    check(`score ${k}`, near(s[k], REF.score[k], 0.05), `${s[k]?.toFixed(2)} (ref ${REF.score[k]})`);
  }

  const seq = r.signalHistory.slice(-6).map((x) => x.signal);
  check("last 6 signal directions", JSON.stringify(seq) === JSON.stringify(REF.lastSix), seq.join(" "));

  console.log("\nLatest bar (TradingView dashboard at 12:05 was intraday; compare after market close):");
  console.log(`  ${wib(r.time)}  trend ${r.trend}  TQI ${r.tqi.value.toFixed(2)}  ER ${r.tqi.er.toFixed(2)}  regime ${r.regime}/${r.volatilityRegime}`);
  console.log(`  TQI parts: vol ${r.tqi.volatility.toFixed(2)}  struct ${r.tqi.structure.toFixed(2)}  mom ${r.tqi.momentum.toFixed(2)}`);
  console.log(`  Active trade: ${r.trade ? `${r.trade.direction} entry ${r.trade.entry}, TP1 hit ${r.trade.tp1Hit}` : "none"}`);

  console.log(failed === 0 ? "\nPARITY OK" : `\n${failed} CHECK(S) FAILED — paste this output back`);
}

main().catch((e) => {
  console.error("Parity test failed:", e);
  process.exit(1);
});
