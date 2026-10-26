import { useEffect, useMemo, useState } from "react";
import { api, type ScreenerRow } from "../api";
import { ErrorBox, Loading } from "../components/Bits";
import Info, { WithInfo } from "../components/Info";
import { fmt1, fmtDate, fmtNum, fmtPct, fmtPrice, fmtRp } from "../format";
import { withRank } from "../screener/rank";
import { openStock } from "../nav";
import { FIELDS, OPS, decodeFilters, encodeFilters, fieldMeta, passes, type CustomFilter, type FieldKey, type Op } from "../screener/fields";
import { PRESET_GROUPS, PRESETS, presetById, type PresetGroup } from "../screener/presets";
import { useAsync } from "../useAsync";
import PatternBadges from "../components/PatternBadges";
import Star from "../components/Star";
import LabBadge, { LabMark } from "../components/LabBadge";
import { MarketHealthLine } from "../components/MarketHealth";
import { useWatchlist } from "../watchlist";
import { CANDLES, CHARTS, parseCandles, parseCharts } from "../screener/patternMeta";
import { SHARIA_INDEXES, isShariaIndex, shariaLabel, useSharia } from "../sharia";

const SAVED_KEY = "sats.screenerPresets";
const VALUE_OPTIONS: Array<[number, string]> = [
  [0, "Semua"],
  [1, "≥ Rp 1 M/hari"],
  [5, "≥ Rp 5 M/hari"],
  [20, "≥ Rp 20 M/hari"],
  [100, "≥ Rp 100 M/hari"],
];

interface SavedPreset {
  id: string;
  name: string;
  preset: string;
  filters: string;
  value: number;
  index: string;
}

function loadSaved(): SavedPreset[] {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function params(): URLSearchParams {
  const h = window.location.hash;
  const i = h.indexOf("?");
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : "");
}

function fmtCell(key: FieldKey, v: number | null): string {
  const m = fieldMeta(key);
  if (v == null) return "—";
  switch (m?.kind) {
    case "pct":
      return key === "atr_pct" || key === "bb_width" || key === "roe" || key === "div_yield" ? `${fmt1(v)}%` : fmtPct(v);
    case "price":
      return fmtPrice(v);
    case "days":
      return v === 0 ? "hari ini" : `${fmtNum(v)} hr`;
    case "flag":
      return v ? "Ya" : "—";
    case "value":
      return fmtRp(v);
    default:
      if (key === "vol_ratio" || key === "updown_vol20" || key === "per" || key === "pbv" || key === "der") return `${fmt1(v)}×`;
      if (key === "cmf20" || key === "obv20") return `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}`;
      return fmt1(v);
  }
}

const tone = (key: FieldKey, v: number | null) => {
  if (v == null) return "";
  if (["chg1", "chg5", "chg20", "chg60", "chg_ytd", "dist_ma20", "dist_ma50", "dist_ma200", "macd_hist", "cmf20", "obv20"].includes(key)) {
    return v > 0 ? "buy" : v < 0 ? "sell" : "";
  }
  if (key === "rsi14") return v >= 70 ? "sell" : v <= 30 ? "buy" : "";
  return "";
};

function toCsv(rows: ScreenerRow[], cols: FieldKey[]): string {
  const head = ["Kode", "Nama", ...cols.map((c) => fieldMeta(c)?.label ?? c), "Sinyal SATS", "Indeks", "Pola candle", "Pola chart"];
  const esc = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = rows.map((r) =>
    [r.code, r.name, ...cols.map((c) => (r[c] == null ? "" : String(r[c]))), r.sats_signal ? `${r.sats_signal} ${r.sats_bars}h` : "", r.indexes ?? "", r.candles ?? "", r.chart_patterns ?? ""]
      .map((x) => esc(String(x)))
      .join(","),
  );
  return [head.map(esc).join(","), ...lines].join("\n");
}

