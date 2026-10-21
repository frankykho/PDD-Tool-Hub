// Hitungan Market Recap tanpa I/O (dites di test.mjs).
export const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

/** Kontribusi poin tiap saham & breadth dari TradingView (semua saham, satu permintaan).
 *  Poin = perubahan kapitalisasi × IHSG kemarin / total kapitalisasi kemarin. */
// ponytail: kapitalisasi penuh, bukan bobot resmi IHSG; total biasanya selisih < 1 poin dari perubahan IHSG (field sum untuk cek)
export function contributions(rows, prevIhsg) {
  let base = 0;
  const list = rows.filter((d) => d[3] > 0 && Number.isFinite(d[2])).map(([code, close, pct, cap]) => {
    const prev = cap / (1 + pct / 100); base += prev; return { code, close, pct, d: cap - prev };
  });
  const out = list.map(({ code, close, pct, d }) => ({ code, close, pct: r2(pct), pts: r2((prevIhsg * d) / base) })).sort((a, b) => b.pts - a.pts);
  return {
    up: out.slice(0, 5).filter((x) => x.pts > 0), down: out.slice(-5).reverse().filter((x) => x.pts < 0),
    sum: r2(out.reduce((a, x) => a + x.pts, 0)), value: Math.round(rows.reduce((a, d) => a + (d[4] || 0), 0)),
    breadth: { up: list.filter((x) => x.pct > 0).length, down: list.filter((x) => x.pct < 0).length, flat: list.filter((x) => x.pct === 0).length },
  };
}
/** Nilai bersih asing per saham ≈ (lembar beli − lembar jual) × harga penutupan. null kalau wrap.json tidak memuat data asing. */
export function foreignFlow(wrap) {
  const list = Object.entries((wrap && wrap.foreign) || {}).map(([code, [b, s]]) => ({ code, net: ((b || 0) - (s || 0)) * (((wrap.stocks || {})[code] || [])[0] || 0) }));
  if (!list.length) return null;
  list.sort((a, b) => b.net - a.net);
  return { net: Math.round(list.reduce((a, x) => a + x.net, 0)), buy: list.slice(0, 5).filter((x) => x.net > 0), sell: list.slice(-5).reverse().filter((x) => x.net < 0) };
}

/** Grafik intraday dari Yahoo 5 menit: titik [menit WIB, harga] + buka/tertinggi/terendah. s1End = menit akhir sesi 1 (atau 0 = sehari penuh). */
export function intraday(y, s1End = 0) {
  if (!y) return null;
  const pts = [], hi = [], lo = [];
  let open = null;
  y.t.forEach((t, i) => {
    const m = Math.round(((t + 7 * 3600) % 86400) / 60), c = y.q.close[i];
    if (c == null || m < 540 || (s1End && m >= s1End)) return;
    if (open == null) open = y.q.open[i] ?? c;
    pts.push([m, r2(c)]); hi.push(y.q.high[i] ?? c); lo.push(y.q.low[i] ?? c);
  });
  return pts.length ? { pts, open: r2(open), high: r2(Math.max(...hi)), low: r2(Math.min(...lo)) } : null;
}
/** Penutupan harian [tanggal WIB, harga], n terakhir, dari Yahoo interval 1d. */
export function daily(y, n) {
  if (!y) return [];
  return y.t.map((t, i) => [new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10), r2(y.q.close[i])]).filter((x) => x[1] != null).slice(-n);
}
/** Harga terakhir & % dibanding penutupan hari bursa sebelumnya. */
export function lastChange(y) {
  const d = daily(y, 10);
  if (d.length < 2) return null;
  const [date, close] = d[d.length - 1], prev = d[d.length - 2][1];
  return { close, pct: r2((close / prev - 1) * 100), date };
}
/** Harga & % dari meta grafik Yahoo (regularMarketPrice vs chartPreviousClose = penutupan hari bursa sebelumnya pada range 1d). */
export function quote(y) {
  const m = y && y.meta;
  if (!m || !(m.regularMarketPrice > 0 && m.chartPreviousClose > 0)) return null;
  return { close: r2(m.regularMarketPrice), pct: r2((m.regularMarketPrice / m.chartPreviousClose - 1) * 100), date: new Date((m.regularMarketTime + 7 * 3600) * 1000).toISOString().slice(0, 10) };
}

