// npx tsx src/flow/test-flow.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { avgLot, median, parseDoneSummary } from "./parse";

const html = readFileSync(join(__dirname, "fixtures/donesummary-bbca.html"), "utf8");
const d = parseDoneSummary(html)!;
assert.equal(d.levels.length, 13);
assert.deepEqual(d.levels[0], { price: 5275, bLot: 0, sLot: 1, bFrq: 0, sFrq: 1 });
assert.deepEqual(d.levels.at(-1), { price: 4940, bLot: 5490, sLot: 0, bFrq: 304, sFrq: 0 });
assert.equal(d.freq, 39790);
assert.equal(d.lot, 1773990);
assert.equal(d.bLot, 900792);
assert.equal(d.bLot + d.sLot, d.lot);
assert.equal(d.bFreq + d.sFreq, d.freq);
assert.ok(d.vwap! > 4940 && d.vwap! < 5275);
assert.equal(parseDoneSummary("<table><tr class=\"x\"><th>Price</th></tr></table>"), null, "kosong (sebelum pasar buka)");
assert.equal(avgLot(100, 0), null);
assert.equal(avgLot(1000, 40), 25);
assert.equal(median([3, 1, 2]), 2);
assert.equal(median([4, 1, 2, 3]), 2.5);
assert.equal(median([]), null);
console.log("flow: semua cek lolos");
