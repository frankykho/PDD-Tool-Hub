/**
 * Tests for the Strategy Lab engine (frontend/src/backtest): IDX execution rules + rule signals.
 * Run:  npx tsx src/test-backtest.ts
 * Every expected number is worked out by hand in the comment next to it.
 */
import { araLocked, arbLocked, backtest, ceilTick, floorTick, type ExecConfig, type StockInput } from "../../frontend/src/backtest/engine";
import { signals } from "../../frontend/src/backtest/rules";
import type { SatsInputBar } from "./sats/types";

let failed = 0;
function eq(name: string, actual: unknown, expected: unknown): void {
  const ok = typeof expected === "number" && typeof actual === "number" ? Math.abs(actual - expected) < 1e-6 : JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
  if (!ok) failed += 1;
}

// day k = 2026-01-05 + k days (WIB midnight); bars with o/h/l/c
const T0 = Date.UTC(2026, 0, 5) / 1000 - 7 * 3600;
const bar = (k: number, o: number, h: number, l: number, c: number, v = 1e6): SatsInputBar => ({ time: T0 + k * 86400, open: o, high: h, low: l, close: c, volume: v });
const flat = (k: number, p: number) => bar(k, p, p, p, p);
const D = (k: number) => new Date((T0 + k * 86400 + 7 * 3600) * 1000).toISOString().slice(0, 10);
const cfg = (o: Partial<ExecConfig> = {}): ExecConfig => ({
  capital: 10_000_000, maxPositions: 1, feeBuy: 0, feeSell: 0, slippage: 0, stopLoss: null, takeProfit: null, trailing: null, maxHold: null, from: D(0), ...o,
});
const stock = (code: string, bars: SatsInputBar[], entryAt: number[], exitAt: number[] = []): StockInput => ({
  code, bars, entry: bars.map((_, i) => entryAt.includes(i)), exit: bars.map((_, i) => exitAt.includes(i)),
});

// ---------- fraksi harga & auto reject
eq("ceilTick 1.001 -> 1.005 (fraksi 5)", ceilTick(1001), 1005);
eq("floorTick 1.009 -> 1.005", floorTick(1009), 1005);
eq("ceilTick 5.010 -> 5.025 (fraksi 25)", ceilTick(5010), 5025);
eq("ceilTick harga pas fraksi tidak berubah", ceilTick(1000), 1000);
eq("ARA 25%: prev 1.000, buka & tutup di 1.250", araLocked(bar(1, 1250, 1250, 1240, 1250), flat(0, 1000)), true);
eq("bukan ARA bila high di atas open", araLocked(bar(1, 1250, 1255, 1240, 1250), flat(0, 1000)), false);
eq("ARB 25%: prev 1.000, buka di 750 = low", arbLocked(bar(1, 750, 760, 750, 755), flat(0, 1000)), true);
eq("ARA 35% untuk harga ≤ 200: prev 100 -> 135", araLocked(bar(1, 135, 135, 130, 135), flat(0, 100)), true);

// ---------- beli di pembukaan berikutnya, lot, biaya
// sinyal hari 0 (close 1.000) -> beli hari 1 di open 1.002 + slippage 0,1% = 1.003,002 -> fraksi 5 ke atas = 1.005
// dana 10 jt, biaya beli 0,15% -> 10.000.000 / (1.005 × 1,0015) = 9.935,4 lembar -> 99 lot = 9.900 lembar
let bars = [flat(0, 1000), bar(1, 1002, 1010, 1000, 1008), flat(2, 1100), flat(3, 1100)];
let r = backtest([stock("AAAA", bars, [0], [2])], cfg({ feeBuy: 0.15, feeSell: 0.25, slippage: 0.1 }));
let t = r.trades[0];
eq("harga beli dibulatkan ke atas fraksi", t.entryPrice, 1005);
eq("lembar = kelipatan lot", t.shares, 9900);
eq("tanggal beli = hari setelah sinyal", t.entryDate, D(1));
// sinyal jual hari 2 -> jual hari 3 di open 1.100 × (1 − 0,1%) = 1.098,9 -> fraksi ke bawah = 1.095
eq("harga jual dibulatkan ke bawah", t.exitPrice, 1095);
eq("alasan keluar sinyal", t.reason, "SINYAL");
// biaya: modal 9.900 × 1.005 × 1,0015 = 9.964.423,..., hasil 9.900 × 1.095 × 0,9975 = 10.813.398,75
const cost = 9900 * 1005 * 1.0015, proceeds = 9900 * 1095 * 0.9975;
eq("laba bersih setelah biaya", t.pnl, proceeds - cost);
eq("ekuitas akhir = kas", r.metrics.final, 10_000_000 - cost + proceeds);
eq("hari dipegang", t.days, 2);