export default function Screener() {
  const init = useMemo(() => params(), []);
  const [preset, setPreset] = useState(() => {
    const v = init.get("p");
    return v === null ? "high52_rs80" : presetById(v) ? v : "";
  });
  const [filters, setFilters] = useState<CustomFilter[]>(() => decodeFilters(init.get("f")));
  const [minValue, setMinValue] = useState(() => (init.has("v") ? Number(init.get("v")) : 1));
  const [index, setIndex] = useState(init.get("idx") ?? "");
  const [sort, setSort] = useState<{ key: FieldKey; dir: "asc" | "desc" } | null>(null);
  // Category tab: starts at the category of the active preset
  const [group, setGroup] = useState<PresetGroup>(() => presetById(preset)?.group ?? "✓ Teruji BEI");
  const [saved, setSaved] = useState<SavedPreset[]>(loadSaved);
  const [showAll, setShowAll] = useState(false);
  const [watchOnly, setWatchOnly] = useState(() => init.get("wl") === "1");
  const watch = useWatchlist();
  // pattern search
  const listParam = (k: string) => (init.get(k) ?? "").split(",").filter(Boolean);
  const [candleSel, setCandleSel] = useState<string[]>(() => listParam("cd"));
  const [candleDays, setCandleDays] = useState(() => (init.has("cdd") ? Number(init.get("cdd")) : 2));
  const [chartSel, setChartSel] = useState<string[]>(() => listParam("cp"));
  const [chartStatus, setChartStatus] = useState(init.get("cps") ?? "any");
  const [showPatterns, setShowPatterns] = useState(() => init.has("cd") || init.has("cp"));
  const patternActive = candleSel.length > 0 || chartSel.length > 0;
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const data = useAsync(() => api.screener(), []);
  const indices = useAsync(() => api.indices(), []);
  const breadth = useAsync(() => api.breadth(), []);

  useEffect(() => {
    const q = new URLSearchParams();
    if (preset) q.set("p", preset);
    if (filters.length) q.set("f", encodeFilters(filters));
    if (minValue !== 1) q.set("v", String(minValue));
    if (index) q.set("idx", index);
    if (watchOnly) q.set("wl", "1");
    if (candleSel.length) q.set("cd", candleSel.join(","));
    if (candleSel.length && candleDays !== 2) q.set("cdd", String(candleDays));
    if (chartSel.length) q.set("cp", chartSel.join(","));
    if (chartSel.length && chartStatus !== "any") q.set("cps", chartStatus);
    const hash = `#/screener${q.toString() ? `?${q}` : ""}`;
    if (window.location.hash !== hash) history.replaceState(history.state, "", hash);
  }, [preset, filters, minValue, index, candleSel, candleDays, chartSel, chartStatus, watchOnly]);

  const p = presetById(preset);
  const activeSort = sort ?? p?.sort ?? { key: "chg20" as FieldKey, dir: "desc" as const };

  const columns = useMemo(() => {
    const cols: FieldKey[] = ["close", "chg1"];
    for (const c of p?.columns ?? ["chg5", "chg20", "dist_ma200", "rsi14"]) if (!cols.includes(c)) cols.push(c);
    for (const f of filters) if (!cols.includes(f.key)) cols.push(f.key);
    return cols;
  }, [p, filters]);

  // RS rank: percentile of the 6-month return among liquid stocks (>= Rp 1 M/day)
  const ranked = useMemo(() => withRank(data.data?.rows ?? []), [data.data]);

  const sy = useSharia();
  // Saham tanpa transaksi di hari bursa terakhir (suspensi / tidak ada yang beli-jual) memakai data lama: sinyal
  // "hari ini" (breakout, cross) sebenarnya basi dan sahamnya belum tentu bisa dibeli. Disembunyikan dari hasil.
  const asOf = data.data?.asOf;
  const stale = useMemo(() => ranked.filter((r) => asOf && r.as_of_date < asOf).length, [ranked, asOf]);
  const rows = useMemo(() => {
    const all = ranked;
    const out = all.filter(
      (r) =>
        (!asOf || r.as_of_date >= asOf) &&
        (r.value_20d ?? 0) >= minValue * 1e9 &&
        (!index || (isShariaIndex(index) ? !!sy[r.code]?.includes(index) : (r.indexes ?? "").split(",").includes(index))) &&
        (!watchOnly || watch.has(r.code)) &&
        (!p || p.test(r)) &&
        filters.every((f) => passes(r, f)) &&
        (!candleSel.length || parseCandles(r.candles).some((c) => candleSel.includes(c.id) && c.days <= candleDays)) &&
        (!chartSel.length ||
          parseCharts(r.chart_patterns).some((c) => chartSel.includes(c.id) && (chartStatus === "any" || c.status === chartStatus))),
    );
    const k = activeSort.key;
    const m = activeSort.dir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      const va = a[k] as number | null;
      const vb = b[k] as number | null;
      if (va == null && vb == null) return a.code.localeCompare(b.code);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * m || a.code.localeCompare(b.code);
    });
    return out;
  }, [ranked, asOf, minValue, index, p, filters, activeSort, candleSel, candleDays, chartSel, chartStatus, watchOnly, watch.codes, sy]);

  const total = data.data?.rows.length ?? 0;
  const shown = showAll ? rows : rows.slice(0, 100);

  const addFilter = () => setFilters((fs) => [...fs, { key: "rsi14", op: "lt", value: 30 }]);
  const updateFilter = (i: number, patch: Partial<CustomFilter>) =>
    setFilters((fs) => fs.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const removeFilter = (i: number) => setFilters((fs) => fs.filter((_, k) => k !== i));

  const savePreset = () => {
    const name = window.prompt("Nama preset:", p ? `${p.name} + filter` : "Preset saya");
    if (!name) return;
    const item: SavedPreset = { id: String(Date.now()), name, preset, filters: encodeFilters(filters), value: minValue, index };
    const next = [...saved, item];
    setSaved(next);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const applySaved = (s: SavedPreset) => {
    setPreset(presetById(s.preset) ? s.preset : "");
    const g = presetById(s.preset)?.group;
    if (g) setGroup(g);
    setFilters(decodeFilters(s.filters));
    setMinValue(s.value);
    setIndex(s.index);
    setSort(null);
  };
  const deleteSaved = (id: string) => {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const exportCsv = () => {
    const blob = new Blob(["\uFEFF" + toCsv(rows, columns)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `screener-${preset || "custom"}-${data.data?.asOf ?? "data"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const clickHead = (key: FieldKey) =>
    setSort((s) => {
      const cur = s ?? activeSort;
      return cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" };
    });

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Screener</h1>
          <p className="muted">
            Penyaring teknikal harian {data.data && <>· data per {fmtDate(data.data.asOf, true)}</>} · pilih preset, tambah filter
            sendiri, lalu klik saham untuk detail
          </p>
          <MarketHealthLine rows={breadth.data?.rows} />
        </div>
      </div>

      <section className="card pad">
        <div className="preset-tabs" role="tablist" aria-label="Kategori preset">
          {PRESET_GROUPS.map((g) => {
            const count = PRESETS.filter((x) => x.group === g).length;
            const hasActive = presetById(preset)?.group === g;
            return (
              <button
                key={g}
                type="button"
                role="tab"
                aria-selected={group === g}
                className={`preset-tab ${group === g ? "on" : ""}`}
                onClick={() => setGroup(g)}
              >
                {g}
                <span className="tab-count">{count}</span>
                {hasActive && <span className="tab-dot" aria-label="preset aktif" />}
              </button>
            );
          })}
        </div>
        <div className="preset-grid" role="tabpanel">
          {PRESETS.filter((x) => x.group === group).map((x) => (
            <div
              key={x.id}
              role="button"
              tabIndex={0}
              className={`preset-card ${preset === x.id ? "on" : ""}`}
              aria-pressed={preset === x.id}
              onClick={() => {
                setPreset(preset === x.id ? "" : x.id);
                setSort(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPreset(preset === x.id ? "" : x.id);
                  setSort(null);
                }
              }}
            >
              <span className="preset-name">
                {x.name}
                <Info label={`Penjelasan ${x.name}`}>{x.help}</Info>
              </span>
              <span className="preset-rule">{x.rule}</span>
              <LabBadge id={`preset:${x.id}`} />
            </div>
          ))}
        </div>
        {saved.length > 0 && (
          <div className="saved-presets">
            <span className="dim small">Preset saya:</span>
            {saved.map((s) => (
              <span key={s.id} className="chip saved">
                <button type="button" onClick={() => applySaved(s)}>
                  {s.name}
                </button>
                <button type="button" aria-label={`Hapus ${s.name}`} className="chip-x" onClick={() => deleteSaved(s.id)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="card pad">
        <button type="button" className="pattern-toggle" aria-expanded={showPatterns} onClick={() => setShowPatterns((v) => !v)}>
          <span>
            <strong>Cari pola candle &amp; chart</strong>
            {patternActive && <span className="accent small"> · {candleSel.length + chartSel.length} pola dipilih</span>}
          </span>
          <span className="dim">{showPatterns ? "▲" : "▼"}</span>
        </button>
        {showPatterns && (
          <div className="pattern-panel">
            {(["bull", "bear", "neutral"] as const).map((bias) => (
              <div key={bias} className="pattern-row">
                <span className={`pattern-row-title ${bias}`}>
                  {bias === "bull" ? "Candle bullish" : bias === "bear" ? "Candle bearish" : "Netral"}
                </span>
                <div className="pattern-chips">
                  {CANDLES.filter((c) => c.bias === bias).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`chip ${candleSel.includes(c.id) ? "on" : ""}`}
                      aria-pressed={candleSel.includes(c.id)}
                      title={c.help}
                      onClick={() => setCandleSel((a) => toggle(a, c.id))}
                    >
                      {c.name}
                      <LabMark id={`candle:${c.id}`} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="pattern-row">
              <span className="pattern-row-title">Muncul</span>
              <div className="segmented" role="group" aria-label="Umur pola candle">
                {[
                  [0, "Hari ini"],
                  [2, "≤ 2 hari"],
                  [5, "≤ 5 hari"],
                ].map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={candleDays === v} onClick={() => setCandleDays(v as number)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="pattern-row">
              <span className="pattern-row-title">Pola chart</span>
              <div className="pattern-chips">
                {CHARTS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`chip ${chartSel.includes(c.id) ? "on" : ""} ${c.bias === "bear" ? "chip-bear" : ""}`}
                    aria-pressed={chartSel.includes(c.id)}
                    title={c.help}
                    onClick={() => setChartSel((a) => toggle(a, c.id))}
                  >
                    {c.name}
                    <LabMark id={`chart:${c.id}`} />
                  </button>
                ))}
              </div>
            </div>
            <div className="pattern-row">
              <span className="pattern-row-title">Status</span>
              <div className="segmented" role="group" aria-label="Status pola chart">
                {[
                  ["any", "Semua"],
                  ["forming", "Sedang terbentuk"],
                  ["breakout", "Breakout ≤ 3 hari"],
                ].map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={chartStatus === v} onClick={() => setChartStatus(v)}>
                    {l}
                  </button>
                ))}
              </div>
              {patternActive && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setCandleSel([]);
                    setChartSel([]);
                  }}
                >
                  Hapus pilihan pola
                </button>
              )}
            </div>
            <p className="dim small">
              Pilih satu atau beberapa pola (cukup salah satu yang muncul). Bisa digabung dengan preset dan filter lain. Arahkan kursor ke
              nama pola untuk penjelasannya. Pola reversal candle hanya dihitung bila didahului tren 5 hari yang sesuai.
            </p>
          </div>
        )}
      </section>

      <section className="card pad">
        <div className="screener-bar">
          <div className="select">
            <WithInfo info="Hanya saham dengan rata-rata nilai transaksi harian 20 hari minimal sebesar ini.">
              <label htmlFor="sc-value">Transaksi min.</label>
            </WithInfo>
            <select id="sc-value" value={minValue} onChange={(e) => setMinValue(Number(e.target.value))}>
              {VALUE_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="select">
            <label htmlFor="sc-index">Indeks</label>
            <select id="sc-index" value={index} onChange={(e) => setIndex(e.target.value)}>
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
          <label className="check">
            <input type="checkbox" checked={watchOnly} onChange={(e) => setWatchOnly(e.target.checked)} />
            <span>★ Hanya watchlist ({watch.codes.length})</span>
          </label>
          <div className="bar-actions">
            <button type="button" className="btn" onClick={addFilter}>
              + Filter
            </button>
            <button type="button" className="btn" onClick={savePreset}>
              Simpan preset
            </button>
            <button type="button" className="btn" onClick={exportCsv} disabled={rows.length === 0}>
              Export CSV
            </button>
          </div>
        </div>

        {filters.length > 0 && (
          <div className="filter-rows">
            {filters.map((f, i) => {
              const meta = fieldMeta(f.key);
              return (
                <div key={i} className="filter-row">
                  <select aria-label="Indikator" value={f.key} onChange={(e) => updateFilter(i, { key: e.target.value as FieldKey })}>
                    {FIELDS.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                  <select aria-label="Operator" value={f.op} onChange={(e) => updateFilter(i, { op: e.target.value as Op })}>
                    {OPS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {meta?.kind === "flag" ? (
                    <select aria-label="Nilai" value={f.value} onChange={(e) => updateFilter(i, { value: Number(e.target.value), op: "eq" })}>
                      <option value={1}>Ya</option>
                      <option value={0}>Tidak</option>
                    </select>
                  ) : (
                    <input
                      aria-label="Nilai"
                      type="number"
                      step="any"
                      value={Number.isFinite(f.value) ? f.value : ""}
                      onChange={(e) => updateFilter(i, { value: Number(e.target.value) })}
                    />
                  )}
                  <span className="dim small filter-help">{meta?.help}</span>
                  <button type="button" className="chip-x" aria-label="Hapus filter" onClick={() => removeFilter(i)}>
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="dim small">
          {p ? (
            <>
              Preset: <strong className="accent">{p.name}</strong> — {p.rule}
            </>
          ) : (
            "Tanpa preset"
          )}
          {filters.length > 0 && ` · + ${filters.length} filter`}
          {patternActive && ` · + ${candleSel.length + chartSel.length} pola`}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            {fmtNum(rows.length)} saham <span className="muted small">dari {fmtNum(total)}</span>
            {stale > 0 && (
              <span className="muted small" title="Tidak ada transaksi di hari bursa terakhir (mis. suspensi), jadi datanya sudah lama">
                {" "}· {fmtNum(stale)} disembunyikan (tidak ditransaksikan {fmtDate(asOf as string, true)})
              </span>
            )}
          </h2>
          <span className="muted small">Klik judul kolom untuk mengurutkan</span>
        </div>
        {data.error ? (
          <ErrorBox error={data.error} />
        ) : !data.data ? (
          <Loading what="screener" />
        ) : rows.length === 0 ? (
          <div className="state">
            Tidak ada saham yang memenuhi syarat.
            {preset === "sats" && " Preset ini kosong saat filter pasar tertutup (IHSG di bawah MA200)."}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Saham</th>
                  {columns.map((c) => {
                    const meta = fieldMeta(c);
                    const on = activeSort.key === c;
                    return (
                      <th key={c} className="num">
                        <button type="button" className={`th-sort ${on ? "on" : ""}`} onClick={() => clickHead(c)} title={meta?.help}>
                          {meta?.short ?? c}
                          {on ? (activeSort.dir === "asc" ? " ↑" : " ↓") : ""}
                        </button>
                      </th>
                    );
                  })}
                  <th>Pola</th>
                  <th>SATS</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.code} className="clickable" onClick={() => openStock(r.code)}>
                    <td>
                      <Star code={r.code} />
                      <span className="code">{r.code}</span>
                      {sy[r.code] && (
                        <span className="sy-badge" title={`Saham syariah: anggota ${sy[r.code].join(", ")}`}>
                          {shariaLabel(sy[r.code])}
                        </span>
                      )}
                      <div className="dim small ellipsis" title={r.name}>
                        {r.name}
                      </div>
                    </td>
                    {columns.map((c) => (
                      <td key={c} className={`num mono ${tone(c, r[c] as number | null)}`}>
                        {fmtCell(c, r[c] as number | null)}
                      </td>
                    ))}
                    <td className="small">
                      <PatternBadges candles={r.candles} charts={r.chart_patterns} max={2} maxDays={patternActive ? candleDays : 2} />
                    </td>
                    <td className="small">
                      {r.sats_signal ? (
                        <span className={r.sats_signal === "BUY" ? "buy" : "sell"}>
                          {r.sats_signal} · {r.sats_bars}h{r.sats_signal === "BUY" && r.sats_filter ? " ✓" : ""}
                        </span>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                  </tr>
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
        Preset adalah alat penyaring, bukan strategi yang sudah terbukti menguntungkan. Kolom SATS: sinyal terakhir SATS dan umurnya;
        ✓ = BUY lolos filter MA200 &amp; IHSG.
      </p>
    </main>
  );
}
