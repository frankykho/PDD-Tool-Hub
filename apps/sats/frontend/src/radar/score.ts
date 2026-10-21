/**
 * Opportunity Radar: score every stock on four pillars (momentum, breakout, volume, liquidity) from the daily
 * screener row, and list WHY it scored — every point comes from a reason the user can read.
 * Pure functions (no DOM), also run by worker/src/screener/test-radar.ts.
 */
import type { ScreenerRow } from "../api";
import { fmt1, fmtPct, fmtRp } from "../format";
import { parseCandles, parseCharts, patternMeta } from "../screener/patternMeta";
import { PRESETS } from "../screener/presets";

export type Pillar = "m" | "b" | "v" | "l";
export const PILLARS: Array<{ id: Pillar; name: string; help: string }> = [
  { id: "m", name: "Momentum", help: "Kekuatan relatif 6 bulan (RS) dan susunan tren: di atas MA50 & MA200, MA berurut, MA200 naik." },
  { id: "b", name: "Breakout", help: "Dekat harga tertinggi 52 minggu, breakout 20 hari yang baru, breakout pola chart, dan pengetatan harga (VCP / squeeze)." },
  { id: "v", name: "Volume", help: "Volume yang menguatkan kenaikan: 1–2× rata-rata (ledakan volume justru dinilai rendah), CMF positif, volume hari naik > hari turun, pocket pivot." },
  { id: "l", name: "Likuiditas", help: "Nilai transaksi rata-rata 20 hari. Rp 1 M/hari = 20, Rp 10 M = 60, Rp 100 M ke atas = 100." },
];

export type Weights = Record<Pillar, number>;
export const FOCUS: Array<{ id: string; name: string; w: Weights }> = [
  { id: "seimbang", name: "Seimbang", w: { m: 35, b: 30, v: 20, l: 15 } },
  { id: "momentum", name: "Momentum", w: { m: 55, b: 20, v: 10, l: 15 } },
  { id: "breakout", name: "Breakout", w: { m: 20, b: 50, v: 15, l: 15 } },
  { id: "volume", name: "Aliran dana", w: { m: 20, b: 20, v: 45, l: 15 } },
];

export interface Reason {
  pillar: Pillar | "x"; // x = info / penalty, not part of a pillar
  tone: "good" | "warn" | "info";
  text: string;
  pts: number; // points added to the pillar (good) or taken off the total (warn, negative)
}

export interface RadarResult {
  pillars: Record<Pillar, number>; // 0–100 each
  penalty: number; // ≤ 0, taken off the weighted total
  score: number; // 0–100
  reasons: Reason[];
}

const BULL_CHARTS = new Set(["double_bottom", "asc_triangle", "bull_flag"]);
const cap = (v: number) => Math.max(0, Math.min(100, v));
const days = (d: number) => (d === 0 ? "hari ini" : `${d} hari lalu`);
const x = (v: number) => `${fmt1(v)}×`;

