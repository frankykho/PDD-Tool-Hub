// =============================================================================
//  KONFIGURASI GITHUB — tempat menyimpan gambar tutorial
// =============================================================================
//  Gambar tutorial yang sudah disetujui disimpan di folder apps/tutorial/site/images
//  di repo proyek ini, lalu tayang lewat worker tutorial (<alamat tutorial>/images/...)
//  setelah deploy otomatis selesai.
//
//  TOKEN TIDAK DITULIS DI SINI. Token disimpan sebagai secret GITHUB_TOKEN di
//  Tool Hub. Jangan pernah menempel token ke file mana pun di repo, karena
//  repo ini bisa dilihat publik.
//
//  Repo & branch dibaca dari profil (github.repo = "pemilik/repo", github.branch).
// =============================================================================

const P = window.PROFILE || {};
const gh = P.github || {};
const [owner = '', repo = ''] = String(gh.repo || '').split('/');
const site = String((P.urls && P.urls.tutorial) || location.origin).replace(/\/+$/, '');

export const GITHUB = {
  owner,
  repo,
  branch: gh.branch || 'main',
  // folder gambar di repo (sama dengan ghDir tab Tutorial di Tool Hub)
  imageFolder: 'apps/tutorial/site/images',
  // alamat publik folder gambar (harus diakhiri garis miring)
  imageBaseUrl: site + '/images/'
};
