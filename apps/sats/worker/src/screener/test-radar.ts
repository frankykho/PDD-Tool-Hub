/**
 * Unit tests for the Opportunity Radar score (frontend/src/radar/score.ts).
 * Run:  npx tsx src/screener/test-radar.ts
 */
import type { ScreenerRow } from "../../../frontend/src/api";
import { DEFAULT_CRITERIA, FOCUS, criteriaFromQuery, criteriaToQuery, radarScore, runRadar } from "../../../frontend/src/radar/score";
import { withRank } from "../../../frontend/src/screener/rank";

let failed = 0;
function eq(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
  if (!ok) failed += 1;
}
const yes = (name: string, v: boolean) => eq(name, v, true);

// Row with every number null; tests set only what they need.
function row(code: string, o: Partial<ScreenerRow> = {}): ScreenerRow {
  const nul = new Proxy({}, { get: () => null }) as ScreenerRow;
  return Object.assign(Object.create(nul), { code, name: code, as_of_date: "2026-10-20", close: 1000, ...o }) as ScreenerRow;
}

// Strong breakout leader: every pillar near the top
const leader = row("LEAD", {
  rs_rank: 92, dist_ma200: 20, dist_ma50: 8, ma_stack: 1, ma200_slope22: 2,
  dist_high52: -1, breakout20_days: 0, chart_patterns: "asc_triangle:breakout", vcp: 1,
  vol_ratio: 1.6, cmf20: 0.18, updown_vol20: 1.8, pocket_pivot_days: 2,
  value_20d: 100e9, profitable: 1, equity_positive: 1, rsi14: 66,
});
let r = radarScore(leader);
eq("momentum: RS 92 (46) + MA200 + MA50 + stack + slope = 96", r.pillars.m, 96);
eq("breakout: high 52M 35 + breakout hari ini 35 + pola 20 + VCP 10 = 100", r.pillars.b, 100);
eq("volume: 35 + 25 + 20 + 20 = 100", r.pillars.v, 100);
eq("likuiditas: Rp 100 M/hari = 100", r.pillars.l, 100);
eq("tanpa peringatan", r.penalty, 0);
eq("skor seimbang = round(96·.35 + 100·.30 + 100·.20 + 100·.15) = 99", r.score, 99);
yes("alasan menyebut RS", r.reasons.some((x) => x.text.startsWith("RS 92")));
yes("alasan menyebut breakout pola", r.reasons.some((x) => x.text === "Breakout pola Ascending triangle"));
yes("alasan menyebut susunan MA (bukan MA200 dan MA50 terpisah)", r.reasons.some((x) => x.text.includes("MA20 > MA50 > MA200")) && !r.reasons.some((x) => x.text.startsWith("Harga di atas MA200")));

// Likuiditas: skala log, di bawah Rp 1 M linier
eq("Rp 10 M/hari = 60", radarScore(row("A", { value_20d: 10e9 })).pillars.l, 60);
eq("Rp 1 M/hari = 20", radarScore(row("A", { value_20d: 1e9 })).pillars.l, 20);
eq("Rp 500 jt/hari = 10", radarScore(row("A", { value_20d: 0.5e9 })).pillars.l, 10);

// Ledakan volume: nilai rendah + peringatan (Lab Uji BEI)
r = radarScore(row("SPIKE", { vol_ratio: 5, value_20d: 10e9 }));
eq("volume 5×: pilar volume hanya 10", r.pillars.v, 10);
yes("volume 5×: ada peringatan", r.reasons.some((x) => x.tone === "warn" && x.text.startsWith("Volume meledak")));

// Peringatan mengurangi skor total dan tercatat sebagai alasan
const hot = { ...leader, rsi14: 84, dist_ma50: 30, code: "HOT" };
r = radarScore(hot);
eq("RSI 84 + 30% di atas MA50: penalti −20", r.penalty, -20);
eq("skor turun 20 poin", r.score, 79);
eq("dua peringatan", r.reasons.filter((x) => x.tone === "warn").length, 2);
r = radarScore({ ...leader, equity_positive: 0, profitable: 0 });
eq("ekuitas negatif −10 (rugi tidak dihitung dua kali)", r.penalty, -10);
r = radarScore(row("BEAR", { value_20d: 10e9, candles: "shooting_star@1,hammer@0", death_days: 3 }));
eq("candle bearish ≤ 1 hari + death cross: −15", r.penalty, -15);

// Bobot fokus
const mom = FOCUS.find((f) => f.id === "momentum")!.w;
const flat = row("FLAT", { rs_rank: 100, dist_ma200: 5, dist_ma50: 3, ma_stack: 1, ma200_slope22: 1, value_20d: 100e9 });
eq("fokus momentum menaikkan skor saham bermomentum", radarScore(flat, mom).score > radarScore(flat).score, true);
eq("bobot 0 semua tidak membuat NaN", radarScore(flat, { m: 0, b: 0, v: 0, l: 0 }).score, 0);

// runRadar: saringan kriteria + urutan
const below = { ...leader, code: "UNDER", dist_ma200: -3 };
const illiquid = { ...leader, code: "THIN", value_20d: 0.4e9 };
const rows = withRank([leader, hot, below, illiquid]).map((x) => ({ ...x, rs_rank: 92 }));
let hits = runRadar(rows, DEFAULT_CRITERIA);
eq("bawaan: di bawah MA200 & < Rp 1 M/hari tersaring, urut skor", hits.map((h) => h.row.code), ["LEAD", "HOT"]);
hits = runRadar(rows, { ...DEFAULT_CRITERIA, noWarn: true });
eq("tanpa peringatan: HOT keluar", hits.map((h) => h.row.code), ["LEAD"]);
hits = runRadar(rows, { ...DEFAULT_CRITERIA, aboveMa200: false, minValue: 0 });
eq("tanpa syarat MA200 & likuiditas: THIN tetap kena penalti likuiditas", hits.some((h) => h.row.code === "THIN" && h.res.penalty <= -10), true);
hits = runRadar(rows, { ...DEFAULT_CRITERIA, watchOnly: true }, (c) => c === "HOT");
eq("hanya watchlist", hits.map((h) => h.row.code), ["HOT"]);
hits = runRadar(rows, { ...DEFAULT_CRITERIA, minScore: 90 });
eq("skor min. 90", hits.map((h) => h.row.code), ["LEAD"]);

// Kriteria <-> URL
eq("kriteria bawaan = URL kosong", criteriaToQuery(DEFAULT_CRITERIA).toString(), "");
const custom = { ...DEFAULT_CRITERIA, focus: "custom", w: { m: 10, b: 60, v: 20, l: 10 }, minScore: 70, index: "LQ45", aboveMa200: false, noWarn: true };
eq("kriteria bolak-balik lewat URL", criteriaFromQuery(criteriaToQuery(custom)), custom);
eq("bobot URL rusak -> bobot bawaan", criteriaFromQuery(new URLSearchParams("fokus=custom&w=1-x")).w, DEFAULT_CRITERIA.w);
eq("fokus tidak dikenal -> seimbang", criteriaFromQuery(new URLSearchParams("fokus=asal")).focus, "seimbang");

console.log(failed ? `\n${failed} FAIL` : "\nsemua PASS");
if (failed) process.exit(1);
