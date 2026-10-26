// npx tsx src/ownership/test-owners.ts  (Node 22.5+; D1 ditiru dengan node:sqlite)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { ownersRoute, realChanges, type Change } from "../owners";

const sqlite = new DatabaseSync(":memory:");
function d1(): D1Database {
  const st = (sql: string, args: unknown[] = []): any => ({
    bind: (...a: unknown[]) => st(sql, a),
    all: async () => ({ results: sqlite.prepare(sql).all(...(args as never[])) }),
    first: async () => sqlite.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => ({ success: true }),
  });
  return { prepare: (sql: string) => st(sql) } as unknown as D1Database;
}
const db = d1();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const call = async (p: string) => {
  const u = new URL("https://x" + p);
  const r = await ownersRoute(db, u.pathname, u, json);
  return r ? { status: r.status, j: (await r.json()) as any } : null;
};

async function main() {
// sebelum impor pertama: kosong, bukan error
assert.deepEqual((await call("/api/owners/summary"))!.j.empty, true);
assert.equal(await call("/api/screener"), null, "rute lain bukan urusan owners");

sqlite.exec(`
CREATE TABLE stocks (code TEXT PRIMARY KEY, name TEXT);
CREATE TABLE tech_latest (code TEXT PRIMARY KEY, close REAL);
INSERT INTO stocks VALUES ('BRPT','Barito Pacific'),('TPIA','Chandra Asri'),('CUAN','Petrindo');
INSERT INTO tech_latest VALUES ('BRPT',1000),('TPIA',8000),('CUAN',2000);
CREATE TABLE own_holdings (as_of TEXT NOT NULL, code TEXT NOT NULL, hkey TEXT NOT NULL, name TEXT NOT NULL, type TEXT, cat TEXT NOT NULL, local INTEGER NOT NULL, domicile TEXT, shares INTEGER NOT NULL, pct REAL NOT NULL, PRIMARY KEY (as_of, code, hkey));
CREATE TABLE own_releases (as_of TEXT PRIMARY KEY, rows INTEGER NOT NULL, source TEXT, imported_at TEXT NOT NULL);
INSERT INTO own_releases VALUES ('2026-08-31',4,'x','t'),('2026-09-30',5,'x','t');
INSERT INTO own_holdings VALUES
 ('2026-08-31','BRPT','PANGESTU PRAJOGO','PANGESTU PRAJOGO','INDIVIDUAL','perorangan',1,'INDONESIA',100,71.0),
 ('2026-08-31','TPIA','PANGESTU PRAJOGO','PANGESTU PRAJOGO','INDIVIDUAL','perorangan',1,'INDONESIA',10,6.0),
 ('2026-08-31','TPIA','SCG CHEMICALS','SCG CHEMICALS','CORPORATE','korporasi',0,'THAILAND',30,30.0),
 ('2026-08-31','TPIA','UOB KAY HIAN PRIVATE','UOB KAY HIAN PRIVATE LIMITED','SECURITIES COMPANY','kustodian',0,'SINGAPORE',5,2.0),
 ('2026-09-30','BRPT','PANGESTU PRAJOGO','PANGESTU PRAJOGO','INDIVIDUAL','perorangan',1,'INDONESIA',100,71.37),
 ('2026-09-30','TPIA','PANGESTU PRAJOGO','PANGESTU PRAJOGO','INDIVIDUAL','perorangan',1,'INDONESIA',9,5.03),
 ('2026-09-30','TPIA','SCG CHEMICALS','SCG CHEMICALS','CORPORATE','korporasi',0,'THAILAND',30,30.0),
 ('2026-09-30','CUAN','PANGESTU PRAJOGO','PANGESTU PRAJOGO','INDIVIDUAL','perorangan',1,'INDONESIA',80,80.42),
 ('2026-09-30','BRPT','DJS JHT','DJS KETENAGAKERJAAN JHT','INSURANCE','institusi',1,'INDONESIA',2,2.0);
`);

let r = (await call("/api/owners/summary"))!.j;
assert.equal(r.asOf, "2026-09-30");
assert.equal(r.prev, "2026-08-31");
assert.deepEqual(r.counts, { rows: 5, holders: 3, stocks: 3 });
assert.equal(r.top[0].name, "PANGESTU PRAJOGO");
assert.equal(r.top[0].n, 3);
assert.ok(!r.top.some((x: any) => x.cat === "kustodian"), "kustodian tidak masuk daftar teratas");
// TPIA Prajogo 6.0 -> 5.03 (−0,97), BRPT DJS baru +2; CUAN tidak ada bulan lalu (dilewati: saham baru di daftar)
const ch = Object.fromEntries(r.changes.map((x: any) => [`${x.code}:${x.hkey}`, x.delta]));
assert.equal(ch["BRPT:DJS JHT"], 2);
assert.equal(ch["TPIA:PANGESTU PRAJOGO"], -0.97);
assert.equal(ch["CUAN:PANGESTU PRAJOGO"], undefined);

r = (await call("/api/owners/search?q=praj"))!.j;
assert.equal(r.holders[0].hkey, "PANGESTU PRAJOGO");
r = (await call("/api/owners/search?q=tpia"))!.j;
assert.deepEqual(r.stocks.map((x: any) => x.code), ["TPIA"]);

r = (await call("/api/owners/holder?key=PANGESTU%20PRAJOGO"))!.j;
assert.deepEqual(r.rows.map((x: any) => [x.code, x.pct, x.before, x.value]), [["CUAN", 80.42, null, 160000], ["BRPT", 71.37, 71, 100000], ["TPIA", 5.03, 6, 72000]]);

r = (await call("/api/owners/stock?code=tpia"))!.j;
assert.deepEqual(r.rows.map((x: any) => [x.hkey, x.pct, x.n_stocks]), [["SCG CHEMICALS", 30, 1], ["PANGESTU PRAJOGO", 5.03, 3]]);
assert.deepEqual(r.exited.map((x: any) => x.hkey), ["UOB KAY HIAN PRIVATE"], "keluar dari daftar ≥ 1%");
assert.equal((await call("/api/owners/stock?code=x';--"))!.status, 400);

r = (await call("/api/owners/network?key=PANGESTU%20PRAJOGO"))!.j;
assert.deepEqual(new Set(r.rows.map((x: any) => x.code)), new Set(["BRPT", "TPIA", "CUAN"]));
assert.ok(r.rows.some((x: any) => x.hkey === "SCG CHEMICALS"), "pemegang lain di saham yang sama ikut");
console.log("owners: semua cek lolos");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
