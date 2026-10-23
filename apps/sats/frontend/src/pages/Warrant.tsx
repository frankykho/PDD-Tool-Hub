import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { fmt1, fmtNum, fmtPct } from "../format";
import { scenarios, warrant } from "../warrant";

const KEY = "sats.warrant";
const parseNum = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "")) || 0;
const rp = (v: number) => `Rp ${fmtNum(Math.round(v))}`;
const rp2 = (v: number) => `Rp ${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;

interface Form { code: string; spot: string; strike: string; ratio: string; price: string; expiry: string; lots: string }
function load(): Form {
  const def: Form = { code: "", spot: "", strike: "", ratio: "5", price: "", expiry: "", lots: "10" };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return def;
  }
}

/** Kalkulator edukasi waran terstruktur (call, gaya Eropa, tunai): titik impas, premium, gearing, dan skenario saat jatuh tempo. */
export default function Warrant() {
  const [f, setF] = useState<Form>(() => {
    const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    const v = load();
    return q.get("u") ? { ...v, code: q.get("u")!.toUpperCase(), spot: "" } : v;
  });
  const [msg, setMsg] = useState("");
  const set = (p: Partial<Form>) =>
    setF((o) => {
      const n = { ...o, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(n));
      } catch {
        /* abaikan */
      }
      return n;
    });
  // harga saham induk dari data EOD SATS
  useEffect(() => {
    const code = f.code.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code) || f.spot) return;
    let on = true;
    setMsg("Mengambil harga " + code + "…");
    api
      .stock("SATS", code)
      .then((r) => {
        if (!on) return;
        const c = r.stock && r.stock.close;
        if (c) set({ spot: String(c) });
        setMsg(c ? `Harga penutupan ${code} dari data SATS` : `Harga ${code} tidak ditemukan; isi manual.`);
      })
      .catch(() => on && setMsg(`Harga ${code} tidak ditemukan; isi manual.`));
    return () => {
      on = false;
    };
  }, [f.code]);

  const w = { spot: parseNum(f.spot), strike: parseNum(f.strike), ratio: parseNum(f.ratio), price: parseNum(f.price), expiry: f.expiry, qty: Math.round(parseNum(f.lots)) * 100 };
  const r = useMemo(() => warrant(w), [f]);
  const S = useMemo(() => scenarios(w), [f]);
  const field = (k: keyof Form, label: string, ph: string, type = "text") => (
    <label>
      <span>{label}</span>
      <input type={type} inputMode={type === "text" && k !== "code" ? "decimal" : undefined} placeholder={ph} value={f[k]}
        onChange={(e) => set(k === "code" ? { code: e.target.value.toUpperCase(), spot: "" } : { [k]: e.target.value })} />
    </label>
  );
  return (
    <main className="page">
      <h1>Kalkulator Waran Terstruktur</h1>
      <p className="dim small">
        Untuk edukasi dan materi Product Marketing: waran terstruktur (SW) jenis call, gaya Eropa, diselesaikan tunai saat jatuh tempo. Isi data dari
        term sheet penerbit. Bukan rekomendasi membeli atau menjual.
      </p>
      <div className="calc">
        <div className="calc-inputs">
          {field("code", "Saham induk", "mis. BBCA")}
          {field("spot", "Harga saham induk", "Rp")}
          {field("strike", "Harga pelaksanaan", "Rp")}
          {field("ratio", "Rasio (SW : 1 saham)", "mis. 5")}
          {field("price", "Harga SW", "Rp")}
          {field("expiry", "Jatuh tempo", "", "date")}
          {field("lots", "Jumlah lot SW", "1 lot = 100 SW")}
        </div>
        {msg && <p className="dim small">{msg}</p>}
      </div>
      {!r ? (
        <p className="dim">Isi harga saham induk, harga pelaksanaan, rasio, dan harga SW.</p>
      ) : (
        <>
          <div className="track-mini" style={{ marginTop: 16 }}>
            <div><span className="dim small">Status</span><strong className={r.status === "ITM" ? "buy" : r.status === "OTM" ? "sell" : ""}>{r.status === "ITM" ? "In the money" : r.status === "OTM" ? "Out of the money" : "At the money"} ({fmtPct(r.moneyness)})</strong></div>
            <div><span className="dim small">Titik impas saham induk</span><strong className="mono">{rp2(r.breakeven)}</strong></div>
            <div><span className="dim small">Premium (perlu naik)</span><strong className="mono">{fmtPct(r.premium)}</strong></div>
            <div><span className="dim small">Gearing</span><strong className="mono">{fmt1(r.gearing)}×</strong></div>
            <div><span className="dim small">Nilai intrinsik / SW</span><strong className="mono">{rp2(r.intrinsic)}</strong></div>
            <div><span className="dim small">Nilai waktu / SW</span><strong className="mono">{rp2(r.timeValue)}</strong></div>
            <div><span className="dim small">Sisa hari</span><strong className="mono">{r.daysLeft == null ? "—" : r.daysLeft < 0 ? "lewat" : `${r.daysLeft} hari`}</strong></div>
            <div><span className="dim small">Modal ({fmtNum(w.qty)} SW)</span><strong className="mono">{rp(r.cost)}</strong></div>
          </div>
          <h2 style={{ marginTop: 20 }}>Skenario saat jatuh tempo</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Saham induk</th><th className="num">Perubahan</th><th className="num">Nilai / SW</th><th className="num">Untung / rugi</th><th className="num">%</th></tr>
              </thead>
              <tbody>
                {S.map((x) => (
                  <tr key={x.mark + x.chg} style={x.mark ? { fontWeight: 600 } : undefined}>
                    <td className="mono">{rp2(x.sT)} {x.mark && <span className="dim small">· {x.mark}</span>}</td>
                    <td className={`num mono ${x.chg >= 0 ? "buy" : "sell"}`}>{fmtPct(x.chg)}</td>
                    <td className="num mono">{rp2(x.value)}</td>
                    <td className={`num mono ${x.pl >= 0 ? "buy" : "sell"}`}>{rp(x.pl)}</td>
                    <td className={`num mono ${x.plPct >= 0 ? "buy" : "sell"}`}>{fmtPct(x.plPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="dim small" style={{ marginTop: 12 }}>
            <li>Nilai saat jatuh tempo = maks(0, harga saham induk − harga pelaksanaan) ÷ rasio. Di bawah harga pelaksanaan, SW bernilai nol (modal hilang seluruhnya).</li>
            <li>Gearing {fmt1(r.gearing)}× artinya modal yang sama bisa “mengendalikan” saham induk {fmt1(r.gearing)} kali lipat; untung dan rugi ikut membesar.</li>
            <li>Sebelum jatuh tempo, harga SW juga dipengaruhi sisa waktu, volatilitas, dan kuotasi penerbit (market maker); skenario di atas hanya nilai pada jatuh tempo.</li>
            <li>Belum termasuk biaya transaksi dan pajak. SW cocok untuk investor yang memahami risikonya.</li>
          </ul>
        </>
      )}
    </main>
  );
}
