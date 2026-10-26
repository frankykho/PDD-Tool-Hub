import type { ReactNode } from "react";
import { api, type LatestRow, type ScreenerRow } from "../api";
import { ErrorBox, GradeBadge, gradeOf, Loading } from "../components/Bits";
import PatternBadges from "../components/PatternBadges";
import Star from "../components/Star";
import { WithInfo } from "../components/Info";
import { fmt1, fmtDate, fmtNum, fmtPct, fmtPrice, fundHealthy } from "../format";
import { openStock } from "../nav";
import { parseCandles, parseCharts, patternMeta } from "../screener/patternMeta";
import { useAsync } from "../useAsync";
import { useWatchlist } from "../watchlist";
import { setStrategy } from "../strategy";
import LabBadge from "../components/LabBadge";
import { presetById, withRsRank } from "../screener/presets";

const gradeRank = (r: Parameters<typeof gradeOf>[0]) => { const g = gradeOf(r); return g === "A+" ? 2 : g === "A" ? 1 : 0; };
const LIQUID = 1e9; // Rp 1 M/day
const tone = (v: number | null | undefined) => (v == null ? "" : v > 0 ? "buy" : v < 0 ? "sell" : "");

const bullish = (candles: string | null, charts: string | null) =>
  parseCandles(candles).some((c) => c.days <= 2 && patternMeta(c.id)?.bias === "bull") ||
  parseCharts(charts).some((c) => patternMeta(c.id)?.bias === "bull");

/** Card with a short list of stocks. */
function Block(props: { title: string; info: ReactNode; count: number; empty: string; children: ReactNode; more?: string; onMore?: () => void; badge?: ReactNode }) {
  return (
    <section className="card today-block">
      <div className="card-head">
        <h2>
          <WithInfo info={props.info}>{props.title}</WithInfo> <span className="muted small">{props.count}</span> {props.badge}
        </h2>
        {props.more && (
          <a className="small" href={props.more} onClick={props.onMore}>
            Lihat semua →
          </a>
        )}
      </div>
      {props.count === 0 ? <div className="state">{props.empty}</div> : <ul className="today-list">{props.children}</ul>}
    </section>
  );
}

/** Volume blow-off / gap up on volume: both lost to the market in the lab test (buying the next open = buying the top). */
const spikeOf = (r: ScreenerRow | undefined) =>
  !!r && (((r.vol_ratio ?? 0) >= 3 && (r.chg1 ?? 0) > 0) || ((r.gap_pct ?? 0) > 0 && (r.body_pct ?? 0) > 0 && (r.vol_ratio ?? 0) >= 2));

function SpikeWarn() {
  return (
    <span className="spike-warn" title="Lonjakan volume / gap naik bervolume hari ini. Di Lab Uji, membeli besok paginya rata-rata KALAH dari pasar (sering sudah di puncak). Tunggu harga tenang dulu.">
      ⚠ lonjakan volume
    </span>
  );
}

function Item(props: { code: string; name: string; price: number | null; chg: number | null; right?: ReactNode; sub?: ReactNode; warn?: boolean; grade?: ReactNode }) {
  return (
    <li className="clickable" onClick={() => openStock(props.code)}>
      <div className="today-main">
        <Star code={props.code} />
        <span className="code">{props.code}</span>
        {props.grade}
        <span className="dim small ellipsis">{props.name}</span>
        {props.warn && <SpikeWarn />}
      </div>
      <div className="today-right">
        <span className="mono">{fmtPrice(props.price)}</span>
        <span className={`mono small ${tone(props.chg)}`}>{fmtPct(props.chg)}</span>
        {props.right}
      </div>
      {props.sub && <div className="today-sub">{props.sub}</div>}
    </li>
  );
}

