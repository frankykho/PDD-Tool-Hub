/**
 * BEI "Ringkasan Saham" (idx.co.id > Data Pasar > Ringkasan Perdagangan > Ringkasan Saham, tombol unduh .xlsx) -> rows for
 * /api/flow/upload. Columns are found by their header (Indonesian or English export), not by position.
 */
export interface IdxDayRow {
  code: string;
  close: number | null;
  volume: number; // lembar, semua papan
  value: number | null;
  freq: number;
  nr_volume: number; // non-reguler (nego, tunai)
  nr_freq: number;
  foreign_buy: number | null; // lembar
  foreign_sell: number | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const COLS: Record<keyof IdxDayRow | "date", string[]> = {
  code: ["kodesaham", "stockcode", "kode", "code"],
  close: ["penutupan", "close", "closeprice"],
  volume: ["volume"],
  value: ["nilai", "value"],
  freq: ["frekuensi", "frequency"],
  nr_volume: ["nonregularvolume", "volumenonreguler"],
  nr_freq: ["nonregularfrequency", "frekuensinonreguler"],
  foreign_buy: ["foreignbuy", "belianasing", "asingbeli"],
  foreign_sell: ["foreignsell", "jualasing", "asingjual"],
  date: ["tanggalperdaganganterakhir", "lasttradingdate", "date", "tanggal"],
};
const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };

const num = (s: string | undefined) => {
  if (s == null || s.trim() === "" || s.trim() === "-") return null;
  const t = s.trim();
  // "1,234,567" / "1.234.567" thousands, plain numbers from the XML
  const n = Number(/^-?[\d.]+,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** "23 Okt 2026" / "2026-10-23" / Excel serial 46318 -> "2026-10-23". */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[\s/-]([A-Za-z]{3})[A-Za-z]*[\s/-](\d{4})$/);
  if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${String(MON[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{5}(\.\d+)?$/.test(t)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 864e5).toISOString().slice(0, 10);
  return null;
}

/** Date from a file name like "Ringkasan Saham-20261023.xlsx". */
export const dateFromName = (name: string) => {
  const m = name.match(/(20\d{2})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

export function parseIdxSummary(rows: string[][], fileName = ""): { date: string | null; rows: IdxDayRow[] } {
  const h = rows.findIndex((r) => r.some((c) => COLS.code.slice(0, 2).includes(norm(c))));
  if (h < 0) throw new Error('Kolom "Kode Saham" tidak ditemukan. Pastikan file dari menu Ringkasan Saham BEI.');
  const head = rows[h].map(norm);
  const col = (k: keyof typeof COLS) => head.findIndex((x) => COLS[k].includes(x));
  const idx = Object.fromEntries((Object.keys(COLS) as Array<keyof typeof COLS>).map((k) => [k, col(k)])) as Record<keyof typeof COLS, number>;
  for (const k of ["code", "volume", "freq"] as const) if (idx[k] < 0) throw new Error(`Kolom ${k} tidak ditemukan di file.`);
  const out: IdxDayRow[] = [];
  const dates: string[] = [];
  for (const r of rows.slice(h + 1)) {
    const code = (r[idx.code] ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{2,6}$/.test(code)) continue;
    const volume = num(r[idx.volume]) ?? 0;
    const freq = num(r[idx.freq]) ?? 0;
    const get = (k: keyof typeof COLS) => (idx[k] >= 0 ? num(r[idx[k]]) : null);
    out.push({ code, close: get("close"), volume, value: get("value"), freq, nr_volume: get("nr_volume") ?? 0, nr_freq: get("nr_freq") ?? 0, foreign_buy: get("foreign_buy"), foreign_sell: get("foreign_sell") });
    if (idx.date >= 0) {
      const d = parseDate(r[idx.date] ?? "");
      if (d) dates.push(d);
    }
  }
  // file name first (it names the trading day); else the latest "last trading date" in the file
  const date = dateFromName(fileName) ?? (dates.length ? dates.sort().at(-1)! : null);
  return { date, rows: out };
}
