import AnalystCard from "../components/AnalystCard";
import { api, type LatestRow, type StockResponse, type TrackTrade } from "../api";
import { ErrorBox, FilterBadge, Loading, RiskFlags, StatusPill } from "../components/Bits";
import { useState } from "react";
import TradingViewChart, { STUDY_OPTIONS } from "../components/TradingViewChart";
import { goBack, lastDashboardHash } from "../nav";
import PositionCalc from "../components/PositionCalc";
import { useExitMode } from "../exitMode";
import PatternBadges from "../components/PatternBadges";
import Star from "../components/Star";
import FundCard, { FundStrip } from "../components/FundCard";
import { WithInfo } from "../components/Info";
import { HELP } from "../help";
import { EXIT_LABEL, fmt1, fmtDate, fmtPct, fmtPrice, fmtRp, hitsLabel, pctFrom, riskFlags, statusOf } from "../format";
import { STRATEGIES, setStrategy, useStrategy, type StrategyId, type StrategyMeta } from "../strategy";
import { useAsync } from "../useAsync";
import { shariaLabel, useSharia } from "../sharia";

function LevelStrip({ s, strategy }: { s: LatestRow; strategy: StrategyMeta }) {
  const items: Array<[string, number | null, "entry" | "sell" | "buy"]> = strategy.hasTargets
    ? [
        ["ENTRY", s.entry, "entry"],
        ["STOP LOSS", s.sl, "sell"],
        ["TP1", s.tp1, "buy"],
        ["TP2", s.tp2, "buy"],
        ["TP3", s.tp3, "buy"],
      ]
    : [
        ["ENTRY", s.entry, "entry"],
        ["STOP AWAL", s.sl, "sell"],
        [strategy.stopLabel.toUpperCase(), s.stop_now, "sell"],
        ["HARGA TERAKHIR", s.close, "buy"],
      ];
  return (
    <div className="level-strip">
      {items.map(([label, v, tone]) => (
        <div key={label} className="level-chip">
          <div className={`level-label ${tone}`}>{label}</div>
          <div className="mono strong">
            {fmtPrice(v)} {label !== "ENTRY" && <span className="dim small">{fmtPct(pctFrom(v, s.entry))}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Level panel for strategies without targets (Turtle, UT Bot, Follow Line). */
function StopPanel({ s, strategy }: { s: LatestRow; strategy: StrategyMeta }) {
  const rows: Array<[string, number | null, string]> = [
    ["Harga terakhir", s.close, "buy"],
    [strategy.stopLabel, s.stop_now, "sell"],
    ["Entry", s.entry, ""],
    ["Stop awal", s.sl, "dim"],
  ];
  return (
    <div className="ladder">
      {rows.map(([name, v, tone]) => (
        <div key={name} className="ladder-row stop-row">
          <span className={`strong ${tone}`}>{name}</span>
          <span className="mono strong num">{fmtPrice(v)}</span>
          <span className="mono dim num">{name === "Entry" ? "" : fmtPct(pctFrom(v, s.entry))}</span>
        </div>
      ))}
      <div className="ladder-foot small muted">{strategy.exitRule}</div>
    </div>
  );
}

function Ladder({ s }: { s: LatestRow }) {
  if (s.entry == null || s.sl == null) return null;
  const risk = s.entry - s.sl;
  const rows: Array<{ name: string; price: number | null; r: string; hit?: boolean; tone: string }> = [
    { name: "TP3", price: s.tp3, r: "3R", hit: !!s.tp3_hit, tone: "buy" },
    { name: "TP2", price: s.tp2, r: "2R", hit: !!s.tp2_hit, tone: "buy" },
    { name: "TP1", price: s.tp1, r: "1R", hit: !!s.tp1_hit, tone: "buy" },
    { name: "Entry", price: s.entry, r: "0R", tone: "" },
    { name: "Stop Loss", price: s.sl, r: "−1R", hit: s.trade_status === "SL", tone: "sell" },
  ];
  // insert current price in its place
  const nowIdx = rows.findIndex((x) => x.price != null && s.close != null && s.close >= x.price);
  const at = nowIdx < 0 ? rows.length : nowIdx;
  return (
    <div className="ladder">
      {rows.map((x, i) => (
        <div key={x.name}>
          {i === at && <NowRow s={s} />}
          <div className="ladder-row">
            <span className={`strong ${x.tone}`}>{x.name}</span>
            <span className="mono strong num">{fmtPrice(x.price)}</span>
            <span className="mono dim num">{x.name === "Entry" ? "" : fmtPct(pctFrom(x.price, s.entry))}</span>
            <span className="mono dim num">{x.r}</span>
            <span className={`num small ${x.hit ? (x.tone === "sell" ? "sell" : "buy") : "dim"}`}>
              {x.name === "Entry" ? "" : x.hit ? (x.tone === "sell" ? "Tersentuh ✕" : "Tercapai ✓") : "Belum"}
            </span>
          </div>
        </div>
      ))}
      {at === rows.length && <NowRow s={s} />}
      <div className="ladder-foot small muted">
        Risiko per saham Rp {fmtPrice(risk)} ({fmt1((risk / s.entry) * 100)}% dari entry) · Risk : Reward 1 : 1 / 2 / 3
      </div>
    </div>
  );
}

function NowRow({ s }: { s: LatestRow }) {
  return (
    <div className="ladder-now">
      <span>▶ Harga terakhir</span>
      <span className="mono strong">
        {fmtPrice(s.close)} <span className="dim">({fmtPct(pctFrom(s.close, s.entry))})</span>
      </span>
    </div>
  );
}

function History({ trades: all, open, strategy }: { trades: TrackTrade[]; open: LatestRow | null; strategy: StrategyMeta }) {
  const [showAll, setShowAll] = useState(false);
  const trades = showAll ? all : all.slice(0, 20);
  if (all.length === 0 && !open) {
    return <div className="state">Belum ada riwayat posisi (disimpan 3 tahun, hanya saham dengan transaksi ≥ Rp 1 M/hari).</div>;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Masuk</th>
            <th className="num">Harga masuk</th>
            <th className="num">Stop awal</th>
            {strategy.hasTargets && <th className="num">TP1 / TP2 / TP3</th>}
            {strategy.hasTargets && <th>Target kena</th>}
            <th>Keluar</th>
            <th className="num">Harga keluar</th>
            <th className="num">{strategy.hasTargets ? "Return (utuh)" : "Return bersih"}</th>
            {strategy.hasTargets && (
              <th className="num">
                <WithInfo info={HELP.exitMode}>Bertahap ⅓</WithInfo>
              </th>
            )}
            <th className="num">Lama</th>
            {strategy.hasScore && <th className="num">Score</th>}
          </tr>
        </thead>
        <tbody>
          {open && (
            <tr className="row-open">
              <td className="mono">{fmtDate(open.last_signal_date, true)}</td>
              <td className="num mono">{fmtPrice(open.entry)}</td>
              <td className="num mono sell">{fmtPrice(open.sl)}</td>
              {strategy.hasTargets && (
                <td className="num mono buy">{`${fmtPrice(open.tp1)} / ${fmtPrice(open.tp2)} / ${fmtPrice(open.tp3)}`}</td>
              )}
              {strategy.hasTargets && <td className="small">{hitsLabel(open)}</td>}
              <td>
                <StatusPill label="Masih berjalan" kind="run" />
              </td>
              <td className="num mono dim">{fmtPrice(open.close)}</td>
              <td className={`num mono ${(pctFrom(open.close, open.entry) ?? 0) >= 0 ? "buy" : "sell"}`}>
                {fmtPct(pctFrom(open.close, open.entry))}
              </td>
              {strategy.hasTargets && <td className="num mono dim">—</td>}
              <td className="num mono dim">{open.last_signal_bars} hr</td>
              {strategy.hasScore && (
                <td className="num mono dim">{open.last_signal_score == null ? "—" : Math.round(open.last_signal_score)}</td>
              )}
            </tr>
          )}
          {trades.map((t) => (
            <tr key={t.entry_date}>
              <td className="mono">{fmtDate(t.entry_date, true)}</td>
              <td className="num mono">{fmtPrice(t.entry)}</td>
              <td className="num mono sell">{fmtPrice(t.sl)}</td>
              {strategy.hasTargets && (
                <td className="num mono buy">{`${fmtPrice(t.tp1)} / ${fmtPrice(t.tp2)} / ${fmtPrice(t.tp3)}`}</td>
              )}
              {strategy.hasTargets && <td className="small">{hitsLabel(t)}</td>}
              <td>
                <StatusPill
                  label={EXIT_LABEL[t.exit_reason] ?? t.exit_reason}
                  kind={t.exit_reason === "SL" ? "sl" : t.exit_reason === "TP3" ? "done" : "exit"}
                />
                <span className="dim small"> · {fmtDate(t.exit_date)}</span>
              </td>
              <td className="num mono">{fmtPrice(t.exit_price)}</td>
              <td className={`num mono strong ${t.net_pct >= 0 ? "buy" : "sell"}`}>{fmtPct(t.net_pct)}</td>
              {strategy.hasTargets && (
                <td className={`num mono ${t.net_scaled >= 0 ? "buy" : "sell"}`}>{fmtPct(t.net_scaled)}</td>
              )}
              <td className="num mono dim">{t.bars_held} hr</td>
              {strategy.hasScore && <td className="num mono dim">{t.score == null ? "—" : Math.round(t.score)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {all.length > 20 && (
        <div className="card-foot">
          <button type="button" className="btn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Tampilkan 20 terbaru" : `Tampilkan semua (${all.length})`}
          </button>
        </div>
      )}
    </div>
  );
}

function OtherStrategies({ others, current }: { others: StockResponse["others"]; current: StrategyId }) {
  return (
    <div className="other-strats">
      <WithInfo info={HELP.otherStrategies}>
        <span className="dim small">Sinyal di semua strategi:</span>
      </WithInfo>
      {STRATEGIES.map((m) => {
        const o = others.find((x) => x.strategy === m.id);
        const side = o?.last_signal ?? null;
        return (
          <button
            key={m.id}
            type="button"
            className={`chip ${m.id === current ? "on" : ""}`}
            aria-pressed={m.id === current}
            onClick={() => setStrategy(m.id)}
            title={o?.last_signal_date ? `${side} sejak ${fmtDate(o.last_signal_date, true)}` : "belum ada sinyal"}
          >
            {m.short}{" "}
            <span className={side === "BUY" ? "buy" : side === "SELL" ? "sell" : "dim"}>
              {side ?? "—"}
              {o?.last_signal_bars != null ? ` · ${o.last_signal_bars}h` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StockTrack({ code, strategy }: { code: string; strategy: StrategyMeta }) {
  const mode = useExitMode();
  const res = useAsync(() => api.track({ s: strategy.id, period: "all", mode, code }), [code, strategy.id, mode]);
  const o = res.data?.overall;
  if (!o || o.n === 0) return null;
  const p = (v: number | null) => (v == null ? "—" : `${fmt1(v * 100)}%`);
  return (
    <div className="stock-track">
      <h2>
        <WithInfo info={HELP.stockTrack}>
          Track Record {strategy.short} · {code}
        </WithInfo>
      </h2>
      <p className="dim small">
        {strategy.short} · posisi selesai 3 tahun · {mode === "scaled" ? "ambil untung bertahap" : "dijual utuh"} · return bersih setelah biaya ±0,4%{o.n < 5 ? " · sampel masih sedikit" : ""}
      </p>
      <div className="track-mini">
        <div>
          <span className="dim small">Trade</span>
          <strong className="mono">{o.n}</strong>
        </div>
        <div>
          <span className="dim small">Win rate</span>
          <strong className="mono">{p(o.win_rate)}</strong>
        </div>
        <div>
          <span className="dim small">Rata² return</span>
          <strong className={`mono ${(o.avg_net ?? 0) >= 0 ? "buy" : "sell"}`}>{fmtPct(o.avg_net, 2)}</strong>
        </div>
        {strategy.hasTargets ? (
          <>
            <div>
              <span className="dim small">TP1 tercapai</span>
              <strong className="mono">{p(o.tp1_rate)}</strong>
            </div>
            <div>
              <span className="dim small">Kena SL</span>
              <strong className="mono">{p(o.exit_sl)}</strong>
            </div>
          </>
        ) : (
          <>
            <div>
              <span className="dim small">Median</span>
              <strong className={`mono ${(o.median ?? 0) >= 0 ? "buy" : "sell"}`}>{fmtPct(o.median, 2)}</strong>
            </div>
            <div>
              <span className="dim small">Profit factor</span>
              <strong className="mono">{o.profit_factor == null ? "—" : fmt1(o.profit_factor)}</strong>
            </div>
          </>
        )}
        <div>
          <span className="dim small">Lama posisi</span>
          <strong className="mono">{o.avg_bars == null ? "—" : `${fmt1(o.avg_bars)} hr`}</strong>
        </div>
      </div>
    </div>
  );
}

const STUDIES_KEY = "sats.studies";
function loadStudies(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STUDIES_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => STUDY_OPTIONS.some((o) => o.id === x)) : [];
  } catch {
    return [];
  }
}

function IndicatorPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="indicator-picker" role="group" aria-label="Indikator chart">
      <span className="dim small">Indikator tersimpan:</span>
      {STUDY_OPTIONS.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            className={`chip ${on ? "on" : ""}`}
            onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
          >
            {on ? "✓ " : "+ "}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function StockDetail({ code }: { code: string }) {
  const sy = useSharia();
  const [studies, setStudiesState] = useState<string[]>(loadStudies);
  const setStudies = (v: string[]) => {
    setStudiesState(v);
    try {
      localStorage.setItem(STUDIES_KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  };
  const strategy = useStrategy();
  const res = useAsync(() => api.stock(strategy.id, code), [code, strategy.id]);

  if (res.error) {
    return (
      <main className="page">
        <button type="button" className="back-btn" onClick={goBack}>
          ← Kembali
        </button>
        <ErrorBox error={res.error === "unknown code" ? `kode ${code} tidak ada di universe` : res.error} />
      </main>
    );
  }
  if (!res.data) {
    return (
      <main className="page">
        <Loading what={code} />
      </main>
    );
  }

  const s = res.data.stock;
  const isBuy = s.last_signal === "BUY";
  const st = statusOf(s, strategy.hasTargets);
  const openTrade = isBuy && s.trade_status === "ACTIVE" ? s : null;
  const calcStop = strategy.hasTargets ? s.sl : (s.stop_now ?? s.sl);

  return (
    <main className="page">
      <div className="crumb">
        <button type="button" className="back-btn" onClick={goBack}>
          ← Kembali
        </button>
        <span className="muted small">
          <a href={lastDashboardHash()}>Sinyal</a> / {code}
        </span>
      </div>
      <div className="detail-head">
        <div className="detail-title">
          <Star code={s.code} />
          <h1 className="mono">{s.code}</h1>
          <span className="muted">{s.name}</span>
          {sy[s.code] && (
            <span className="sy-badge" title={`Anggota indeks ${sy[s.code].join(", ")} (Daftar Efek Syariah)`}>
              Syariah · {shariaLabel(sy[s.code])}
            </span>
          )}
          <span className="price mono">{fmtPrice(s.close)}</span>
          <span className={`mono ${(s.change_pct ?? 0) >= 0 ? "buy" : "sell"}`}>{fmtPct(s.change_pct)}</span>
          {s.as_of_date && <span className="dim small">per {fmtDate(s.as_of_date, true)}</span>}
          {s.stale && <span className="status exit">Data tidak ter-update (suspensi / tanpa transaksi)</span>}
          <span className="dim small">
            <WithInfo info={HELP.likuiditas}>
              <span>Nilai transaksi rata² 20 hari {fmtRp(s.value_20d)}/hari</span>
            </WithInfo>
          </span>
          <RiskFlags flags={riskFlags(s)} />
          {strategy.id === "SATS" && s.last_signal === "BUY" && (
            <WithInfo info={HELP.filterBadge}>
              <FilterBadge pass={s.filter_signal} />
            </WithInfo>
          )}
        </div>
        <div className="detail-actions">
          {s.last_signal && (
            <span className={`signal-badge ${isBuy ? "buy" : "sell"}`}>
              {strategy.short} {s.last_signal}{" "}
              <span className="dim">
                · {s.last_signal_bars} hari{strategy.hasScore ? ` · score ${Math.round(s.last_signal_score ?? 0)}` : ""}
              </span>
            </span>
          )}
          <a className="btn" href={`https://www.tradingview.com/chart/?symbol=IDX:${code}`} target="_blank" rel="noreferrer">
            Buka di TradingView ↗
          </a>
        </div>
      </div>

      <FundStrip f={res.data.fundamentals ?? null} />
      <OtherStrategies others={res.data.others} current={strategy.id} />
      {res.data.patterns && (res.data.patterns.candles || res.data.patterns.chart_patterns) && (
        <div className="other-strats">
          <span className="dim small">Pola terdeteksi (5 hari):</span>
          <PatternBadges candles={res.data.patterns.candles} charts={res.data.patterns.chart_patterns} />
        </div>
      )}

      {isBuy && s.entry != null && (strategy.hasTargets || s.trade_status === "ACTIVE") && (
        <div className="card strip-card">
          <div className="strip-head">
            <WithInfo info={HELP.levelSats}>
              <span className="accent small strong">LEVEL {strategy.short.toUpperCase()}</span>
            </WithInfo>
            <span className="dim small">
              BUY {fmtDate(s.last_signal_date, true)} · <StatusPill {...st} />
            </span>
          </div>
          <LevelStrip s={s} strategy={strategy} />
        </div>
      )}

      <div className="detail-grid">
        <section className="card chart-card">
          <IndicatorPicker value={studies} onChange={setStudies} />
          <TradingViewChart code={code} studies={studies} />
          <div className="card-foot small muted">
            Chart oleh TradingView. Indikator yang dipilih di atas tersimpan di browser ini dan dimuat otomatis di semua saham.
            Pengaturan yang diubah langsung di chart (periode, warna, garis) tidak tersimpan. Indikator strategi (SATS, UT Bot, dll.) tidak bisa
            ditempel di widget, levelnya ada di atas &amp; di samping.
          </div>
        </section>
        <aside className="card side-card">
          <h2>{isBuy ? <WithInfo info={HELP.ladder}>Level Trading</WithInfo> : `Status ${strategy.short}`}</h2>
          {isBuy ? (
            <>
              {strategy.hasTargets ? (
                <Ladder s={s} />
              ) : s.trade_status === "ACTIVE" ? (
                <StopPanel s={s} strategy={strategy} />
              ) : (
                <p className="muted">Posisi dari sinyal BUY {fmtDate(s.last_signal_date, true)} sudah ditutup. Tunggu sinyal berikutnya.</p>
              )}
              {calcStop != null && s.close != null && s.trade_status === "ACTIVE" && (
                <PositionCalc price={s.close} sl={calcStop} tp1={s.tp1} tp2={s.tp2} tp3={s.tp3} />
              )}
            </>
          ) : s.last_signal === "SELL" ? (
            <p className="muted">
              Sinyal <strong className="sell">SELL</strong> sejak {fmtDate(s.last_signal_date, true)} di harga{" "}
              <span className="mono">{fmtPrice(s.entry)}</span>. Di BEI diperlakukan sebagai sinyal keluar, tunggu sinyal BUY
              berikutnya.
            </p>
          ) : (
            <p className="muted">Belum ada sinyal {strategy.short} untuk saham ini.</p>
          )}
          <FundCard f={res.data.fundamentals ?? null} sharia={sy[s.code] ?? []} />
          <StockTrack code={code} strategy={strategy} />
        </aside>
      </div>

      <AnalystCard code={code} />

      <section className="card">
        <div className="card-head">
          <h2>Riwayat Posisi {strategy.short} (3 tahun)</h2>
          <span className="muted small">{strategy.exitRule}</span>
        </div>
        <History trades={res.data.trades} open={openTrade} strategy={strategy} />
      </section>
    </main>
  );
}