/* ---------- Berita: pilih yang PENTING, bukan sekadar yang terbaru ---------- */
// Tema makro/kebijakan yang biasanya menggerakkan pasar. Urutan = prioritas tema saat skor sama.
export const NEWS_THEMES = [
  ["Bank Indonesia", /\bBI[- ]?Rate\b|suku bunga|Bank Indonesia|\bBI\b|\bRDG\b|\bGWM\b|deposit facility|lending facility/i],
  ["The Fed & AS", /The Fed|\bFed\b|FOMC|Powell|Wall Street|yield AS|Treasury|Trump/i],
  ["MSCI & arus asing", /\bMSCI\b|FTSE|capital outflow|modal asing|arus (?:modal|dana) asing|net (?:sell|buy) asing|asing (?:net|catat|lepas|borong)/i],
  ["Rupiah", /rupiah|kurs|dolar AS/i],
  ["Inflasi & ekonomi", /inflasi|\bPDB\b|pertumbuhan ekonomi|neraca (?:dagang|perdagangan|pembayaran)|transaksi berjalan|cadangan devisa|\bPMI\b|APBN|defisit/i],
  ["OJK & regulasi", /\bOJK\b|\bBEI\b.*(?:suspen|aturan|sanksi)|sanksi|denda|regulasi/i],
  ["Komoditas", /minyak|batu bara|emas|nikel|\bCPO\b|komoditas/i],
  ["Obligasi & SBN", /\bSBN\b|obligasi|yield SBN|lelang/i],
];
export const NEWS_RELEVANT = /IHSG|saham|bursa|\bBEI\b|indeks|asing|rupiah|emiten|investor|suku bunga|\bBI\b|Bank Indonesia|The Fed|\bFed\b|MSCI|inflasi|yield|obligasi|\bSBN\b|\bOJK\b|minyak|batu bara|emas|nikel|komoditas|ekonomi|APBN|\bPDB\b|kurs|dolar/i;
const NEWS_NOISE = /rekomendasi saham|simak rekomendasi|saham pilihan|saham (?:yang )?(?:layak|bisa) (?:dibeli|dicermati)|cek saham|^video:|\bvideo\b|cara |tips |promo|giveaway|QRIS|judol|luncurkan|fitur/i;
/** Pilih maks. n judul berita untuk AI & slide: skor = tema makro/kebijakan + menyebut IHSG + menyebut saham penggerak
 *  + seberapa banyak media memberitakan tema yang sama; maks. 3 judul per tema supaya beragam.
 *  Mengembalikan { news, events }: events = tema yang diberitakan >= 2 kali hari ini (wajib disinggung AI). */
export function pickNews(items, codes = [], n = 14) {
  const tick = codes.length ? new RegExp(`\\b(${codes.join("|")})\\b`) : null;
  const seen = new Set(), list = [];
  for (const x of items || []) {
    const t = String(x.t || "").trim(), k = t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!t || seen.has(k) || !NEWS_RELEVANT.test(t)) continue;
    seen.add(k);
    const theme = (NEWS_THEMES.find(([, re]) => re.test(t)) || [])[0] || "";
    list.push({ ...x, theme });
  }
  const count = {};
  for (const x of list) if (x.theme) count[x.theme] = (count[x.theme] || 0) + 1;
  const score = (x) => (x.theme ? 5 + Math.min(count[x.theme] - 1, 4) : 0) + (/IHSG|indeks/i.test(x.t) ? 3 : 0)
    + (tick && tick.test(x.t) ? 2 : 0) - (NEWS_NOISE.test(x.t) ? 4 : 0)
    + (x.theme && /IHSG|saham|bursa|pasar/i.test(x.t) ? 2 : 0);   // judul yang mengaitkan tema dengan pasar = paling berguna
  const ranked = list.map((x) => ({ x, s: score(x) })).sort((a, b) => b.s - a.s || String(b.x.at).localeCompare(String(a.x.at)));
  const per = {}, out = [];
  for (const { x } of ranked) {
    if (out.length >= n) break;
    if (x.theme && (per[x.theme] = (per[x.theme] || 0) + 1) > 3) continue;
    out.push(x);
  }
  const events = Object.entries(count).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1])
    .map(([theme, c]) => ({ theme, count: c, titles: ranked.filter(({ x }) => x.theme === theme).slice(0, 3).map(({ x }) => x.t) }));
  return { news: out.map(({ theme, ...x }) => x), events };
}
