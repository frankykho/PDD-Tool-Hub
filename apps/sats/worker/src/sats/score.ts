import type {
  SatsConfig,
  SatsInputBar,
  SatsScore,
} from "./types";
import {
  clamp,
  lowest,
  highest,
  mapClamp,
  safeDiv,
} from "./math";

export interface ScoreContext {
  isBuy: boolean;
  isSell: boolean;
  atrValue: number;
  upperBandPrevious: number | null;
  lowerBandPrevious: number | null;
  lastPivotHigh: number | null;
  lastPivotLow: number | null;
  rsiValue: number | null;
  volumeZ: number | null;
  /** Pine hasVolume = nz(volume, 0) > 0 on the signal bar. */
  hasVolume: boolean;
  efficiencyRatio: number;
  /**
   * PINE_CALL mode: ta.lowest/ta.highest(rsiVal, memory) as Pine evaluates them
   * inside the conditionally-called calcScoreBreakdown (window = last N calls,
   * null = na -> RSI score 0). Undefined = classic per-bar window.
   */
  rsiExtreme?: { lowest: number | null; highest: number | null };
}

export function calculateScore(
  bars: SatsInputBar[],
  config: SatsConfig,
  context: ScoreContext,
): SatsScore {
  const {
    isBuy,
    isSell,
    atrValue,
    upperBandPrevious,
    lowerBandPrevious,
    lastPivotHigh,
    lastPivotLow,
    rsiValue,
    volumeZ,
    hasVolume,
    efficiencyRatio,
    rsiExtreme,
  } = context;

  if (!isBuy && !isSell) {
    return emptyScore();
  }

  if (bars.length < 4) {
    return emptyScore();
  }

  const closes = bars.map(
    (bar) => bar.close,
  );

  const close =
    closes[closes.length - 1];

  /*
   * SATS:
   *
   * BUY:
   *   dirMove = close[3] - close
   *
   * SELL:
   *   dirMove = close - close[3]
   */
  const close3 =
    closes[closes.length - 4];

  const dirMove = isBuy
    ? close3 - close
    : close - close3;

  const momentumScore =
    mapClamp(
      safeDiv(
        dirMove,
        atrValue,
        0,
      ),
      0.3,
      2,
      0,
      17,
    );

  /*
   * ER score
   */
  const erScore =
    mapClamp(
      efficiencyRatio,
      0.15,
      0.7,
      0,
      17,
    );

  /*
   * Volume score
   *
   * SATS uses:
   * mapClamp(volZ, 0, 3, 0, 17)
   *
   * If volume is unavailable, SATS gives 12.
   */
  // Pine: vScore = useVolInput and hasVolume ? mapClamp(volZ, 0, 3, 0, 17) : BYPASS_SCORE
  // hasVolume is checked on the signal bar itself (zero-volume bar -> 12).
  // volZ falls back to 0 when it cannot be computed (Pine safeDiv fallback).
  const volumeScore =
    config.volumeScore && hasVolume
      ? mapClamp(
          volumeZ ?? 0,
          0,
          3,
          0,
          17,
        )
      : 12;

  /*
   * RSI score
   *
   * BUY:
   *   depth = max(
   *     0,
   *     rsiOS -
   *     lowest(rsi, memory)
   *   )
   *
   * SELL:
   *   depth = max(
   *     0,
   *     highest(rsi, memory) -
   *     rsiOB
   *   )
   */
  const rsiScore =
    rsiExtreme !== undefined
      ? calculateRsiScoreFromExtreme(config, isBuy, rsiExtreme)
      : calculateRsiScore(
          bars,
          config,
          isBuy,
          rsiValue,
        );

  /*
   * Structure score
   *
   * BUY:
   *   distance from last pivot low
   *
   * SELL:
   *   distance from last pivot high
   *
   * SATS maps:
   *   0 ATR  -> 16
   *   1.5 ATR -> 6
   */
  const structureScore =
    calculateStructureScore(
      close,
      atrValue,
      config,
      isBuy,
      lastPivotHigh,
      lastPivotLow,
    );

  /*
   * Break-depth score
   *
   * BUY:
   *   max(
   *     0,
   *     upperBand[1] - close[1]
   *   )
   *
   * SELL:
   *   max(
   *     0,
   *     close[1] - lowerBand[1]
   *   )
   */
  const previousClose =
    closes[closes.length - 2];

  let breakDepth = 0;

  if (isBuy) {
    breakDepth = Math.max(
      0,
      (upperBandPrevious ?? previousClose) -
        previousClose,
    );
  } else {
    breakDepth = Math.max(
      0,
      previousClose -
        (lowerBandPrevious ?? previousClose),
    );
  }

  const breakDepthScore =
    mapClamp(
      safeDiv(
        breakDepth,
        atrValue,
        0,
      ),
      0,
      1,
      0,
      16,
    );

  const total =
    momentumScore +
    erScore +
    volumeScore +
    rsiScore +
    structureScore +
    breakDepthScore;

  return {
    total: clamp(
      total,
      0,
      102,
    ),
    momentum: momentumScore,
    er: erScore,
    volume: volumeScore,
    rsi: rsiScore,
    structure: structureScore,
    breakDepth: breakDepthScore,
  };
}

