import type { SatsConfig, SatsResolvedPreset } from "./types";

export const SATS_DEFAULT_CONFIG: SatsConfig = {
  atrLength: 13, // Pine atrLenInput default (used only when preset resolves to CUSTOM)
  baseMultiplier: 2.0,

  erLength: 20,

  rsiLength: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  rsiMemory: 20,

  volumeLength: 20,

  tqiErWeight: 0.35,
  tqiVolWeight: 0.20,
  tqiStructureWeight: 0.25,
  tqiMomentumWeight: 0.20,

  tqiStructureLength: 20,
  tqiMomentumLength: 10,

  adaptiveBands: true,
  adaptationStrength: 0.5,
  atrBaselineLength: 100,

  useTqi: true,
  qualityInfluence: 0.4,
  qualityCurve: 1.5,
  smoothMultipliers: true,

  asymmetricBands: true,
  asymmetryStrength: 0.5,

  efficiencyWeightedAtr: true,

  characterFlip: true,
  characterFlipMinAge: 5,
  characterFlipHighTqi: 0.55,
  characterFlipLowTqi: 0.25,

  structureScore: true,
  pivotLength: 3,

  volumeScore: true,
  rsiScore: true,

  minimumScore: 60,

  slAtrMultiplier: 1.5,

  tpMode: "FIXED",
  tp1R: 1.0,
  tp2R: 2.0,
  tp3R: 3.0,

  dynamicTpTqiWeight: 0.6,
  dynamicTpVolWeight: 0.4,
  dynamicTpMinScale: 0.5,
  dynamicTpMaxScale: 2.0,
  dynamicTp1Floor: 0.5,
  dynamicTp3Ceiling: 8.0,

  timeoutBars: 100,

  scoreHistoryMode: "PINE_CALL",

  preset: "AUTO",
  timeframeMinutes: 1440,

  autoCalibration: false,
  calibrationWindow: 20,
  calibrationBadR: 0.0,
  calibrationGoodR: 0.7,
  calibrationStep: 0.05,
  calibrationCooldown: 5,
  calibrationMinQuality: 0.1,
  calibrationMaxQuality: 0.9,
};

/**
 * Pine section 3.5 — PRESET RESOLUTION.
 *
 *   resolvedPreset := tfMinutes <= 5 ? "Scalping" : (tfMinutes <= 240 ? "Default" : "Swing")
 *
 * Non-Custom presets override ATR length, base multiplier, ER length,
 * RSI length and SL ATR multiplier. The numbers above (atrLength,
 * baseMultiplier, ...) are Pine's *input* values and are only used when
 * the preset resolves to CUSTOM.
 */
const PRESET_VALUES: Record<
  Exclude<SatsResolvedPreset, "CUSTOM">,
  Pick<SatsConfig, "atrLength" | "baseMultiplier" | "erLength" | "rsiLength" | "slAtrMultiplier">
> = {
  SCALPING: { atrLength: 10, baseMultiplier: 1.5, erLength: 14, rsiLength: 9, slAtrMultiplier: 1.0 },
  DEFAULT: { atrLength: 14, baseMultiplier: 2.0, erLength: 20, rsiLength: 14, slAtrMultiplier: 1.5 },
  SWING: { atrLength: 21, baseMultiplier: 2.5, erLength: 30, rsiLength: 21, slAtrMultiplier: 2.0 },
  CRYPTO: { atrLength: 14, baseMultiplier: 2.8, erLength: 20, rsiLength: 14, slAtrMultiplier: 2.5 },
};

export function resolvePreset(config: SatsConfig): SatsResolvedPreset {
  if (config.preset !== "AUTO") {
    return config.preset;
  }
  if (config.timeframeMinutes <= 5) {
    return "SCALPING";
  }
  return config.timeframeMinutes <= 240 ? "DEFAULT" : "SWING";
}

/** Returns the config with Pine's effective* values applied. */
export function resolveSatsConfig(config: SatsConfig): {
  config: SatsConfig;
  resolvedPreset: SatsResolvedPreset;
} {
  const resolvedPreset = resolvePreset(config);
  if (resolvedPreset === "CUSTOM") {
    return { config, resolvedPreset };
  }
  return {
    config: { ...config, ...PRESET_VALUES[resolvedPreset] },
    resolvedPreset,
  };
}