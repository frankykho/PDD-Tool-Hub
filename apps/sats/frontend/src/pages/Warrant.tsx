import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api";
import { fmt1, fmtNum, fmtPct } from "../format";
import { scenarios, warrant } from "../warrant";
import { WithInfo } from "../components/Info";

const KEY = "sats.warrant";

/** Penjelasan untuk orang awam: isian (I), hasil (R), dan kolom skenario (S). Bahasa sehari-hari + tips. */
const I: Record<string, ReactNode> = {
  code: <>Kode saham yang menjadi dasar SW, mis. <b>BBCA</b>. Nilai SW naik-turun mengikuti harga saham ini. Harga terakhirnya diisi otomatis dari data SATS.</>,
  spot: <>Harga saham induk saat ini. Terisi otomatis dari harga penutupan terakhir; ubah bila ingin memakai harga berjalan.</>,
  strike: <>Harga yang “dijanjikan” di term sheet (<i>exercise price</i>). Saat jatuh tempo, SW hanya bernilai bila harga saham induk <b>di atas</b> angka ini. <br /><b>Tips:</b> lihat di term sheet atau halaman produk penerbit.</>,
  ratio: <>Berapa lembar SW setara 1 lembar saham. Rasio <b>5</b> artinya 5 SW : 1 saham, jadi selisih harga saham dibagi 5 per lembar SW. <br /><b>Tips:</b> tertulis di term sheet sebagai <i>exercise ratio</i>.</>,
  price: <>Harga beli 1 lembar SW di bursa (harga yang ditawarkan market maker).</>,
  expiry: <>Tanggal terakhir SW berlaku. Setelah itu SW diselesaikan tunai otomatis; kalau harga saham di bawah harga pelaksanaan, SW hangus (nilai nol). <br /><b>Tips:</b> makin dekat jatuh tempo, makin cepat nilai waktunya habis.</>,
  lots: <>Jumlah lot yang ingin dihitung. 1 lot = 100 lembar SW. Dipakai untuk modal dan untung/rugi di tabel.</>,
};
const R: Record<string, ReactNode> = {
  status: <><b>In the money (ITM)</b>: harga saham sudah di atas harga pelaksanaan, SW punya nilai nyata. <b>At the money</b>: hampir sama. <b>Out of the money (OTM)</b>: masih di bawah; SW hanya bernilai bila saham naik sebelum jatuh tempo. <br /><b>Tips:</b> OTM lebih murah tapi lebih berisiko hangus.</>,
  breakeven: <>Harga saham induk yang dibutuhkan saat jatuh tempo supaya <b>balik modal</b> (tidak untung, tidak rugi). Rumus: harga pelaksanaan + harga SW × rasio.</>,
  premium: <>Berapa persen saham induk harus naik dari harga sekarang sampai titik impas. <br /><b>Tips:</b> makin kecil makin mudah balik modal; bandingkan dengan sisa hari.</>,
  gearing: <>“Daya ungkit”: modal yang sama di SW mewakili saham senilai sekian kali lipat. Gearing 10× berarti Rp1 juta di SW ≈ eksposur saham Rp10 juta, sehingga naik-turun nilai SW (dalam %) biasanya jauh lebih besar daripada saham. <br /><b>Ingat:</b> untung <i>dan</i> rugi ikut membesar.</>,
  intrinsic: <>Nilai SW kalau jatuh tempo hari ini: (harga saham − harga pelaksanaan) ÷ rasio, minimal nol.</>,
  time: <>Selisih harga SW dengan nilai intrinsiknya: “harga harapan” atas sisa waktu. Bagian ini menyusut sampai nol menjelang jatuh tempo (<i>time decay</i>).</>,
  days: <>Hari kalender sampai jatuh tempo. Di bawah ±30 hari, harga SW biasanya lebih cepat turun bila saham tidak bergerak naik.</>,
  cost: <>Total uang yang dibayar: harga SW × jumlah SW (belum termasuk biaya transaksi). Ini juga kerugian maksimal bila SW hangus.</>,
};
const SC: Record<string, ReactNode> = {
  price: <>Contoh harga saham induk pada tanggal jatuh tempo. Baris tebal = harga pelaksanaan dan titik impas.</>,
  chg: <>Perubahan dari harga saham sekarang ke harga contoh tersebut.</>,
  value: <>Nilai 1 lembar SW yang diterima saat jatuh tempo pada harga saham itu.</>,
  pl: <>Untung/rugi total untuk jumlah lot yang diisi: (nilai saat jatuh tempo − harga beli) × jumlah SW.</>,
  pct: <>Untung/rugi dibanding modal. −100% artinya modal hilang seluruhnya.</>,
};
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
      <span><WithInfo info={I[k]}>{label}</WithInfo></span>
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
      <details className="card pad" style={{ margin: "12px 0" }} open={!r}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Belum kenal waran terstruktur? Baca ini dulu</summary>
        <div className="small" style={{ marginTop: 8, lineHeight: 1.6 }}>
          <p style={{ margin: "0 0 6px" }}>
            Waran terstruktur (SW) adalah produk yang diterbitkan sekuritas atas saham tertentu. Membeli SW <b>call</b> seperti “bertaruh” harga saham itu akan
            berada di atas harga tertentu (harga pelaksanaan) saat jatuh tempo, dengan modal jauh lebih kecil daripada membeli sahamnya.
          </p>
          <p style={{ margin: "0 0 6px" }}>
            <b>Contoh mudah:</b> saham Rp10.000, harga pelaksanaan Rp9.500, rasio 5, harga SW Rp150. Saat jatuh tempo saham Rp11.000 → nilai SW = (11.000 −
            9.500) ÷ 5 = <b>Rp300</b>, dua kali harga beli. Kalau saham Rp9.000 (di bawah 9.500) → SW bernilai <b>Rp0</b>, modal hilang.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Isi data dari <b>term sheet</b> penerbit: harga pelaksanaan, rasio, dan jatuh tempo. Arahkan kursor / ketuk tanda <b>i</b> untuk penjelasan tiap kotak.</li>
            <li>Kerugian maksimal = modal yang dibayar; tidak bisa lebih dari itu.</li>
            <li>Sebelum jatuh tempo, SW bisa dijual kembali di bursa ke market maker.</li>
          </ul>
        </div>
      </details>
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
            <div><span className="dim small"><WithInfo info={R.status}>Status</WithInfo></span><strong className={r.status === "ITM" ? "buy" : r.status === "OTM" ? "sell" : ""}>{r.status === "ITM" ? "In the money" : r.status === "OTM" ? "Out of the money" : "At the money"} ({fmtPct(r.moneyness)})</strong></div>
            <div><span className="dim small"><WithInfo info={R.breakeven}>Titik impas saham induk</WithInfo></span><strong className="mono">{rp2(r.breakeven)}</strong></div>
            <div><span className="dim small"><WithInfo info={R.premium}>Premium (perlu naik)</WithInfo></span><strong className="mono">{fmtPct(r.premium)}</strong></div>
            <div><span className="dim small"><WithInfo info={R.gearing}>Gearing</WithInfo></span><strong className="mono">{fmt1(r.gearing)}×</strong></div>
            <div><span className="dim small"><WithInfo info={R.intrinsic}>Nilai intrinsik / SW</WithInfo></span><strong className="mono">{rp2(r.intrinsic)}</strong></div>
            <div><span className="dim small"><WithInfo info={R.time}>Nilai waktu / SW</WithInfo></span><strong className="mono">{rp2(r.timeValue)}</strong></div>
            <div><span className="dim small"><WithInfo info={R.days}>Sisa hari</WithInfo></span><strong className="mono">{r.daysLeft == null ? "—" : r.daysLeft < 0 ? "lewat" : `${r.daysLeft} hari`}</strong></div>
            <div><span className="dim small"><WithInfo info={R.cost}>Modal ({fmtNum(w.qty)} SW)</WithInfo></span><strong className="mono">{rp(r.cost)}</strong></div>
          </div>
          {/* kesimpulan dalam bahasa sehari-hari */}
          <div className="card pad" style={{ marginTop: 14 }}>
            <p style={{ margin: 0, lineHeight: 1.6 }}>
            <b>Artinya:</b>{" "}
            {r.status === "OTM"
              ? <>harga {f.code || "saham induk"} saat ini masih <b>di bawah</b> harga pelaksanaan, jadi kalau jatuh tempo hari ini SW bernilai nol. </>
              : <>harga {f.code || "saham induk"} saat ini sudah <b>di atas</b> harga pelaksanaan, jadi SW punya nilai nyata {rp2(r.intrinsic)} per lembar. </>}
            Supaya <b>balik modal</b> saat jatuh tempo, harga saham perlu {r.premium > 0 ? <>naik <b>{fmtPct(r.premium)}</b></> : <>tetap</>} ke sekitar <b>{rp2(r.breakeven)}</b>
            {r.daysLeft != null && r.daysLeft >= 0 ? <> dalam <b>{r.daysLeft} hari</b></> : null}. Dengan gearing <b>{fmt1(r.gearing)}×</b>, modal di SW mewakili saham {fmt1(r.gearing)} kali lebih besar,
            jadi persentase naik-turun nilai SW biasanya jauh lebih besar daripada sahamnya, baik saat untung maupun rugi.
            {r.daysLeft != null && r.daysLeft >= 0 && r.daysLeft < 30 ? <> <span className="sell">Jatuh tempo kurang dari 30 hari: nilai waktu cepat menyusut.</span></> : null}
            </p>
          </div>
          <h2 style={{ marginTop: 20 }}>Skenario saat jatuh tempo</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th><WithInfo info={SC.price}>Saham induk</WithInfo></th>
                  <th className="num"><WithInfo info={SC.chg}>Perubahan</WithInfo></th>
                  <th className="num"><WithInfo info={SC.value}>Nilai / SW</WithInfo></th>
                  <th className="num"><WithInfo info={SC.pl}>Untung / rugi</WithInfo></th>
                  <th className="num"><WithInfo info={SC.pct}>%</WithInfo></th>
                </tr>
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
