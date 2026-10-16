import { useEffect, useState } from "react";
import { api, type LabRow } from "../api";
import { fmt1, fmtPct } from "../format";

// One fetch per page load, shared by every badge.
let cache: Promise<Map<string, LabRow>> | null = null;
const loadLab = () =>
  (cache ??= api
    .lab()
    .then((r) => new Map(r.rows.map((x) => [x.id, x])))
    .catch(() => new Map<string, LabRow>()));

export function useLab(): Map<string, LabRow> | null {
  const [m, setM] = useState<Map<string, LabRow> | null>(null);
  useEffect(() => {
    let live = true;
    loadLab().then((x) => live && setM(x));
    return () => {
      live = false;
    };
  }, []);
  return m;
}

/** "✓ Teruji di BEI" / "✗ Kalah dari pasar" for a lab test id; nothing when neutral or not tested yet. */
export default function LabBadge({ id }: { id: string }) {
  const lab = useLab();
  const r = lab?.get(id);
  if (!r || (r.verdict !== "teruji" && r.verdict !== "berlawanan")) return null;
  const good = r.verdict === "teruji";
  const title =
    `Uji 3 tahun di BEI: ${r.n10} sinyal · menang ${fmt1(r.win10)}% dalam 10 hari · ` +
    `rata-rata ${fmtPct(r.avg10, 2)} (${fmtPct(r.ex10, 2)} vs pasar). Detail di menu Lab Uji.`;
  return (
    <a className={`lab-badge ${good ? "ok" : "bad"}`} href="#/lab" title={title} onClick={(e) => e.stopPropagation()}>
      {good ? (r.expect === "down" ? "✓ Teruji sebagai peringatan" : "✓ Teruji di BEI") : "✗ Kalah dari pasar"}
    </a>
  );
}

/** Tiny ✓ / ✗ for use inside buttons (chips), where a link is not allowed. */
export function LabMark({ id }: { id: string }) {
  const r = useLab()?.get(id);
  if (!r || (r.verdict !== "teruji" && r.verdict !== "berlawanan")) return null;
  const good = r.verdict === "teruji";
  return (
    <span className={`lab-mark ${good ? "ok" : "bad"}`} title={`${good ? "Teruji di BEI" : "Kalah dari pasar"}: ${r.n10} sinyal, ${fmtPct(r.ex10, 2)} vs pasar dalam 10 hari`}>
      {good ? " ✓" : " ✗"}
    </span>
  );
}
