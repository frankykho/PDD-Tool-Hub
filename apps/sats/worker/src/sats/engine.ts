import type {
  SatsClosedTrade,
  SatsConfig,
  SatsInputBar,
  SatsResult,
  SatsBarResult,
  SatsScore,
  SatsSignalEvent,
  SatsTradeEvent,
} from "./types";

import { clamp, safeDiv, zScore } from "./math";
import { SATS_DEFAULT_CONFIG, resolveSatsConfig } from "./config";
import { calculateTrend, type TrendState } from "./trend";
import { calculateScore, type ScoreContext } from "./score";
import { calculateTrade, type TradeContext } from "./trade";
import { SatsLifecycle } from "./lifecycle";

export interface SatsEngineOptions {
  config?: Partial<SatsConfig>;
}

interface InternalPivotState {
  lastPivotHigh: number | null;
  lastPivotLow: number | null;
}

interface TqiComponents {
  value: number;
  er: number;
  volatility: number;
  structure: number;
  momentum: number;
}

interface TrendSnapshot {
  lowerBand: number | null;
  upperBand: number | null;
}

export function runSats(
  bars: SatsInputBar[],
  options: SatsEngineOptions = {},
): SatsResult {
  // Pine 3.5: preset resolution ("Auto" on Daily -> "Swing")
  const { config, resolvedPreset } = resolveSatsConfig({
    ...SATS_DEFAULT_CONFIG,
    ...options.config,
  });

  if (bars.length === 0) {
    return { ...emptyResult(), resolvedPreset };
  }

  // Pine: rawAtr = nz(ta.atr(effectiveAtrLen), 0)
  const atrSeries = buildAtrSeries(bars, config.atrLength);

  // Pine: atrBaseline = nz(ta.sma(rawAtr, atrBaselineLen), rawAtr)
  //       volRatio    = safeDiv(rawAtr, atrBaseline, 1.0)
  const atrBaselineSeries = buildSmaSeries(atrSeries, config.atrBaselineLength);
  const volatilityRatioSeries = atrSeries.map((value, index) =>
    safeDiv(value, atrBaselineSeries[index] || value, 1),
  );

  // Pine: erValue = calcEfficiencyRatio(close, effectiveErLen)
  const erSeries = bars.map((_, index) =>
    calculateEfficiencyRatioAtIndex(bars, index, config.erLength),
  );

  // Pine: effAtr = useEffAtrInput ? rawAtr * (0.5 + 0.5 * erValue) : rawAtr
  //       atrValue = effAtr
  // atrValue (NOT rawAtr) feeds the bands, the score and the SL in Pine.
  const effAtrSeries = atrSeries.map((raw, index) =>
    config.efficiencyWeightedAtr ? raw * (0.5 + 0.5 * erSeries[index]) : raw,
  );

  const tqiSeries = buildTqiSeries(bars, config, volatilityRatioSeries);
  const tqiValues = tqiSeries.map((item) => item.value);

  // Pine: ta.rsi(close, effectiveRsiLen) — one pass (same arithmetic as calculateRsiAtIndex)
  const rsiSeries = buildRsiSeriesFull(bars, config.rsiLength);

  const warmupBars = calculateWarmupBars(config);
  const lifecycle = new SatsLifecycle(config);

  let trendState: TrendState | undefined;
  let previousTrendSnapshot: TrendSnapshot = { lowerBand: null, upperBand: null };
  let pivotState: InternalPivotState = { lastPivotHigh: null, lastPivotLow: null };
  let lastSignal: SatsResult["lastSignal"] = null;
  const signalHistory: SatsSignalEvent[] = [];
  const barResults: SatsBarResult[] = [];

  // Pine calcScoreBreakdown is only executed on flip bars (buy site on flipUp, sell site
  // on flipDown, warm-up or not). History operators inside it therefore see previous CALLS.
  const buySite = { band: null as number | null, rsi: [] as number[] };
  const sellSite = { band: null as number | null, rsi: [] as number[] };

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    const atrValue = effAtrSeries[index] ?? 0;
    const currentTqi = tqiSeries[index] ?? defaultTqiComponents();
    const currentVolatilityRatio = volatilityRatioSeries[index] ?? 1;
    const currentEr = erSeries[index] ?? 0;

    pivotState = calculatePivotAtIndex(bars, index, config.pivotLength, pivotState);

    // Bands use effectiveQualityStrength as it stood at the end of the previous bar.
    const trend = calculateTrend(
      bars,
      config.autoCalibration
        ? { ...config, qualityInfluence: lifecycle.effectiveQualityStrength }
        : config,
      tqiValues,
      effAtrSeries,
      trendState,
      index,
    );

    // Pine 6.5: if not useAutoCalibInput -> effectiveQualityStrength := qualityStrengthInput
    lifecycle.syncQualityStrength();

    // Pine 7: confirmedBuy = flipUp and barstate.isconfirmed and isWarmedUp (EOD bars are confirmed)
    const warmedUp = index >= warmupBars;
    const confirmedBuy = trend.flipUp && warmedUp;
    const confirmedSell = trend.flipDown && warmedUp;
    const signal: SatsBarResult["signal"] = confirmedBuy ? "BUY" : confirmedSell ? "SELL" : "NONE";

    let score = emptyScore();
    let replaced: SatsClosedTrade | null = null;

    // Pine rsiVal = nz(ta.rsi(close, effectiveRsiLen), 50.0)
    const rsiNow = rsiSeries[index] ?? 50;
    const site = trend.flipUp ? buySite : trend.flipDown ? sellSite : null;
    let callBand: number | null = null;
    let callExtreme: { lowest: number | null; highest: number | null } | undefined;
    if (site) {
      callBand = site.band;
      const window = [...site.rsi, rsiNow].slice(-config.rsiMemory);
      callExtreme =
        window.length < config.rsiMemory
          ? { lowest: null, highest: null }
          : { lowest: Math.min(...window), highest: Math.max(...window) };
      site.band = trend.flipUp ? trend.upperBand : trend.lowerBand;
      site.rsi.push(rsiNow);
      if (site.rsi.length > config.rsiMemory) site.rsi.shift();
    }
    const pineCall = config.scoreHistoryMode === "PINE_CALL";

    if (confirmedBuy || confirmedSell) {
      const currentBars = bars.slice(0, index + 1);
      const scoreContext: ScoreContext = {
        isBuy: confirmedBuy,
        isSell: confirmedSell,
        atrValue,
        upperBandPrevious: pineCall ? callBand : previousTrendSnapshot.upperBand,
        lowerBandPrevious: pineCall ? callBand : previousTrendSnapshot.lowerBand,
        lastPivotHigh: pivotState.lastPivotHigh,
        lastPivotLow: pivotState.lastPivotLow,
        rsiValue: rsiSeries[index],
        volumeZ: calculateVolumeZAtIndex(bars, index, config.volumeLength),
        hasVolume: (bar.volume ?? 0) > 0,
        efficiencyRatio: currentEr,
        rsiExtreme: pineCall ? callExtreme : undefined,
      };
      score = calculateScore(currentBars, config, scoreContext);

      const tradeContext: TradeContext = {
        signal,
        atrValue,
        lastPivotHigh: pivotState.lastPivotHigh,
        lastPivotLow: pivotState.lastPivotLow,
        tqi: currentTqi.value,
        volatilityRatio: currentVolatilityRatio,
        barIndex: index,
      };
      const trade = calculateTrade(currentBars, config, tradeContext).trade;

      if (trade) {
        // Pine 7.5: a new signal overwrites the running trade (no result recorded).
        replaced = lifecycle.openTrade(trade, bar, index, currentEr, currentVolatilityRatio);
      }

      lastSignal = {
        signal: confirmedBuy ? "BUY" : "SELL",
        barIndex: index,
        time: bar.time,
        score,
        trade: trade ? { ...trade } : null,
      };
      signalHistory.push(lastSignal);
    }

    // Pine HIT DETECTION: runs after the signal block, only when bar_index > tradeEntryBar.
    const hitEvent = lifecycle.updateTrade(bar, index);
    const tradeEvent: SatsTradeEvent | null =
      hitEvent ??
      (replaced
        ? { tp1HitNow: false, tp2HitNow: false, tp3HitNow: false, slHitNow: false, closed: replaced }
        : null);

    const activeTrade = lifecycle.activeTrade;

    barResults.push({
      time: bar.time,
      signal,
      trend: trend.trend === 1 ? "BULLISH" : "BEARISH",
      regime: determineRegime(currentEr),
      volatilityRegime: determineVolatilityRegime(currentVolatilityRatio),
      tqi: { ...currentTqi },
      score,
      levels: activeTrade
        ? {
            entry: activeTrade.entry,
            sl: activeTrade.sl,
            tp1: activeTrade.tp1,
            tp2: activeTrade.tp2,
            tp3: activeTrade.tp3,
          }
        : { entry: null, sl: null, tp1: null, tp2: null, tp3: null },
      trade: activeTrade,
      tpMode: config.tpMode,
      tpScale: calculateTpScale(currentTqi.value, currentVolatilityRatio, config),
      liveR: activeTrade?.tp1R ?? 1,
      warmedUp,
      tradeEvent,
      debug: {
        rawAtr: atrSeries[index] ?? 0,
        effAtr: atrValue,
        er: currentEr,
        volRatio: currentVolatilityRatio,
        lowerBand: trend.lowerBand,
        upperBand: trend.upperBand,
        lastPivotHigh: pivotState.lastPivotHigh,
        lastPivotLow: pivotState.lastPivotLow,
        rsi: rsiSeries[index],
        volumeZ: calculateVolumeZAtIndex(bars, index, config.volumeLength),
      },
    });

    trendState = {
      lowerBand: trend.lowerBand,
      upperBand: trend.upperBand,
      trend: trend.trend,
      trendStartBar: trend.trendStartBar,
      activeMultiplier: trend.activeMultiplier,
      passiveMultiplier: trend.passiveMultiplier,
    };
    previousTrendSnapshot = { lowerBand: trend.lowerBand, upperBand: trend.upperBand };
  }

  const last = barResults[barResults.length - 1];
  const lastIndex = bars.length - 1;

  return {
    ...last,
    lastSignal,
    signalHistory,
    bars: barResults,
    closedTrades: lifecycle.closedTrades,
    performance: lifecycle.performance(
      erSeries[lastIndex] ?? 0,
      volatilityRatioSeries[lastIndex] ?? 1,
    ),
    resolvedPreset,
    version: "1.9.0",
  };
}

