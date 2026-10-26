export type Bias = "bull" | "bear" | "neutral";

export interface PatternMeta {
  id: string;
  name: string;
  bias: Bias;
  help: string;
}

export const CANDLES: PatternMeta[] = [
  { id: "hammer", name: "Hammer", bias: "bull", help: "Setelah turun: badan kecil di atas, ekor bawah ≥ 2× badan. Penjual sempat menekan tapi pembeli menutup harga kembali tinggi." },
  { id: "inverted_hammer", name: "Inverted hammer", bias: "bull", help: "Setelah turun: badan kecil di bawah, ekor atas ≥ 2× badan. Tanda awal pembeli mencoba masuk; perlu konfirmasi besok." },
  { id: "bull_engulfing", name: "Bullish engulfing", bias: "bull", help: "Setelah turun: candle hijau yang badannya menelan seluruh badan candle merah kemarin." },
  { id: "bull_harami", name: "Bullish harami", bias: "bull", help: "Setelah turun: candle merah panjang lalu candle hijau kecil di dalam badannya. Tekanan jual mulai melemah." },
  { id: "piercing", name: "Piercing line", bias: "bull", help: "Setelah turun: candle merah panjang, lalu candle hijau yang menutup di atas tengah badan merah tersebut." },
  { id: "morning_star", name: "Morning star", bias: "bull", help: "3 candle: merah panjang, candle kecil (ragu), lalu hijau yang menutup di atas tengah candle pertama. Pembalikan naik klasik." },
  { id: "three_white", name: "Three white soldiers", bias: "bull", help: "3 candle hijau berturut-turut, masing-masing tutup lebih tinggi dengan ekor atas pendek. Pembeli dominan." },
  { id: "bull_marubozu", name: "Bullish marubozu", bias: "bull", help: "Candle hijau panjang hampir tanpa ekor (badan ≥ 90% rentang): pembeli menguasai sepanjang hari." },
  { id: "tweezer_bottom", name: "Tweezer bottom", bias: "bull", help: "Setelah turun: dua candle dengan low hampir sama (merah lalu hijau). Low tersebut diuji dua kali dan bertahan." },
  { id: "dragonfly_doji", name: "Dragonfly doji", bias: "bull", help: "Setelah turun: buka ≈ tutup di dekat high, ekor bawah panjang. Penolakan harga rendah." },
  { id: "hanging_man", name: "Hanging man", bias: "bear", help: "Setelah naik: bentuk hammer. Peringatan bahwa penjual mulai muncul." },
  { id: "shooting_star", name: "Shooting star", bias: "bear", help: "Setelah naik: badan kecil di bawah, ekor atas panjang. Harga sempat naik tinggi tapi ditolak." },
  { id: "bear_engulfing", name: "Bearish engulfing", bias: "bear", help: "Setelah naik: candle merah yang badannya menelan seluruh badan candle hijau kemarin." },
  { id: "bear_harami", name: "Bearish harami", bias: "bear", help: "Setelah naik: candle hijau panjang lalu candle merah kecil di dalam badannya." },
  { id: "dark_cloud", name: "Dark cloud cover", bias: "bear", help: "Setelah naik: hijau panjang, lalu merah yang menutup di bawah tengah badan hijau." },
  { id: "evening_star", name: "Evening star", bias: "bear", help: "3 candle: hijau panjang, candle kecil, lalu merah yang menutup di bawah tengah candle pertama." },
  { id: "three_black", name: "Three black crows", bias: "bear", help: "3 candle merah berturut-turut, masing-masing tutup lebih rendah. Penjual dominan." },
  { id: "bear_marubozu", name: "Bearish marubozu", bias: "bear", help: "Candle merah panjang hampir tanpa ekor: penjual menguasai sepanjang hari." },
  { id: "tweezer_top", name: "Tweezer top", bias: "bear", help: "Setelah naik: dua candle dengan high hampir sama (hijau lalu merah). High ditolak dua kali." },
  { id: "gravestone_doji", name: "Gravestone doji", bias: "bear", help: "Setelah naik: buka ≈ tutup di dekat low, ekor atas panjang. Kenaikan ditolak." },
  { id: "doji", name: "Doji", bias: "neutral", help: "Buka ≈ tutup (badan ≤ 10% rentang): pasar ragu. Artinya bergantung pada tren sebelumnya." },
];

