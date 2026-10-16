import type { RiskFlag, StatusKind } from "../format";
import { positionPct } from "../format";

export function SidePill({ side }: { side: "BUY" | "SELL" | null }) {
  if (!side) return <span className="muted">—</span>;
  return <span className={`pill ${side === "BUY" ? "buy" : "sell"}`}>{side}</span>;
}

export function StatusPill({ label, kind }: { label: string; kind: StatusKind }) {
  return <span className={`status ${kind}`}>{label}</span>;
}

/** Mini bar: SL (0%) — Entry (25%) — TP1 (50%) — TP2 (75%) — TP3 (100%), dot = last close. */
export function PositionBar(props: { close: number | null; sl: number | null; tp3: number | null }) {
  const pos = positionPct(props);
  if (pos == null) return <span className="muted">—</span>;
  return (
    <div className="posbar" role="img" aria-label={`Posisi harga ${pos.toFixed(0)}% dari SL ke TP3`}>
      <div className="posbar-risk" />
      <div className="posbar-reward" />
      <div className="posbar-tick entry" style={{ left: "25%" }} />
      <div className="posbar-tick" style={{ left: "50%" }} />
      <div className="posbar-tick" style={{ left: "75%" }} />
      <div className="posbar-dot" style={{ left: `${pos}%` }} />
    </div>
  );
}

/** Skeleton placeholder: shows the shape of what is coming instead of a bare "loading" line. */
export function Loading({ what }: { what: string }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">Memuat {what}…</span>
      {[72, 100, 92, 100, 84, 64].map((w, i) => (
        <span key={i} className="sk-line" style={{ width: `${w}%` }} aria-hidden="true" />
      ))}
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  return <div className="state error">Gagal memuat data: {error}</div>;
}

export function RiskFlags({ flags }: { flags: RiskFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="risk-flags">
      {flags.map((f) => (
        <span key={f.key} className="risk-flag" title={f.title}>
          ⚠ {f.label}
        </span>
      ))}
    </div>
  );
}

/** "Lolos filter" badge for SATS BUY rows (MA200 & IHSG on the signal day). */
export function FilterBadge({ pass }: { pass: number | null }) {
  if (pass == null) return null;
  return pass ? (
    <span className="filter-badge pass" title="BUY ini lolos filter MA200 & IHSG pada hari sinyal">
      ✓ lolos filter
    </span>
  ) : (
    <span className="filter-badge fail" title="BUY ini TIDAK lolos filter MA200 & IHSG pada hari sinyal">
      ✕ tidak lolos
    </span>
  );
}

/**
 * Setup grade from the Lab Uji: A = close > MA200 and ≤ 5% from the 52-week high, A+ = also RS ≥ 80.
 * SATS BUYs in that state clearly beat the market in the 3-year test; other BUYs did not.
 */
export function gradeOf(r: { dist_high52?: number | null; dist_ma200?: number | null; rs_rank?: number | null }): "A+" | "A" | null {
  if ((r.dist_high52 ?? -999) < -5 || (r.dist_ma200 ?? -1) <= 0) return null;
  return (r.rs_rank ?? 0) >= 80 ? "A+" : "A";
}

export function GradeBadge({ row }: { row: Parameters<typeof gradeOf>[0] }) {
  const g = gradeOf(row);
  if (!g) return null;
  return (
    <span
      className={`grade ${g === "A+" ? "aplus" : ""}`}
      title={
        g === "A+"
          ? "A+: dekat harga tertinggi 52 minggu, di atas MA200, dan RS ≥ 80. Di Lab Uji, BUY SATS dalam kondisi ini paling unggul dari pasar."
          : "A: dekat harga tertinggi 52 minggu dan di atas MA200. Di Lab Uji, BUY SATS dalam kondisi ini jauh lebih bagus dari BUY biasa."
      }
    >
      {g}
    </span>
  );
}