/* =========================================================
   ATR
   ========================================================= */

function buildAtrSeries(
  bars: SatsInputBar[],
  length: number,
): number[] {
  const result =
    bars.map(() => 0);

  if (
    length <= 0 ||
    bars.length < length
  ) {
    return result;
  }

  const trueRanges: number[] =
    [];

  for (
    let i = 0;
    i < bars.length;
    i += 1
  ) {
    const previousClose =
      i > 0
        ? bars[i - 1].close
        : bars[i].close;

    const trueRange =
      Math.max(
        bars[i].high -
          bars[i].low,

        Math.abs(
          bars[i].high -
            previousClose,
        ),

        Math.abs(
          bars[i].low -
            previousClose,
        ),
      );

    trueRanges.push(
      trueRange,
    );
  }

  let current =
    trueRanges
      .slice(0, length)
      .reduce(
        (sum, value) =>
          sum + value,
        0,
      ) / length;

  result[length - 1] =
    current;

  for (
    let i = length;
    i < trueRanges.length;
    i += 1
  ) {
    current =
      (
        current *
          (length - 1) +
        trueRanges[i]
      ) / length;

    result[i] =
      current;
  }

  return result;
}

/* =========================================================
   SMA
   ========================================================= */

function buildSmaSeries(
  values: number[],
  length: number,
): number[] {
  const result =
    values.map(() => 0);

  if (
    length <= 0 ||
    values.length < length
  ) {
    return result;
  }

  let rollingSum = 0;

  for (
    let i = 0;
    i < values.length;
    i += 1
  ) {
    rollingSum +=
      values[i];

    if (i >= length) {
      rollingSum -=
        values[i - length];
    }

    if (
      i >= length - 1
    ) {
      result[i] =
        rollingSum / length;
    }
  }

  return result;
}

