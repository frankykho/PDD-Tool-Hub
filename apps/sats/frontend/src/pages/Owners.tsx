import { useEffect, useMemo, useRef, useState } from "react";
import { api, type NetworkRow, type OwnerCat, type OwnerRow } from "../api";
import { ErrorBox, Loading } from "../components/Bits";
import { WithInfo } from "../components/Info";
import { fmtDate, fmtNum, fmtPct, fmtRp } from "../format";
import { openStock } from "../nav";
import { useAsync } from "../useAsync";

const nf2 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number | null | undefined) => (v == null ? "—" : `${nf2.format(v)}%`);

export const CAT_LABEL: Record<OwnerCat, string> = {
  perorangan: "Perorangan",
  korporasi: "Korporasi",
  institusi: "Institusi",
  pemerintah: "Pemerintah/BUMN",
  kustodian: "Kustodian",
  lainnya: "Lainnya",
};
const CAT_INFO: Record<OwnerCat, string> = {
  perorangan: "Investor perorangan.",
  korporasi: "Perusahaan (sering pengendali / grup usaha).",
  institusi: "Reksa dana, dana pensiun, asuransi, manajer investasi, ETF, private equity.",
  pemerintah: "Pemerintah, BUMN (mis. ASABRI, Taspen, Danantara), dana kekayaan negara asing.",
  kustodian: "Kemungkinan rekening titipan (nominee/omnibus): private bank & broker asing, sekuritas, rekening registrar. Pemilik sebenarnya tidak terlihat.",
  lainnya: "Tipe investor tidak tercantum.",
};

export function CatBadge({ cat }: { cat: OwnerCat }) {
  return (
    <span className={`own-cat own-${cat}`} title={CAT_INFO[cat]}>
      {CAT_LABEL[cat]}
    </span>
  );
}

function Delta({ now, before }: { now: number; before: number | null }) {
  if (before == null) return <span className="buy small">baru</span>;
  const d = now - before;
  if (Math.abs(d) < 0.005) return <span className="dim">—</span>;
  return <span className={d > 0 ? "buy" : "sell"}>{fmtPct(d, 2)}</span>;
}

// ---------------------------------------------------------------- hash params (#/pemegang?h=KEY | ?s=CODE)
function readParams() {
  const h = window.location.hash;
  const i = h.indexOf("?");
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : "");
}
function useParams() {
  const [p, setP] = useState(readParams);
  useEffect(() => {
    const on = () => setP(readParams());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return p;
}
const go = (q: Record<string, string>) => {
  const s = new URLSearchParams(q).toString();
  window.location.hash = `#/pemegang${s ? `?${s}` : ""}`;
  window.scrollTo({ top: 0 });
};

// ---------------------------------------------------------------- search
function Search() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Awaited<ReturnType<typeof api.ownersSearch>> | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) {
      setRes(null);
      return;
    }
    const t = setTimeout(() => api.ownersSearch(q.trim()).then(setRes).catch(() => setRes(null)), 250);
    return () => clearTimeout(t);
  }, [q]);
  const pick = (p: Record<string, string>) => {
    setQ("");
    setRes(null);
    go(p);
  };
  return (
    <div className="own-search">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari nama pemegang (mis. Lo Kheng Hong, Salim, Norway) atau kode saham…"
        aria-label="Cari pemegang atau saham"
      />
      {res && (res.holders.length > 0 || res.stocks.length > 0) && (
        <div className="own-results" role="listbox">
          {res.stocks.map((s) => (
            <button key={s.code} type="button" onClick={() => pick({ s: s.code })}>
              <b className="mono">{s.code}</b> <span className="muted">{s.name}</span> <span className="dim small">· saham</span>
            </button>
          ))}
          {res.holders.map((h) => (
            <button key={h.hkey} type="button" onClick={() => pick({ h: h.hkey })}>
              {h.name} <CatBadge cat={h.cat} /> <span className="dim small">· {h.n} saham</span>
            </button>
          ))}
        </div>
      )}
      {res && res.holders.length === 0 && res.stocks.length === 0 && <div className="own-results"><span className="dim small pad-s">Tidak ditemukan.</span></div>}
    </div>
  );
}

// ---------------------------------------------------------------- network graph (radial)
interface CoNode { hkey: string; name: string; cat: OwnerCat; n: number; links: Array<{ code: string; pct: number }>; ang: number; x: number; y: number }

