import { useEffect, useMemo, useRef, useState } from "react";
import { api, type LatestRow } from "../api";
import { ErrorBox, FilterBadge, GradeBadge, Loading, PositionBar, RiskFlags, SidePill, StatusPill } from "../components/Bits";
import { fmtDate, fmtNum, fmtPct, fmtPrice, fundHealthy, pctFrom, riskFlags, statusOf } from "../format";
import { useAsync } from "../useAsync";
import { useStrategy, type StrategyMeta } from "../strategy";
import StrategyPicker from "../components/StrategyPicker";
import PatternBadges from "../components/PatternBadges";
import Star from "../components/Star";
import { useWatchlist } from "../watchlist";
import { parseCandles, parseCharts, patternMeta } from "../screener/patternMeta";
import { WithInfo } from "../components/Info";
import { HELP } from "../help";
import { dashboardParams, openStock, replaceDashboardParams, saveDashboardScroll, savedDashboardScroll } from "../nav";

type SideFilter = "ALL" | "BUY" | "SELL";
const AGE_OPTIONS: Array<[number, string]> = [
  [0, "Hari ini (baru)"],
  [1, "≤ 1 hari"],
  [3, "≤ 3 hari"],
  [5, "≤ 5 hari"],
  [10, "≤ 10 hari"],
  [20, "≤ 20 hari"],
];

function Kpi(props: {
  label: string;
  value: string;
  sub: string;
  tone?: "buy" | "sell";
  onClick?: () => void;
  active?: boolean;
  info?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="kpi-label">{props.info ? <WithInfo info={props.info}>{props.label}</WithInfo> : props.label}</div>
      <div className={`kpi-value ${props.tone ?? ""}`}>{props.value}</div>
      <div className="kpi-sub">{props.sub}</div>
    </>
  );
  // div + role=button (not <button>) because the card contains the info button.
  return props.onClick ? (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={props.active}
      className={`card kpi kpi-button ${props.active ? "active" : ""}`}
      onClick={props.onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClick?.();
        }
      }}
    >
      {body}
    </div>
  ) : (
    <div className="card kpi">{body}</div>
  );
}

function Level({ value, base, tone, label }: { value: number | null; base: number | null; tone: "buy" | "sell"; label: string }) {
  if (value == null) return <td className="num muted" data-label={label}>—</td>;
  return (
    <td className="num" data-label={label}>
      <div className={`mono ${tone}`}>{fmtPrice(value)}</div>
      <div className="mono dim small">{fmtPct(pctFrom(value, base))}</div>
    </td>
  );
}