/* =========================================================
   TQI
   ========================================================= */

function buildTqiSeries(
  bars: SatsInputBar[],
  config: SatsConfig,
  volatilityRatios: number[],
): TqiComponents[] {
  const result =
    bars.map(
      () =>
        defaultTqiComponents(),
    );

  const closes =
    bars.map(
      (bar) => bar.close,
    );

  for (
    let index = 0;
    index < bars.length;
    index += 1
  ) {
    const er =
      calculateEfficiencyRatioAtIndex(
        bars,
        index,
        config.erLength,
      );

    const volumeZ =
      calculateVolumeZAtIndex(
        bars,
        index,
        config.volumeLength,
      );

    const hasVolume =
      bars[index].volume != null &&
      (bars[index].volume ?? 0) > 0;

    const volatility =
      hasVolume
        ? mapClampLocal(
            volumeZ ?? 0,
            -1,
            2,
            0,
            1,
          )
        : mapClampLocal(
            volatilityRatios[index] ?? 1,
            0.6,
            1.8,
            0,
            1,
          );

    const structure =
      calculateStructureComponent(
        bars,
        index,
        config.tqiStructureLength,
      );

    const momentum =
      calculateMomentumPersistenceAtIndex(
        closes,
        index,
        config.tqiMomentumLength,
      );

    const erComponent =
      clamp(
        er,
        0,
        1,
      );

    const weightSum =
      config.tqiErWeight +
      config.tqiVolWeight +
      config.tqiStructureWeight +
      config.tqiMomentumWeight;

    const denominator =
      weightSum > 0
        ? weightSum
        : 1;

    const value =
      config.useTqi
        ? (
            erComponent *
              config.tqiErWeight +

            volatility *
              config.tqiVolWeight +

            structure *
              config.tqiStructureWeight +

            momentum *
              config.tqiMomentumWeight
          ) / denominator
        : 0.5;

    result[index] = {
      value:
        clamp(
          value,
          0,
          1,
        ),

      er:
        erComponent,

      volatility,

      structure,

      momentum,
    };
  }

  return result;
}

