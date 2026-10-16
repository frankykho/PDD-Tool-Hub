/**
 * SATS v1.9.0 — trade lifecycle, performance stats and self-learning.
 *
 * Direct port of these Pine sections:
 *   5    calcRealizedR / calcTimeoutR
 *   5.5  SELF-LEARNING STORAGE (signalRBuffer, grid, calcRollingStats)
 *   6.5  LEARNING STATE (streaks, all-time stats, effectiveQualityStrength)
 *   7.5  UNIFIED ACTIVE TRADE STATE (new signal overwrites the trade)
 *   HIT DETECTION + LEARNING FEEDBACK
 *
 * Order inside one bar (same as Pine, top to bottom):
 *   1. bands/trend use effectiveQualityStrength from the END of the previous bar
 *   2. if !autoCalibration -> effectiveQualityStrength = qualityInfluence
 *   3. confirmed signal  -> openTrade()   (old trade is dropped, NOT recorded)
 *   4. updateTrade()     -> only when bar_index > entryBar
 */
import type {
  SatsClosedTrade,
  SatsConfig,
  SatsInputBar,
  SatsPerformance,
  SatsTrade,
  SatsTradeEvent,
} from "./types";

const MAX_HISTORY_SIGS = 100;
const EWMA_ALPHA = 0.2;
const ER_LOW_THRESH = 0.25;
const ER_HIGH_THRESH = 0.5;
const VOL_LOW_THRESH = 0.7;
const VOL_HIGH_THRESH = 1.3;

export function erBin(er: number): number {
  return er < ER_LOW_THRESH ? 0 : er < ER_HIGH_THRESH ? 1 : 2;
}

export function volBin(volRatio: number): number {
  return volRatio < VOL_LOW_THRESH ? 0 : volRatio < VOL_HIGH_THRESH ? 1 : 2;
}

export function cellIdx(er: number, volRatio: number): number {
  return erBin(er) * 3 + volBin(volRatio);
}

/** Pine calcRealizedR */
export function calcRealizedR(
  slHit: boolean,
  tp1H: boolean,
  tp2H: boolean,
  tp3H: boolean,
  tp1R: number,
  tp2R: number,
  tp3R: number,
): number {
  if (tp3H) {
    return (tp1R + tp2R + tp3R) / 3;
  }
  if (slHit) {
    let taken = 0;
    let remaining = 1;
    if (tp1H) {
      taken += (1 / 3) * tp1R;
      remaining -= 1 / 3;
    }
    if (tp2H) {
      taken += (1 / 3) * tp2R;
      remaining -= 1 / 3;
    }
    return taken + remaining * -1;
  }
  return 0;
}

/** Pine calcTimeoutR — remaining position closes flat (0R). */
export function calcTimeoutR(
  tp1H: boolean,
  tp2H: boolean,
  tp3H: boolean,
  tp1R: number,
  tp2R: number,
  tp3R: number,
): number {
  let taken = 0;
  if (tp1H) taken += (1 / 3) * tp1R;
  if (tp2H) taken += (1 / 3) * tp2R;
  if (tp3H) taken += (1 / 3) * tp3R;
  return taken;
}

interface ActiveTrade {
  trade: SatsTrade;
  entryTime: number;
  cell: number;
}

export class SatsLifecycle {
  private active: ActiveTrade | null = null;

  // Pine: signalRBuffer, gridCount, gridEwmR
  private readonly rBuffer: number[] = [];
  private readonly gridCount: number[] = new Array(9).fill(0);
  private readonly gridEwm: number[] = new Array(9).fill(0);

  // Pine: LEARNING STATE
  private allTimeCount = 0;
  private allTimeCumR = 0;
  private allTimePeak = 0;
  private allTimeTrough = 0;
  private curWinStreak = 0;
  private curLossStreak = 0;
  private maxWinStreak = 0;
  private maxLossStreak = 0;
  private signalsSinceCalib = 0;

  /** Pine `var float effectiveQualityStrength` */
  effectiveQualityStrength: number;

  readonly closedTrades: SatsClosedTrade[] = [];

  constructor(private readonly config: SatsConfig) {
    this.effectiveQualityStrength = config.qualityInfluence;
  }

