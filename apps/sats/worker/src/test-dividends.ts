// Cek hitungan dividen (riwayat & perkiraan). Jalankan: npx tsx src/test-dividends.ts (dari apps/sats/worker)
import assert from "node:assert/strict";
import { epsToIdr, fiscalYear, pickTtm, summarize, targetFy, type Payment } from "./fundamentals/dividends";

const near = (a: number | null, b: number, tol: number, msg: string) => assert.ok(a != null && Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b}`);
const P = (rows: Array<[string, number]>): Payment[] => rows.map(([date, amount]) => ({ date, amount }));

// tahun buku: Okt–Des = interim tahun itu, Jan–Sep = tahun sebelumnya
assert.equal(fiscalYear("2024-01-02"), 2023);
assert.equal(fiscalYear("2025-12-30"), 2025);
assert.equal(fiscalYear("2026-04-21"), 2025);
assert.equal(targetFy("2026-11-19"), 2026);
assert.equal(targetFy("2026-05-10"), 2025);

// BBRI (data Yahoo asli)
const bbri = P([["2023-01-10", 57], ["2023-03-24", 231.22], ["2024-01-02", 84], ["2024-03-14", 235], ["2024-12-27", 135], ["2025-04-11", 208.4], ["2025-12-30", 137], ["2026-04-21", 209]]);
const eps = { 2022: 338, 2023: 398, 2024: 398, 2025: 376 };
const b = summarize({ payments: bbri, annualEps: eps, epsTtm: 422, today: "2026-11-19" })!;
assert.equal(b.fy_last, 2025);
near(b.dps_last, 346, 0.001, "DPS TB 2025 = 137 + 209");
// 3 skenario dari payout TB 2023–2025 (80,15 / 86,28 / 92,02): pesimis = terendah, base = rata-rata, optimis = tertinggi
near(b.payout_min, 80.15, 0.01, "payout terendah");
near(b.payout, 86.15, 0.01, "payout rata-rata");
near(b.payout_max, 92.02, 0.01, "payout tertinggi");
near(b.est_low, 338.23, 0.05, "80,15% × 422");
near(b.est_dps, 363.55, 0.05, "86,15% × 422");
near(b.est_high, 388.32, 0.05, "92,02% × 422");
assert.equal(b.streak, 4, "TB 2022–2025");
assert.equal(b.confidence, "tinggi");
assert.equal(b.est_paid, 0);
assert.equal(b.last_date, "2026-04-21");
assert.equal(b.last_amount, 209);
assert.equal(b.history.years.find((y) => y.fy === 2024)?.dps, 343.4);
assert.equal(b.history.payments[0].date, "2026-04-21", "pembayaran terbaru dulu");

// interim tahun berjalan sudah dibayar
const bi = summarize({ payments: [...bbri, { date: "2026-12-20", amount: 140 }], annualEps: eps, epsTtm: 422, today: "2026-12-29" })!;
assert.equal(bi.est_paid, 140);

// rugi: tanpa perkiraan, riwayat tetap ada
const loss = summarize({ payments: bbri, annualEps: eps, epsTtm: -5, today: "2026-11-19" })!;
assert.equal(loss.est_dps, null);
assert.equal(loss.est_low, null);
assert.equal(loss.est_high, null);
assert.equal(loss.confidence, null);
assert.ok(loss.history.years.length >= 4);

// dividen sekali
const once = summarize({ payments: P([["2026-05-01", 50]]), annualEps: { 2025: 200 }, epsTtm: 210, today: "2026-11-19" })!;
assert.equal(once.streak, 1);
assert.equal(once.dps_cagr3, null);
assert.equal(once.confidence, "rendah");
near(once.est_dps, 52.5, 0.001, "25% × 210");
assert.equal(once.est_low, once.est_high, "satu tahun: tiga skenario sama");

// tidak bagi dividen 2 TB terakhir: tanpa perkiraan
const stopped = summarize({ payments: P([["2022-05-01", 50]]), annualEps: { 2021: 200 }, epsTtm: 210, today: "2026-11-19" })!;
assert.equal(stopped.est_dps, null);
assert.equal(stopped.streak, 0);

// dividen spesial: payout tiap TB dibatasi 100 sebelum dirata-rata
const sp = summarize({ payments: P([["2024-05-01", 40], ["2025-05-01", 45], ["2026-05-01", 250]]), annualEps: { 2023: 100, 2024: 100, 2025: 100 }, epsTtm: 100, today: "2026-11-19" })!;
assert.equal(sp.fy_last, 2025);
// payout TB 2023–2025 = 40, 45, 250 → 40, 45, 100
near(sp.payout, 61.67, 0.01, "rata-rata 40/45/100");
assert.equal(sp.payout_min, 40);
assert.equal(sp.payout_max, 100);
near(sp.est_high, 100, 0.001, "optimis 100% × 100");
assert.equal(sp.confidence, "sedang", "rentang payout > 30 poin");
const big = summarize({ payments: P([["2024-05-01", 300], ["2025-05-01", 300]]), annualEps: { 2023: 100, 2024: 100 }, epsTtm: 100, today: "2026-11-19" })!;
assert.equal(big.payout, 100);
assert.equal(big.payout_min, 100);

// pertumbuhan 3 th
const g = summarize({ payments: P([["2023-05-01", 100], ["2024-05-01", 110], ["2025-05-01", 120], ["2026-05-01", 133.1]]), annualEps: {}, epsTtm: 500, today: "2026-11-19" })!;
near(g.dps_cagr3, 10, 0.01, "100 → 133,1 dalam 3 th");
assert.equal(g.payout, null, "tanpa EPS tahunan");
assert.equal(g.est_dps, null);

// EPS 12 bln: titik terbaru yang loncat > 5× (salah data Yahoo, BJTM 2026-09) diganti titik sebelumnya; lonjakan wajar tetap dipakai
assert.equal(pickTtm([["2026-03-31", 108.92], ["2026-06-30", 104.36], ["2026-09-30", 7332.31]], 102.93), 104.36);
assert.equal(pickTtm([["2026-03-31", 1554], ["2026-06-30", 2295], ["2026-09-30", 2584]], 809), 2584, "GGRM pulih");
assert.equal(pickTtm([["2026-09-30", 50]], null), 50);
assert.equal(pickTtm([], 80), null);
assert.equal(pickTtm([["2026-06-30", -20], ["2026-09-30", -40]], 10), -40, "rugi tetap rugi");

// final TB berjalan sudah dibayar (Apr–Sep): TB itu dianggap lengkap, perkiraan untuk TB berikutnya
const b27 = summarize({ payments: [...bbri, { date: "2026-12-20", amount: 140 }, { date: "2027-04-15", amount: 230 }], annualEps: { ...eps, 2026: 410 }, epsTtm: 430, today: "2027-06-01" })!;
assert.equal(b27.fy_last, 2026, "final TB 2026 sudah dibayar April 2027");
assert.equal(b27.dps_last, 370);
assert.equal(b27.est_paid, 0, "belum ada interim TB 2027");
const b27b = summarize({ payments: [...bbri, { date: "2026-12-20", amount: 140 }], annualEps: eps, epsTtm: 430, today: "2027-06-01" })!;
assert.equal(b27b.fy_last, 2025, "final TB 2026 belum dibayar: tetap TB 2025");
assert.equal(b27b.est_paid, 140);

// ≥ 3 pembayaran dalam satu TB (interim pertengahan tahun bisa salah TB): keyakinan paling tinggi "rendah"
const many = summarize({ payments: P([["2023-05-01", 120], ["2024-05-01", 120], ["2025-05-01", 40], ["2025-06-01", 40], ["2025-09-01", 40], ["2026-05-01", 120]]), annualEps: { 2022: 200, 2023: 200, 2024: 200, 2025: 200 }, epsTtm: 200, today: "2026-11-19" })!;
assert.equal(many.streak, 4);
assert.equal(many.confidence, "rendah");

// EPS laporan USD dikonversi ke rupiah; kurs gagal -> null (bukan EPS mentah USD)
assert.deepEqual(epsToIdr({ currency: "USD", annual: { 2025: 0.02 }, ttm: 0.025 }, 16000), { annual: { 2025: 320 }, ttm: 400 });
assert.deepEqual(epsToIdr({ currency: "IDR", annual: { 2025: 376 }, ttm: 422 }, 1), { annual: { 2025: 376 }, ttm: 422 });
assert.deepEqual(epsToIdr({ currency: "USD", annual: { 2025: 0.02 }, ttm: 0.025 }, null), { annual: {}, ttm: null });
assert.deepEqual(epsToIdr(null, 1), { annual: {}, ttm: null });
const adro = summarize({ payments: P([["2025-12-30", 145.14], ["2026-04-28", 118.26]]), ...(() => { const e = epsToIdr({ currency: "USD", annual: { 2025: 0.01526 }, ttm: 0.02298 }, 17660)!; return { annualEps: e.annual, epsTtm: e.ttm }; })(), today: "2026-11-19" })!;
assert.ok(adro.payout! > 90 && adro.payout! < 100, `payout ADRO wajar: ${adro.payout}`);

assert.equal(summarize({ payments: [], annualEps: eps, epsTtm: 422, today: "2026-11-19" }), null);
console.log("semua PASS");
