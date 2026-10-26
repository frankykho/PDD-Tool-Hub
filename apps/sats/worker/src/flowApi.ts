/**
 * Frequency Analyzer & HAKA/HAKI. Two daily sources, merged per stock per day:
 *   - flow_daily (pipeline/run-flow.ts): done summary IPOT — lot, frequency, HAKA/HAKI; only collected from Okt 2026 on
 *   - idx_daily (/api/flow/upload): BEI "Ringkasan Saham" uploaded by an admin — official volume & frequency (regular board
 *     = total − non-regular), foreign buy/sell; can be filled backwards. Used for lot & frequency when present.
 *
 *   GET  /api/flow/today                 latest day: lot/transaction, × median of the previous 20 days, % HAKA, sideways
 *   GET  /api/flow/stock?code=           one stock's daily history (≈ 120 days) + price levels of the last IPOT day
 *   POST /api/flow/upload                {date, rows:[IdxDayRow]} (admin) -> idx_daily
 */
import { avgLot, median } from "./flow/parse";
import { IDX_DDL } from "./flow/schema";

type Json = (data: unknown, status?: number, maxAge?: number) => Response;
const CODE = /^[A-Z0-9]{2,6}$/;
/** Spike: average lot per trade at least this multiple of its median over the previous 20 trading days (≥ 10 days of history). */
export const SPIKE = 2;
export const BASE_DAYS = 20;
export const MIN_BASE = 10;

interface FlowRow { date: string; code: string; freq: number; lot: number; b_lot: number | null; s_lot: number | null; b_freq: number | null; s_freq: number | null; vwap: number | null }
interface IdxRow { date: string; code: string; close: number | null; volume: number; value: number | null; freq: number; nr_volume: number; nr_freq: number; foreign_buy: number | null; foreign_sell: number | null }
export type DayRow = FlowRow & { source: "idx" | "ipot"; foreign_net: number | null };

/** One day of one stock from whatever sources exist (BEI wins for lot & frequency, IPOT adds HAKA/HAKI). */
export function mergeDay(f: FlowRow | undefined, x: IdxRow | undefined): DayRow | null {
  if (x) {
    const freq = Math.max(0, x.freq - (x.nr_freq ?? 0));
    const lot = Math.max(0, Math.round((x.volume - (x.nr_volume ?? 0)) / 100));
    if (!freq || !lot) return f ? { ...f, source: "ipot", foreign_net: null } : null;
    return {
      date: x.date, code: x.code, freq, lot,
      b_lot: f?.b_lot ?? null, s_lot: f?.s_lot ?? null, b_freq: f?.b_freq ?? null, s_freq: f?.s_freq ?? null, vwap: f?.vwap ?? null,
      source: "idx",
      foreign_net: x.foreign_buy != null && x.foreign_sell != null ? Math.round((x.foreign_buy - x.foreign_sell) / 100) : null,
    };
  }
  return f ? { ...f, source: "ipot", foreign_net: null } : null;
}

/** One stock's day with the Frequency Analyzer ratio against the previous days (oldest first in `prev`). */
export function analyze(day: DayRow, prev: DayRow[]) {
  const al = avgLot(day.lot, day.freq);
  const base = median(prev.slice(-BASE_DAYS).map((p) => avgLot(p.lot, p.freq)).filter((x): x is number => x != null));
  const ratio = al != null && base && prev.length >= MIN_BASE ? al / base : null;
  const hs = (day.b_lot ?? 0) + (day.s_lot ?? 0);
  return {
    ...day,
    avg_lot: al,
    base_avg_lot: base,
    base_days: Math.min(prev.length, BASE_DAYS),
    ratio,
    spike: ratio != null && ratio >= SPIKE,
    haka: day.b_lot != null && hs ? day.b_lot / hs : null, // share of lots traded at the offer
  };
}

