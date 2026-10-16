import { runSats } from "./engine";
import type { SatsInputBar } from "./types";

function generateTestBars(
  count: number,
): SatsInputBar[] {
  const bars: SatsInputBar[] = [];

  let price = 1000;

  for (let i = 0; i < count; i += 1) {
    const drift =
      i < 80
        ? 2
        : i < 140
          ? -1.5
          : 2.5;

    const noise =
      Math.sin(i * 0.7) * 3;

    const open =
      price + noise;

    const close =
      open + drift;

    const high =
      Math.max(open, close) + 4;

    const low =
      Math.min(open, close) - 4;

    const volume =
      1_000_000 +
      i * 2_000 +
      Math.abs(
        Math.sin(i * 0.4),
      ) * 300_000;

    bars.push({
      time:
        1720000000 +
        i * 86400,
      open,
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  return bars;
}

const bars =
  generateTestBars(200);

const result =
  runSats(bars);

console.log(
  "===== SATS ENGINE TEST =====",
);

console.log(
  "Version:",
  result.version,
);

console.log(
  "Bars:",
  bars.length,
);

console.log(
  "Signal:",
  result.signal,
);

console.log(
  "Trend:",
  result.trend,
);

console.log(
  "Regime:",
  result.regime,
);

console.log(
  "Volatility:",
  result.volatilityRegime,
);

console.log(
  "TQI:",
  result.tqi,
);

console.log(
  "Score:",
  result.score,
);

console.log(
  "Levels:",
  result.levels,
);

console.log(
  "Trade:",
  result.trade,
);

console.log(
  "Last Signal:",
  result.lastSignal,
);

console.log("Signal History Count:", result.signalHistory.length);
console.log("Signal History:", result.signalHistory);
console.log("Bar Results Count:", result.bars.length);
console.log("Bar 88:", result.bars[88]);
console.log("Bar 146:", result.bars[146]);

console.log(
  "TP Mode:",
  result.tpMode,
);

console.log(
  "TP Scale:",
  result.tpScale,
);

console.log(
  "Warmed Up:",
  result.warmedUp,
);

console.log(
  "============================",
);