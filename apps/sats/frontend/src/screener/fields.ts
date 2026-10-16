import type { ScreenerRow } from "../api";

export type FieldKey = Exclude<
  keyof ScreenerRow,
  "code" | "name" | "as_of_date" | "sats_signal" | "sats_trend" | "indexes" | "candles" | "chart_patterns" | "sector" | "industry" | "last_quarter"
>;
export type FieldKind = "pct" | "price" | "num" | "days" | "flag" | "value";

export interface FieldMeta {
  key: FieldKey;
  label: string;
  short: string;
  kind: FieldKind;
  help: string;
}

export const FIELDS: FieldMeta[] = [
  { key: "close", label: "Harga", short: "Harga", kind: "price", help: "Harga penutupan terakhir." },
  { key: "chg1", label: "Perubahan 1 hari (%)", short: "1H", kind: "pct", help: "Perubahan harga dibanding penutupan kemarin." },
  { key: "chg5", label: "Perubahan 5 hari (%)", short: "5H", kind: "pct", help: "Perubahan harga dalam 5 hari bursa (±1 minggu)." },
  { key: "chg20", label: "Perubahan 20 hari (%)", short: "20H", kind: "pct", help: "Perubahan harga dalam 20 hari bursa (±1 bulan)." },
  { key: "chg60", label: "Perubahan 60 hari (%)", short: "60H", kind: "pct", help: "Perubahan harga dalam 60 hari bursa (±3 bulan)." },
  { key: "chg_ytd", label: "Perubahan sejak awal tahun (%)", short: "YTD", kind: "pct", help: "Dibanding penutupan terakhir tahun lalu." },
  { key: "dist_ma20", label: "Jarak ke MA20 (%)", short: "vs MA20", kind: "pct", help: "Positif = harga di atas rata-rata 20 hari." },
  { key: "dist_ma50", label: "Jarak ke MA50 (%)", short: "vs MA50", kind: "pct", help: "Positif = harga di atas rata-rata 50 hari." },
  { key: "dist_ma200", label: "Jarak ke MA200 (%)", short: "vs MA200", kind: "pct", help: "Positif = harga di atas rata-rata 200 hari (tren jangka panjang naik)." },
  { key: "ma_stack", label: "Harga > MA20 > MA50 > MA200", short: "MA berurut", kind: "flag", help: "Semua rata-rata tersusun naik: tanda tren naik yang sehat." },
  { key: "golden_days", label: "Golden cross (hari lalu)", short: "Golden X", kind: "days", help: "Hari bursa sejak MA50 memotong ke atas MA200 (hanya selama MA50 masih di atas)." },
  { key: "death_days", label: "Death cross (hari lalu)", short: "Death X", kind: "days", help: "Hari bursa sejak MA50 memotong ke bawah MA200 (hanya selama MA50 masih di bawah)." },
  { key: "rsi14", label: "RSI (14)", short: "RSI", kind: "num", help: "0–100. < 30 jenuh jual (oversold), > 70 jenuh beli (overbought)." },
  { key: "macd_hist", label: "Histogram MACD", short: "MACD hist", kind: "num", help: "MACD(12,26) − sinyal(9). Positif = momentum naik." },
  { key: "macd_up_days", label: "MACD cross naik (hari lalu)", short: "MACD X", kind: "days", help: "Hari bursa sejak MACD memotong ke atas garis sinyal (hanya selama masih di atas)." },
  { key: "vol_ratio", label: "Volume vs rata-rata 20 hari (×)", short: "Vol ×", kind: "num", help: "Volume hari ini dibagi rata-rata volume 20 hari sebelumnya." },
  { key: "value_20d", label: "Nilai transaksi rata-rata 20 hari", short: "Nilai trx", kind: "value", help: "Rata-rata harga × volume per hari, 20 hari terakhir." },
  { key: "dist_high52", label: "Jarak ke harga tertinggi 52 minggu (%)", short: "vs High 52M", kind: "pct", help: "0% = di harga tertinggi setahun; −10% = 10% di bawahnya." },
  { key: "dist_low52", label: "Jarak ke harga terendah 52 minggu (%)", short: "vs Low 52M", kind: "pct", help: "Seberapa jauh harga di atas titik terendah setahun." },
  { key: "breakout20_days", label: "Breakout 20 hari (hari lalu)", short: "Breakout", kind: "days", help: "Hari bursa sejak penutupan terakhir di atas harga tertinggi 20 hari sebelumnya (0 = hari ini)." },
  { key: "atr_pct", label: "ATR (14) dalam %", short: "ATR %", kind: "pct", help: "Rata-rata rentang harian terhadap harga: ukuran volatilitas." },
  { key: "bb_width", label: "Lebar Bollinger Band (%)", short: "BB lebar", kind: "pct", help: "Lebar BB(20,2) terhadap harga. Makin kecil = makin menyempit." },
  { key: "bb_pctile", label: "Peringkat lebar BB 6 bulan (0 = tersempit)", short: "BB rank", kind: "num", help: "0 = lebar BB hari ini paling sempit dalam 6 bulan (squeeze)." },
  {
    key: "cmf20", label: "Chaikin Money Flow 20 hari", short: "CMF", kind: "num",
    help: "−1…+1. Positif = harga cenderung tutup dekat high dengan volume besar (tekanan beli). > 0,10 kuat, < −0,10 tekanan jual.",
  },
  {
    key: "obv20", label: "OBV bersih 20 hari", short: "OBV 20H", kind: "num",
    help: "−1…+1: (volume hari naik − volume hari turun) ÷ total volume 20 hari. +0,30 = 30% volume bersih masuk di hari naik.",
  },
  {
    key: "updown_vol20", label: "Volume naik ÷ volume turun (20 hari)", short: "Vol ↑/↓", kind: "num",
    help: "Total volume di hari harga naik dibagi volume di hari harga turun. > 1,5 = pembeli lebih aktif.",
  },
  { key: "dist_ma150", label: "Jarak ke MA150 (%)", short: "vs MA150", kind: "pct", help: "MA150 ≈ rata-rata 30 minggu (acuan Stage Analysis Weinstein)." },
  { key: "ma150_slope20", label: "Kemiringan MA150, 20 hari (%)", short: "MA150 ↗", kind: "pct", help: "Perubahan MA150 dalam 20 hari. Positif = rata-rata 30 minggu sedang naik." },
  { key: "ma200_slope22", label: "Kemiringan MA200, 1 bulan (%)", short: "MA200 ↗", kind: "pct", help: "Perubahan MA200 dalam 22 hari bursa. Positif = tren jangka panjang naik." },
  { key: "chg126", label: "Perubahan 6 bulan (%)", short: "6B", kind: "pct", help: "Perubahan harga dalam 126 hari bursa." },
  { key: "chg_12_1", label: "Momentum 12−1 bulan (%)", short: "12−1B", kind: "pct", help: "Kenaikan 12 bulan tanpa 1 bulan terakhir (ukuran momentum baku di riset akademik)." },
  { key: "rs_rank", label: "Peringkat kekuatan relatif (RS, 0–100)", short: "RS", kind: "num", help: "Persentil kenaikan 6 bulan dibanding semua saham likuid (≥ Rp 1 M/hari). 90 = lebih kuat dari 90% saham." },
  { key: "adx14", label: "ADX (14)", short: "ADX", kind: "num", help: "Kekuatan tren (bukan arah). > 25 = tren kuat, < 20 = tidak bertren." },
  { key: "stoch_k", label: "Stochastic %K (14)", short: "Stoch %K", kind: "num", help: "0–100. < 20 oversold, > 80 overbought." },
  { key: "stoch_up_days", label: "Stochastic naik dari oversold (hari lalu)", short: "Stoch X", kind: "days", help: "Hari sejak %K memotong ke atas %D saat masih di bawah 20 (maks. 5 hari)." },
  { key: "pocket_pivot_days", label: "Pocket pivot (hari lalu)", short: "Pocket pivot", kind: "days", help: "Hari sejak pocket pivot terakhir (maks. 10 hari)." },
  { key: "vcp", label: "Pola VCP (pengetatan)", short: "VCP", kind: "flag", help: "Tren naik + 3 rentang 15 hari yang makin sempit (terakhir ≤ 10%) + volume menyusut." },
  { key: "nr7", label: "NR7 (rentang tersempit 7 hari)", short: "NR7", kind: "flag", help: "Rentang high–low hari ini paling sempit dalam 7 hari." },
  { key: "inside_day", label: "Inside day", short: "Inside", kind: "flag", help: "High dan low hari ini di dalam rentang kemarin." },
  { key: "gap_pct", label: "Gap naik (%)", short: "Gap", kind: "pct", help: "Harga buka di atas high kemarin, dalam %. 0 = tidak ada gap naik." },
  { key: "body_pct", label: "Close vs open hari ini (%)", short: "Body", kind: "pct", help: "Positif = candle hijau (tutup di atas harga buka)." },
  { key: "ichi_above", label: "Harga di atas awan Ichimoku", short: "Ichimoku", kind: "flag", help: "Ichimoku 9/26/52: harga di atas awan (Kumo)." },
  { key: "rsi_div_days", label: "Divergensi bullish RSI (hari lalu)", short: "Div RSI", kind: "days", help: "Low harga lebih rendah tapi RSI lebih tinggi. Hari sejak pivot low terakhir (maks. 10)." },
  { key: "up_streak", label: "Hari naik berturut-turut", short: "Naik ×", kind: "num", help: "Jumlah penutupan yang lebih tinggi berturut-turut hingga hari ini." },
  { key: "market_cap", label: "Kapitalisasi pasar", short: "Kap. pasar", kind: "value", help: "Harga × jumlah saham beredar (Rp)." },
  { key: "per", label: "PER (×)", short: "PER", kind: "num", help: "Harga ÷ laba per saham 12 bulan terakhir. Kosong bila perusahaan rugi." },
  { key: "pbv", label: "PBV (×)", short: "PBV", kind: "num", help: "Harga ÷ nilai buku per saham (sudah dikonversi untuk emiten berlaporan USD)." },
  { key: "roe", label: "ROE (%)", short: "ROE", kind: "pct", help: "Laba bersih ÷ ekuitas. > 15% umumnya tergolong bagus." },
  { key: "der", label: "DER (×)", short: "DER", kind: "num", help: "Total utang ÷ ekuitas. Kosong untuk bank (tidak relevan)." },
  { key: "rev_growth", label: "Pertumbuhan pendapatan YoY (%)", short: "Pend. YoY", kind: "pct", help: "Pendapatan kuartal terakhir dibanding kuartal yang sama tahun lalu." },
  { key: "eps_growth", label: "Pertumbuhan laba YoY (%)", short: "Laba YoY", kind: "pct", help: "Laba kuartal terakhir dibanding kuartal yang sama tahun lalu." },
  { key: "div_yield", label: "Dividend yield (%)", short: "Div", kind: "pct", help: "Dividen 12 bulan terakhir ÷ harga. Bisa termasuk dividen spesial (sekali bayar)." },
  { key: "profitable", label: "Laba bersih positif", short: "Untung", kind: "flag", help: "Laba bersih 12 bulan terakhir di atas nol." },
  { key: "fund_ok", label: "Fundamental sehat", short: "Sehat", kind: "flag", help: "Untung, ekuitas positif, DER ≤ 2 (bank dikecualikan), laporan ≤ 9 bulan." },
  { key: "sats_bars", label: "Umur sinyal SATS (hari)", short: "SATS umur", kind: "days", help: "Hari bursa sejak sinyal SATS terakhir." },
  { key: "sats_filter", label: "BUY SATS lolos filter", short: "Lolos filter", kind: "flag", help: "BUY SATS terakhir lolos filter harga > MA200 & IHSG > MA200." },
];

