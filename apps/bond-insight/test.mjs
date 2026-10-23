// Cek Bond Insight: pengurai kurva PHEI, interpolasi, rating, riwayat KV, dan route kurva / Tool Hub / cron.
// node apps/bond-insight/test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { parsePhei, pheiDate, interp, ratingGroup, corpCurve, keyRates, getCurve, curveHistory, PHEI_URL } from "./phei.js";

const SAMPLE = fs.readFileSync(new URL("./phei-sample.html", import.meta.url), "utf8");

/* ---------- pengurai ---------- */
const c = parsePhei(SAMPLE);
assert.equal(c.date, "2026-10-23");
assert.equal(pheiDate("per 5-Mei-2026"), "2026-05-05");
assert.equal(pheiDate("tanpa tanggal"), null);
assert.equal(c.igs.length, 41, "tenor 0,1 dan 1–40 tahun dari dua tabel");
assert.deepEqual(c.igs.find((x) => x[0] === 2), [2, 6.8517, 6.8181]);
assert.deepEqual(c.igs[0], [0.1, 6.3703, 6.3193]);
assert.equal(c.igs.at(-1)[0], 40);
assert.ok(!c.igs.some((x) => x[0] > 40 || x[1] > 20), "tabel seri benchmark (FR/PBS) tidak ikut terbaca sebagai kurva");
assert.deepEqual(c.corp.tenors, [0.1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.deepEqual([c.corp.AAA[2], c.corp.AA[2], c.corp.A[2], c.corp.BBB[2]], [7.362, 7.5847, 8.3516, 10.3047]);
assert.throws(() => parsePhei("<html>halaman baru</html>"), /IGSYC tidak ditemukan/);

/* ---------- interpolasi, rating, ringkasan ---------- */
const igs = c.igs.map((p) => [p[0], p[1]]);
assert.equal(interp(igs, 2), 6.8517);
assert.ok(Math.abs(interp(igs, 2.5) - (6.8517 + 7.0152) / 2) < 1e-9);
assert.equal(interp(igs, 0.01), 6.3703, "di bawah tenor terpendek -> ujung");
assert.equal(interp(igs, 50), c.igs.at(-1)[1], "di atas 40 tahun -> ujung");
assert.equal(interp([], 2), null);
assert.deepEqual(["idAAA", "idAA+", "AA-(idn)", "idA", "idA-(sy)", "idA (pefindo)", "idA+ (pefindo)", "idBBB+", "idBB", "", null].map(ratingGroup), ["AAA", "AA", "AA", "A", "A", "A", "A", "BBB", null, null, null]);
assert.equal(interp(corpCurve(c, "AA"), 2), 7.5847);
assert.deepEqual(corpCurve({ corp: null }, "AA"), []);
assert.deepEqual(keyRates(c, [2, 10]), [{ t: 2, y: 6.8517, d: 3.4 }, { t: 10, y: 7.4142, d: 2 }]);

/* ---------- getCurve: memori, KV, cadangan ---------- */
const kv = () => { const m = new Map(); return { m, get: async (k, t) => (m.has(k) ? (t === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v) }; };
let calls = 0, page = SAMPLE, fail = false;
globalThis.fetch = async (url) => { calls++; assert.equal(String(url), PHEI_URL); if (fail) throw new Error("PHEI mati"); return new Response(page, { status: 200 }); };
const env = { BONDS_KV: kv() };
const a = await getCurve(env, true);
assert.equal(a.state, "live");
assert.equal(a.date, "2026-10-23");
const h1 = JSON.parse(env.BONDS_KV.m.get("curve_hist_v1"));
assert.deepEqual(Object.keys(h1.days).sort(), ["2026-10-23", "2026-10-23~prev"], "hari pertama: kolom kemarin ikut dicatat");
assert.equal(h1.days["2026-10-23"].igs[2], 6.8517);
assert.equal(h1.days["2026-10-23~prev"].igs[2], 6.8181);
assert.equal(h1.days["2026-10-23"].corp.AA[2], 7.5847);
const hist = await curveHistory(env);
assert.deepEqual(Object.keys(hist.days).sort(), ["2026-10-22", "2026-10-23"], "~prev tampil sebagai hari kerja sebelumnya");
// tanggal sama -> KV tidak ditulis ulang
let puts = 0; const put0 = env.BONDS_KV.put; env.BONDS_KV.put = async (k, v) => { puts++; return put0(k, v); };
await getCurve(env, true);
assert.equal(puts, 0, "data PHEI tanggal sama tidak menulis KV lagi");
// hari berikutnya -> titik baru, tanpa ~prev baru
page = SAMPLE.replace("per 23-Oktober-2026", "per 26-Oktober-2026").replace(/6,8517/g, "6,9000");
await getCurve(env, true);
const h2 = (await curveHistory(env)).days;
assert.deepEqual(Object.keys(h2).sort(), ["2026-10-22", "2026-10-23", "2026-10-26"]);
assert.equal(h2["2026-10-26"].igs[2], 6.9);
// cache memori 30 menit
const n0 = calls; await getCurve(env); assert.equal(calls, n0, "permintaan berikutnya dari memori");
// PHEI gangguan -> data terakhir tetap tampil
fail = true;
const s = await getCurve(env, true);
assert.equal(s.state, "stale-memory");
assert.match(s.error, /PHEI mati/);
assert.equal(s.date, "2026-10-26");

/* ---------- route worker ---------- */
globalThis.caches ||= { default: { match: async () => null, put: async () => {} } };
const { default: worker } = await import("./worker.js");
const SECRET = "k".repeat(40), wenv = { ...env, SSO_SECRET: SECRET };
const call = (path, init = {}) => worker.fetch(new Request("https://bond.test" + path, init), wenv, { waitUntil() {} });
const cj = await (await call("/data/curve.json")).json();
assert.equal(cj.date, "2026-10-26");
assert.ok(Array.isArray(cj.igs) && cj.corp.AAA.length === 11);
const ch = await (await call("/data/curve-history.json")).json();
assert.equal(Object.keys(ch.days).length, 3);
assert.equal((await call("/__hub/today")).status, 403, "feed Tool Hub butuh x-hub-key");
const ht = await (await call("/__hub/today", { headers: { "x-hub-key": SECRET } })).json();
assert.deepEqual(ht.rates.map((r) => r.t), [1, 2, 5, 10]);
assert.equal(ht.rates[1].y, 6.9);
assert.deepEqual(Object.keys(ht.corp2), ["AAA", "AA", "A"]);
assert.equal(ht.corp2.AA, 7.5847);
assert.equal((await call("/__cron", { method: "POST" })).status, 403, "cron butuh x-cron-key");

console.log("semua cek lolos");