function calculateRsiScoreFromExtreme(
  config: SatsConfig,
  isBuy: boolean,
  extreme: { lowest: number | null; highest: number | null },
): number {
  if (!config.rsiScore) {
    return 12;
  }
  const value = isBuy ? extreme.lowest : extreme.highest;
  if (value == null) {
    return 0; // Pine: depth na -> mapClamp(na) -> safeDiv fallback 0
  }
  const depth = isBuy
    ? Math.max(0, config.rsiOversold - value)
    : Math.max(0, value - config.rsiOverbought);
  return mapClamp(depth, 0, 15, 0, 17);
}

function calculateRsiScore(
  bars: SatsInputBar[],
  config: SatsConfig,
  isBuy: boolean,
  currentRsi: number | null,
): number {
  if (!config.rsiScore) {
    return 12;
  }

  const closes = bars.map(
    (bar) => bar.close,
  );

  const rsiValues = buildRsiSeries(
    closes,
    config.rsiLength,
  );

  if (rsiValues.length === 0) {
    return 12;
  }

  const memory =
    Math.min(
      config.rsiMemory,
      rsiValues.length,
    );

  const recentRsi =
    rsiValues.slice(
      rsiValues.length - memory,
    );

  if (recentRsi.length === 0) {
    return currentRsi == null
      ? 12
      : calculateCurrentRsiScore(
          currentRsi,
          isBuy,
          config,
        );
  }

  const lowestRsi =
    lowest(
      recentRsi,
      recentRsi.length,
    ) ?? currentRsi ?? 50;

  const highestRsi =
    highest(
      recentRsi,
      recentRsi.length,
    ) ?? currentRsi ?? 50;

  const depth = isBuy
    ? Math.max(
        0,
        config.rsiOversold -
          lowestRsi,
      )
    : Math.max(
        0,
        highestRsi -
          config.rsiOverbought,
      );

  return mapClamp(
    depth,
    0,
    15,
    0,
    17,
  );
}

function calculateCurrentRsiScore(
  rsiValue: number,
  isBuy: boolean,
  config: SatsConfig,
): number {
  const depth = isBuy
    ? Math.max(
        0,
        config.rsiOversold -
          rsiValue,
      )
    : Math.max(
        0,
        rsiValue -
          config.rsiOverbought,
      );

  return mapClamp(
    depth,
    0,
    15,
    0,
    17,
  );
}

function calculateStructureScore(
  close: number,
  atrValue: number,
  config: SatsConfig,
  isBuy: boolean,
  lastPivotHigh: number | null,
  lastPivotLow: number | null,
): number {
  if (!config.structureScore) {
    return 12;
  }

  const pivot =
    isBuy
      ? lastPivotLow
      : lastPivotHigh;

  // Pine: pivDist = 0.0 when the pivot is na -> mapClampInv(0) = 16
  if (pivot == null) {
    return 16;
  }

  const distance =
    Math.abs(
      close - pivot,
    );

  const atrDistance =
    safeDiv(
      distance,
      atrValue,
      0,
    );

  /*
   * SATS:
   * closer to pivot = higher score
   *
   * 0 ATR   -> 16
   * 1.5 ATR -> 6
   */
  return mapClamp(
    atrDistance,
    0,
    1.5,
    16,
    6,
  );
}

function buildRsiSeries(
  closes: number[],
  length: number,
): number[] {
  if (
    length <= 0 ||
    closes.length <= length
  ) {
    return [];
  }

  const gains: number[] = [];
  const losses: number[] = [];

  for (
    let i = 1;
    i < closes.length;
    i += 1
  ) {
    const change =
      closes[i] -
      closes[i - 1];

    gains.push(
      Math.max(change, 0),
    );

    losses.push(
      Math.max(-change, 0),
    );
  }

  if (gains.length < length) {
    return [];
  }

  let averageGain =
    gains
      .slice(0, length)
      .reduce(
        (sum, value) => sum + value,
        0,
      ) / length;

  let averageLoss =
    losses
      .slice(0, length)
      .reduce(
        (sum, value) => sum + value,
        0,
      ) / length;

  const result: number[] = [];

  result.push(
    calculateRsi(
      averageGain,
      averageLoss,
    ),
  );

  for (
    let i = length;
    i < gains.length;
    i += 1
  ) {
    averageGain =
      (
        averageGain * (length - 1) +
        gains[i]
      ) / length;

    averageLoss =
      (
        averageLoss * (length - 1) +
        losses[i]
      ) / length;

    result.push(
      calculateRsi(
        averageGain,
        averageLoss,
      ),
    );
  }

  return result;
}

function calculateRsi(
  averageGain: number,
  averageLoss: number,
): number {
  if (averageLoss === 0) {
    return 100;
  }

  const rs =
    averageGain /
    averageLoss;

  return (
    100 -
    100 / (1 + rs)
  );
}

function emptyScore(): SatsScore {
  return {
    total: null,
    momentum: null,
    er: null,
    volume: null,
    rsi: null,
    structure: null,
    breakDepth: null,
  };
}