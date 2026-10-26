import type { BreadthRow } from "../api";
import { fmt1, fmtDate } from "../format";
import { WithInfo } from "./Info";

export type BreadthIndex = "k100" | "idx30";
export const BREADTH_LABEL: Record<BreadthIndex, string> = { k100: "KOMPAS100", idx30: "IDX30" };

/** % of the index members closing above SMA60 that day (null before the pipeline wrote the column). */
export function breadthPct(r: BreadthRow | null | undefined, ix: BreadthIndex): number | null {
  const n = ix === "k100" ? r?.k100_n : r?.idx30_n;
  const up = ix === "k100" ? r?.k100_above60 : r?.idx30_above60;
  return n ? ((up ?? 0) / n) * 100 : null;
}

/** Latest day with a reading. Headline = KOMPAS100 (sharper in the test), IDX30 as fallback. */
export function lastBreadth(rows: BreadthRow[] | null | undefined): { date: string; ix: BreadthIndex; pct: number; idx30: number | null } | null {
  for (let i = (rows?.length ?? 0) - 1; i >= 0; i -= 1) {
    const r = rows![i], k = breadthPct(r, "k100"), t = breadthPct(r, "idx30");
    if (k != null) return { date: r.date, ix: "k100", pct: k, idx30: t };
    if (t != null) return { date: r.date, ix: "idx30", pct: t, idx30: t };
  }
  return null;
}

/** ≥ 60 kuat, ≥ 50 sehat, < 50 lemah. */
export const healthOf = (pct: number) =>
  pct >= 60 ? { tone: "buy", label: "Pasar kuat", hint: "posisi normal" }
  : pct >= 50 ? { tone: "buy", label: "Pasar sehat", hint: "posisi normal" }
  : { tone: "sell", label: "Pasar lemah", hint: "kecilkan posisi" };

export const BREADTH_INFO =
  "Persentase saham KOMPAS100 yang harganya di atas SMA60 (IDX30 sebagai pembanding). Uji 3 tahun (Okt 2023–Okt 2026): saat ≥ 50%, " +
  "saham likuid rata-rata +2,4% dalam 20 hari dan sinyal Breakout 20 hari + RS rata-rata +12,8% (≥ 60%: +17,7%); saat < 50%, saham " +
  "likuid −1,4% dan sinyal yang sama hanya +3,0%. Pakai untuk mengatur besar posisi (penuh saat sehat, kecilkan saat lemah), bukan " +
  "sebagai sinyal beli/jual.";

/** One-line market condition for page headers: "Pasar sehat · KOMPAS100 63% di atas SMA60". */
export function MarketHealthLine({ rows }: { rows: BreadthRow[] | null | undefined }) {
  const b = lastBreadth(rows);
  if (!b) return null;
  const h = healthOf(b.pct);
  return (
    <span className="small">
      <WithInfo info={BREADTH_INFO}>
        <b className={h.tone}>{h.label} · {h.hint}</b>
      </WithInfo>{" "}
      <span className="muted">
        · {BREADTH_LABEL[b.ix]} {fmt1(b.pct)}% di atas SMA60
        {b.ix === "k100" && b.idx30 != null && <> (IDX30 {fmt1(b.idx30)}%)</>} · {fmtDate(b.date)}
      </span>
    </span>
  );
}
