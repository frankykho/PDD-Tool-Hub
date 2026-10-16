export type SatsSignal = "BUY" | "SELL" | "NONE";

export type SatsTrend = "BULLISH" | "BEARISH";

export type SatsRegime = "TRENDING" | "MIXED" | "CHOPPY";

export type SatsVolRegime = "LOW" | "NORMAL" | "HIGH";

export type SatsTpMode = "FIXED" | "DYNAMIC";

export interface SatsInputBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

export interface SatsLevels {
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
}

export interface SatsTqi {
  value: number;
  er: number;
  volatility: number;
  structure: number;
  momentum: number;
}

export interface SatsScore {
  total: number | null;
  momentum: number | null;
  er: number | null;
  volume: number | null;
  rsi: number | null;
  structure: number | null;
  breakDepth: number | null;
}

export interface SatsTrade {
  direction: "BUY" | "SELL";
  entryBar: number;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1R: number;
  tp2R: number;
  tp3R: number;
  risk: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
}

export interface SatsSignalEvent {
  signal: "BUY" | "SELL";
  barIndex: number;
  time: number;
  score: SatsScore;
  trade: SatsTrade | null;
}

export interface SatsBarResult {
  time: number;
  signal: SatsSignal;
  trend: SatsTrend;
  regime: SatsRegime;
  volatilityRegime: SatsVolRegime;
  tqi: SatsTqi;
  score: SatsScore;
  levels: SatsLevels;
  trade: SatsTrade | null;
  tpMode: SatsTpMode;
  tpScale: number;
  liveR: number;
  warmedUp: boolean;
  /** Lifecycle events that happened on this bar (after the trade state update). */
  tradeEvent: SatsTradeEvent | null;
  /** Intermediate values for parity audits vs TradingView (not for storage). */
  debug: SatsBarDebug;
}

export interface SatsBarDebug {
  rawAtr: number;
  effAtr: number;
  er: number;
  volRatio: number;
  lowerBand: number | null;
  upperBand: number | null;
  lastPivotHigh: number | null;
  lastPivotLow: number | null;
  rsi: number | null;
  volumeZ: number | null;
}

export interface SatsResult {
  time: number;

  signal: SatsSignal;

  trend: SatsTrend;

  regime: SatsRegime;

  volatilityRegime: SatsVolRegime;

  tqi: SatsTqi;

  score: SatsScore;

  levels: SatsLevels;

  trade: SatsTrade | null;

  tpMode: SatsTpMode;

  tpScale: number;

  liveR: number;

  warmedUp: boolean;

  tradeEvent: SatsTradeEvent | null;

  lastSignal: SatsSignalEvent | null;

signalHistory: SatsSignalEvent[];

bars: SatsBarResult[];

  /** Every trade that ended (TP3 / SL / TIMEOUT counted; REPLACED not counted, as in Pine). */
  closedTrades: SatsClosedTrade[];

  /** Pine dashboard "Performance" block, computed exactly like SATS v1.9.0. */
  performance: SatsPerformance;

  /** Resolved preset actually used (Pine "Auto" resolves by timeframe). */
  resolvedPreset: SatsResolvedPreset;

  version: "1.9.0";
}

export type SatsPreset =
  | "AUTO"
  | "CUSTOM"
  | "SCALPING"
  | "DEFAULT"
  | "SWING"
  | "CRYPTO";

export type SatsResolvedPreset = Exclude<SatsPreset, "AUTO">;

export type SatsExitReason = "TP3" | "SL" | "TIMEOUT" | "REPLACED";

export interface SatsTradeEvent {
  tp1HitNow: boolean;
  tp2HitNow: boolean;
  tp3HitNow: boolean;
  slHitNow: boolean;
  closed: SatsClosedTrade | null;
}

export interface SatsClosedTrade {
  direction: "BUY" | "SELL";
  entryBar: number;
  entryTime: number;
  exitBar: number;
  exitTime: number;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  reason: SatsExitReason;
  /** Realized R per Pine calcRealizedR / calcTimeoutR, clamped to [-1, tp3R]. null for REPLACED. */
  realizedR: number | null;
  /** false for REPLACED: Pine overwrites the trade without recording a result. */
  counted: boolean;
}

export interface SatsPerformance {
  sampleCount: number;
  winRate: number | null;
  avgR: number | null;
  windowDrawdownR: number | null;
  allTimeCount: number;
  allTimeDrawdownR: number | null;
  curWinStreak: number;
  maxWinStreak: number;
  curLossStreak: number;
  maxLossStreak: number;
  regimeEdgeR: number | null;
  regimeEdgeCount: number;
  effectiveQualityStrength: number;
}

export interface SatsConfig {
  atrLength: number;
  baseMultiplier: number;

  erLength: number;

  rsiLength: number;
  rsiOverbought: number;
  rsiOversold: number;
  rsiMemory: number;

  volumeLength: number;

  tqiErWeight: number;
  tqiVolWeight: number;
  tqiStructureWeight: number;
  tqiMomentumWeight: number;

  tqiStructureLength: number;
  tqiMomentumLength: number;

  adaptiveBands: boolean;
  adaptationStrength: number;
  atrBaselineLength: number;

  useTqi: boolean;
  qualityInfluence: number;
  qualityCurve: number;
  smoothMultipliers: boolean;

  asymmetricBands: boolean;
  asymmetryStrength: number;

  efficiencyWeightedAtr: boolean;

  characterFlip: boolean;
  characterFlipMinAge: number;
  characterFlipHighTqi: number;
  characterFlipLowTqi: number;

  structureScore: boolean;
  pivotLength: number;

  volumeScore: boolean;
  rsiScore: boolean;

  minimumScore: number;

  slAtrMultiplier: number;

  tpMode: SatsTpMode;
  tp1R: number;
  tp2R: number;
  tp3R: number;

  dynamicTpTqiWeight: number;
  dynamicTpVolWeight: number;
  dynamicTpMinScale: number;
  dynamicTpMaxScale: number;
  dynamicTp1Floor: number;
  dynamicTp3Ceiling: number;

  timeoutBars: number;

  /** Pine "Preset". Default "AUTO" = Pine default. */
  preset: SatsPreset;
  /** Chart timeframe in minutes, used by AUTO preset (Daily = 1440). */
  timeframeMinutes: number;

  /**
   * How history references inside Pine's calcScoreBreakdown are evaluated.
   * PINE_CALL (default): like TradingView — the function only runs on flip bars, so
   *   upperBand[1]/lowerBand[1] and ta.lowest/highest(rsiVal, memory) see the previous
   *   CALLS of that call site (previous BUY for BUY, previous SELL for SELL).
   * BAR: textbook reading (previous bar / last N bars). Kept for audits.
   */
  scoreHistoryMode: "PINE_CALL" | "BAR";

  /** Self-learning (Pine default OFF). */
  autoCalibration: boolean;
  calibrationWindow: number;
  calibrationBadR: number;
  calibrationGoodR: number;
  calibrationStep: number;
  calibrationCooldown: number;
  calibrationMinQuality: number;
  calibrationMaxQuality: number;
}

export const SATS_VERSION = "1.9.0" as const;