  /** Pine: `if not useAutoCalibInput -> effectiveQualityStrength := qualityStrengthInput` (runs every bar, after the bands). */
  syncQualityStrength(): void {
    if (!this.config.autoCalibration) {
      this.effectiveQualityStrength = this.config.qualityInfluence;
    }
  }

  get activeTrade(): SatsTrade | null {
    return this.active ? { ...this.active.trade } : null;
  }

  /**
   * Pine 7.5 `if confirmedBuy / confirmedSell`: the previous trade is
   * overwritten WITHOUT pushing a result to the learning buffer.
   * We still log it as REPLACED (counted=false) for the dashboard.
   */
  openTrade(
    trade: SatsTrade,
    bar: SatsInputBar,
    barIndex: number,
    er: number,
    volRatio: number,
  ): SatsClosedTrade | null {
    let replaced: SatsClosedTrade | null = null;
    if (this.active) {
      replaced = this.toClosed(this.active, barIndex, bar.time, "REPLACED", null, false);
      this.closedTrades.push(replaced);
    }
    this.active = {
      trade: { ...trade, tp1Hit: false, tp2Hit: false, tp3Hit: false },
      entryTime: bar.time,
      cell: cellIdx(er, volRatio),
    };
    return replaced;
  }

  /** Pine "HIT DETECTION + LEARNING FEEDBACK". Call after openTrade() on every bar. */
  updateTrade(bar: SatsInputBar, barIndex: number): SatsTradeEvent | null {
    const a = this.active;
    if (!a || barIndex <= a.trade.entryBar) {
      return null;
    }
    const t = a.trade;
    const isBuy = t.direction === "BUY";

    const tp1Reached = isBuy ? bar.high >= t.tp1 : bar.low <= t.tp1;
    const tp2Reached = isBuy ? bar.high >= t.tp2 : bar.low <= t.tp2;
    const tp3Reached = isBuy ? bar.high >= t.tp3 : bar.low <= t.tp3;
    const slHit = isBuy ? bar.low <= t.sl : bar.high >= t.sl;
    const timeoutHit = barIndex - t.entryBar >= this.config.timeoutBars;

    const event: SatsTradeEvent = {
      tp1HitNow: tp1Reached && !t.tp1Hit,
      tp2HitNow: tp2Reached && !t.tp2Hit,
      tp3HitNow: tp3Reached && !t.tp3Hit,
      slHitNow: slHit,
      closed: null,
    };

    if (tp1Reached) t.tp1Hit = true;
    if (tp2Reached) t.tp2Hit = true;
    if (tp3Reached) t.tp3Hit = true;

    if (!(t.tp3Hit || slHit || timeoutHit)) {
      return event.tp1HitNow || event.tp2HitNow || event.tp3HitNow ? event : null;
    }

    let realizedR =
      t.tp3Hit || slHit
        ? calcRealizedR(slHit, t.tp1Hit, t.tp2Hit, t.tp3Hit, t.tp1R, t.tp2R, t.tp3R)
        : calcTimeoutR(t.tp1Hit, t.tp2Hit, t.tp3Hit, t.tp1R, t.tp2R, t.tp3R);
    realizedR = Math.max(-1, Math.min(t.tp3R, realizedR));

    // Pine checks hitTp3 first inside calcRealizedR, so TP3 wins over SL on the same bar.
    const reason = t.tp3Hit ? "TP3" : slHit ? "SL" : "TIMEOUT";
    const closed = this.toClosed(a, barIndex, bar.time, reason, realizedR, true);
    this.closedTrades.push(closed);
    this.recordResult(realizedR, a.cell);
    this.active = null;

    event.closed = closed;
    return event;
  }

