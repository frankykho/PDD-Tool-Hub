import { useMemo, useState } from "react";
import { api, type LabRow, type ScreenerRow } from "../api";
import { ErrorBox, Loading } from "../components/Bits";
import { WithInfo } from "../components/Info";
import { useLab } from "../components/LabBadge";
import { MarketHealthLine } from "../components/MarketHealth";
import Star from "../components/Star";
import { fmtDate, fmtNum, fmtPct, fmtPrice, fmtRp } from "../format";
import { openStock } from "../nav";
import { CANDLES, CHARTS, parseCandles, parseCharts, type PatternMeta } from "../screener/patternMeta";
import { withRank } from "../screener/rank";
import { useAsync } from "../useAsync";

type Status = "breakout" | "forming";
interface Item {
  id: string;
  name: string;
  bias: "bull" | "bear";
  help: string;
  labId: string; // Lab Uji id
  match: (r: ScreenerRow) => Status | null;
  /** status words: chart patterns "breakout" / "terbentuk", candles "hari ini" / "kemarin" */
  words?: [string, string];
  screener?: string; // Screener link (hash), null = none
}
const CHART_WORDS: [string, string] = ["breakout", "terbentuk"];

const chart = (id: string): Item => {
  const m = CHARTS.find((c) => c.id === id) as PatternMeta;
  return {
    id, name: m.name.replace(/ — waspada$/, ""), bias: m.bias === "bear" ? "bear" : "bull", help: m.help, labId: `chart:${id}`,
    match: (r) => parseCharts(r.chart_patterns).find((c) => c.id === id)?.status ?? null,
    screener: `#/screener?p=&cp=${id}`,
  };
};
/** Candle pattern seen today ("breakout" slot) or yesterday ("forming" slot). */
const candle = (m: PatternMeta): Item => ({
  id: `cd_${m.id}`, name: m.name, bias: m.bias === "bear" ? "bear" : "bull", help: `${m.help} Ditampilkan bila muncul hari ini atau kemarin.`,
  labId: `candle:${m.id}`, words: ["hari ini", "kemarin"], screener: `#/screener?p=&cd=${m.id}&cdd=1`,
  match: (r) => {
    const c = parseCandles(r.candles).find((x) => x.id === m.id && x.days <= 1);
    return c ? (c.days === 0 ? "breakout" : "forming") : null;
  },
});
const VCP: Item = {
  id: "vcp", name: "VCP", bias: "bull", labId: "preset:vcp",
  help: "Volatility contraction pattern (Minervini): dalam tren naik, rentang koreksi makin sempit dan volume mengering. Belum ada titik breakout; dipakai sebagai daftar pantau.",
  match: (r) => (r.vcp === 1 ? "forming" : null),
};

const GROUPS: Array<{ id: string; label: string; tone: string; desc: string; items: Item[] }> = [
  { id: "breakout", label: "Breakout", tone: "buy", desc: "pola lanjutan tren naik", items: [chart("bull_flag"), chart("asc_triangle"), chart("cup_handle"), chart("channel_up"), VCP] },
  { id: "reversal", label: "Pembalikan", tone: "sell", desc: "dasar (naik) & puncak (waspada)", items: [chart("double_bottom"), chart("inv_hs"), chart("rounding_bottom"), chart("channel_down"), chart("double_top"), chart("hs_top")] },
  { id: "consol", label: "Konsolidasi", tone: "accent", desc: "segitiga & baji", items: [chart("falling_wedge"), chart("sym_triangle"), chart("rising_wedge")] },
  { id: "down", label: "Lanjutan turun", tone: "sell", desc: "pola waspada saat tren turun", items: [chart("bear_flag"), chart("desc_triangle")] },
  { id: "wyckoff", label: "Wyckoff", tone: "accent", desc: "akumulasi setelah penurunan", items: [chart("wyckoff_accum")] },
  { id: "trend", label: "Tren", tone: "buy", desc: "awal tren naik", items: [chart("new_uptrend")] },
  { id: "candle-bull", label: "Candle naik", tone: "buy", desc: "pola candle pembalikan naik, hari ini & kemarin", items: CANDLES.filter((c) => c.bias === "bull").map(candle) },
  { id: "candle-bear", label: "Candle waspada", tone: "sell", desc: "pola candle pembalikan turun, hari ini & kemarin", items: CANDLES.filter((c) => c.bias === "bear").map(candle) },
];

