// Tim & role pekerjaan anggota: diatur admin di Tool Hub (Admin → Tim & role, KV cfg:org) dan dikirim ke Content Planner
// bersama daftar anggota. Kunci role (k) disimpan di akun (u.job) dan ikut di tiket SSO (j); kunci tidak pernah berubah,
// jadi mengganti nama role atau memindahkan role ke tim lain tidak mengubah data yang sudah tercatat.
// Role: { k, name, team (id tim, "" = tanpa tim), head (pimpinan tim), assign (boleh membuat program & membagi tugas), ops (peringatan ops) }.
// Tim: { id, name, regional } — regional: anggotanya di Content Planner hanya melihat & mencatat kegiatan cabang dan rencana galeri.
export const DEFAULT_ORG = {
  teams: [{ id: "pd", name: "Product Development", regional: false }, { id: "rm", name: "Regional Management", regional: true }],
  roles: [
    { k: "head_pd", name: "Head of Product Development", team: "pd", head: true, assign: true },
    { k: "partnership", name: "Mutual Fund Partnership Specialist", team: "pd", assign: true },
    { k: "is", name: "Investment Growth Specialist", team: "pd" },
    { k: "ops", name: "ETF & Fund Ops", team: "pd", ops: true },
    { k: "head_rm", name: "Head of Regional Management", team: "rm", head: true },
    { k: "sales", name: "Sales", team: "rm" },
    { k: "galeri", name: "GI Coordinator", team: "rm" },
    { k: "copy", name: "Copywriter" }, { k: "sosmed", name: "Social Media Specialist" }, { k: "design", name: "Desainer" },
    { k: "pm", name: "Product Marketing" }, { k: "syariah", name: "Syariah" }, { k: "lain", name: "Lainnya" },
  ],
};
const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;
const txt = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
/** Rapikan daftar tim & role (dari KV atau kiriman Tool Hub). Kosong / rusak = bawaan. Role yang timnya tidak ada lagi = tanpa tim. */
export function cleanOrg(o) {
  const T = [], R = [];
  for (const t of (o && Array.isArray(o.teams) ? o.teams : [])) {
    const id = txt(t && t.id, 24), name = txt(t && t.name, 60);
    if (KEY_RE.test(id) && name && !T.some((x) => x.id === id)) T.push({ id, name, regional: !!(t && t.regional) });
  }
  for (const r of (o && Array.isArray(o.roles) ? o.roles : [])) {
    const k = txt(r && r.k, 24), name = txt(r && r.name, 60), team = T.some((x) => x.id === (r && r.team)) ? r.team : "";
    if (KEY_RE.test(k) && name && !R.some((x) => x.k === k)) R.push({ k, name, team, head: !!(r && r.head && team), assign: !!(r && r.assign), ops: !!(r && r.ops) });
  }
  return R.length ? { teams: T.slice(0, 20), roles: R.slice(0, 80) } : structuredClone(DEFAULT_ORG);
}
/** { kunci role: nama } untuk pilihan & label. */
export const jobsOf = (org) => Object.fromEntries(org.roles.map((r) => [r.k, r.name]));
export const roleIn = (org, k) => org.roles.find((r) => r.k === k) || null;
/** Tim sebuah role (null = tanpa tim / role tidak dikenal). */
export const teamIn = (org, k) => { const r = roleIn(org, k); return (r && org.teams.find((t) => t.id === r.team)) || null; };
// boleh membuat program dan membagi tugas ke orang lain (admin Tool Hub selalu boleh)
export const canAssign = (org, job, admin) => !!admin || !!(roleIn(org, job) || {}).assign;
// anggota tim regional (sales & GI coordinator di cabang): di Content Planner hanya melihat & mencatat kegiatan cabang dan rencana galeri
export const isRegional = (org, job, admin) => !admin && !!(teamIn(org, job) || {}).regional;
// mendapat peringatan ops (NAB terlambat, premium/diskon, gerak harian tidak biasa) di lonceng Tool Hub (admin hub selalu)
export const opsAlert = (org, job) => !!(roleIn(org, job) || {}).ops;
/** Kunci baru dari nama (huruf kecil, _), unik terhadap kunci yang sudah dipakai. */
export function newKey(name, taken) {
  const base = (String(name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "role").replace(/^(\d)/, "r$1").slice(0, 24);
  let k = base, i = 2;
  while (taken.includes(k)) k = base.slice(0, 21) + "_" + i++;
  return k;
}
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
