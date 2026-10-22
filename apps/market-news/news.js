// Market News: logika murni (tanpa I/O) supaya bisa dites di Node.
// Sumber berita -> item {url, src, title, at, descr, image}; klasifikasi (makro / pasar / emiten); skor "hype";
// ekstraksi artikel (gambar & teks) dan perintah AI untuk ringkasan.

// RSS resmi media, dan halaman daftar berita untuk media tanpa RSS (link artikel dikenali dari polanya).
// ua: beberapa media (CloudFront) menolak User-Agent peramban lengkap tetapi menerima "Mozilla/5.0".
export const SOURCES = [
  { id: "cnbc-market", name: "CNBC Indonesia", type: "rss", url: "https://www.cnbcindonesia.com/market/rss" },
  { id: "cnbc-news", name: "CNBC Indonesia", type: "rss", url: "https://www.cnbcindonesia.com/news/rss" },
  { id: "kontan", name: "Kontan", type: "rss", url: "https://investasi.kontan.co.id/rss" },
  { id: "idxchannel", name: "IDX Channel", type: "rss", url: "https://www.idxchannel.com/rss" },
  { id: "technoz", name: "Bloomberg Technoz", type: "rss", url: "https://www.bloombergtechnoz.com/rss" },
  { id: "bisnis-market", name: "Bisnis.com", type: "html", url: "https://market.bisnis.com/", link: /^https:\/\/(?:market|ekonomi|finansial)\.bisnis\.com\/read\/\d{8}\/\d+\/\d+\/[a-z0-9-]+$/ },
  { id: "bisnis-ekonomi", name: "Bisnis.com", type: "html", url: "https://ekonomi.bisnis.com/", link: /^https:\/\/(?:market|ekonomi|finansial)\.bisnis\.com\/read\/\d{8}\/\d+\/\d+\/[a-z0-9-]+$/ },
  { id: "emitennews", name: "EmitenNews", type: "html", url: "https://www.emitennews.com/", link: /^https:\/\/www\.emitennews\.com\/news\/[a-z0-9-]+$/ },
  { id: "investor-market", name: "Investor Daily", type: "html", url: "https://investor.id/market", link: /^https:\/\/investor\.id\/(?:market|corporate-action)\/\d+\/[a-z0-9-]+$/ },
  { id: "investor-makro", name: "Investor Daily", type: "html", url: "https://investor.id/macroeconomy", link: /^https:\/\/investor\.id\/macroeconomy\/\d+\/[a-z0-9-]+$/ },
];

const ENT = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
export const decode = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" || e[1] === "X" ? 2 : 1), e[1] === "x" || e[1] === "X" ? 16 : 10) || 32) : ENT[e.toLowerCase()] ?? m);
export const strip = (s) => decode(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const iso = (s) => { const t = Date.parse(s); return t ? new Date(t).toISOString() : ""; };

/** RSS -> [{url, title, at, descr, image}] (link dari <link> atau <guid>; gambar dari enclosure / media:content / <img> di deskripsi). */
export function parseRss(xml) {
  return [...String(xml).matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const g = (tag) => { const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(it); return m ? decode(m[1]).trim() : ""; };
    const d = g("description"), url = (g("link") || g("guid")).trim();
    const img = (/<enclosure[^>]+url="([^"]+)"/.exec(it) || /<media:(?:content|thumbnail)[^>]+url="([^"]+)"/.exec(it) || /<img[^>]+src="([^"]+)"/.exec(d) || [])[1] || "";
    return { url, title: strip(g("title")), at: iso(g("pubDate")), descr: strip(d).slice(0, 500), image: decode(img) };
  }).filter((x) => x.title && /^https?:\/\//.test(x.url));
}

/** Halaman daftar berita -> [{url, title, at}]: link yang cocok dengan pola artikel; judul = teks link terpanjang,
 *  atau dari slug bila teksnya kosong / "Read More". Artikel berbayar (PREMIUM) dilewati. Tanggal dari URL bila ada (Bisnis.com). */
