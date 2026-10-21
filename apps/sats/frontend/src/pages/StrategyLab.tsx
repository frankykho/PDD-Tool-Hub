import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { ErrorBox } from "../components/Bits";
import Info, { WithInfo } from "../components/Info";
import { fmt1, fmtDate, fmtNum, fmtPct, fmtPrice, fmtRp } from "../format";
import { openStock } from "../nav";
import { useAsync } from "../useAsync";
import { useWatchlist } from "../watchlist";
import { backtest, day, type BacktestResult, type ExecConfig, type StockInput, type Trade } from "../backtest/engine";
import { loadHistory, loadMany } from "../backtest/data";
import { CONDS, TEMPLATES, condMeta, decodeStrategy, encodeStrategy, signals, type Cond, type CondType, type Strategy } from "../backtest/rules";

const SAVED_KEY = "sats.labStrategies";
const MAX_STOCKS = 80;
const REASON: Record<Trade["reason"], string> = { SL: "Stop loss", TP: "Target", TRAIL: "Trailing", SINYAL: "Sinyal jual", WAKTU: "Batas hari", AKHIR: "Masih dipegang" };

type Universe = "index" | "watch" | "one" | "list";
interface Setup {
  universe: Universe;
  index: string;
  one: string;
  list: string;
  years: number;
  capital: number; // juta
  maxPositions: number;
  feeBuy: number;
  feeSell: number;
  slippage: number;
  minValue: number; // Rp miliar/hari saat sinyal
}
const DEFAULT_SETUP: Setup = { universe: "index", index: "LQ45", one: "BBCA", list: "", years: 3, capital: 100, maxPositions: 5, feeBuy: 0.15, feeSell: 0.25, slippage: 0.1, minValue: 1 };
const baseStrategy = (): Strategy => {
  const { id: _id, note: _note, ...s } = TEMPLATES[0];
  return JSON.parse(JSON.stringify(s));
};

