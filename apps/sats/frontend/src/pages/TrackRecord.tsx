import { useMemo, useState } from "react";
import { api, type TrackAgg } from "../api";
import { ErrorBox, Loading } from "../components/Bits";
import { fmt1, fmtDate, fmtNum, fmtPct } from "../format";
import { openStock } from "../nav";
import { useAsync } from "../useAsync";
import { WithInfo } from "../components/Info";
import { HELP } from "../help";
import { STRATEGIES, setStrategy, useStrategy, type StrategyId } from "../strategy";
import StrategyPicker from "../components/StrategyPicker";
import { setExitMode, useExitMode } from "../exitMode";
import type { CompareRow } from "../api";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${fmt1(v * 100)}%`);
const tone = (v: number | null | undefined) => (v == null ? "" : v > 0 ? "buy" : v < 0 ? "sell" : "");

function Kpi({ label, value, sub, cls, info }: { label: string; value: string; sub?: string; cls?: string; info?: React.ReactNode }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{info ? <WithInfo info={info}>{label}</WithInfo> : label}</div>
      <div className={`kpi-value ${cls ?? ""}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function ExitBar({ a }: { a: TrackAgg }) {
  const parts: Array<[string, number | null, string]> = [
    ["Sinyal SELL", a.exit_sell, "exit-sell"],
    ["Kena SL", a.exit_sl, "exit-sl"],
    ["TP3", a.exit_tp3, "exit-tp3"],
    ["Timeout", a.exit_timeout, "exit-timeout"],
  ];
  return (
    <div>
      <div className="exitbar" role="img" aria-label="Cara posisi ditutup">
        {parts.map(([label, v, cls]) =>
          v ? <div key={label} className={cls} style={{ width: `${v * 100}%` }} title={`${label} ${pct(v)}`} /> : null,
        )}
      </div>
      <div className="exitbar-legend">
        {parts.map(([label, v, cls]) => (
          <span key={label}>
            <i className={cls} /> {label} <strong>{pct(v)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function AggRow({ label, a, onClick }: { label: React.ReactNode; a: TrackAgg; onClick?: () => void }) {
  return (
    <tr className={onClick ? "clickable" : undefined} onClick={onClick}>
      <td>{label}</td>
      <td className="num mono">{fmtNum(a.n)}</td>
      <td className="num mono">{pct(a.win_rate)}</td>
      <td className={`num mono strong ${tone(a.avg_net)}`}>{fmtPct(a.avg_net, 2)}</td>
      <td className="num mono buy">{fmtPct(a.avg_win)}</td>
      <td className="num mono sell">{fmtPct(a.avg_loss)}</td>
      <td className="num mono">{pct(a.tp1_rate)}</td>
      <td className="num mono">{pct(a.exit_sl)}</td>
      <td className="num mono dim">{a.avg_bars == null ? "—" : fmt1(a.avg_bars)}</td>
    </tr>
  );
}

function AggHead({ first }: { first: string }) {
  return (
    <thead>
      <tr>
        <th>{first}</th>
        <th className="num"><WithInfo info={HELP.colTrade}>Trade</WithInfo></th>
        <th className="num"><WithInfo info={HELP.winRate}>Win rate</WithInfo></th>
        <th className="num"><WithInfo info={HELP.rataReturn}>Rata² return</WithInfo></th>
        <th className="num"><WithInfo info={HELP.colUntung}>Rata² untung</WithInfo></th>
        <th className="num"><WithInfo info={HELP.colRugi}>Rata² rugi</WithInfo></th>
        <th className="num"><WithInfo info={HELP.tp1}>TP1 tercapai</WithInfo></th>
        <th className="num"><WithInfo info={HELP.colSl}>Kena SL</WithInfo></th>
        <th className="num"><WithInfo info={HELP.colLama}>Lama (hari)</WithInfo></th>
      </tr>
    </thead>
  );
}

const BINS = ["< −20%", "−20 s/d −10", "−10 s/d −5", "−5 s/d 0", "0 s/d 5", "5 s/d 10", "10 s/d 20", "20 s/d 50", "> 50%"];

function Histogram({ bins, total }: { bins: Array<{ bin: number; n: number }>; total: number }) {
  const counts = BINS.map((_, i) => bins.find((b) => b.bin === i)?.n ?? 0);
  const max = Math.max(1, ...counts);
  return (
    <div className="histo" role="img" aria-label="Sebaran return per trade">
      {counts.map((c, i) => (
        <div key={BINS[i]} className="histo-col">
          <div className="histo-pct mono small">{total ? `${fmt1((c / total) * 100)}%` : ""}</div>
          <div className="histo-track">
            <div className={`histo-bar ${i < 4 ? "neg" : "pos"}`} style={{ height: `${(c / max) * 100}%` }} />
          </div>
          <div className="histo-label small dim">{BINS[i]}</div>
        </div>
      ))}
    </div>
  );
}

function CompareTable({ rows, current }: { rows: CompareRow[] | null; current: StrategyId }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>
          <WithInfo info={HELP.compare}>Perbandingan strategi</WithInfo>
        </h2>
        <span className="muted small">Filter periode, indeks, transaksi & harga yang sama · klik baris untuk memilih strategi</span>
      </div>
      {!rows ? (
        <Loading what="perbandingan" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Strategi</th>
                <th className="num">
                  <WithInfo info={HELP.colTrade}>Trade</WithInfo>
                </th>
                <th className="num">
                  <WithInfo info={HELP.winRate}>Win rate</WithInfo>
                </th>
                <th className="num">
                  <WithInfo info={HELP.rataReturn}>Rata² return</WithInfo>
                </th>
                <th className="num">
                  <WithInfo info={HELP.median}>Median</WithInfo>
                </th>
                <th className="num">Tanpa 1% terbaik</th>
                <th className="num">
                  <WithInfo info={HELP.profitFactor}>Profit factor</WithInfo>
                </th>
                <th className="num">
                  <WithInfo info={HELP.colLama}>Lama (hari)</WithInfo>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = STRATEGIES.find((m) => m.id === r.strategy);
                return (
                  <tr
                    key={r.strategy}
                    className={`clickable ${r.strategy === current ? "row-current" : ""}`}
                    onClick={() => setStrategy(r.strategy as StrategyId)}
                  >
                    <td className="strong">{meta?.name ?? r.name}</td>
                    <td className="num mono">{fmtNum(r.n)}</td>
                    <td className="num mono">{pct(r.win_rate)}</td>
                    <td className={`num mono strong ${tone(r.avg_net)}`}>{fmtPct(r.avg_net, 2)}</td>
                    <td className={`num mono ${tone(r.median)}`}>{fmtPct(r.median, 2)}</td>
                    <td className={`num mono ${tone(r.avg_ex_top1)}`}>{fmtPct(r.avg_ex_top1, 2)}</td>
                    <td className={`num mono ${r.profit_factor == null ? "" : r.profit_factor >= 1 ? "buy" : "sell"}`}>
                      {r.profit_factor == null ? "—" : fmt1(r.profit_factor)}
                    </td>
                    <td className="num mono dim">{r.avg_bars == null ? "—" : fmt1(r.avg_bars)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type SortKey = "avg_net" | "win_rate" | "n";

export default function TrackRecord() {
  const strategy = useStrategy();
  const mode = useExitMode();
  const [period, setPeriod] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [index, setIndex] = useState("");
  const [minValue, setMinValue] = useState(0);
  const [minPrice, setMinPrice] = useState(0);
  const [sort, setSort] = useState<SortKey>("avg_net");
  const [showAll, setShowAll] = useState(false);
  const indices = useAsync(() => api.indices(), []);
  const scoreFilter = strategy.hasScore ? minScore : 0;
  const res = useAsync(
    () => api.track({ s: strategy.id, period, mode, minScore: scoreFilter, index, minValue, minPrice }),
    [strategy.id, period, mode, scoreFilter, index, minValue, minPrice],
  );
  const cmp = useAsync(
    () => api.compare({ period, mode, index, minValue, minPrice }),
    [period, mode, index, minValue, minPrice],
  );

  const stocks = useMemo(() => {
    const rows = [...(res.data?.stocks ?? [])];
    rows.sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity));
    return rows;
  }, [res.data, sort]);

  const o = res.data?.overall;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Track Record {strategy.short}</h1>
          <p className="muted">
            Hasil semua posisi BUY yang sudah selesai
            {res.data && (
              <>
                {" "}
                {fmtDate(res.data.since, true)} – {fmtDate(res.data.until, true)}
              </>
            )}{" "}
            · {mode === "scaled" ? "ambil untung bertahap ⅓ di TP1–TP3" : "posisi dijual utuh saat keluar"} · sudut pandang
            beli-saja (long only) · return bersih setelah perkiraan biaya {res.data ? fmt1(res.data.feePct) : "0,4"}%
          </p>
        </div>
        <div className="filters">
          <StrategyPicker />
          <div className="select">
            <WithInfo info={HELP.exitMode}>
              <span>Cara keluar</span>
            </WithInfo>
            <div className="segmented" role="group" aria-label="Cara keluar">
              <button type="button" aria-pressed={mode === "whole"} onClick={() => setExitMode("whole")}>
                Utuh
              </button>
              <button type="button" aria-pressed={mode === "scaled"} onClick={() => setExitMode("scaled")}>
                Bertahap ⅓
              </button>
            </div>
          </div>
          <div className="select">
            <WithInfo info={HELP.period}>
              <label htmlFor="f-periode">Periode</label>
            </WithInfo>
            <select id="f-periode" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="all">3 tahun (semua)</option>
              <option value="before">Sebelum 12 bulan terakhir (pembentukan)</option>
              <option value="recent">12 bulan terakhir (uji)</option>
            </select>
          </div>
          <div className="select">
            <WithInfo info={HELP.indeks}>
              <label htmlFor="f-indeks">Indeks</label>
            </WithInfo>
            <select id="f-indeks" value={index} onChange={(e) => setIndex(e.target.value)}>
              <option value="">Semua saham</option>
              {(indices.data?.rows ?? []).map((r) => (
                <option key={r.index_code} value={r.index_code}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="select">
            <WithInfo info={HELP.transaksiMin}>
              <label htmlFor="f-transaksimin">Transaksi min.</label>
            </WithInfo>
            <select id="f-transaksimin" value={minValue} onChange={(e) => setMinValue(Number(e.target.value))}>
              <option value={0}>Semua</option>
              <option value={1}>≥ Rp 1 M/hari</option>
              <option value={5}>≥ Rp 5 M/hari</option>
              <option value={20}>≥ Rp 20 M/hari</option>
              <option value={100}>≥ Rp 100 M/hari</option>
            </select>
          </div>
          <div className="select">
            <WithInfo info={HELP.hargaMin}>
              <label htmlFor="f-hargamin">Harga min.</label>
            </WithInfo>
            <select id="f-hargamin" value={minPrice} onChange={(e) => setMinPrice(Number(e.target.value))}>
              <option value={0}>Semua</option>
              <option value={50}>≥ Rp 50</option>
              <option value={200}>≥ Rp 200</option>
              <option value={500}>≥ Rp 500</option>
            </select>
          </div>
          {strategy.hasScore && (
          <div className="select">
            <WithInfo info={HELP.scoreMin}>
              <label htmlFor="f-scoremin">Score min.</label>
            </WithInfo>
            <select id="f-scoremin" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
              {[0, 10, 20, 30, 40].map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "Semua" : `≥ ${v}`}
                </option>
              ))}
            </select>
          </div>
          )}
        </div>
      </div>

      <CompareTable rows={cmp.data?.rows ?? null} current={strategy.id} />

      {res.error ? (
        <ErrorBox error={res.error} />
      ) : !res.data || !o ? (
        <Loading what="track record" />
      ) : o.n === 0 ? (
        <div className="card state">
          Belum ada data trade. Jalankan workflow <strong>EOD SATS</strong> sekali dengan opsi <strong>full</strong> untuk mengisi
          riwayat 5 tahun.
        </div>
      ) : (
        <>
          <section className="kpis kpis-5">
            <Kpi
              info={HELP.jumlahTrade}
              label="Jumlah trade"
              value={fmtNum(o.n)}
              sub={`rata-rata ${o.avg_bars == null ? "—" : fmt1(o.avg_bars)} hari bursa`}
            />
            <Kpi
              label="Win rate"
              info={HELP.winRate}
              value={pct(o.win_rate)}
              sub={`profit factor ${o.profit_factor == null ? "—" : fmt1(o.profit_factor).replace(/,0$/, "")}`}
            />
            <Kpi
              info={HELP.rataReturn}
              label="Rata-rata return / trade"
              value={fmtPct(o.avg_net, 2)}
              sub={`untung ${fmtPct(o.avg_win)} · rugi ${fmtPct(o.avg_loss)}`}
              cls={tone(o.avg_net)}
            />
            <Kpi
              info={HELP.median}
              label="Median return / trade"
              value={fmtPct(o.median, 2)}
              sub={`rata-rata tanpa 1% trade terbaik: ${fmtPct(o.avg_ex_top1, 2)}`}
              cls={tone(o.median)}
            />
            {strategy.hasTargets ? (
              <Kpi label="TP1 tercapai" info={HELP.tp1} value={pct(o.tp1_rate)} sub={`TP2 ${pct(o.tp2_rate)} · TP3 ${pct(o.tp3_rate)}`} />
            ) : (
              <Kpi label="Kena stop" info={HELP.colSl} value={pct(o.exit_sl)} sub="posisi ditutup oleh stop" />
            )}
          </section>

          <section className="card pad">
            <h2>
              <WithInfo info={HELP.histogram}>Sebaran return per trade</WithInfo>
            </h2>
            <p className="dim small">
              Rata-rata yang jauh di atas median berarti hasil ditopang sedikit trade yang untung sangat besar.
            </p>
            <Histogram bins={res.data.histogram} total={o.n} />
          </section>

          <section className="card pad">
            <h2>
              <WithInfo info={HELP.caraTutup}>Cara posisi ditutup</WithInfo>
            </h2>
            <ExitBar a={o} />
          </section>

          {strategy.hasScore && (
          <section className="card">
            <div className="card-head">
              <h2>
              <WithInfo info={HELP.perScore}>Berdasarkan score sinyal</WithInfo>
            </h2>
              <span className="muted small">Apakah score tinggi memberi hasil lebih baik?</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <AggHead first="Score" />
                <tbody>
                  {res.data.buckets.map((b) => (
                    <AggRow key={b.bucket} label={<span className="mono">{b.bucket}</span>} a={b} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          )}

          <section className="card">
            <div className="card-head">
              <h2>
              <WithInfo info={HELP.perTahun}>Per tahun</WithInfo>
            </h2>
              <span className="muted small">Berdasarkan tanggal masuk posisi</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <AggHead first="Tahun" />
                <tbody>
                  {res.data.byYear.map((y) => (
                    <AggRow key={y.year} label={<span className="mono">{y.year}</span>} a={y} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>
              <WithInfo info={HELP.perSaham}>Per saham</WithInfo>
            </h2>
              <div className="filters">
                <span className="muted small">minimal 5 trade · {fmtNum(stocks.length)} saham</span>
                <div className="segmented" role="group" aria-label="Urutkan">
                  {(
                    [
                      ["avg_net", "Return"],
                      ["win_rate", "Win rate"],
                      ["n", "Jumlah"],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <AggHead first="Saham" />
                <tbody>
                  {(showAll ? stocks : stocks.slice(0, 25)).map((s) => (
                    <AggRow
                      key={s.code}
                      a={s}
                      onClick={() => openStock(s.code)}
                      label={
                        <>
                          <span className="code">{s.code}</span>
                          <div className="dim small ellipsis">{s.name}</div>
                        </>
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {stocks.length > 25 && (
              <div className="card-foot">
                <button type="button" className="btn" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Tampilkan 25 teratas" : `Tampilkan semua (${fmtNum(stocks.length)})`}
                </button>
              </div>
            )}
          </section>

          <section className="card pad small muted method">
            <h2>Metodologi</h2>
            <p>
              Masuk di harga penutupan hari sinyal BUY. Keluar mengikuti aturan tiap strategi. SATS: kejadian pertama antara Stop
              Loss, TP3, sinyal SELL, atau 100 hari bursa. Turtle: stop 2×ATR atau penutupan di bawah harga terendah 10 hari. UT Bot
              dan Follow Line: di harga penutupan saat sinyal SELL/EXIT (sesuai script). Riwayat disimpan 3 tahun, hanya untuk saham
              dengan nilai transaksi ≥ Rp 1 M/hari saat masuk. Jika harga membuka di bawah SL
              atau di atas TP3 (gap), dianggap keluar di harga pembukaan. Filter nilai transaksi memakai rata-rata 20 hari saat posisi dibuka. Tidak ada ambil untung sebagian di TP1/TP2; kolom "TP1
              tercapai" hanya mencatat apakah level itu sempat tersentuh. Biaya beli + jual diperkirakan {fmt1(res.data.feePct)}%.
              Kinerja masa lalu tidak menjamin hasil di masa depan.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
