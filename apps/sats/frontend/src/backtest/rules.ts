/**
 * Strategy Lab: syarat beli / jual yang bisa disusun pengguna, dihitung per saham menjadi sinyal per bar (di harga
 * penutupan). Indikator memakai fungsi yang sama dengan pipeline SATS (worker/src/strategies/series.ts).
 */
import { runSats } from "../../../worker/src/sats/engine";
import type { SatsInputBar } from "../../../worker/src/sats/types";
import { rsi } from "../../../worker/src/screener/metrics";
import { highestPrev, macdHist, sma } from "../../../worker/src/strategies/series";

export type Cond =
  | { t: "above_ma"; n: number }
  | { t: "ma_cross"; a: number; b: number }
  | { t: "rsi_below"; n: number; x: number }
  | { t: "rsi_above"; n: number; x: number }
  | { t: "breakout"; n: number }
  | { t: "near_high"; pct: number }
  | { t: "vol"; min: number; max: number }
  | { t: "macd_up" }
  | { t: "sats_buy" }
  | { t: "below_ma"; n: number }
  | { t: "ma_cross_down"; a: number; b: number }
  | { t: "sats_sell" };
export type CondType = Cond["t"];

/** Daftar syarat untuk penyusun strategi: label, parameter, dan apakah untuk beli (entry) atau jual (exit). */
export const CONDS: Array<{ t: CondType; side: "entry" | "exit" | "both"; label: string; params: Array<[string, string]>; help: string; def: Cond }> = [
  { t: "above_ma", side: "entry", label: "Harga di atas MA", params: [["n", "MA"]], help: "Close > rata-rata n hari.", def: { t: "above_ma", n: 200 } },
  { t: "ma_cross", side: "entry", label: "MA cepat memotong ke atas MA lambat", params: [["a", "MA cepat"], ["b", "MA lambat"]], help: "Hari ini MA a naik melewati MA b (mis. golden cross 50/200).", def: { t: "ma_cross", a: 50, b: 200 } },
  { t: "breakout", side: "entry", label: "Breakout harga tertinggi n hari", params: [["n", "hari"]], help: "Close hari ini di atas high tertinggi n hari sebelumnya.", def: { t: "breakout", n: 20 } },
  { t: "near_high", side: "entry", label: "Dekat harga tertinggi 52 minggu", params: [["pct", "maks. % di bawah"]], help: "Close paling jauh pct% di bawah high 250 hari terakhir.", def: { t: "near_high", pct: 5 } },
  { t: "vol", side: "entry", label: "Volume dibanding rata-rata 20 hari", params: [["min", "min. ×"], ["max", "maks. ×"]], help: "Volume hari ini ÷ rata-rata volume 20 hari sebelumnya, di antara min dan maks.", def: { t: "vol", min: 1, max: 2 } },
  { t: "rsi_below", side: "both", label: "RSI di bawah", params: [["n", "periode"], ["x", "batas"]], help: "RSI(n) < batas (jenuh jual bila ≤ 30).", def: { t: "rsi_below", n: 14, x: 30 } },
  { t: "rsi_above", side: "both", label: "RSI di atas", params: [["n", "periode"], ["x", "batas"]], help: "RSI(n) > batas (jenuh beli bila ≥ 70).", def: { t: "rsi_above", n: 14, x: 70 } },
  { t: "macd_up", side: "entry", label: "MACD memotong ke atas sinyal", params: [], help: "Histogram MACD(12,26,9) berubah dari ≤ 0 ke > 0 hari ini.", def: { t: "macd_up" } },
  { t: "sats_buy", side: "entry", label: "Sinyal BUY SATS", params: [], help: "Sinyal BUY indikator SATS v1.9.0 muncul hari ini (mesin yang sama dengan halaman Sinyal).", def: { t: "sats_buy" } },
  { t: "below_ma", side: "exit", label: "Harga di bawah MA", params: [["n", "MA"]], help: "Close < rata-rata n hari.", def: { t: "below_ma", n: 50 } },
  { t: "ma_cross_down", side: "exit", label: "MA cepat memotong ke bawah MA lambat", params: [["a", "MA cepat"], ["b", "MA lambat"]], help: "Hari ini MA a turun melewati MA b (mis. death cross 50/200).", def: { t: "ma_cross_down", a: 50, b: 200 } },
  { t: "sats_sell", side: "exit", label: "Sinyal SELL SATS", params: [], help: "Sinyal SELL indikator SATS v1.9.0 muncul hari ini.", def: { t: "sats_sell" } },
];
export const condMeta = (t: CondType) => CONDS.find((c) => c.t === t)!;

