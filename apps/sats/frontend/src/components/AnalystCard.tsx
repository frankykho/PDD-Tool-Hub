import { useEffect, useState, type ReactNode } from "react";
import { api, type Analysis, type AnalystResponse } from "../api";
import { fmtDate } from "../format";

/** **tebal** di dalam satu baris -> <strong> (teks lain tetap teks biasa, tidak ada HTML dari AI) */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
}

/** Markdown sederhana dari AI: "## judul", poin "- ", paragraf. */
function AiText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`u${out.length}`}>{list.map((x, i) => <li key={i}>{inline(x)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l) { flush(); continue; }
    const h = /^#{1,4}\s+(.*)$/.exec(l), b = /^[-*•]\s+(.*)$/.exec(l);
    if (h) { flush(); out.push(<h3 key={`h${out.length}`}>{inline(h[1].replace(/\*\*/g, ""))}</h3>); }
    else if (b) list.push(b[1]);
    else { flush(); out.push(<p key={`p${out.length}`}>{inline(l)}</p>); }
  }
  flush();
  // hasil AI tetap bahasa aslinya (tidak ikut diterjemahkan mesin bahasa)
  return <div className="ai-text" translate="no">{out}</div>;
}

type News = { judul: string; sumber: string; tanggal: string; tautan?: string };

function Result({ a, old }: { a: Analysis; old?: boolean }) {
  const news = ((a.data?.berita_7_hari as News[] | undefined) ?? []).filter((n) => n.tautan);
  return (
    <>
      {old && <p className="ai-note">Analisis ini dari data {fmtDate(a.as_of, true)}. Data sudah diperbarui; buat analisis baru untuk angka terbaru.</p>}
      {a.advice && <p className="ai-note warn">Teks AI di bawah memuat kalimat bernada rekomendasi. Abaikan bagian itu: analisis ini hanya penjelasan data.</p>}
      <AiText text={a.text} />
      <p className="dim small">
        Dibuat {a.created_at.slice(0, 16).replace("T", " ")} WIB{a.created_by ? ` oleh ${a.created_by}` : ""} · data per {fmtDate(a.as_of, true)}
        {a.model ? ` · model ${a.model}` : ""}
      </p>
      {news.length > 0 && (
        <div className="ai-news">
          <span className="dim small">Berita yang dipakai:</span>
          <ul>
            {news.map((n, i) => (
              <li key={i}>
                <a href={n.tautan} target="_blank" rel="noreferrer" translate="no">
                  {n.judul}
                </a>{" "}
                <span className="dim small">
                  · {n.sumber} · {fmtDate(n.tanggal)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.data && (
        <details className="ai-data">
          <summary>Data yang dikirim ke AI</summary>
          <pre>{JSON.stringify(a.data, null, 1)}</pre>
        </details>
      )}
    </>
  );
}

/** Kartu "Analisis AI" di halaman saham: penjelasan dari data, dibuat sekali per saham per tanggal data (dipakai bersama satu tim). */
export default function AnalystCard({ code }: { code: string }) {
  const [res, setRes] = useState<AnalystResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setRes(null);
    setErr(null);
    api.analyst(code).then((r) => live && setRes(r)).catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [code]);
  const make = () => {
    setBusy(true);
    setErr(null);
    api
      .makeAnalysis(code)
      .then(setRes)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  const q = res?.quota, left = q ? Math.max(0, q.limit - q.used) : null;
  return (
    <section className="card ai-card">
      <div className="card-head">
        <h2>
          Analisis AI <span className="ai-beta">uji coba</span>
        </h2>
        <span className="muted small">Penjelasan kondisi saham dari data teknikal, sinyal, fundamental, berita, dan corporate action</span>
      </div>
      <div className="pad">
        {err && <p className="ai-note warn">{err}</p>}
        {!res && !err ? (
          <p className="muted">Memuat…</p>
        ) : res?.analysis ? (
          <Result a={res.analysis} />
        ) : (
          <>
            <div className="ai-make">
              <button type="button" className="btn primary" onClick={make} disabled={busy || left === 0}>
                {busy ? "Menyusun analisis…" : "Buat analisis AI"}
              </button>
              <span className="dim small">
                {busy
                  ? "Biasanya 10–40 detik. AI membaca data saham ini, berita 7 hari, dividen, dan stock split."
                  : q
                    ? `Sekali per saham per hari data, dipakai bersama tim. Sisa kuota tim hari ini: ${left} dari ${q.limit}.`
                    : ""}
              </span>
            </div>
            {res?.previous && <Result a={res.previous} old />}
          </>
        )}
        <p className="dim small ai-disc">
          Dibuat AI dari data yang tercantum, bisa keliru atau tidak lengkap; cek angkanya di halaman ini dan sumber berita aslinya. Bukan
          rekomendasi beli atau jual. Rights issue, RUPS, dan buyback belum tercakup.
        </p>
      </div>
    </section>
  );
}
