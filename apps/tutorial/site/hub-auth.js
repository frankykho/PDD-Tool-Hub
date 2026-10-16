// =============================================================================
//  LOGIN LEWAT TOOL HUB — dipakai submit.html dan admin.html
// =============================================================================
//  Halaman tim (form usulan & admin) tidak punya login sendiri lagi. Siapa yang
//  boleh masuk dan sebagai apa (kirim usulan / admin) diatur di Tool Hub.
//  Alurnya: halaman ini -> Tool Hub memeriksa login & hak akses -> kembali ke
//  halaman ini membawa tiket Firebase di alamat (#fb_t=...) -> masuk ke Firebase.
//  Halaman tutorial untuk nasabah (index.html) TIDAK memakai berkas ini.
// =============================================================================
import { signInWithCustomToken, setPersistence, inMemoryPersistence } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

// alamat Tool Hub dari profil (disisipkan worker tutorial sebagai window.PROFILE)
export const HUB = String(((window.PROFILE || {}).urls || {}).hub || '').replace(/\/+$/, '');
/** Email pengguna menurut Tool Hub (akun Firebase dari tiket tidak membawa email). */
export let hubEmail = '';
/** Izin sementara (8 jam) untuk menyimpan gambar ke GitHub lewat Tool Hub; hanya diberikan ke admin. */
export let hubApiToken = '';

const never = () => new Promise(() => {});

/**
 * box       = elemen tempat pesan status ditampilkan (bekas kotak login)
 * needAdmin = true di admin.html: yang bukan admin dialihkan ke form usulan
 */
export async function hubSignIn(auth, { box, needAdmin = false } = {}) {
  const say = (t) => { if (box) box.innerHTML = `<p style="font-size:14px;line-height:1.6;margin:0;">${t}</p>`; };
  // hanya dipakai di dalam dashboard Tool Hub; dibuka langsung -> pindah ke tab Tutorial di hub
  if (window.top === window.self) { window.location.replace(HUB + '/#tutorial'); return never(); }
  const p = new URLSearchParams(window.location.hash.slice(1)), token = p.get('fb_t');
  if (!token) {
    say('Menghubungkan ke Tool Hub…');
    window.location.replace(`${HUB}/sso?app=tutorial&back=${encodeURIComponent(window.location.origin + window.location.pathname)}`);
    return never();
  }
  history.replaceState(null, '', window.location.pathname);   // tiket jangan tertinggal di alamat
  if (needAdmin && p.get('r') !== 'admin') { window.location.replace('submit.html'); return never(); }
  hubEmail = p.get('e') || '';
  hubApiToken = p.get('h') || '';
  say('Masuk…');
  try {
    // ponytail: sesi hanya di memori, jadi setiap halaman dimuat ulang hak aksesnya dicek lagi ke Tool Hub.
    // Tab yang dibiarkan terbuka tetap aktif sampai ditutup; kalau perlu memutus saat itu juga, hapus penggunanya di Firebase Authentication.
    await setPersistence(auth, inMemoryPersistence);
    await signInWithCustomToken(auth, token);
  } catch (err) {
    console.error(err);
    say('Gagal masuk lewat Tool Hub. Muat ulang tab ini dari Tool Hub. Kalau tetap gagal, hubungi admin.');
  }
}
