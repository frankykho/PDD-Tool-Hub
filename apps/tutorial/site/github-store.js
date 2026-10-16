// =============================================================================
//  SIMPAN GAMBAR KE REPO GITHUB (dipakai admin.html saja)
// =============================================================================
//  Semua gambar dalam satu aksi (misalnya 1 usulan berisi 5 screenshot)
//  dimasukkan dalam SATU commit, jadi worker tutorial cukup di-deploy ulang
//  sekali (otomatis lewat GitHub Actions). Gambar biasanya bisa diakses publik
//  ±2–3 menit setelah commit.
//
//  Token GitHub TIDAK lagi dipegang admin. Token disimpan sekali sebagai secret
//  di Tool Hub; halaman ini menyimpan gambar lewat hub memakai izin sementara
//  yang diberikan hub kepada admin saat masuk.
// =============================================================================

import { GITHUB } from './github-config.js';
import { HUB, hubApiToken } from './hub-auth.js';

const API = HUB + '/gh';   // Tool Hub meneruskan ke api.github.com dengan token yang disimpannya

export function getToken(){ return hubApiToken; }
export function setToken(){ /* tidak dipakai lagi: token ada di Tool Hub */ }
export function clearToken(){ try{ localStorage.removeItem('tutorial_github_token'); }catch(_){} }   // buang token lama yang mungkin masih tersimpan di browser
export function hasToken(){ return !!getToken(); }

/** true kalau URL ini sudah tersimpan di repo GitHub kita */
export function isGithubImage(url){
  return typeof url === 'string' && url.startsWith(GITHUB.imageBaseUrl);
}

async function gh(path, options = {}){
  const token = getToken();
  if(!token) throw new Error('Belum mendapat izin menyimpan gambar dari Tool Hub. Muat ulang halaman ini dari Tool Hub.');
  const res = await fetch(API + path, {
    // penting: jangan pakai cache browser. GitHub API menyimpan respons GET
    // selama 60 detik, sehingga posisi branch terbaru bisa terbaca versi lama
    // dan commit berikutnya ditolak ("Update is not a fast forward").
    cache: 'no-store',
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
  if(!res.ok){
    let msg = '';
    try{ msg = (await res.json()).message || ''; }catch(_){}
    let text;
    if(res.status === 401) text = msg || 'Token GitHub di Tool Hub tidak valid atau sudah kedaluwarsa.';
    else if(res.status === 500 && msg) text = msg;
    else if(res.status === 403 || res.status === 404) text = msg && /hub/i.test(msg) ? msg : 'Token GitHub di Tool Hub tidak punya izin menulis ke repo ' + GITHUB.owner + '/' + GITHUB.repo + '. Cek pengaturan token (Contents: Read and write).';
    else if(res.status === 422 && /fast forward/i.test(msg)) text = 'Repo GitHub sedang berubah di saat yang sama (misalnya ada file yang diupload/diedit). Tunggu sebentar lalu coba lagi.';
    else text = 'GitHub menolak permintaan (' + res.status + ') ' + msg;
    const err = new Error(text);
    err.status = res.status;
    err.githubMessage = msg;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/** Cek token & izin tulis. Mengembalikan pesan status. */
export async function testConnection(){
  const repo = await gh(`/repos/${GITHUB.owner}/${GITHUB.repo}`);
  if(!repo.permissions || !repo.permissions.push){
    throw new Error('Token bisa membaca repo, tapi belum punya izin menulis (Contents: Read and write).');
  }
  return `Terhubung ke ${repo.full_name}.`;
}

function randomName(ext){
  const d = new Date();
  const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return `${ym}/${id}.${ext}`;   // relatif terhadap folder gambar
}

/**
 * Commit beberapa gambar sekaligus.
 * files: [{ base64, ext }]  ->  mengembalikan array URL publik gambar (urutan sama)
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function commitImages(files, message = 'Tambah gambar tutorial'){
  if(!files.length) return [];
  const base = `/repos/${GITHUB.owner}/${GITHUB.repo}`;

  // 1. Upload isi gambar (cukup sekali, bisa dipakai ulang kalau commit perlu diulang)
  const entries = [];
  const urls = [];
  for(const f of files){
    const blob = await gh(`${base}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: f.base64, encoding: 'base64' })
    });
    const name = randomName(f.ext || 'webp');
    entries.push({ path: GITHUB.imageFolder + '/' + name, mode: '100644', type: 'blob', sha: blob.sha });
    urls.push(GITHUB.imageBaseUrl + name);
  }

  // 2. Buat commit di atas posisi branch terbaru. Kalau branch keburu berubah
  //    (orang lain upload file, atau data GitHub belum sinkron), ulangi.
  const MAX_TRIES = 5;
  for(let attempt = 1; attempt <= MAX_TRIES; attempt++){
    const ref = await gh(`${base}/git/ref/heads/${GITHUB.branch}`);
    const parentSha = ref.object.sha;
    const parent = await gh(`${base}/git/commits/${parentSha}`);
    const tree = await gh(`${base}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries })
    });
    const commit = await gh(`${base}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] })
    });
    try{
      await gh(`${base}/git/refs/heads/${GITHUB.branch}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha })
      });
      return urls;
    }catch(err){
      if(err.status !== 422 || attempt === MAX_TRIES) throw err;
      await sleep(1500 * attempt);
    }
  }
}
