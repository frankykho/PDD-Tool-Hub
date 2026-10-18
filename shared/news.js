// Berita pasar dari RSS resmi media (judul & tautan saja; isi artikel milik media). Google News menolak permintaan otomatis.
// Dipakai Fund, Bond & ETF Insight; tiap tool menyaring topiknya sendiri lewat regex.
export const NEWS_FEEDS = [
  ["https://www.cnbcindonesia.com/market/rss", "CNBC Indonesia"],
  ["https://www.antaranews.com/rss/ekonomi-finansial.xml", "Antara"],
  ["https://www.antaranews.com/rss/ekonomi-bursa.xml", "Antara"],
  ["https://investasi.kontan.co.id/rss", "Kontan"],
  ["https://www.idxchannel.com/rss", "IDX Channel"],
];

// RSS -> [{t, link, src, at}]
export function rssItems(xml) {
  const un = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const g = (tag) => un((new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(it) || [])[1]);
    const src = g("source"), t = g("title");
    return { t: src && t.endsWith(" - " + src) ? t.slice(0, -(src.length + 3)) : t, link: g("link"), src, at: (Date.parse(g("pubDate")) ? new Date(g("pubDate")).toISOString() : "") };
  }).filter((x) => x.t && /^https?:\/\//.test(x.link));
}

// ponytail: diingat per isolate 30 menit (Cache API tidak berlaku di *.workers.dev); pakai KV kalau feed mulai membatasi
const memo = {};
/** Judul 7 hari terakhir yang cocok dengan `re`, terbaru dulu, tanpa judul kembar; yang cocok `top` (menyebut produknya langsung) didahulukan.
 *  Kosong kalau semua feed gagal. */
export async function newsFor(re, n = 12, top = null) {
  const k = re.source + "|" + (top ? top.source : ""), m = memo[k];
  if (m && Date.now() - m.at < 30 * 60e3) return m.v;
  const all = [];
  await Promise.all(NEWS_FEEDS.map(async ([url, src]) => {
    try { const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", /* Kontan tidak menjawab UA lain */ accept: "application/rss+xml,application/xml,text/xml" }, signal: AbortSignal.timeout(8000) }); if (r.ok) all.push(...rssItems(await r.text()).map((x) => ({ ...x, src: x.src || src }))); } catch {}
  }));
  const seen = new Set(), week = new Date(Date.now() - 7 * 864e5).toISOString();
  const v = all.filter((x) => re.test(x.t) && (!x.at || x.at >= week) && !seen.has(x.t) && seen.add(x.t)).sort((a, b) => (top ? top.test(b.t) - top.test(a.t) : 0) || String(b.at).localeCompare(String(a.at))).slice(0, n);
  if (v.length) memo[k] = { at: Date.now(), v }; // hasil kosong tidak diingat supaya permintaan berikutnya mencoba lagi
  return v;
}
