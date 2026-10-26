import { api } from "../api";
import { fmtDate, fmtPct } from "../format";
import { CatBadge } from "../pages/Owners";
import { useAsync } from "../useAsync";

const nf2 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Pemegang ≥ 1% di halaman detail saham (8 teratas), tautan ke halaman Pemegang Saham. */
export default function OwnersCard({ code }: { code: string }) {
  const data = useAsync(() => api.ownersStock(code), [code]);
  const rows = data.data?.rows ?? [];
  if (!data.data || data.data.empty || !rows.length) return null;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Pemegang saham ≥ 1%</h2>
        <span className="muted small">per {fmtDate(data.data.asOf, true)} · <a href={`#/pemegang?s=${code}`}>semua & jaringan →</a></span>
      </div>
      <div className="table-wrap">
        <table className="table compact">
          <tbody>
            {rows.slice(0, 8).map((r) => (
              <tr key={r.hkey} className="clickable" onClick={() => (window.location.hash = `#/pemegang?h=${encodeURIComponent(r.hkey)}`)}>
                <td>{r.name} <CatBadge cat={r.cat} /></td>
                <td className="num mono">{nf2.format(r.pct)}%</td>
                <td className="num mono small">
                  {r.before == null ? <span className="buy">baru</span> : Math.abs(r.pct - r.before) >= 0.005 ? <span className={r.pct > r.before ? "buy" : "sell"}>{fmtPct(r.pct - r.before, 2)}</span> : <span className="dim">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 8 && <p className="small dim pad-s">+{rows.length - 8} pemegang lain ≥ 1%</p>}
    </section>
  );
}
