/**
 * Frequency Analyzer & HAKA/HAKI (tabel flow_daily / flow_latest, ditulis harian oleh pipeline/run-flow.ts).
 *
 *   GET /api/flow/today                 hari terakhir: per saham frekuensi, lot, lot/transaksi, × median 20 hari, % HAKA, + sideways
 *   GET /api/flow/stock?code=           riwayat harian satu saham (≈ 120 hari) + level harga hari terakhir
 */
import { avgLot, median } from "./flow/parse";

type Json = (data: unknown, status?: number, maxAge?: number) => Response;
const CODE = /^[A-Z0-9]{2,6}$/;
/** Spike: average lot per trade at least this multiple of its median over the previous 20 trading days (≥ 10 days of history). */
export const SPIKE = 2;
export const BASE_DAYS = 20;
export const MIN_BASE = 10;

interface FlowRow { date: string; code: string; freq: number; lot: number; b_lot: number; s_lot: number; b_freq: number; s_freq: number; vwap: number | null }

/** One stock's day with the Frequency Analyzer ratio against the previous days (oldest first in `prev`). */
export function analyze(day: FlowRow, prev: FlowRow[]) {
  const al = avgLot(day.lot, day.freq);
  const base = median(prev.slice(-BASE_DAYS).map((p) => avgLot(p.lot, p.freq)).filter((x): x is number => x != null));
  const ratio = al != null && base && prev.length >= MIN_BASE ? al / base : null;
  return {
    ...day,
    avg_lot: al,
    base_avg_lot: base,
    base_days: Math.min(prev.length, BASE_DAYS),
    ratio,
    spike: ratio != null && ratio >= SPIKE,
    haka: day.lot ? day.b_lot / day.lot : null, // share of lots traded at the offer
  };
}

export async function flowRoute(db: D1Database, path: string, url: URL, json: Json): Promise<Response | null> {
  if (!path.startsWith("/api/flow/")) return null;
  const last = await db
    .prepare("SELECT MAX(date) AS d FROM flow_daily")
    .first<{ d: string | null }>()
    .catch(() => null); // table appears after the first collection
  if (!last?.d) return json({ date: null, rows: [], empty: true });
  const date = last.d;

  if (path === "/api/flow/today") {
    const dates = (await db.prepare("SELECT DISTINCT date FROM flow_daily WHERE date <= ? ORDER BY date DESC LIMIT ?").bind(date, BASE_DAYS + 1).all<{ date: string }>()).results.map((r) => r.date);
    const from = dates[dates.length - 1];
    const { results } = await db.prepare("SELECT * FROM flow_daily WHERE date >= ? ORDER BY code, date").bind(from).all<FlowRow>();
    const byCode = new Map<string, FlowRow[]>();
    for (const r of results) (byCode.get(r.code) ?? byCode.set(r.code, []).get(r.code)!).push(r);
    // price context for "sideways" (screener metrics of the same day)
    const tech = new Map(
      (
        await db
          .prepare("SELECT t.code, s.name, t.close, t.chg1, t.chg20, t.bb_width, t.value_20d, t.as_of_date FROM tech_latest t LEFT JOIN stocks s ON s.code = t.code")
          .all<{ code: string; name: string | null; close: number | null; chg1: number | null; chg20: number | null; bb_width: number | null; value_20d: number | null; as_of_date: string }>()
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
    const { results } = await db.prepare("SELECT * FROM flow_daily WHERE code = ? ORDER BY date DESC LIMIT 140").bind(code).all<FlowRow>();
    const list = results.reverse();
    const series = list.map((d, i) => analyze(d, list.slice(Math.max(0, i - BASE_DAYS), i))).slice(-120);
    const lv = await db.prepare("SELECT date, levels FROM flow_latest WHERE code = ?").bind(code).first<{ date: string; levels: string }>();
    return json({ date, code, spike: SPIKE, series, levels: lv ? { date: lv.date, rows: JSON.parse(lv.levels) as number[][] } : null }, 200, 600);
  }

  return json({ error: "not found" }, 404, 0);
}