function calculateStructureComponent(
  bars: SatsInputBar[],
  index: number,
  length: number,
): number {
  // Pine ta.highest/ta.lowest(..., length) are na until `length` bars exist
  // -> structRange na -> pricePos fallback 0.5 -> structure component 0.
  if (index < length - 1) {
    return 0;
  }

  const start =
    Math.max(
      0,
      index - length + 1,
    );

  const window =
    bars.slice(
      start,
      index + 1,
    );

  if (window.length === 0) {
    return 0.5;
  }

  const high =
    Math.max(
      ...window.map(
        (bar) => bar.high,
      ),
    );

  const low =
    Math.min(
      ...window.map(
        (bar) => bar.low,
      ),
    );

  const range =
    high - low;

  const pricePosition =
    safeDiv(
      bars[index].close -
        low,
      range,
      0.5,
    );

  return clamp(
    Math.abs(
      pricePosition - 0.5,
    ) * 2,
    0,
    1,
  );
}

/* =========================================================
   EFFICIENCY RATIO
   ========================================================= */

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

  const change =
    Math.abs(
      bars[index].close -
        bars[index - length].close,
    );

  let volatility = 0;

  for (
    let i =
      index - length + 1;
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

/* =========================================================
   MOMENTUM PERSISTENCE
   ========================================================= */

function calculateMomentumPersistenceAtIndex(
  closes: number[],
  index: number,
  length: number,
): number {
  if (
    length <= 0 ||
    index < length
  ) {
    return 0;
  }

  const windowChange =
    closes[index] -
    closes[index - length];

  if (windowChange === 0) {
    return 0;
  }

  let alignedBars = 0;

  for (
    let i = 0;
    i < length;
    i += 1
  ) {
    const currentIndex =
      index - i;

    const previousIndex =
      currentIndex - 1;

    const barChange =
      closes[currentIndex] -
      closes[previousIndex];

    if (
      (
        windowChange > 0 &&
        barChange > 0
      ) ||
      (
        windowChange < 0 &&
        barChange < 0
      )
    ) {
      alignedBars += 1;
    }
  }

  return safeDiv(
    alignedBars,
    length,
    0,
  );
}

/* =========================================================
   VOLUME Z-SCORE
   ========================================================= */

function calculateVolumeZAtIndex(
  bars: SatsInputBar[],
  index: number,
  length: number,
): number | null {
  if (
    length <= 0 ||
    index < length - 1
  ) {
    return null;
  }

  const values =
    bars
      .slice(
        index - length + 1,
        index + 1,
      )
      .map(
        (bar) =>
          bar.volume ?? 0,
      );

  return zScore(
    values,
    length,
  );
}

/* =========================================================
   RSI
   ========================================================= */

/** Acuan RSI per bar (dipakai untuk memeriksa versi satu-lintasan di bawah). */
export function calculateRsiAtIndex(
  bars: SatsInputBar[],
  index: number,
  length: number,
): number | null {
  if (
    length <= 0 ||
    index < length
  ) {
    return null;
  }

  const gains: number[] =
    [];

  const losses: number[] =
    [];

  for (
    let i = 1;
    i <= index;
    i += 1
  ) {
    const change =
      bars[i].close -
      bars[i - 1].close;

    gains.push(
      Math.max(
        change,
        0,
      ),
    );

    losses.push(
      Math.max(
        -change,
        0,
      ),
    );
  }

  if (
    gains.length < length
  ) {
    return null;
  }

  let averageGain =
    gains
      .slice(0, length)
      .reduce(
        (sum, value) =>
          sum + value,
        0,
      ) / length;

  let averageLoss =
    losses
      .slice(0, length)
      .reduce(
        (sum, value) =>
          sum + value,
        0,
      ) / length;

  for (
    let i = length;
    i < gains.length;
    i += 1
  ) {
    averageGain =
      (
        averageGain *
          (length - 1) +
        gains[i]
      ) / length;

    averageLoss =
      (
        averageLoss *
          (length - 1) +
        losses[i]
      ) / length;
  }

  if (
    averageLoss === 0
  ) {
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

/** All bars at once; value at i equals calculateRsiAtIndex(bars, i, length). */
function buildRsiSeriesFull(
  bars: SatsInputBar[],
  length: number,
): (number | null)[] {
  const result: (number | null)[] = bars.map(() => null);
  if (length <= 0 || bars.length <= length) {
    return result;
  }
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const change = bars[i].close - bars[i - 1].close;
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }
  let averageGain = gains.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  let averageLoss = losses.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  const toRsi = () =>
    averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  result[length] = toRsi();
  for (let i = length; i < gains.length; i += 1) {
    averageGain = (averageGain * (length - 1) + gains[i]) / length;
    averageLoss = (averageLoss * (length - 1) + losses[i]) / length;
    result[i + 1] = toRsi();
  }
  return result;
}

/* =========================================================
   PIVOTS
   ========================================================= */

function calculatePivotAtIndex(
  bars: SatsInputBar[],
  index: number,
  length: number,
  previousState: InternalPivotState,
): InternalPivotState {
  if (
    length <= 0 ||
    index < length * 2
  ) {
    return previousState;
  }

  const candidateIndex =
    index - length;

  const candidate =
    bars[candidateIndex];

  let isHigh = true;
  let isLow = true;

  for (
    let offset = 1;
    offset <= length;
    offset += 1
  ) {
    const left =
      bars[
        candidateIndex - offset
      ];

    const right =
      bars[
        candidateIndex + offset
      ];

    if (
      left.high >
        candidate.high ||
      right.high >
        candidate.high
    ) {
      isHigh = false;
    }

    if (
      left.low <
        candidate.low ||
      right.low <
        candidate.low
    ) {
      isLow = false;
    }
  }

  return {
    lastPivotHigh:
      isHigh
        ? candidate.high
        : previousState.lastPivotHigh,

    lastPivotLow:
      isLow
        ? candidate.low
        : previousState.lastPivotLow,
  };
}

/* =========================================================
   DYNAMIC TP
   ========================================================= */

function calculateTpScale(
  tqi: number,
  volatilityRatio: number,
  config: SatsConfig,
): number {
  if (
    config.tpMode !==
    "DYNAMIC"
  ) {
    return 1;
  }

  const tqiComponent =
    clamp(
      tqi,
      0,
      1,
    );

  const volatilityComponent =
    clamp(
      mapClampLocal(
        volatilityRatio,
        0.5,
        2,
        0,
        1,
      ),
      0,
      1,
    );

  const weightSum =
    config.dynamicTpTqiWeight +
    config.dynamicTpVolWeight;

  const denominator =
    weightSum > 0
      ? weightSum
      : 1;

  const rawScale =
    (
      tqiComponent *
        config.dynamicTpTqiWeight +

      volatilityComponent *
        config.dynamicTpVolWeight
    ) / denominator;

  return (
    config.dynamicTpMinScale +
    rawScale *
      (
        config.dynamicTpMaxScale -
        config.dynamicTpMinScale
      )
  );
}

/* =========================================================
   HELPERS
   ========================================================= */

// Pine dashboard: regimeStr from erValue (ER_HIGH_THRESH 0.50 / ER_LOW_THRESH 0.25)
function determineRegime(
  er: number,
): "TRENDING" | "MIXED" | "CHOPPY" {
  if (er >= 0.5) {
    return "TRENDING";
  }
  if (er >= 0.25) {
    return "MIXED";
  }
  return "CHOPPY";
}

// Pine dashboard: volRegStr (VOL_LOW_THRESH 0.7 / VOL_HIGH_THRESH 1.3)
function determineVolatilityRegime(
  ratio: number,
): "LOW" | "NORMAL" | "HIGH" {
  if (ratio < 0.7) {
    return "LOW";
  }
  if (ratio < 1.3) {
    return "NORMAL";
  }
  return "HIGH";
}

function calculateWarmupBars(
  config: SatsConfig,
): number {
  // Pine: warmupBars = math.max(WARMUP_FLOOR, math.max(atr, er, rsi, vol, pivot*2+1, mom, struct) + 10)
  // (the +10 is inside the outer max, so the floor of 50 is NOT increased)
  return Math.max(
    50,
    Math.max(
      config.atrLength,
      config.erLength,
      config.rsiLength,
      config.volumeLength,
      config.pivotLength * 2 + 1,
      config.tqiMomentumLength,
      config.tqiStructureLength,
    ) + 10,
  );
}

function mapClampLocal(
  value: number,
  sourceMin: number,
  sourceMax: number,
  targetMin: number,
  targetMax: number,
): number {
  if (
    sourceMax ===
    sourceMin
  ) {
    return targetMin;
  }

  const normalized =
    (
      value - sourceMin
    ) /
    (
      sourceMax - sourceMin
    );

  const clamped =
    clamp(
      normalized,
      0,
      1,
    );

  return (
    targetMin +
    clamped *
      (
        targetMax -
        targetMin
      )
  );
}

function defaultTqiComponents():
  TqiComponents {
  return {
    value: 0.5,
    er: 0.5,
    volatility: 0.5,
    structure: 0.5,
    momentum: 0.5,
  };
}

function emptyScore():
  SatsScore {
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

function emptyResult():
  SatsResult {
  return {
    time: 0,

    signal:
      "NONE",

    trend:
      "BULLISH",

    regime:
      "MIXED",

    volatilityRegime:
      "NORMAL",

    tqi:
      defaultTqiComponents(),

    score:
      emptyScore(),

    levels: {
      entry: null,
      sl: null,
      tp1: null,
      tp2: null,
      tp3: null,
    },

    trade:
      null,

lastSignal:
  null,

signalHistory:
  [],

bars:
  [],

    tpMode:
      "FIXED",

    tpScale:
      1,

    liveR:
      1,

    warmedUp:
      false,
    tradeEvent:
      null,
    closedTrades:
      [],
    performance: {
      sampleCount: 0,
      winRate: null,
      avgR: null,
      windowDrawdownR: null,
      allTimeCount: 0,
      allTimeDrawdownR: null,
      curWinStreak: 0,
      maxWinStreak: 0,
      curLossStreak: 0,
      maxLossStreak: 0,
      regimeEdgeR: null,
      regimeEdgeCount: 0,
      effectiveQualityStrength: SATS_DEFAULT_CONFIG.qualityInfluence,
    },
    resolvedPreset:
      "SWING",

    version:

      "1.9.0",
  };
}