/** Both tables from `from` on (missing tables = empty), merged into date-sorted lists per stock. */
async function loadDays(db: D1Database, where: string, binds: unknown[]): Promise<Map<string, DayRow[]>> {
  const q = async <T>(table: string) =>
    (await db.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY code, date`).bind(...binds).all<T>().catch(() => ({ results: [] as T[] }))).results;
  const [flow, idx] = await Promise.all([q<FlowRow>("flow_daily"), q<IdxRow>("idx_daily")]);
  const key = (r: { date: string; code: string }) => `${r.code}|${r.date}`;
  const fm = new Map(flow.map((r) => [key(r), r]));
  const xm = new Map(idx.map((r) => [key(r), r]));
  const by = new Map<string, DayRow[]>();
  for (const k of [...new Set([...fm.keys(), ...xm.keys()])].sort()) {
    const d = mergeDay(fm.get(k), xm.get(k));
    if (d) (by.get(d.code) ?? by.set(d.code, []).get(d.code)!).push(d);
  }
  return by;
}

async function lastDates(db: D1Database, n: number): Promise<string[]> {
  const q = async (t: string) => (await db.prepare(`SELECT DISTINCT date FROM ${t} ORDER BY date DESC LIMIT ?`).bind(n).all<{ date: string }>().catch(() => ({ results: [] }))).results.map((r) => r.date);
  const [a, b] = await Promise.all([q("flow_daily"), q("idx_daily")]);
  return [...new Set([...a, ...b])].sort().reverse().slice(0, n);
}

export async function flowUpload(request: Request, db: D1Database, json: Json, by: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { date?: string; rows?: Array<Record<string, unknown>> } | null;
  const date = String(body?.date ?? "");
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) return json({ error: "tanggal tidak valid (YYYY-MM-DD)" }, 400, 0);
  const rows = Array.isArray(body?.rows) ? body!.rows : [];
  if (rows.length < 10 || rows.length > 2000) return json({ error: `jumlah baris tidak wajar (${rows.length})` }, 400, 0);
  const n = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);
  const vals: string[] = [];
  for (const r of rows) {
    const code = String(r.code ?? "").toUpperCase();
    const nums = [n(r.close), n(r.volume), n(r.value), n(r.freq), n(r.nr_volume), n(r.nr_freq), n(r.foreign_buy), n(r.foreign_sell)];
    if (!CODE.test(code) || nums.some((x) => Number.isNaN(x)) || nums[1] == null || nums[3] == null) return json({ error: `baris tidak valid: ${code || "?"}` }, 400, 0);
    // values are validated numbers / codes / date -> safe to inline (keeps the statement count low)
    vals.push(`('${date}', '${code}', ${nums.map((x, i) => (x == null ? (i === 4 || i === 5 ? 0 : "NULL") : x)).join(", ")}, '${by.replace(/'/g, "''").slice(0, 120)}')`);
  }
  for (const s of IDX_DDL) await db.prepare(s).run();
  const stmts = [db.prepare("DELETE FROM idx_daily WHERE date = ?").bind(date)];
  for (let i = 0; i < vals.length; i += 250) {
    stmts.push(db.prepare(`INSERT INTO idx_daily (date, code, close, volume, value, freq, nr_volume, nr_freq, foreign_buy, foreign_sell, uploaded_by) VALUES ${vals.slice(i, i + 250).join(", ")}`));
  }
  await db.batch(stmts);
  return json({ ok: true, date, rows: vals.length }, 200, 0);
}

export async function flowRoute(db: D1Database, path: string, url: URL, json: Json): Promise<Response | null> {
  if (!path.startsWith("/api/flow/")) return null;
  const dates = await lastDates(db, BASE_DAYS + 1);
  if (!dates.length) return json({ date: null, rows: [], empty: true });
  const date = dates[0];

  if (path === "/api/flow/today") {
    const byCode = await loadDays(db, "date >= ?", [dates[dates.length - 1]]);
    // price context for "sideways" (screener metrics of the same day)
    const tech = new Map(
      (
        await db
          .prepare("SELECT t.code, s.name, t.close, t.chg1, t.chg20, t.bb_width, t.value_20d FROM tech_latest t LEFT JOIN stocks s ON s.code = t.code")
          .all<{ code: string; name: string | null; close: number | null; chg1: number | null; chg20: number | null; bb_width: number | null; value_20d: number | null }>()
      ).results.map((t) => [t.code, t]),
    );
    const rows = [];
    for (const [code, list] of byCode) {
      const day = list[list.length - 1];
      if (day.date !== date) continue;
      const t = tech.get(code);
      const a = analyze(day, list.slice(0, -1));
      // sideways: 20-day change within ±8% and Bollinger width ≤ 15%
      const sideways = t && t.chg20 != null && t.bb_width != null ? Math.abs(t.chg20) <= 8 && t.bb_width <= 15 : null;
      rows.push({ ...a, name: t?.name ?? null, close: t?.close ?? null, chg1: t?.chg1 ?? null, chg20: t?.chg20 ?? null, bb_width: t?.bb_width ?? null, value_20d: t?.value_20d ?? null, sideways });
    }
    return json({ date, days: dates.length, spike: SPIKE, rows }, 200, 600);
  }

  if (path === "/api/flow/stock") {
    const code = (url.searchParams.get("code") ?? "").toUpperCase();
    if (!CODE.test(code)) return json({ error: "kode tidak valid" }, 400, 0);
    const list = (await loadDays(db, "code = ?", [code])).get(code) ?? [];
    const series = list.map((d, i) => analyze(d, list.slice(Math.max(0, i - BASE_DAYS), i))).slice(-120);
    const lv = await db.prepare("SELECT date, levels FROM flow_latest WHERE code = ?").bind(code).first<{ date: string; levels: string }>().catch(() => null);
    return json({ date, code, spike: SPIKE, series, levels: lv ? { date: lv.date, rows: JSON.parse(lv.levels) as number[][] } : null }, 200, 600);
  }

  return json({ error: "not found" }, 404, 0);
}

