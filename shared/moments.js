// Kalender momen konten: hari nasional, hari besar keagamaan, momen keuangan & pasar modal, tanggal belanja, gajian.
// Dihitung untuk tahun berapa pun tanpa sumber luar:
//   - tanggal tetap (MD)
//   - Paskah & turunannya (rumus Gregorian)
//   - hari besar Islam dari kalender Hijriah tabular -> PERKIRAAN, bisa bergeser ±1 hari dari ketetapan pemerintah (approx: true)
//   - Imlek, Nyepi, Waisak dari tabel (tahun di luar tabel dilewati)
// Momen khusus tim (masa penawaran SBN, HUT perusahaan, program) disimpan masing-masing tool (Content Planner: tabel moments).
//
//   import { momentsBetween } from "../../shared/moments.js";
//   momentsBetween("2026-11-01", "2026-12-31") -> [{ date, name, type, idea, approx?, syariah? }]

export const TYPES = { nasional: "Hari nasional", agama: "Hari besar", keuangan: "Keuangan", pasar: "Pasar modal", populer: "Momen populer", tim: "Momen tim" };

// [bulan-tanggal, nama, jenis, ide konten]
const MD = [
  ["01-01", "Tahun Baru", "nasional", "Resolusi keuangan & target investasi tahun ini"],
  ["02-14", "Hari Valentine", "populer", "Rencana keuangan berdua: tujuan bersama, investasi bersama"],
  ["03-08", "Hari Perempuan Internasional", "populer", "Perempuan & kemandirian finansial"],
  ["03-31", "Batas laporan keuangan tahunan emiten", "pasar", "Musim laporan keuangan tahunan: cara membaca laba & dividen"],
  ["04-20", "Hari Konsumen Nasional", "keuangan", "Kenali hak konsumen & cara cek izin OJK sebelum berinvestasi"],
  ["04-21", "Hari Kartini", "nasional", "Kartini masa kini melek investasi"],
  ["04-30", "Batas laporan keuangan kuartal I", "pasar", "Rilis kinerja kuartal I emiten: apa yang perlu diperhatikan"],
  ["05-01", "Hari Buruh", "nasional", "Gaji pertama: pembagian 50/30/20 dan mulai investasi rutin"],
  ["05-02", "Hari Pendidikan Nasional", "nasional", "Menyiapkan dana pendidikan anak sejak dini"],
  ["05-15", "Musim RUPS & dividen", "pasar", "Cara kerja dividen: cum date, ex date, recording date"],
  ["07-23", "Hari Anak Nasional", "nasional", "Investasi untuk masa depan anak"],
  ["07-31", "Batas laporan keuangan semester I", "pasar", "Rilis kinerja semester I emiten"],
  ["08-10", "HUT Pasar Modal Indonesia", "pasar", "Sejarah pasar modal Indonesia & pertumbuhan jumlah investor"],
  ["08-17", "HUT Kemerdekaan RI", "nasional", "Merdeka finansial: langkah kecil menuju bebas utang konsumtif"],
  ["09-09", "Harbolnas 9.9", "populer", "Belanja vs investasi: atur anggaran saat promo besar"],
  ["10-01", "Bulan Inklusi Keuangan (OJK)", "keuangan", "Edukasi & program Bulan Inklusi Keuangan sepanjang Oktober"],
  ["10-10", "Harbolnas 10.10", "populer", "Promo belanja: sisihkan dulu untuk investasi"],
  ["10-28", "Hari Sumpah Pemuda", "nasional", "Anak muda & investasi: mulai dari nominal kecil"],
  ["10-30", "Hari Oeang Republik Indonesia", "keuangan", "Sejarah rupiah & obligasi negara ritel"],
  ["10-31", "Hari Menabung Sedunia", "keuangan", "Dari menabung ke investasi: kapan mulai berinvestasi?"],
  ["10-31", "Batas laporan keuangan kuartal III", "pasar", "Rilis kinerja kuartal III emiten"],
  ["11-11", "Harbolnas 11.11", "populer", "Promo belanja: sisihkan dulu untuk investasi"],
  ["11-12", "Hari Ayah Nasional", "nasional", "Ayah & perencanaan keuangan keluarga"],
  ["11-25", "Hari Guru Nasional", "nasional", "Literasi keuangan untuk guru"],
  ["12-01", "Akhir tahun: window dressing", "pasar", "Window dressing & January effect: mitos atau fakta?"],
  ["12-12", "Harbolnas 12.12", "populer", "Akhir tahun: belanja seperlunya, investasi tetap jalan"],
  ["12-22", "Hari Ibu", "nasional", "Ibu & pengelolaan keuangan keluarga"],
  ["12-25", "Hari Natal", "agama", "Ucapan Natal"],
  ["12-31", "Malam tahun baru", "pasar", "Kilas balik pasar setahun & review portofolio"],
];
// [nama, jenis, ide, hari dari Paskah]
const EASTER = [["Wafat Isa Almasih (Jumat Agung)", "agama", "Ucapan Jumat Agung", -2], ["Kenaikan Isa Almasih", "agama", "Ucapan Kenaikan Isa Almasih", 39]];
// [bulan Hijriah, tanggal, nama, ide, syariah, geser hari]
const HIJRI = [
  [7, 27, "Isra Mikraj", "Ucapan Isra Mikraj", false, 0],
  [9, 1, "Awal Ramadan", "Paket konten Ramadan: reksa dana syariah, sukuk, saham syariah; ngabuburit edukasi", true, 0],
  [10, 1, "Idul Fitri", "Ucapan Idul Fitri; kelola THR & pengeluaran Lebaran", true, 0],
  [10, 1, "Musim THR", "Alokasi THR: kebutuhan, zakat, dan investasi syariah", true, -14],
  [12, 10, "Idul Adha", "Ucapan Idul Adha; berbagi & perencanaan keuangan", true, 0],
  [1, 1, "Tahun Baru Islam", "Hijrah finansial: mengenal investasi syariah", true, 0],
  [3, 12, "Maulid Nabi Muhammad SAW", "Ucapan Maulid Nabi", false, 0],
];
const TABLE = {
  "Tahun Baru Imlek": { type: "agama", idea: "Ucapan Imlek; angpao jadi investasi", d: { 2026: "02-17", 2027: "02-06", 2028: "01-26", 2029: "02-13", 2030: "02-03", 2031: "01-23" } },
  "Hari Raya Nyepi": { type: "agama", idea: "Ucapan Nyepi", d: { 2026: "03-19" } },
  "Hari Raya Waisak": { type: "agama", idea: "Ucapan Waisak", d: { 2026: "05-31" } },
};

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