// ---------- stop loss: di dalam hari dan gap
// beli hari 1 di 1.000, SL 5% = 950; hari 2 low 940 -> keluar di 950
bars = [flat(0, 1000), flat(1, 1000), bar(2, 990, 995, 940, 960), flat(3, 960)];
t = backtest([stock("BBBB", bars, [0])], cfg({ stopLoss: 5 })).trades[0];
eq("SL di dalam hari keluar di level stop", [t.reason, t.exitPrice, t.exitDate], ["SL", 950, D(2)]);
// hari 2 dibuka 900 (gap di bawah stop 950) -> keluar di open 900
bars = [flat(0, 1000), flat(1, 1000), bar(2, 900, 920, 890, 910), flat(3, 910)];
t = backtest([stock("BBBB", bars, [0])], cfg({ stopLoss: 5 })).trades[0];
eq("SL gap keluar di harga pembukaan", [t.reason, t.exitPrice], ["SL", 900]);
// stop & target di hari yang sama -> stop dulu (konservatif)
bars = [flat(0, 1000), flat(1, 1000), bar(2, 1000, 1150, 940, 1000), flat(3, 1000)];
t = backtest([stock("BBBB", bars, [0])], cfg({ stopLoss: 5, takeProfit: 10 })).trades[0];
eq("stop & target sehari: stop lebih dulu", t.reason, "SL");
// take profit 10% = 1.100
bars = [flat(0, 1000), flat(1, 1000), bar(2, 1010, 1120, 1005, 1050), flat(3, 1050)];
t = backtest([stock("BBBB", bars, [0])], cfg({ takeProfit: 10 })).trades[0];
eq("take profit di level target", [t.reason, t.exitPrice], ["TP", 1100]);
// trailing 10%: beli 1.000, puncak 1.300 (hari 2) -> level 1.170; hari 3 low 1.150 -> keluar 1.170
bars = [flat(0, 1000), flat(1, 1000), bar(2, 1100, 1300, 1100, 1290), bar(3, 1280, 1290, 1150, 1160), flat(4, 1160)];
t = backtest([stock("CCCC", bars, [0])], cfg({ trailing: 10 })).trades[0];
eq("trailing stop dari harga tertinggi", [t.reason, t.exitPrice], ["TRAIL", 1170]);

// ---------- ARA & ARB
// sinyal hari 0, hari 1 dibuka & tertahan di ARA (1.250) -> tidak terisi
bars = [flat(0, 1000), bar(1, 1250, 1250, 1250, 1250), flat(2, 1250)];
r = backtest([stock("DDDD", bars, [0])], cfg());
eq("beli tidak terisi saat ARA", [r.trades.length, r.missedAra], [0, 1]);
// sinyal jual hari 2, hari 3 dibuka di ARB 750 -> tertunda, hari 4 jual di open 760
bars = [flat(0, 1000), flat(1, 1000), flat(2, 1000), bar(3, 750, 750, 750, 750), bar(4, 760, 780, 740, 770)];
r = backtest([stock("EEEE", bars, [0], [2])], cfg());
eq("jual tertunda saat ARB", [r.trades[0].exitDate, r.trades[0].exitPrice, r.arbDelays], [D(4), 760, 1]);

// ---------- slot posisi, maks. hari, posisi terbuka di akhir
// dua sinyal hari 0, maks. 1 posisi -> yang nilai transaksinya lebih besar (FFFF, volume 5 jt) didahulukan
const a = [flat(0, 1000), flat(1, 1000), flat(2, 1000)].map((b) => ({ ...b, volume: 1e6 }));
const b2 = [flat(0, 1000), flat(1, 1000), flat(2, 1000)].map((b) => ({ ...b, volume: 5e6 }));
r = backtest([stock("GGGG", a, [0]), stock("FFFF", b2, [0])], cfg());
eq("prioritas nilai transaksi terbesar", r.trades.map((x) => x.code), ["FFFF"]);
eq("sinyal lain dilewati karena slot penuh", r.skippedCash, 1);
eq("posisi masih dipegang di akhir ditandai terbuka", [r.trades[0].reason, r.trades[0].open], ["AKHIR", true]);
// maks. 2 hari: beli hari 1, di penutupan hari 3 sudah 2 hari -> jual hari 4
bars = [0, 1, 2, 3, 4, 5].map((k) => flat(k, 1000));
t = backtest([stock("HHHH", bars, [0])], cfg({ maxHold: 2 })).trades[0];
eq("batas lama pegang", [t.reason, t.exitDate], ["WAKTU", D(4)]);

// ---------- metrik
r = backtest([stock("IIII", [flat(0, 1000), flat(1, 1000), flat(2, 800), flat(3, 1200), flat(4, 1200)], [0], [3])], cfg());
eq("max drawdown −20%", r.metrics.maxDrawdown, -20);
eq("win rate 100% (1 transaksi untung)", [r.metrics.trades, r.metrics.winRate], [1, 100]);

// ---------- sinyal dari aturan
const up = Array.from({ length: 30 }, (_, k) => flat(k, 1000 + (k === 25 ? 200 : 0)));
let s = signals(up, { entry: [{ t: "breakout", n: 20 }], exit: [] });
eq("breakout 20 hari hanya di bar 25", s.entry.map((x, i) => (x ? i : -1)).filter((i) => i >= 0), [25]);
const cross = Array.from({ length: 12 }, (_, k) => flat(k, k < 8 ? 1000 - k * 10 : 1000 + k * 50));
s = signals(cross, { entry: [{ t: "ma_cross", a: 2, b: 5 }], exit: [{ t: "ma_cross_down", a: 2, b: 5 }] });
eq("MA 2 memotong ke atas MA 5 sekali", s.entry.filter(Boolean).length, 1);
eq("tanpa syarat beli = tidak pernah beli", signals(up, { entry: [], exit: [] }).entry.some(Boolean), false);
s = signals(up, { entry: [{ t: "vol", min: 1, max: 2 }], exit: [] });
eq("volume 1× rata-rata lolos syarat 1–2×", s.entry[25], true);

console.log(failed ? `\n${failed} FAIL` : "\nsemua PASS");
if (failed) process.exit(1);