  private recordResult(realizedR: number, cell: number): void {
    this.rBuffer.push(realizedR);
    while (this.rBuffer.length > MAX_HISTORY_SIGS) {
      this.rBuffer.shift();
    }

    this.allTimeCount += 1;
    this.allTimeCumR += realizedR;
    if (this.allTimeCumR > this.allTimePeak) this.allTimePeak = this.allTimeCumR;
    const curDD = this.allTimeCumR - this.allTimePeak;
    if (curDD < this.allTimeTrough) this.allTimeTrough = curDD;

    if (realizedR > 0) {
      this.curWinStreak += 1;
      this.curLossStreak = 0;
      this.maxWinStreak = Math.max(this.maxWinStreak, this.curWinStreak);
    } else {
      this.curLossStreak += 1;
      this.curWinStreak = 0;
      this.maxLossStreak = Math.max(this.maxLossStreak, this.curLossStreak);
    }

    // Pine updateGridCell
    if (cell >= 0 && cell < 9) {
      const c = this.gridCount[cell] + 1;
      this.gridEwm[cell] =
        c === 1 ? realizedR : this.gridEwm[cell] * (1 - EWMA_ALPHA) + realizedR * EWMA_ALPHA;
      this.gridCount[cell] = c;
    }

    // Pine auto-calibration
    this.signalsSinceCalib += 1;
    const cfg = this.config;
    if (
      cfg.autoCalibration &&
      this.rBuffer.length >= cfg.calibrationWindow &&
      this.signalsSinceCalib >= cfg.calibrationCooldown
    ) {
      const n = this.rBuffer.length;
      const start = Math.max(0, n - cfg.calibrationWindow);
      let sum = 0;
      for (let i = start; i < n; i += 1) sum += this.rBuffer[i];
      const postAvgR = sum / (n - start);
      if (postAvgR < cfg.calibrationBadR) {
        const drift =
          this.effectiveQualityStrength > cfg.qualityInfluence
            ? -cfg.calibrationStep
            : cfg.calibrationStep;
        this.effectiveQualityStrength = Math.max(
          cfg.calibrationMinQuality,
          Math.min(cfg.calibrationMaxQuality, this.effectiveQualityStrength + drift),
        );
        this.signalsSinceCalib = 0;
      } else if (postAvgR > cfg.calibrationGoodR) {
        this.signalsSinceCalib = 0;
      }
    }
  }

  /** Pine dashboard Performance block (calcRollingStats with calibWindowInput). */
  performance(currentEr: number, currentVolRatio: number): SatsPerformance {
    const window = this.config.calibrationWindow;
    const n = this.rBuffer.length;
    let winRate: number | null = null;
    let avgR: number | null = null;
    let windowDD: number | null = null;
    if (n > 0) {
      const start = Math.max(0, n - window);
      let sum = 0;
      let wins = 0;
      let running = 0;
      let minRun = 0;
      for (let i = start; i < n; i += 1) {
        const r = this.rBuffer[i];
        sum += r;
        if (r > 0) wins += 1;
        running += r;
        if (running < minRun) minRun = running;
      }
      const cnt = n - start;
      winRate = wins / cnt;
      avgR = sum / cnt;
      windowDD = minRun;
    }
    const cell = cellIdx(currentEr, currentVolRatio);
    return {
      sampleCount: n,
      winRate,
      avgR,
      windowDrawdownR: windowDD,
      allTimeCount: this.allTimeCount,
      allTimeDrawdownR: this.allTimeCount === 0 ? null : this.allTimeTrough,
      curWinStreak: this.curWinStreak,
      maxWinStreak: this.maxWinStreak,
      curLossStreak: this.curLossStreak,
      maxLossStreak: this.maxLossStreak,
      regimeEdgeR: this.gridCount[cell] === 0 ? null : this.gridEwm[cell],
      regimeEdgeCount: this.gridCount[cell],
      effectiveQualityStrength: this.effectiveQualityStrength,
    };
  }

  private toClosed(
    a: ActiveTrade,
    exitBar: number,
    exitTime: number,
    reason: SatsClosedTrade["reason"],
    realizedR: number | null,
    counted: boolean,
  ): SatsClosedTrade {
    const t = a.trade;
    return {
      direction: t.direction,
      entryBar: t.entryBar,
      entryTime: a.entryTime,
      exitBar,
      exitTime,
      entry: t.entry,
      sl: t.sl,
      tp1: t.tp1,
      tp2: t.tp2,
      tp3: t.tp3,
      tp1Hit: t.tp1Hit,
      tp2Hit: t.tp2Hit,
      tp3Hit: t.tp3Hit,
      reason,
      realizedR,
      counted,
    };
  }
}
