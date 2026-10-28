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
// tim regional (sales & pengelola galeri investasi di cabang): di Content Planner hanya melihat & mencatat "Kegiatan cabang"
export const REGIONAL = ["sales", "galeri"];
export const isRegional = (job, admin) => !admin && REGIONAL.includes(job);
/** Daftar regional & cabang/galeri dari halaman admin Tool Hub: satu baris "Regional | Cabang" (tab dari Excel juga boleh).
 *  Nama cabang unik (tanpa membedakan huruf besar/kecil); baris tanpa salah satunya dilewati. */
export function parseBranches(text) {
  const out = [], seen = new Set();
  for (const line of String(text || "").split(/\r?\n/)) {
    const [r, c] = line.split(/\s*[|\t]\s*/).map((x) => String(x || "").replace(/\s+/g, " ").trim().slice(0, 60));
    if (!r || !c || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase()); out.push({ r, c });
  }
  return out.slice(0, 300);
}