/** Pillar scores + reasons for one row (rs_rank from withRank()). */
export function radarScore(r: ScreenerRow, w: Weights = FOCUS[0].w): RadarResult {
  const reasons: Reason[] = [];
  const add = (pillar: Pillar, pts: number, text: string) => {
    reasons.push({ pillar, tone: "good", text, pts });
    return pts;
  };
  const warn = (pts: number, text: string) => reasons.push({ pillar: "x", tone: "warn", text, pts: -pts });
  const info = (text: string) => reasons.push({ pillar: "x", tone: "info", text, pts: 0 });

  // ── Momentum
  let m = 0;
  const rs = r.rs_rank ?? null;
  if (rs != null && rs > 0) {
    const p = Math.round(rs * 0.5);
    if (rs >= 100) m += add("m", p, "RS 100: kenaikan 6 bulan terkuat di antara saham likuid");
    else if (rs >= 70) m += add("m", p, `RS ${rs}: naik 6 bulan lebih kuat dari ${rs}% saham likuid`);
    else m += p; // counted, not worth a reason
  }
  if ((r.dist_ma200 ?? -1) > 0) m += r.ma_stack ? 15 : add("m", 15, "Harga di atas MA200 (tren jangka panjang naik)");
  if ((r.dist_ma50 ?? -1) > 0) m += r.ma_stack ? 10 : add("m", 10, "Harga di atas MA50");
  if (r.ma_stack) m += add("m", 15, "Harga > MA20 > MA50 > MA200 (tren tersusun rapi)");
  if ((r.ma200_slope22 ?? 0) > 0) m += 10;

  // ── Breakout
  let b = 0;
  const dh = r.dist_high52;
  if (dh != null && dh >= -10) {
    const p = dh >= -2 ? 35 : dh >= -5 ? 28 : 15;
    b += add("b", p, dh >= -0.5 ? "Di harga tertinggi 52 minggu" : `${fmt1(-dh)}% di bawah harga tertinggi 52 minggu`);
  }
  const bo = r.breakout20_days;
  if (bo != null && bo <= 10) b += add("b", bo === 0 ? 35 : bo <= 3 ? 28 : 15, `Breakout harga tertinggi 20 hari ${days(bo)}`);
  const charts = parseCharts(r.chart_patterns).filter((c) => BULL_CHARTS.has(c.id));
  const cb = charts.find((c) => c.status === "breakout"),
    cf = charts.find((c) => c.status === "forming");
  if (cb) b += add("b", 20, `Breakout pola ${patternMeta(cb.id)?.name ?? cb.id}`);
  else if (cf) b += add("b", 8, `Pola ${patternMeta(cf.id)?.name ?? cf.id} sedang terbentuk`);
  if (r.vcp) b += add("b", 10, "Pola VCP: rentang harga makin menyempit, volume menyusut");
  else if (r.bb_pctile != null && r.bb_pctile <= 10) b += add("b", 10, "Bollinger Band paling sempit dalam 6 bulan (squeeze)");

  // ── Volume (konfirmasi). Lab Uji BEI: breakout dengan volume wajar 1–2× lebih baik daripada ledakan volume.
  let v = 0;
  const vr = r.vol_ratio;
  if (vr != null) {
    if (vr >= 1 && vr < 2) v += add("v", 35, `Volume ${x(vr)} rata-rata 20 hari (naik wajar)`);
    else if (vr >= 2 && vr < 3) v += add("v", 25, `Volume ${x(vr)} rata-rata 20 hari`);
    else if (vr >= 3) v += 10;
    else if (vr >= 0.8) v += 15;
  }
  const cmf = r.cmf20;
  if (cmf != null && cmf > 0) v += cmf >= 0.1 ? add("v", 25, `Aliran dana masuk 20 hari (CMF +${cmf.toFixed(2).replace(".", ",")})`) : 12;
  const ud = r.updown_vol20;
  if (ud != null && ud > 1) v += ud >= 1.5 ? add("v", 20, `Volume hari naik ${x(ud)} volume hari turun`) : 10;
  const pp = r.pocket_pivot_days;
  if (pp != null && pp <= 10) v += add("v", 20, `Pocket pivot ${days(pp)}`);

  // ── Likuiditas
  const val = r.value_20d ?? 0;
  const l = Math.round(val < 1e9 ? (val / 1e9) * 20 : 20 + 80 * Math.min(1, Math.log10(val / 1e9) / 2));
  reasons.push({ pillar: "l", tone: val >= 1e9 ? "good" : "warn", text: `Nilai transaksi ${fmtRp(val)}/hari`, pts: l });

  // ── Peringatan (mengurangi skor total)
  let pen = 0;
  const pin = (pts: number, text: string) => {
    pen -= pts;
    warn(pts, text);
  };
  if ((r.rsi14 ?? 0) >= 80) pin(10, `RSI ${fmt1(r.rsi14)}: sangat jenuh beli`);
  if ((r.dist_ma50 ?? 0) >= 25) pin(10, `${fmt1(r.dist_ma50)}% di atas MA50: sudah jauh dari rata-rata`);
  if (vr != null && vr >= 4) pin(5, `Volume meledak ${x(vr)}: di BEI sering jadi puncak sesaat`);
  if (r.death_days != null) pin(10, `Death cross ${days(r.death_days)} (MA50 di bawah MA200)`);
  if (parseCharts(r.chart_patterns).some((c) => c.id === "double_top" && c.status === "breakout")) pin(10, "Double top jebol ke bawah");
  const bear = parseCandles(r.candles).find((c) => c.days <= 1 && patternMeta(c.id)?.bias === "bear");
  if (bear) pin(5, `Candle ${patternMeta(bear.id)?.name}: ${days(bear.days)}`);
  if (r.equity_positive === 0) pin(10, "Ekuitas negatif");
  else if (r.profitable === 0) pin(5, "Rugi bersih 12 bulan terakhir");
  if (val < 1e9) pin(10, "Kurang likuid (< Rp 1 M/hari): sulit masuk/keluar");

  // ── Info tambahan (tanpa poin)
  for (const p of PRESETS.filter((p) => p.group === "✓ Teruji BEI")) if (p.test(r)) info(`Lolos preset teruji BEI: ${p.name}`);
  if (r.sats_signal === "BUY" && r.sats_bars != null && r.sats_bars <= 5)
    info(`Sinyal SATS BUY ${days(r.sats_bars)}${r.sats_filter ? " (lolos filter MA200 & IHSG)" : ""}`);
  if (r.chg1 != null && Math.abs(r.chg1) >= 5) info(`Hari ini ${fmtPct(r.chg1)}`);

  const pillars = { m: cap(m), b: cap(b), v: cap(v), l: cap(l) };
  const tw = w.m + w.b + w.v + w.l || 1;
  const base = (pillars.m * w.m + pillars.b * w.b + pillars.v * w.v + pillars.l * w.l) / tw;
  return { pillars, penalty: pen, score: Math.round(cap(base + pen)), reasons };
}

