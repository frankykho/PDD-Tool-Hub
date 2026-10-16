import type { SatsConfig, SatsInputBar } from "./types";
import { clamp, nz, safeDiv } from "./math";

export interface TrendCalculation {
  trend: 1 | -1;
  flipUp: boolean;
  flipDown: boolean;
  stLine: number | null;
  lowerBand: number | null;
  upperBand: number | null;
  activeMultiplier: number;
  passiveMultiplier: number;
  trendAge: number;
  trendStartBar: number;
}

export interface TrendState {
  lowerBand: number | null;
  upperBand: number | null;
  trend: 1 | -1;
  trendStartBar: number;
  activeMultiplier: number | null;
  passiveMultiplier: number | null;
}

export function calculateTrend(
  bars: SatsInputBar[],
  config: SatsConfig,
  tqiValues: number[],
  atrValues: number[],
  previousState?: TrendState,
  /** Bar to evaluate. Defaults to the last bar; pass it to avoid slicing arrays each bar. */
  index: number = bars.length - 1,
): TrendCalculation {

  if (index < 0) {
    return {
      trend: 1,
      flipUp: false,
      flipDown: false,
      stLine: null,
      lowerBand: null,
      upperBand: null,
      activeMultiplier: config.baseMultiplier,
      passiveMultiplier: config.baseMultiplier,
      trendAge: 0,
      trendStartBar: 0,
    };
  }

  const close = bars[index].close;
  const previousClose =
    index > 0 ? bars[index - 1].close : close;

  const atrValue = nz(atrValues[index], 0);

  const tqi = clamp(
    nz(tqiValues[index], 0.5),
    0,
    1,
  );

  const previousTqi =
    index > 0
      ? clamp(nz(tqiValues[index - 1], 0.5), 0, 1)
      : 0.5;

  const er = calculateEfficiencyRatioAtIndex(
    bars,
    index,
    config.erLength,
  );

  // SATS legacy adaptive band factor
  const legacyAdaptFactor = config.adaptiveBands
    ? 1 + config.adaptationStrength * (0.5 - er)
    : 1;

  // SATS TQI quality multiplier
  const qualityDeviation = config.useTqi
    ? Math.pow(1 - tqi, config.qualityCurve)
    : 0.5;

  const qualityStrength = config.qualityInfluence;

  const tqiMultiplier =
    1 -
    qualityStrength +
    qualityStrength *
      (0.6 + 0.8 * qualityDeviation);

  const effectiveBaseMultiplier =
    config.baseMultiplier *
    legacyAdaptFactor *
    tqiMultiplier;

  let activeRaw = effectiveBaseMultiplier;
  let passiveRaw = effectiveBaseMultiplier;

  // SATS asymmetric bands
  if (config.useTqi && config.asymmetricBands) {
    const asymTighten =
      1 -
      config.asymmetryStrength *
        tqi *
        0.3;

    const asymWiden =
      1 +
      config.asymmetryStrength *
        tqi *
        0.4;

    activeRaw *= asymTighten;
    passiveRaw *= asymWiden;
  }

  // SATS persistent multiplier smoothing
  const previousActive =
    previousState?.activeMultiplier ??
    activeRaw;

  const previousPassive =
    previousState?.passiveMultiplier ??
    passiveRaw;

  const activeMultiplier =
    config.smoothMultipliers
      ? previousActive * 0.85 +
        activeRaw * 0.15
      : activeRaw;

  const passiveMultiplier =
    config.smoothMultipliers
      ? previousPassive * 0.85 +
        passiveRaw * 0.15
      : passiveRaw;

  const previousTrend =
    previousState?.trend ?? 1;

  // Which multiplier is active depends on previous trend
  const lowerMultiplier =
    previousTrend === 1
      ? activeMultiplier
      : passiveMultiplier;

  const upperMultiplier =
    previousTrend === 1
      ? passiveMultiplier
      : activeMultiplier;

  // Raw bands
  const lowerBandRaw =
    close -
    lowerMultiplier *
      atrValue;

  const upperBandRaw =
    close +
    upperMultiplier *
      atrValue;

  // SATS band ratchet
  let lowerBand = lowerBandRaw;
  let upperBand = upperBandRaw;

  if (previousState?.lowerBand != null) {
    lowerBand =
      previousClose >
      previousState.lowerBand
        ? Math.max(
            lowerBandRaw,
            previousState.lowerBand,
          )
        : lowerBandRaw;
  }

  if (previousState?.upperBand != null) {
    upperBand =
      previousClose <
      previousState.upperBand
        ? Math.min(
            upperBandRaw,
            previousState.upperBand,
          )
        : upperBandRaw;
  }

  // SATS price-based flips
  const priceFlipUp =
    previousTrend === -1 &&
    previousState?.upperBand != null &&
    close > previousState.upperBand;

  const priceFlipDown =
    previousTrend === 1 &&
    previousState?.lowerBand != null &&
    close < previousState.lowerBand;

  // SATS trend age
  const previousTrendStartBar =
    previousState?.trendStartBar ?? 0;

  const trendAge =
    Math.max(
      0,
      index - previousTrendStartBar,
    );

  // SATS Character Flip condition
  //
  // Source input defaults to CLOSE in SATS.
  // Therefore:
  //   close < sourceInput
  //   close > sourceInput
  //
  // are both false when sourceInput = close.
  //
  // We preserve that behavior exactly for the
  // current default configuration.

  const charFlipCondBase =
    config.characterFlip &&
    config.useTqi &&
    previousTqi >
      config.characterFlipHighTqi &&
    tqi <
      config.characterFlipLowTqi &&
    trendAge >=
      config.characterFlipMinAge;

  const charFlipDown =
    charFlipCondBase &&
    previousTrend === 1 &&
    false;

  const charFlipUp =
    charFlipCondBase &&
    previousTrend === -1 &&
    false;

  const flipUp =
    priceFlipUp ||
    charFlipUp;

  const flipDown =
    priceFlipDown ||
    charFlipDown;

  // SATS trend state
  let trend = previousTrend;
  let trendStartBar = previousTrendStartBar;

  if (flipUp) {
    trend = 1;
  } else if (flipDown) {
    trend = -1;
  }

  if (trend !== previousTrend) {
    trendStartBar = index;
  }

  const stLine =
    trend === 1
      ? lowerBand
      : upperBand;

  return {
    trend,
    flipUp,
    flipDown,
    stLine,
    lowerBand,
    upperBand,
    activeMultiplier,
    passiveMultiplier,
    trendAge,
    trendStartBar,
  };
}

function calculateEfficiencyRatioAtIndex(
  bars: SatsInputBar[],
  index: number,
  length: number,
): number {
  if (
    length <= 0 ||
    index < length
  ) {
    return 0;
  }

  const current =
    bars[index].close;

  const start =
    bars[index - length].close;

  const change =
    Math.abs(
      current - start,
    );

  let volatility = 0;

  for (
    let i = index - length + 1;
    i <= index;
    i += 1
  ) {
    volatility +=
      Math.abs(
        bars[i].close -
        bars[i - 1].close,
      );
  }

  return safeDiv(
    change,
    volatility,
    0,
  );
}