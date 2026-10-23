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
  lain: "Lainnya",
};
// role yang mendapat peringatan ops (NAB terlambat, premium/diskon, gerak harian tidak biasa) di lonceng Tool Hub (admin hub selalu)
export const OPS_ALERTS = ["ops"];
// role yang boleh membuat program dan membagi tugas ke orang lain (admin Tool Hub selalu boleh)
export const ASSIGNERS = ["partnership"];
export const canAssign = (job, admin) => !!admin || ASSIGNERS.includes(job);
