import type { ScreenerRow } from "../api";
import type { FieldKey } from "./fields";

export type PresetGroup = "✓ Teruji BEI" | "Tren" | "Entry & breakout" | "Volatilitas" | "Aliran dana" | "Fundamental" | "Pembalikan (berisiko)" | "SATS";
export const PRESET_GROUPS: PresetGroup[] = ["✓ Teruji BEI", "Tren", "Entry & breakout", "Volatilitas", "Aliran dana", "Fundamental", "Pembalikan (berisiko)", "SATS"];

export interface Preset {
  id: string;
  group: PresetGroup;
  name: string;
  rule: string; // short human rule
  help: string; // where it comes from + how to read it
  test: (r: ScreenerRow) => boolean;
  sort: { key: FieldKey; dir: "asc" | "desc" };
  columns: FieldKey[];
}

const gt = (v: number | null | undefined, x: number) => v != null && v > x;
const lt = (v: number | null | undefined, x: number) => v != null && v < x;
const between = (v: number | null | undefined, a: number, b: number) => v != null && v >= a && v <= b;
const within = (v: number | null | undefined, max: number) => v != null && v <= max;

export const PRESETS: Preset[] = [
  // ───────────── Teruji di BEI (Lab Uji: konsisten mengalahkan pasar 3 tahun, 2023–2026)
  {
    id: "high52_rs80",
    group: "✓ Teruji BEI",
    name: "Dekat high 52M + RS ≥ 80",
    rule: "≤ 5% dari harga tertinggi setahun · harga > MA200 · kenaikan 6 bulan masuk 20% terbaik",
    help:
      "Hasil terbaik Lab Uji di BEI: saham kuat yang sudah dekat puncak setahunnya. Rata-rata ±5,6% lebih baik dari pasar dalam 60 hari, positif 3 tahun berturut-turut. Win rate hanya ±45%: untungnya dari sedikit saham yang naik besar, jadi pasang stop loss dan biarkan yang untung berjalan.",
    test: (r) => (r.dist_high52 ?? -999) >= -5 && gt(r.dist_ma200, 0) && (r.rs_rank ?? 0) >= 80,
    sort: { key: "rs_rank", dir: "desc" },
    columns: ["dist_high52", "rs_rank", "chg126", "vol_ratio"],
  },
  {
    id: "high52_calm",
    group: "✓ Teruji BEI",
    name: "Dekat high 52M, volume tenang",
    rule: "≤ 5% dari harga tertinggi setahun · harga > MA200 · volume < 1,5× rata-rata",
    help:
      "Saham dekat puncak setahun yang naik TANPA lonjakan volume. Di Lab Uji ±4% lebih baik dari pasar dalam 60 hari. Lonjakan volume di BEI justru sering jadi puncak sesaat.",
    test: (r) => (r.dist_high52 ?? -999) >= -5 && gt(r.dist_ma200, 0) && (r.vol_ratio ?? 9) < 1.5,
    sort: { key: "dist_high52", dir: "desc" },
    columns: ["dist_high52", "vol_ratio", "rs_rank", "chg20"],
  },
  {
    id: "breakout_calm",
    group: "✓ Teruji BEI",
    name: "Breakout 20 hari, volume wajar",
    rule: "Tutup di atas high 20 hari hari ini · volume 1–2× rata-rata (bukan ledakan)",
    help:
      "Breakout dengan volume wajar ±2,3% lebih baik dari pasar dalam 60 hari, sedangkan breakout dengan volume meledak jauh lebih jelek. Cocok untuk menentukan waktu masuk.",
    test: (r) => r.breakout20_days === 0 && (r.vol_ratio ?? 0) >= 1 && (r.vol_ratio ?? 0) < 2,
    sort: { key: "vol_ratio", dir: "asc" },
    columns: ["vol_ratio", "dist_high52", "chg20", "rs_rank"],
  },
  // ───────────── Tren
  {
    id: "minervini",
    group: "Tren",
    name: "Minervini Trend Template",
    rule: "Harga > MA50 > MA150 > MA200 · MA200 naik 1 bln · ≥ 30% di atas low & ≤ 25% dari high 52M · RS ≥ 70",
    help:
      "Dari Mark Minervini (juara US Investing Championship). Hanya saham di tren naik tahap 2 yang sehat dan lebih kuat dari mayoritas pasar. Menggantikan preset 'Uptrend kuat' yang lebih longgar.",
    test: (r) =>
      gt(r.dist_ma50, 0) && r.ma50 != null && r.ma150 != null && r.ma200 != null && r.ma50 > r.ma150 && r.ma150 > r.ma200 &&
      gt(r.ma200_slope22, 0) && (r.dist_low52 ?? 0) >= 30 && (r.dist_high52 ?? -999) >= -25 && (r.rs_rank ?? 0) >= 70,
    sort: { key: "rs_rank", dir: "desc" },
    columns: ["rs_rank", "dist_high52", "dist_low52", "ma200_slope22", "chg126"],
  },
  {
    id: "stage2",
    group: "Tren",
    name: "Stage 2 (Weinstein)",
    rule: "Harga di atas MA150 yang sedang naik · belum terlalu jauh (≤ 15%)",
    help:
      "Stan Weinstein membagi siklus saham jadi 4 tahap; tahap 2 = fase naik utama: harga di atas rata-rata 30 minggu (≈ MA150) yang sedang menanjak. Batas 15% menghindari saham yang sudah terlalu jauh naik.",
    test: (r) => between(r.dist_ma150, 0, 15) && gt(r.ma150_slope20, 0),
    sort: { key: "ma150_slope20", dir: "desc" },
    columns: ["dist_ma150", "ma150_slope20", "chg60", "vol_ratio"],
  },
  {
    id: "momentum",
    group: "Tren",
    name: "Momentum 6 bulan (top 20%)",
    rule: "Kenaikan 6 bulan masuk 20% terbaik (RS ≥ 80) · harga > MA200",
    help:
      "Efek momentum: saham yang naik paling kuat 6–12 bulan terakhir cenderung melanjutkan. Salah satu temuan yang paling sering dibuktikan riset akademik, termasuk di pasar berkembang. RS dihitung dari saham likuid (≥ Rp 1 M/hari).",
    test: (r) => (r.rs_rank ?? 0) >= 80 && gt(r.dist_ma200, 0),
    sort: { key: "chg126", dir: "desc" },
    columns: ["chg126", "chg_12_1", "rs_rank", "dist_ma200"],
  },
  {
    id: "adx",
    group: "Tren",
    name: "Tren kuat (ADX)",
    rule: "ADX(14) > 25 · +DI > −DI · harga > MA50",
    help: "ADX dari J. Welles Wilder mengukur KEKUATAN tren. Di atas 25 dengan +DI di atas −DI = tren naik yang benar-benar kuat, bukan naik tipis.",
    test: (r) => gt(r.adx14, 25) && r.pdi14 != null && r.mdi14 != null && r.pdi14 > r.mdi14 && gt(r.dist_ma50, 0),
    sort: { key: "adx14", dir: "desc" },
    columns: ["adx14", "dist_ma50", "chg20", "rsi14"],
  },
  {
    id: "ichimoku",
    group: "Tren",
    name: "Di atas awan Ichimoku",
    rule: "Harga > awan · Tenkan > Kijun · awan depan hijau",
    help: "Konfirmasi tren versi Ichimoku Kinko Hyo (9/26/52): ketiga syarat bullish klasik terpenuhi sekaligus.",
    test: (r) => r.ichi_above === 1 && r.ichi_tk === 1 && r.ichi_green === 1,
    sort: { key: "chg20", dir: "desc" },
    columns: ["chg20", "dist_ma50", "adx14", "rsi14"],
  },
  {
    id: "high52",
    group: "Tren",
    name: "Dekat harga tertinggi 52 minggu",
    rule: "Jarak ≤ 5% dari harga tertinggi setahun · harga > MA200",
    help: "Saham yang bertahan dekat puncak setahunnya biasanya punya tren kuat (riset George & Hwang, 2004: efek 52-week high).",
    test: (r) => (r.dist_high52 ?? -999) >= -5 && gt(r.dist_ma200, 0),
    sort: { key: "dist_high52", dir: "desc" },
    columns: ["dist_high52", "chg20", "chg60", "rsi14"],
  },
  {
    id: "golden",
    group: "Tren",
    name: "Golden cross baru",
    rule: "MA50 memotong ke atas MA200 ≤ 5 hari lalu",
    help: "Tanda klasik awal tren naik jangka menengah. Sinyalnya lambat (sering muncul setelah harga naik cukup jauh).",
    test: (r) => within(r.golden_days, 5),
    sort: { key: "golden_days", dir: "asc" },
    columns: ["golden_days", "dist_ma200", "chg20", "rsi14"],
  },

  // ───────────── Entry & breakout
  {
    id: "breakout",
    group: "Entry & breakout",
    name: "Breakout 20 hari + volume",
    rule: "Tutup di atas harga tertinggi 20 hari · volume ≥ 1,5× rata-rata",
    help: "Harga menembus harga tertinggi 20 hari sebelumnya dengan volume di atas rata-rata: minat beli yang kuat.",
    test: (r) => r.breakout20_days === 0 && (r.vol_ratio ?? 0) >= 1.5,
    sort: { key: "vol_ratio", dir: "desc" },
    columns: ["chg1", "vol_ratio", "dist_high52", "rsi14"],
  },
  {
    id: "pocket",
    group: "Entry & breakout",
    name: "Pocket Pivot",
    rule: "Naik · volume > volume hari turun terbesar 10 hari · dekat MA10 (≤ 5%) · harga > MA50",
    help:
      "Dari Chris Kacher & Gil Morales (aliran William O'Neil/CAN SLIM): volume hari naik yang mengalahkan semua hari turun baru-baru ini, saat harga belum jauh dari MA10. Dibaca sebagai akumulasi institusi. Ditampilkan jika terjadi ≤ 2 hari lalu.",
    test: (r) => within(r.pocket_pivot_days, 2),
    sort: { key: "pocket_pivot_days", dir: "asc" },
    columns: ["pocket_pivot_days", "vol_ratio", "dist_ma50", "chg1"],
  },
  {
    id: "gap",
    group: "Entry & breakout",
    name: "Gap naik + volume",
    rule: "Buka di atas high kemarin · tutup di atas open · volume ≥ 2× rata-rata",
    help: "Gap naik yang ditutup hijau dengan volume besar biasanya dipicu berita atau kinerja. Perhatikan: gap besar di saham kecil rawan ditutup lagi.",
    test: (r) => gt(r.gap_pct, 0) && gt(r.body_pct, 0) && (r.vol_ratio ?? 0) >= 2,
    sort: { key: "gap_pct", dir: "desc" },
    columns: ["gap_pct", "chg1", "vol_ratio", "value_20d"],
  },
  {
    id: "pullback",
    group: "Entry & breakout",
    name: "Pullback di tren naik",
    rule: "Harga > MA200 · dalam ±3% dari MA20 atau MA50 · RSI 40–55",
    help: "Tren jangka panjang naik, tapi harga sedang koreksi mendekati rata-rata: titik masuk yang lebih murah dalam tren.",
    test: (r) =>
      gt(r.dist_ma200, 0) &&
      ((r.dist_ma20 != null && Math.abs(r.dist_ma20) <= 3) || (r.dist_ma50 != null && Math.abs(r.dist_ma50) <= 3)) &&
      between(r.rsi14, 40, 55),
    sort: { key: "dist_ma200", dir: "desc" },
    columns: ["dist_ma20", "dist_ma50", "dist_ma200", "rsi14", "chg5"],
  },
  {
    id: "macd",
    group: "Entry & breakout",
    name: "MACD cross naik baru",
    rule: "MACD memotong ke atas sinyal ≤ 3 hari lalu · harga > MA50",
    help: "Momentum baru berbalik naik, pada saham yang harganya di atas rata-rata 50 hari.",
    test: (r) => within(r.macd_up_days, 3) && gt(r.dist_ma50, 0),
    sort: { key: "macd_up_days", dir: "asc" },
    columns: ["macd_up_days", "macd_hist", "dist_ma50", "rsi14"],
  },
  {
    id: "stoch",
    group: "Entry & breakout",
    name: "Stochastic keluar dari oversold",
    rule: "%K memotong ke atas %D saat di bawah 20 (≤ 2 hari lalu) · harga > MA200",
    help: "Pemicu pantulan jangka pendek di dalam tren naik. Lebih cepat dari RSI oversold, tapi lebih sering sinyal palsu.",
    test: (r) => within(r.stoch_up_days, 2) && gt(r.dist_ma200, 0),
    sort: { key: "stoch_up_days", dir: "asc" },
    columns: ["stoch_up_days", "stoch_k", "dist_ma200", "chg5"],
  },
  {
    id: "oversold",
    group: "Entry & breakout",
    name: "Oversold di tren naik",
    rule: "RSI(14) < 30 · harga masih > MA200",
    help: "Jenuh jual jangka pendek pada saham yang tren jangka panjangnya masih naik: kandidat pantulan.",
    test: (r) => lt(r.rsi14, 30) && gt(r.dist_ma200, 0),
    sort: { key: "rsi14", dir: "asc" },
    columns: ["rsi14", "chg5", "chg20", "dist_ma200"],
  },

  // ───────────── Volatilitas
  {
    id: "squeeze",
    group: "Volatilitas",
    name: "Squeeze (Bollinger menyempit)",
    rule: "Lebar Bollinger Band tersempit dalam 6 bulan",
    help: "Periode tenang yang panjang sering diikuti pergerakan besar; arahnya belum tentu naik. Pasangkan dengan filter tren (mis. Jarak ke MA200 > 0).",
    test: (r) => r.bb_pctile != null && r.bb_pctile <= 0,
    sort: { key: "bb_width", dir: "asc" },
    columns: ["bb_width", "atr_pct", "dist_ma50", "chg20"],
  },
  {
    id: "nr7",
    group: "Volatilitas",
    name: "NR7 / Inside day di tren naik",
    rule: "Rentang harian tersempit 7 hari ATAU inside day · harga > MA50 & MA200",
    help: "Dari Toby Crabel: hari dengan rentang paling sempit sering menjadi titik tenang sebelum pergerakan besar. Rencana umum: beli jika besok menembus high hari ini.",
    test: (r) => (r.nr7 === 1 || r.inside_day === 1) && gt(r.dist_ma50, 0) && gt(r.dist_ma200, 0),
    sort: { key: "atr_pct", dir: "asc" },
    columns: ["nr7", "inside_day", "atr_pct", "dist_ma50"],
  },
  {
    id: "vcp",
    group: "Volatilitas",
    name: "VCP (volatilitas mengetat)",
    rule: "Tren naik · 3 rentang 15 hari makin sempit, terakhir ≤ 10% · volume menyusut",
    help:
      "Volatility Contraction Pattern ala Mark Minervini, versi sederhana: koreksi yang makin kecil dengan volume mengering, tanda penjual habis sebelum breakout. Versi otomatis ini lebih kasar dari penilaian visual.",
    test: (r) => r.vcp === 1,
    sort: { key: "dist_high52", dir: "desc" },
    columns: ["dist_high52", "atr_pct", "vol_ratio", "dist_ma50"],
  },

  // ───────────── Aliran dana
  {
    id: "accumulation",
    group: "Aliran dana",
    name: "Akumulasi diam-diam",
    rule: "Harga 20 hari datar (±5%) · CMF > 0,10 · OBV 20 hari > +0,20",
    help:
      "Harga belum ke mana-mana, tapi volume lebih banyak masuk di hari naik dan harga sering tutup dekat high: pola yang sering dibaca sebagai akumulasi dana besar. Perkiraan dari harga & volume saja, bukan data broker/asing.",
    test: (r) => r.chg20 != null && Math.abs(r.chg20) <= 5 && gt(r.cmf20, 0.1) && gt(r.obv20, 0.2),
    sort: { key: "cmf20", dir: "desc" },
    columns: ["chg20", "cmf20", "obv20", "updown_vol20", "value_20d"],
  },
  {
    id: "inflow",
    group: "Aliran dana",
    name: "Aliran dana kuat",
    rule: "CMF > 0,15 · volume naik ÷ turun ≥ 1,5 · harga > MA50",
    help: "Tekanan beli dominan selama sebulan terakhir pada saham yang sudah di atas rata-rata 50 hari.",
    test: (r) => gt(r.cmf20, 0.15) && (r.updown_vol20 ?? 0) >= 1.5 && gt(r.dist_ma50, 0),
    sort: { key: "cmf20", dir: "desc" },
    columns: ["cmf20", "updown_vol20", "obv20", "dist_ma50", "chg20"],
  },
  {
    id: "volume",
    group: "Aliran dana",
    name: "Lonjakan volume",
    rule: "Volume ≥ 3× rata-rata 20 hari · harga naik hari ini",
    help: "Volume melonjak disertai kenaikan harga: sering menandai masuknya dana besar atau berita.",
    test: (r) => (r.vol_ratio ?? 0) >= 3 && gt(r.chg1, 0),
    sort: { key: "vol_ratio", dir: "desc" },
    columns: ["chg1", "vol_ratio", "value_20d", "rsi14"],
  },
  {
    id: "distribution",
    group: "Aliran dana",
    name: "Distribusi (waspada)",
    rule: "Harga naik > 5% dalam 20 hari · tapi CMF < −0,05",
    help:
      "Harga masih naik, tapi volume dan posisi penutupan menunjukkan tekanan jual: sering dibaca sebagai dana besar sedang melepas barang. Preset peringatan, bukan sinyal beli.",
    test: (r) => gt(r.chg20, 5) && lt(r.cmf20, -0.05),
    sort: { key: "cmf20", dir: "asc" },
    columns: ["chg20", "cmf20", "obv20", "updown_vol20"],
  },

  // ───────────── Fundamental
  {
    id: "quality_trend",
    group: "Fundamental",
    name: "Kualitas + tren",
    rule: "ROE ≥ 15% · DER ≤ 1 (bank dikecualikan) · untung · harga > MA50 > MA200",
    help:
      "Perusahaan menguntungkan dengan utang rendah, yang harganya sedang dalam tren naik. Gabungan faktor kualitas dan tren adalah salah satu kombinasi yang paling banyak didukung riset.",
    test: (r) => (r.roe ?? 0) >= 15 && (r.der == null || r.der <= 1) && r.profitable === 1 && r.fund_ok === 1 &&
      gt(r.dist_ma50, 0) && r.ma50 != null && r.ma200 != null && r.ma50 > r.ma200,
    sort: { key: "roe", dir: "desc" },
    columns: ["roe", "der", "per", "dist_ma200", "chg60"],
  },
  {
    id: "value_momentum",
    group: "Fundamental",
    name: "Murah + momentum",
    rule: "PER 3–12 · PBV ≤ 1,5 · untung · RS ≥ 60 · harga > MA200",
    help:
      "Valuasi rendah, tapi pasar sudah mulai menghargai (momentum positif). Menghindari 'value trap': saham murah yang terus turun.",
    test: (r) => between(r.per, 3, 12) && r.pbv != null && r.pbv <= 1.5 && r.fund_ok === 1 && (r.rs_rank ?? 0) >= 60 && gt(r.dist_ma200, 0),
    sort: { key: "per", dir: "asc" },
    columns: ["per", "pbv", "roe", "rs_rank", "chg126"],
  },
  {
    id: "dividend_trend",
    group: "Fundamental",
    name: "Dividen + tren naik",
    rule: "Dividend yield ≥ 5% · PER ≤ 15 · fundamental sehat · harga > MA200",
    help:
      "Dividen tinggi pada perusahaan sehat yang harganya tidak sedang jatuh. Yield bisa termasuk dividen spesial, jadi cek riwayat dividennya.",
    test: (r) => (r.div_yield ?? 0) >= 5 && r.per != null && r.per <= 15 && r.fund_ok === 1 && gt(r.dist_ma200, 0),
    sort: { key: "div_yield", dir: "desc" },
    columns: ["div_yield", "per", "roe", "dist_ma200"],
  },
  {
    id: "growth_breakout",
    group: "Fundamental",
    name: "Pertumbuhan + kekuatan harga",
    rule: "Pendapatan & laba tumbuh ≥ 15% YoY · untung · ≤ 10% dari high 52 minggu",
    help: "Kinerja bertumbuh cepat dan harganya bertahan dekat puncak setahun (pola ala CAN SLIM: kinerja + kekuatan harga).",
    test: (r) => (r.rev_growth ?? -1) >= 15 && (r.eps_growth ?? -1) >= 15 && r.profitable === 1 && (r.dist_high52 ?? -999) >= -10,
    sort: { key: "eps_growth", dir: "desc" },
    columns: ["rev_growth", "eps_growth", "per", "dist_high52"],
  },
  {
    id: "weak_fund",
    group: "Fundamental",
    name: "⚠ Fundamental lemah (hindari)",
    rule: "Rugi 12 bulan · atau ekuitas negatif · atau DER > 3 · atau laporan > 9 bulan",
    help: "Preset peringatan: saham dengan masalah fundamental. Banyak sinyal BUY yang gagal berasal dari kelompok ini.",
    test: (r) => r.profitable === 0 || r.equity_positive === 0 || (r.der ?? 0) > 3 || r.fund_stale === 1,
    sort: { key: "value_20d", dir: "desc" },
    columns: ["roe", "der", "per", "value_20d"],
  },

  // ───────────── Pembalikan
  {
    id: "rsidiv",
    group: "Pembalikan (berisiko)",
    name: "Divergensi bullish RSI",
    rule: "Low harga lebih rendah, tapi RSI lebih tinggi · RSI low sebelumnya < 40 · ≤ 10 hari lalu",
    help: "Tekanan jual melemah walau harga masih turun. Pembalikan klasik, tapi sering prematur: tunggu konfirmasi (mis. harga tembus MA20).",
    test: (r) => r.rsi_div_days != null,
    sort: { key: "rsi_div_days", dir: "asc" },
    columns: ["rsi_div_days", "rsi14", "chg20", "dist_low52"],
  },
  {
    id: "bounce52",
    group: "Pembalikan (berisiko)",
    name: "Pantulan dari low 52 minggu",
    rule: "≤ 10% dari low 52 minggu · naik ≥ 2 hari beruntun · volume ≥ 1,5×",
    help: "Mencari dasar di saham yang sudah jatuh jauh. Preset paling berisiko: banyak saham di dekat low setahun masih terus turun.",
    test: (r) => within(r.dist_low52, 10) && (r.up_streak ?? 0) >= 2 && (r.vol_ratio ?? 0) >= 1.5,
    sort: { key: "vol_ratio", dir: "desc" },
    columns: ["dist_low52", "up_streak", "vol_ratio", "chg5"],
  },

  // ───────────── SATS
  {
    id: "sats",
    group: "SATS",
    name: "SATS BUY lolos filter",
    rule: "BUY SATS ≤ 5 hari · lolos filter harga > MA200 & IHSG > MA200",
    help: "Sinyal BUY SATS yang lolos filter MA200 & IHSG (strategi lama; strategi utama sekarang SATS + dekat high 52M). Kosong saat filter pasar tertutup (IHSG di bawah MA200).",
    test: (r) => r.sats_signal === "BUY" && r.sats_bars != null && r.sats_bars <= 5 && r.sats_filter === 1,
    sort: { key: "sats_bars", dir: "asc" },
    columns: ["sats_bars", "dist_ma200", "chg5", "rsi14"],
  },
];

/** RS rank (0–100): 6-month return percentile among liquid stocks (≥ Rp 1 M/day), same as the Screener. */
export function withRsRank<T extends ScreenerRow>(rows: T[]): T[] {
  const liquid = rows.filter((r) => (r.value_20d ?? 0) >= 1e9 && r.chg126 != null).map((r) => r.chg126 as number);
  liquid.sort((a, b) => a - b);
  const rank = (v: number) => {
    let lo = 0;
    let hi = liquid.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (liquid[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return liquid.length > 1 ? Math.round((lo / (liquid.length - 1)) * 100) : null;
  };
  return rows.map((r) => ({ ...r, rs_rank: (r.value_20d ?? 0) >= 1e9 && r.chg126 != null ? rank(r.chg126) : null }));
}

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);
