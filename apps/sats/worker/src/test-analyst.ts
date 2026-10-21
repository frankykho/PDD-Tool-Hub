/**
 * Tests for the AI Stock Analyst route (src/analyst.ts) with an in-memory D1 and a fake Workers AI.
 * Run:  npx tsx src/test-analyst.ts   (Node 22.15+, needs node:sqlite)
 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { analystRoute, flagAdvice, gatherData, shortName } from "./analyst";
import { FUND_DDL } from "./fundamentals/schema";

let failed = 0;
function eq(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
  if (!ok) failed += 1;
}
const yes = (name: string, v: boolean) => eq(name, v, true);

// ---------- in-memory D1 with the real schema
const sql = new DatabaseSync(":memory:");
sql.exec(readFileSync("../database/schema.sql", "utf8")); // dijalankan dari apps/sats/worker
sql.exec(FUND_DDL);
const st = (q: string, a: unknown[] = []): any => ({
  bind: (...x: unknown[]) => st(q, x),
  all: async () => ({ results: sql.prepare(q).all(...(a as never[])) }),
  first: async () => sql.prepare(q).get(...(a as never[])) ?? null,
  run: async () => sql.prepare(q).run(...(a as never[])),
});
const db = { prepare: (q: string) => st(q) } as unknown as D1Database;
const now = new Date().toISOString();
sql.prepare("INSERT INTO stocks (code, name, active, updated_at) VALUES (?, ?, 1, ?)").run("PTBA", "PT Bukit Asam (Persero) Tbk.", now);
sql.prepare(
  `INSERT INTO tech_latest (code, as_of_date, close, chg1, chg126, dist_ma50, dist_ma200, ma_stack, rsi14, vol_ratio, value_20d, dist_high52, breakout20_days, updated_at)
   VALUES ('PTBA', '2026-10-20', 3050, 6.3, 40, 8, 13.5, 1, 66, 1.5, 120e9, -3, 0, ?)`,
).run(now);
sql.prepare("INSERT INTO sats_latest (strategy, code, as_of_date, close, signal_today, last_signal, last_signal_date, last_signal_bars, updated_at) VALUES ('SATS', 'PTBA', '2026-10-20', 3050, 'BUY', 'BUY', '2026-10-20', 0, ?)").run(now);
sql.prepare(
  "INSERT INTO sats_trades (strategy, code, entry_date, entry, exit_date, exit_reason, exit_price, return_pct, bars_held) VALUES ('SATS','PTBA','2025-01-02',2500,'2025-02-01','TP3',2800,12,20), ('SATS','PTBA','2025-05-02',2700,'2025-05-20','SL',2600,-3.7,10)",
).run();

// ---------- fake network (RSS + Yahoo) and fake AI
const RSS = `<rss><channel><item><title>Laba Bukit Asam (PTBA) Naik</title><link>https://berita.test/ptba</link><pubDate>${new Date().toUTCString()}</pubDate></item>
<item><title>IHSG Melemah</title><link>https://berita.test/ihsg</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
globalThis.fetch = (async (u: string | URL | Request) => {
  const url = String(u instanceof Request ? u.url : u);
  if (url.includes("finance.yahoo.com")) return Response.json({ chart: { result: [{ events: { dividends: { a: { date: 1716854400, amount: 397.71 } } } }] } });
  return new Response(RSS, { headers: { "content-type": "application/rss+xml" } });
}) as typeof fetch;
let calls = 0, lastUser = "";
const AI = {
  run: async (_model: string, input: { messages: Array<{ content: string }> }) => {
    calls++;
    lastUser = input.messages[1].content;
    return { response: "## Ringkasan\nPTBA naik 6,3% hari ini dengan RSI 66.\n## Risiko yang perlu dicek\n- Volume 1,5× rata-rata." };
  },
};
const env = { screener_db: db, AI, ANALYST_DAILY: "2" };
const call = async (method: string, code = "PTBA", who: string | null = "Rina") => {
  const r = await analystRoute(new Request(`https://sats.test/api/analyst/${code}`, { method }), env, code, who);
  return { status: r.status, body: (await r.json()) as any };
};

async function main(): Promise<void> {
// ---------- helpers
eq("nama pendek untuk cari berita", shortName("PT Bukit Asam (Persero) Tbk."), "Bukit Asam");
eq("nama pendek: Bank Central Asia Tbk.", shortName("Bank Central Asia Tbk."), "Bank Central");
yes("kalimat rekomendasi ditandai", flagAdvice("Saham ini sebaiknya dibeli sekarang."));
yes("target harga ditandai", flagAdvice("Target harga 4.000."));
eq("menyebut sinyal BUY strategi tidak ditandai", flagAdvice("Sinyal SATS BUY muncul hari ini; RSI 66."), false);

// ---------- data
const g = await gatherData(db, "PTBA");
eq("tanggal data", g?.asOf, "2026-10-20");
eq("berita disaring ke saham ini", g?.data.berita_7_hari.map((n: { judul: string }) => n.judul), ["Laba Bukit Asam (PTBA) Naik"]);
eq("dividen dari Yahoo", g?.data.corporate_action.dividen_5th, [{ date: "2024-05-28", amount: 397.71 }]);
eq("rekam jejak SATS (bersih biaya 0,4%)", g?.data.rekam_jejak_sats_3th, { jumlah_posisi: 2, menang_pct: 50, rata_return_bersih_pct: 3.75 });
yes("skor Radar ikut", typeof g?.data.radar?.skor === "number");
eq("fundamental kosong -> null (AI menulis 'Data tidak tersedia')", g?.data.fundamental, null);

// ---------- route: cache per saham per tanggal data, kuota tim harian
let r = await call("GET");
eq("belum ada analisis", [r.status, r.body.analysis, r.body.quota], [200, null, { used: 0, limit: 2 }]);
r = await call("POST");
eq("buat analisis", [r.status, calls, r.body.analysis.created_by, r.body.quota.used], [200, 1, "Rina", 1]);
yes("prompt berisi DATA JSON saham", lastUser.startsWith("DATA (JSON):") && lastUser.includes('"kode":"PTBA"'));
yes("teks AI tersimpan", r.body.analysis.text.includes("RSI 66"));
r = await call("POST", "PTBA", "Budi");
eq("POST kedua di tanggal data yang sama memakai simpanan, tanpa panggil AI", [r.status, calls, r.body.analysis.created_by], [200, 1, "Rina"]);
r = await call("GET");
eq("GET mengembalikan analisis tersimpan + data", [r.body.analysis.as_of, r.body.analysis.data.saham.kode], ["2026-10-20", "PTBA"]);
eq("saham tidak dikenal", (await call("POST", "ZZZZ")).status, 404);

// data baru (tanggal berikutnya): analisis lama jadi "previous", kuota 2 per hari
sql.prepare("UPDATE tech_latest SET as_of_date = '2026-10-21'").run();
r = await call("GET");
eq("data baru: analisis lama tampil sebagai previous", [r.body.analysis, r.body.previous?.as_of], [null, "2026-10-20"]);
r = await call("POST");
eq("analisis kedua hari ini", [r.status, calls], [200, 2]);
sql.prepare("UPDATE tech_latest SET as_of_date = '2026-10-22'").run();
r = await call("POST");
eq("kuota tim habis -> 429 tanpa panggil AI", [r.status, calls], [429, 2]);
yes("pesan kuota jelas", /Kuota analisis AI hari ini \(2\)/.test(r.body.error));

// AI gagal: pesan yang bisa dibaca, tidak tersimpan
sql.prepare("DELETE FROM ai_analysis").run();
env.AI.run = async () => {
  throw new Error("4006: daily free allocation exceeded");
};
r = await call("POST");
eq("kuota Workers AI habis -> 503 dengan pesan", [r.status, /Kuota AI gratis/.test(r.body.error)], [503, true]);
eq("gagal tidak tersimpan", (sql.prepare("SELECT COUNT(*) AS n FROM ai_analysis").get() as { n: number }).n, 0);

console.log(failed ? `\n${failed} FAIL` : "\nsemua PASS");
if (failed) process.exit(1);
}
main();
