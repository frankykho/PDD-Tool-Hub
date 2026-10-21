/**
 * Strategy Lab: simulasi portofolio dengan aturan perdagangan BEI. Fungsi murni (tanpa DOM), diuji oleh
 * worker/src/test-backtest.ts.
 *
 * Aturan eksekusi:
 * - Sinyal dihitung di harga penutupan hari t; order dieksekusi di harga pembukaan hari bursa berikutnya saham itu.
 * - Harga beli = open × (1 + slippage) dibulatkan ke atas sesuai fraksi harga; harga jual dibulatkan ke bawah.
 * - Beli per lot (100 lembar), long only, tanpa margin. Dana dibagi rata ke maks. N posisi.
 * - Auto reject: bila saham dibuka dan bertahan di batas atas (ARA), order beli dianggap tidak terisi; bila dibuka dan
 *   bertahan di batas bawah (ARB), order jual tertunda ke hari berikutnya. Batas: harga ≤ Rp 200 = 35%,
 *   ≤ Rp 5.000 = 25%, di atasnya 20% (diasumsikan sama sepanjang periode).
 * - Stop loss, take profit, trailing stop diperiksa di dalam hari (high/low); bila harga pembukaan sudah melewati level,
 *   keluar di harga pembukaan (gap). Bila stop dan target tersentuh di hari yang sama, dianggap stop lebih dulu.
 * - Biaya beli & jual (%) termasuk pajak penjualan 0,1%. Dana hasil jual langsung bisa dipakai (penyelesaian T+2 diabaikan).
 */
import type { SatsInputBar } from "../../../worker/src/sats/types";
import { idxTick } from "../format";

export interface ExecConfig {
  capital: number; // Rp
  maxPositions: number;
  feeBuy: number; // %
  feeSell: number; // %
  slippage: number; // %
  stopLoss: number | null; // %
  takeProfit: number | null; // %
  trailing: number | null; // %
  maxHold: number | null; // hari bursa
  from: string; // YYYY-MM-DD, tanggal mulai simulasi
}
export interface StockInput {
  code: string;
  bars: SatsInputBar[];
  entry: boolean[]; // sinyal beli di penutupan bar i
  exit: boolean[]; // sinyal jual di penutupan bar i
}
export type ExitReason = "SL" | "TP" | "TRAIL" | "SINYAL" | "WAKTU" | "AKHIR";
export interface Trade {
  code: string;
  entryDate: string;
  entryPrice: number;
  shares: number;
  exitDate: string;
  exitPrice: number;
  reason: ExitReason;
  pnl: number; // Rp, setelah biaya
  ret: number; // %, setelah biaya
  days: number; // hari bursa dipegang
  open: boolean; // masih dipegang di akhir data (dinilai di harga penutupan terakhir)
}
export interface Metrics {
  final: number;
  totalReturn: number; // %
  cagr: number | null; // % per tahun
  maxDrawdown: number; // % (negatif)
  trades: number;
  winRate: number | null; // %
  avgWin: number | null; // %
  avgLoss: number | null; // %
  profitFactor: number | null;
  avgDays: number | null;
  exposure: number; // % hari dengan ≥ 1 posisi
  years: number;
}
export interface BacktestResult {
  equity: Array<{ d: string; v: number }>;
  trades: Trade[];
  missedAra: number; // order beli tidak terisi karena ARA
  arbDelays: number; // hari order jual tertunda karena ARB
  skippedCash: number; // sinyal beli dilewati karena dana/slot tidak cukup untuk 1 lot
  metrics: Metrics;
}

export const day = (t: number) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);
/** Batas auto reject (pecahan) menurut harga acuan (penutupan sebelumnya). */
export const arLimit = (prev: number) => (prev <= 200 ? 0.35 : prev <= 5000 ? 0.25 : 0.2);
export const ceilTick = (p: number) => Math.ceil(p / idxTick(p) - 1e-9) * idxTick(p);
export const floorTick = (p: number) => Math.floor(p / idxTick(p) + 1e-9) * idxTick(p);
/** Dibuka dan bertahan di batas atas: open = high dan naik ≥ batas ARA (toleransi 1 fraksi). */
export const araLocked = (b: SatsInputBar, prev: SatsInputBar | undefined) =>
  !!prev && b.open >= b.high && b.open >= floorTick(prev.close * (1 + arLimit(prev.close))) - idxTick(prev.close);
