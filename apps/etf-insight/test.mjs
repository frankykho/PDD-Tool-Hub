// Cek ETF Insight: perkiraan iNAV, tracking error, kalender ops, peringatan, pembanding syariah, dan /__hub/today.
// Jalankan: node apps/etf-insight/test.mjs   (Node 22.15+). TradingView, Yahoo, D1, dan cache ditiru; tidak ada panggilan ke luar.
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({
  load(url, ctx, next) {
    if (url.startsWith("file:") && url.endsWith(".html")) return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(fs.readFileSync(fileURLToPath(url), "utf8")) };
    return next(url, ctx);
  },
});
globalThis.caches = { default: { match: async () => null, put: async () => {} } };
const { default: etf, inavOf, trackingOf, opsCalendar, alertsOf, weekdaysBetween } = await import("./worker.js");

/* ---------- fungsi murni ---------- */
assert.equal(weekdaysBetween("2026-10-16", "2026-10-19"), 1, "Jumat -> Senin = 1 hari bursa");
assert.equal(weekdaysBetween("2026-10-19", "2026-10-23"), 4);
// iNAV: NAB kemarin × (indeks sekarang / penutupan kemarin)
assert.deepEqual(inavOf(1000, "2026-10-22", "2026-10-23", { c: 102, p: 100 }), { value: 1020, move: 2.0000000000000018 });
assert.equal(inavOf(1000, "2026-10-23", "2026-10-23", { c: 102, p: 100 }).value, 1000, "NAB hari ini: iNAV = NAB");
assert.equal(inavOf(1000, "2026-10-19", "2026-10-23", { c: 102, p: 100 }), null, "NAB terlalu lama: tidak dihitung");
assert.equal(inavOf(1000, "2026-10-16", "2026-10-19", { c: 102, p: 100 }).value, 1020, "Jumat -> Senin");
assert.equal(inavOf(null, "2026-10-22", "2026-10-23", { c: 1, p: 1 }), null);
// tracking error: selisih bulanan konstan -> TE 0; bulan berjalan dibuang
const months = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.UTC(2025, i, 28)); return d.toISOString().slice(0, 10); });
const nav = months.map((d, i) => [d, 100 * 1.02 ** i]), idx = months.map((d, i) => [d, 100 * 1.01 ** i]);
let t = trackingOf(nav, idx, "2025-01-01", "2026-02");
assert.ok(t.y1.te < 1e-6 && t.y1.n === 12 && Math.abs(t.y1.avg - 1) < 1e-9, "selisih tetap +1%/bln: TE ≈ 0, rata-rata 1");
assert.equal(t.last.length, 12);
assert.ok(!t.last.some(([m]) => m === "2026-02"), "bulan berjalan tidak dihitung");
const wob = idx.map(([d, v], i) => [d, v * (i % 2 ? 1.01 : 1)]);
t = trackingOf(nav, wob, "2025-01-01", "2026-03");
assert.ok(t.y1.te > 3 && t.y1.te < 4, "selisih bergantian ±1% -> TE ≈ 3,6%/thn: " + t.y1.te);
assert.equal(trackingOf(nav.slice(0, 4), idx, "2025-01-01", "x").y1, null, "kurang dari 6 bulan");
assert.equal(trackingOf(nav, idx, "2025-10-01", "x").y3, null);
// kalender ops: urut, dalam rentang, semua perkiraan; dividen dari riwayat
const cal = opsCalendar("2026-10-23", { XKMS: [["2025-12-10", 12], ["2024-12-11", 10]] }, 120);
assert.ok(cal.every((e, i) => e.approx && e.date >= "2026-10-23" && e.date <= "2027-02-20" && (!i || cal[i - 1].date <= e.date)));
assert.ok(cal.some((e) => e.type === "rebalancing" && e.etf === "XKMS" && e.date === "2026-11-30"), "MSCI Nov berlaku penutupan hari bursa terakhir Nov");
assert.ok(cal.some((e) => e.etf === "XKID" && e.type === "rebalancing" && e.date === "2026-11-02"), "IDX30 evaluasi minor Okt berlaku hari bursa pertama Nov (1 Nov 2026 = Minggu)");
const dv = cal.filter((e) => e.type === "dividen");
assert.deepEqual(dv.map((e) => e.date), ["2026-12-10"], "dividen: satu perkiraan per bulan, dari pembagian terakhir");
assert.match(dv[0].note, /Rp12 per unit/);
assert.ok(cal.some((e) => e.type === "laporan" && e.date === "2026-11-02" && /Okt 2026/.test(e.title)));
assert.ok(opsCalendar("2026-12-28", {}, 10).some((e) => /Des 2026/.test(e.title)), "laporan Januari = bulan Desember tahun lalu");
// peringatan
const base = { code: "XKMS", navDate: "2026-10-22", priceDate: "2026-10-23", premium: 0.3, premiumLive: 0.2, liq: { zeroDays20: 0, days: 20 }, ret: { m1: 1 }, bench: { atNav: { ret: { m1: 0.8 } } }, track: { y1: { te: 1 } }, flows: [] };
assert.deepEqual(alertsOf(base), []);
const A = alertsOf({ ...base, navDate: "2026-10-16", premium: -2.4, premiumLive: 1.3, liq: { zeroDays20: 6, days: 20 }, ret: { m1: 3 }, track: { y1: { te: 2.6 } }, flows: [{ ym: 202609, aum: 80, flow: -20 }] });
assert.deepEqual(A.map((a) => [a.rule, a.level]), [["nav", "high"], ["prem", "high"], ["inav", "warn"], ["liq", "warn"], ["td", "warn"], ["te", "warn"], ["flow", "warn"]]);
assert.ok(A.every((a) => a.key.startsWith("etf:XKMS:") && a.title.startsWith("XKMS: ")));
assert.match(A[1].title, /diskon -2,40%/);

