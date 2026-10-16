import { useEffect, useState } from "react";
import { api } from "../api";
import { fmtDate } from "../format";

/** Current date/time in WIB as {date: YYYY-MM-DD, minutes, weekday 0–6}. */
function nowWib() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay() };
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isWeekday = (iso: string) => {
  const w = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return w >= 1 && w <= 5;
};

/** The trading day whose data should already be in the database (EOD lands ±17:30 WIB). Holidays are not known. */
export function expectedTradingDay(): string {
  const n = nowWib();
  let d = n.weekday >= 1 && n.weekday <= 5 && n.minutes >= 18 * 60 ? n.date : addDays(n.date, -1);
  while (!isWeekday(d)) d = addDays(d, -1);
  return d;
}

/** Weekdays strictly after `from` up to and including `to`. */
function weekdaysBetween(from: string, to: string): number {
  let n = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWeekday(d)) n += 1;
  return n;
}

/**
 * Shown on every page when the data is behind:
 *  - 1 trading day behind  -> amber (could be a stock-exchange holiday, or the update is late)
 *  - 2+ trading days behind -> red (the daily update has very likely failed)
 */
export default function StaleBanner() {
  const [asOf, setAsOf] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .asOf()
      .then((r) => alive && setAsOf(r.asOf))
      .catch(() => undefined);
    const t = setInterval(() => {
      api
        .asOf()
        .then((r) => alive && setAsOf(r.asOf))
        .catch(() => undefined);
    }, 15 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (!asOf) return null;
  const expected = expectedTradingDay();
  if (asOf >= expected) return null;
  const behind = weekdaysBetween(asOf, expected);
  if (behind <= 0) return null;
  const severe = behind >= 2;
  return (
    <div className={`stale-banner ${severe ? "severe" : ""}`} role="status">
      <strong>{severe ? "Data tertinggal" : "Data belum ter-update"}</strong>
      <span>
        Data terakhir per {fmtDate(asOf, true)}, seharusnya sudah ada data {fmtDate(expected, true)}.{" "}
        {severe
          ? `Tertinggal ${behind} hari bursa — update harian kemungkinan gagal. Cek GitHub → Actions → EOD SATS.`
          : "Bisa karena hari libur bursa, atau update sore ini terlambat (dicoba lagi pukul 19:43 WIB)."}
      </span>
    </div>
  );
}