const hashQuery = () => {
  const h = window.location.hash, i = h.indexOf("?");
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : "");
};
function loadSaved(): Array<{ id: string; name: string; s: string }> {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Grafik ekuitas strategi vs IHSG (keduanya mulai dari modal yang sama). */
function EquityChart({ eq, bench }: { eq: Array<{ d: string; v: number }>; bench: Array<{ d: string; v: number }> }) {
  if (eq.length < 2) return null;
  const W = 760, H = 240, P = { l: 64, r: 10, t: 10, b: 24 };
  const all = [...eq, ...bench].map((x) => x.v), lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.06 || 1;
  const t0 = Date.parse(eq[0].d), t1 = Date.parse(eq[eq.length - 1].d);
  const X = (d: string) => P.l + ((Date.parse(d) - t0) / (t1 - t0 || 1)) * (W - P.l - P.r);
  const Y = (v: number) => P.t + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - P.t - P.b);
  const line = (a: Array<{ d: string; v: number }>) => a.map((p) => `${X(p.d).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <figure className="lab-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafik nilai portofolio strategi dibanding IHSG">
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} className="grid" />
            <text x={P.l - 6} y={Y(v) + 4} textAnchor="end">{fmtRp(v).replace("Rp ", "")}</text>
          </g>
        ))}
        <polyline points={line(bench)} className="bench" fill="none" />
        <polyline points={line(eq)} className="strat" fill="none" />
        <text x={P.l} y={H - 6}>{fmtDate(eq[0].d, true)}</text>
        <text x={W - P.r} y={H - 6} textAnchor="end">{fmtDate(eq[eq.length - 1].d, true)}</text>
      </svg>
      <figcaption className="lab-legend">
        <span><i className="strat" />Strategi</span>
        <span><i className="bench" />IHSG (beli &amp; tahan)</span>
      </figcaption>
    </figure>
  );
}

function CondRow({ c, side, onChange, onRemove }: { c: Cond; side: "entry" | "exit"; onChange: (c: Cond) => void; onRemove: () => void }) {
  const meta = condMeta(c.t);
  return (
    <div className="lab-cond">
      <select aria-label="Syarat" value={c.t} onChange={(e) => onChange(JSON.parse(JSON.stringify(condMeta(e.target.value as CondType).def)))}>
        {CONDS.filter((m) => m.side === side || m.side === "both").map((m) => (
          <option key={m.t} value={m.t}>{m.label}</option>
        ))}
      </select>
      {meta.params.map(([k, label]) => (
        <label key={k} className="lab-num">
          <span>{label}</span>
          <input
            type="number" step="any" value={(c as unknown as Record<string, number>)[k]}
            onChange={(e) => onChange({ ...c, [k]: Number(e.target.value) } as Cond)}
          />
        </label>
      ))}
      <span className="dim small lab-help">{meta.help}</span>
      <button type="button" className="chip-x" aria-label="Hapus syarat" onClick={onRemove}>×</button>
    </div>
  );
}

const numOrNull = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : Number(v));

export default function StrategyLab() {
  const init = useMemo(() => hashQuery(), []);
  const [s, setS] = useState<Strategy>(() => decodeStrategy(init.get("s")) ?? baseStrategy());
  const [u, setU] = useState<Setup>(() => {
    try {
      return { ...DEFAULT_SETUP, ...(JSON.parse(atob(init.get("u") ?? "")) as Partial<Setup>) };
    } catch {
      return DEFAULT_SETUP;
    }
  });
  const [saved, setSaved] = useState(loadSaved);
  const [running, setRunning] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ r: BacktestResult; bench: Array<{ d: string; v: number }>; benchRet: number | null; n: number; failed: string[]; from: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const watch = useWatchlist();
  const scr = useAsync(() => api.screener(), []);
  const indices = useAsync(() => api.indices(), []);
  const set = (p: Partial<Setup>) => setU((x) => ({ ...x, ...p }));

  useEffect(() => {
    const q = new URLSearchParams({ s: encodeStrategy(s), u: btoa(JSON.stringify(u)) });
    history.replaceState(history.state, "", `#/backtest?${q}`);
  }, [s, u]);

  const known = useMemo(() => new Set((scr.data?.rows ?? []).map((r) => r.code)), [scr.data]);
  const codes = useMemo(() => {
    const rows = scr.data?.rows ?? [];
    const pick =
      u.universe === "one" ? [u.one.trim().toUpperCase()]
      : u.universe === "watch" ? watch.codes
      : u.universe === "list" ? u.list.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
      : rows.filter((r) => (r.indexes ?? "").split(",").includes(u.index)).map((r) => r.code);
    return [...new Set(pick)].filter((c) => c && (!known.size || known.has(c)));
  }, [u, scr.data, watch.codes, known]);

  const run = async () => {
    setErr(null);
    setRes(null);
    setShowAll(false);
    if (!codes.length) return setErr("Belum ada saham yang dipilih (atau kodenya tidak dikenal).");
    if (codes.length > MAX_STOCKS) return setErr(`Maksimal ${MAX_STOCKS} saham sekali jalan (terpilih ${codes.length}).`);
    if (!s.entry.length) return setErr("Tambahkan minimal satu syarat beli.");
    try {
      setRunning(`Memuat data 0/${codes.length} saham…`);
      const [{ data, failed }, ihsg] = await Promise.all([
        loadMany(codes, (d, t) => setRunning(`Memuat data ${d}/${t} saham…`)),
        loadHistory("IHSG").catch(() => [] as Awaited<ReturnType<typeof loadHistory>>),
      ]);
      if (!data.size) throw new Error("Data harga tidak bisa dimuat. Coba lagi beberapa saat lagi.");
      setRunning("Menghitung sinyal & simulasi…");
      await new Promise((r) => setTimeout(r, 30)); // beri waktu tampilan berganti
      const last = [...data.values()].reduce((m, b) => Math.max(m, b[b.length - 1].time), 0);
      const from = day(last - Math.round(u.years * 365.25 * 86400));
      const stocks: StockInput[] = [...data.entries()].map(([code, bars]) => {
        const sig = signals(bars, s);
        // syarat likuiditas: rata-rata nilai transaksi 20 hari saat sinyal
        const entry = sig.entry.map((ok, i) => {
          if (!ok || u.minValue <= 0) return ok;
          let v = 0;
          for (let j = Math.max(0, i - 19); j <= i; j += 1) v += bars[j].close * (bars[j].volume ?? 0);
          return v / Math.min(20, i + 1) >= u.minValue * 1e9;
        });
        return { code, bars, entry, exit: sig.exit };
      });
      const cfg: ExecConfig = {
        capital: u.capital * 1e6, maxPositions: Math.max(1, Math.round(u.maxPositions)), feeBuy: u.feeBuy, feeSell: u.feeSell, slippage: u.slippage,
        stopLoss: s.stopLoss, takeProfit: s.takeProfit, trailing: s.trailing, maxHold: s.maxHold, from,
      };
      const r = backtest(stocks, cfg);
      const ib = ihsg.filter((b) => day(b.time) >= (r.equity[0]?.d ?? from));
      const bench = ib.length > 1 ? ib.map((b) => ({ d: day(b.time), v: (b.close / ib[0].close) * cfg.capital })) : [];
      setRes({ r, bench, benchRet: bench.length ? (bench[bench.length - 1].v / cfg.capital - 1) * 100 : null, n: data.size, failed, from });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  };

  const save = () => {
    const name = window.prompt("Nama strategi:", s.name);
    if (!name) return;
    const next = [...saved, { id: String(Date.now()), name, s: encodeStrategy({ ...s, name }) }];
    setSaved(next);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const remove = (id: string) => {
    const next = saved.filter((x) => x.id !== id);
    setSaved(next);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const exportCsv = () => {
    if (!res) return;
    const head = ["Kode", "Tanggal beli", "Harga beli", "Lembar", "Tanggal jual", "Harga jual", "Alasan", "Hari", "Return bersih (%)", "Laba/rugi (Rp)"];
    const lines = res.r.trades.map((t) => [t.code, t.entryDate, t.entryPrice, t.shares, t.exitDate, t.exitPrice, REASON[t.reason], t.days, t.ret.toFixed(2), Math.round(t.pnl)].join(","));
    const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backtest-${s.name.replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const m = res?.r.metrics;
  const trades = res ? [...res.r.trades].sort((a, b) => b.entryDate.localeCompare(a.entryDate)) : [];
  const shown = showAll ? trades : trades.slice(0, 50);
  const setCond = (side: "entry" | "exit", i: number, c: Cond | null) =>
    setS((x) => ({ ...x, [side]: c ? x[side].map((y, k) => (k === i ? c : y)) : x[side].filter((_, k) => k !== i) }));
  const addCond = (side: "entry" | "exit") =>
    setS((x) => ({ ...x, [side]: [...x[side], JSON.parse(JSON.stringify(CONDS.find((m2) => m2.side === side || m2.side === "both")!.def))] }));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Strategy Lab</h1>
          <p className="muted">
            Uji strategi pada riwayat harga saham BEI ±5 tahun, lengkap dengan biaya transaksi, slippage, lot, fraksi harga, dan auto reject.
          </p>
        </div>
      </div>

      <section className="card pad">
        <div className="lab-row">
          <span className="radar-lbl">Template</span>
          <div className="lab-chips">
            {TEMPLATES.map(({ id, note, ...t }) => (
              <button key={id} type="button" className={`chip ${s.name === t.name ? "on" : ""}`} title={note} onClick={() => setS(JSON.parse(JSON.stringify(t)))}>
                {t.name}
              </button>
            ))}
            {saved.map((x) => (
              <span key={x.id} className="chip saved">
                <button type="button" onClick={() => { const v = decodeStrategy(x.s); if (v) setS(v); }}>★ {x.name}</button>
                <button type="button" className="chip-x" aria-label={`Hapus ${x.name}`} onClick={() => remove(x.id)}>×</button>
              </span>
            ))}
          </div>
        </div>
        <h2 className="lab-h">Beli bila <span className="dim small">semua syarat terpenuhi di harga penutupan, eksekusi di pembukaan besok</span></h2>
        {s.entry.map((c, i) => (
          <CondRow key={i} c={c} side="entry" onChange={(v) => setCond("entry", i, v)} onRemove={() => setCond("entry", i, null)} />
        ))}
        <button type="button" className="btn lab-add" onClick={() => addCond("entry")}>+ Syarat beli</button>
        <h2 className="lab-h">Jual bila <span className="dim small">salah satu terjadi</span></h2>
        {s.exit.map((c, i) => (
          <CondRow key={i} c={c} side="exit" onChange={(v) => setCond("exit", i, v)} onRemove={() => setCond("exit", i, null)} />
        ))}
        <button type="button" className="btn lab-add" onClick={() => addCond("exit")}>+ Syarat jual</button>
        <div className="lab-row lab-risk">
          {([["stopLoss", "Stop loss (%)"], ["takeProfit", "Target (%)"], ["trailing", "Trailing stop (%)"], ["maxHold", "Maks. hari pegang"]] as const).map(([k, l]) => (
            <label key={k} className="lab-num">
              <span>{l}</span>
              <input type="number" min={0} step="any" placeholder="tidak" value={s[k] ?? ""} onChange={(e) => setS((x) => ({ ...x, [k]: numOrNull(e.target.value) }))} />
            </label>
          ))}
          <span className="dim small">Kosong = tidak dipakai. Stop & target diperiksa di dalam hari (high/low); bila sehari kena keduanya, dianggap stop lebih dulu.</span>
        </div>
      </section>

      <section className="card pad">
        <div className="lab-row">
          <span className="radar-lbl">Saham</span>
          <div className="segmented" role="group" aria-label="Pilihan saham">
            {([["index", "Indeks"], ["watch", "Watchlist"], ["one", "Satu saham"], ["list", "Daftar kode"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={u.universe === k} onClick={() => set({ universe: k })}>{l}</button>
            ))}
          </div>
          {u.universe === "index" && (
            <select aria-label="Indeks" value={u.index} onChange={(e) => set({ index: e.target.value })}>
              {(indices.data?.rows ?? []).map((r) => (
                <option key={r.index_code} value={r.index_code}>{r.name} ({r.member_count})</option>
              ))}
            </select>
          )}
          {u.universe === "one" && <input className="lab-code" aria-label="Kode saham" value={u.one} onChange={(e) => set({ one: e.target.value.toUpperCase() })} />}
          {u.universe === "list" && <input className="lab-list" aria-label="Daftar kode" placeholder="mis. BBCA, BBRI, TLKM" value={u.list} onChange={(e) => set({ list: e.target.value })} />}
          <span className={`small ${codes.length > MAX_STOCKS ? "sell" : "dim"}`}>{codes.length} saham{codes.length > MAX_STOCKS ? ` (maks. ${MAX_STOCKS})` : ""}</span>
        </div>
        <div className="lab-row">
          <span className="radar-lbl">Periode</span>
          <div className="segmented" role="group" aria-label="Periode uji">
            {[1, 3, 5].map((y) => (
              <button key={y} type="button" aria-pressed={u.years === y} onClick={() => set({ years: y })}>{y} tahun</button>
            ))}
          </div>
        </div>
        <div className="lab-row lab-risk">
          {([
            ["capital", "Modal (Rp juta)", "Dana awal."],
            ["maxPositions", "Maks. posisi", "Dana dibagi rata; sinyal lebih banyak dari slot = yang nilai transaksinya terbesar didahulukan."],
            ["feeBuy", "Biaya beli (%)", "Komisi broker + levy."],
            ["feeSell", "Biaya jual (%)", "Komisi + levy + PPh final 0,1%."],
            ["slippage", "Slippage (%)", "Selisih harga eksekusi dari harga pembukaan (beli lebih mahal, jual lebih murah)."],
            ["minValue", "Likuiditas min. (Rp M/hari)", "Sinyal beli hanya dipakai bila rata-rata nilai transaksi 20 hari minimal sebesar ini."],
          ] as const).map(([k, l, h]) => (
            <label key={k} className="lab-num">
              <WithInfo info={h}><span>{l}</span></WithInfo>
              <input type="number" min={0} step="any" value={u[k]} onChange={(e) => set({ [k]: Math.max(0, Number(e.target.value) || 0) } as Partial<Setup>)} />
            </label>
          ))}
        </div>
        <div className="lab-row">
          <button type="button" className="btn primary" onClick={run} disabled={!!running}>{running ? "Berjalan…" : "Jalankan backtest"}</button>
          <button type="button" className="btn" onClick={save}>Simpan strategi</button>
          {running && <span className="dim small">{running}</span>}
        </div>
        {err && <ErrorBox error={err} />}
      </section>

      {res && m && (
        <section className="card">
          <div className="card-head">
            <h2>Hasil: {s.name}</h2>
            <span className="muted small">
              {res.n} saham · {fmtDate(res.r.equity[0]?.d, true)} – {fmtDate(res.r.equity[res.r.equity.length - 1]?.d, true)}
              {res.failed.length > 0 && ` · data gagal: ${res.failed.join(", ")}`}
            </span>
          </div>
          <div className="lab-kpis">
            {[
              ["Total return", fmtPct(m.totalReturn), res.benchRet != null ? `IHSG ${fmtPct(res.benchRet)}` : "", m.totalReturn >= 0 ? "buy" : "sell"],
              ["Per tahun (CAGR)", m.cagr == null ? "—" : fmtPct(m.cagr), `${fmt1(m.years)} tahun`, ""],
              ["Penurunan terdalam", fmtPct(m.maxDrawdown), "dari puncak nilai portofolio", "sell"],
              ["Transaksi", fmtNum(m.trades), m.avgDays == null ? "" : `rata-rata ${fmt1(m.avgDays)} hari`, ""],
              ["Win rate", m.winRate == null ? "—" : `${fmt1(m.winRate)}%`, `untung ${m.avgWin == null ? "—" : fmtPct(m.avgWin)} · rugi ${m.avgLoss == null ? "—" : fmtPct(m.avgLoss)}`, ""],
              ["Profit factor", m.profitFactor == null ? "—" : fmt1(m.profitFactor), "total untung ÷ total rugi", ""],
              ["Nilai akhir", fmtRp(m.final), `modal ${fmtRp(u.capital * 1e6)}`, ""],
              ["Waktu terinvestasi", `${fmt1(m.exposure)}%`, "hari dengan ≥ 1 posisi", ""],
            ].map(([k, v, sub, tone]) => (
              <div key={k} className="kpi">
                <small>{k}</small>
                <strong className={tone}>{v}</strong>
                <small>{sub}</small>
              </div>
            ))}
          </div>
          <div className="pad lab-body">
            <EquityChart eq={res.r.equity} bench={res.bench} />
            <p className="dim small">
              Order beli tidak terisi karena ARA: {res.r.missedAra} · hari jual tertunda karena ARB: {res.r.arbDelays} · sinyal dilewati karena slot/dana
              penuh: {res.r.skippedCash}.
            </p>
            {trades.length > 0 && (
              <>
                <div className="lab-row">
                  <h3 className="lab-h">Transaksi ({trades.length})</h3>
                  <button type="button" className="btn" onClick={exportCsv}>Export CSV</button>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Saham</th><th>Beli</th><th className="num">Harga</th><th>Jual</th><th className="num">Harga</th><th>Alasan</th><th className="num">Hari</th><th className="num">Return bersih</th></tr>
                    </thead>
                    <tbody>
                      {shown.map((t, i) => (
                        <tr key={i} className="clickable" onClick={() => openStock(t.code)}>
                          <td className="code">{t.code}</td>
                          <td>{fmtDate(t.entryDate, true)}</td>
                          <td className="num mono">{fmtPrice(t.entryPrice)}</td>
                          <td>{t.open ? <span className="dim">belum dijual</span> : fmtDate(t.exitDate, true)}</td>
                          <td className="num mono">{fmtPrice(t.exitPrice)}</td>
                          <td className="small">{REASON[t.reason]}</td>
                          <td className="num mono">{t.days}</td>
                          <td className={`num mono ${t.ret > 0 ? "buy" : t.ret < 0 ? "sell" : ""}`}>{fmtPct(t.ret)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {trades.length > 50 && (
                  <button type="button" className="btn" onClick={() => setShowAll((v) => !v)}>{showAll ? "Tampilkan 50 terbaru" : `Tampilkan semua (${trades.length})`}</button>
                )}
              </>
            )}
            {!trades.length && <p className="muted">Tidak ada transaksi: syarat beli tidak pernah terpenuhi di periode ini.</p>}
          </div>
        </section>
      )}

      <p className="dim small">
        Hasil masa lalu, bukan jaminan hasil masa depan. Asumsi: daftar saham sekarang (saham yang sudah delisting tidak ikut, sehingga hasil
        cenderung lebih bagus), data harian Yahoo yang sudah dibersihkan, batas auto reject 35/25/20% sesuai rentang harga sepanjang periode,
        penyelesaian T+2 diabaikan, dan semua order di harga pembukaan terisi penuh.{" "}
        <Info label="Cara eksekusi">Sinyal dihitung di harga penutupan; beli/jual di pembukaan hari bursa berikutnya ditambah slippage, dibulatkan ke fraksi harga, per lot 100 lembar. Saham yang dibuka & bertahan di ARA tidak bisa dibeli; yang dibuka & bertahan di ARB tidak bisa dijual hari itu.</Info>
      </p>
    </main>
  );
}