/* ---------- build lewat fetch tiruan ---------- */
const days = []; for (let d = new Date(Date.UTC(2025, 0, 2)); d <= new Date(Date.UTC(2026, 9, 23)); d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() % 6) days.push(new Date(d));
const yChart = (f, div) => ({ chart: { result: [{ timestamp: days.map((d) => d.getTime() / 1000 - 7 * 3600 + 9 * 3600), indicators: { quote: [{ close: days.map((_, i) => f(i)), volume: days.map(() => 1000) }] },
  ...(div ? { events: { dividends: { a: { date: Date.UTC(2025, 11, 10) / 1000, amount: 12 } } } } : {}) }] } });
const realFetch = globalThis.fetch, seen = [];
globalThis.fetch = async (u, init) => {
  u = String(u); seen.push(u);
  if (u.includes("scanner.tradingview.com")) {
    const b = JSON.parse(init.body);
    if (b.symbols && b.symbols.tickers) return Response.json({ data: [{ s: "IDX:IDX30", d: ["IDX30", 102, 100, 1, 2, 3, 4, 5, 6] }, { s: "IDX:LQ45", d: ["LQ45", 101, 100, 1, 2, 3, 4, 5, 6] }, { s: "IDX:ISSI", d: ["ISSI", 184, 183, 1, 2, 3, 4, 5, 6] }] });
    return Response.json({ data: [["XKMS", "Kisi MSCI"], ["XKID", "Kisi IDX30"], ["XIJI", "ETF JII"]].map(([c, n]) => ({ s: "IDX:" + c, d: [c, n, 760, 0.5, 1e4, 7.6e6, 9e3, 0.6, null, 1, 2, 3, 4, 5, 6] })) });
  }
  if (u.includes("finance.yahoo.com")) {
    const s = decodeURIComponent(u.split("/chart/")[1].split("?")[0]);
    return Response.json(yChart((i) => (s === "IDR=X" ? 16000 : 100 + i * (s.includes("JII") ? 0.1 : 0.05)), u.includes("events=div")));
  }
  throw new Error("fetch tak terduga: " + u);
};
const env = { DB: null, PROFILE: "{}", SSO_SECRET: "s".repeat(40), HUB_URL: "https://hub.acme.test" };
const ctx = { waitUntil() {} };
try {
  const r = await etf.fetch(new Request("https://etf.acme.test/api/etf?refresh=1"), env, ctx);
  assert.equal(r.status, 200);
  const D = await r.json();
  assert.deepEqual(D.sharia.idx.map((i) => i.key), ["jii", "issi", "ihsg"]);
  assert.ok(D.sharia.idx.every((i) => i.ret.y1 > 0));
  assert.deepEqual(D.sharia.idx.map((i) => i.asOf), ["2026-10-23", "berjalan", "2026-10-23"], "ISSI dari TradingView");
  assert.deepEqual(D.sharia.etfs, ["XIJI"]);
  assert.ok(Array.isArray(D.calendar) && D.calendar.length > 5);
  const xk = D.kisi.find((k) => k.code === "XKMS");
  assert.ok(Array.isArray(xk.divs) && xk.divs[0][1] === 12, "dividen dari Yahoo events=div");
  assert.ok(seen.some((u) => u.includes("XKMS.JK") && u.includes("events=div")));
  assert.ok(seen.some((u) => u.includes(encodeURIComponent("^JKII"))));
  assert.equal(xk.liveIndex, "LQ45");
  assert.ok(Array.isArray(D.alerts));
  // feed Tool Hub
  assert.equal((await etf.fetch(new Request("https://etf.acme.test/__hub/today"), env, ctx)).status, 403);
  const h = await (await etf.fetch(new Request("https://etf.acme.test/__hub/today", { headers: { "x-hub-key": env.SSO_SECRET } }), env, ctx)).json();
  assert.ok(Array.isArray(h.alerts) && Array.isArray(h.calendar) && h.kisi.length === 2);
  assert.ok(h.calendar.every((e) => e.date <= "2026-12-31"));
} finally { globalThis.fetch = realFetch; }

// skrip halaman bisa di-parse
const html = fs.readFileSync(new URL("./page.html", import.meta.url), "utf8");
for (const [, js] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(js);
console.log("semua cek lolos");
