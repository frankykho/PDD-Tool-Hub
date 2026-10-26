// npx tsx src/flow/test-flow-api.ts  (Node 22.5+; D1 ditiru dengan node:sqlite)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { flowRoute } from "../flowApi";
import { FLOW_DDL } from "./schema";

const sqlite = new DatabaseSync(":memory:");
const st = (sql: string, args: unknown[] = []): any => ({
  bind: (...a: unknown[]) => st(sql, a),
  all: async () => ({ results: sqlite.prepare(sql).all(...(args as never[])) }),
  first: async () => sqlite.prepare(sql).get(...(args as never[])) ?? null,
});
const db = { prepare: (sql: string) => st(sql) } as unknown as D1Database;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const call = async (p: string) => {
  const u = new URL("https://x" + p);
  const r = await flowRoute(db, u.pathname, u, json);
  return r ? { status: r.status, j: (await r.json()) as any } : null;
};

async function main() {
  assert.equal(await call("/api/screener"), null);
  for (const s of FLOW_DDL) sqlite.exec(s);
  assert.deepEqual((await call("/api/flow/today"))!.j.empty, true, "sebelum data pertama");
  sqlite.exec(`CREATE TABLE stocks (code TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE tech_latest (code TEXT PRIMARY KEY, as_of_date TEXT, close REAL, chg1 REAL, chg20 REAL, bb_width REAL, value_20d REAL);
    INSERT INTO stocks VALUES ('AAAA','Alpha'),('BBBB','Beta');
    INSERT INTO tech_latest VALUES ('AAAA','2026-11-13',100,1,3,9,5e9),('BBBB','2026-11-13',200,2,20,30,9e9);`);
  // 12 trading days: AAAA 10 lot/trade, last day 30 lot/trade (spike, 3×), BBBB flat 5 lot/trade
  const ins = sqlite.prepare("INSERT INTO flow_daily VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (let d = 1; d <= 12; d += 1) {
    const date = `2026-11-${String(d).padStart(2, "0")}`;
    ins.run(date, "AAAA", 100, d === 12 ? 3000 : 1000, d === 12 ? 2400 : 500, d === 12 ? 600 : 500, 60, 40, 100);
    ins.run(date, "BBBB", 200, 1000, 300, 700, 80, 120, 200);
  }
  sqlite.prepare("INSERT INTO flow_latest VALUES (?, ?, ?)").run("AAAA", "2026-11-12", JSON.stringify([[101, 100, 0, 3, 0], [100, 2300, 600, 50, 47]]));

  const t = (await call("/api/flow/today"))!.j;
  assert.equal(t.date, "2026-11-12");
  const a = t.rows.find((r: any) => r.code === "AAAA");
  const b = t.rows.find((r: any) => r.code === "BBBB");
  assert.equal(a.avg_lot, 30);
  assert.equal(a.base_avg_lot, 10);
  assert.equal(a.ratio, 3);
  assert.equal(a.spike, true);
  assert.equal(a.haka, 0.8);
  assert.equal(a.sideways, true, "chg20 3%, BB 9%");
  assert.equal(b.spike, false);
  assert.equal(b.sideways, false);
  assert.equal(b.haka, 0.3);

  const s = (await call("/api/flow/stock?code=aaaa"))!.j;
  assert.equal(s.series.length, 12);
  assert.equal(s.series[5].ratio, null, "kurang dari 10 hari pembanding");
  assert.equal(s.series[11].spike, true);
  assert.deepEqual(s.levels.rows[1], [100, 2300, 600, 50, 47]);
  assert.equal((await call("/api/flow/stock?code=x'"))!.status, 400);
  console.log("flow api: semua cek lolos");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
