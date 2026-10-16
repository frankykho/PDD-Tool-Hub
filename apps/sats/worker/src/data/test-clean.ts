/** npx tsx src/data/test-clean.ts */
import assert from "node:assert/strict";
import type { SatsInputBar } from "../sats/types";
import { cleanBars } from "./clean";

const mk = (closes: number[]): SatsInputBar[] =>
  closes.map((c, k) => ({ time: 1_700_000_000 + k * 86400, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 }));

// normal data untouched
{
  const r = cleanBars(mk([100, 105, 98, 120, 110]));
  assert.equal(r.bars.length, 5);
  assert.equal(r.issues.length, 0);
}
// spike that reverts -> dropped
{
  const r = cleanBars(mk([100, 102, 500, 101, 103]));
  assert.deepEqual(r.bars.map((b) => b.close), [100, 102, 101, 103]);
  assert.match(r.issues[0], /lonjakan/);
}
// unadjusted 1:5 split -> earlier bars divided by 5, volume x5
{
  const r = cleanBars(mk([5000, 5100, 1020, 1030]));
  assert.deepEqual(r.bars.map((b) => Math.round(b.close)), [1000, 1020, 1020, 1030]);
  assert.equal(r.bars[0].volume, 5000);
  assert.match(r.issues[0], /split 1:5/);
}
// reverse split 10:1
{
  const r = cleanBars(mk([50, 51, 510, 515]));
  assert.deepEqual(r.bars.map((b) => Math.round(b.close)), [500, 510, 510, 515]);
  assert.match(r.issues[0], /reverse split 10:1/);
}
// big gap that is no split ratio -> kept, reported
{
  const r = cleanBars(mk([100, 100, 170, 172]));
  assert.equal(r.bars.length, 4);
  assert.match(r.issues[0], /cek manual/);
}
// broken OHLC repaired, zero price dropped
{
  const bars = mk([100, 101, 102]);
  bars[1] = { ...bars[1], high: 90 };
  bars.push({ ...bars[2], time: bars[2].time + 86400, close: 0 });
  const r = cleanBars(bars);
  assert.equal(r.bars.length, 3);
  assert.equal(r.bars[1].high, 101);
}
console.log("ALL CLEAN TESTS PASSED");