export const arbLocked = (b: SatsInputBar, prev: SatsInputBar | undefined) =>
  !!prev && b.open <= b.low && b.open <= ceilTick(prev.close * (1 - arLimit(prev.close))) + idxTick(prev.close);

interface Pos {
  s: number; // indeks saham
  entryIdx: number;
  entryDate: string;
  entryPrice: number;
  shares: number;
  cost: number; // termasuk biaya beli
  peak: number;
  pending: ExitReason | null; // jual di pembukaan berikutnya
  last: number; // harga penutupan terakhir yang diketahui
}

export function backtest(stocks: StockInput[], c: ExecConfig): BacktestResult {
  const idx = stocks.map((s) => new Map(s.bars.map((b, i) => [day(b.time), i])));
  const dates = [...new Set(stocks.flatMap((s) => s.bars.map((b) => day(b.time))))].filter((d) => d >= c.from).sort();
  let cash = c.capital, missedAra = 0, arbDelays = 0, skippedCash = 0, daysIn = 0;
  const pos: Pos[] = [], trades: Trade[] = [], equity: Array<{ d: string; v: number }> = [];
  let pendingEntries: Array<{ s: number; prio: number }> = [];
  const fb = c.feeBuy / 100, fs = c.feeSell / 100, slip = c.slippage / 100;

  const close = (p: Pos, d: string, i: number, price: number, reason: ExitReason, open = false) => {
    const proceeds = p.shares * price * (open ? 1 : 1 - fs);
    cash += open ? 0 : proceeds;
    trades.push({
      code: stocks[p.s].code, entryDate: p.entryDate, entryPrice: p.entryPrice, shares: p.shares, exitDate: d, exitPrice: price, reason,
      pnl: proceeds - p.cost, ret: (proceeds / p.cost - 1) * 100, days: i - p.entryIdx, open,
    });
    pos.splice(pos.indexOf(p), 1);
  };
  /** Stop / target / trailing di dalam hari. gap = boleh keluar di harga pembukaan (false di hari beli). */
  const intraday = (p: Pos, d: string, i: number, b: SatsInputBar, prev: SatsInputBar | undefined, gap: boolean): boolean => {
    const sl = c.stopLoss != null ? p.entryPrice * (1 - c.stopLoss / 100) : -Infinity;
    const tr = c.trailing != null ? p.peak * (1 - c.trailing / 100) : -Infinity;
    const stop = Math.max(sl, tr), why: ExitReason = tr > sl ? "TRAIL" : "SL";
    const tp = c.takeProfit != null ? p.entryPrice * (1 + c.takeProfit / 100) : Infinity;
    if (stop > -Infinity && (gap ? b.open <= stop : false)) {
      if (arbLocked(b, prev)) { arbDelays++; p.pending = why; return false; }
      close(p, d, i, floorTick(b.open * (1 - slip)), why); return true;
    }
    if (stop > -Infinity && b.low <= stop) { close(p, d, i, floorTick(stop), why); return true; }
    if (tp < Infinity && gap && b.open >= tp) { close(p, d, i, floorTick(b.open * (1 - slip)), "TP"); return true; }
    if (tp < Infinity && b.high >= tp) { close(p, d, i, floorTick(tp), "TP"); return true; }
    return false;
  };

  for (const d of dates) {
    // 1. posisi yang dipegang: jual tertunda di pembukaan, lalu stop/target di dalam hari
    for (const p of [...pos]) {
      const i = idx[p.s].get(d);
      if (i == null) continue; // tidak ada transaksi (suspensi / libur saham itu)
      const bars = stocks[p.s].bars, b = bars[i], prev = bars[i - 1];
      if (p.pending) {
        if (arbLocked(b, prev)) { arbDelays++; p.last = b.close; continue; }
        close(p, d, i, floorTick(b.open * (1 - slip)), p.pending);
        continue;
      }
      if (intraday(p, d, i, b, prev, true)) continue;
      p.peak = Math.max(p.peak, b.high);
      p.last = b.close;
    }
    // 2. beli di pembukaan (sinyal kemarin), prioritas nilai transaksi terbesar
    const eqOpen = cash + pos.reduce((a, p) => a + p.shares * p.last, 0);
    for (const e of pendingEntries.sort((a, b) => b.prio - a.prio)) {
      if (pos.length >= c.maxPositions) { skippedCash++; continue; }
      if (pos.some((p) => p.s === e.s)) continue;
      const i = idx[e.s].get(d);
      if (i == null) continue;
      const bars = stocks[e.s].bars, b = bars[i], prev = bars[i - 1];
      if (araLocked(b, prev)) { missedAra++; continue; }
      const price = ceilTick(b.open * (1 + slip));
      const budget = Math.min(cash, eqOpen / c.maxPositions);
      const shares = Math.floor(budget / (price * (1 + fb)) / 100) * 100;
      if (shares < 100) { skippedCash++; continue; }
      const cost = shares * price * (1 + fb);
      cash -= cost;
      const p: Pos = { s: e.s, entryIdx: i, entryDate: d, entryPrice: price, shares, cost, peak: price, pending: null, last: b.close };
      pos.push(p);
      if (!intraday(p, d, i, b, prev, false)) p.peak = Math.max(p.peak, b.high); // stop / target di hari beli (setelah harga beli)
    }
    pendingEntries = [];
    // 3. penutupan: nilai portofolio, lalu sinyal untuk besok
    const v = cash + pos.reduce((a, p) => a + p.shares * p.last, 0);
    equity.push({ d, v });
    if (pos.length) daysIn++;
    for (const p of pos) {
      const i = idx[p.s].get(d);
      if (i == null || p.pending) continue;
      if (stocks[p.s].exit[i]) p.pending = "SINYAL";
      else if (c.maxHold != null && i - p.entryIdx >= c.maxHold) p.pending = "WAKTU";
    }
    stocks.forEach((s, k) => {
      const i = idx[k].get(d);
      if (i == null || !s.entry[i] || pos.some((p) => p.s === k)) return;
      let val = 0;
      for (let j = Math.max(0, i - 19); j <= i; j += 1) val += s.bars[j].close * (s.bars[j].volume ?? 0);
      pendingEntries.push({ s: k, prio: val / Math.min(20, i + 1) });
    });
  }
  // posisi yang masih dipegang: dinilai di harga penutupan terakhir (tanpa biaya jual)
  const lastD = dates[dates.length - 1] ?? c.from;
  for (const p of [...pos]) {
    const bars = stocks[p.s].bars, i = idx[p.s].get(lastD) ?? bars.length - 1;
    close(p, day(bars[i].time), i, p.last, "AKHIR", true);
  }
  return { equity, trades, missedAra, arbDelays, skippedCash, metrics: metricsOf(equity, trades, c.capital, daysIn) };
}

