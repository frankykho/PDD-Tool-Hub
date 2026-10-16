import { parseCandles, parseCharts, patternMeta } from "../screener/patternMeta";

const daysLabel = (d: number) => (d === 0 ? "hari ini" : `${d} hr lalu`);

/** Compact badges: candle patterns (with age) and chart patterns (with status). */
export default function PatternBadges({
  candles,
  charts,
  max = 99,
  maxDays = 5,
}: {
  candles: string | null | undefined;
  charts: string | null | undefined;
  max?: number;
  maxDays?: number;
}) {
  const items = [
    ...parseCharts(charts).map((c) => {
      const m = patternMeta(c.id);
      return {
        key: `c-${c.id}`,
        bias: m?.bias ?? "neutral",
        text: `${m?.name ?? c.id} · ${c.status === "breakout" ? "breakout" : "terbentuk"}`,
        title: m?.help ?? "",
      };
    }),
    ...parseCandles(candles)
      .filter((c) => c.days <= maxDays)
      .map((c) => {
        const m = patternMeta(c.id);
        return { key: `k-${c.id}-${c.days}`, bias: m?.bias ?? "neutral", text: `${m?.name ?? c.id} · ${daysLabel(c.days)}`, title: m?.help ?? "" };
      }),
  ];
  if (!items.length) return <span className="dim">—</span>;
  return (
    <span className="pattern-badges">
      {items.slice(0, max).map((x) => (
        <span key={x.key} className={`pattern-badge ${x.bias}`} title={x.title}>
          {x.text}
        </span>
      ))}
      {items.length > max && <span className="dim small">+{items.length - max}</span>}
    </span>
  );
}
