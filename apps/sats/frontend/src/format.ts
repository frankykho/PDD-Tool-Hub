import type { LatestRow } from "./api";

/** IDX price fraction (tick size) by price level. */
export function idxTick(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

/** Round a level to the nearest valid IDX price (TradingView labels do the same with format.mintick). */
export function toTick(price: number): number {
  const t = idxTick(price);
  return Math.round(price / t) * t;
}

const nf0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtPrice = (v: number | null | undefined) => (v == null ? "—" : nf0.format(toTick(v)));
export const fmtNum = (v: number | null | undefined) => (v == null ? "—" : nf0.format(v));
export const fmt1 = (v: number | null | undefined) => (v == null ? "—" : nf1.format(v));
export const fmtR = (v: number | null | undefined) =>
  v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf2.format(Math.abs(v))}R`;

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const f = digits === 2 ? nf2 : nf1;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${f.format(Math.abs(v))}%`;
}

export const pctFrom = (level: number | null, base: number | null) =>
  level == null || base == null || base === 0 ? null : ((level - base) / base) * 100;

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function fmtDate(d: string | null | undefined, withYear = false): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${BULAN[m - 1]}${withYear ? ` ${y}` : ""}`;
}

export type StatusKind = "run" | "tp" | "sl" | "exit" | "done";

/** Status label for a stock's latest signal. On IDX a SELL is treated as an exit signal. */
export function statusOf(r: LatestRow, hasTargets = true): { label: string; kind: StatusKind } {
  if (r.last_signal === "SELL") return { label: "Sinyal keluar", kind: "exit" };
  switch (r.trade_status) {
    case "TP3":
      return { label: "TP3 ✓ selesai", kind: "done" };
    case "SL":
      return { label: hasTargets ? "Kena SL" : "Kena stop", kind: "sl" };
    case "TIMEOUT":
      return { label: "Timeout", kind: "exit" };
    default:
      if (!hasTargets) return { label: "Posisi berjalan", kind: "run" };
      if (r.tp2_hit) return { label: "TP2 ✓", kind: "tp" };
      if (r.tp1_hit) return { label: "TP1 ✓", kind: "tp" };
      return { label: "Menuju TP1", kind: "run" };
  }
}

export const EXIT_LABEL: Record<string, string> = {
  SELL: "Sinyal keluar",
  SL: "Kena stop",
  TP3: "TP3 ✓",
  TIMEOUT: "Timeout",
};

export function hitsLabel(s: { tp1_hit: number | null; tp2_hit: number | null; tp3_hit: number | null }): string {
  if (s.tp3_hit) return "TP3";
  if (s.tp2_hit) return "TP2";
  if (s.tp1_hit) return "TP1";
  return "—";
}

/** Position of the close between SL (0%) and TP3 (100%). Entry sits at 25% for 1R/2R/3R. */
export function positionPct(r: { close: number | null; sl: number | null; tp3: number | null }): number | null {
  if (r.close == null || r.sl == null || r.tp3 == null || r.tp3 === r.sl) return null;
  return Math.max(0, Math.min(100, ((r.close - r.sl) / (r.tp3 - r.sl)) * 100));
}

/** Rupiah compact: 350 jt, 1,2 M, 3,4 T */
export function fmtRp(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1e12) return `Rp ${nf1.format(v / 1e12)} T`;
  if (v >= 1e9) return `Rp ${nf1.format(v / 1e9)} M`;
  if (v >= 1e6) return `Rp ${nf0.format(v / 1e6)} jt`;
  return `Rp ${nf0.format(v)}`;
}

export const RISK_RULES = {
  minValue: 1e9, // nilai transaksi rata-rata 20 hari
  maxSlPct: 15,
  minPrice: 50,
};

export interface RiskFlag {
  key: "illiquid" | "wide-sl" | "penny" | "neg-equity";
  label: string;
  title: string;
}

/** Warnings shown next to a signal. The signal itself is unchanged. */
export function riskFlags(r: LatestRow): RiskFlag[] {
  const out: RiskFlag[] = [];
  if (r.value_20d != null && r.value_20d < RISK_RULES.minValue) {
    out.push({
      key: "illiquid",
      label: "Tidak likuid",
      title: `Nilai transaksi rata-rata 20 hari ${fmtRp(r.value_20d)}/hari (< Rp 1 M). Sulit masuk/keluar di harga sinyal.`,
    });
  }
  const stop = r.sl ?? r.stop_now;
  if (r.last_signal === "BUY" && r.entry != null && stop != null) {
    const d = ((r.entry - stop) / r.entry) * 100;
    if (d > RISK_RULES.maxSlPct) {
      out.push({ key: "wide-sl", label: `Stop ${nf0.format(d)}%`, title: `Jarak stop ${nf1.format(d)}% dari entry (> 15%).` });
    }
  }
  if (r.f_equity_positive === 0) {
    out.push({ key: "neg-equity", label: "Ekuitas negatif", title: "Total ekuitas negatif (utang melebihi aset): risiko fundamental tinggi." });
  }
  if (r.close != null && r.close < RISK_RULES.minPrice) {
    out.push({ key: "penny", label: "Harga < 50", title: "Harga di bawah Rp 50: fraksi Rp 1 = pergerakan ≥ 2% per tick." });
  }
  return out;
}

/**
 * "Fundamental sehat": profitable, positive equity, DER ≤ 2 (null = bank / not reported), report not older than 9 months.
 * Returns null when there is no fundamental data.
 */
export function fundHealthy(profitable: number | null | undefined, equityPositive: number | null | undefined, der: number | null | undefined, stale: number | null | undefined): boolean | null {
  if (profitable == null && equityPositive == null) return null;
  return profitable === 1 && equityPositive === 1 && (der == null || der <= 2) && stale !== 1;
}