/** Tanggal Paskah (Gregorian) untuk tahun y. */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}
/** Tanggal Hijriah (kalender tabular) -> tanggal Masehi (ISO). Perkiraan: ketetapan pemerintah bisa berbeda ±1 hari. */
export function hijriToIso(hy, hm, hd) {
  const jd = hd + Math.ceil(29.5 * (hm - 1)) + (hy - 1) * 354 + Math.floor((3 + 11 * hy) / 30) + 1948439.5 - 1;
  return ymd(new Date(Math.round((jd - 2440587.5) * 864e5)));
}

/** Semua momen di tahun Masehi y, urut tanggal. */
export function momentsOf(y) {
  const out = MD.map(([md, name, type, idea]) => ({ date: `${y}-${md}`, name, type, idea }));
  const ea = easter(y);
  for (const [name, type, idea, off] of EASTER) out.push({ date: addDays(ea, off), name, type, idea });
  for (const [name, t] of Object.entries(TABLE)) if (t.d[y]) out.push({ date: `${y}-${t.d[y]}`, name, type: t.type, idea: t.idea });
  // tahun Hijriah yang bersinggungan dengan tahun Masehi y
  const h0 = Math.floor((y - 622) * 33 / 32);
  for (let hy = h0 - 1; hy <= h0 + 2; hy++) for (const [hm, hd, name, idea, syariah, off] of HIJRI) {
    const date = addDays(hijriToIso(hy, hm, hd), off);
    if (date.startsWith(y + "-")) out.push({ date, name, type: name === "Musim THR" ? "keuangan" : "agama", idea, approx: true, ...(syariah ? { syariah: true } : {}) });
  }
  // gajian: tanggal 25 setiap bulan
  for (let m = 1; m <= 12; m++) out.push({ date: `${y}-${pad(m)}-25`, name: "Tanggal gajian", type: "keuangan", idea: "Sisihkan di awal: investasi rutin bulanan (DCA)", payday: true });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Momen dari tanggal from sampai to (ISO, inklusif). */
export function momentsBetween(from, to) {
  const y1 = +from.slice(0, 4), y2 = +to.slice(0, 4), out = [];
  if (!(y1 > 1900 && y2 >= y1 && y2 - y1 < 3)) return out;
  for (let y = y1; y <= y2; y++) for (const m of momentsOf(y)) if (m.date >= from && m.date <= to) out.push(m);
  return out;
}