export default function Today() {
  const sum = useAsync(() => api.summary("SATS"), []);
  const mainBuy = useAsync(() => api.signals("SATS", "BUY", 0), []);
  const satsBuy = useAsync(() => api.signals("SATS", "BUY", 2), []);
  const hits = useAsync(() => api.events("SATS"), []);
  const scr = useAsync(() => api.screener(), []);
  const watch = useWatchlist();

  const err = sum.error ?? scr.error ?? mainBuy.error;
  if (err) return <main className="page"><ErrorBox error={err} /></main>;
  if (!sum.data || !scr.data) return <main className="page"><Loading what="ringkasan hari ini" /></main>;

  const s = sum.data;
  const rows = scr.data.rows;
  const asOf = scr.data.asOf;
  const liquid = rows.filter((r) => (r.value_20d ?? 0) >= LIQUID);
  const pctOf = (f: (r: ScreenerRow) => boolean) => (liquid.length ? (liquid.filter(f).length / liquid.length) * 100 : null);
  const aboveMa200 = pctOf((r) => (r.dist_ma200 ?? -1) > 0);
  const upToday = pctOf((r) => (r.chg1 ?? 0) > 0);
  const avgChg = liquid.length ? liquid.reduce((a, r) => a + (r.chg1 ?? 0), 0) / liquid.length : null;

  // SATS BUY ≤ 2 days confirmed by a bullish pattern AND healthy fundamentals, liquid only
  const candidates = (satsBuy.data?.rows ?? []).filter(
    (r: LatestRow) =>
      (r.value_20d ?? 0) >= LIQUID &&
      bullish(r.candles, r.chart_patterns) &&
      fundHealthy(r.f_profitable, r.f_equity_positive, r.f_der, r.f_stale) === true,
  );
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const warn = (code: string) => spikeOf(byCode.get(code));
  // "Dekat high 52M + RS ≥ 80": the strongest test in the lab
  const top = presetById("high52_rs80");
  const near52 = top
    ? withRsRank(rows)
        .filter((r) => r.as_of_date >= asOf && (r.value_20d ?? 0) >= LIQUID && top.test(r)) // tanpa saham suspensi
        .sort((a, b) => (b.rs_rank ?? 0) - (a.rs_rank ?? 0))
    : [];
  const levelHits = hits.data?.rows ?? [];
  const wl = rows.filter((r) => watch.has(r.code)).sort((a, b) => Math.abs(b.chg1 ?? 0) - Math.abs(a.chg1 ?? 0));
  const wlAlerts = wl.filter((r) => r.sats_bars === 0 || (r.chg1 != null && Math.abs(r.chg1) >= 5));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Hari Ini</h1>
          <p className="muted">Ringkasan hari bursa {fmtDate(s.asOf, true)} · klik saham untuk detail · ☆ untuk menambah ke watchlist</p>
        </div>
      </div>

      <section className="kpis">
        <a className="card kpi kpi-button" href="#/pasar">
          <div className="kpi-label">IHSG vs MA200</div>
          <div className={`kpi-value ${s.market ? (s.market.above ? "buy" : "sell") : ""}`}>
            {s.market ? (s.market.above ? "ATAS" : "BAWAH") : "—"}
          </div>
          <div className="kpi-sub">
            {s.market ? `IHSG ${fmtNum(s.market.ihsg_close)} · MA200 ${fmtNum(s.market.ihsg_ma200)}` : "belum ada data"}
          </div>
        </a>
        <a className="card kpi kpi-button" href="#/pasar">
          <div className="kpi-label">
            <WithInfo info="Persentase saham likuid (≥ Rp 1 M/hari) yang harganya di atas MA200. Di atas 50% = mayoritas pasar dalam tren naik.">
              Saham di atas MA200
            </WithInfo>
          </div>
          <div className={`kpi-value ${aboveMa200 == null ? "" : aboveMa200 >= 50 ? "buy" : "sell"}`}>
            {aboveMa200 == null ? "—" : `${fmt1(aboveMa200)}%`}
          </div>
          <div className="kpi-sub">dari {fmtNum(liquid.length)} saham likuid · <span className="accent">grafik →</span></div>
        </a>
        <div className="card kpi">
          <div className="kpi-label">Saham naik hari ini</div>
          <div className={`kpi-value ${upToday == null ? "" : upToday >= 50 ? "buy" : "sell"}`}>
            {upToday == null ? "—" : `${fmt1(upToday)}%`}
          </div>
          <div className="kpi-sub">rata-rata perubahan {fmtPct(avgChg, 2)}</div>
        </div>
        <a className="card kpi kpi-button" href="#/?side=BUY&age=0" onClick={() => setStrategy("SATS")}>
          <div className="kpi-label">Sinyal SATS hari ini</div>
          <div className="kpi-value">
            <span className="buy">{fmtNum(s.buy_today)}</span> / <span className="sell">{fmtNum(s.sell_today)}</span>
          </div>
          <div className="kpi-sub">BUY / SELL SATS v1.9.0 hari ini</div>
        </a>
      </section>

      {wl.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>
              ★ Watchlist <span className="muted small">{wl.length}</span>
            </h2>
            <span className="muted small">
              {wlAlerts.length ? `${wlAlerts.length} perlu dilihat (sinyal baru atau gerak ≥ 5%)` : "diurutkan dari gerak terbesar"}
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Saham</th>
                  <th className="num">Harga</th>
                  <th className="num">1H</th>
                  <th className="num">5H</th>
                  <th className="num">vs MA200</th>
                  <th className="num">RSI</th>
                  <th>Sinyal SATS</th>
                  <th>Pola</th>
                </tr>
              </thead>
              <tbody>
                {wl.map((r) => (
                  <tr key={r.code} className={`clickable ${wlAlerts.includes(r) ? "row-current" : ""}`} onClick={() => openStock(r.code)}>
                    <td>
                      <Star code={r.code} />
                      <span className="code">{r.code}</span>
                      {spikeOf(r) && <SpikeWarn />}
                      <div className="dim small ellipsis">{r.name}</div>
                    </td>
                    <td className="num mono">{fmtPrice(r.close)}</td>
                    <td className={`num mono ${tone(r.chg1)}`}>{fmtPct(r.chg1)}</td>
                    <td className={`num mono ${tone(r.chg5)}`}>{fmtPct(r.chg5)}</td>
                    <td className={`num mono ${tone(r.dist_ma200)}`}>{fmtPct(r.dist_ma200)}</td>
                    <td className="num mono">{fmt1(r.rsi14)}</td>
                    <td className="small">
                      {r.sats_signal ? (
                        <span className={r.sats_signal === "BUY" ? "buy" : "sell"}>
                          {r.sats_signal} · {r.sats_bars === 0 ? "hari ini" : `${r.sats_bars}h`}
                          {r.sats_signal === "BUY" && r.sats_filter ? " ✓" : ""}
                        </span>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td className="small">
                      <PatternBadges candles={r.candles} charts={r.chart_patterns} max={2} maxDays={2} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="today-grid">
        <Block
          title="BUY SATS v1.9.0 hari ini"
          info="Sinyal BUY SATS v1.9.0 yang muncul di hari bursa terakhir. A = dekat high 52 minggu & di atas MA200, A+ = juga RS ≥ 80: di Lab Uji hanya BUY berlabel inilah yang mengalahkan pasar. BUY tanpa label rata-rata kalah dari pasar."
          count={mainBuy.data?.rows.length ?? 0}
          empty="Tidak ada BUY SATS baru hari ini."
          more="#/?side=BUY&age=0"
          onMore={() => setStrategy("SATS")}
        >
          {[...(mainBuy.data?.rows ?? [])].sort((a, b) => gradeRank(b) - gradeRank(a)).slice(0, 8).map((r) => (
            <Item key={r.code} code={r.code} name={r.name} price={r.close} chg={r.change_pct} warn={warn(r.code)} grade={<GradeBadge row={r} />}
              sub={<PatternBadges candles={r.candles} charts={r.chart_patterns} max={2} maxDays={2} />} />
          ))}
        </Block>

        <Block
          title="Kandidat terkonfirmasi"
          info="BUY SATS ≤ 2 hari yang sekaligus punya pola bullish (candle ≤ 2 hari atau pola chart), fundamental sehat, dan likuid (≥ Rp 1 M/hari). Belum tentu lolos filter pasar."
          count={candidates.length}
          empty="Belum ada BUY SATS yang dikonfirmasi pola bullish dan fundamental sehat."
          more="#/?side=BUY&age=2&pb=1&fh=1"
          onMore={() => setStrategy("SATS")}
        >
          {candidates.slice(0, 8).map((r) => (
            <Item key={r.code} code={r.code} name={r.name} price={r.close} chg={r.change_pct} warn={warn(r.code)} grade={<GradeBadge row={r} />}
              right={<span className="dim small">{r.last_signal_bars === 0 ? "hari ini" : `${r.last_signal_bars}h`}{r.filter_signal ? " ✓" : ""}</span>}
              sub={<PatternBadges candles={r.candles} charts={r.chart_patterns} max={2} maxDays={2} />} />
          ))}
        </Block>

        <Block
          title="Dekat high 52M + RS ≥ 80"
          info="Harga ≤ 5% dari harga tertinggi setahun, di atas MA200, dan kenaikan 6 bulan masuk 20% terbaik (saham likuid ≥ Rp 1 M/hari). Hasil terbaik Lab Uji di BEI. Diurutkan dari RS tertinggi. Win rate ±45%: pasang stop loss, biarkan yang untung berjalan."
          count={near52.length}
          empty="Tidak ada saham likuid yang memenuhi hari ini."
          more="#/screener?p=high52_rs80"
          badge={<LabBadge id="preset:high52_rs80" />}
        >
          {near52.slice(0, 8).map((r) => (
            <Item key={r.code} code={r.code} name={r.name} price={r.close} chg={r.chg1} warn={spikeOf(r)}
              right={<span className="dim small">RS {r.rs_rank} · {(r.dist_high52 ?? -1) >= 0 ? "high baru" : `${fmt1(r.dist_high52)}%`}</span>} />
          ))}
        </Block>

        <Block
          title="Target / Stop Loss tersentuh"
          info="Posisi BUY SATS yang menyentuh TP1–TP3 atau Stop Loss di hari bursa terakhir (berdasarkan high/low)."
          count={levelHits.length}
          empty="Tidak ada level yang tersentuh."
        >
          {levelHits.slice(0, 8).map((r) => (
            <Item key={r.code} code={r.code} name={r.name} price={r.close} chg={r.change_pct} warn={warn(r.code)} grade={<GradeBadge row={r} />}
              right={<span className={`status ${(r.event_today ?? "").includes("SL") ? "sl" : "tp"}`}>{(r.event_today ?? "").replace(/,/g, " · ")}</span>} />
          ))}
        </Block>
      </div>

      {wl.length === 0 && watch.loaded && (
        <p className="dim small">Tip: klik ☆ di samping kode saham (di mana saja) untuk menambahkannya ke watchlist; ringkasannya akan muncul di halaman ini.</p>
      )}
    </main>
  );
}