export function parseList(html, re) {
  const by = new Map(), skip = new Set();
  for (const m of String(html).matchAll(/<a\b[^>]*href=["']([^"'#?]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/g)) {
    const url = m[1].replace(/\/$/, "");
    if (!re.test(url)) continue;
    const t = strip(m[2]);
    if (/premium/i.test(t)) skip.add(url);
    if (!by.has(url) || t.length > by.get(url).length) by.set(url, t);
  }
  return [...by].filter(([u]) => !skip.has(u)).map(([url, t]) => {
    const slug = url.split("/").pop().replace(/-/g, " ");
    const title = t.length >= 20 && !/^(read more|baca selengkapnya)$/i.test(t) ? t.replace(/\s+\d+\s+(menit|jam|hari)\s+(yang\s+)?lalu$|\s+\d+\s+(menit|jam|hari)\s+ya$/i, "") : slug.charAt(0).toUpperCase() + slug.slice(1);
    const d = /\/read\/(\d{4})(\d{2})(\d{2})\//.exec(url);
    return { url, title, at: d ? `${d[1]}-${d[2]}-${d[3]}T00:00:00+07:00` : "", descr: "", image: "" };
  });
}

/* ---------------- klasifikasi ---------------- */
// Tema makro; data = rilis data / keputusan kebijakan (berdampak besar ke pasar)
export const MACRO = [
  ["BI-Rate", /\bbi[- ]?rate\b|suku bunga (acuan|bi\b|bank indonesia)|rdg bi|bank indonesia (tahan|naik|turun|pangkas|kerek)/i],
  ["The Fed", /\bthe fed\b|\bfomc\b|fed funds|\bpowell\b|suku bunga (as|amerika)/i],
  ["Inflasi", /\binflasi\b|\bdeflasi\b|indeks harga konsumen|\bcpi\b/i],
  ["PDB", /\bpdb\b|\bgdp\b|pertumbuhan ekonomi/i],
  ["Kredit", /pertumbuhan kredit|penyaluran kredit|loan growth|kredit perbankan|\bdpk\b/i],
  ["Neraca dagang", /neraca (perdagangan|dagang)|surplus dagang|defisit dagang/i],
  ["Cadangan devisa", /cadangan devisa/i],
  ["PMI", /\bpmi\b|purchasing managers/i],
  ["APBN", /\bapbn\b|defisit anggaran|penerimaan pajak/i],
  ["Rupiah", /\brupiah\b/i],
];
export const COMMODITY = [
  ["Batu bara", /batu ?bara|\bcoal\b/i, ["ADRO", "PTBA", "ITMG", "BUMI", "AADI"]],
  ["Nikel", /\bnikel\b|\bnickel\b/i, ["INCO", "ANTM", "MBMA", "NCKL", "HRUM"]],
  ["Emas", /\bemas\b|\bgold\b/i, ["ANTM", "MDKA", "BRMS", "ARCI", "HRTA"]],
  ["CPO", /\bcpo\b|sawit|crude palm/i, ["AALI", "LSIP", "TAPG", "DSNG", "SSMS"]],
  ["Minyak", /minyak (mentah|dunia)|\bbrent\b|\bwti\b|harga minyak/i, ["MEDC", "ENRG", "AKRA", "ELSA"]],
  ["Timah", /\btimah\b/i, ["TINS"]],
];
export const CORP = [
  ["Dividen", /\bdividen\b/i], ["Rights issue", /rights issue|\bhmetd\b|private placement|penambahan modal/i], ["Buyback", /buy ?back|pembelian kembali saham/i],
  ["Akuisisi", /akuisisi|caplok|\bmerger\b|ambil alih|divestasi/i], ["IPO", /\bipo\b|penawaran umum perdana|listing perdana|melantai/i], ["Stock split", /stock split|pemecahan (nilai )?saham/i],
  ["RUPS", /\brups\b/i], ["Kinerja", /\blaba\b|rugi bersih|pendapatan|kinerja (kuartal|semester|keuangan)|kuartal [iv]+|\bq[1-4]\b/i],
  ["Obligasi", /\bobligasi\b|\bsukuk\b/i], ["Tender offer", /tender offer|go private|delisting|suspensi|gembok/i],
];
const MARKET = /\bihsg\b|\bbursa\b|\bsaham\b|\basing\b|net (buy|sell)|\blq45\b|\bbei\b|\bidx\b|\bmsci\b|\bemiten\b/i;
// bukan berita pasar: rekomendasi/target harga analis (tidak boleh dibagikan ke nasabah), konten ringan, kripto
const NOISE = /^video\b|^foto\b|^infografis\b|rekomendasi|saham pilihan|target harga|layak (beli|koleksi)|cek (jadwal|di ?sini)|cara (membeli|daftar)|tips\b|zodiak|lowongan|kuis|live streaming|link nonton|\bbitcoin\b|\bkripto\b|\bcrypto\b|\bbtc\b/i;
const NOT_CODE = new Set(["IHSG", "BUMN", "BUMD", "LQ45", "IDX", "OJK", "RUPS", "MSCI", "FTSE", "APBN", "WIB", "USD", "IDR", "CPO", "PDB", "GDP", "PMI", "DPR", "KPK", "PPN", "PPH", "UMKM", "ASEAN", "BPJS", "LPS", "KSEI", "AKSI"]);

/** Judul bersih: tanpa awalan nama media & sisa tanggal/jam yang ikut terbaca dari halaman daftar. */
export const cleanTitle = (t) => String(t || "").replace(/^(emiten ?news|kontan|bisnis\.com|trending news|breaking news|headline)\s*(-->|→|[-|:])\s*/i, "").replace(/\s+\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}(\s*WIB?)?.*$/i, "").replace(/\s+/g, " ").trim();
/** Kode saham yang disebut (4 huruf, terdaftar di `codes` bila ada). */
export function tickers(text, codes) {
  const out = [];
  for (const m of String(text || "").matchAll(/\b([A-Z]{4})\b/g)) {
    const c = m[1];
    if (NOT_CODE.has(c) || out.includes(c) || (codes && codes.size && !codes.has(c))) continue;
    out.push(c);
  }
  return out.slice(0, 6);
}
/** Kategori & tema satu judul (+ deskripsi). null = bukan berita makro/pasar/emiten yang dipantau. */
export function classify(title, descr, codes) {
  const t = String(title || ""), all = t + " " + String(descr || "");
  if (NOISE.test(t)) return null;
  const tk = tickers(t, codes);
  const corp = (CORP.find(([, re]) => re.test(t)) || [])[0] || "";
  const macro = (MACRO.find(([, re]) => re.test(t)) || [])[0] || "";
  const comm = (COMMODITY.find(([, re]) => re.test(t)) || [])[0] || "";
  if (tk.length || (corp && MARKET.test(all) && corp !== "Kinerja")) return { cat: "emiten", theme: corp || comm || macro, corp, tickers: tk };
  if (macro && macro !== "Rupiah") return { cat: "makro", theme: macro, corp: "", tickers: [] };
  if (MARKET.test(t) || comm || macro) return { cat: "pasar", theme: comm || macro || (/\bihsg\b/i.test(t) ? "IHSG" : /\basing\b/i.test(t) ? "Asing" : ""), corp: "", tickers: [] };
  return null;
}
// rilis data / keputusan kebijakan (bukan sekadar opini atau proyeksi)
const RELEASE = /\brilis\b|\bdata\b|tercatat|mencapai|capai|sebesar|tumbuh|melambat|melonjak|turun|naik|tetap|tahan|pangkas|kerek|surplus|defisit|\d+(,\d+)?\s?(%|persen)/i;
const PREDICT = /\bproyeksi|prediksi|diperkirakan|berpotensi|bakal|akan\b|peluang|ramal/i;

/** Skor "hype" untuk item 48 jam terakhir. Kelompok = emiten (kode pertama) atau tema makro/pasar; hype = jumlah media
 *  berbeda yang memberitakan kelompok itu dalam 24 jam. Hasil per id: {ckey, score, lead, sources:[{src,url,title}]}. */
export function score(items, px = {}, now = Date.now()) {
  const day = now - 24 * 3600e3, groups = new Map(), out = {};
  for (const x of items) {
    const ck = x.tickers && x.tickers.length ? "T:" + x.tickers[0] : x.theme ? "M:" + x.theme : "U:" + x.id;
    if (!groups.has(ck)) groups.set(ck, []);
    groups.get(ck).push(x);
  }
  for (const [ck, g] of groups) {
    const recent = g.filter((x) => Date.parse(x.at || x.seen_at || 0) >= day);
    const media = new Set(recent.map((x) => x.src)).size;
    for (const x of g) {
      const age = (now - Date.parse(x.at || x.seen_at || now)) / 3600e3;
      const up = (x.tickers || []).map((c) => px[c]).filter((v) => typeof v === "number");
      let s = 2 * Math.min(media, 5) + (age <= 6 ? 2 : age <= 12 ? 1 : 0);
      if (x.corp && x.corp !== "Kinerja") s += 3; else if (x.corp) s += 1;
      if (x.cat === "makro") s += RELEASE.test(x.title) && !PREDICT.test(x.title) ? 4 : 1;
      if (up.some((v) => v >= 3)) s += 3; else if (up.some((v) => v > 0)) s += 1;
      if (/\bihsg\b/i.test(x.title)) s += 1;
      if (age > 36) s -= 4;
      out[x.id] = { ckey: ck, score: s };
    }
    // wakil kelompok: skor tertinggi, lalu yang terbaru; media lain dicatat sebagai "juga diberitakan"
    const lead = [...g].sort((a, b) => out[b.id].score - out[a.id].score || String(b.at).localeCompare(String(a.at)))[0];
    const seen = new Set([lead.src]);
    const others = g.filter((x) => x !== lead && !seen.has(x.src) && seen.add(x.src)).slice(0, 6).map((x) => ({ src: x.src, url: x.url, title: x.title }));
    for (const x of g) out[x.id].lead = x === lead ? 1 : 0;
    out[lead.id].sources = others;
    out[lead.id].score += Math.min(others.length, 4); // makin banyak media, makin "ramai"
  }
  return out;
}

/* ---------------- artikel & AI ---------------- */
const meta = (html, prop) => { const m = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i").exec(html); return m ? decode(m[1] || m[2]).trim() : ""; };
/** Halaman artikel -> {image, descr, text}: gambar utama (og:image), deskripsi, dan isi paragraf (maks. 7000 karakter). */
export function article(html) {
  const h = String(html || "");
  const body = h.replace(/<(script|style|noscript|figure|aside|nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ");
  // tanpa paragraf "baca juga", biodata penulis, dan keterangan foto
  const paras = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => strip(m[1])).filter((p) => p.length >= 60 && !/^(baca juga|simak|lihat juga|editor|penulis|sumber|foto)\b/i.test(p)
    && !/memulai karir|karir jurnalistik|sebagai (reporter|jurnalis|wartawan|editor)|content writer|youth researcher|\bfoto:\s*\S+\/|^\(?foto\b/i.test(p));
  return { title: strip(meta(h, "og:title")), image: meta(h, "og:image") || meta(h, "twitter:image"), descr: meta(h, "og:description") || meta(h, "description"), text: paras.join("\n").slice(0, 7000) };
}
export const AI_RULES = (us) => [
  `Kamu editor berita pasar modal untuk nasabah ${us || "perusahaan sekuritas"}. Dari artikel yang diberikan, tulis dalam Bahasa Indonesia yang ringkas dan netral:`,
  "- title: judul ringkas (maks. 90 karakter), tetap faktual.",
  "- summary: 2–3 kalimat fakta utama: angka, nama emiten beserta kodenya, tanggal; maks. 380 karakter. Jangan menyalin kalimat panjang dari artikel.",
  "- why: 1 kalimat mengapa berita ini penting bagi investor (dampak ke pasar, sektor, atau emiten).",
  '- cat: "makro" (data ekonomi / kebijakan), "pasar" (IHSG, sektor, asing, komoditas), atau "emiten" (perusahaan tercatat / aksi korporasi).',
  "- tickers: kode saham yang dibahas (4 huruf), maks. 5.",
  "Aturan: hanya fakta dari artikel. DILARANG rekomendasi beli/jual/tahan, target harga, atau ajakan bertransaksi. Bila artikel bukan berita pasar/ekonomi, isi summary \"\".",
  'Jawab HANYA dengan JSON: {"title": "", "summary": "", "why": "", "cat": "", "tickers": []}',
].join("\n");
const ADVICE = /\b(beli|jual|tahan|akumulasi|buy|sell|hold)\b[^.]{0,30}\b(saham|sekarang|di harga|target)|target harga|rekomendasi/i;
/** Jawaban AI -> {title, summary, why, cat, tickers}; kalimat bernada rekomendasi dibuang. */
export function parseAi(raw) {
  const t = String(raw || ""), a = t.indexOf("{"), b = t.lastIndexOf("}");
  let j = null; try { if (a >= 0 && b > a) j = JSON.parse(t.slice(a, b + 1)); } catch {}
  if (!j || typeof j !== "object") throw new Error("Jawaban AI tidak berisi JSON.");
  const s = (v, n) => (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, n);
  const clean = (v, n) => s(v, n).split(/(?<=[.!?])\s+/).filter((x) => !ADVICE.test(x)).join(" ");
  return { title: s(j.title, 140), summary: clean(j.summary, 500), why: clean(j.why, 300), cat: ["makro", "pasar", "emiten"].includes(j.cat) ? j.cat : "",
    tickers: (Array.isArray(j.tickers) ? j.tickers : []).map((x) => String(x).toUpperCase().trim()).filter((x) => /^[A-Z]{4}$/.test(x)).slice(0, 5) };
}
/** Satu id pendek dan stabil dari URL. */
export function idOf(url) { let h = 2166136261; for (const c of String(url)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36) + String(url).length.toString(36); }

/* ---------------- ringkasan pasar ---------------- */
/** Baris TradingView [kode, close, %chg, nilai transaksi] -> {px, codes, breadth, gainers, value}. Top gainer hanya saham
 *  dengan nilai transaksi >= Rp1 miliar dan harga >= 50 (tanpa saham tidur / gocap). */
export function marketFrom(rows, at = new Date().toISOString()) {
  const L = rows.filter((r) => Array.isArray(r) && /^[A-Z]{4}$/.test(r[0]) && typeof r[2] === "number").map(([code, close, pct, value]) => ({ code, close, pct: Math.round(pct * 100) / 100, value: value || 0 }));
  const px = {}; for (const x of L) px[x.code] = x.pct;
  const liq = L.filter((x) => x.value >= 1e9 && x.close >= 50);
  return { at, px, codes: L.map((x) => x.code).join(","),
    breadth: { up: L.filter((x) => x.pct > 0).length, down: L.filter((x) => x.pct < 0).length, flat: L.filter((x) => x.pct === 0).length },
    gainers: [...liq].sort((a, b) => b.pct - a.pct).slice(0, 5), losers: [...liq].sort((a, b) => a.pct - b.pct).slice(0, 5),
    value: [...L].sort((a, b) => b.value - a.value).slice(0, 5) };
}
/** Ringkasan pasar untuk halaman: IHSG, sektor & penggerak dari Market Recap; top gainer/value & breadth dari TradingView;
 *  komoditas yang bergerak >= 2% disorot bersama emiten sektornya. */
export function overview(recap, mkt) {
  const d = recap || {}, m = mkt || {}, px = m.px || {};
  const sec = d.sectors || [];
  const comm = (d.commodities || []).map((c) => {
    const k = COMMODITY.find(([n]) => n === c.label || (c.label || "").startsWith(n)) || COMMODITY.find(([, re]) => re.test(c.label || ""));
    return { label: c.label, close: c.close, pct: c.pct, hot: Math.abs(c.pct || 0) >= 2, related: k ? k[2].filter((x) => typeof px[x] === "number").map((code) => ({ code, pct: px[code] })) : [] };
  });
  return { date: d.date || "", session: d.session || "", at: m.at || d.at || "", ihsg: d.ihsg ? { close: d.ihsg.close, chg: d.ihsg.chg, pct: d.ihsg.pct, value: d.ihsg.value } : null,
    breadth: m.breadth || d.breadth || null, sectors: { best: sec.slice(0, 2), worst: sec.slice(-2).reverse() },
    movers: { up: ((d.movers || {}).up || []).slice(0, 3), down: ((d.movers || {}).down || []).slice(0, 3) },
    gainers: m.gainers || [], value: m.value || [], commodities: comm, foreign: d.foreign || null };
}
