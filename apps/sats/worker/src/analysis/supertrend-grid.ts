/**
 * Supertrend untuk saham BEI: cari setting yang TAHAN UJI, bukan yang paling beruntung.
 *
 *   npx tsx src/analysis/supertrend-grid.ts            # 963 saham, data Yahoo 10 tahun (di-cache di out/cache)
 *   MIN_VALUE=20e9 npx tsx src/analysis/supertrend-grid.ts
 *
 * Metode
 *  1. Grid ATR period × multiplier, dengan dan tanpa filter (harga > MA200 & IHSG > MA200 saat BUY).
 *  2. Setting dipilih HANYA dari periode pembentukan (semua data sebelum 12 bulan terakhir),
 *     memakai "rata-rata tanpa 1% trade terbaik" yang dihaluskan dengan tetangganya di grid
 *     (setting yang bagus sendirian di tengah tetangga yang jelek = kebetulan).
 *  3. Setting terpilih diuji SEKALI di 12 bulan terakhir, dibandingkan dengan default (10 / 3),
 *     SATS dan SATS + filter. Bootstrap untuk rentang keyakinan 95%.
 * Semua: long only, masuk di close BUY, keluar di close SELL, return bersih −0,4%, hanya saham likuid.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fetchYahooDaily } from "../data/yahoo";
import type { SatsInputBar } from "../sats/types";
import { runSats } from "../sats/engine";
import { applyFilter, fromSats, satsFilterMask } from "../strategies/sats";
import { runSupertrend } from "../strategies/supertrend";
import { sma } from "../strategies/series";
import universe from "../pipeline/universe.json";

const FEE = 0.4;
const MIN_VALUE = Number(process.env.MIN_VALUE ?? 5e9);
const PERIODS = [7, 10, 14, 21];
const MULTS = [1.5, 2, 2.5, 3, 3.5, 4, 5];
const MIN_TRADES = 300;
const CONCURRENCY = 6;
const CACHE = "out/cache";

const wib = (t: number) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function load(symbol: string, file: string): Promise<SatsInputBar[] | null> {
  const path = `${CACHE}/${file}.json`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  for (let a = 0; a < 3; a += 1) {
    try {
      const bars = await fetchYahooDaily(symbol, now - 10 * 365 * 86400, now);
      writeFileSync(path, JSON.stringify(bars));
      return bars;
    } catch {
      await sleep(1000 * 2 ** a);
    }
  }
  return null;
}

// ---- stats
let seed = 777;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
function stats(x: number[]) {
  const n = x.length;
  if (!n) return null;
  const s = [...x].sort((a, b) => a - b);
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const k = Math.ceil(n * 0.01);
  const trimmed = s.slice(0, n - k).reduce((a, b) => a + b, 0) / Math.max(1, n - k);
  const gain = x.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const loss = -x.filter((v) => v < 0).reduce((a, b) => a + b, 0);
  return { n, mean, median, trimmed, pf: loss ? gain / loss : Infinity, win: x.filter((v) => v > 0).length / n };
}
function ci(x: number[]) {
  const means: number[] = [];
  for (let i = 0; i < 2000; i += 1) {
    let s = 0;
    for (let j = 0; j < x.length; j += 1) s += x[Math.floor(rnd() * x.length)];
    means.push(s / x.length);
  }
  means.sort((a, b) => a - b);
  return { lo: means[50], hi: means[1949], p: means.filter((m) => m > 0).length / 2000 };
}
const pct = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const ihsg = await load("^JKSE", "_JKSE");
  if (!ihsg) throw new Error("IHSG gagal diambil");
  const ma = sma(ihsg.map((b) => b.close), 200);
  const above = new Map(ihsg.map((b, i) => [wib(b.time), Number.isNaN(ma[i]) ? null : b.close > ma[i]] as const));
  const ihsgAbove = (t: number) => above.get(wib(t)) ?? null;

  // key: `${period}|${mult}|${filter}` -> [{date, net}]
  const bucket = new Map<string, Array<{ d: string; r: number }>>();
  const push = (key: string, d: string, r: number) => {
    const arr = bucket.get(key) ?? [];
    arr.push({ d, r });
    bucket.set(key, arr);
  };

  const limit = Number(process.env.LIMIT ?? 0);
  const all = (universe as Array<{ code: string }>).map((u) => u.code);
  const codes = limit > 0 ? all.slice(0, limit) : all;
  let cursor = 0;
  let done = 0;
  let lastDate = "";
  const t0 = Date.now();
  async function worker() {
    while (cursor < codes.length) {
      const code = codes[cursor++];
      const bars = await load(`${code}.JK`, code);
      done += 1;
      if (done % 100 === 0) console.log(`  ${done}/${codes.length} saham · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      if (!bars || bars.length < 250) continue;
      const ld = wib(bars[bars.length - 1].time);
      if (ld > lastDate) lastDate = ld;
      const value = bars.map((_, i) => {
        let s = 0;
        const a = Math.max(0, i - 19);
        for (let k = a; k <= i; k += 1) s += bars[k].close * (bars[k].volume ?? 0);
        return s / (i - a + 1);
      });
      const mask = satsFilterMask(bars, ihsgAbove);
      const take = (key: string, trades: ReturnType<typeof runSupertrend>["trades"], filtered: boolean) => {
        for (const t of trades) {
          if (t.exitBar == null || t.exitPrice == null) continue;
          if (value[t.entryBar] < MIN_VALUE) continue;
          if (filtered && !mask[t.entryBar]) continue;
          push(key, wib(bars[t.entryBar].time), ((t.exitPrice - t.entry) / t.entry) * 100 - FEE);
        }
      };
      for (const p of PERIODS) {
        for (const m of MULTS) {
          const r = runSupertrend(bars, { period: p, multiplier: m, rmaAtr: true });
          take(`${p}|${m}|0`, r.trades, false);
          take(`${p}|${m}|1`, r.trades, true);
        }
      }
      const sats = fromSats(bars, runSats(bars));
      take("SATS", sats.trades, false);
      take("SATS_F", applyFilter(sats, mask).trades, false);
    }
  }
  console.log("Mengambil data & menghitung (pertama kali ±5–10 menit, berikutnya dari cache)...");
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const d = new Date(`${lastDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 365);
  const testStart = d.toISOString().slice(0, 10);
  const part = (key: string, test: boolean) =>
    (bucket.get(key) ?? []).filter((x) => (test ? x.d >= testStart : x.d < testStart)).map((x) => x.r);

  console.log(`\nData s/d ${lastDate} · pembentukan: < ${testStart} · uji: ≥ ${testStart} · transaksi ≥ Rp ${(MIN_VALUE / 1e9).toFixed(0)} M/hari\n`);

  const chosen: Record<string, { p: number; m: number }> = {};
  for (const f of [0, 1]) {
    console.log(`══ PEMBENTUKAN · ${f ? "DENGAN filter MA200 & IHSG" : "tanpa filter"}`);
    console.log("   rata² tanpa 1% trade terbaik (profit factor) — baris = ATR period, kolom = multiplier");
    console.log(`   ${"".padEnd(5)}${MULTS.map((m) => String(m).padStart(15)).join("")}`);
    const grid: number[][] = [];
    for (const p of PERIODS) {
      const row: number[] = [];
      let line = `   ${String(p).padEnd(5)}`;
      for (const m of MULTS) {
        const st = stats(part(`${p}|${m}|${f}`, false));
        const ok = st && st.n >= MIN_TRADES;
        row.push(ok ? st.trimmed : NaN);
        line += (ok ? `${pct(st.trimmed)} (${st.pf.toFixed(2)})` : "   n kurang").padStart(15);
      }
      grid.push(row);
      console.log(line);
    }
    // smoothed choice
    let best = -Infinity;
    let bi = 0;
    let bj = 0;
    for (let i = 0; i < PERIODS.length; i += 1) {
      for (let j = 0; j < MULTS.length; j += 1) {
        if (Number.isNaN(grid[i][j])) continue;
        const nb: number[] = [];
        for (let di = -1; di <= 1; di += 1)
          for (let dj = -1; dj <= 1; dj += 1) {
            const v = grid[i + di]?.[j + dj];
            if (v !== undefined && !Number.isNaN(v)) nb.push(v);
          }
        const score = nb.reduce((a, b) => a + b, 0) / nb.length;
        if (score > best) {
          best = score;
          bi = i;
          bj = j;
        }
      }
    }
    chosen[f] = { p: PERIODS[bi], m: MULTS[bj] };
    console.log(`   → dipilih (paling kuat bersama tetangganya): ATR ${PERIODS[bi]} · multiplier ${MULTS[bj]}\n`);
  }

  console.log("══ UJI 12 BULAN TERAKHIR (belum pernah dipakai untuk memilih)");
  console.log("   strategi                         trade    win    rata²   [95% rata²]          median  tanpa1%    PF  P(>0)");
  const rows: Array<[string, string]> = [
    [`Supertrend ${chosen[0].p}/${chosen[0].m} (terpilih)`, `${chosen[0].p}|${chosen[0].m}|0`],
    [`Supertrend ${chosen[1].p}/${chosen[1].m} + filter (terpilih)`, `${chosen[1].p}|${chosen[1].m}|1`],
    ["Supertrend 10/3 (default)", "10|3|0"],
    ["Supertrend 10/3 + filter", "10|3|1"],
    ["SATS v1.9.0", "SATS"],
    ["SATS + filter", "SATS_F"],
  ];
  for (const [name, key] of rows) {
    for (const test of [false, true]) {
      const x = part(key, test);
      const st = stats(x);
      const label = `${test ? "  uji " : "  pbtk"} ${name}`.padEnd(41);
      if (!st || st.n < 20) {
        console.log(`${label} data kurang`);
        continue;
      }
      const c = ci(x);
      console.log(
        `${label}${String(st.n).padStart(6)}  ${(st.win * 100).toFixed(1).padStart(5)}%  ${pct(st.mean).padStart(7)}  ` +
          `[${pct(c.lo)} … ${pct(c.hi)}]`.padEnd(21) +
          `${pct(st.median).padStart(8)} ${pct(st.trimmed).padStart(8)}  ${st.pf.toFixed(2).padStart(4)}  ${(c.p * 100).toFixed(0).padStart(3)}%`,
      );
    }
  }
  console.log(
    "\nCara baca: setting hanya layak dipakai jika di baris 'uji' rata² DAN 'tanpa1%' positif, PF ≥ 1,2, dan P(>0) ≥ 95%.\n" +
      "Kalau tidak ada yang memenuhi, jangan memaksakan setting mana pun — pakai SATS + filter.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
