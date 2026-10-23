// Cek hitungan kalkulator waran terstruktur. Jalankan: npx tsx src/test-warrant.ts (dari apps/sats/worker)
import assert from "node:assert/strict";
import { scenarios, valueAt, warrant } from "../../frontend/src/warrant";

const today = new Date(Date.UTC(2026, 9, 23));
// saham 10.000, strike 9.500, rasio 5 SW : 1 saham, harga SW 150
const r = warrant({ spot: 10000, strike: 9500, ratio: 5, price: 150, expiry: "2027-01-22", qty: 1000 }, today)!;
assert.equal(r.intrinsic, 100, "(10.000 − 9.500) ÷ 5");
assert.equal(r.timeValue, 50);
assert.equal(r.breakeven, 10250, "9.500 + 150 × 5");
assert.ok(Math.abs(r.premium - 2.5) < 1e-9);
assert.equal(r.status, "ITM");
assert.ok(Math.abs(r.gearing - 10000 / 750) < 1e-9);
assert.equal(r.daysLeft, 91);
assert.equal(r.cost, 150000);
assert.equal(warrant({ spot: 9500, strike: 9500, ratio: 5, price: 100 })!.status, "ATM");
assert.equal(warrant({ spot: 9000, strike: 9500, ratio: 5, price: 100 })!.status, "OTM");
assert.equal(warrant({ spot: 0, strike: 1, ratio: 1, price: 1 }), null);
assert.equal(valueAt(9000, 9500, 5), 0, "di bawah harga pelaksanaan: hangus");
const S = scenarios({ spot: 10000, strike: 9500, ratio: 5, price: 150, qty: 100 });
assert.ok(S.every((x, i) => !i || S[i - 1].sT <= x.sT), "urut harga");
const be = S.find((x) => x.mark === "titik impas")!;
assert.ok(Math.abs(be.pl) < 1e-9 && Math.abs(be.plPct) < 1e-9, "titik impas = untung/rugi nol");
const down = S.find((x) => x.chg === -30)!;
assert.equal(down.value, 0); assert.equal(down.plPct, -100, "turun di bawah strike: modal hilang");
const up = S.find((x) => x.chg === 10)!;
assert.equal(up.value, 300); assert.equal(up.pl, 15000);
console.log("semua PASS");
