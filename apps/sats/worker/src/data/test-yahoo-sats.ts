import { fetchYahooDaily } from "./yahoo";
import { runSats } from "../sats/engine";

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const twoYearsAgo =
    now - 2 * 365 * 24 * 60 * 60;

  const bars = await fetchYahooDaily(
    "BBCA.JK",
    twoYearsAgo,
    now,
  );

  const result = runSats(bars);

  const auditIndex =
    result.signalHistory[
      result.signalHistory.length - 1
    ].barIndex;

  console.log(
    "===== SATS INTERMEDIATE AUDIT =====",
  );
  console.log("Audit Bar:", auditIndex);
  console.log("OHLCV:", bars[auditIndex]);
  console.log("Bar Result:", result.bars[auditIndex]);
  console.log("==================================");

  console.log("===== YAHOO → SATS TEST =====");

  console.log("Symbol:", "BBCA.JK");
  console.log("Yahoo Bars:", bars.length);
  console.log("SATS Bars:", result.bars.length);

  console.log("Latest Time:", result.time);
  console.log("Latest Signal:", result.signal);
  console.log("Latest Trend:", result.trend);
  console.log("Latest TQI:", result.tqi.value);

  console.log(
    "Signal History Count:",
    result.signalHistory.length,
  );

  console.log(
    "Signal History:",
    result.signalHistory.map((item) => ({
      signal: item.signal,
      barIndex: item.barIndex,
      time: item.time,
      score: item.score.total,
    })),
  );

  console.log(
    "Latest Bar:",
    result.bars[result.bars.length - 1],
  );

  const lastSignal =
  result.signalHistory[
    result.signalHistory.length - 1
  ];

console.log(
  "===== LAST SIGNAL AUDIT =====",
);

console.log(
  "Signal:",
  lastSignal.signal,
);

console.log(
  "Bar Index:",
  lastSignal.barIndex,
);

console.log(
  "Time:",
  lastSignal.time,
);

console.log(
  "Score:",
  lastSignal.score,
);

console.log(
  "Trade:",
  lastSignal.trade,
);

console.log(
  "Bar Result:",
  result.bars[lastSignal.barIndex],
);

console.log(
  "=============================",
);

  console.log("============================");
  console.log("===== LIFECYCLE (SATS v1.9.0) =====");
  console.log("Resolved preset:", result.resolvedPreset);
  console.log(
    "Closed trades:",
    result.closedTrades.map((t) => ({
      dir: t.direction,
      entryBar: t.entryBar,
      exitBar: t.exitBar,
      reason: t.reason,
      hits: [t.tp1Hit, t.tp2Hit, t.tp3Hit].map((h) => (h ? 1 : 0)).join(""),
      R: t.realizedR,
    })),
  );
  console.log("Active trade:", result.trade);
  console.log("Performance:", result.performance);
}

main().catch((error) => {
  console.error("Yahoo → SATS test failed:");
  console.error(error);
  process.exit(1);
});