export const fieldMeta = (k: string) => FIELDS.find((f) => f.key === k);

export type Op = "gt" | "gte" | "lt" | "lte" | "eq";
export const OPS: Array<{ id: Op; label: string }> = [
  { id: "gt", label: ">" },
  { id: "gte", label: "≥" },
  { id: "lt", label: "<" },
  { id: "lte", label: "≤" },
  { id: "eq", label: "=" },
];

export interface CustomFilter {
  key: FieldKey;
  op: Op;
  value: number;
}

export function passes(row: ScreenerRow, f: CustomFilter): boolean {
  const v = row[f.key] as number | null;
  if (v == null || !Number.isFinite(v)) return false;
  switch (f.op) {
    case "gt":
      return v > f.value;
    case "gte":
      return v >= f.value;
    case "lt":
      return v < f.value;
    case "lte":
      return v <= f.value;
    default:
      return v === f.value;
  }
}

export const encodeFilters = (fs: CustomFilter[]) => fs.map((f) => `${f.key}.${f.op}.${f.value}`).join("~");
export function decodeFilters(s: string | null): CustomFilter[] {
  if (!s) return [];
  return s
    .split("~")
    .map((p) => p.split("."))
    .map(([key, op, ...rest]) => ({ key: key as FieldKey, op: op as Op, value: Number(rest.join(".")) }))
    .filter((f) => fieldMeta(f.key) && OPS.some((o) => o.id === f.op) && Number.isFinite(f.value));
}
