import { useState } from "react";
import { api } from "../api";
import { fmt1, fmtDate, fmtNum } from "../format";
import { FLOW_INFO } from "../pages/Flow";
import { WithInfo } from "./Info";
import { useAsync } from "../useAsync";

/** Detail saham: lot per transaksi harian (spike disorot) + HAKA/HAKI per level harga hari terakhir. */
export default function FlowCard({ code }: { code: string }) {
  const data = useAsync(() => api.flowStock(code), [code]);
  const [hover, setHover] = useState<number | null>(null);
  const series = data.data?.series ?? [];
  const levels = data.data?.levels?.rows ?? [];
  if (!data.data || data.data.empty || (!series.length && !levels.length)) return null;

  const W = 640, H = 150, pad = 4;
  const max = Math.max(1, ...series.map((s) => s.avg_lot ?? 0));
  const bw = series.length ? (W - pad * 2) / series.length : 0;
  const cur = series[hover ?? series.length - 1];
  const top = [...levels].sort((a, b) => b[1] + b[2] - (a[1] + a[2])).slice(0, 14).sort((a, b) => b[0] - a[0]);
  const lmax = Math.max(1, ...top.map((l) => Math.max(l[1], l[2])));
  return (
    <section className="card">
      <div className="card-head">
        <h2><WithInfo info={FLOW_INFO}>Frequency Analyzer</WithInfo></h2>
        <span className="muted small"><a href="#/frekuensi">semua saham →</a></span>
      </div>
      <div className="flow-grid">
        <div>
          {cur && (
            <div className="small flow-read">
              <span className="dim">{fmtDate(cur.date, true)}</span> · lot/trx <b className="mono">{fmt1(cur.avg_lot)}</b>
              {cur.ratio != null && <> · <b className={`mono ${cur.spike ? "accent" : ""}`}>{fmt1(cur.ratio)}×</b> biasa</>}
              {" "}· frek <span className="mono">{fmtNum(cur.freq)}</span> · HAKA <span className="mono">{cur.haka == null ? "—" : `${Math.round(cur.haka * 100)}%`}</span>
              {cur.foreign_net != null && <> · asing <span className={`mono ${cur.foreign_net >= 0 ? "buy" : "sell"}`}>{fmtNum(cur.foreign_net)} lot</span></>}
              <span className="dim"> · {cur.source === "idx" ? "BEI" : "IPOT"}</span>
            </div>
          )}
          <svg viewBox={`0 0 ${W} ${H}`} className="flow-bars" role="img" aria-label="Lot per transaksi harian" onMouseLeave={() => setHover(null)}>
            {series.map((s, i) => {
              const h = ((s.avg_lot ?? 0) / max) * (H - 10);
              return (
                <rect key={s.date} x={pad + i * bw + 1} y={H - h} width={Math.max(1, bw - 2)} height={h}
                  className={s.spike ? "flow-spike" : "flow-bar"} opacity={hover == null || hover === i ? 1 : 0.5}
                  onMouseEnter={() => setHover(i)} />
              );
            })}
          </svg>
          <div className="dim small">
            {series.length < 11 ? `Baru ${series.length} hari data; spike dihitung setelah 10 hari pembanding.` : "Batang terang = spike (≥ 2× median 20 hari)."}
          </div>
        </div>
        {top.length > 0 && (
          <div>
            <div className="small flow-read">
              HAKA <span className="buy">■</span> / HAKI <span className="sell">■</span> per harga · {fmtDate(data.data.levels?.date, true)}
            </div>
            <div className="flow-levels">
              {top.map((l) => (
                <div key={l[0]} className="flow-level" title={`Rp ${fmtNum(l[0])}: HAKA ${fmtNum(l[1])} lot (${fmtNum(l[3])}×), HAKI ${fmtNum(l[2])} lot (${fmtNum(l[4])}×)`}>
                  <span className="flow-l"><i style={{ width: `${(l[2] / lmax) * 100}%` }} /></span>
                  <span className="mono small">{fmtNum(l[0])}</span>
                  <span className="flow-r"><i style={{ width: `${(l[1] / lmax) * 100}%` }} /></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