export const CHARTS: PatternMeta[] = [
  {
    id: "double_bottom", name: "Double bottom (W)", bias: "bull",
    help: "Dua low setara (±3%) berjarak 10–60 hari dengan puncak ≥ 7% di antaranya. Breakout = harga tutup menembus puncak tengah dalam 3 hari terakhir.",
  },
  {
    id: "asc_triangle", name: "Ascending triangle", bias: "bull",
    help: "Resistance datar (≥ 2 puncak setara ±2%) dengan low yang terus naik, dalam 60 hari. Breakout = tutup > resistance.",
  },
  {
    id: "bull_flag", name: "Bull flag", bias: "bull",
    help: "Kenaikan tajam ≥ 15% dalam ≤ 10 hari (tiang), lalu koreksi tenang ≤ 50% dengan volume lebih kecil (bendera). Breakout = tutup di atas high bendera.",
  },
  {
    id: "double_top", name: "Double top (M) — waspada", bias: "bear",
    help: "Dua puncak setara (±3%) dengan lembah ≥ 7% di antaranya. 'Breakout' = harga tutup jebol ke bawah lembah tengah: tanda pelemahan.",
  },
  {
    id: "cup_handle", name: "Cup & handle", bias: "bull",
    help: "Mangkuk berbentuk U (dalam 12–35%, 30–120 hari, dua bibir setara ±5%), lalu 'gagang' 5–25 hari yang turun 0–15% di separuh atas mangkuk. Breakout = tutup di atas bibir kanan.",
  },
  {
    id: "channel_up", name: "Channel breakout", bias: "bull",
    help: "Harga bergerak di saluran sejajar (datar atau naik, lebar ≥ 6%) dari 3–4 puncak dan lembah terakhir dalam 60 hari. Terbentuk = harga di separuh atas saluran; breakout = tutup di atas garis atas saluran.",
  },
  {
    id: "inv_hs", name: "Inverse head & shoulders", bias: "bull",
    help: "Tiga lembah: tengah (kepala) ≥ 3% lebih rendah dari dua bahu yang setara (±5%), setelah turun ≥ 10%. Breakout = tutup di atas garis leher (neckline).",
  },
  {
    id: "rounding_bottom", name: "Rounding bottom", bias: "bull",
    help: "Dasar membulat 100 hari (kurva parabola cocok ≥ 70%), titik terendah di tengah, ≥ 15% di bawah bibir kiri; harga sudah pulih ke 40% teratas. Breakout = tutup di atas bibir kiri.",
  },
  {
    id: "falling_wedge", name: "Falling wedge", bias: "bull",
    help: "Garis puncak dan lembah sama-sama turun tapi menyempit (puncak turun lebih cepat): tekanan jual melemah. Breakout = tutup di atas garis atas.",
  },
  {
    id: "sym_triangle", name: "Symmetrical triangle", bias: "bull",
    help: "Puncak makin rendah dan lembah makin tinggi (menyempit) dalam 60 hari. Arah belum pasti; 'breakout' di sini = tutup di atas garis atas.",
  },
  {
    id: "wyckoff_accum", name: "Wyckoff accumulation", bias: "bull",
    help: "Setelah turun ≥ 20%, harga mendatar 40 hari (rentang 6–25%) dan sempat 'spring' (jebol ke bawah lalu kembali masuk) dalam 30 hari. Breakout = tutup di atas batas atas rentang.",
  },
  {
    id: "new_uptrend", name: "Tren naik baru", bias: "bull",
    help: "60 hari lalu masih di bawah MA200, kini di atas MA50 & MA200 dengan puncak dan lembah makin tinggi. Terbentuk = harga ≤ 5% di bawah puncak terakhir; breakout = tutup di atasnya.",
  },
  {
    id: "channel_down", name: "Channel turun · breakout", bias: "bull",
    help: "Harga turun di saluran sejajar (puncak dan lembah sama-sama turun, lebar ≥ 6%) dalam 60 hari. Terbentuk = harga menekan garis atas (≤ 3%); breakout = tutup di atas garis atas: tren turun mungkin berakhir.",
  },
  {
    id: "desc_triangle", name: "Descending triangle — waspada", bias: "bear",
    help: "Support datar (≥ 2 lembah setara ±2%) dengan puncak yang makin rendah, dalam 60 hari. 'Breakout' = tutup jebol ke bawah support.",
  },
  {
    id: "bear_flag", name: "Bear flag — waspada", bias: "bear",
    help: "Turun tajam ≥ 15% dalam ≤ 10 hari, lalu pantulan lemah 10–50% dengan volume lebih kecil. 'Breakout' = tutup di bawah low bendera: penurunan berlanjut.",
  },
  {
    id: "hs_top", name: "Head & shoulders — waspada", bias: "bear",
    help: "Tiga puncak: tengah (kepala) ≥ 3% lebih tinggi dari dua bahu yang setara (±5%), setelah naik ≥ 10%. 'Breakout' = tutup jebol ke bawah garis leher: tanda pembalikan turun.",
  },
  {
    id: "rising_wedge", name: "Rising wedge — waspada", bias: "bear",
    help: "Garis puncak dan lembah sama-sama naik tapi menyempit (lembah naik lebih cepat): kenaikan kehabisan tenaga. 'Breakout' = tutup jebol ke bawah garis bawah.",
  },
];

export const patternMeta = (id: string) => CANDLES.find((p) => p.id === id) ?? CHARTS.find((p) => p.id === id);

/** "hammer@0,doji@3" -> [{id, days}] */
export const parseCandles = (s: string | null | undefined) =>
  (s ?? "")
    .split(",")
    .filter(Boolean)
    .map((x) => {
      const [id, d] = x.split("@");
      return { id, days: Number(d) };
    });

/** "double_bottom:breakout" -> [{id, status}] */
export const parseCharts = (s: string | null | undefined) =>
  (s ?? "")
    .split(",")
    .filter(Boolean)
    .map((x) => {
      const [id, status] = x.split(":");
      return { id, status: status as "forming" | "breakout" };
    });
