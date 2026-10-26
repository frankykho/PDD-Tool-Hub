/**
 * Frekuensi & HAKA/HAKI harian (done summary IPOT, publik) -> SQL untuk D1 (flow_daily, flow_latest).
 * Data hanya untuk hari bursa berjalan, jadi dijalankan tiap hari setelah pasar tutup (workflow sats-flow.yml).
 *
 *   npx tsx src/pipeline/run-flow.ts                      # semua saham di universe
 *   npx tsx src/pipeline/run-flow.ts --codes BBCA,TLKM    # sebagian (uji)
 *   npx tsx src/pipeline/run-flow.ts --last 39790,1773990 # freq,lot BBCA hari terakhir di D1: sama persis = data basi (libur), tidak ditulis
 *
 * Output: out/flow.sql (+ out/flow-summary.json)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { parseDoneSummary, type DaySummary } from "../flow/parse";
import { FLOW_DDL } from "../flow/schema";
import universe from "./universe.json";

const ENDPOINT = "https://www.indopremier.com/module/saham/include/data-donesummary.php?code=";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
const CONCURRENCY = 3;
const PAUSE_MS = 150;
const args = process.argv.slice(2);
const arg = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

async function fetchDay(code: string): Promise<DaySummary | null> {
  let pause = 400;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const r = await fetch(ENDPOINT + encodeURIComponent(code), { headers: { "user-agent": UA, accept: "text/html" } });
      if (r.ok) return parseDoneSummary(await r.text());
      if (r.status !== 404 && r.status < 500) throw new Error(`HTTP ${r.status}`); // IPOT sometimes answers 404 for a moment
    } catch (e) {
      if (attempt === 5) throw e;
    }
    await sleep(pause);
    pause *= 2;
  }
  throw new Error("gagal setelah 5 percobaan");
}

async function main() {
  const now = new Date(Date.now() + 7 * 3600e3); // WIB
  const date = arg("--date") ?? now.toISOString().slice(0, 10);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  mkdirSync("out", { recursive: true });
  if (dow === 0 || dow === 6) {
    writeFileSync("out/flow.sql", "");
    console.log(`${date} akhir pekan: tidak ada yang ditulis.`);
    return;
  }
  const codes = arg("--codes")?.split(",") ?? (universe as Array<{ code: string }>).map((x) => x.code);
  const got = new Map<string, DaySummary>();
  const failed: string[] = [];
  let cursor = 0;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < codes.length) {
        const code = codes[cursor++];
        try {
          const d = await fetchDay(code);
          if (d) got.set(code, d);
        } catch (e) {
          failed.push(`${code}: ${(e as Error).message}`);
        }
        await sleep(PAUSE_MS);
      }
    }),
  );
  console.log(`${date}: ${got.size} saham bertransaksi, ${failed.length} gagal, ${((Date.now() - t0) / 1000).toFixed(0)} dtk`);
  // holiday / stale page: BBCA identical to the last stored day -> nothing new
  const last = arg("--last");
  const bbca = got.get("BBCA");
  if (last && bbca && last === `${bbca.freq},${bbca.lot}`) {
    writeFileSync("out/flow.sql", "");
    console.log("Data sama dengan hari terakhir di D1 (libur bursa?): tidak ada yang ditulis.");
    return;
  }
  if (got.size < 50 && !arg("--codes")) {
    writeFileSync("out/flow.sql", "");
    console.log("Terlalu sedikit data (pasar belum tutup / halaman kosong?): tidak ada yang ditulis.");
    if (failed.length > 100) process.exit(1);
    return;
  }
  const rows = [...got].sort((a, b) => a[0].localeCompare(b[0]));
  const sql = [...FLOW_DDL, `DELETE FROM flow_daily WHERE date = ${q(date)};`];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map(([c, d]) => `(${[q(date), q(c), d.freq, d.lot, d.bLot, d.sLot, d.bFreq, d.sFreq, d.vwap ?? "NULL"].join(", ")})`);
    sql.push(`INSERT INTO flow_daily (date, code, freq, lot, b_lot, s_lot, b_freq, s_freq, vwap) VALUES ${chunk.join(", ")};`);
  }
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50).map(([c, d]) => `(${q(c)}, ${q(date)}, ${q(JSON.stringify(d.levels.map((l) => [l.price, l.bLot, l.sLot, l.bFrq, l.sFrq])))})`);
    sql.push(`INSERT OR REPLACE INTO flow_latest (code, date, levels) VALUES ${chunk.join(", ")};`);
  }
  writeFileSync("out/flow.sql", sql.join("\n") + "\n");
  writeFileSync("out/flow-summary.json", JSON.stringify({ date, stocks: got.size, failed, bbca: bbca ? `${bbca.freq},${bbca.lot}` : null }, null, 2));
  console.log(`SQL: ${sql.length} statement -> out/flow.sql`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