const VALUE_OPTIONS: Array<[number, string]> = [
  [0.1, "≥ Rp 100 jt/hari"],
  [1, "≥ Rp 1 M/hari"],
  [5, "≥ Rp 5 M/hari"],
  [20, "≥ Rp 20 M/hari"],
];
const INDEXES = ["", "IDX30", "LQ45", "KOMPAS100"];

interface Hit {
  r: ScreenerRow;
  status: Status;
}

/** Lab Uji verdict for one pattern (only when the lab data is available, i.e. admin). */
function Verdict({ row }: { row: LabRow | undefined }) {
  if (!row) return null;
  const v = row.verdict;
  const [cls, text] =
    v === "teruji" ? ["ok", row.expect === "down" ? "✓ Teruji sebagai peringatan" : "✓ Teruji di BEI"]
    : v === "berlawanan" ? ["bad", "✗ Kalah dari pasar"]
    : v === "netral" ? ["", "≈ Tidak terbukti"]
    : ["", "Data uji kurang"];
  const title = row.nS != null
    ? `Lab Uji 3 tahun: ${row.n10} sinyal breakout · ${fmtPct(row.ex10, 2)} vs pasar dalam 10 hari · ${fmtPct(row.exS, 2)} dengan stop loss (maks. 60 hari)`
    : "Lab Uji 3 tahun";
  return (
    <a className={`lab-badge ${cls}`} href="#/lab" title={title}>
      {text}
    </a>
  );
}

