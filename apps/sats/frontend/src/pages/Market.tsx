import { useEffect, useRef, useState } from "react";
import { api, type BreadthRow, type ScreenerRow } from "../api";
import { ErrorBox, Loading } from "../components/Bits";
import { WithInfo } from "../components/Info";
import Star from "../components/Star";
import { fmt1, fmtDate, fmtNum, fmtPct, fmtPrice, fmtRp } from "../format";
import { openStock } from "../nav";
import { useAsync } from "../useAsync";

const LIQUID = 1e9; // Rp 1 M/day, same as the breadth history
const tone = (v: number | null | undefined) => (v == null ? "" : v > 0 ? "buy" : v < 0 ? "sell" : "");

// ---------------------------------------------------------------- breadth chart

interface Series {
  name: string;
  color: string;
  values: Array<number | null>;
  dashed?: boolean;
}

/** Minimal SVG line chart with a shared hover index (crosshair). One y-axis only. */
function LineChart(props: {
  series: Series[];
  height: number;
  yMin?: number;
  yMax?: number;
  yTicks?: number[];
  yFmt: (v: number) => string;
  refLine?: number;
  hover: number | null;
  onHover: (i: number | null) => void;
  xLabels: string[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = props.xLabels.length;
  const all = props.series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const lo = props.yMin ?? Math.min(...all);
  const hi = props.yMax ?? Math.max(...all);
  const pad = { l: 44, r: 12, t: 10, b: 22 };
  const iw = Math.max(10, w - pad.l - pad.r);
  const ih = props.height - pad.t - pad.b;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const ticks = props.yTicks ?? [lo, (lo + hi) / 2, hi];
  const xTicks = n ? [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1] : [];

  const path = (vals: Array<number | null>) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / iw) * (n - 1));
    props.onHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div ref={box} className="lc">
      <svg width={w} height={props.height} onPointerMove={move} onPointerLeave={() => props.onHover(null)} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className={t === props.refLine ? "lc-ref" : "lc-grid"} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="lc-axis">
              {props.yFmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={props.height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="lc-axis">
            {props.xLabels[i]}
          </text>
        ))}
        {props.series.map((s) => (
          <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" />
        ))}
        {props.hover != null && (
          <g>
            <line x1={x(props.hover)} x2={x(props.hover)} y1={pad.t} y2={pad.t + ih} className="lc-cross" />
            {props.series.map((s) => {
              const v = s.values[props.hover as number];
              return v == null ? null : <circle key={s.name} cx={x(props.hover as number)} cy={y(v)} r={4} fill={s.color} stroke="var(--s1)" strokeWidth={2} />;
            })}
          </g>
        )}
      </svg>
    </div>
  );
}

const RANGES = [
  { id: "3b", label: "3 bln", days: 63 },
  { id: "6b", label: "6 bln", days: 126 },
  { id: "1t", label: "1 thn", days: 9999 },
];

