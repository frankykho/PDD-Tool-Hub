import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { ErrorBox, Loading } from "../components/Bits";
import Info, { WithInfo } from "../components/Info";
import Star from "../components/Star";
import { fmtDate, fmtNum, fmtPct, fmtPrice } from "../format";
import { openStock } from "../nav";
import {
  DEFAULT_CRITERIA, FOCUS, PILLARS, breadthAbove200, criteriaFromQuery, criteriaToQuery, runRadar,
  type Criteria, type Pillar, type RadarHit, type Reason,
} from "../radar/score";
import { withRank } from "../screener/rank";
import { useAsync } from "../useAsync";
import { useWatchlist } from "../watchlist";
import { SHARIA_INDEXES, isShariaIndex, shariaLabel, useSharia } from "../sharia";

const SAVED_KEY = "sats.radarCriteria";
const VALUE_OPTIONS: Array<[number, string]> = [
  [1, "≥ Rp 1 M/hari"],
  [5, "≥ Rp 5 M/hari"],
  [20, "≥ Rp 20 M/hari"],
  [100, "≥ Rp 100 M/hari"],
];
const SCORE_OPTIONS = [50, 60, 70, 80];
const PILLAR_SHORT: Record<Pillar, string> = { m: "M", b: "B", v: "V", l: "L" };