export function metricsOf(equity: Array<{ d: string; v: number }>, trades: Trade[], capital: number, daysIn: number): Metrics {
  const final = equity.length ? equity[equity.length - 1].v : capital;
  let peak = capital, mdd = 0;
  for (const e of equity) { peak = Math.max(peak, e.v); mdd = Math.min(mdd, e.v / peak - 1); }
  const years = equity.length > 1 ? (Date.parse(equity[equity.length - 1].d) - Date.parse(equity[0].d)) / (365.25 * 864e5) : 0;
  const done = trades.filter((t) => !t.open), wins = done.filter((t) => t.pnl > 0), loss = done.filter((t) => t.pnl <= 0);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const gl = -loss.reduce((a, t) => a + t.pnl, 0);
  return {
    final, totalReturn: (final / capital - 1) * 100, cagr: years >= 0.5 ? (Math.pow(final / capital, 1 / years) - 1) * 100 : null, maxDrawdown: mdd * 100,
    trades: done.length, winRate: done.length ? (wins.length / done.length) * 100 : null, avgWin: avg(wins.map((t) => t.ret)), avgLoss: avg(loss.map((t) => t.ret)),
    profitFactor: gl > 0 ? wins.reduce((a, t) => a + t.pnl, 0) / gl : null, avgDays: avg(done.map((t) => t.days)),
    exposure: equity.length ? (daysIn / equity.length) * 100 : 0, years,
  };
}
