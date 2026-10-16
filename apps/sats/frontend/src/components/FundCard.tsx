import type { Fundamentals } from "../api";
import { fmt1, fmtDate, fmtPct, fmtRp, fundHealthy } from "../format";

const x = (v: number | null) => (v == null ? "—" : `${fmt1(v)}×`);
const p = (v: number | null) => (v == null ? "—" : `${fmt1(v)}%`);

/** Fundamental summary for the stock page. */
export default function FundCard({ f }: { f: Fundamentals | null }) {
  if (!f) {
    return (
      <div className="fund-card">
        <h2>Fundamental</h2>
        <p className="dim small">Data fundamental belum tersedia untuk saham ini.</p>
      </div>
    );
  }
  const ok = fundHealthy(f.profitable, f.equity_positive, f.der, f.stale);
  const items: Array<[string, string, string?]> = [
    ["Kapitalisasi", fmtRp(f.market_cap)],
    ["PER", f.profitable === 0 ? "rugi" : x(f.per)],
    ["PBV", x(f.pbv)],
    ["ROE", p(f.roe), f.roe == null ? "" : f.roe >= 15 ? "buy" : f.roe < 0 ? "sell" : ""],
    ["DER", f.der == null ? "— (bank/NA)" : x(f.der), f.der != null && f.der > 2 ? "sell" : ""],
    ["Dividend yield", p(f.div_yield)],
    ["Pendapatan YoY", f.rev_growth == null ? "—" : fmtPct(f.rev_growth), f.rev_growth == null ? "" : f.rev_growth >= 0 ? "buy" : "sell"],
    ["Laba YoY", f.eps_growth == null ? "—" : fmtPct(f.eps_growth), f.eps_growth == null ? "" : f.eps_growth >= 0 ? "buy" : "sell"],
  ];
  return (
    <div className="fund-card">
      <h2>
        Fundamental{" "}
        {ok != null && (
          <span className={`status ${ok ? "tp" : "sl"}`} title="Untung, ekuitas positif, DER ≤ 2 (bank dikecualikan), laporan ≤ 9 bulan">
            {ok ? "Sehat" : "Perlu dicek"}
          </span>
        )}
      </h2>
      <p className="dim small">
        {[f.sector, f.industry].filter(Boolean).join(" · ") || "Sektor tidak diketahui"} · laporan s/d{" "}
        {f.last_quarter ? fmtDate(f.last_quarter, true) : "—"}
        {f.stale ? " (lama)" : ""}
        {f.currency && f.currency !== "IDR" ? ` · laporan dalam ${f.currency}, dikonversi ke Rupiah` : ""}
      </p>
      <div className="track-mini">
        {items.map(([label, value, tone]) => (
          <div key={label}>
            <span className="dim small">{label}</span>
            <strong className={`mono ${tone ?? ""}`}>{value}</strong>
          </div>
        ))}
      </div>
      <p className="dim small">Sumber: Yahoo Finance, diperbarui mingguan. Dividen bisa termasuk dividen spesial.</p>
    </div>
  );
}

/** One-line fundamental summary for the top of the stock page. */
export function FundStrip({ f }: { f: Fundamentals | null }) {
  if (!f) {
    return (
      <div className="fund-strip">
        <span className="dim small">Fundamental: belum tersedia (diperbarui setiap Sabtu)</span>
      </div>
    );
  }
  const ok = fundHealthy(f.profitable, f.equity_positive, f.der, f.stale);
  const parts: Array<[string, string, string?]> = [
    ["PER", f.profitable === 0 ? "rugi" : x(f.per), f.profitable === 0 ? "sell" : ""],
    ["PBV", x(f.pbv)],
    ["ROE", p(f.roe), f.roe == null ? "" : f.roe >= 15 ? "buy" : f.roe < 0 ? "sell" : ""],
    ["DER", f.der == null ? "—" : x(f.der), f.der != null && f.der > 2 ? "sell" : ""],
    ["Div", p(f.div_yield)],
    ["Laba YoY", f.eps_growth == null ? "—" : fmtPct(f.eps_growth), f.eps_growth == null ? "" : f.eps_growth >= 0 ? "buy" : "sell"],
    ["Kap.", fmtRp(f.market_cap)],
  ];
  return (
    <div className="fund-strip">
      <span className="dim small">Fundamental</span>
      {ok != null && <span className={`status ${ok ? "tp" : "sl"}`}>{ok ? "Sehat" : "Perlu dicek"}</span>}
      {parts.map(([k, v, tone]) => (
        <span key={k} className="fund-item">
          <span className="dim small">{k}</span> <strong className={`mono ${tone ?? ""}`}>{v}</strong>
        </span>
      ))}
      {f.sector && <span className="dim small">· {f.sector}</span>}
    </div>
  );
}
