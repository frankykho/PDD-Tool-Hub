/**
 * Apakah perbedaan dua varian strategi NYATA atau kebetulan?
 *   Follow Line V9 vs V10, SATS v1.9.0 vs SATS IDX Core.
 *
 * Langkah:
 *   npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --json --command "SELECT strategy, code, entry_date, return_pct, value_20d FROM sats_trades WHERE strategy IN ('FOLLOW','FOLLOW10','SATS','SATS_IDX')" > out/trades.json
 *   npx tsx src/analysis/compare-variants.ts out/trades.json
 *
 * Semua strategi sekaligus (apakah masing-masing untung secara meyakinkan?):
 *   npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --json --command "SELECT strategy, code, entry_date, return_pct, value_20d FROM sats_trades" > out/trades.json
 *   npx tsx src/analysis/compare-variants.ts out/trades.json --all
 *
 * Metode: return bersih (−0,4% biaya), hanya saham dengan transaksi ≥ Rp 5 M/hari saat masuk.
 * Dua periode: pembentukan (3 th − 12 bln) dan uji (12 bln terakhir).
 * Bootstrap 5.000× → interval 95% untuk selisih rata-rata & profit factor, dan peluang varian B lebih baik.
 */
import { readFileSync } from "node:fs";

const FEE = 0.4;
const MIN_VALUE = Number(process.env.MIN_VALUE ?? 5e9);
const ITER = 5000;
const PAIRS: Array<[string, string, string]> = [
  ["FOLLOW", "FOLLOW10", "Follow Line V9 vs V10"],
  ["SATS", "SATS_IDX", "SATS v1.9.0 vs SATS IDX Core"],
];

interface Row {
  strategy: string;
  code: string;
  entry_date: string;
  return_pct: number;
  value_20d: number | null;
}

