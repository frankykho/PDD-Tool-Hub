/**
 * Hitungan waran terstruktur (structured warrant, SW) jenis call ala BEI: gaya Eropa, diselesaikan tunai saat jatuh tempo.
 * Rasio = jumlah SW untuk 1 saham induk (mis. 5 berarti 5 SW : 1 saham). Semua harga dalam rupiah.
 * Nilai saat jatuh tempo per SW = maks(0, harga saham induk − harga pelaksanaan) ÷ rasio.
 */
export interface WarrantInput {
  spot: number; // harga saham induk sekarang
  strike: number; // harga pelaksanaan
  ratio: number; // SW per 1 saham
  price: number; // harga SW
  expiry?: string; // YYYY-MM-DD
  qty?: number; // jumlah SW (1 lot = 100 SW)
}
export interface WarrantResult {
  intrinsic: number; // nilai intrinsik per SW
  timeValue: number; // harga SW − intrinsik
  breakeven: number; // harga saham induk saat jatuh tempo agar balik modal
  premium: number; // % kenaikan saham induk yang dibutuhkan sampai titik impas
  moneyness: number; // % harga saham vs harga pelaksanaan
  status: "ITM" | "ATM" | "OTM";
  gearing: number; // harga saham ÷ (harga SW × rasio)
  daysLeft: number | null;
  cost: number; // modal = harga SW × jumlah
}
const DAY = 86400_000;
export const valueAt = (sT: number, strike: number, ratio: number) => Math.max(0, sT - strike) / ratio;

export function warrant(w: WarrantInput, today = new Date()): WarrantResult | null {
  const { spot, strike, ratio, price } = w;
  if (!(spot > 0 && strike > 0 && ratio > 0 && price > 0)) return null;
  const intrinsic = valueAt(spot, strike, ratio), breakeven = strike + price * ratio, moneyness = (spot / strike - 1) * 100;
  const t = w.expiry && /^\d{4}-\d{2}-\d{2}$/.test(w.expiry) ? Date.parse(w.expiry + "T00:00:00Z") : NaN;
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return {
    intrinsic, timeValue: price - intrinsic, breakeven, premium: (breakeven / spot - 1) * 100, moneyness,
    status: Math.abs(moneyness) <= 1 ? "ATM" : moneyness > 0 ? "ITM" : "OTM",
    gearing: spot / (price * ratio), daysLeft: Number.isFinite(t) ? Math.round((t - t0) / DAY) : null, cost: price * (w.qty ?? 100),
  };
}

/** Skenario harga saham induk saat jatuh tempo: perubahan % -> nilai SW, untung/rugi. Titik impas & harga pelaksanaan ikut dimasukkan. */
export function scenarios(w: WarrantInput, steps = [-30, -20, -10, 0, 10, 20, 30]) {
  const r = warrant(w);
  if (!r) return [];
  const qty = w.qty ?? 100;
  const pts = steps.map((p) => ({ chg: p, sT: w.spot * (1 + p / 100), mark: "" }));
  pts.push({ chg: (w.strike / w.spot - 1) * 100, sT: w.strike, mark: "harga pelaksanaan" }, { chg: r.premium, sT: r.breakeven, mark: "titik impas" });
  return pts
    .sort((a, b) => a.sT - b.sT)
    .map((x) => {
      const v = valueAt(x.sT, w.strike, w.ratio);
      return { ...x, value: v, pl: (v - w.price) * qty, plPct: (v / w.price - 1) * 100 };
    });
}