export interface Strategy {
  name: string;
  entry: Cond[]; // semua harus terpenuhi (DAN)
  exit: Cond[]; // salah satu cukup (ATAU)
  stopLoss: number | null; // % di bawah harga beli
  takeProfit: number | null; // % di atas harga beli
  trailing: number | null; // % di bawah harga tertinggi sejak beli
  maxHold: number | null; // hari bursa
}

export const TEMPLATES: Array<Strategy & { id: string; note: string }> = [
  {
    id: "breakout_calm", name: "Breakout 20 hari, volume wajar", note: "Preset teruji Lab Uji BEI: breakout dengan volume 1–2× rata-rata.",
    entry: [{ t: "breakout", n: 20 }, { t: "vol", min: 1, max: 2 }, { t: "above_ma", n: 200 }], exit: [{ t: "below_ma", n: 50 }],
    stopLoss: 8, takeProfit: null, trailing: null, maxHold: 60,
  },
  {
    id: "high52", name: "Dekat high 52 minggu", note: "Saham kuat yang bertahan dekat puncak setahun; keluar saat tutup di bawah MA50.",
    entry: [{ t: "near_high", pct: 5 }, { t: "above_ma", n: 200 }], exit: [{ t: "below_ma", n: 50 }],
    stopLoss: 8, takeProfit: null, trailing: null, maxHold: null,
  },
  {
    id: "golden", name: "Golden cross 50/200", note: "Tren menengah klasik: masuk saat MA50 memotong ke atas MA200, keluar saat death cross.",
    entry: [{ t: "ma_cross", a: 50, b: 200 }], exit: [{ t: "ma_cross_down", a: 50, b: 200 }],
    stopLoss: 10, takeProfit: null, trailing: null, maxHold: null,
  },
  {
    id: "rsi_dip", name: "RSI oversold dalam tren naik", note: "Beli koreksi: RSI < 30 saat harga masih di atas MA200, jual saat RSI pulih ke 55.",
    entry: [{ t: "above_ma", n: 200 }, { t: "rsi_below", n: 14, x: 30 }], exit: [{ t: "rsi_above", n: 14, x: 55 }],
    stopLoss: 8, takeProfit: null, trailing: null, maxHold: 20,
  },
  {
    id: "sats", name: "Sinyal SATS + dekat high 52M",
    note: "Seperti strategi utama SATS: BUY SATS saat harga di atas MA200 dan ≤ 5% dari high 52 minggu. Keluar di sinyal SELL, stop 10%, maks. 100 hari (Track Record SATS memakai level SL/TP bawaan SATS, jadi hasilnya bisa berbeda).",
    entry: [{ t: "sats_buy" }, { t: "near_high", pct: 5 }, { t: "above_ma", n: 200 }], exit: [{ t: "sats_sell" }],
    stopLoss: 10, takeProfit: null, trailing: null, maxHold: 100,
  },
];

const finite = (v: number) => Number.isFinite(v);

