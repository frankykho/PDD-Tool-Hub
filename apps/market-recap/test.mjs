// Cek hitungan Market Recap (calc.js) & sintaks skrip halaman. Jalankan: node apps/market-recap/test.mjs
import assert from "node:assert";
import fs from "node:fs";
import { contributions, foreignFlow } from "./calc.js";

// tiga saham, total kapitalisasi kemarin 1000; IHSG kemarin 5000
const rows = [
  ["AAA", 110, 10, 550],   // kemarin 500 -> +50
  ["BBB", 80, -20, 320],   // kemarin 400 -> -80
  ["CCC", 100, 0, 100],    // kemarin 100 ->   0
  ["XXX", 5, null, 9],     // tanpa % perubahan: diabaikan
  ["ZZZ", 5, 3, 0],        // tanpa kapitalisasi: diabaikan
];
const c = contributions(rows, 5000);
assert.deepEqual(c.up.map((x) => [x.code, x.pts]), [["AAA", 250]]);    // 5000 × 50 / 1000
assert.deepEqual(c.down.map((x) => [x.code, x.pts]), [["BBB", -400]]); // 5000 × -80 / 1000
assert.equal(c.sum, -150);                                             // = 5000 × (900/1000 − 1)
assert.deepEqual(c.breadth, { up: 1, down: 1, flat: 1 });

// asing: lembar bersih × harga penutupan; tanpa data asing -> null
const f = foreignFlow({ stocks: { AAA: [100], BBB: [50] }, foreign: { AAA: [30, 10], BBB: [0, 40] } });
assert.equal(f.net, 100 * 20 - 50 * 40);
assert.deepEqual(f.buy.map((x) => x.code), ["AAA"]);
assert.deepEqual(f.sell.map((x) => x.code), ["BBB"]);
assert.equal(foreignFlow({ stocks: {} }), null);
assert.equal(foreignFlow(null), null);

// skrip di page.html harus bisa di-parse
const html = fs.readFileSync(new URL("./page.html", import.meta.url), "utf8");
for (const [, js] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(js);
console.log("semua cek lolos");