function Network({ rows, center, showCustody }: { rows: NetworkRow[]; center: string; showCustody: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // phones: the drawing is wider than the screen; start with the center in view
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [center]);
  const W = 1000, H = 680, cx = 500, cy = 340, R1 = 150, RX = 330, RY = 270;
  const g = useMemo(() => {
    const mine = rows.filter((r) => r.hkey === center).sort((a, b) => b.pct - a.pct).slice(0, 16);
    const me = mine[0];
    const stocks = mine.map((r, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / mine.length;
      return { code: r.code, pct: r.pct, ang, x: cx + R1 * Math.cos(ang), y: cy + R1 * Math.sin(ang) };
    });
    const byCode = new Map(stocks.map((s) => [s.code, s]));
    const co = new Map<string, CoNode>();
    for (const s of stocks) {
      const others = rows
        .filter((r) => r.code === s.code && r.hkey !== center && (showCustody || r.cat !== "kustodian"))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 5);
      for (const r of others) {
        const n = co.get(r.hkey) ?? { hkey: r.hkey, name: r.name, cat: r.cat, n: r.n_stocks, links: [], ang: 0, x: 0, y: 0 };
        n.links.push({ code: r.code, pct: r.pct });
        co.set(r.hkey, n);
      }
    }
    // keep the most connected / largest co-holders
    const nodes = [...co.values()]
      .sort((a, b) => b.links.length - a.links.length || Math.max(...b.links.map((l) => l.pct)) - Math.max(...a.links.map((l) => l.pct)))
      .slice(0, 36);
    // angle = circular mean of the linked stocks, then spread so labels do not overlap
    for (const n of nodes) {
      let sx = 0, sy = 0;
      for (const l of n.links) {
        const s = byCode.get(l.code)!;
        sx += Math.cos(s.ang);
        sy += Math.sin(s.ang);
      }
      n.ang = Math.atan2(sy, sx);
    }
    nodes.sort((a, b) => a.ang - b.ang);
    const gap = Math.min((2 * Math.PI) / Math.max(nodes.length, 1), 0.2);
    for (let it = 0; it < 60; it += 1) {
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i], b = nodes[(i + 1) % nodes.length];
        let d = b.ang - a.ang;
        if (i === nodes.length - 1) d += 2 * Math.PI;
        if (nodes.length > 1 && d < gap) {
          a.ang -= (gap - d) / 2;
          b.ang += (gap - d) / 2;
        }
      }
    }
    for (const n of nodes) {
      n.x = cx + RX * Math.cos(n.ang);
      n.y = cy + RY * Math.sin(n.ang);
    }
    // labels sit left or right of their dot: keep ≥ 17 px between labels on the same side
    for (const right of [true, false]) {
      const side = nodes.filter((n) => Math.cos(n.ang) >= 0 === right).sort((a, b) => a.y - b.y);
      for (let i = 1; i < side.length; i += 1) side[i].y = Math.max(side[i].y, side[i - 1].y + 17);
      const over = side.length ? side[side.length - 1].y - (H - 16) : 0;
      if (over > 0) for (const n of side) n.y = Math.max(16, n.y - over);
      for (let i = side.length - 2; i >= 0; i -= 1) side[i].y = Math.min(side[i].y, side[i + 1].y - 17);
    }
    return { me, stocks, byCode, nodes };
  }, [rows, center, showCustody]);

  if (!g.me) return <div className="state">Belum ada data jaringan.</div>;
  const lit = (code: string, key?: string) =>
    !hover || hover === code || hover === key || (hover === center && !key) ||
    g.nodes.some((n) => n.hkey === hover && n.links.some((l) => l.code === code) && (!key || key === hover));
  // label length limited by the room left before the edge of the drawing (≈ 6.5 px per character)
  const short = (s: string, room = 26 * 6.5) => {
    const max = Math.max(6, Math.min(26, Math.floor(room / 6.5)));
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  };
  return (
    <div className="own-net" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Jaringan kepemilikan ${g.me.name}`}>
        {/* co-holder edges */}
        {g.nodes.flatMap((n) =>
          n.links.map((l) => {
            const s = g.byCode.get(l.code)!;
            return (
              <line key={`${n.hkey}-${l.code}`} x1={s.x} y1={s.y} x2={n.x} y2={n.y} className={`own-edge own-${n.cat}-stroke`}
                strokeWidth={0.8 + l.pct / 15} opacity={lit(l.code, n.hkey) ? 0.55 : 0.08} />
            );
          }),
        )}
        {/* center edges */}
        {g.stocks.map((s) => (
          <line key={`c-${s.code}`} x1={cx} y1={cy} x2={s.x} y2={s.y} className={`own-edge own-${g.me.cat}-stroke`}
            strokeWidth={1.2 + s.pct / 10} opacity={lit(s.code) ? 0.8 : 0.12} />
        ))}
        {/* co-holders */}
        {g.nodes.map((n) => {
          const right = Math.cos(n.ang) >= 0;
          return (
            <g key={n.hkey} className="own-node" opacity={!hover || hover === n.hkey || n.links.some((l) => l.code === hover) ? 1 : 0.25}
              onMouseEnter={() => setHover(n.hkey)} onMouseLeave={() => setHover(null)} onClick={() => go({ h: n.hkey })}>
              <title>{`${n.name} (${CAT_LABEL[n.cat]}) · ${n.links.map((l) => `${l.code} ${nf2.format(l.pct)}%`).join(", ")} · total ${n.n} saham ≥1% · klik untuk membuka`}</title>
              <circle cx={n.x} cy={n.y} r={5 + Math.min(9, n.n)} className={`own-${n.cat}-fill`} />
              <text x={n.x + (right ? 1 : -1) * (12 + Math.min(9, n.n))} y={n.y + 4} textAnchor={right ? "start" : "end"} className="own-label">
                {short(n.name, right ? W - n.x - 24 : n.x - 24)}
              </text>
            </g>
          );
        })}
        {/* stocks */}
        {g.stocks.map((s) => (
          <g key={s.code} className="own-node" opacity={!hover || lit(s.code) ? 1 : 0.25}
            onMouseEnter={() => setHover(s.code)} onMouseLeave={() => setHover(null)} onClick={() => go({ s: s.code })}>
            <title>{`${s.code}: ${g.me.name} ${nf2.format(s.pct)}% · klik untuk melihat semua pemegang`}</title>
            <circle cx={s.x} cy={s.y} r={21} className="own-stock" />
            <text x={s.x} y={s.y - 1} textAnchor="middle" className="own-code">{s.code}</text>
            <text x={s.x} y={s.y + 11} textAnchor="middle" className="own-pct">{nf2.format(s.pct)}%</text>
          </g>
        ))}
        {/* center */}
        <g className="own-node" onMouseEnter={() => setHover(center)} onMouseLeave={() => setHover(null)}>
          <circle cx={cx} cy={cy} r={30} className={`own-${g.me.cat}-fill`} />
          <text x={cx} y={cy + 48} textAnchor="middle" className="own-center-label">{short(g.me.name)}</text>
        </g>
      </svg>
      <div className="own-legend small">
        {(Object.keys(CAT_LABEL) as OwnerCat[]).filter((c) => c !== "lainnya").map((c) => (
          <span key={c}><i className={`dot own-${c}-bg`} /> {CAT_LABEL[c]}</span>
        ))}
        <span className="dim">· lingkar dalam = saham miliknya · lingkar luar = pemegang ≥ 1% lain di saham itu (maks. 5 per saham) · ukuran titik = jumlah saham yang dipegang · klik untuk pindah</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- views
function HolderView({ hkey }: { hkey: string }) {
  const data = useAsync(() => api.ownersHolder(hkey), [hkey]);
  const net = useAsync(() => api.ownersNetwork(hkey), [hkey]);
  const [custody, setCustody] = useState(false);
  if (data.error) return <ErrorBox error={data.error} />;
  if (!data.data) return <Loading what="kepemilikan" />;
  const rows = data.data.rows;
  if (!rows.length) return <div className="card pad"><p>Pemegang ini tidak ada di daftar ≥ 1% per {fmtDate(data.data.asOf, true)}.</p></div>;
  const h = rows[0];
  const total = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  return (
    <>
      <section className="card pad own-head">
        <div>
          <h2>{h.name}</h2>
          <div className="own-meta">
            <CatBadge cat={h.cat} /> <span className="muted small">{h.type ?? "tipe tidak tercantum"} · {h.local ? "Lokal" : `Asing${h.domicile ? ` (${h.domicile})` : ""}`}</span>
          </div>
        </div>
        <div className="own-stats">
          <div><span className="dim small">Saham ≥ 1%</span><b>{rows.length}</b></div>
          <div><span className="dim small">Nilai (harga terakhir)</span><b>{fmtRp(total)}</b></div>
        </div>
        {h.cat === "kustodian" && <p className="small own-warn">{CAT_INFO.kustodian}</p>}
      </section>
      <section className="card">
        <div className="card-head">
          <h2>Jaringan</h2>
          <label className="small muted own-toggle"><input type="checkbox" checked={custody} onChange={(e) => setCustody(e.target.checked)} /> tampilkan akun kustodian</label>
        </div>
        {net.data ? <Network rows={net.data.rows} center={hkey} showCustody={custody} /> : <Loading what="jaringan" />}
      </section>
      <section className="card">
        <div className="card-head"><h2>Kepemilikan per {fmtDate(data.data.asOf, true)}</h2><span className="dim small">vs {fmtDate(data.data.prev, true)}</span></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Saham</th><th className="num">Porsi</th><th className="num">Perubahan</th><th className="num">Lembar</th><th className="num">Nilai</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="clickable" onClick={() => go({ s: r.code! })}>
                  <td><b className="mono">{r.code}</b> <span className="dim small">{r.stock_name}</span></td>
                  <td className="num mono">{pct(r.pct)}</td>
                  <td className="num mono"><Delta now={r.pct} before={r.before} /></td>
                  <td className="num mono">{fmtNum(r.shares)}</td>
                  <td className="num mono">{fmtRp(r.value)}</td>
                </tr>
              ))}
              {data.data.exited.map((r) => (
                <tr key={`x-${r.code}`} className="clickable" onClick={() => go({ s: r.code })}>
                  <td><b className="mono">{r.code}</b> <span className="sell small">keluar dari daftar ≥ 1%</span></td>
                  <td className="num mono dim">&lt; 1%</td>
                  <td className="num mono sell">dari {pct(r.before)}</td>
                  <td className="num">—</td>
                  <td className="num">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function StockView({ code }: { code: string }) {
  const data = useAsync(() => api.ownersStock(code), [code]);
  if (data.error) return <ErrorBox error={data.error} />;
  if (!data.data) return <Loading what="pemegang saham" />;
  const rows: OwnerRow[] = data.data.rows;
  const sum = rows.reduce((a, r) => a + r.pct, 0);
  const cust = rows.filter((r) => r.cat === "kustodian").reduce((a, r) => a + r.pct, 0);
  return (
    <>
      <section className="card pad own-head">
        <div>
          <h2><span className="mono">{code}</span> <span className="muted">{data.data.stock?.name}</span></h2>
          <div className="own-meta small muted">
            Pemegang ≥ 1%: {rows.length} · total {pct(sum)} (kustodian {pct(cust)}) · sisanya &lt; 1% per pemegang
          </div>
        </div>
        <button type="button" className="btn" onClick={() => openStock(code)}>Detail saham →</button>
      </section>
      <section className="card">
        <div className="card-head"><h2>Pemegang per {fmtDate(data.data.asOf, true)}</h2><span className="dim small">vs {fmtDate(data.data.prev, true)}</span></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Pemegang</th><th>Kategori</th><th>Asal</th><th className="num">Porsi</th><th className="num">Perubahan</th><th className="num">Lembar</th><th className="num">Saham lain</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.hkey} className="clickable" onClick={() => go({ h: r.hkey })}>
                  <td className="wrap">{r.name}</td>
                  <td><CatBadge cat={r.cat} /></td>
                  <td className="small muted">{r.local ? "Lokal" : `Asing${r.domicile ? ` · ${r.domicile}` : ""}`}</td>
                  <td className="num mono">{pct(r.pct)}</td>
                  <td className="num mono"><Delta now={r.pct} before={r.before} /></td>
                  <td className="num mono">{fmtNum(r.shares)}</td>
                  <td className="num mono">{(r.n_stocks ?? 1) - 1 || "—"}</td>
                </tr>
              ))}
              {data.data.exited.map((r) => (
                <tr key={`x-${r.hkey}`} className="clickable" onClick={() => go({ h: r.hkey })}>
                  <td>{r.name} <span className="sell small">keluar dari daftar ≥ 1%</span></td>
                  <td><CatBadge cat={r.cat} /></td>
                  <td />
                  <td className="num mono dim">&lt; 1%</td>
                  <td className="num mono sell">dari {pct(r.before)}</td>
                  <td className="num">—</td>
                  <td className="num">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Summary() {
  const data = useAsync(() => api.ownersSummary(), []);
  const [dir, setDir] = useState<"all" | "up" | "down">("all");
  if (data.error) return <ErrorBox error={data.error} />;
  if (!data.data) return <Loading what="ringkasan" />;
  const s = data.data;
  if (s.empty || !s.counts) return <div className="card pad"><p>Data pemegang saham belum diimpor. Muncul setelah workflow "Pemegang saham ≥ 1%" berjalan.</p></div>;
  const changes = s.changes.filter((c) => dir === "all" || (dir === "up" ? c.delta > 0 : c.delta < 0));
  return (
    <>
      <section className="kpis">
        <div className="card kpi"><div className="kpi-label">Pemegang ≥ 1%</div><div className="kpi-value">{fmtNum(s.counts.holders)}</div><div className="kpi-sub">nama berbeda</div></div>
        <div className="card kpi"><div className="kpi-label">Saham</div><div className="kpi-value">{fmtNum(s.counts.stocks)}</div><div className="kpi-sub">{fmtNum(s.counts.rows)} baris kepemilikan</div></div>
        <div className="card kpi"><div className="kpi-label">Data per</div><div className="kpi-value own-kpi-date">{fmtDate(s.asOf, true)}</div><div className="kpi-sub">bulanan · dibanding {fmtDate(s.prev, true)}</div></div>
        <div className="card kpi"><div className="kpi-label">Riwayat</div><div className="kpi-value">{s.months.length}</div><div className="kpi-sub">bulan tersimpan</div></div>
      </section>
      <div className="own-grid">
        <section className="card">
          <div className="card-head">
            <h2><WithInfo info="Tanpa akun kustodian (pemilik sebenarnya tidak terlihat).">Pemegang di saham terbanyak</WithInfo></h2>
          </div>
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Pemegang</th><th className="num">Saham</th><th>Contoh</th></tr></thead>
              <tbody>
                {s.top.map((t) => (
                  <tr key={t.hkey} className="clickable" onClick={() => go({ h: t.hkey })}>
                    <td className="wrap">{t.name} <CatBadge cat={t.cat} /></td>
                    <td className="num mono">{t.n}</td>
                    <td className="mono small dim">{t.codes.split(",").slice(0, 4).join(" ")}{t.n > 4 ? " …" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2><WithInfo info="Perubahan porsi ≥ 0,5 poin, posisi baru, dan posisi yang keluar dari daftar ≥ 1%. Ganti nama (porsi sama) dan akun kustodian tidak dihitung.">Perubahan terbesar</WithInfo></h2>
            <div className="segmented" role="group" aria-label="Arah">
              <button type="button" aria-pressed={dir === "all"} onClick={() => setDir("all")}>Semua</button>
              <button type="button" aria-pressed={dir === "up"} onClick={() => setDir("up")}>Naik</button>
              <button type="button" aria-pressed={dir === "down"} onClick={() => setDir("down")}>Turun</button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Saham</th><th>Pemegang</th><th className="num">Sebelum</th><th className="num">Sekarang</th></tr></thead>
              <tbody>
                {changes.slice(0, 40).map((c) => (
                  <tr key={`${c.code}-${c.hkey}`} className="clickable" onClick={() => go({ h: c.hkey })}>
                    <td><button type="button" className="link-btn mono" onClick={(e) => { e.stopPropagation(); go({ s: c.code }); }}>{c.code}</button></td>
                    <td className="wrap">{c.name} <CatBadge cat={c.cat} /></td>
                    <td className="num mono">{c.before ? pct(c.before) : <span className="buy small">baru</span>}</td>
                    <td className={`num mono ${c.delta > 0 ? "buy" : "sell"}`}>{c.pct ? pct(c.pct) : "< 1%"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

export default function Owners() {
  const p = useParams();
  const hkey = p.get("h");
  const code = p.get("s")?.toUpperCase() ?? null;
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Pemegang Saham</h1>
          <p className="muted">
            Daftar pemegang ≥ 1% per saham (BEI/KSEI, bulanan) · klik nama atau kode untuk berpindah
            {(hkey || code) && <> · <a href="#/pemegang">← ringkasan</a></>}
          </p>
        </div>
      </div>
      <Search />
      {hkey ? <HolderView key={hkey} hkey={hkey} /> : code ? <StockView key={code} code={code} /> : <Summary />}
      <p className="small dim">
        Hanya pemegang ≥ 1% (sisanya tidak tercantum). Nama ditulis apa adanya oleh KSEI; ejaan berbeda dari pemegang yang sama
        digabung otomatis, tapi tidak selalu sempurna. Akun kustodian/nominee menyembunyikan pemilik sebenarnya. Data kepemilikan
        bulanan tidak terbukti memprediksi harga bulan berikutnya (uji SATS 2023–2026); gunakan sebagai informasi.
      </p>
    </main>
  );
}
