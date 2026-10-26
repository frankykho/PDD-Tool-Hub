import { useMemo, useState } from "react";
import { api } from "../api";
import { ErrorBox, Loading } from "../components/Bits";
import { WithInfo } from "../components/Info";
import IdxUpload from "../components/IdxUpload";
import Star from "../components/Star";
import { fmt1, fmtDate, fmtNum, fmtPct, fmtPrice, fmtRp } from "../format";
import { openStock } from "../nav";
import { useAsync } from "../useAsync";

const VALUE_OPTIONS: Array<[number, string]> = [
  [0, "Semua"],
  [1, "≥ Rp 1 M/hari"],
  [5, "≥ Rp 5 M/hari"],
  [20, "≥ Rp 20 M/hari"],
];
type View = "spike_side" | "spike" | "all";

export const FLOW_INFO =
  "Frequency Analyzer: volume dibanding frekuensi transaksi. Lot per transaksi yang jauh di atas biasanya (spike) berarti banyak order besar, " +
  "sering dibaca sebagai akumulasi pemain besar, terutama saat saham sideways. HAKA = lot yang terjadi di harga offer (pembeli agresif), " +
  "HAKI = di harga bid (penjual agresif). Data dikumpulkan tiap hari setelah pasar tutup sejak Okt 2026; belum diuji di Lab Uji (perlu ±3 bulan data).";

export default function Flow() {
  const [reload, setReload] = useState(0);
  const data = useAsync(() => api.flowToday(), [reload]);
  const me = useAsync(() => api.me(), []);
  const admin = !!me.data?.isAdmin;
  const [view, setView] = useState<View>("spike_side");
  const [minValue, setMinValue] = useState(1);
  const [hakaOnly, setHakaOnly] = useState(false);
  const rows = useMemo(() => {
    const list = (data.data?.rows ?? []).filter(
      (r) =>
        (r.value_20d ?? 0) >= minValue * 1e9 &&
        (view === "all" || (r.spike && (view === "spike" || r.sideways))) &&
        (!hakaOnly || (r.haka ?? 0) >= 0.6),
    );
    return list.sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || (b.avg_lot ?? 0) - (a.avg_lot ?? 0));
  }, [data.data, view, minValue, hakaOnly]);

  if (data.error) return <main className="page"><ErrorBox error={data.error} /></main>;
  if (!data.data) return <main className="page"><Loading what="frekuensi" /></main>;
  const d = data.data;
  const days = d.days ?? 0;
  const warming = days <= 10;
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1><WithInfo info={FLOW_INFO}>Frequency Analyzer</WithInfo></h1>
          <p className="muted">
            Lot per transaksi & HAKA/HAKI harian {d.date && <>· data per {fmtDate(d.date, true)}</>} · {days} hari bursa tersimpan · klik saham untuk detail
          </p>
        </div>
      </div>

      {admin && <IdxUpload onDone={() => setReload((x) => x + 1)} />}
      {d.empty ? (
        <section className="card pad"><p>Belum ada data. Pengumpulan berjalan tiap hari bursa setelah pasar tutup (±16.45 WIB){admin ? ", atau unggah Ringkasan Saham BEI di atas" : ""}.</p></section>
      ) : (
        <>
          {warming && (
            <section className="card pad pat-note">
              <p className="small">
                Deteksi spike butuh minimal 10 hari bursa pembanding (sekarang {days} hari, termasuk hari ini). Sampai itu, pilih "Semua" untuk
                melihat lot per transaksi dan HAKA/HAKI hari ini.
              </p>
            </section>
          )}
          <section className="card pat-filters">
            <div className="segmented" role="group" aria-label="Tampilan">
              <button type="button" aria-pressed={view === "spike_side"} onClick={() => setView("spike_side")}>Spike + sideways</button>
              <button type="button" aria-pressed={view === "spike"} onClick={() => setView("spike")}>Semua spike</button>
              <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")}>Semua</button>
            </div>
            <div className="select">
              <label htmlFor="fl-value">Transaksi min.</label>
              <select id="fl-value" value={minValue} onChange={(e) => setMinValue(Number(e.target.value))}>
                {VALUE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <label className="small muted own-toggle"><input type="checkbox" checked={hakaOnly} onChange={(e) => setHakaOnly(e.target.checked)} /> HAKA ≥ 60%</label>
            <span className="small dim">
              spike = lot/transaksi ≥ {d.spike ?? 2}× median 20 hari · sideways = perubahan 20 hari ±8% & Bollinger ≤ 15%
            </span>
          </section>
          <section className="card">
            <div className="card-head"><h2>{fmtNum(rows.length)} saham</h2><span className="muted small">urut dari rasio tertinggi</span></div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th />
                    <th>Saham</th>
                    <th className="num">Harga</th>
                    <th className="num">1 hari</th>
                    <th className="num">Frekuensi</th>
                    <th className="num">Lot</th>
                    <th className="num">Lot/trx</th>
                    <th className="num"><WithInfo info="Lot per transaksi hari ini dibagi median 20 hari sebelumnya.">× biasa</WithInfo></th>
                    <th className="num"><WithInfo info="Porsi lot yang terjadi di harga offer (pembeli agresif).">HAKA</WithInfo></th>
                    <th className="num"><WithInfo info="Beli − jual asing hari itu (lot). Hanya ada bila Ringkasan Saham BEI tanggal itu sudah diunggah.">Asing</WithInfo></th>
                    <th>Sideways</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 300).map((r) => (
                    <tr key={r.code} className="clickable" onClick={() => openStock(r.code)}>
                      <td><Star code={r.code} /></td>
                      <td className="wrap"><b className="mono">{r.code}</b> <span className="dim small">{r.name}</span></td>
                      <td className="num mono">{fmtPrice(r.close)}</td>
                      <td className={`num mono ${(r.chg1 ?? 0) >= 0 ? "buy" : "sell"}`}>{fmtPct(r.chg1)}</td>
                      <td className="num mono">{fmtNum(r.freq)}</td>
                      <td className="num mono">{fmtNum(r.lot)}</td>
                      <td className="num mono">{fmt1(r.avg_lot)}</td>
                      <td className={`num mono ${r.spike ? "accent" : ""}`}>{r.ratio == null ? "—" : `${fmt1(r.ratio)}×`}</td>
                      <td className={`num mono ${(r.haka ?? 0.5) >= 0.6 ? "buy" : (r.haka ?? 0.5) <= 0.4 ? "sell" : ""}`}>{r.haka == null ? "—" : `${Math.round(r.haka * 100)}%`}</td>
                      <td className={`num mono ${(r.foreign_net ?? 0) > 0 ? "buy" : (r.foreign_net ?? 0) < 0 ? "sell" : "dim"}`}>{r.foreign_net == null ? "—" : fmtNum(r.foreign_net)}</td>
                      <td className="small">{r.sideways ? <span className="buy">✓</span> : <span className="dim">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="state">Tidak ada saham yang cocok{warming && view !== "all" ? " (deteksi spike belum aktif)" : ""}.</p>}
          </section>
          <p className="small dim">
            {FLOW_INFO} Nilai transaksi untuk filter: rata-rata 20 hari ({fmtRp(1e9)} = 1 M). Sumber: Ringkasan Saham BEI (diunggah admin; papan reguler) bila ada, selain itu done summary IPOT (tidak resmi). HAKA/HAKI hanya dari IPOT.
          </p>
        </>
      )}
    </main>
  );
}