function SignalRowView({ r, strategy }: { r: LatestRow; strategy: StrategyMeta }) {
  const st = statusOf(r, strategy.hasTargets);
  const isBuy = r.last_signal === "BUY";
  const open = () => openStock(r.code);
  return (
    <tr className="clickable" onClick={open}>
      <td className="cell-stock">
        <Star code={r.code} />
        <a
          href={`#/saham/${r.code}`}
          className="code"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            open();
          }}
        >
          {r.code}
        </a>
        <div className="dim small ellipsis" title={r.name}>
          {r.name}
        </div>
        <RiskFlags flags={riskFlags(r)} />
        {(r.candles || r.chart_patterns) && (
          <div className="row-patterns">
            <PatternBadges candles={r.candles} charts={r.chart_patterns} max={2} maxDays={2} />
          </div>
        )}
      </td>
      <td data-label="Sinyal">
        <SidePill side={r.last_signal} />
        {r.last_signal === "BUY" && <GradeBadge row={r} />}
        {strategy.id === "SATS" && r.last_signal === "BUY" && (
          <div className="cand-under">
            <FilterBadge pass={r.filter_signal} />
          </div>
        )}
      </td>
      <td data-label="Umur">
        <div className="small">{r.last_signal_bars === 0 ? "Hari ini" : `${r.last_signal_bars} hari`}</div>
        <div className="dim small">{fmtDate(r.last_signal_date)}</div>
      </td>
      <td className="num" data-label="Harga">
        <div className="mono strong">{fmtPrice(r.close)}</div>
        <div className={`mono small ${(r.change_pct ?? 0) >= 0 ? "buy" : "sell"}`}>{fmtPct(r.change_pct)}</div>
      </td>
      <td className="num mono" data-label="Entry">{fmtPrice(r.entry)}</td>
      {strategy.hasTargets ? (
        isBuy ? (
          <>
            <Level value={r.sl} base={r.entry} tone="sell" label="Stop loss" />
            <Level value={r.tp1} base={r.entry} tone="buy" label="TP1" />
            <Level value={r.tp2} base={r.entry} tone="buy" label="TP2" />
            <Level value={r.tp3} base={r.entry} tone="buy" label="TP3" />
            <td className="posbar-cell" data-label="Posisi SL → TP3">
              <PositionBar close={r.close} sl={r.sl} tp3={r.tp3} />
            </td>
          </>
        ) : (
          <td colSpan={5} className="dim small cell-wide">
            Harga keluar {fmtPrice(r.entry)} · tunggu sinyal BUY berikutnya
          </td>
        )
      ) : isBuy && r.trade_status === "ACTIVE" ? (
        <>
          <Level value={r.stop_now} base={r.close} tone="sell" label="Stop" />
          <td className="num" data-label="Sejak entry">
            <div className={`mono strong ${pctFrom(r.close, r.entry) != null && (pctFrom(r.close, r.entry) ?? 0) >= 0 ? "buy" : "sell"}`}>
              {fmtPct(pctFrom(r.close, r.entry))}
            </div>
            <div className="dim small">sejak entry</div>
          </td>
        </>
      ) : isBuy ? (
        <td colSpan={2} className="dim small cell-wide">
          Posisi sudah ditutup {r.trade_status === "SL" ? "karena kena stop" : ""} · tunggu sinyal berikutnya
        </td>
      ) : (
        <td colSpan={2} className="dim small cell-wide">
          Harga keluar {fmtPrice(r.entry)} · tunggu sinyal BUY berikutnya
        </td>
      )}
      {strategy.hasScore && (
        <td className="num mono dim" data-label="Score">{r.last_signal_score == null ? "—" : Math.round(r.last_signal_score)}</td>
      )}
      <td data-label="Status">
        <StatusPill {...st} />
      </td>
    </tr>
  );
}

/** Bullish candle (≤ 2 days) or bullish chart pattern present. */
export const hasBullishPattern = (r: LatestRow) =>
  parseCandles(r.candles).some((c) => c.days <= 2 && patternMeta(c.id)?.bias === "bull") ||
  parseCharts(r.chart_patterns).some((c) => patternMeta(c.id)?.bias === "bull");

const INDEX_KEY = "sats.index";
const loadIndex = () => {
  try {
    return localStorage.getItem(INDEX_KEY) ?? "";
  } catch {
    return "";
  }
};