// Windows PowerShell ">" writes UTF-16; strip BOM and any banner text before the JSON.
const buf = readFileSync(process.argv[2] ?? "out/trades.json");
let text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString("utf16le") : buf.toString("utf8");
text = text.replace(/^\uFEFF/, "");
const start = text.search(/[\[{]/);
const raw = JSON.parse(text.slice(start));
const rows: Row[] = Array.isArray(raw) ? (raw[0]?.results ?? raw) : raw.results;
if (!rows?.length) throw new Error("File kosong / format tidak dikenali");

const lastDate = rows.map((r) => r.entry_date).sort().at(-1) as string;
const shift = (d: string, days: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() - days);
  return x.toISOString().slice(0, 10);
};
const oneY = shift(lastDate, 365);
const threeY = shift(lastDate, 1096);

// deterministic RNG so results are reproducible
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const stats = (x: number[]) => {
  const n = x.length;
  const s = [...x].sort((a, b) => a - b);
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const win = x.filter((v) => v > 0).length / n;
  const gain = x.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const loss = -x.filter((v) => v < 0).reduce((a, b) => a + b, 0);
  const k = Math.ceil(n * 0.01);
  const trimmed = s.slice(0, n - k).reduce((a, b) => a + b, 0) / Math.max(1, n - k);
  return { n, mean, median, win, pf: loss ? gain / loss : Infinity, trimmed };
};
const resample = (x: number[]) => Array.from({ length: x.length }, () => x[Math.floor(rnd() * x.length)]);
const pct = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
const q = (arr: number[], p: number) => [...arr].sort((a, b) => a - b)[Math.floor(p * (arr.length - 1))];

function compare(a: number[], b: number[]) {
  const dMean: number[] = [];
  const dPf: number[] = [];
  const dMed: number[] = [];
  for (let i = 0; i < ITER; i += 1) {
    const sa = stats(resample(a));
    const sb = stats(resample(b));
    dMean.push(sb.mean - sa.mean);
    dMed.push(sb.median - sa.median);
    dPf.push(Math.min(sb.pf, 10) - Math.min(sa.pf, 10));
  }
  return {
    mean: { lo: q(dMean, 0.025), hi: q(dMean, 0.975), pBetter: dMean.filter((v) => v > 0).length / ITER },
    median: { lo: q(dMed, 0.025), hi: q(dMed, 0.975), pBetter: dMed.filter((v) => v > 0).length / ITER },
    pf: { lo: q(dPf, 0.025), hi: q(dPf, 0.975), pBetter: dPf.filter((v) => v > 0).length / ITER },
  };
}

console.log(`Data trade s/d ${lastDate} · transaksi ≥ Rp ${(MIN_VALUE / 1e9).toFixed(0)} M/hari · return bersih (−${FEE}%)\n`);

if (process.argv.includes("--all")) {
  const ids = [...new Set(rows.map((r) => r.strategy))].sort();
  for (const [label, from, to] of [
    ["Pembentukan", threeY, oneY],
    ["UJI (12 bln terakhir)", oneY, "9999"],
  ] as const) {
    console.log(`══════ ${label}`);
    console.log("  strategi    trade    win   rata²  [95% rata²]            median  tanpa1%    PF   P(rata²>0)");
    for (const id of ids) {
      const x = rows
        .filter((r) => r.strategy === id && r.entry_date >= from && r.entry_date < to && (r.value_20d ?? 0) >= MIN_VALUE)
        .map((r) => r.return_pct - FEE);
      if (x.length < 20) {
        console.log(`  ${id.padEnd(10)} data kurang (${x.length})`);
        continue;
      }
      const st = stats(x);
      const means = Array.from({ length: ITER }, () => stats(resample(x)).mean);
      console.log(
        `  ${id.padEnd(10)} ${String(st.n).padStart(5)}  ${(st.win * 100).toFixed(1).padStart(5)}%  ${pct(st.mean).padStart(7)}  ` +
          `[${pct(q(means, 0.025))} … ${pct(q(means, 0.975))}]`.padEnd(22) +
          `  ${pct(st.median).padStart(7)}  ${pct(st.trimmed).padStart(7)}  ${st.pf.toFixed(2).padStart(4)}   ${((means.filter((m) => m > 0).length / ITER) * 100).toFixed(0)}%`,
      );
    }
    console.log("");
  }
  process.exit(0);
}

for (const [A, B, title] of PAIRS) {
  console.log(`══════ ${title}`);
  const verdicts: string[] = [];
  for (const [label, from, to] of [
    ["Pembentukan", threeY, oneY],
    ["UJI (12 bln terakhir)", oneY, "9999"],
  ] as const) {
    const pick = (s: string) =>
      rows
        .filter((r) => r.strategy === s && r.entry_date >= from && r.entry_date < to && (r.value_20d ?? 0) >= MIN_VALUE)
        .map((r) => r.return_pct - FEE);
    const a = pick(A);
    const b = pick(B);
    if (a.length < 20 || b.length < 20) {
      console.log(`  ${label}: data terlalu sedikit (${A} ${a.length}, ${B} ${b.length} trade)\n`);
      verdicts.push("n/a");
      continue;
    }
    const sa = stats(a);
    const sb = stats(b);
    const c = compare(a, b);
    const line = (name: string, s: ReturnType<typeof stats>) =>
      `    ${name.padEnd(9)} n ${String(s.n).padStart(5)}  win ${(s.win * 100).toFixed(1).padStart(5)}%  rata² ${pct(s.mean).padStart(7)}  median ${pct(s.median).padStart(7)}  tanpa 1% terbaik ${pct(s.trimmed).padStart(7)}  PF ${s.pf.toFixed(2)}`;
    console.log(`  ${label}`);
    console.log(line(A, sa));
    console.log(line(B, sb));
    console.log(
      `    Selisih ${B} − ${A}: rata² ${pct(sb.mean - sa.mean)} [95%: ${pct(c.mean.lo)} … ${pct(c.mean.hi)}], ` +
        `peluang ${B} lebih baik ${(c.mean.pBetter * 100).toFixed(0)}% · PF ${(sb.pf - sa.pf).toFixed(2)} ` +
        `[${c.pf.lo.toFixed(2)} … ${c.pf.hi.toFixed(2)}] · median ${pct(sb.median - sa.median)} [${pct(c.median.lo)} … ${pct(c.median.hi)}]\n`,
    );
    const v = c.mean.lo > 0 && c.pf.lo > 0 ? B : c.mean.hi < 0 && c.pf.hi < 0 ? A : "tidak beda nyata";
    verdicts.push(v);
  }
  const [pre, test] = verdicts;
  let concl: string;
  if (test === "n/a") concl = "Belum bisa diputuskan: data periode uji kurang.";
  else if (test !== "tidak beda nyata" && (pre === test || pre === "tidak beda nyata"))
    concl = `${test} LEBIH BAIK secara meyakinkan (di periode uji, dan tidak bertentangan dengan pembentukan).`;
  else if (test !== "tidak beda nyata") concl = `Hasil berlawanan antar periode (pembentukan: ${pre}, uji: ${test}) → tidak bisa dipercaya.`;
  else concl = "TIDAK ada bukti salah satu lebih baik di periode uji → pilih berdasarkan alasan lain (lihat catatan).";
  console.log(`  KESIMPULAN: ${concl}\n`);
}
console.log(
  "Catatan bila tidak beda nyata: Follow Line → V10 (logika exit & stop lebih sehat, risiko lebih terkendali).\n" +
    "SATS → v1.9.0 default (parameter bawaan, tidak ada pilihan parameter tambahan yang harus dipercaya).",
);