function BreadthSection({ rows }: { rows: BreadthRow[] }) {
  const [range, setRange] = useState("6b");
  const [hover, setHover] = useState<number | null>(null);
  const days = RANGES.find((r) => r.id === range)?.days ?? 126;
  const data = rows.slice(-days);
  const pct = (a: number, r: BreadthRow) => (r.n ? (a / r.n) * 100 : null);
  const above200 = data.map((r) => pct(r.above200, r));
  const above50 = data.map((r) => pct(r.above50, r));
  const labels = data.map((r) => fmtDate(r.date));
  const i = hover ?? data.length - 1;
  const cur = data[i];
  const ago = rows[rows.length - 21];
  const last = rows[rows.length - 1];
  const delta200 = last && ago ? (pct(last.above200, last) ?? 0) - (pct(ago.above200, ago) ?? 0) : null;

  if (data.length < 2) {
    return (
      <div className="state">
        Riwayat breadth belum ada. Muncul otomatis setelah EOD penuh berikutnya (jadwal sore, atau Run workflow manual di GitHub).
      </div>
    );
  }

  return (
    <>
      <div className="breadth-head">
        <div className="breadth-read">
          <div>
            <span className="dim small">{fmtDate(cur.date, true)}{hover == null ? " (terakhir)" : ""}</span>
          </div>
          <div className="breadth-stats">
            <span><i className="dot" style={{ background: "var(--c1)" }} /> &gt; MA200 <b className="mono">{fmt1(pct(cur.above200, cur))}%</b></span>
            <span><i className="dot" style={{ background: "var(--c2)" }} /> &gt; MA50 <b className="mono">{fmt1(pct(cur.above50, cur))}%</b></span>
            <span>naik/turun <b className="mono"><span className="buy">{cur.up}</span> / <span className="sell">{cur.down}</span></b></span>
            <span>high/low 52 mg <b className="mono"><span className="buy">{cur.hi52}</span> / <span className="sell">{cur.lo52}</span></b></span>
            <span>IHSG <b className="mono">{fmtNum(cur.ihsg)}</b></span>
            <span className="dim">{cur.n} saham likuid</span>
          </div>
        </div>
        <div className="segmented" role="group" aria-label="Rentang">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <LineChart
        series={[
          { name: "> MA200", color: "var(--c1)", values: above200 },
          { name: "> MA50", color: "var(--c2)", values: above50, dashed: true },
        ]}
        height={240}
        yMin={0}
        yMax={100}
        yTicks={[0, 25, 50, 75, 100]}
        refLine={50}
        yFmt={(v) => `${v}%`}
        hover={hover}
        onHover={setHover}
        xLabels={labels}
      />
      <div className="dim small lc-title">IHSG</div>
      <LineChart
        series={[{ name: "IHSG", color: "var(--mu)", values: data.map((r) => r.ihsg) }]}
        height={130}
        yFmt={(v) => fmtNum(v)}
        hover={hover}
        onHover={setHover}
        xLabels={labels}
      />
      {delta200 != null && (
        <p className="small muted">
          Saham di atas MA200 {delta200 >= 0 ? "naik" : "turun"} <b className={tone(delta200)}>{fmt1(Math.abs(delta200))} poin</b> dalam 20 hari bursa.
          {" "}Breadth yang melemah saat IHSG masih naik = kenaikan ditopang sedikit saham besar (waspada).
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------- sector map

const SECTOR_ID: Record<string, string> = {
  "Financial Services": "Keuangan",
  "Basic Materials": "Bahan Baku",
  Energy: "Energi",
  "Communication Services": "Telekomunikasi & Media",
  "Consumer Defensive": "Konsumer Primer",
  "Consumer Cyclical": "Konsumer Non-Primer",
  Industrials: "Perindustrian",
  "Real Estate": "Properti",
  Healthcare: "Kesehatan",
  Technology: "Teknologi",
  Utilities: "Utilitas",
};
const sectorName = (s: string | null) => (s ? SECTOR_ID[s] ?? s : "Tanpa sektor");

const PERIODS = [
  { id: "chg1", label: "1H", scale: 3 },
  { id: "chg5", label: "5H", scale: 6 },
  { id: "chg20", label: "20H", scale: 12 },
  { id: "chg60", label: "60H", scale: 20 },
  { id: "chg_ytd", label: "YTD", scale: 30 },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function SectorSection({ rows }: { rows: ScreenerRow[] }) {
  const [period, setPeriod] = useState<PeriodId>("chg5");
  const [liquidOnly, setLiquidOnly] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const scale = PERIODS.find((p) => p.id === period)?.scale ?? 6;

  const pool = rows.filter((r) => !liquidOnly || (r.value_20d ?? 0) >= LIQUID);
  const groups = new Map<string, ScreenerRow[]>();
  for (const r of pool) {
    const k = sectorName(r.sector);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const sectors = [...groups]
    .map(([name, list]) => {
      const chg = list.map((r) => r[period]).filter((v): v is number => v != null);
      return {
        name,
        list,
        chg: median(chg),
        up: chg.length ? (chg.filter((v) => v > 0).length / chg.length) * 100 : null,
        above200: list.length ? (list.filter((r) => (r.dist_ma200 ?? -1) > 0).length / list.length) * 100 : null,
        value: list.reduce((a, r) => a + (r.value_20d ?? 0), 0),
      };
    })
    .sort((a, b) => (a.name === "Tanpa sektor" ? 1 : b.name === "Tanpa sektor" ? -1 : (b.chg ?? -999) - (a.chg ?? -999)));
  const sel = sectors.find((s) => s.name === open) ?? null;
  const members = sel ? [...sel.list].sort((a, b) => (b[period] ?? -999) - (a[period] ?? -999)) : [];

  const tint = (v: number | null) => {
    if (v == null) return undefined;
    const k = Math.min(1, Math.abs(v) / scale) * 45;
    return `color-mix(in srgb, ${v >= 0 ? "var(--buy)" : "var(--sell)"} ${k.toFixed(0)}%, var(--s1))`;
  };

  return (
    <>
      <div className="market-filters">
        <div className="segmented" role="group" aria-label="Periode">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="small">
          <input type="checkbox" checked={liquidOnly} onChange={(e) => setLiquidOnly(e.target.checked)} /> Hanya likuid (≥ Rp 1 M/hari)
        </label>
      </div>
      <div className="sector-grid">
        {sectors.map((s) => (
          <button
            key={s.name}
            type="button"
            className={`sector-tile ${open === s.name ? "on" : ""}`}
            style={{ background: tint(s.chg) }}
            onClick={() => setOpen(open === s.name ? null : s.name)}
            aria-expanded={open === s.name}
          >
            <span className="sector-name">{s.name}</span>
            <span className="sector-chg mono">{fmtPct(s.chg, 2)}</span>
            <span className="sector-meta small">
              {s.list.length} saham · {s.up == null ? "—" : Math.round(s.up)}% naik · {s.above200 == null ? "—" : Math.round(s.above200)}% &gt; MA200
            </span>
            <span className="sector-meta small">nilai {fmtRp(s.value)}/hari</span>
          </button>
        ))}
      </div>
      {sel && (
        <div className="card sector-detail">
          <div className="card-head">
            <h2>
              {sel.name} <span className="muted small">{members.length} saham · urut {PERIODS.find((p) => p.id === period)?.label}</span>
            </h2>
            <button type="button" className="chip" onClick={() => setOpen(null)}>
              Tutup
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Saham</th>
                  <th className="num">Harga</th>
                  {PERIODS.map((p) => (
                    <th key={p.id} className="num">{p.label}</th>
                  ))}
                  <th className="num">vs MA200</th>
                  <th className="num">Nilai/hari</th>
                </tr>
              </thead>
              <tbody>
                {members.map((r) => (
                  <tr key={r.code} className="clickable" onClick={() => openStock(r.code)}>
                    <td>
                      <Star code={r.code} /> <span className="code">{r.code}</span>
                      <div className="dim small ellipsis">{r.industry ?? r.name}</div>
                    </td>
                    <td className="num mono">{fmtPrice(r.close)}</td>
                    {PERIODS.map((p) => (
                      <td key={p.id} className={`num mono ${tone(r[p.id])} ${p.id === period ? "strong" : ""}`}>{fmtPct(r[p.id], 1)}</td>
                    ))}
                    <td className={`num mono ${tone(r.dist_ma200)}`}>{fmtPct(r.dist_ma200, 1)}</td>
                    <td className="num mono">{fmtRp(r.value_20d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="small dim">
        Angka besar = median perubahan harga saham di sektor itu (tidak dibobot kapitalisasi, jadi satu saham besar tidak mendominasi).
        Sektor dari Yahoo Finance (diperbarui mingguan). Klik kotak untuk melihat sahamnya.
      </p>
    </>
  );
}

// ---------------------------------------------------------------- page

export default function Market() {
  const breadth = useAsync(() => api.breadth(), []);
  const scr = useAsync(() => api.screener(), []);
  const err = breadth.error ?? scr.error;
  if (err) return <main className="page"><ErrorBox error={err} /></main>;
  if (!breadth.data || !scr.data) return <main className="page"><Loading what="data pasar" /></main>;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Pasar</h1>
          <p className="muted">Kesehatan pasar secara luas dan rotasi sektor · data EOD {fmtDate(scr.data.asOf, true)}</p>
        </div>
      </div>

      <section className="card market-card">
        <div className="card-head">
          <h2>
            <WithInfo info="Persentase saham likuid (≥ Rp 1 M/hari) yang harganya di atas MA200 (tren jangka panjang) dan MA50 (tren menengah). Di atas 50% = mayoritas pasar naik. Arahnya sering berbalik lebih dulu dari IHSG.">
              Breadth pasar
            </WithInfo>
          </h2>
        </div>
        <div className="market-body">
          <BreadthSection rows={breadth.data.rows} />
        </div>
      </section>

      <section className="card market-card">
        <div className="card-head">
          <h2>
            <WithInfo info="Perubahan harga per sektor. Hijau = sektor menguat, merah = melemah; makin pekat makin besar. Dipakai untuk melihat sektor mana yang sedang dicari pasar (rotasi).">
              Peta sektor
            </WithInfo>
          </h2>
        </div>
        <div className="market-body">
          <SectorSection rows={scr.data.rows} />
        </div>
      </section>
    </main>
  );
}
