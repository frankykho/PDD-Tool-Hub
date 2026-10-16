import type {
  SatsConfig,
  SatsInputBar,
  SatsTrade,
} from "./types";
import {
  clamp,
  mapClamp,
  safeDiv,
} from "./math";

export interface TradeCalculation {
  trade: SatsTrade | null;
  tpScale: number;
  liveR: number;
}

export interface TradeContext {
  signal: "BUY" | "SELL" | "NONE";
  atrValue: number;
  lastPivotHigh: number | null;
  lastPivotLow: number | null;
  tqi: number;
  volatilityRatio: number;
  barIndex: number;
}

export function calculateTrade(
  bars: SatsInputBar[],
  config: SatsConfig,
  context: TradeContext,
): TradeCalculation {
  if (
    bars.length === 0 ||
    context.signal === "NONE"
  ) {
    return {
      trade: null,
      tpScale: 1,
      liveR: 1,
    };
  }

  const currentBar =
    bars[bars.length - 1];

  const entry =
    currentBar.close;

  const tpScale =
    config.tpMode === "DYNAMIC"
      ? calculateDynamicTpScale(
          context.tqi,
          context.volatilityRatio,
          config,
        )
      : 1;

  const liveR =
    calculateLiveRMultiples(
      config,
      tpScale,
    );

  if (context.signal === "BUY") {
    const slBase =
      context.lastPivotLow ??
      currentBar.low;

    const rawSl =
      slBase -
      config.slAtrMultiplier *
        context.atrValue;

    const minSl =
      entry -
      config.slAtrMultiplier *
        context.atrValue;

    const sl =
      Math.min(
        rawSl,
        minSl,
      );

    const risk =
      entry - sl;

    return {
      trade: {
        direction: "BUY",
        entryBar: context.barIndex,
        entry,
        sl,
        tp1:
          entry +
          risk * liveR.tp1,
        tp2:
          entry +
          risk * liveR.tp2,
        tp3:
          entry +
          risk * liveR.tp3,
        tp1R: liveR.tp1,
        tp2R: liveR.tp2,
        tp3R: liveR.tp3,
        risk,
        tp1Hit: false,
        tp2Hit: false,
        tp3Hit: false,
      },
      tpScale,
      liveR: liveR.tp1,
    };
  }

  const slBase =
    context.lastPivotHigh ??
    currentBar.high;

  const rawSl =
    slBase +
    config.slAtrMultiplier *
      context.atrValue;

  const minSl =
    entry +
    config.slAtrMultiplier *
      context.atrValue;

  const sl =
    Math.max(
      rawSl,
      minSl,
    );

  const risk =
    sl - entry;

  return {
    trade: {
      direction: "SELL",
      entryBar: context.barIndex,
      entry,
      sl,
      tp1:
        entry -
        risk * liveR.tp1,
      tp2:
        entry -
        risk * liveR.tp2,
      tp3:
        entry -
        risk * liveR.tp3,
      tp1R: liveR.tp1,
      tp2R: liveR.tp2,
      tp3R: liveR.tp3,
      risk,
      tp1Hit: false,
      tp2Hit: false,
      tp3Hit: false,
    },
    tpScale,
    liveR: liveR.tp1,
  };
}

function calculateDynamicTpScale(
  tqi: number,
  volatilityRatio: number,
  config: SatsConfig,
): number {
  /*
   * SATS 1.9.0:
   *
   * tqiComp = clamp(tqi, 0, 1)
   *
   * volComp =
   *   clamp(
   *     mapClamp(
   *       volRatio,
   *       0.5,
   *       2.0,
   *       0,
   *       1
   *     ),
   *     0,
   *     1
   *   )
   *
   * rawScale =
   *   (tqiComp * tqiWeight +
   *    volComp * volWeight) /
   *   weightSum
   *
   * finalScale =
   *   minScale +
   *   rawScale *
   *   (maxScale - minScale)
   */

  const tqiComp =
    clamp(tqi, 0, 1);

  const volComp =
    clamp(
      mapClamp(
        volatilityRatio,
        0.5,
        2.0,
        0,
        1,
      ),
      0,
      1,
    );

  const weightSum =
    config.dynamicTpTqiWeight +
    config.dynamicTpVolWeight;

  const weightDenom =
    weightSum > 0
      ? weightSum
      : 1;

  const rawScale =
    (
      tqiComp *
        config.dynamicTpTqiWeight +
      volComp *
        config.dynamicTpVolWeight
    ) / weightDenom;

  return (
    config.dynamicTpMinScale +
    rawScale *
      (
        config.dynamicTpMaxScale -
        config.dynamicTpMinScale
      )
  );
}

function calculateLiveRMultiples(
  config: SatsConfig,
  dynScale: number,
): {
  tp1: number;
  tp2: number;
  tp3: number;
} {
  /*
   * SATS first sorts the configured
   * fixed TP R-multiples.
   */
  const fixedTp1 =
    Math.min(
      config.tp1R,
      Math.min(
        config.tp2R,
        config.tp3R,
      ),
    );

  const fixedTp3 =
    Math.max(
      config.tp1R,
      Math.max(
        config.tp2R,
        config.tp3R,
      ),
    );

  const fixedTp2 =
    config.tp1R +
    config.tp2R +
    config.tp3R -
    fixedTp1 -
    fixedTp3;

  if (config.tpMode !== "DYNAMIC") {
    return {
      tp1: fixedTp1,
      tp2: fixedTp2,
      tp3: fixedTp3,
    };
  }

  /*
   * SATS dynamic TP floors.
   */
  const tp1Floor =
    config.dynamicTp1Floor;

  const tp2Floor =
    config.dynamicTp1Floor *
    (
      fixedTp2 /
      Math.max(
        fixedTp1,
        0.01,
      )
    );

  const tp3Floor =
    config.dynamicTp1Floor *
    (
      fixedTp3 /
      Math.max(
        fixedTp1,
        0.01,
      )
    );

  const effTp1 =
    clamp(
      fixedTp1 * dynScale,
      tp1Floor,
      config.dynamicTp3Ceiling,
    );

  const effTp2 =
    clamp(
      fixedTp2 * dynScale,
      tp2Floor,
      config.dynamicTp3Ceiling,
    );

  const effTp3 =
    clamp(
      fixedTp3 * dynScale,
      tp3Floor,
      config.dynamicTp3Ceiling,
    );

  /*
   * SATS re-sorts after scaling.
   */
  const sortedTp1 =
    Math.min(
      effTp1,
      Math.min(
        effTp2,
        effTp3,
      ),
    );

  const sortedTp3 =
    Math.max(
      effTp1,
      Math.max(
        effTp2,
        effTp3,
      ),
    );

  const sortedTp2 =
    effTp1 +
    effTp2 +
    effTp3 -
    sortedTp1 -
    sortedTp3;

  return {
    tp1: sortedTp1,
    tp2: sortedTp2,
    tp3: sortedTp3,
  };
}