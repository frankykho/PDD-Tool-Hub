import { useState } from "react";
import { api } from "../api";
import { fmtDate, fmtNum } from "../format";
import { parseIdxSummary } from "../flow/idxSummary";
import { readXlsx } from "../flow/xlsx";

interface Log { file: string; ok: boolean; text: string }

/** Admin: unggah file "Ringkasan Saham" BEI (.xlsx), satu atau beberapa tanggal sekaligus. Dibaca di browser, dikirim per tanggal. */
export default function IdxUpload({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Log[]>([]);
  const run = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setLog([]);
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
    for (const f of sorted) {
      try {
        const { date, rows } = parseIdxSummary(await readXlsx(await f.arrayBuffer()), f.name);
        if (!date) throw new Error("tanggal tidak terbaca (beri nama file berisi YYYYMMDD, mis. Ringkasan Saham-20261023.xlsx)");
        const res = await api.flowUpload(date, rows);
        setLog((l) => [...l, { file: f.name, ok: true, text: `${fmtDate(res.date, true)} · ${fmtNum(res.rows)} saham` }]);
      } catch (e) {
        setLog((l) => [...l, { file: f.name, ok: false, text: e instanceof Error ? e.message : String(e) }]);
      }
    }
    setBusy(false);
    onDone();
  };
  return (
    <section className="card pad">
      <h2>Unggah Ringkasan Saham BEI (admin)</h2>
      <p className="small muted">
        Data resmi frekuensi & volume, juga untuk tanggal lalu (mengisi histori). Di idx.co.id: Data Pasar → Ringkasan Perdagangan → Ringkasan Saham,
        pilih tanggal, lalu unduh Excel. Pilih satu atau beberapa file di sini; tanggal diambil dari nama file (YYYYMMDD) atau isi file.
        Tanggal yang sudah ada akan ditimpa.
      </p>
      <label className="btn idx-up">
        <input type="file" accept=".xlsx" multiple disabled={busy} onChange={(e) => { void run(e.target.files); e.target.value = ""; }} />
        {busy ? "Memproses…" : "Pilih file .xlsx"}
      </label>
      {log.length > 0 && (
        <ul className="idx-log small">
          {log.map((l) => (
            <li key={l.file} className={l.ok ? "buy" : "sell"}>{l.ok ? "✓" : "✗"} {l.file}: <span className="muted">{l.text}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}