export default function Dashboard() {
  // Filters live in the URL (#/?side=BUY&age=0&index=LQ45) so Back restores them.
  const initial = useMemo(() => dashboardParams(), []);
  // Table (compact, all levels in columns) or cards (one tile per stock); remembered per browser
  const [view, setViewState] = useState<"table" | "cards">(() => {
    try {
      return localStorage.getItem("sats.view") === "cards" ? "cards" : "table";
    } catch {
      return "table";
    }
  });
  const setView = (v: "table" | "cards") => {
    setViewState(v);
    try {
      localStorage.setItem("sats.view", v);
    } catch {
      /* ignore */
    }
  };
  const [side, setSide] = useState<SideFilter>(() => {
    const v = (initial.get("side") ?? "ALL").toUpperCase();
    return v === "BUY" || v === "SELL" ? v : "ALL";
  });
  const [maxAge, setMaxAge] = useState(() => {
    const v = Number(initial.get("age"));
    return AGE_OPTIONS.some(([a]) => a === v) && initial.has("age") ? v : 5;
  });
  const [index, setIndexState] = useState(() => initial.get("index") ?? loadIndex());
  const [safeOnly, setSafeOnly] = useState(() => initial.get("safe") === "1");
  const [bullPatternOnly, setBullPatternOnly] = useState(() => initial.get("pb") === "1");
  const [fundOnly, setFundOnly] = useState(() => initial.get("fh") === "1");
  const [watchOnly, setWatchOnly] = useState(() => initial.get("wl") === "1");
  const watch = useWatchlist();
  const setIndex = (v: string) => {
    setIndexState(v);
    try {
      localStorage.setItem(INDEX_KEY, v);
    } catch {
      /* private mode: ignore */
    }
  };
  useEffect(() => {
    replaceDashboardParams({
      side: side === "ALL" ? "" : side,
      age: maxAge === 5 ? "" : String(maxAge),
      index,
      safe: safeOnly ? "1" : "",
      pb: bullPatternOnly ? "1" : "",
      fh: fundOnly ? "1" : "",
      wl: watchOnly ? "1" : "",
    });
  }, [side, maxAge, index, safeOnly, bullPatternOnly, fundOnly, watchOnly]);

  // Remember scroll position while on the dashboard; restore it once when coming back.
  useEffect(() => {
    let t = 0;
    const onScroll = () => {
      clearTimeout(t);
      t = window.setTimeout(() => saveDashboardScroll(window.scrollY), 100);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const indices = useAsync(() => api.indices(), []);
  const strategy = useStrategy();
  const summary = useAsync(() => api.summary(strategy.id, index), [strategy.id, index]);
  const signals = useAsync(() => api.signals(strategy.id, side, maxAge, index), [strategy.id, side, maxAge, index]);
  const events = useAsync(() => api.events(strategy.id, index), [strategy.id, index]);
  const indexRows = indices.data?.rows ?? [];
  const activeIndex = indexRows.find((r) => r.index_code === index);

  const restored = useRef(false);
  useEffect(() => {
    if (!restored.current && signals.data) {
      restored.current = true;
      const y = savedDashboardScroll();
      if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [signals.data]);

  const allRows = signals.data?.rows ?? [];
  const visibleRows = allRows
    .filter((r) => !safeOnly || riskFlags(r).length === 0)
    .filter((r) => !bullPatternOnly || hasBullishPattern(r))
    .filter((r) => !fundOnly || fundHealthy(r.f_profitable, r.f_equity_positive, r.f_der, r.f_stale) === true)
    .filter((r) => !watchOnly || watch.has(r.code));
  const hiddenCount = allRows.length - visibleRows.length;

  const s = summary.data;
  const eventRows = useMemo(() => events.data?.rows ?? [], [events.data]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Sinyal {strategy.short}</h1>
          <p className="muted">
            Pemindaian EOD {s ? `${fmtNum(s.stocks)} saham` : "saham"} {activeIndex ? `anggota ${activeIndex.name}` : "BEI"} ·
            Daily · {strategy.name}
            {s && <> · data per {fmtDate(s.asOf, true)}</>}
          </p>
        </div>
        <div className="head-controls">
        <StrategyPicker />
        <div className="select index-select">
          <WithInfo info={HELP.filterIndeks}>
            <label htmlFor="f-filterindeks">Indeks</label>
          </WithInfo>
          <select id="f-filterindeks" value={index} onChange={(e) => setIndex(e.target.value)}>
            <option value="">Semua saham</option>
            {indexRows.map((r) => (
              <option key={r.index_code} value={r.index_code}>
                {r.name} ({r.member_count})
              </option>
            ))}
            {index && !activeIndex && indices.data && <option value={index}>{index} (tidak tersedia)</option>}
          </select>
        </div>
        </div>
      </div>
      {s?.market && strategy.id === "SATS_F" && (
        <div className={`market-banner ${s.market.above ? "up" : "down"}`}>
          <WithInfo info={HELP.market}>
            <strong>{s.market.above ? "Filter pasar TERBUKA" : "Filter pasar TERTUTUP"}</strong>
          </WithInfo>
          <span>
            IHSG {fmtNum(s.market.ihsg_close)} {s.market.above ? "di atas" : "di bawah"} MA200 ({fmtNum(s.market.ihsg_ma200)}) per{" "}
            {fmtDate(s.market.as_of_date, true)}.
            {s.market.above
              ? " BUY SATS + filter aktif untuk saham yang juga di atas MA200."
              : " SATS + filter tidak memberi BUY baru sampai IHSG kembali di atas MA200."}
          </span>
        </div>
      )}
      {activeIndex?.effective && <div className="dim small index-note">{activeIndex.name}: periode {activeIndex.effective}</div>}

      {summary.error ? (
        <ErrorBox error={summary.error} />
      ) : (
        <section className="kpis">
          <Kpi
            label="Sinyal BUY baru"
            info={HELP.kpiBuy}
            value={s ? fmtNum(s.buy_today) : "…"}
            sub="muncul di hari bursa terakhir · klik untuk lihat"
            tone="buy"
            active={side === "BUY" && maxAge === 0}
            onClick={() => {
              setSide("BUY");
              setMaxAge(0);
            }}
          />
          <Kpi
            label="Sinyal SELL baru"
            info={HELP.kpiSell}
            value={s ? fmtNum(s.sell_today) : "…"}
            sub="muncul di hari bursa terakhir · klik untuk lihat"
            tone="sell"
            active={side === "SELL" && maxAge === 0}
            onClick={() => {
              setSide("SELL");
              setMaxAge(0);
            }}
          />
          <Kpi
            label="Posisi BUY masih aktif"
            info={HELP.kpiActive}
            value={s ? fmtNum(s.buy_active) : "…"}
            sub={s ? `dari ${fmtNum(s.in_buy_phase)} saham di fase BUY` : ""}
          />
          {strategy.hasTargets ? (
            <Kpi
              label="Target / Stop Loss tersentuh"
              info={HELP.kpiEvents}
              value={s ? `${fmtNum(s.tp_today)} / ${fmtNum(s.sl_today)}` : "…"}
              sub="TP1–TP3 vs SL, hari bursa terakhir"
            />
          ) : (
            <Kpi
              label="Saham di fase keluar"
              info={HELP.kpiOut}
              value={s ? fmtNum(s.in_sell_phase) : "…"}
              sub="sinyal terakhir SELL / EXIT"
            />
          )}
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Sinyal Terbaru &amp; Level Trading</h2>
          <div className="segmented view-toggle" role="group" aria-label="Tampilan">
            <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>
              ☰ Tabel
            </button>
            <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}>
              ▦ Kartu
            </button>
          </div>
          <div className="filters">
            <div className="segmented" role="group" aria-label="Filter sinyal">
              {(["ALL", "BUY", "SELL"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={side === v} onClick={() => setSide(v)}>
                  {v === "ALL" ? "Semua" : v}
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={watchOnly} onChange={(e) => setWatchOnly(e.target.checked)} />
              <span>★ Watchlist ({watch.codes.length})</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={fundOnly} onChange={(e) => setFundOnly(e.target.checked)} />
              <WithInfo info={HELP.fundOk}>
                <span>Fundamental sehat</span>
              </WithInfo>
            </label>
            <label className="check">
              <input type="checkbox" checked={bullPatternOnly} onChange={(e) => setBullPatternOnly(e.target.checked)} />
              <WithInfo info={HELP.bullPattern}>
                <span>Ada pola bullish</span>
              </WithInfo>
            </label>
            <label className="check">
              <input type="checkbox" checked={safeOnly} onChange={(e) => setSafeOnly(e.target.checked)} />
              <WithInfo info={HELP.filterRisk}>
                <span>Sembunyikan sinyal berisiko</span>
              </WithInfo>
            </label>
            <div className="select">
              <WithInfo info={HELP.filterUmur}>
                <label htmlFor="f-filterumur">Umur sinyal</label>
              </WithInfo>
              <select id="f-filterumur" value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))}>
                {AGE_OPTIONS.map(([a, label]) => (
                  <option key={a} value={a}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {signals.error ? (
          <ErrorBox error={signals.error} />
        ) : !signals.data ? (
          <Loading what="sinyal" />
        ) : visibleRows.length === 0 ? (
          <div className="state">Tidak ada sinyal dengan filter ini.</div>
        ) : (
          <div className="table-wrap">
            <table className={`table signals-table ${view === "cards" ? "as-cards" : ""}`}>
              <thead>
                <tr>
                  <th>Saham</th>
                  <th>Sinyal</th>
                  <th>
                    <WithInfo info={HELP.colUmur}>Umur</WithInfo>
                  </th>
                  <th className="num">
                    <WithInfo info={HELP.colHarga}>Harga</WithInfo>
                  </th>
                  <th className="num">
                    <WithInfo info={HELP.colEntry}>Entry</WithInfo>
                  </th>
                  {strategy.hasTargets ? (
                    <>
                      <th className="num">
                        <WithInfo info={HELP.colSlLevel}>Stop Loss</WithInfo>
                      </th>
                      <th className="num">
                        <WithInfo info={HELP.colTp}>TP1</WithInfo>
                      </th>
                      <th className="num">TP2</th>
                      <th className="num">TP3</th>
                      <th>
                        <WithInfo info={HELP.colPosisi}>Posisi SL → TP3</WithInfo>
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="num">
                        <WithInfo info={HELP.stopNow[strategy.id as "TURTLE" | "UTBOT" | "FOLLOW10"]}>{strategy.stopLabel}</WithInfo>
                      </th>
                      <th className="num">
                        <WithInfo info={HELP.colSinceEntry}>Hasil berjalan</WithInfo>
                      </th>
                    </>
                  )}
                  {strategy.hasScore && (
                    <th className="num">
                      <WithInfo info={HELP.colScore}>Score</WithInfo>
                    </th>
                  )}
                  <th>
                    <WithInfo info={HELP.colStatus}>Status</WithInfo>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <SignalRowView key={r.code} r={r} strategy={strategy} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-foot muted small">
          {signals.data && (
            <>
              {fmtNum(visibleRows.length)} saham
              {hiddenCount > 0 && <> ({fmtNum(hiddenCount)} disembunyikan oleh filter)</>}
              {maxAge > 0 && <> (sinyal hari ini + {maxAge} hari bursa sebelumnya)</>} ·{" "}
            </>
          )}
          {strategy.hasTargets ? "SL = pivot terakhir ± 2×ATR · TP = 1R / 2R / 3R dari entry · " : `${strategy.exitRule} · `}
          SELL diperlakukan sebagai sinyal keluar · ⚠ = nilai transaksi &lt; Rp 1 M/hari, stop &gt; 15%, atau harga &lt; Rp 50
        </div>
      </section>

      {strategy.hasTargets && (
      <section className="card">
        <div className="card-head">
          <h2>{strategy.hasTargets ? "Target & Stop Loss Tersentuh" : "Stop Tersentuh"}</h2>
          <span className="muted small">{events.data ? fmtDate(events.data.asOf, true) : ""}</span>
        </div>
        {events.error ? (
          <ErrorBox error={events.error} />
        ) : !events.data ? (
          <Loading what="kejadian" />
        ) : eventRows.length === 0 ? (
          <div className="state">Tidak ada TP/SL yang tersentuh di hari bursa terakhir.</div>
        ) : (
          <ul className="events">
            {eventRows.map((r) => (
              <li key={r.code}>
                <a
                  href={`#/saham/${r.code}`}
                  className="code"
                  onClick={(e) => {
                    e.preventDefault();
                    openStock(r.code);
                  }}
                >
                  {r.code}
                </a>
                <span className={`status ${r.event_today?.includes("SL") ? "sl" : "tp"}`}>
                  {r.event_today?.replace(/,/g, " · ")} {r.event_today?.includes("SL") ? "✕" : "✓"}
                </span>
                <span className="mono">{fmtPrice(r.close)}</span>
                <span className="dim small">
                  {r.last_signal} {fmtDate(r.last_signal_date)} · entry {fmtPrice(r.entry)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </main>
  );
}