interface Saved {
  id: string;
  name: string;
  q: string;
}
function loadSaved(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function storeSaved(list: Saved[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
const hashQuery = () => {
  const h = window.location.hash, i = h.indexOf("?");
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : "");
};
const scoreTone = (s: number) => (s >= 80 ? "hi" : s >= 65 ? "mid" : "lo");

/** Alasan yang ditampilkan: poin terbesar dulu (maks. 4), lalu info dan semua peringatan. */
function shownReasons(rs: Reason[]): Reason[] {
  const good = rs.filter((r) => r.tone === "good" && r.pillar !== "l").sort((a, b) => b.pts - a.pts).slice(0, 4);
  return [...good, ...rs.filter((r) => r.tone === "info"), ...rs.filter((r) => r.tone === "warn")];
}

function toCsv(hits: RadarHit[]): string {
  const esc = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = ["Kode", "Nama", "Harga", "Perubahan 1 hari (%)", "Skor", "Momentum", "Breakout", "Volume", "Likuiditas", "Alasan", "Peringatan"];
  const lines = hits.map(({ row, res }) =>
    [
      row.code, row.name, String(row.close), row.chg1 == null ? "" : String(row.chg1), String(res.score),
      ...(["m", "b", "v", "l"] as Pillar[]).map((p) => String(res.pillars[p])),
      res.reasons.filter((r) => r.tone !== "warn").map((r) => r.text).join("; "),
      res.reasons.filter((r) => r.tone === "warn").map((r) => r.text).join("; "),
    ].map(esc).join(","),
  );
  return [head.map(esc).join(","), ...lines].join("\n");
}

export default function Radar() {
  const [c, setC] = useState<Criteria>(() => criteriaFromQuery(hashQuery()));
  const [saved, setSaved] = useState<Saved[]>(loadSaved);
  const [showAll, setShowAll] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const watch = useWatchlist();
  const data = useAsync(() => api.screener(), []);
  const indices = useAsync(() => api.indices(), []);
  const set = (patch: Partial<Criteria>) => setC((x) => ({ ...x, ...patch }));

  useEffect(() => {
    const q = criteriaToQuery(c).toString();
    const hash = `#/radar${q ? `?${q}` : ""}`;
    if (window.location.hash !== hash) history.replaceState(history.state, "", hash);
  }, [c]);

  const ranked = useMemo(() => withRank(data.data?.rows ?? []), [data.data]);
  const sy = useSharia();
  const hits = useMemo(
    () => runRadar(ranked, c, watch.has, (row, idx) => (isShariaIndex(idx) ? !!sy[row.code]?.includes(idx) : (row.indexes ?? "").split(",").includes(idx))),
    [ranked, c, watch.codes, sy],
  );
  const shown = showAll ? hits : hits.slice(0, 50);
  // bahan konten edukasi: 5 hasil teratas + alasannya, dengan bahasa informasi (bukan ajakan beli) & disclaimer
  const [copied, setCopied] = useState(false);
  const copyContent = () => {
    const asOf = data.data ? fmtDate(data.data.asOf, true) : "";
    const lines = [
      `Saham yang sedang ramai dibicarakan pasar${asOf ? ` (data per ${asOf})` : ""}`,
      "Bahan konten edukasi: cara membaca momentum, volume, dan likuiditas. Bukan rekomendasi beli/jual.",
      "",
      ...hits.slice(0, 5).flatMap(({ row, res }, i) => [
        `${i + 1}. ${row.code} · ${row.name}${sy[row.code] ? " (saham syariah)" : ""}`,
        ...res.reasons.filter((x) => x.tone === "good").slice(0, 3).map((x) => `   - ${x.text}`),
        ...res.reasons.filter((x) => x.tone === "warn").slice(0, 1).map((x) => `   - Perlu diperhatikan: ${x.text}`),
      ]),
      "",
      "Ide konten: jelaskan arti tiap indikator (momentum, volume di atas rata-rata, likuiditas) memakai contoh di atas, tanpa target harga atau ajakan transaksi.",
      "Disclaimer: Informasi ini untuk edukasi, bukan rekomendasi untuk membeli atau menjual efek. Investasi saham mengandung risiko.",
    ];
    const t = lines.join("\n");
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1800); };
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(done, () => window.prompt("Salin bahan konten:", t));
  };
  const breadth = useMemo(() => breadthAbove200(ranked), [ranked]);
  const weak = breadth != null && breadth < 40;
  const lowHint =
    weak && c.minScore > 40
      ? `Pasar sedang lemah: hanya ${breadth}% saham likuid di atas MA200, jadi skor momentum dan breakout kebanyakan saham rendah. Radar sengaja ketat; turunkan skor minimal untuk melihat kandidat yang hampir lolos.`
      : "";

  const save = () => {
    const name = window.prompt("Nama kriteria:", FOCUS.find((f) => f.id === c.focus)?.name ?? "Kriteria saya");
    if (!name) return;
    const next = [...saved, { id: String(Date.now()), name, q: criteriaToQuery(c).toString() }];
    setSaved(next);
    storeSaved(next);
  };
  const remove = (id: string) => {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    storeSaved(next);
  };
  const exportCsv = () => {
    const blob = new Blob(["﻿" + toCsv(hits)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `radar-${c.focus}-${data.data?.asOf ?? "data"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Opportunity Radar</h1>
          <p className="muted">
            Saham yang sedang menarik menurut momentum, breakout, volume, dan likuiditas
            {data.data && <> · data per {fmtDate(data.data.asOf, true)}</>} · setiap hasil disertai alasan mengapa terdeteksi
          </p>
        </div>
        <button type="button" className="btn" disabled={!hits.length} onClick={copyContent} title="Bahan konten edukasi (bukan rekomendasi) dari 5 hasil teratas, untuk ditulis ulang di Copy Studio">
          {copied ? "✓ Tersalin" : "📋 Bahan konten edukasi"}
        </button>
      </div>

      <section className="card pad radar-crit">
        <div className="radar-crit-row">
          <span className="radar-lbl">Fokus</span>
          <div className="segmented" role="group" aria-label="Fokus penilaian">
            {FOCUS.map((f) => (
              <button key={f.id} type="button" aria-pressed={c.focus === f.id} onClick={() => set({ focus: f.id, w: f.w })}>
                {f.name}
              </button>
            ))}
            <button type="button" aria-pressed={c.focus === "custom"} onClick={() => set({ focus: "custom" })}>
              Atur sendiri
            </button>
          </div>
        </div>
        {c.focus === "custom" && (
          <div className="radar-crit-row radar-weights">
            <span className="radar-lbl">Bobot</span>
            {PILLARS.map((p) => (
              <label key={p.id} className="radar-w">
                <span>{p.name}</span>
                <input
                  type="number" min={0} max={100} step={5} value={c.w[p.id]}
                  onChange={(e) => set({ w: { ...c.w, [p.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } })}
                />
              </label>
            ))}
            <span className="dim small">Skor = rata-rata tertimbang keempat pilar. Bobot tidak harus berjumlah 100.</span>
          </div>
        )}
        <div className="radar-crit-row">
          <div className="select">
            <WithInfo info="Hanya saham dengan skor total minimal sebesar ini (0–100).">
              <label htmlFor="rd-min">Skor min.</label>
            </WithInfo>
            <select id="rd-min" value={c.minScore} onChange={(e) => set({ minScore: Number(e.target.value) })}>
              {SCORE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  ≥ {v}
                </option>
              ))}
            </select>
          </div>
          <div className="select">
            <WithInfo info="Rata-rata nilai transaksi harian 20 hari minimal.">
              <label htmlFor="rd-val">Transaksi min.</label>
            </WithInfo>
            <select id="rd-val" value={c.minValue} onChange={(e) => set({ minValue: Number(e.target.value) })}>
              {VALUE_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="select">
            <label htmlFor="rd-idx">Indeks</label>
            <select id="rd-idx" value={c.index} onChange={(e) => set({ index: e.target.value })}>
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
        </div>
        <div className="radar-crit-row">
          <label className="check">
            <input type="checkbox" checked={c.aboveMa200} onChange={(e) => set({ aboveMa200: e.target.checked })} />
            <span>Harga di atas MA200</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={c.fundOk} onChange={(e) => set({ fundOk: e.target.checked })} />
            <span>Fundamental sehat</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={c.noWarn} onChange={(e) => set({ noWarn: e.target.checked })} />
            <span>Tanpa peringatan</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={c.watchOnly} onChange={(e) => set({ watchOnly: e.target.checked })} />
            <span>★ Hanya watchlist ({watch.codes.length})</span>
          </label>
          <div className="bar-actions">
            <button type="button" className="btn" onClick={() => setC(DEFAULT_CRITERIA)}>
              Atur ulang
            </button>
            <button type="button" className="btn" onClick={save}>
              Simpan kriteria
            </button>
            <button type="button" className="btn" onClick={exportCsv} disabled={!hits.length}>
              Export CSV
            </button>
          </div>
        </div>
        {saved.length > 0 && (
          <div className="saved-presets">
            <span className="dim small">Kriteria saya:</span>
            {saved.map((s) => (
              <span key={s.id} className="chip saved">
                <button type="button" onClick={() => setC(criteriaFromQuery(new URLSearchParams(s.q)))}>
                  {s.name}
                </button>
                <button type="button" aria-label={`Hapus ${s.name}`} className="chip-x" onClick={() => remove(s.id)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <button type="button" className="pattern-toggle" aria-expanded={showHow} onClick={() => setShowHow((v) => !v)}>
          <strong>Cara Radar menilai</strong>
          <span className="dim">{showHow ? "▲" : "▼"}</span>
        </button>
        {showHow && (
          <div className="radar-how">
            {PILLARS.map((p) => (
              <p key={p.id}>
                <b>{p.name} (0–100).</b> {p.help}
              </p>
            ))}
            <p>
              <b>Skor total</b> = rata-rata tertimbang keempat pilar sesuai fokus, lalu dikurangi peringatan: RSI ≥ 80, ≥ 25% di atas MA50,
              volume ≥ 4×, death cross, double top jebol, candle bearish 1 hari terakhir, rugi atau ekuitas negatif, dan nilai transaksi
              &lt; Rp 1 M/hari.
            </p>
            <p className="dim">
              Semua angka dari data harian penutupan. Bobot volume sengaja tidak memberi nilai tinggi untuk ledakan volume: di Lab Uji BEI,
              breakout dengan volume 1–2× rata-rata lebih baik daripada breakout dengan volume meledak.
            </p>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            {fmtNum(hits.length)} saham terdeteksi <span className="muted small">dari {fmtNum(ranked.length)}</span>
          </h2>
          {breadth != null && (
            <span className={`small ${weak ? "sell" : "muted"}`} title="Persen saham dengan nilai transaksi ≥ Rp 1 M/hari yang harganya di atas MA200">
              {breadth}% saham likuid di atas MA200
            </span>
          )}
          <span className="muted small radar-legend">
            {PILLARS.map((p) => (
              <span key={p.id} title={p.help}>
                <b>{PILLAR_SHORT[p.id]}</b> {p.name}
              </span>
            ))}
          </span>
        </div>
        {data.error ? (
          <ErrorBox error={data.error} />
        ) : !data.data ? (
          <Loading what="radar" />
        ) : !hits.length ? (
          <div className="state">{lowHint || "Tidak ada saham yang memenuhi kriteria. Coba turunkan skor minimal atau nilai transaksi."}</div>
        ) : (
          <>
          {hits.length < 5 && lowHint && <p className="radar-hint small">{lowHint}</p>}
          <ol className="radar-list">
            {shown.map(({ row, res }, i) => (
              <li key={row.code}>
                <div
                  role="button" tabIndex={0} className="radar-row"
                  onClick={() => openStock(row.code)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openStock(row.code);
                  }}
                >
                  <div className="radar-id">
                    <span className="dim mono small">{i + 1}</span>
                    <Star code={row.code} />
                    <div>
                      <span className="code">{row.code}</span>
                      {sy[row.code] && <span className="sy-badge" title={`Saham syariah: anggota ${sy[row.code].join(", ")}`}>{shariaLabel(sy[row.code])}</span>}
                      <div className="dim small ellipsis" title={row.name}>
                        {row.name}
                      </div>
                      <div className="mono small">
                        {fmtPrice(row.close)} <span className={(row.chg1 ?? 0) > 0 ? "buy" : (row.chg1 ?? 0) < 0 ? "sell" : "dim"}>{fmtPct(row.chg1)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="radar-score">
                    <span className={`radar-total ${scoreTone(res.score)}`} aria-label={`Skor ${res.score} dari 100`}>
                      {res.score}
                    </span>
                    <div className="radar-bars">
                      {PILLARS.map((p) => (
                        <div key={p.id} className="radar-bar" title={`${p.name} ${res.pillars[p.id]}`}>
                          <span>{PILLAR_SHORT[p.id]}</span>
                          <i>
                            <b style={{ width: `${res.pillars[p.id]}%` }} />
                          </i>
                          <span className="mono">{res.pillars[p.id]}</span>
                        </div>
                      ))}
                      {res.penalty < 0 && <div className="radar-pen small">Peringatan {res.penalty}</div>}
                    </div>
                  </div>
                  <ul className="radar-why" aria-label="Alasan terdeteksi">
                    {shownReasons(res.reasons).map((r, k) => (
                      <li key={k} className={r.tone}>
                        {r.tone === "warn" ? "⚠ " : r.tone === "info" ? "• " : "✓ "}
                        {r.text}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
          </>
        )}
        {hits.length > 50 && (
          <div className="card-foot">
            <button type="button" className="btn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Tampilkan 50 teratas" : `Tampilkan semua (${fmtNum(hits.length)})`}
            </button>
          </div>
        )}
      </section>

      <p className="dim small">
        Radar adalah alat penyaring dari data historis, bukan rekomendasi beli atau jual. Skor tinggi berarti banyak syarat teknikal terpenuhi,
        bukan jaminan harga naik. <Info label="Tentang skor">Skor dihitung ulang setiap data harian diperbarui. Saham dengan alasan yang sama bisa berbeda nasib; selalu cek grafik, berita, dan pasang batas rugi.</Info>
      </p>
    </main>
  );
}
