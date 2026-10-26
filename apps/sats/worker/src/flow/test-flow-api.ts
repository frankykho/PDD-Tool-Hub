// npx tsx src/flow/test-flow-api.ts  (Node 22.5+; D1 ditiru dengan node:sqlite)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { flowRoute, flowUpload, mergeDay } from "../flowApi";
import { FLOW_DDL } from "./schema";

const sqlite = new DatabaseSync(":memory:");
const st = (sql: string, args: unknown[] = []): any => ({
  bind: (...a: unknown[]) => st(sql, a),
  all: async () => ({ results: sqlite.prepare(sql).all(...(args as never[])) }),
  first: async () => sqlite.prepare(sql).get(...(args as never[])) ?? null,
  run: async () => {
    sqlite.prepare(sql).run(...(args as never[]));
    return { success: true };
  },
});
const db = {
  prepare: (sql: string) => st(sql),
  batch: async (list: any[]) => {
    for (const x of list) await x.run();
    return [];
  },
} as unknown as D1Database;
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
  // BEI upload: regular board (total − non-regular) wins over IPOT for lot & frequency; IPOT keeps HAKA
  const up = (body: unknown, by = "admin@x") => flowUpload(new Request("https://x/api/flow/upload", { method: "POST", body: JSON.stringify(body) }), db, json, by);
  assert.equal((await up({ date: "2026-11-12", rows: [{ code: "AAAA", volume: 1, freq: 1 }] })).status, 400, "terlalu sedikit baris");
  const many = Array.from({ length: 12 }, (_, i) => ({ code: "Z" + String(i).padStart(3, "0"), close: 1, volume: 100000, value: 1e5, freq: 10, nr_volume: 0, nr_freq: 0, foreign_buy: 0, foreign_sell: 0 }));
  const ok = await up({ date: "2026-11-12", rows: [...many, { code: "AAAA", close: 100, volume: 500000, value: 4e7, freq: 130, nr_volume: 100000, nr_freq: 5, foreign_buy: 30000, foreign_sell: 10000 }] });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, date: "2026-11-12", rows: 13 });
  assert.equal((await up({ date: "2026-11-12", rows: [...many, { code: "AAAA';--", volume: 1, freq: 1 }] })).status, 400, "kode aneh ditolak");
  assert.equal((await up({ date: "12/11/2026", rows: many })).status, 400, "format tanggal");
  const s2 = (await call("/api/flow/stock?code=AAAA"))!.j;
  const last = s2.series.at(-1);
  assert.deepEqual([last.source, last.lot, last.freq, last.avg_lot, last.foreign_net, last.haka], ["idx", 4000, 125, 32, 200, 0.8]);
  assert.equal(s2.series.at(-2).source, "ipot");
  assert.equal(mergeDay(undefined, { date: "d", code: "X", close: 1, volume: 0, value: 0, freq: 0, nr_volume: 0, nr_freq: 0, foreign_buy: null, foreign_sell: null }), null, "tanpa transaksi");
  console.log("flow api: semua cek lolos");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
