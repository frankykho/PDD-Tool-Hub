/** npx tsx src/data/test-yahoo-close.ts — bar terakhir dengan close null diisi dari meta (tanpa jaringan). */
import assert from "node:assert/strict";
import { fetchYahooDaily } from "./yahoo";

// Respons asli BBCA.JK 13 Okt 2026 (dipangkas): bar 12 Okt close null, meta.regularMarketPrice 5950 pukul 16:14 WIB.
const chart = (marketTime: number) => ({
  chart: {
    result: [{
      meta: { regularMarketTime: marketTime, regularMarketPrice: 5950 },
      timestamp: [1791424800, 1791511200, 1791770400],
      indicators: { quote: [{ open: [6100, 6025, 6050], high: [6150, 6075, 6100], low: [6000, 5975, 5950], close: [6000, 6050, null], volume: [113140300, 87098600, 97965100] }] },
    }],
    error: null,
  },
});
const run = async (marketTime: number) => {
  globalThis.fetch = (async () => new Response(JSON.stringify(chart(marketTime)))) as typeof fetch;
  return fetchYahooDaily("BBCA.JK", 0, 1);
};

(async () => {
let bars = await run(1791796497);
assert.equal(bars.length, 3, "bar 12 Okt tidak dibuang");
assert.equal(bars[2].close, 5950);

// meta dari hari lain -> jangan dipakai, bar tetap dibuang
bars = await run(1791511200 + 3600);
assert.equal(bars.length, 2);
console.log("yahoo close null: lolos");
})();
