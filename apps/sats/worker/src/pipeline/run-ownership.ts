/**
 * Pemegang saham ≥ 1% (daftar bulanan BEI/KSEI) -> SQL untuk D1 (tabel own_holdings, own_releases).
 *
 * Sumber: snapshot SQLite bulanan dari proyek open-source idx-cli (MIT, github.com/0xrsydn/idx-cli), yang mengimpor file
 * "Pemegang Saham di Atas 1%" dari idx.co.id (file aslinya diblokir Cloudflare untuk unduhan otomatis). Snapshot memuat
 * beberapa bulan terakhir; bulan yang sudah ada di D1 ditulis ulang, bulan lama yang tidak lagi ada di snapshot tetap disimpan.
 *
 *   npx tsx src/pipeline/run-ownership.ts                 # unduh snapshot terbaru
 *   npx tsx src/pipeline/run-ownership.ts --file x.sqlite # snapshot lokal
 *   npx tsx src/pipeline/run-ownership.ts --since 2026-08-31  # hanya bulan setelah tanggal ini (yang sudah ada di D1 dilewati)
 *
 * Output: out/ownership.sql (+ out/ownership-summary.json)
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { holderCat, holderKey } from "../ownership/holders";

const MANIFEST = "https://github.com/0xrsydn/idx-cli/releases/download/ownership-snapshot-current/ownership-snapshot-manifest.json";
const args = process.argv.slice(2);
const fileArg = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;
const since = args.includes("--since") ? args[args.indexOf("--since") + 1] ?? "" : "";
const q = (v: string | null) => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`);

export const OWN_DDL = [
  "CREATE TABLE IF NOT EXISTS own_holdings (as_of TEXT NOT NULL, code TEXT NOT NULL, hkey TEXT NOT NULL, name TEXT NOT NULL, " +
    "type TEXT, cat TEXT NOT NULL, local INTEGER NOT NULL, domicile TEXT, shares INTEGER NOT NULL, pct REAL NOT NULL, PRIMARY KEY (as_of, code, hkey));",
  "CREATE INDEX IF NOT EXISTS own_holdings_key ON own_holdings (hkey, as_of);",
  "CREATE TABLE IF NOT EXISTS own_releases (as_of TEXT PRIMARY KEY, rows INTEGER NOT NULL, source TEXT, imported_at TEXT NOT NULL);",
];

async function snapshotFile(): Promise<{ path: string; source: string }> {
  mkdirSync("out", { recursive: true });
  if (fileArg) return { path: fileArg, source: fileArg };
  const m = await (await fetch(MANIFEST)).json() as { snapshot: { download_url: string; sqlite_sha256: string }; source?: { pdf_url?: string } };
  const r = await fetch(m.snapshot.download_url);
  if (!r.ok) throw new Error(`snapshot HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== m.snapshot.sqlite_sha256) throw new Error(`sha256 snapshot tidak cocok (${sha})`);
  writeFileSync("out/ownership-snapshot.sqlite", buf);
  return { path: "out/ownership-snapshot.sqlite", source: m.source?.pdf_url ?? m.snapshot.download_url };
}

interface Row { as_of: string; code: string; hkey: string; name: string; type: string | null; cat: string; local: number; domicile: string | null; shares: number; pct: number }

async function main() {
  const snap = await snapshotFile();
  const db = new DatabaseSync(snap.path, { readOnly: true });
  const releases = (db.prepare("SELECT sha256, as_of_date FROM ownership_releases ORDER BY as_of_date").all() as Array<{ sha256: string; as_of_date: string }>)
    .filter((r) => !since || r.as_of_date > since);
  if (!releases.length) {
    writeFileSync("out/ownership.sql", "");
    console.log(`Tidak ada bulan baru setelah ${since}; tidak ada yang ditulis.`);
    return;
  }
  const stmt = db.prepare(
    `SELECT t.code, h.raw_investor_name name, h.investor_type type, h.locality loc, h.domicile, h.total_shares shares, h.percentage_bps bps
     FROM ksei_holdings h JOIN tickers t ON t.id = h.ticker_id WHERE h.release_sha256 = ?`,
  );
  const sql: string[] = [...OWN_DDL];
  const stamp = new Date().toISOString();
  const summary: Array<{ as_of: string; rows: number; holders: number; stocks: number }> = [];
  for (const rel of releases) {
    // spelling variants of one holder in the same stock are merged (shares and % added)
    const byKey = new Map<string, Row>();
    for (const h of stmt.all(rel.sha256) as Array<{ code: string; name: string; type: string | null; loc: string | null; domicile: string | null; shares: number; bps: number }>) {
      const hkey = holderKey(h.name);
      if (!hkey) continue;
      const local = h.loc === "F" ? 0 : 1;
      const k = `${h.code}|${hkey}`;
      const prev = byKey.get(k);
      if (prev) {
        prev.shares += Number(h.shares);
        prev.pct += h.bps / 100;
        continue;
      }
      byKey.set(k, { as_of: rel.as_of_date, code: h.code, hkey, name: h.name.trim(), type: h.type, cat: holderCat(h.type, local === 1, h.name), local, domicile: h.domicile, shares: Number(h.shares), pct: h.bps / 100 });
    }
    const rows = [...byKey.values()];
    sql.push(`DELETE FROM own_holdings WHERE as_of = ${q(rel.as_of_date)};`);
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100).map((r) =>
        `(${[q(r.as_of), q(r.code), q(r.hkey), q(r.name), q(r.type), q(r.cat), r.local, q(r.domicile), r.shares, Number(r.pct.toFixed(2))].join(", ")})`);
      sql.push(`INSERT INTO own_holdings (as_of, code, hkey, name, type, cat, local, domicile, shares, pct) VALUES ${chunk.join(", ")};`);
    }
    sql.push(`INSERT OR REPLACE INTO own_releases (as_of, rows, source, imported_at) VALUES (${q(rel.as_of_date)}, ${rows.length}, ${q(snap.source)}, ${q(stamp)});`);
    summary.push({ as_of: rel.as_of_date, rows: rows.length, holders: new Set(rows.map((r) => r.hkey)).size, stocks: new Set(rows.map((r) => r.code)).size });
  }
  writeFileSync("out/ownership.sql", sql.join("\n") + "\n");
  writeFileSync("out/ownership-summary.json", JSON.stringify(summary, null, 2));
  for (const s of summary) console.log(`${s.as_of}: ${s.rows} baris, ${s.holders} pemegang, ${s.stocks} saham`);
  console.log(`SQL: ${sql.length} statement -> out/ownership.sql (${(readFileSync("out/ownership.sql").length / 1e6).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