/** Kriteria pengguna (disimpan di browser dan di URL). */
export interface Criteria {
  focus: string; // FOCUS id atau "custom"
  w: Weights;
  minScore: number;
  minValue: number; // Rp miliar per hari
  index: string;
  aboveMa200: boolean;
  fundOk: boolean;
  noWarn: boolean;
  watchOnly: boolean;
}
export const DEFAULT_CRITERIA: Criteria = {
  focus: "seimbang", w: FOCUS[0].w, minScore: 50, minValue: 1, index: "", aboveMa200: true, fundOk: false, noWarn: false, watchOnly: false,
};

export interface RadarHit {
  row: ScreenerRow;
  res: RadarResult;
}

/** Saham yang terdeteksi Radar, urut dari skor tertinggi. inWatch = kode di watchlist. */
export function runRadar(rows: ScreenerRow[], c: Criteria, inWatch: (code: string) => boolean = () => true): RadarHit[] {
  const out: RadarHit[] = [];
  for (const row of rows) {
    if ((row.value_20d ?? 0) < c.minValue * 1e9) continue;
    if (c.index && !(row.indexes ?? "").split(",").includes(c.index)) continue;
    if (c.aboveMa200 && !((row.dist_ma200 ?? -1) > 0)) continue;
    if (c.fundOk && row.fund_ok !== 1) continue;
    if (c.watchOnly && !inWatch(row.code)) continue;
    const res = radarScore(row, c.w);
    if (res.score < c.minScore) continue;
    if (c.noWarn && res.reasons.some((x) => x.tone === "warn")) continue;
    out.push({ row, res });
  }
  return out.sort((a, b) => b.res.score - a.res.score || (b.row.value_20d ?? 0) - (a.row.value_20d ?? 0) || a.row.code.localeCompare(b.row.code));
}

/** Konteks pasar untuk membaca jumlah hasil: persen saham likuid (≥ Rp 1 M/hari) yang harganya di atas MA200. */
export function breadthAbove200(rows: ScreenerRow[]): number | null {
  const liq = rows.filter((r) => (r.value_20d ?? 0) >= 1e9 && r.dist_ma200 != null);
  return liq.length ? Math.round((liq.filter((r) => (r.dist_ma200 as number) > 0).length / liq.length) * 100) : null;
}

/** Criteria <-> URL query (hanya yang beda dari bawaan). */
export function criteriaToQuery(c: Criteria): URLSearchParams {
  const q = new URLSearchParams(), d = DEFAULT_CRITERIA;
  if (c.focus !== d.focus) q.set("fokus", c.focus);
  if (c.focus === "custom") q.set("w", [c.w.m, c.w.b, c.w.v, c.w.l].join("-"));
  if (c.minScore !== d.minScore) q.set("min", String(c.minScore));
  if (c.minValue !== d.minValue) q.set("v", String(c.minValue));
  if (c.index) q.set("idx", c.index);
  if (c.aboveMa200 !== d.aboveMa200) q.set("ma200", c.aboveMa200 ? "1" : "0");
  if (c.fundOk) q.set("fund", "1");
  if (c.noWarn) q.set("bersih", "1");
  if (c.watchOnly) q.set("wl", "1");
  return q;
}
export function criteriaFromQuery(q: URLSearchParams): Criteria {
  const d = DEFAULT_CRITERIA, num = (k: string, def: number) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : def);
  const focus = q.get("fokus") ?? d.focus, f = FOCUS.find((x) => x.id === focus);
  let w = f ? f.w : d.w;
  if (focus === "custom") {
    const a = (q.get("w") ?? "").split("-").map(Number);
    if (a.length === 4 && a.every((n) => Number.isFinite(n) && n >= 0)) w = { m: a[0], b: a[1], v: a[2], l: a[3] };
  }
  return {
    focus: f || focus === "custom" ? focus : d.focus, w, minScore: num("min", d.minScore), minValue: num("v", d.minValue), index: q.get("idx") ?? "",
    aboveMa200: q.has("ma200") ? q.get("ma200") === "1" : d.aboveMa200, fundOk: q.get("fund") === "1", noWarn: q.get("bersih") === "1", watchOnly: q.get("wl") === "1",
  };
}
