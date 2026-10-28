// Role pekerjaan anggota tim: satu daftar untuk Tool Hub (wajib dipilih, disimpan di akun sebagai u.job) dan Content Planner.
// Kuncinya ikut di tiket SSO (j), jadi tool tahu role orang yang membukanya tanpa bertanya lagi.
export const JOBS = {
  partnership: "Partnership",
  is: "Investment Specialist",
  copy: "Copywriter",
  sosmed: "Social Media Specialist",
  design: "Desainer",
  pm: "Product Marketing",
  ops: "Ops ETF & Fund",
  syariah: "Syariah",
  sales: "Sales",
  galeri: "Pengelola Galeri Investasi",
  lain: "Lainnya",
};
// role yang mendapat peringatan ops (NAB terlambat, premium/diskon, gerak harian tidak biasa) di lonceng Tool Hub (admin hub selalu)
export const OPS_ALERTS = ["ops"];
// role yang boleh membuat program dan membagi tugas ke orang lain (admin Tool Hub selalu boleh)
export const ASSIGNERS = ["partnership"];
export const canAssign = (job, admin) => !!admin || ASSIGNERS.includes(job);
// tim regional (sales & pengelola galeri investasi di cabang): di Content Planner hanya melihat & mencatat kegiatan cabang
// dan rencana kerja sama galeri baru
export const REGIONAL = ["sales", "galeri"];
export const isRegional = (job, admin) => !admin && REGIONAL.includes(job);
/** Jenis tempat di daftar: "galeri" (galeri investasi) atau "cabang". Tanpa jenis tertulis: nama berawalan "Galeri" = galeri. */
export const branchType = (c) => (/^galeri/i.test(String(c || "").trim()) ? "galeri" : "cabang");
const TYPE_RE = /^(cabang|galeri)(\s+investasi)?$/i;
/** Daftar regional & cabang/galeri dari halaman admin Tool Hub: satu baris "Regional | Cabang", atau "Regional | Galeri | Nama"
 *  / "Regional | Cabang | Nama" kalau jenisnya perlu ditulis (tab dari Excel juga boleh). Hasil [{ r, c, t }].
 *  Nama unik (tanpa membedakan huruf besar/kecil); baris tanpa regional atau nama dilewati. */
export function parseBranches(text) {
  const out = [], seen = new Set();
  for (const line of String(text || "").split(/\r?\n/)) {
    const P = line.split(/\s*[|\t]\s*/).map((x) => String(x || "").replace(/\s+/g, " ").trim().slice(0, 60));
    const typed = P.length >= 3 && TYPE_RE.test(P[1]), r = P[0], c = typed ? P[2] : P[1];
    if (!r || !c || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase()); out.push({ r, c, t: typed ? P[1].split(" ")[0].toLowerCase() : branchType(c) });
  }
  return out.slice(0, 300);
}
/** Satu baris daftar untuk ditulis ulang di kotak admin: jenis hanya ditulis kalau berbeda dari tebakan nama. */
export const branchLine = (x) => (x.t && x.t !== branchType(x.c) ? `${x.r} | ${x.t === "galeri" ? "Galeri" : "Cabang"} | ${x.c}` : `${x.r} | ${x.c}`);
