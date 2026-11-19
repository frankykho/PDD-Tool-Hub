import { Fragment, useMemo, useState } from "react";
import { api, type DivConfidence, type DivListRow } from "../api";
import { ErrorBox, Loading } from "../components/Bits";
import { WithInfo } from "../components/Info";
import Star from "../components/Star";
import { fmtDate, fmtNum, fmtPct, fmtPrice } from "../format";
import { openStock } from "../nav";
import { SHARIA_INDEXES, isShariaIndex, shariaLabel, useSharia } from "../sharia";
import { useAsync } from "../useAsync";

const nf2 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const rp = (v: number | null | undefined) => (v == null ? "—" : `Rp ${nf2.format(v)}`);
const pct = (v: number | null | undefined) => (v == null ? "—" : `${nf2.format(v)}%`);
const CONF_RANK: Record<DivConfidence, number> = { tinggi: 3, sedang: 2, rendah: 1 };
const NOTE = "Keputusan dividen ditentukan RUPS. Perkiraan berdasar kebiasaan masa lalu, bukan rekomendasi.";

type Key = "est_yield" | "hist_yield" | "est_dps" | "dps_last" | "payout" | "streak" | "dps_cagr3" | "last_date" | "close" | "confidence";
const COLS: Array<{ key: Key; label: string; info: string }> = [
  { key: "close", label: "Harga", info: "Harga penutupan terakhir." },
  { key: "last_date", label: "Dividen terakhir", info: "Nominal per lembar dan tanggal ex-dividen terakhir (Yahoo Finance, sudah disesuaikan stock split). Pembeli pada atau sesudah tanggal ex tidak mendapat dividen itu." },
  { key: "dps_last", label: "DPS TB terakhir", info: "Total dividen per lembar untuk tahun buku terakhir (interim + final). Ex-date Okt–Des dihitung untuk tahun itu, Jan–Sep untuk tahun sebelumnya." },
  { key: "hist_yield", label: "Yield historis", info: "DPS tahun buku terakhir ÷ harga sekarang." },
  { key: "payout", label: "Payout", info: "Bagian laba yang dibagikan: DPS ÷ EPS tiap tahun buku, diambil median 3 tahun buku terakhir (maks. 100%) supaya dividen spesial tidak mendongkrak." },
  { key: "est_dps", label: "Perkiraan DPS", info: "Payout × EPS 12 bulan terakhir (laporan kuartal terbaru). Kosong bila perusahaan rugi atau tidak membagi dividen 2 tahun buku terakhir." },
  { key: "est_yield", label: "Perkiraan yield", info: "Perkiraan DPS ÷ harga sekarang." },
  { key: "streak", label: "Konsistensi", info: "Jumlah tahun buku berturut-turut membagi dividen (maks. 10)." },
  { key: "dps_cagr3", label: "Tumbuh 3 th", info: "Pertumbuhan DPS per tahun selama 3 tahun buku terakhir." },
  { key: "confidence", label: "Keyakinan", info: "Tinggi: ≥ 3 tahun berturut-turut dan payout stabil (selisih ≤ 30 poin). Sedang: ≥ 2 tahun. Rendah: selebihnya, atau ada ≥ 3 pembagian dalam satu tahun buku (pembagian bisa masuk tahun buku yang salah)." },
];

function sortVal(r: DivListRow, k: Key): number | string | null {
  if (k === "confidence") return r.confidence ? CONF_RANK[r.confidence] : null;
  return r[k] ?? null;
}

