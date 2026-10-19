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
    sum: r2(out.reduce((a, x) => a + x.pts, 0)),
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
