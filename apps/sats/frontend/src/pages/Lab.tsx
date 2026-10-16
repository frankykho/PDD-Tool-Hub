import { useState } from "react";
import { api, type LabRow } from "../api";
import { ErrorBox, Loading } from "../components/Bits";
import Info, { WithInfo } from "../components/Info";
import { fmt1, fmtDate, fmtNum, fmtPct } from "../format";
import { useAsync } from "../useAsync";

const H = [5, 10, 20, 60, "stop"] as const;
type Horizon = (typeof H)[number];
const tone = (v: number | null | undefined) => (v == null ? "" : v > 0 ? "buy" : v < 0 ? "sell" : "");

const KINDS = [
  { id: "all", label: "Semua" },
  { id: "preset", label: "Preset screener" },
  { id: "candle", label: "Pola candle" },
  { id: "chart", label: "Pola chart" },
  { id: "combo", label: "Kombinasi" },
  { id: "sats", label: "SATS" },
] as const;

const VERDICT: Record<LabRow["verdict"], { label: string; cls: string; help: string }> = {
  teruji: { label: "✓ Teruji", cls: "ok", help: "Minimal 100 sinyal, rata-rata ≥ 0,5% lebih baik dari pasar dalam 10 hari, dan konsisten di ≥ 2 dari 3 tahun." },
  netral: { label: "Netral", cls: "", help: "Hasilnya tidak beda jauh dari membeli saham likuid sembarang. Tidak memberi keunggulan." },
  berlawanan: { label: "✗ Kalah", cls: "bad", help: "Rata-rata ≥ 0,5% LEBIH BURUK dari pasar dalam 10 hari (untuk pola bearish: harga justru naik). Jangan diandalkan." },
  data_kurang: { label: "Data kurang", cls: "dim", help: "Kurang dari 100 sinyal dalam 3 tahun — belum bisa disimpulkan." },
};

const pick = (r: LabRow, h: Horizon) => {
  const k = h === "stop" ? "S" : String(h) as "5" | "10" | "20" | "60";
  return { n: r[`n${k}`] ?? 0, win: r[`win${k}`], avg: r[`avg${k}`], med: r[`med${k}`], ex: r[`ex${k}`], tr: r[`tr${k}`] };
};