function History({ code }: { code: string }) {
  const h = useAsync(() => api.dividendHistory(code), [code]);
  if (h.error) return <ErrorBox error={h.error} />;
  if (!h.data) return <Loading what={`riwayat dividen ${code}`} />;
  const { years, payments } = h.data.history;
  return (
    <div className="div-hist">
      <table className="table compact">
        <thead>
          <tr>
            <th>Tahun buku</th>
            <th className="num">DPS</th>
            <th className="num">EPS</th>
            <th className="num">Payout</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y.fy}>
              <td>{y.fy}</td>
              <td className="num mono">{y.dps ? rp(y.dps) : <span className="dim">—</span>}</td>
              <td className="num mono">{rp(y.eps)}</td>
              <td className="num mono">{pct(y.payout)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <div className="small muted">Ex-date &amp; nominal</div>
        <ul className="div-pay">
          {payments.map((p) => (
            <li key={p.date}>
              <span className="mono">{fmtDate(p.date, true)}</span> <b className="mono">{rp(p.amount)}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Dividends() {
  const data = useAsync(() => api.dividends(), []);
  const indices = useAsync(() => api.indices(), []);
  const sy = useSharia();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState("");
  const [minConf, setMinConf] = useState(0);
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "est_yield", dir: "desc" });
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const term = q.trim().toUpperCase();
    const list = (data.data?.rows ?? []).filter(
      (r) =>
        (!term || r.code.includes(term) || r.name.toUpperCase().includes(term)) &&
        (!index || (isShariaIndex(index) ? sy[r.code]?.includes(index) : (r.indexes ?? "").split(",").includes(index))) &&
        (!minConf || (r.confidence ? CONF_RANK[r.confidence] : 0) >= minConf),
    );
    const m = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const x = sortVal(a, sort.key);
      const y = sortVal(b, sort.key);
      if (x == null || y == null) return x == null ? (y == null ? a.code.localeCompare(b.code) : 1) : -1; // kosong selalu di bawah
      return (x < y ? -1 : x > y ? 1 : 0) * m || a.code.localeCompare(b.code);
    });
  }, [data.data, q, index, minConf, sort, sy]);
  const shown = showAll ? rows : rows.slice(0, 100);
  const clickHead = (key: Key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Dividen</h1>
          <p className="muted">
            Riwayat dividen 10 tahun dan perkiraan dividen berikutnya dari laporan keuangan terakhir
            {data.data?.asOf && <> · data per {fmtDate(data.data.asOf, true)} · diperbarui tiap Sabtu</>}
          </p>
        </div>
      </div>

      <section className="card pad">
        <div className="screener-bar">
          <div className="select">
            <label htmlFor="dv-q">Cari</label>
            <input id="dv-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kode / nama" />
          </div>
          <div className="select">
            <label htmlFor="dv-index">Indeks</label>
            <select id="dv-index" value={index} onChange={(e) => setIndex(e.target.value)}>
              <option value="">Semua saham</option>
              {(indices.data?.rows ?? []).map((r) => (
                <option key={r.index_code} value={r.index_code}>
                  {r.name}
                </option>
              ))}
              <optgroup label="Syariah">
                {SHARIA_INDEXES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="select">
            <label htmlFor="dv-conf">Keyakinan</label>
            <select id="dv-conf" value={minConf} onChange={(e) => setMinConf(Number(e.target.value))}>
              <option value={0}>Semua</option>
              <option value={2}>Sedang ke atas</option>
              <option value={3}>Tinggi</option>
            </select>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            {fmtNum(rows.length)} saham <span className="muted small">pembagi dividen</span>
          </h2>
          <span className="muted small">Klik judul kolom untuk mengurutkan · klik baris untuk riwayat</span>
        </div>
        {data.error ? (
          <ErrorBox error={data.error} />
        ) : !data.data ? (
          <Loading what="dividen" />
        ) : data.data.rows.length === 0 ? (
          <div className="state">Data dividen belum tersedia (diperbarui tiap Sabtu).</div>
        ) : rows.length === 0 ? (
          <div className="state">Tidak ada saham yang cocok dengan filter.</div>
        ) : (
          <div className="table-wrap div-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Saham</th>
                  {COLS.map((c) => {
                    const on = sort.key === c.key;
                    return (
                      <th key={c.key} className="num">
                        <WithInfo info={c.info}>
                          <button type="button" className={`th-sort ${on ? "on" : ""}`} onClick={() => clickHead(c.key)} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                            {c.label}
                            {on ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </WithInfo>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <Fragment key={r.code}>
                    <tr className="clickable" onClick={() => setOpen((o) => (o === r.code ? null : r.code))} aria-expanded={open === r.code}>
                      <td>
                        <Star code={r.code} />
                        <button type="button" className="code linkish" onClick={(e) => (e.stopPropagation(), openStock(r.code))} title="Buka halaman saham">
                          {r.code}
                        </button>
                        {sy[r.code] && (
                          <span className="sy-badge" title={`Saham syariah: anggota ${sy[r.code].join(", ")}`}>
                            {shariaLabel(sy[r.code])}
                          </span>
                        )}
                        <div className="dim small ellipsis" title={r.name}>
                          {r.name}
                        </div>
                      </td>
                      <td className="num mono">{fmtPrice(r.close)}</td>
                      <td className="num mono">
                        {rp(r.last_amount)}
                        <div className="dim small">{fmtDate(r.last_date, true)}</div>
                      </td>
                      <td className="num mono">
                        {r.dps_last ? rp(r.dps_last) : <span className="dim">—</span>}
                        <div className="dim small">{`TB ${r.fy_last}`}</div>
                      </td>
                      <td className="num mono">{pct(r.hist_yield)}</td>
                      <td className="num mono">{pct(r.payout)}</td>
                      <td className="num mono">
                        {rp(r.est_dps)}
                        {r.est_dps != null && r.est_paid > 0 && <div className="dim small">interim sudah {rp(r.est_paid)}</div>}
                      </td>
                      <td className="num mono">
                        <b>{pct(r.est_yield)}</b>
                      </td>
                      <td className="num mono">{`${r.streak} th`}</td>
                      <td className={`num mono ${r.dps_cagr3 == null ? "" : r.dps_cagr3 >= 0 ? "buy" : "sell"}`}>{fmtPct(r.dps_cagr3)}</td>
                      <td className="num">{r.confidence ? <span className={`pill small div-conf ${r.confidence}`}>{r.confidence}</span> : <span className="dim">—</span>}</td>
                    </tr>
                    {open === r.code && (
                      <tr className="div-open">
                        <td colSpan={COLS.length + 1}>
                          <History code={r.code} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 100 && (
          <div className="card-foot">
            <button type="button" className="btn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Tampilkan 100 teratas" : `Tampilkan semua (${fmtNum(rows.length)})`}
            </button>
          </div>
        )}
      </section>

      <p className="dim small">
        {`${NOTE} Sumber: Yahoo Finance. Nominal lama sudah disesuaikan stock split, jadi bisa berbeda dari pengumuman saat itu. ` +
          "Tahun buku dianggap berakhir Desember; emiten dengan tahun buku lain bisa bergeser satu tahun. Dividen spesial ikut terhitung di riwayat."}
      </p>
    </main>
  );
}
