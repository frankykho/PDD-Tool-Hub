import type { ScreenerRow } from "../api";
import { fundHealthy } from "../format";

/**
 * Adds the derived columns the screener and the radar both use:
 * rs_rank = percentile of the 6-month return among liquid stocks (>= Rp 1 M/day), fund_ok = "Fundamental sehat".
 */
export function withRank(src: ScreenerRow[]): ScreenerRow[] {
  const liquid = src.filter((r) => (r.value_20d ?? 0) >= 1e9 && r.chg126 != null).map((r) => r.chg126 as number);
  liquid.sort((a, b) => a - b);
  const rank = (v: number) => {
    let lo = 0;
    let hi = liquid.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (liquid[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return liquid.length > 1 ? Math.round((lo / (liquid.length - 1)) * 100) : null;
  };
  return src.map((r) => {
    const ok = fundHealthy(r.profitable, r.equity_positive, r.der, r.fund_stale);
    return {
      ...r,
      rs_rank: (r.value_20d ?? 0) >= 1e9 && r.chg126 != null ? rank(r.chg126) : null,
      fund_ok: ok == null ? null : ok ? 1 : 0,
    };
  });
}
