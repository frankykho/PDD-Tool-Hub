// Daftar saham syariah BEI: anggota indeks ISSI (semua saham syariah tercatat, mengikuti Daftar Efek Syariah OJK),
// JII70, dan JII. Diambil dari scanner TradingView (gratis, tanpa akun), disimpan di cache Cloudflare 12 jam.
// ISSI dievaluasi bersama DES dua kali setahun (Mei & November) plus perubahan insidental, jadi cache 12 jam cukup.
//
//   import { shariaCached, shariaLabel } from "../../shared/sharia.js";
//   const S = await shariaCached(ctx);       // { at, source, codes: { BBRI: ["ISSI"], TLKM: ["ISSI","JII70","JII"], ... } }
//   shariaLabel(S.codes.TLKM)               // "JII"  (indeks paling sempit yang memuatnya)

export const SHARIA_INDEXES = ["ISSI", "JII70", "JII"];
export const SHARIA_SOURCE = "Anggota indeks ISSI, JII70, dan JII (BEI) dari TradingView";

async function members(idx, fetcher) {
  const r = await fetcher("https://scanner.tradingview.com/indonesia/scan", {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ symbols: { query: { types: [] }, tickers: [], groups: [{ type: "index", values: ["IDX:" + idx] }] }, columns: ["name"], range: [0, 1500] }),
  });
  if (!r.ok) throw new Error(`TradingView ${idx}: HTTP ${r.status}`);
  const j = await r.json();
  return [...new Set((j.data || []).map((x) => String((x.d && x.d[0]) || String(x.s || "").split(":")[1] || "").toUpperCase()).filter((c) => /^[A-Z]{4}$/.test(c)))];
}

/** Tarik ulang daftar dari TradingView. Gagal kalau ISSI terlalu sedikit (jawaban tidak lengkap). */
export async function shariaList(fetcher = fetch) {
  const [issi, jii70, jii] = await Promise.all(SHARIA_INDEXES.map((i) => members(i, fetcher)));
  if (issi.length < 200) throw new Error(`Daftar ISSI hanya ${issi.length} saham; dibatalkan.`);
  const codes = {};
  for (const c of issi) codes[c] = ["ISSI"];
  for (const c of jii70) (codes[c] ||= ["ISSI"]).push("JII70");
  for (const c of jii) (codes[c] ||= ["ISSI"]).push("JII");
  return { at: new Date().toISOString(), source: SHARIA_SOURCE, count: { ISSI: issi.length, JII70: jii70.length, JII: jii.length }, codes };
}

const KEY = "https://cache.local/sharia-v1";
/** Daftar dari cache Cloudflare (12 jam), atau tarik ulang. Tanpa Cache API (tes / Node) langsung menarik. */
export async function shariaCached(ctx, fetcher = fetch) {
  const cache = typeof caches !== "undefined" && caches.default;
  if (cache) { const hit = await cache.match(KEY); if (hit) return hit.json(); }
  const v = await shariaList(fetcher);
  if (cache) {
    const put = cache.put(KEY, new Response(JSON.stringify(v), { headers: { "content-type": "application/json", "cache-control": "public, max-age=43200" } }));
    if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  }
  return v;
}

/** Label singkat untuk satu saham: indeks tersempit (JII > JII70 > ISSI), atau "" kalau bukan saham syariah. */
export const shariaLabel = (tags) => (!tags || !tags.length ? "" : tags.includes("JII") ? "JII" : tags.includes("JII70") ? "JII70" : "ISSI");
