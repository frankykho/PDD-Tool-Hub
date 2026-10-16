/**
 * Parity check for the non-SATS strategies on one stock. Compare with the TradingView chart:
 *   UT Bot Alerts (your script, default inputs), Follow Line + MACD Shield V9 (mode Adaptive, default inputs),
 *   Turtle (pine/turtle_donchian_20_10.pine), SATS + filter (SATS + pine/sats_filter_ma200_ihsg.pine).
 *
 * Run:  $env:NODE_OPTIONS="--use-system-ca"; npx tsx src/data/test-strategies-bbca.ts [KODE]
 */
import { fetchYahooDaily } from "./yahoo";
import { runAllStrategies, STRATEGIES } from "../strategies";
import { sma } from "../strategies/series";

const code = (process.argv[2] ?? "BBCA").toUpperCase();
const wib = (t: number) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 10 * 365 * 86400;
  const [bars, ihsg] = await Promise.all([fetchYahooDaily(`${code}.JK`, from, now), fetchYahooDaily("^JKSE", from, now)]);
  const ma = sma(ihsg.map((b) => b.close), 200);
  const above = new Map(ihsg.map((b, i) => [wib(b.time), Number.isNaN(ma[i]) ? null : b.close > ma[i]] as const));
  const all = runAllStrategies(bars, (t) => above.get(wib(t)) ?? null);

  console.log(`${code}: ${bars.length} bar (${wib(bars[0].time)} .. ${wib(bars[bars.length - 1].time)})\n`);
  for (const s of STRATEGIES) {
    const r = all[s.id];
    if (!r) continue;
    console.log(`=== ${s.name}`);
    for (const sig of r.signals.slice(-8)) {
      const b = bars[sig.barIndex];
      console.log(`  ${wib(b.time)}  ${sig.side.padEnd(4)}  close ${b.close}${sig.score != null ? `  score ${sig.score.toFixed(1)}` : ""}`);
    }
    const t = r.trades[r.trades.length - 1];
    const open = t && t.exitBar == null;
    console.log(
      `  posisi: ${open ? `TERBUKA sejak ${wib(bars[t.entryBar].time)} @ ${t.entry}, stop sekarang ${r.stopNow?.toFixed(1) ?? "—"}` : "tidak ada"}`,
    );
    console.log(`  trend: ${r.trend ?? "—"}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
