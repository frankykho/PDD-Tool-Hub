/**
 * Dividen mingguan (dijalankan sesudah run-fundamentals.ts): riwayat dividen + EPS dari Yahoo -> out/dividends.sql
 * (tabel div_latest, dibangun ulang). Kurang dari 80% berhasil -> exit 1, tabel lama tetap.
 *
 *   npx tsx src/pipeline/run-dividends.ts            # semua saham
 *   npx tsx src/pipeline/run-dividends.ts --limit 30 # tes cepat
 *   npx tsx src/pipeline/run-dividends.ts --codes BBRI,ADRO
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { DIV_COLUMNS, DIV_DDL, epsToIdr, fetchEps, fetchPayments, summarize, type DivSummary } from "../fundamentals/dividends";
import { fxToIdr } from "../fundamentals/yahooFund";
import universe from "./universe.json";

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const limit = Number(opt("--limit") ?? 0) || 0;
const only = opt("--codes")?.split(",").map((c: string) => c.trim().toUpperCase());
const CONCURRENCY = 4;
const q = (v: string | null | undefined) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "NULL" : String(v));

async function main() {
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  let codes = only ?? (universe as Array<{ code: string }>).map((u) => u.code);
  if (limit > 0) codes = codes.slice(0, limit);
  console.log(`Dividen ${codes.length} saham (${today})...`);

  const fx = new Map<string, Promise<number | null>>([["IDR", Promise.resolve(1)]]);
  const fxFailed = new Set<string>();
  // shortcut: EPS lama dikonversi dengan kurs hari ini, payout emiten USD sedikit meleset; pakai kurs historis bila ada keluhan.
  const rate = (c: string) => {
    if (!fx.has(c))
      fx.set(c, (async () => {
        for (let a = 0; a < 3; a += 1) {
          try {
            return await fxToIdr(c);
          } catch (e) {
            console.warn(`Kurs ${c} gagal (${a + 1}/3): ${e instanceof Error ? e.message : e}`);
            await new Promise((r) => setTimeout(r, 2000 * 2 ** a));
          }
        }
        fxFailed.add(c);
        return null;
      })());
    return fx.get(c)!;
  };

  const rows: Array<{ code: string; s: DivSummary }> = [];
  let ok = 0;
  let epsOk = 0;
  let cursor = 0;
  let done = 0;
  const t0 = Date.now();
  async function worker() {
    while (cursor < codes.length) {
      const code = codes[cursor++];
      const [payments, eps] = await Promise.all([fetchPayments(code), fetchEps(code)]);
      if (payments) ok += 1;
      if (eps) epsOk += 1;
      if (payments?.length) {
        const e = epsToIdr(eps, eps ? await rate(eps.currency ?? "IDR") : null);
        const s = summarize({ payments, annualEps: e.annual, epsTtm: e.ttm, today });
        if (s) rows.push({ code, s });
      }
      if (++done % 100 === 0) console.log(`  ${done}/${codes.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const okShare = Math.min(ok, epsOk) / codes.length;
  console.log(`OK dividen ${ok}, EPS ${epsOk} dari ${codes.length} · pembagi dividen ${rows.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (!limit && !only && okShare < 0.8) {
    console.error("Kurang dari 80% berhasil — tabel lama tidak diganti.");
    process.exit(1);
  }
  if (fxFailed.size) {
    // tanpa kurs, perkiraan semua emiten berlaporan valas hilang diam-diam: lebih baik tabel minggu lalu tetap dipakai
    console.error(`Kurs ${[...fxFailed].join(", ")} gagal — tabel lama tidak diganti.`);
    process.exit(1);
  }

  const cols = DIV_COLUMNS.map(([c]) => c);
  const sql = [
    "DROP TABLE IF EXISTS div_latest;",
    `${DIV_DDL};`,
    ...rows.map(({ code, s }) => {
      const v: Record<string, string> = {
        code: q(code), as_of: q(today), last_date: q(s.last_date), last_amount: n(s.last_amount), fy_last: n(s.fy_last),
        dps_last: n(s.dps_last), payout: n(s.payout), payout_min: n(s.payout_min), payout_max: n(s.payout_max), eps_ttm: n(s.eps_ttm),
        est_dps: n(s.est_dps), est_low: n(s.est_low), est_high: n(s.est_high), est_paid: n(s.est_paid),
        streak: n(s.streak), dps_cagr3: n(s.dps_cagr3), confidence: q(s.confidence), history: q(JSON.stringify(s.history)),
      };
      return `INSERT INTO div_latest (${cols.join(", ")}) VALUES (${cols.map((c) => v[c]).join(", ")});`;
    }),
  ];
  mkdirSync("out", { recursive: true });
  writeFileSync("out/dividends.sql", sql.join("\n") + "\n");
  console.log(`SQL: ${sql.length} statements -> out/dividends.sql`);

  for (const c of ["BBRI", "TLKM", "ADRO", "ITMG", "BBCA"]) {
    const r = rows.find((x) => x.code === c)?.s;
    if (r) console.log(`  ${c.padEnd(5)} TB${r.fy_last} DPS ${r.dps_last} payout ${r.payout ?? "—"}% EPS ${r.eps_ttm ?? "—"} → perkiraan ${r.est_low ?? "—"} / ${r.est_dps ?? "—"} / ${r.est_high ?? "—"} (${r.confidence ?? "—"}) · ${r.streak} th`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
