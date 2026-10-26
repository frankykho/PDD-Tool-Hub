/**
 * Done summary (IPOT, publik): per level harga lot & frekuensi yang terjadi di offer (B = pembeli agresif / HAKA) dan di bid
 * (S = penjual agresif / HAKI). Hanya hari bursa berjalan (parameter tanggal diabaikan), dikosongkan sebelum pasar buka.
 */
export interface Level { price: number; bLot: number; sLot: number; bFrq: number; sFrq: number }
export interface DaySummary {
  freq: number; // jumlah transaksi
  lot: number;
  bLot: number; // lot HAKA
  sLot: number; // lot HAKI
  bFreq: number;
  sFreq: number;
  vwap: number | null;
  levels: Level[]; // harga tertinggi dulu
}

const num = (s: string) => Number(s.replace(/<[^>]*>/g, "").replace(/[,\s]/g, "")) || 0;

export function parseDoneSummary(html: string): DaySummary | null {
  const levels: Level[] = [];
  for (const m of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    if (cells.length < 7) continue;
    const price = num(cells[0]);
    if (!(price > 0)) continue;
    levels.push({ price, bLot: num(cells[1]), sLot: num(cells[2]), bFrq: num(cells[4]), sFrq: num(cells[5]) });
  }
  if (!levels.length) return null;
  levels.sort((a, b) => b.price - a.price);
  let freq = 0, lot = 0, bLot = 0, sLot = 0, bFreq = 0, sFreq = 0, pv = 0;
  for (const l of levels) {
    const t = l.bLot + l.sLot;
    lot += t;
    freq += l.bFrq + l.sFrq;
    bLot += l.bLot;
    sLot += l.sLot;
    bFreq += l.bFrq;
    sFreq += l.sFrq;
    pv += l.price * t;
  }
  if (!lot) return null;
  return { freq, lot, bLot, sLot, bFreq, sFreq, vwap: Math.round((pv / lot) * 100) / 100, levels };
}

/** Rata-rata lot per transaksi (Frequency Analyzer: besar = order besar / "smart money", kecil = ritel). */
export const avgLot = (lot: number, freq: number) => (freq > 0 ? lot / freq : null);

/** Median of the numbers (null when empty). */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