/** Sinyal beli & jual per bar (keputusan di harga penutupan bar itu). Bar tanpa data indikator cukup = false. */
export function signals(bars: SatsInputBar[], s: Pick<Strategy, "entry" | "exit">): { entry: boolean[]; exit: boolean[] } {
  const n = bars.length, close = bars.map((b) => b.close), high = bars.map((b) => b.high), vol = bars.map((b) => b.volume ?? 0);
  const memo = new Map<string, number[]>();
  const get = (k: string, f: () => number[]) => (memo.has(k) ? memo.get(k)! : (memo.set(k, f()), memo.get(k)!));
  const ma = (len: number) => get(`ma${len}`, () => sma(close, len));
  const rs = (len: number) => get(`rsi${len}`, () => rsi(close, len));
  let sats: { buy: Set<number>; sell: Set<number> } | null = null;
  const satsSig = () => {
    if (!sats) {
      const r = runSats(bars), buy = new Set<number>(), sell = new Set<number>();
      r.bars.forEach((b, i) => {
        if (b.signal === "BUY") buy.add(i);
        if (b.signal === "SELL") sell.add(i);
      });
      sats = { buy, sell };
    }
    return sats;
  };
  const test = (c: Cond): ((i: number) => boolean) => {
    switch (c.t) {
      case "above_ma": { const m = ma(c.n); return (i) => finite(m[i]) && close[i] > m[i]; }
      case "below_ma": { const m = ma(c.n); return (i) => finite(m[i]) && close[i] < m[i]; }
      case "ma_cross": { const a = ma(c.a), b = ma(c.b); return (i) => i > 0 && [a[i], b[i], a[i - 1], b[i - 1]].every(finite) && a[i] > b[i] && a[i - 1] <= b[i - 1]; }
      case "ma_cross_down": { const a = ma(c.a), b = ma(c.b); return (i) => i > 0 && [a[i], b[i], a[i - 1], b[i - 1]].every(finite) && a[i] < b[i] && a[i - 1] >= b[i - 1]; }
      case "rsi_below": { const r = rs(c.n); return (i) => finite(r[i]) && r[i] < c.x; }
      case "rsi_above": { const r = rs(c.n); return (i) => finite(r[i]) && r[i] > c.x; }
      case "breakout": { const h = get(`hp${c.n}`, () => highestPrev(high, c.n)); return (i) => finite(h[i]) && close[i] > h[i]; }
      case "near_high": { const h = get("hi250", () => high.map((_, i) => (i < 249 ? NaN : Math.max(...high.slice(i - 249, i + 1))))); return (i) => finite(h[i]) && close[i] >= h[i] * (1 - c.pct / 100); }
      case "vol": {
        const avg = get("vavg20", () => sma(vol, 20));
        return (i) => i > 0 && finite(avg[i - 1]) && avg[i - 1] > 0 && vol[i] / avg[i - 1] >= c.min && vol[i] / avg[i - 1] <= c.max;
      }
      case "macd_up": { const h = get("macd", () => macdHist(close, 12, 26, 9)); return (i) => i > 0 && finite(h[i]) && finite(h[i - 1]) && h[i] > 0 && h[i - 1] <= 0; }
      case "sats_buy": return (i) => satsSig().buy.has(i);
      case "sats_sell": return (i) => satsSig().sell.has(i);
    }
  };
  const en = s.entry.map(test), ex = s.exit.map(test);
  const entry = new Array<boolean>(n), exit = new Array<boolean>(n);
  for (let i = 0; i < n; i += 1) {
    entry[i] = en.length > 0 && en.every((f) => f(i));
    exit[i] = ex.some((f) => f(i));
  }
  return { entry, exit };
}

/** Strategi <-> teks pendek (untuk URL & simpanan browser). */
export const encodeStrategy = (s: Strategy) => btoa(unescape(encodeURIComponent(JSON.stringify(s))));
export function decodeStrategy(v: string | null): Strategy | null {
  if (!v) return null;
  try {
    const s = JSON.parse(decodeURIComponent(escape(atob(v)))) as Strategy;
    const okC = (c: Cond) => CONDS.some((m) => m.t === c.t);
    return Array.isArray(s.entry) && Array.isArray(s.exit) && s.entry.every(okC) && s.exit.every(okC) ? s : null;
  } catch {
    return null;
  }
}