function PatternCard({ item, hits, lab }: { item: Item; hits: Hit[]; lab: Map<string, LabRow> | null }) {
  const [open, setOpen] = useState(false);
  const bull = item.bias === "bull";
  const brk = hits.filter((h) => h.status === "breakout").length;
  // top pick: breakout first, then relative strength (bullish) or weakness (bearish), then liquidity
  const sorted = [...hits].sort(
    (a, b) =>
      (a.status === b.status ? 0 : a.status === "breakout" ? -1 : 1) ||
      ((b.r.rs_rank ?? 0) - (a.r.rs_rank ?? 0)) * (bull ? 1 : -1) ||
      (b.r.value_20d ?? 0) - (a.r.value_20d ?? 0),
  );
  const top = sorted[0];
  const [hot, warm] = item.words ?? CHART_WORDS;
  return (
    <article className={`card pat-card ${hits.length ? "" : "pat-empty"}`}>
      <div className="pat-head">
        <div>
          <h3>
            <WithInfo info={item.help}>{item.name}</WithInfo>{" "}
            <span className={`pill small ${bull ? "buy" : "sell"}`}>{bull ? "NAIK" : "WASPADA"}</span>
          </h3>
          <div className="muted small">
            {hits.length} saham{item.id !== "vcp" && <> · <b className={brk ? (bull ? "buy" : "sell") : ""}>{brk} {hot}</b></>}
          </div>
        </div>
        <Verdict row={lab?.get(item.labId)} />
      </div>
      <div className="pat-dots" aria-hidden="true">
        {sorted.slice(0, 14).map((h) => (
          <i key={h.r.code} className={`pat-dot ${h.status === "breakout" ? (bull ? "b-buy" : "b-sell") : ""}`} />
        ))}
        {hits.length > 14 && <span className="dim small">+{hits.length - 14}</span>}
      </div>
      {top ? (
        <>
          <div className="dim small">{item.id === "vcp" ? "Teratas" : top.status === "breakout" ? `Teratas (${hot})` : `Teratas (${warm})`}</div>
          <button type="button" className="pat-top" onClick={() => openStock(top.r.code)}>
            <b className="mono">{top.r.code}</b>
            <span className="pat-name">{top.r.name}</span>
            <span className="mono small">{fmtPrice(top.r.close)}</span>
            <span className={`mono small ${(top.r.chg1 ?? 0) >= 0 ? "buy" : "sell"}`}>{fmtPct(top.r.chg1)}</span>
            <span className="mono small dim">RS {top.r.rs_rank ?? "—"}</span>
          </button>
          <div className="pat-foot">
            <button type="button" className="link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? "Tutup daftar" : `Lihat semua (${hits.length})`}
            </button>
            {item.screener && <a className="small" href={item.screener}>Buka di Screener →</a>}
          </div>
          {open && (
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th />
                    <th>Kode</th>
                    <th>Status</th>
                    <th className="num">Harga</th>
                    <th className="num">1 hari</th>
                    <th className="num">RS</th>
                    <th className="num">Nilai trx</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((h) => (
                    <tr key={h.r.code} className="clickable" onClick={() => openStock(h.r.code)}>
                      <td><Star code={h.r.code} /></td>
                      <td><b className="mono">{h.r.code}</b> <span className="dim small">{h.r.name}</span></td>
                      <td className={h.status === "breakout" ? (bull ? "buy" : "sell") : "dim"}>{h.status === "breakout" ? hot : warm}</td>
                      <td className="num mono">{fmtPrice(h.r.close)}</td>
                      <td className={`num mono ${(h.r.chg1 ?? 0) >= 0 ? "buy" : "sell"}`}>{fmtPct(h.r.chg1)}</td>
                      <td className="num mono">{h.r.rs_rank ?? "—"}</td>
                      <td className="num mono">{fmtRp(h.r.value_20d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="dim small">Tidak ada saham dengan pola ini hari ini.</div>
      )}
    </article>
  );
}

export default function Patterns() {
  const data = useAsync(() => api.screener(), []);
  const breadth = useAsync(() => api.breadth(), []);
  const lab = useLab();
  const [minValue, setMinValue] = useState(1);
  const [index, setIndex] = useState("");
  const [onlyBreakout, setOnlyBreakout] = useState(false);

  const asOf = data.data?.asOf;
  const rows = useMemo(
    () =>
      withRank(data.data?.rows ?? []).filter(
        (r) =>
          (!asOf || r.as_of_date >= asOf) && // no suspended / untraded stocks
          (r.value_20d ?? 0) >= minValue * 1e9 &&
          (!index || (r.indexes ?? "").split(",").includes(index)),
      ),
    [data.data, asOf, minValue, index],
  );
  const hitsOf = useMemo(() => {
    const m = new Map<string, Hit[]>();
    for (const g of GROUPS) for (const it of g.items) {
      const list: Hit[] = [];
      for (const r of rows) {
        const s = it.match(r);
        if (s && (!onlyBreakout || s === "breakout")) list.push({ r, status: s });
      }
      m.set(it.id, list);
    }
    return m;
  }, [rows, onlyBreakout]);

  if (data.error) return <main className="page"><ErrorBox error={data.error} /></main>;
  if (!data.data) return <main className="page"><Loading what="pola chart" /></main>;

  const all = [...hitsOf.values()].flat();
  const stocks = new Set(all.map((h) => h.r.code)).size;
  const items = GROUPS.flatMap((g) => g.items);
  const charts = items.filter((it) => !it.words); // chart patterns + VCP (candles have their own words)
  const nOf = (list: Item[]) => list.reduce((a, it) => a + (hitsOf.get(it.id)?.length ?? 0), 0);
  const nChart = nOf(charts), nCandle = all.length - nChart;
  const bullBrk = charts.filter((it) => it.bias === "bull").reduce((a, it) => a + (hitsOf.get(it.id) ?? []).filter((h) => h.status === "breakout").length, 0);
  const bearAll = nOf(charts.filter((it) => it.bias === "bear"));
  const proven = lab ? items.filter((it) => lab.get(it.labId)?.verdict === "teruji" && it.bias === "bull") : null;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Pola Chart</h1>
          <p className="muted">
            Pemindai pola harian · data per {fmtDate(data.data.asOf, true)} · klik saham untuk detail
          </p>
          <MarketHealthLine rows={breadth.data?.rows} />
        </div>
      </div>

      <section className="kpis">
        <div className="card kpi">
          <div className="kpi-label">Pola ditemukan</div>
          <div className="kpi-value">{fmtNum(all.length)}</div>
          <div className="kpi-sub">di {fmtNum(stocks)} saham · chart {fmtNum(nChart)} · candle {fmtNum(nCandle)}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Breakout naik</div>
          <div className="kpi-value buy">{fmtNum(bullBrk)}</div>
          <div className="kpi-sub">harga baru menembus titik picu</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Pola waspada</div>
          <div className="kpi-value sell">{fmtNum(bearAll)}</div>
          <div className="kpi-sub">double top, H&S, rising wedge, bear flag, descending triangle</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Teruji di BEI</div>
          <div className="kpi-value">{proven ? fmtNum(proven.length) : "—"}</div>
          <div className="kpi-sub">{proven ? (proven.length ? proven.map((p) => p.name).join(", ") : "belum ada pola naik yang terbukti") : "hasil Lab Uji (khusus admin)"}</div>
        </div>
      </section>

      <section className="card pad pat-note">
        <p className="small">
          <b>Pola adalah deskripsi bentuk harga, bukan ramalan.</b> Setiap pola diuji di Lab Uji pada semua saham likuid selama 3 tahun
          (beli di pembukaan setelah breakout, dibanding rata-rata pasar). Uji Okt 2026: hanya <b>Channel breakout</b>, <b>Tren naik baru</b> dan{" "}
          <b>Ascending triangle</b> lebih baik dari pasar (±1–2% dalam 10 hari), dan keunggulan itu hilang bila 10 sinyal terbaiknya dibuang.
          Double bottom, inverse head & shoulders, falling wedge dan symmetrical triangle justru <b>kalah dari pasar</b>; pola "waspada" tidak
          terbukti mendahului penurunan, dan tidak ada pola candle yang lebih baik dari pasar. Sinyal yang kuat di BEI adalah momentum (preset "✓ Teruji BEI" di Screener), jadi pakai pola untuk
          menentukan titik masuk dan stop loss pada saham yang memang kuat, bukan sebagai alasan membeli.
        </p>
      </section>

      <section className="card pat-filters">
        <div className="select">
          <label htmlFor="pt-value">Transaksi min.</label>
          <select id="pt-value" value={minValue} onChange={(e) => setMinValue(Number(e.target.value))}>
            {VALUE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="select">
          <label htmlFor="pt-index">Indeks</label>
          <select id="pt-index" value={index} onChange={(e) => setIndex(e.target.value)}>
            {INDEXES.map((x) => <option key={x} value={x}>{x || "Semua saham"}</option>)}
          </select>
        </div>
        <div className="segmented" role="group" aria-label="Status pola">
          <button type="button" aria-pressed={!onlyBreakout} onClick={() => setOnlyBreakout(false)}>Semua</button>
          <button type="button" aria-pressed={onlyBreakout} onClick={() => setOnlyBreakout(true)}>Hanya breakout</button>
        </div>
        <span className="small dim">{fmtNum(rows.length)} saham dipindai · RS = peringkat kenaikan 6 bulan (0–100)</span>
      </section>

      {GROUPS.map((g) => {
        const n = new Set(g.items.flatMap((it) => (hitsOf.get(it.id) ?? []).map((h) => h.r.code))).size;
        // candle groups: only the patterns that appeared (there are ten per side)
        const isCandle = g.id.startsWith("candle");
        const shown = isCandle ? g.items.filter((it) => (hitsOf.get(it.id)?.length ?? 0) > 0) : g.items;
        const hidden = g.items.length - shown.length;
        return (
          <section key={g.id} className="pat-group">
            <h2>
              <span className={`pat-tag ${g.tone}`}>{g.label.toUpperCase()}</span> {g.desc}{" "}
              <span className="dim small">{fmtNum(n)} saham</span>
            </h2>
            <div className="pat-grid">
              {/* patterns found today first (stable order otherwise) */}
              {[...shown].sort((a, b) => Number((hitsOf.get(b.id)?.length ?? 0) > 0) - Number((hitsOf.get(a.id)?.length ?? 0) > 0)).map((it) => (
                <PatternCard key={it.id} item={it} hits={hitsOf.get(it.id) ?? []} lab={lab} />
              ))}
            </div>
            {isCandle && hidden > 0 && (
              <p className="small dim">{shown.length ? `${hidden} pola candle lain` : `Ke-${hidden} pola candle ini`} tidak muncul hari ini atau kemarin.</p>
            )}
          </section>
        );
      })}
      <p className="small dim">
        Breakout = harga tutup menembus titik picu pola dalam 3 hari terakhir; terbentuk = bentuknya ada tapi belum menembus. Pola candle
        dihitung bila muncul hari ini atau kemarin. Definisi tiap pola: arahkan kursor ke nama pola.
      </p>
    </main>
  );
}