export default function Lab() {
  const lab = useAsync(() => api.lab(), []);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("all");
  const [h, setH] = useState<Horizon>(10);
  const hLabel = h === "stop" ? "maks. 60 hari dengan stop loss" : `${h} hari`;
  const rule =
    h === "stop"
      ? "beli di harga open besok; jual saat turun 8% (stop loss), saat harga tutup di bawah MA50, atau paling lambat hari ke-60"
      : `beli di harga open besok, jual di close hari ke-${h}`;
  const [onlyGood, setOnlyGood] = useState(false);

  if (lab.error) return <main className="page"><ErrorBox error={lab.error} /></main>;
  if (!lab.data) return <main className="page"><Loading what="hasil laboratorium" /></main>;

  const all = lab.data.rows;
  const base = all.find((r) => r.id === "baseline");
  const tests = all.filter((r) => r.id !== "baseline");
  if (!base || !tests.length) {
    return (
      <main className="page">
        <h1>Laboratorium uji</h1>
        <div className="card state">
          Belum ada hasil. Jalankan sekali di GitHub: Actions → <b>Laboratorium uji (mingguan)</b> → Run workflow (± 15 menit). Setelah itu
          diperbarui otomatis tiap Sabtu.
        </div>
      </main>
    );
  }

  // bearish patterns are judged by how much they UNDERperform, so sort by "edge in the expected direction"
  const edge = (r: LabRow) => (pick(r, h).ex ?? -99) * (r.expect === "down" ? -1 : 1);
  const rows = tests
    .filter((r) => kind === "all" || r.kind === kind)
    .filter((r) => !onlyGood || r.verdict === "teruji")
    .sort((a, b) => (a.verdict === "data_kurang" ? 1 : 0) - (b.verdict === "data_kurang" ? 1 : 0) || edge(b) - edge(a));
  const b = pick(base, h);
  const count = (v: LabRow["verdict"]) => tests.filter((r) => r.verdict === v).length;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Laboratorium uji</h1>
          <p className="muted">
            Seberapa bagus preset & pola ini di saham BEI, {fmtDate(base.period_from, true)} s/d sekarang · diperbarui{" "}
            {fmtDate(base.updated_at.slice(0, 10), true)}
          </p>
        </div>
      </div>

      <section className="kpis">
        <div className="card kpi">
          <div className="kpi-label">
            <WithInfo info="Hasil membeli SEMUA saham likuid (≥ Rp 1 M/hari) setiap hari, sudah dipotong biaya 0,4%. Ini patokannya: preset/pola baru berguna kalau hasilnya lebih baik dari angka ini.">
              Pembanding: semua saham likuid
            </WithInfo>
          </div>
          <div className={`kpi-value ${tone(b.avg)}`}>{fmtPct(b.avg, 2)}</div>
          <div className="kpi-sub">rata-rata {hLabel} · menang {fmt1(b.win)}% · {fmtNum(b.n)} sampel</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Teruji di BEI</div>
          <div className="kpi-value buy">{count("teruji")}</div>
          <div className="kpi-sub">dari {tests.length} preset & pola</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Kalah dari pasar</div>
          <div className="kpi-value sell">{count("berlawanan")}</div>
          <div className="kpi-sub">hindari sebagai alasan beli</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Netral / data kurang</div>
          <div className="kpi-value">{count("netral") + count("data_kurang")}</div>
          <div className="kpi-sub">tidak memberi keunggulan jelas</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div className="market-filters">
            <div className="segmented" role="group" aria-label="Jenis">
              {KINDS.map((k) => (
                <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                  {k.label}
                </button>
              ))}
            </div>
            <div className="segmented" role="group" aria-label="Lama pegang">
              {H.map((x) => (
                <button key={x} type="button" aria-pressed={h === x} onClick={() => setH(x)}>
                  {x === "stop" ? "60 hari + stop" : `${x} hari`}
                </button>
              ))}
            </div>
            <label className="small">
              <input type="checkbox" checked={onlyGood} onChange={(e) => setOnlyGood(e.target.checked)} /> Hanya yang teruji
            </label>
            <span className="dim small">Label ✓/✗ dihitung dari hasil 10 hari</span>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Preset / pola</th>
                <th>Hasil</th>
                <th className="num">
                  <WithInfo info="Berapa kali sinyal BARU muncul di saham likuid selama 3 tahun.">Sinyal</WithInfo>
                </th>
                <th className="num">
                  <WithInfo info={`Persentase sinyal yang untung (${rule}; dipotong biaya 0,4%).`}>Menang</WithInfo>
                </th>
                <th className="num">
                  <WithInfo info={`Rata-rata hasil per sinyal (${hLabel}), sudah dipotong biaya.`}>Rata-rata</WithInfo>
                </th>
                <th className="num">
                  <WithInfo info="Rata-rata hasil DIKURANGI hasil pasar (semua saham likuid) di hari yang sama. Ini angka terpenting: positif = lebih baik dari beli sembarang saham.">
                    vs pasar
                  </WithInfo>
                </th>
                <th className="num">
                  <WithInfo info="Nilai tengah hasil per sinyal. Kalau rata-rata positif tapi median negatif, untungnya datang dari sedikit saham yang naik besar.">Median</WithInfo>
                </th>
                <th className="num">
                  <WithInfo info="Hasil vs pasar setelah 10 sinyal TERBAIK dibuang. Kalau masih positif, keunggulannya tidak bergantung pada beberapa saham 'roket' saja.">Tanpa 10 terbaik</WithInfo>
                </th>
                <th className="num">
                  <WithInfo info="Hasil vs pasar (selalu 10 hari, dasar label Teruji/Kalah) per tahun: tahun ke-1 (paling lama), ke-2, ke-3 (terbaru). Pola yang bagus konsisten, bukan cuma untung di satu tahun.">
                    Per tahun
                  </WithInfo>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const x = pick(r, h);
                const v = VERDICT[r.verdict];
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="strong">{r.name}</span>
                      <div className="dim small">
                        {r.kind === "preset" ? "Preset screener" : r.kind === "candle" ? "Pola candle" : r.kind === "combo" ? "Kombinasi" : r.kind === "sats" ? "Sinyal SATS v1.9" : "Pola chart"}
                        {r.expect === "down" ? " · pola bearish (bagus kalau harga turun)" : ""}
                      </div>
                    </td>
                    <td>
                      <span className={`lab-verdict ${v.cls}`}>{v.label}</span>
                      <Info label={`Arti ${v.label}`}>{v.help}</Info>
                    </td>
                    <td className="num mono">{fmtNum(x.n)}</td>
                    <td className="num mono">{x.win == null ? "—" : `${fmt1(x.win)}%`}</td>
                    <td className={`num mono ${tone(x.avg)}`}>{fmtPct(x.avg, 2)}</td>
                    <td className={`num mono strong ${tone(x.ex)}`}>{fmtPct(x.ex, 2)}</td>
                    <td className={`num mono ${tone(x.med)}`}>{fmtPct(x.med, 2)}</td>
                    <td className={`num mono ${tone(x.tr)}`}>{fmtPct(x.tr, 2)}</td>
                    <td className="num mono small">
                      {[r.y1, r.y2, r.y3].map((y, i) => (
                        <span key={i} className={`lab-year ${tone(y)}`}>{y == null ? "—" : fmtPct(y, 1)}</span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="small dim">
        Cara uji: setiap kali preset/pola MULAI terpenuhi di saham likuid (≥ Rp 1 M/hari, harga ≥ 50), dianggap beli di harga open hari
        berikutnya lalu dijual setelah 5/10/20/60 hari bursa, dipotong biaya 0,4%. Pilihan "60 hari + stop": keluar saat turun 8%, saat tutup di bawah MA50, atau hari ke-60. Sinyal SATS diuji dengan aturan yang sama (bukan TP/SL SATS) supaya bisa dibandingkan. Preset fundamental tidak diuji
        karena data fundamental masa lalu tidak tersedia (hasilnya akan bias); sinyal SATS sudah diuji di Track Record. Hasil masa lalu
        tidak menjamin hasil ke depan.
      </p>
    </main>
  );
}
