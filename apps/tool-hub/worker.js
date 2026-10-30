// Tool Hub - satu pintu login, satu admin, dan hak akses per tool.
// Dipasang sebagai Worker sendiri (tool-hub). Tool lain tidak menyimpan akun; mereka melempar pengguna ke /sso di sini
// dan menerima "tiket" bertanda tangan (lihat bagian SSO).
//
// Pengaturan di Cloudflare (Worker -> Settings):
//   ADMIN_EMAILS  (Variable)   email admin utama, pisahkan dengan koma. Otomatis admin & punya semua akses.
//   SSO_SECRET    (Secret)     teks acak panjang (min. 32 karakter). HARUS SAMA di hub dan di setiap tool.
//   HUB_KV        (KV binding) tempat akun disimpan.
//   GITHUB_TOKEN  (Secret, opsional) token GitHub (fine-grained, Contents: Read and write, hanya repo proyek ini) untuk menyimpan gambar tutorial.
//   FIREBASE_SA   (Secret, opsional) seluruh isi berkas kunci service account Firebase proyek tutorial; hanya untuk tab Tutorial.
// Disuntikkan scripts/deploy.mjs: PROFILE (nama brand, alamat semua tool), HUB_URL, GITHUB_REPO ("pemilik/repo").
import { profile, appUrl, title } from "../../shared/profile.js";
import { cleanOrg, jobsOf, opsAlert, newKey, parseBranches, branchType, branchLine } from "../../shared/jobs.js";
import SHELL from "./shell.html";
import { i18nHead } from "../../shared/i18n.js";
import { GLASS_CSS } from "../../shared/theme.js";
import EN from "./i18n.js";

// cat = kategori di dashboard (CATEGORIES); icon = nama ikon di shell.html; blurb / features = isi halaman detail;
// ai = baris singkat kalau tool memakai AI (label "Memakai AI" di halaman detail, ikut dicari); kw = kata kunci tambahan untuk pencarian.
// Tool baru cukup ditambahkan di sini: sidebar, beranda, pencarian, dan halaman detail membaca daftar ini.
// frame: false = belum bisa tampil di dalam dashboard, dibuka di tab browser baru (hapus setelah tool itu disambungkan ke hub).
// Daftar tool. Alamat tool = profile.urls[id] (appUrl); tiket hanya dikirim ke alamat ini. levels / tabs = pilihan hak akses di halaman admin.
const APPS = [
  { id: 'email', name: 'Email Studio', desc: 'Email marketing dari template tim, draft bisa dikerjakan bersama',
    cat: 'campaign', icon: 'mail', blurb: 'Susun email marketing siap kirim dari 7 template tim. Data pasar dan produk terisi otomatis, draft bisa dikerjakan bersama secara realtime, dan email dicek dulu sebelum diekspor.', features: ['7 template: Market Insight, Weekly Picks, penawaran & reminder obligasi, obligasi + sukuk, promo reksa dana, undangan webinar', 'Data pasar & produk terisi otomatis dari Fund Insight dan Bond Insight', 'Draft tim realtime: terlihat siapa yang membuka, isian yang sedang diketik orang lain terkunci', 'Pratinjau desktop & HP, teks bisa diklik langsung untuk diedit', 'Cek sebelum ekspor: link kosong, panjang subject & preheader, ukuran email, UTM', 'Salin HTML atau unduh .html; riwayat ekspor bisa diduplikat untuk edisi baru'] },
  { id: 'story', name: 'Story Generator', desc: 'Generator Instagram Story harian & mingguan',
    cat: 'creative', icon: 'story', blurb: 'Buat Instagram Story harian dan mingguan dari data pasar terbaru: data diambil otomatis, gambar siap diunduh, caption siap dibagikan.', features: ['Harian: Morning, Halftime, dan Wrap', 'Mingguan: Weekly Update, RD Highlights, dan Weekly Bond Picks', 'Data otomatis dari IDX, Story Data, dan Fund Insight (bisa diisi manual)', 'Unduh PNG per halaman atau sekaligus; halaman yang tidak dipakai bisa dimatikan', 'Buat caption, lalu bagikan gambar + caption langsung dari HP', 'Status konten hari ini & draft tim yang bisa dilanjutkan rekan'], kw: 'instagram ig konten desain', tabs: { morning: 'Morning', halftime: 'Halftime', wrap: 'Wrap', weekly: 'Weekly Update', rdh: 'RD Highlights', bondpicks: 'Weekly Bond Picks' } },
  { id: 'fund', name: 'Fund Insight', desc: 'Data, analisis & materi nasabah reksa dana',
    cat: 'research', icon: 'fund', blurb: 'Data dan analisis reksa dana: katalog, screener, perbandingan, simulasi, dan insight pasar, plus halaman produk, PDF, dan kuis profil risiko untuk nasabah.', features: ['Katalog RD (semua, syariah, per manajer investasi) dengan filter risiko, minimal beli, dan rating', 'Screener, bandingkan sampai 3 produk, dan simulator dibanding deposito', 'Untuk nasabah: halaman produk, link proposal, dan PDF yang diperbarui otomatis tiap hari', 'Kuis profil risiko untuk nasabah', 'Insight: produk yang perlu perhatian, lagi diminati, peluang produk baru, ringkasan mingguan tiap Senin', 'Home: gerak harian tidak biasa, arus dana, agenda pasar & internal, berita'], kw: 'reksadana rd nab produk', levels: { viewer: 'Lihat saja', editor: 'Editor', admin: 'Admin' } },
  { id: 'competitor', name: 'Competitor Intelligence', desc: 'Promo kompetitor: sekuritas, APERD, bank & MI',
    cat: 'research', icon: 'target', blurb: 'Pantau promo investasi kompetitor dari sekitar 30 sekuritas, APERD, bank, dan manajer investasi. Dipindai otomatis tiap minggu, dirangkum AI, lalu dievaluasi dan dilaporkan tim.', features: ['Scan otomatis tiap Minggu, plus tombol Scan sekarang', 'Promo yang sedang berjalan: filter, verifikasi, tampilan kartu atau tabel', 'Tambah promo manual dari gambar & S&K, isiannya dibantu AI', 'AI menulis kenapa promo itu penting & apa yang bisa kita lakukan', 'Evaluasi promo yang sudah lewat, termasuk arus dana reksa dana terkait', 'Laporan Kompetitor PDF (lengkap atau ringkas) dengan analisis AI'], ai: 'Rangkum promo & tulis analisis laporan kompetitor', kw: 'kompetitor promo sekuritas aperd', levels: { viewer: 'Lihat saja', editor: 'Editor', admin: 'Admin' } },
  { id: 'content', name: 'Content Insight', desc: 'Konten sosmed kompetitor & konsep konten tim',
    cat: 'creative', icon: 'gallery', blurb: 'Kumpulkan konten media sosial kompetitor sebagai referensi, tambahkan ide tim, lalu ubah jadi konsep konten orisinal dengan AI dan kirim ke Content Planner.', features: ['Tombol bookmark "Simpan ke Content Insight" untuk Instagram, TikTok, YouTube, dan artikel', 'Akun Instagram kompetitor dipantau otomatis tiap pagi', 'Galeri dengan filter akun, pilar, topik, format, dan tanggal', 'Ide tim di tiap konten; tandai referensi yang sudah dipakai', 'AI menulis konsep konten orisinal: judul, hook, caption, CTA, brief visual', 'Kirim konsep ke Content Planner sebagai ide + permintaan visual'], ai: 'Konsep konten orisinal dari insight kompetitor', kw: 'sosmed instagram referensi kompetitor', levels: { viewer: 'Lihat saja', editor: 'Editor', admin: 'Admin' } },
  { id: 'copy', name: 'Copy Studio', desc: 'Cek caption, variasi A/B, paket produk, naskah video & subtitle',
    cat: 'creative', icon: 'type', blurb: 'Tulis dan siapkan konten sebelum terbit: cek kepatuhan caption per platform, variasi A/B, teks aplikasi, paket konten produk, naskah Reels & YouTube, subtitle otomatis, dan ubah ukuran gambar.', features: ['Cek caption untuk 15 platform: batas karakter, hashtag, aturan iklan investasi, glosarium; bisa diperbaiki AI', 'Variasi A/B headline, subject, hook, dan CTA', 'Push notification & banner in-app', 'Paket Produk: satu RD, obligasi, atau ETF jadi caption, story, WhatsApp, email, push, FAQ CS, dan brief visual', 'Naskah Reels/TikTok/Shorts dan YouTube (judul, bab, deskripsi, tag)', 'Subtitle otomatis .srt / .vtt', 'Ubah gambar ke 6 ukuran: 9:16, 4:5, 1:1, 16:9, LinkedIn/FB, X', 'Panduan gaya & glosarium tim'], ai: 'Variasi A/B, teks aplikasi, paket produk, naskah video & subtitle', kw: 'copywriting caption hashtag kepatuhan ojk compliance reels tiktok subtitle srt resize push notif glosarium', levels: { user: 'Pengguna', editor: 'Editor (ubah panduan gaya)', admin: 'Admin' } },
  { id: 'edukasi', name: 'Edukasi Studio', desc: 'Riset artikel edukasi & tulis konten orisinal',
    cat: 'creative', icon: 'book', blurb: 'Riset artikel edukasi investasi dari belasan sumber, lalu tulis artikel, carousel, atau story orisinal dengan AI, lengkap dengan cek kemiripan.', features: ['Bank artikel otomatis dari sumber terdaftar: saham, syariah, RD, ETF, SBN, waran, derivatif, dan lainnya', 'AI meringkas tiap artikel jadi catatan fakta', 'Tulis artikel website, feed carousel, atau story dari 2 sampai 4 sumber', 'Cek kemiripan dengan sumber; kalimat yang terlalu mirip bisa ditulis ulang AI', 'Draf tersimpan, bisa disalin atau diunduh .md', 'Admin mengatur sumber artikel'], ai: 'Catatan fakta & tulis artikel, carousel, story edukasi', kw: 'artikel edukasi tulis ai', levels: { user: 'Pengguna', admin: 'Admin' } },
  { id: 'bond', name: 'Bond Insight', desc: 'Data, analisis & materi nasabah obligasi',
    cat: 'research', icon: 'bond', blurb: 'Data dan analisis obligasi: kurva yield, katalog, perbandingan, simulasi, dan rencana kupon, plus halaman dan PDF untuk nasabah.', features: ['Peluang obligasi hari ini dan kurva yield SBN & korporasi per rating', 'Katalog dan detail seri dengan riwayat harga & yield', 'Bandingkan beberapa seri, lalu Export PDF', 'Simulator: tahan sampai jatuh tempo atau jual lebih awal, dibanding deposito', 'Rencana kupon bulanan', 'Link & PDF untuk nasabah, diperbarui otomatis tiap hari', 'Generator carousel & kalender momen konten (admin)'], kw: 'obligasi sbn fr yield' },
  { id: 'etf', name: 'ETF Insight', desc: 'ETF KISI (XKMS, XKID) & pembanding ETF di BEI',
    cat: 'research', icon: 'etf', blurb: 'Analisis ETF KISI: harga vs NAB, iNAV, kinerja vs indeks, tracking error, simulasi investasi, kalender ops, dan pembanding semua ETF di BEI.', features: ['Harga vs NAB, perkiraan iNAV, premium/diskon', 'Kinerja vs indeks, risiko per tahun, tracking error', 'Simulasi investasi rutin atau sekali beli', 'Kalender ops & peringatan anomali (juga muncul di beranda Tool Hub)', 'Arus dana bulanan dan pembanding ETF syariah', 'Pembanding semua ETF di BEI', 'Halaman produk nasabah: PDF, QR aplikasi, bagikan ke WhatsApp'], kw: 'etf reksadana indeks' },
  { id: 'recap', name: 'Market Recap', desc: 'Rangkuman IHSG sesi 1 & penutupan + arsip; halaman publik',
    cat: 'research', icon: 'trend', blurb: 'Rangkuman IHSG sesi 1 dan penutupan setiap hari bursa, disusun otomatis dan dinarasikan AI, lalu disunting dan diterbitkan tim sebagai carousel dan laporan.', features: ['Disusun otomatis 2x tiap hari bursa: sesi 1 dan penutupan', 'Penggerak indeks, sektor, intraday, global, transaksi asing, agenda & berita', 'Narasi AI sebagai draf, disunting tim dengan pratinjau langsung', 'Carousel 5 slide (PNG / PDF) dan laporan PDF A4', 'Halaman publik dan arsip per tanggal'], ai: 'Judul & narasi rangkuman IHSG sebagai draf', kw: 'ihsg pasar harian carousel', levels: { viewer: 'Lihat saja', editor: 'Editor (sunting & terbitkan)', admin: 'Admin' } },
  { id: 'news', name: 'Market News', desc: 'Berita pilihan makro, pasar & emiten untuk dibagikan ke nasabah',
    cat: 'research', icon: 'news', blurb: 'Berita makro, pasar modal, dan emiten dari 7 media, diurutkan menurut yang paling ramai diberitakan, diringkas AI, lalu dicek dan diterbitkan tim. Berita disimpan maksimal 7 hari.', features: ['Berita dari CNBC, Kontan, IDX Channel, Bloomberg Technoz, Bisnis.com, EmitenNews, Investor Daily', 'Skor hype: jumlah media, aksi korporasi, rilis data ekonomi, saham ikut naik', 'Ringkasan pasar: IHSG, top gainer, top value, sektor, komoditas', 'Laporan Keuangan: pendapatan & laba emiten dibaca AI dari berita', 'Banner dalam 4 gaya, termasuk latar gambar AI', 'Bagikan ke WhatsApp (gambar + teks) atau lewat halaman publik'], ai: 'Ringkasan berita, laporan keuangan & latar banner', kw: 'berita news makro emiten corporate action ihsg share', levels: { viewer: 'Lihat saja', editor: 'Editor (sunting & terbitkan)', admin: 'Admin' },
    pages: [{ label: 'Halaman publik', path: '/p', share: true }] },
  { id: 'planner', name: 'Content Planner', desc: 'Kalender kegiatan tim, laporan & paket konten mingguan',
    cat: 'campaign', icon: 'calendar', blurb: 'Kalender kegiatan tim: konten sosmed, artikel, edukasi, dan program partnership, lengkap dengan tugas, persetujuan caption, pekerjaan harian, performa, dan laporan.', features: ['Kalender konten, artikel, edukasi, dan program partnership (jenis bisa ditulis sendiri)', 'Tugas tim di dalam program dan papan tugas desain', 'Caption dicek otomatis, lalu disetujui atau diminta revisi', 'Pekerjaan harian per orang', 'Performa konten: impor CSV Meta dan link pelacak UTM', 'Momen konten 60 hari ke depan', 'Laporan PDF & PPT: Kegiatan tim, Program partnership, Monthly Report per tim', 'Paket mingguan: ringkasan RD, obligasi, agenda'], kw: 'kalender jadwal tugas desain campaign harian laporan bulanan monthly report', pages: [{ label: 'Kalender', path: '/' }, { label: 'Paket Mingguan', path: '/paket' }] },
  { id: 'event', name: 'Event & Lead', desc: 'Pendaftaran, konfirmasi & absen peserta event',
    cat: 'campaign', icon: 'ticket', blurb: 'Nasabah mendaftar sendiri ke seminar, gathering, atau webinar lewat link & QR. Sales mengonfirmasi lewat WhatsApp, kehadiran dicatat di hari acara, dan angkanya masuk ke Content Planner.', features: ['Link & QR pendaftaran per event, siap untuk poster atau story', 'Form singkat: nama, HP WhatsApp, email, kode nasabah, persetujuan data', 'Konfirmasi lewat WhatsApp dengan teks yang sudah terisi', 'Status peserta: Terdaftar, Dikonfirmasi, Hadir, Batal, Tidak bisa dihubungi', 'Absen lewat QR di lokasi atau link untuk acara online, termasuk walk-in', 'Angka Pendaftar & Hadir otomatis masuk ke kegiatan di Content Planner', 'Ekspor daftar peserta ke Excel; data pribadi dihapus otomatis 12 bulan setelah acara'], kw: 'event seminar gathering webinar peserta lead pendaftaran absen qr whatsapp nasabah' },
  { id: 'sats', name: 'SATS Radar', desc: 'Sinyal, screener & analisis saham',
    cat: 'research', icon: 'sats', blurb: 'Sinyal teknikal, screener, dan analisis saham yang dihitung otomatis setiap hari bursa, dari kandidat hari ini sampai pemegang saham dan arus transaksi.', features: ['Hari Ini: sinyal BUY, kandidat, saham dekat harga tertinggi 52 minggu, TP/SL tersentuh', 'Sinyal & level trading per strategi', 'Screener (ada preset syariah) dan pemindai pola grafik', 'Pemegang saham di atas 1% dan perubahannya', 'Frekuensi transaksi & HAKA/HAKI', 'Radar peluang, backtest strategi, kalkulator waran', 'Market breadth & peta sektor', 'Detail saham: grafik, level, kalkulator posisi, fundamental, analisis AI; watchlist'], ai: 'Analisis AI per saham', kw: 'saham screener sinyal teknikal', entry: '/api/auth/hub?to=%2F', levels: { user: 'Pengguna', admin: 'Admin' } },
  // gh = gambar tutorial disimpan ke repo env.GITHUB_REPO (cabang profile.github.branch), hanya di dalam folder ghDir
  { id: 'tutorial', name: 'Tutorial Aplikasi', desc: 'Tutorial aplikasi, asisten AI & usulan tutorial',
    cat: 'education', icon: 'play', blurb: 'Pusat tutorial aplikasi: cari panduan, tanya asisten AI, bagikan ke nasabah, kirim usulan tutorial baru, dan kelola isinya.', features: ['Tutorial langkah demi langkah yang bisa dibagikan ke nasabah', 'Tanya asisten: AI menjawab hanya dari isi tutorial', 'FAQ dan topik yang paling sering dibuka', 'Penilaian "Membantu?" dari pembaca', 'Jadikan konten: carousel, story, atau teks WhatsApp', 'Kirim usulan dengan screenshot dan editor anotasi', 'Admin: setujui usulan, kelola tutorial & FAQ, lihat statistik'], ai: 'Asisten tanya-jawab dari isi tutorial', kw: 'panduan cara bantuan referensi', firebase: true, gh: true, ghDir: 'apps/tutorial/site/images', paths: { submit: '/submit', admin: '/admin' }, levels: { submit: 'Kirim usulan', admin: 'Admin' },
    // halaman di dalam tab ini; only = hanya untuk tingkat itu; share = halaman publik, dapat tombol "Bagikan link"
    pages: [{ label: 'Lihat tutorial', path: '/', share: true }, { label: 'Kirim usulan', path: '/submit' }, { label: 'Admin', path: '/admin', only: 'admin' }] },
];
/** Kategori dashboard, urut seperti di sidebar. icon = nama ikon di shell.html. */
const CATEGORIES = {
  research: { label: 'Research & Intelligence', short: 'Riset', icon: 'flask', desc: 'Data produk, pasar, dan kompetitor untuk riset investasi.' },
  creative: { label: 'Content & Creative', short: 'Konten', icon: 'pen', desc: 'Membuat konten dan mencari referensinya.' },
  campaign: { label: 'Campaign & Distribution', short: 'Campaign', icon: 'megaphone', desc: 'Merencanakan dan mengirim kampanye.' },
  education: { label: 'Product Education', short: 'Edukasi', icon: 'cap', desc: 'Panduan dan tutorial aplikasi.' },
};
const appById = id => APPS.find(a => a.id === id);
const topLevel = a => a.tabs ? ['*'] : a.levels ? Object.keys(a.levels).pop() : true;

const COOKIE = 'hub_sess', SESSION_DAYS = 30, MAX_FAIL = 5, LOCK_MIN = 15, MAX_REG = 5, TICKET_SEC = 60;
// ponytail: 10.000 iterasi PBKDF2 supaya muat di batas CPU paket gratis Workers. Naikkan kalau pindah ke paket berbayar;
// hash lama tetap terbaca karena jumlah iterasi tersimpan di hash.
const ITER = 10000;
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const THEME_CSS = `<style id="hub-theme-style">
:root{color-scheme:light}html[data-theme="dark"]{color-scheme:dark}html[data-theme="system"]{color-scheme:light dark}
#hub-theme-toggle,#hub-lang-toggle{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 15px;border:1px solid var(--soft-line,#b8c9c1);border-radius:999px;background:var(--hg-float,#fff);color:var(--text,#174d3c);box-shadow:var(--shadow,0 6px 24px rgba(0,0,0,.16));-webkit-backdrop-filter:blur(16px) saturate(160%);backdrop-filter:blur(16px) saturate(160%);font:600 13px Inter,system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;margin:16px 4px 0}
#hub-lang-toggle{font-weight:700;letter-spacing:.04em}
#hub-theme-toggle:hover,#hub-lang-toggle:hover{background:var(--soft-hover,#f1f4f3)}
#hub-theme-toggle:focus-visible,#hub-lang-toggle:focus-visible{outline:3px solid var(--focus,#5dd62c);outline-offset:3px}
@media(min-width:1400px){#hub-theme-toggle,#hub-lang-toggle{position:fixed;right:16px;bottom:16px;z-index:2147483000;margin:0}#hub-lang-toggle{bottom:68px}}
@media(max-width:1399px){body{text-align:center}body>.card{text-align:left}}
</style>`;
const THEME_BUTTON = `<button id="hub-theme-toggle" type="button" aria-label="Ganti tema">◐ Tema sistem</button>`;
const THEME_SCRIPT = `<script>(function(){var k='toolhub-theme-v2',v='system';try{v=localStorage.getItem(k)||'system'}catch(e){}if(['light','dark','system'].indexOf(v)<0)v='system';var root=document.documentElement;function apply(n){v=n;root.setAttribute('data-theme',v);try{localStorage.setItem(k,v)}catch(e){}var b=document.getElementById('hub-theme-toggle');if(b){b.textContent=v==='dark'?'☀ Tema terang':v==='light'?'☾ Tema gelap':'◐ Tema sistem';b.title='Tema aktif: '+v+' — klik untuk mengganti';b.setAttribute('aria-label','Tema aktif: '+v+'. Klik untuk mengganti.')}try{document.querySelectorAll('iframe').forEach(function(f){f.contentWindow.postMessage({type:'toolhub-theme',theme:v},'*')})}catch(e){}}root.setAttribute('data-theme',v);var b=document.getElementById('hub-theme-toggle');if(b){b.onclick=function(){apply(v==='system'?'light':v==='light'?'dark':'system')};apply(v)}window.addEventListener('message',function(e){if(e.data&&e.data.type==='toolhub-theme-request'&&e.source){try{e.source.postMessage({type:'toolhub-theme',theme:v},e.origin)}catch(err){}}});})();</script>`;
// Tombol bahasa di halaman hub yang berdiri sendiri (login, akun, admin). Di dashboard, pilihan bahasa ada di sidebar.
// Penanda mesin bahasa sudah ada = "__i18o" (hanya ada di skrip shared/i18n.js; shell.html sendiri memuat teks "toolhub-lang-request").
const LANG_BUTTON = `<button id="hub-lang-toggle" type="button" translate="no" onclick="hubSetLang(hubLang()==='en'?'id':'en');this.textContent=hubLang()==='en'?'ID':'EN';this.title=hubLang()==='en'?'Bahasa Indonesia':'English'">EN</button><script>(function(){var b=document.getElementById('hub-lang-toggle');if(b&&window.hubLang&&hubLang()==='en'){b.textContent='ID';b.title='Bahasa Indonesia'}else if(b)b.title='English'})()</script>`;
const themedHtml = body => { if (typeof body !== 'string' || !/<html[\s>]/i.test(body)) return body; let out = body; if (!out.includes('__i18o')) out = out.replace(/<\/head>/i, () => i18nHead(EN) + '</head>'); if (!out.includes('id="hub-lang-toggle"') && !out.includes('id="lang2"')) out = out.replace(/<\/body>/i, () => LANG_BUTTON + '</body>'); if (!out.includes('id="hub-theme-style"')) out = out.replace(/<\/head>/i, THEME_CSS + '</head>'); if (!out.includes('hub-theme-v2')) { if (!out.includes('id="hub-theme-toggle"')) out = out.replace(/<\/body>/i, THEME_BUTTON + THEME_SCRIPT + '</body>'); else out = out.replace(/<\/body>/i, THEME_SCRIPT + '</body>'); } return out; };
const page = (status, body, extra = {}) => new Response(themedHtml(body), { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "frame-ancestors 'self'", ...extra } });
const redirect = (to, extra = {}) => new Response(null, { status: 303, headers: { location: to, 'cache-control': 'no-store', ...extra } });
// SameSite=None: tool yang beralamat di situs lain (domain berbeda dari hub) melempar pengguna ke /sso dari DALAM bingkai dashboard.
// Dengan SameSite=Lax browser tidak mengirim cookie hub pada perpindahan seperti itu, sehingga halaman login muncul di dalam tab.
// Aman karena: semua POST yang mengubah data memeriksa header Origin, /sso hanya mengirim tiket ke alamat tool yang terdaftar,
// dan halaman hub tidak bisa dibingkai situs lain (frame-ancestors 'self').
const cookieStr = (val, maxAge) => `${COOKIE}=${val}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/, USER_RE = /^[a-z0-9._-]{3,32}$/;
const stamp = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' WIB';
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const atTxt = s => { const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/.exec(s || ''); return m ? `${+m[3]} ${BLN[+m[2] - 1]} ${m[1]}${m[4] ? ', ' + m[4] : ''}` : (s || ''); };
const pwField = (id, name, ac, extra = '') => `<div class="pw"><input id="${id}" name="${name}" type="password" autocomplete="${ac}" required${extra}><button type="button" onclick="var i=this.previousElementSibling,v=i.type==='password';i.type=v?'text':'password';this.textContent=v?'Sembunyi':'Lihat';this.setAttribute('aria-pressed',v)" aria-label="Tampilkan password" aria-pressed="false">Lihat</button></div>`;
const ipOf = request => request.headers.get('cf-connecting-ip') || '-';

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
async function bits(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}
async function hashPw(password) { const salt = crypto.getRandomValues(new Uint8Array(16)); return `pbkdf2$${ITER}$${b64u(salt)}$${b64u(await bits(password, salt, ITER))}`; }
/**
 * Format hash yang dikenali, supaya akun lama tidak perlu daftar ulang:
 *   pbkdf2$<iter>$<salt b64url>$<hasil b64url>   bawaan hub (sama dengan Story Generator)
 *   sats$<salt teks>$<hasil b64url>              akun impor dari SATS (20.000 iterasi)
 *   kfi$<salt teks>$<hasil hex>                  akun impor dari Fund Insight (10.000 iterasi)
 */
async function checkPw(password, stored) {
  const p = String(stored).split('$');
  if (p[0] === 'pbkdf2' && p.length === 4) return safeEq(b64u(await bits(password, fromB64u(p[2]), +p[1])), p[3]);
  if (p[0] === 'sats' && p.length === 3) return safeEq(b64u(await bits(password, enc.encode(p[1]), 20000)), p[2]);
  if (p[0] === 'kfi' && p.length === 3) return safeEq(hex(await bits(password, enc.encode(p[1]), 10000)), p[2]);
  return false;
}

const mainAdmins = env => String(env.ADMIN_EMAILS || '').toLowerCase().split(/[,;\s]+/).filter(e => EMAIL_RE.test(e));
const isMain = (env, email) => mainAdmins(env).includes(email);
const configured = env => !!env.HUB_KV && mainAdmins(env).length > 0 && String(env.SSO_SECRET || '').length >= 32;
// kunci cookie hub dibuat otomatis sekali lalu disimpan di KV; terpisah dari SSO_SECRET yang dibagi ke tool
async function sessKey(env) {
  let k = await env.HUB_KV.get('cfg:key');
  if (!k) { k = b64u(crypto.getRandomValues(new Uint8Array(32))); await env.HUB_KV.put('cfg:key', k); }
  return k;
}

/** Akun: { hash?, role, status, name, why, at, username?, job, region?, branch?, access:{appId: true | level | [tab]} }. Kunci KV: u:<email>; n:<username> -> email.
 *  role = admin/user (hak di hub); job = kunci role pekerjaan (Admin → Tim & role), ditentukan admin; tanpa job = user biasa (hanya memakai tool, bukan anggota Content Planner). */
async function getUser(env, email) {
  const u = await env.HUB_KV.get('u:' + email, 'json');
  if (!u) return null;
  if (isMain(env, email)) { u.role = 'admin'; u.status = 'approved'; }   // admin utama tidak bisa terkunci dari halaman admin
  return u;
}
const meta = u => ({ role: u.role, status: u.status, name: u.name || '', why: u.why || '', at: u.at || '', reg: !!u.hash, un: u.username || '', apps: Object.keys(u.access || {}).join(','), want: (u.want || []).join(','), job: u.job || '', br: u.branch || '' });
/** Regional & cabang / galeri investasi: [{ r, c, t: cabang|galeri }], diatur admin di /admin/cabang. Akun tim regional memilih salah satunya (u.region, u.branch).
 *  Daftar lama tanpa t: jenisnya ditebak dari nama (branchType). */
const getBranches = async env => ((await env.HUB_KV.get('cfg:cabang', 'json')) || []).map(x => ({ ...x, t: x.t || branchType(x.c) }));
/** Usulan galeri baru dari Content Planner: rencana kerja sama yang sudah MoU / diresmikan tapi belum ada di daftar. [] kalau Planner tidak menjawab. */
async function galleryProposals(env) {
  if (!env.PLANNER) return [];
  try {
    const r = await timeout(env.PLANNER.fetch('https://planner/__hub/galeri', { headers: { 'x-hub-key': env.SSO_SECRET } }), 4000, 'Content Planner');
    const L = r.ok ? await r.json() : [];
    return Array.isArray(L) ? L : [];
  } catch (e) { console.error('usulan galeri:', e.message); return []; }
}
/** Tim & role pekerjaan { teams, roles } (shared/jobs.js), diatur admin di /admin/role. Belum pernah disimpan = daftar bawaan. */
const getOrg = async env => cleanOrg(await env.HUB_KV.get('cfg:org', 'json'));
// pilihan role dikelompokkan per tim, role tanpa tim paling bawah
const orgGroups = org => [...org.teams.map(t => [t.name, org.roles.filter(r => r.team === t.id)]), ['Tanpa tim', org.roles.filter(r => !r.team)]].filter(g => g[1].length);
const jobOpts = (org, cur) => orgGroups(org).map(([l, R]) => `<optgroup label="${esc(l)}">${R.map(r => `<option value="${r.k}"${cur === r.k ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</optgroup>`).join('');
const saveUser = (env, email, u) => env.HUB_KV.put('u:' + email, JSON.stringify(u), { metadata: meta(u) });
const fp = u => u.hash.slice(-12);   // sidik password: berubah kalau password diganti/di-reset, jadi sesi lama ikut batal
/** Hak akses pengguna untuk satu tool. Admin hub selalu dapat tingkat tertinggi. null = tidak punya akses. */
const accessOf = (u, app) => u.role === 'admin' ? topLevel(app) : (u.access && u.access[app.id]) || null;

async function makeSession(env, email, u) {
  const body = b64u(enc.encode(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 864e5, h: fp(u) })));
  return body + '.' + await hmac(await sessKey(env), body);
}
async function readSession(env, cookieHeader) {
  const m = (cookieHeader || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig || !safeEq(await hmac(await sessKey(env), body), sig)) return null;
  let s; try { s = JSON.parse(new TextDecoder().decode(fromB64u(body))); } catch (e) { return null; }
  if (!s || !(s.x > Date.now())) return null;
  const u = await getUser(env, s.e);
  return u && u.hash && fp(u) === s.h ? { email: s.e, role: u.role === 'admin' ? 'admin' : 'user', status: u.status, u } : null;
}
// "next" hanya boleh alamat di dalam hub sendiri (mis. /sso?...), supaya login tidak bisa dipakai melempar orang ke situs lain
const safeNext = n => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : '/');
const startSession = async (env, email, u, next) => redirect(safeNext(next), { 'set-cookie': cookieStr(await makeSession(env, email, u), SESSION_DAYS * 86400) });

const CSS = `:root{--card:rgba(255,255,255,.74);--card-edge:rgba(23,35,27,.1);--text:#17231B;--text-2:#56625A;--line:#DDE5DF;--field:#fff;--field-line:#C9D3CC;--link:#0F7F33;--primary:#0B2117;--primary-hover:#163A28;--primary-text:#fff;--soft:rgba(255,255,255,.72);--soft-hover:#fff;--soft-text:#0B2117;--soft-line:rgba(23,35,27,.12);--focus:#14DB4C;--ok-bg:#E8F7EE;--ok-text:#166534;--ok-line:#BFE8D4;--err-bg:#FDECEC;--err-text:#991B1B;--err-line:#F6C9C9;--del:#B3261E;--sel:#F3FBF7;--sel-line:#3FAE78;--shadow:0 1px 2px rgba(16,32,22,.04),0 12px 32px rgba(16,32,22,.08);--hl:inset 0 1px 0 rgba(255,255,255,.9)}
html[data-theme="dark"]{--card:rgba(19,28,23,.78);--card-edge:rgba(255,255,255,.09);--text:#E6EDE8;--text-2:#A3B0A8;--line:#26342C;--field:#0E1712;--field-line:#3A4B41;--link:#4ADE80;--primary:#14DB4C;--primary-hover:#3BE56B;--primary-text:#06140C;--soft:rgba(255,255,255,.06);--soft-hover:rgba(255,255,255,.11);--soft-text:#D6F5E0;--soft-line:rgba(255,255,255,.12);--focus:#4ADE80;--ok-bg:#10301E;--ok-text:#BBF7D0;--ok-line:#2F6748;--err-bg:#3A1515;--err-text:#FECACA;--err-line:#783B3A;--del:#F87171;--sel:#12301F;--sel-line:#2F8F5A;--shadow:0 1px 2px rgba(0,0,0,.3),0 16px 40px rgba(0,0,0,.35);--hl:inset 0 1px 0 rgba(255,255,255,.06)}@media(prefers-color-scheme:dark){html[data-theme="system"]{--card:rgba(19,28,23,.78);--card-edge:rgba(255,255,255,.09);--text:#E6EDE8;--text-2:#A3B0A8;--line:#26342C;--field:#0E1712;--field-line:#3A4B41;--link:#4ADE80;--primary:#14DB4C;--primary-hover:#3BE56B;--primary-text:#06140C;--soft:rgba(255,255,255,.06);--soft-hover:rgba(255,255,255,.11);--soft-text:#D6F5E0;--soft-line:rgba(255,255,255,.12);--focus:#4ADE80;--ok-bg:#10301E;--ok-text:#BBF7D0;--ok-line:#2F6748;--err-bg:#3A1515;--err-text:#FECACA;--err-line:#783B3A;--del:#F87171;--sel:#12301F;--sel-line:#2F8F5A;--shadow:0 1px 2px rgba(0,0,0,.3),0 16px 40px rgba(0,0,0,.35);--hl:inset 0 1px 0 rgba(255,255,255,.06)}}
*{box-sizing:border-box}html{background:var(--hg-base,#EDF3EF)}body{margin:0;min-height:100vh;background:transparent;font:14px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--text);padding:24px 16px 32px;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;z-index:-1;background:var(--hg-mesh,#EDF3EF);pointer-events:none}
.card{background:var(--card);border:1px solid var(--card-edge);max-width:420px;margin:8vh auto 0;padding:30px 28px;border-radius:18px;box-shadow:var(--hl),var(--shadow);-webkit-backdrop-filter:blur(20px) saturate(160%);backdrop-filter:blur(20px) saturate(160%);overflow-wrap:anywhere}.wide{max-width:920px;margin-top:0}.xl{max-width:1100px}
h1{font-size:20px;letter-spacing:-.3px;margin:0 0 4px;color:var(--text)}h2{font-size:15px;margin:28px 0 10px}p.sub{margin:0 0 18px;color:var(--text-2);font-size:13.5px;line-height:1.55}
a{color:var(--link);text-underline-offset:2px}:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
label{display:block;font-size:13px;font-weight:600;color:var(--text);margin:14px 0 6px}label.ck{display:inline-flex;align-items:center;gap:6px;font-weight:400;font-size:13.5px;margin:4px 14px 4px 0;white-space:nowrap;cursor:pointer}

input,select,textarea{width:100%;min-height:42px;padding:9px 12px;border:1px solid var(--field-line);border-radius:10px;background:var(--field);color:var(--text);font:14px inherit}textarea{font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical}
input[type=checkbox]{width:16px;height:16px;min-height:0;margin:0;padding:0;flex:none;accent-color:var(--link)}input:focus,select:focus,textarea:focus{outline:2px solid var(--focus);outline-offset:1px;border-color:var(--sel-line)}input::placeholder,textarea::placeholder{color:var(--text-2);opacity:.8}
button{min-height:42px;padding:10px 16px;border:0;border-radius:10px;background:var(--primary);color:var(--primary-text);font:700 14px inherit;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}button:hover{background:var(--primary-hover)}
button.sm,a.sm{min-height:34px;padding:6px 11px;font-size:12.5px;margin:2px 0 2px 4px}button.ghost,a.sm{background:var(--soft);color:var(--soft-text);border:1px solid var(--soft-line);box-shadow:none}button.ghost:hover,a.sm:hover{background:var(--soft-hover)}a.sm{display:inline-flex;align-items:center;border-radius:10px;font-weight:700;text-decoration:none}button.del{background:transparent;color:var(--del);border:1px solid var(--del);box-shadow:none}button.del:hover{background:var(--err-bg)}
.msg{margin-top:16px;padding:10px 12px;border-radius:10px;font-size:13.5px;line-height:1.5}.err{background:var(--err-bg);color:var(--err-text);border:1px solid var(--err-line)}.ok{background:var(--ok-bg);color:var(--ok-text);border:1px solid var(--ok-line)}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12.5px;font-weight:600;color:var(--text-2);white-space:nowrap}td small{color:var(--text-2);display:block;line-height:1.45;font-size:12.5px}td form{display:inline}
.rt td:first-child{width:30%;min-width:220px}.rt td:nth-child(2){width:22%;min-width:170px}.rt td:nth-child(n+4){white-space:nowrap}.rt td{vertical-align:middle}.rt td label.ck{margin:4px 14px 4px 0}
.ml{display:none}.ml::after{content:": "}
.tabs{display:flex;gap:6px;margin:16px 0 4px;padding:4px;border-radius:12px;background:var(--soft);border:1px solid var(--soft-line)}.tabs a{flex:1;text-align:center;padding:9px;border-radius:9px;font-size:14px;font-weight:700;text-decoration:none;color:var(--text-2)}.tabs a.on{background:var(--primary);color:var(--primary-text)}
.badge{display:inline-block;min-width:18px;padding:1px 6px;border-radius:9px;background:#d92d20;color:#fff;font-size:11px;font-weight:700;text-align:center}
.row{display:flex;gap:8px}.row>*{flex:1}.row button{flex:none}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.scroll{overflow-x:auto}
a.nav{display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border-radius:10px;background:var(--soft);border:1px solid var(--soft-line);color:var(--soft-text);font-weight:600;font-size:13px;text-decoration:none;margin:2px 0 2px 4px}a.nav:hover{background:var(--soft-hover)}.navs{display:flex;flex-wrap:wrap;align-items:center;gap:2px;font-size:13px;color:var(--text-2)}
label.opt{display:flex;gap:10px;align-items:center;font-weight:400;font-size:14px;margin:0;padding:10px 12px;min-height:44px;border:1px solid var(--line);border-radius:10px;background:var(--field);cursor:pointer}label.opt+label.opt{margin-top:6px}label.opt input{width:18px;height:18px}label.opt small{color:var(--text-2);font-size:12.5px}label.opt:has(input:checked){border-color:var(--sel-line);background:var(--sel)}
.pw{position:relative}.pw input{padding-right:84px}.pw button{position:absolute;right:3px;top:3px;bottom:3px;min-height:0;padding:0 12px;background:transparent;color:var(--link);font-size:13px;box-shadow:none}.pw button:hover{background:var(--soft)}
.vh{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}details.more{margin-top:26px}details.more summary{cursor:pointer;font-size:13.5px;color:var(--text-2);padding:6px 0}
fieldset{border:1px solid var(--line);border-radius:12px;margin:12px 0 0;padding:10px 14px 12px;min-width:0}legend{font-size:13.5px;font-weight:700;padding:0 6px}.hint{display:block;margin-top:6px;color:var(--text-2);font-size:13px;line-height:1.5}
.apps{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:0 14px}code{background:var(--soft);border:1px solid var(--soft-line);border-radius:6px;padding:1px 5px;font-size:12.5px}
@media(max-width:640px){body{padding:12px 8px 24px}.card{padding:20px 16px;margin-top:2vh}.row{flex-wrap:wrap}.apps{grid-template-columns:minmax(0,1fr)}
table,tbody,tr,td{display:block;width:100%!important;min-width:0!important}th{display:none}tr{padding:10px 0;border-bottom:1px solid var(--line)}tr:first-child{padding:0;border:0}td{border:0;padding:3px 0;text-align:left!important;white-space:normal!important}td:last-child{padding-top:6px}
.ml{display:inline;color:var(--text-2);font-size:13px;margin-right:6px}td small .ml{font-size:inherit}.rt td.inl{display:inline-flex;align-items:center;width:auto!important;margin-right:18px}.rt td label.ck{margin:0 14px 0 0}
input,select,button,a.nav,.tabs a,label.ck{min-height:44px}button.sm,a.sm{min-height:44px;margin:2px 6px 2px 0;padding:8px 12px}a.nav{margin:2px 6px 2px 0}.navs>span:first-child{flex-basis:100%}details.more summary{padding:12px 0}input[type=checkbox]{min-height:0;width:18px;height:18px}.pw button{min-height:0;top:0;bottom:0}.row>a{display:inline-flex;align-items:center;min-height:44px}}`;
const doc = (title, body) => `<!doctype html><html lang="id" data-theme="system"><head><meta charset="utf-8"><script>try{var t=localStorage.getItem('toolhub-theme'+'-v2');if(/^(light|dark|system)$/.test(t))document.documentElement.setAttribute('data-theme',t)}catch(e){}</script><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Tool Hub</title><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"><style>${GLASS_CSS}${CSS}</style></head><body>${body}</body></html>`;
const topBar = (sess, title, here) => `<div class="top"><h1>${title}</h1><span class="navs"><span style="margin-right:6px">${esc(sess.email)}</span>${here !== '/' ? '<a class="nav" href="/">Beranda</a>' : ''}${sess.role === 'admin' && here !== '/admin' ? '<a class="nav" href="/admin">Admin</a>' : ''}${here !== '/akun' ? '<a class="nav" href="/akun">Ganti password</a>' : ''}<a class="nav" href="/logout">Keluar</a></span></div>`;

/** Satu halaman untuk Masuk dan Daftar. v = isian yang dikembalikan saat ada kesalahan. next = tujuan setelah berhasil. */
const authPage = (env, reg, note = '', v = {}, next = '/') => { const co = profile(env).brand.company; const q = next && next !== '/' ? '?next=' + encodeURIComponent(next) : ''; return doc(reg ? 'Daftar' : 'Masuk', `<form class="card" method="post" action="${reg ? '/daftar' : '/login'}${q}">
<h1>${esc(title(env, 'Tool Hub'))}</h1><p class="sub" style="margin:0">Alat internal tim${co ? ' ' + esc(co) : ''}</p><div class="tabs"><a href="/login${q}"${reg ? '' : ' class="on"'}>Masuk</a><a href="/daftar${q}"${reg ? ' class="on"' : ''}>Daftar</a></div>
${reg ? `<label for="n">Nama</label><input id="n" name="name" required maxlength="60" autocomplete="name" value="${esc(v.name)}" autofocus>` : ''}
<label for="e">${reg ? 'Email' : 'Email atau username'}</label><input id="e" name="email" type="${reg ? 'email' : 'text'}" autocomplete="username" required maxlength="120" value="${esc(v.email)}"${reg ? '' : ' autofocus'}>
${reg ? `<label for="un">Username (opsional, untuk login lebih singkat)</label><input id="un" name="username" maxlength="32" pattern="[a-z0-9._-]{3,32}" placeholder="huruf kecil, angka, titik" value="${esc(v.username)}">` : ''}
<label for="p">Password${reg ? ' (minimal 8 karakter)' : ''}</label>${pwField('p', 'password', reg ? 'new-password' : 'current-password', reg ? ' minlength="8"' : '')}
${reg ? `<label id="wl">Tool yang ingin dipakai</label><div role="group" aria-labelledby="wl">${APPS.map(a => `<label class="opt"><input type="checkbox" name="want" value="${a.id}"${(v.want || []).includes(a.id) ? ' checked' : ''}><span>${esc(a.name)}<br><small>${esc(a.desc)}</small></span></label>`).join('')}</div>
<label for="w">Keperluan (opsional)</label><input id="w" name="why" maxlength="200" value="${esc(v.why)}">` : ''}
<div style="margin-top:20px"><button type="submit" style="width:100%">${reg ? 'Daftar &amp; ajukan akses' : 'Masuk'}</button></div>
${note ? `<div class="msg err">${note}</div>` : ''}<p class="sub" style="margin:16px 0 0">${reg ? 'Setelah daftar, admin menyetujui tool mana saja yang bisa Anda buka.' : 'Belum punya akun? Pilih Daftar. Lupa password? Minta admin mereset, lalu daftar ulang dengan email yang sama.'}</p></form><script>if(location.hash){var f=document.forms[0];f.action+=location.hash;[].forEach.call(document.querySelectorAll('.tabs a'),function(x){x.href+=location.hash})}</script>`); };

const setupPage = env => doc('Belum dikonfigurasi', `<div class="card" style="max-width:560px"><h1>Tool Hub belum dikonfigurasi</h1>
<p class="sub">Di Cloudflare buka Worker ini &rarr; <b>Settings</b>, lalu lengkapi yang belum:</p>
<table><tr><td>${mainAdmins(env).length ? '&#9989;' : '&#10060;'}</td><td><b>ADMIN_EMAILS</b><small>Variables and Secrets &rarr; email admin, pisahkan dengan koma</small></td></tr>
<tr><td>${String(env.SSO_SECRET || '').length >= 32 ? '&#9989;' : '&#10060;'}</td><td><b>SSO_SECRET</b><small>Variables and Secrets &rarr; tipe Secret, teks acak minimal 32 karakter. Nilai yang sama dipasang di setiap tool.</small></td></tr>
<tr><td>${env.HUB_KV ? '&#9989;' : '&#10060;'}</td><td><b>HUB_KV</b><small>Bindings &rarr; Add &rarr; KV namespace, Variable name <b>HUB_KV</b></small></td></tr></table></div>`);

const gatePage = sess => doc('Menunggu persetujuan', `<div class="card"><h1>${sess.status === 'pending' ? 'Menunggu persetujuan admin' : 'Akses tidak aktif'}</h1>
<p class="sub">${sess.status === 'pending' ? 'Pendaftaran Anda sudah diterima. Tool terbuka setelah admin menyetujui.' : 'Akses akun ini ditolak atau sudah dicabut. Hubungi admin bila ini keliru.'}</p>
<p class="sub">Masuk sebagai <b>${esc(sess.email)}</b></p><div class="row"><a href="/"><button type="button" style="width:100%">Cek lagi</button></a><a href="/logout"><button type="button" class="ghost" style="width:100%">Keluar</button></a></div></div>`);

async function form(request) { try { return await request.formData(); } catch (e) { return new FormData(); } }
const fv = (f, k) => String(f.get(k) || '').trim();

async function login(request, env, next) {
  const f = await form(request), typed = fv(f, 'email').toLowerCase(), password = fv(f, 'password');
  // boleh login dengan email atau username
  const email = typed.includes('@') ? typed : USER_RE.test(typed) ? (await env.HUB_KV.get('n:' + typed)) || '' : '';
  // pembatas percobaan per alamat IP + isian. Dihitung per IP supaya orang lain tidak bisa mengunci akun korban.
  const fk = 'f:' + ipOf(request) + ':' + typed.slice(0, 120), fails = Number(await env.HUB_KV.get(fk)) || 0;
  if (fails >= MAX_FAIL) return page(429, authPage(env, false, `Terlalu banyak percobaan gagal. Coba lagi dalam ${LOCK_MIN} menit.`, { email: typed }, next));
  const u = EMAIL_RE.test(email) && password ? await getUser(env, email) : null;
  let ok = false;
  if (u && u.hash) { try { ok = await checkPw(password, u.hash); } catch (e) { ok = false; } }
  if (!ok) {
    await env.HUB_KV.put(fk, String(fails + 1), { expirationTtl: LOCK_MIN * 60 });
    await new Promise(r => setTimeout(r, 800));
    return page(401, authPage(env, false, 'Email/username atau password salah.', { email: typed }, next));
  }
  if (fails) await env.HUB_KV.delete(fk);
  if (!u.hash.startsWith('pbkdf2$')) { u.hash = await hashPw(password); await saveUser(env, email, u); }   // hash impor diganti ke format hub saat login pertama
  return startSession(env, email, u, next);
}

async function register(request, env, next) {
  const f = await form(request), v = { email: fv(f, 'email').toLowerCase(), username: fv(f, 'username').toLowerCase(), name: fv(f, 'name').slice(0, 60), why: fv(f, 'why').slice(0, 200), want: f.getAll('want').map(String).filter(appById) }, password = fv(f, 'password');
  const bad = (status, note) => page(status, authPage(env, true, note, v, next));
  if (!EMAIL_RE.test(v.email) || v.email.length > 120) return bad(400, 'Email belum benar.');
  if (v.username && !USER_RE.test(v.username)) return bad(400, 'Username 3-32 karakter: huruf kecil, angka, titik, minus, atau garis bawah.');
  if (password.length < 8 || password.length > 200) return bad(400, 'Password minimal 8 karakter.');
  if (!v.name) return bad(400, 'Nama wajib diisi.');
  // ponytail: batas pendaftaran per IP per jam, cukup untuk mencegah banjir pendaftaran iseng. Pasang Turnstile kalau masih kebobolan.
  const rk = 'r:' + ipOf(request), n = Number(await env.HUB_KV.get(rk)) || 0;
  if (n >= MAX_REG) return bad(429, 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi satu jam lagi.');
  const old = await getUser(env, v.email);
  if (old && old.hash) return bad(409, 'Email ini sudah terdaftar. Silakan Masuk. Lupa password? Minta admin mereset.');
  const owner = v.username ? await env.HUB_KV.get('n:' + v.username) : null;
  if (owner && owner !== v.email) return bad(409, 'Username sudah dipakai. Pilih yang lain atau kosongkan.');
  await env.HUB_KV.put(rk, String(n + 1), { expirationTtl: 3600 });
  const main = isMain(env, v.email);
  // akun lama tanpa password (ditambahkan admin / di-reset) mempertahankan status, peran, role pekerjaan, dan hak aksesnya.
  // Role pekerjaan tidak dipilih saat daftar: admin yang menentukan (tanpa role = user biasa).
  const u = { role: main ? 'admin' : 'user', status: main ? 'approved' : 'pending', at: stamp(), access: {}, ...(old || {}), name: v.name, why: v.why || (old && old.why) || '', want: v.want, hash: await hashPw(password) };
  if (v.username && !u.username) { u.username = v.username; await env.HUB_KV.put('n:' + v.username, v.email); }
  await saveUser(env, v.email, u);
  if (u.status === 'approved') await syncPlanner(env, { email: v.email, u });
  return startSession(env, v.email, u, next);
}

/* ---------- SSO: tiket untuk tool ----------
   Tool mengirim pengguna ke /sso?app=<id>&back=<alamat halaman di tool itu>.
   Hub memeriksa login + hak akses, lalu mengembalikan pengguna ke "back" dengan ?hub_t=<tiket>.
   Tiket = isi b64url + "." + HMAC(SSO_SECRET), berlaku 60 detik, hanya untuk satu tool. */
async function sso(env, url, sess) {
  const app = appById(url.searchParams.get('app')), back = url.searchParams.get('back') || '';
  const deny = (t, d) => page(403, doc(t, `<div class="card"><h1>${t}</h1><p class="sub">${d}</p><a href="/">Kembali ke beranda</a></div>`));
  if (!app) return deny('Tool tidak dikenal', 'Alamat yang Anda buka tidak terdaftar di Tool Hub.');
  const au = appUrl(env, app.id);
  if (!au) return deny('Tool belum diatur', 'Alamat tool ini belum ada di profil (profile.urls).');
  let b; try { b = new URL(back || au); } catch (e) { b = null; }
  // tiket hanya boleh dikirim ke alamat tool yang terdaftar; kalau tidak, situs lain bisa meminta tiket atas nama pengguna
  if (!b || b.origin !== new URL(au).origin || !(b.pathname + '/').startsWith(new URL(au).pathname.replace(/\/$/, '') + '/')) return deny('Alamat tidak dikenali', 'Permintaan login ini tidak berasal dari alamat tool yang terdaftar.');
  const a = accessOf(sess.u, app);
  if (!a) return deny(`Belum punya akses ke ${esc(app.name)}`, 'Minta admin menambahkan akses tool ini ke akun Anda.');
  if (app.firebase) {
    // tiket ditaruh di belakang tanda # supaya tidak terkirim ke server tool dan tidak tercatat di log
    let t; try { t = await firebaseToken(env, sess.email, a); } catch (e) { return deny('Tutorial belum tersambung', 'Secret <b>FIREBASE_SA</b> belum dipasang di Tool Hub, atau isinya bukan berkas kunci service account yang utuh.'); }
    const f = { fb_t: t, e: sess.email, r: String(a) };
    // admin juga mendapat izin 8 jam untuk menyimpan gambar ke GitHub lewat /gh (token GitHub-nya sendiri tidak pernah keluar dari hub)
    if (app.gh && a === 'admin') { const body = b64u(enc.encode(JSON.stringify({ app: app.id, k: 'gh', e: sess.email, x: Date.now() + 8 * 3600e3 }))); f.h = body + '.' + await hmac(env.SSO_SECRET, body); }
    b.hash = new URLSearchParams(f).toString();
    return redirect(b.href);
  }
  // j = role pekerjaan, supaya tool tahu role orangnya tanpa bertanya lagi (Content Planner: siapa yang boleh memberi tugas)
  const body = b64u(enc.encode(JSON.stringify({ app: app.id, e: sess.email, n: sess.u.name || '', u: sess.u.username || '', j: sess.u.job || '', c: sess.u.branch || '', a, adm: sess.role === 'admin', x: Date.now() + TICKET_SEC * 1000 })));
  b.searchParams.set('hub_t', body + '.' + await hmac(env.SSO_SECRET, body));
  return redirect(b.href);
}

/* ---------- Tiket Firebase (custom token) untuk tool yang loginnya di Firebase ----------
   JWT RS256 yang ditandatangani kunci service account; ditukar browser lewat signInWithCustomToken().
   Peran (submit/admin) ikut di dalam tiket dan dibaca aturan Firestore sebagai request.auth.token.role. */
let fbKey = null;
async function firebaseToken(env, email, role) {
  const sa = JSON.parse(env.FIREBASE_SA);
  if (!fbKey || fbKey.id !== sa.private_key_id) {
    const der = Uint8Array.from(atob(String(sa.private_key).replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
    fbKey = { id: sa.private_key_id, key: await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']) };
  }
  const now = Math.floor(Date.now() / 1000), j = o => b64u(enc.encode(JSON.stringify(o)));
  const body = j({ alg: 'RS256', typ: 'JWT' }) + '.' + j({ iss: sa.client_email, sub: sa.client_email, aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now, exp: now + 300, uid: ('hub:' + email).slice(0, 128), claims: { role, hub_email: email } });
  return body + '.' + b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', fbKey.key, enc.encode(body)));
}

/* ---------- /gh/* : perantara ke GitHub API untuk menyimpan gambar tutorial ----------
   Dipanggil halaman admin tutorial (worker tutorial) dengan "Authorization: Bearer <izin dari /sso>".
   Token GitHub hanya ada di secret GITHUB_TOKEN. Yang diteruskan hanya operasi yang dipakai untuk menambah berkas
   (baca repo & branch, buat blob/tree/commit, majukan branch) di repo proyek (GITHUB_REPO); selain itu ditolak.
   Repo ini juga berisi kode semua tool (dan setiap commit memicu deploy), jadi branch hanya boleh dimajukan ke commit
   yang semata-mata MENAMBAH berkas di folder gambar tutorial (ghDir). */
async function ghProxy(request, env, url) {
  const app = APPS.find(a => a.gh), au = appUrl(env, app.id), repo = String(env.GITHUB_REPO || '');
  const cors = { 'access-control-allow-origin': au ? new URL(au).origin : 'null', 'access-control-allow-methods': 'GET, POST, PATCH', 'access-control-allow-headers': 'authorization, content-type, accept, x-github-api-version', 'access-control-max-age': '600', vary: 'origin', 'cache-control': 'no-store' };
  const out = (status, o) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors } });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const [body, sig] = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').split('.');
  let p = null; if (body && sig && safeEq(await hmac(env.SSO_SECRET, body), sig)) { try { p = JSON.parse(new TextDecoder().decode(fromB64u(body))); } catch (e) { p = null; } }
  if (!p || p.app !== app.id || p.k !== 'gh' || !(p.x > Date.now())) return out(401, { message: 'Izin dari Tool Hub tidak sah atau sudah habis (berlaku 8 jam). Muat ulang halaman ini dari Tool Hub.' });
  const u = await getUser(env, p.e);   // izin gugur begitu orangnya bukan admin tutorial lagi
  if (!u || u.status !== 'approved' || accessOf(u, app) !== 'admin') return out(403, { message: 'Akun ini tidak lagi punya akses admin tutorial di Tool Hub.' });
  if (!env.GITHUB_TOKEN) return out(500, { message: 'Token GitHub belum dipasang di Tool Hub (secret GITHUB_TOKEN).' });
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return out(500, { message: 'Repo GitHub belum diatur di profil (github.repo).' });
  const path = url.pathname.slice(3), base = '/repos/' + repo, br = profile(env).github.branch || 'main', m = request.method;
  const ok = (m === 'GET' && (path === base || path === `${base}/git/ref/heads/${br}` || new RegExp(`^${base}/git/commits/[0-9a-f]{40}$`).test(path)))
    || (m === 'POST' && [`${base}/git/blobs`, `${base}/git/trees`, `${base}/git/commits`].includes(path))
    || (m === 'PATCH' && path === `${base}/git/refs/heads/${br}`);
  if (!ok) return out(403, { message: 'Operasi ini tidak diizinkan lewat Tool Hub.' });
  const gh = (p, init = {}) => fetch('https://api.github.com' + p, { ...init,
    headers: { accept: 'application/vnd.github+json', authorization: 'Bearer ' + env.GITHUB_TOKEN, 'x-github-api-version': '2022-11-28', 'user-agent': 'tool-hub', ...(init.body ? { 'content-type': 'application/json' } : {}) } });
  const text = m === 'GET' ? undefined : await request.text();
  if (m === 'PATCH') {
    // sebelum branch dimajukan: commit baru harus maju lurus dari branch dan hanya menambah berkas di folder gambar
    let j = null; try { j = JSON.parse(text); } catch (e) { j = null; }
    const sha = j && typeof j.sha === 'string' && /^[0-9a-f]{40}$/.test(j.sha) ? j.sha : '';
    const c = sha && !j.force ? await (await gh(`${base}/compare/${br}...${sha}`)).json().catch(() => null) : null;
    const files = (c && c.files) || [];
    if (!c || c.status !== 'ahead' || c.behind_by !== 0 || !files.length || files.length >= 300
      || !files.every(f => f.status === 'added' && String(f.filename).startsWith(app.ghDir + '/') && !String(f.filename).split('/').includes('..')))
      return out(403, { message: 'Tool Hub hanya mengizinkan commit yang menambah gambar di folder ' + app.ghDir + '.' });
  }
  const r = await gh(path, { method: m, body: text });
  return new Response(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json', ...cors } });
}

const listUsers = async env => (await env.HUB_KV.list({ prefix: 'u:' })).keys.map(k => ({ email: k.name.slice(2), ...(k.metadata || {}) }));

/** Anggota Content Planner (akun disetujui yang boleh membukanya, beserta role pekerjaannya) dikirim ke Planner lewat service binding,
 *  supaya pilihan penerima tugas lengkap dan notifikasinya sampai. changed = akun yang barusan diubah (KV list bisa terlambat ~1 menit).
 *  Event & Lead (EVENT) menerima kiriman yang sama: akun yang boleh membukanya (+ cabangnya), daftar cabang, dan tim & role. */
let plannerSyncAt = 0;
async function syncPlanner(env, changed = null) {
  if (!env.PLANNER && !env.EVENT) return;
  plannerSyncAt = Date.now();
  try {
    let [users, org, branches] = await Promise.all([listUsers(env), getOrg(env), getBranches(env)]);
    const J = jobsOf(org);
    if (changed) { users = users.filter(x => x.email !== changed.email); if (changed.u) users.push({ email: changed.email, ...meta(changed.u) }); }
    const has = (x, id) => String(x.apps || '').split(',').includes(id);
    const row = x => ({ email: x.email, name: x.name || '', job: x.job || '', branch: x.br || '' });
    const post = async (bind, id, name, list) => {
      if (!bind || !list.length) return;
      try {
        // daftar cabang ikut terkirim: pilihan cabang di form kegiatan & filter laporan; tim & role: hak akses dan laporan per tim
        const body = JSON.stringify({ users: list, branches, org });
        const r = await timeout(bind.fetch(`https://${id}/__hub/users`, { method: 'POST', headers: { 'x-hub-key': env.SSO_SECRET, 'content-type': 'application/json' }, body }), 6000, name);
        if (!r.ok) console.log(`sinkron anggota ${name}: HTTP ${r.status}`);
      } catch (e) { console.log(`sinkron anggota ${name} gagal:`, e.message); }
    };
    // anggota Planner = admin hub, atau akun yang punya role pekerjaan. User biasa (tanpa role) hanya memakai tool:
    // tidak tampil sebagai pilihan penanggung jawab/penerima tugas.
    await post(env.PLANNER, 'planner', 'Content Planner', users.filter(x => isMain(env, x.email) || (x.status === 'approved' && (x.role === 'admin' || (J[x.job] && has(x, 'planner'))))).map(row));
    // Event & Lead: semua yang boleh membukanya (cabangnya menentukan event yang terlihat)
    await post(env.EVENT, 'event', 'Event & Lead', users.filter(x => isMain(env, x.email) || (x.status === 'approved' && (x.role === 'admin' || has(x, 'event')))).map(row));
  } catch (e) { console.log('sinkron anggota gagal:', e.message); }
}

const ACTS = {
  approve: ['Setujui', u => { u.status = 'approved'; }, 'disetujui'],
  reject: ['Tolak', u => { u.status = 'rejected'; }, 'ditolak'],
  revoke: ['Cabut akses', u => { u.status = 'revoked'; }, 'dicabut aksesnya'],
  make_admin: ['Jadikan admin', u => { u.role = 'admin'; }, 'dijadikan admin'],
  remove_admin: ['Cabut admin', u => { u.role = 'user'; }, 'tidak lagi admin'],
  reset: ['Reset password', u => { delete u.hash; }, 'di-reset passwordnya. Minta ia klik Daftar lagi dengan email yang sama'],
  delete: ['Hapus', null, 'dihapus'],
};
const accessLabel = (x, apps) => x.role === 'admin' ? 'semua tool (admin)' : (apps || '').split(',').filter(Boolean).map(id => (appById(id) || {}).name || id).join(', ') || 'belum ada tool';

/** changed = { email, u|null }: hasil aksi barusan, ditimpakan ke daftar karena KV list bisa terlambat sampai ~1 menit. */
async function adminPage(env, sess, note = '', bad = false, changed = null) {
  let [users, gp, org] = await Promise.all([listUsers(env), galleryProposals(env), getOrg(env)]);
  const J = jobsOf(org);
  if (changed) { users = users.filter(x => x.email !== changed.email); if (changed.u) users.push({ email: changed.email, ...meta(changed.u) }); }
  users.forEach(x => { if (isMain(env, x.email)) { x.role = 'admin'; x.status = 'approved'; x.main = true; } });
  users.sort((a, b) => a.email < b.email ? -1 : 1);
  const btn = (x, act, cls = 'ghost') => `<form method="post" action="/admin/act"${{ delete: 'Hapus akun', reject: 'Tolak pendaftaran', revoke: 'Cabut akses' }[act] ? ` onsubmit="return confirm('${{ delete: 'Hapus akun', reject: 'Tolak pendaftaran', revoke: 'Cabut akses' }[act]} ${esc(x.email)}?')"` : ''}><input type="hidden" name="email" value="${esc(x.email)}"><input type="hidden" name="act" value="${act}"><button class="sm ${cls}">${ACTS[act][0]}</button></form>`;
  const akses = x => `<a class="sm" href="/admin/user?e=${encodeURIComponent(x.email)}">Atur akses</a>`;
  const acts = x => x.main ? '<small>admin utama</small>' : x.email === sess.email ? '<small>akun Anda</small>'
    : x.status === 'pending' ? `<a class="sm" href="/admin/user?e=${encodeURIComponent(x.email)}">Tinjau &amp; setujui</a>` + btn(x, 'reject', 'del')
    : x.status === 'approved' ? akses(x) + (x.reg ? btn(x, x.role === 'admin' ? 'remove_admin' : 'make_admin') + btn(x, 'reset') : '') + btn(x, 'revoke', 'del') + (x.reg ? '' : btn(x, 'delete', 'del'))
    : btn(x, 'approve', '') + btn(x, 'delete', 'del');
  const tbl = (title, rows, empty) => `<h2>${title} (${rows.length})</h2>` + (rows.length ? `<div class="scroll"><table><tr><th>Pengguna</th><th>Akses tool</th><th>Terdaftar</th><th></th></tr>${rows.map(x => `<tr><td><b>${esc(x.email)}</b><small>${esc(x.name || '-')}${x.un ? ' &middot; @' + esc(x.un) : ''}${x.reg ? '' : ' &middot; belum membuat password'} &middot; ${x.job ? esc(J[x.job] || x.job) : 'user biasa'}${x.br ? ' &middot; ' + esc(x.br) : ''}</small>${x.why ? `<small>${esc(x.why)}</small>` : ''}</td><td><small><span class="ml">Akses tool</span>${esc(x.status === 'pending' && x.role !== 'admin' ? 'minta: ' + (accessLabel(x, x.want) === 'belum ada tool' ? 'tidak memilih' : accessLabel(x, x.want)) : accessLabel(x, x.apps))}</small></td><td style="white-space:nowrap"><small><span class="ml">Terdaftar</span>${esc(atTxt(x.at))}</small></td><td style="text-align:right">${acts(x)}</td></tr>`).join('')}</table></div>` : `<p class="sub">${empty}</p>`);
  const by = s => users.filter(x => s.includes(x.status));
  return doc('Admin', `<div class="card wide">${topBar(sess, 'Admin &middot; Tool Hub', '/admin')}
<p class="sub">Kelola siapa saja yang boleh masuk dan tool apa yang boleh dibuka. <a href="/admin/role">Tim &amp; role pekerjaan</a> &middot; <a href="/admin/cabang">Daftar regional &amp; cabang</a> untuk tim regional.${gp.length ? ` <a href="/admin/cabang"><b>${gp.length} usulan galeri baru</b></a> menunggu ditambahkan.` : ''}</p>${note ? `<div class="msg ${bad ? 'err' : 'ok'}" style="margin:0 0 6px">${note}</div>` : ''}
${tbl('Menunggu persetujuan', by(['pending']), 'Tidak ada pengajuan baru.')}${tbl('Disetujui', by(['approved']), 'Belum ada.')}${tbl('Ditolak / dicabut', by(['rejected', 'revoked']), 'Tidak ada.')}
<h2>Tambahkan langsung</h2><p class="sub">Menyetujui email sebelum orangnya mendaftar. Ia tinggal klik Daftar dengan email itu dan langsung bisa masuk.</p>
<form method="post" action="/admin/act" class="row"><input type="hidden" name="act" value="add"><label for="addE" class="vh">Email yang disetujui</label><input id="addE" name="email" type="email" required maxlength="120" placeholder="nama@email.com"><button type="submit">Tambahkan</button></form>
<details class="more"><summary>Impor akun lama (jarang dipakai)</summary><p class="sub" style="margin-top:10px">Tempel isi berkas <b>akun-lama.json</b> untuk memindahkan akun dari tool lama. Akun yang sudah ada di hub tidak ditimpa.</p>
<form method="post" action="/admin/import"><label for="impD" class="vh">Isi akun-lama.json</label><textarea id="impD" name="data" rows="3" required placeholder='{"users":[...]}'></textarea><div style="margin-top:8px"><button type="submit" class="ghost">Impor</button></div></form></details></div>`);
}

// pilihan cabang dikelompokkan per regional; cabang lama yang sudah dihapus dari daftar tetap tampil supaya tidak hilang diam-diam
const brOpts = (cur, B) => (cur && !B.some(x => x.c === cur) ? `<option value="${esc(cur)}" selected>${esc(cur)} (tidak ada lagi di daftar)</option>` : '')
  + [...new Set(B.map(x => x.r))].map(r => `<optgroup label="${esc(r)}">${B.filter(x => x.r === r).map(x => `<option value="${esc(x.c)}"${x.c === cur ? ' selected' : ''}>${esc(x.c)}${x.t === 'galeri' && !/^galeri/i.test(x.c) ? ' (galeri)' : ''}</option>`).join('')}</optgroup>`).join('');
// akses bawaan tim regional: kalender kegiatan cabang + data produk (Fund Insight lihat saja)
const REGIONAL_ACCESS = { planner: '1', fund: 'viewer', etf: '1', bond: '1' };
const regionalJs = `<script>document.getElementById('regAcc').onclick=function(){var A=${JSON.stringify(REGIONAL_ACCESS)};Object.keys(A).forEach(function(k){var el=document.querySelector('[name="a_'+k+'"]');if(!el)return;if(el.tagName==='SELECT')el.value=A[k];else el.checked=true});this.textContent='✓ Content Planner, Fund (lihat saja), ETF & Bond Insight dicentang. Klik Simpan.'}</script>`;

/** Halaman hak akses satu pengguna: per tool, sesuai jenisnya (boleh/tidak, tingkatan, atau per tab). B = daftar regional & cabang. */
function userPage(sess, email, u, note = '', B = [], org = cleanOrg(null)) {
  const J = jobsOf(org), regT = org.teams.filter(t => t.regional).map(t => esc(t.name));
  const acc = u.access || {};
  // akun yang masih menunggu: tool yang diminta saat daftar sudah terpilih (tingkat terendah); admin tinggal mencoret yang tidak disetujui
  const pend = u.status === 'pending', want = u.want || [];
  const blk = a => { const asked = want.includes(a.id), cur = acc[a.id] || (pend && asked ? (a.tabs ? ['*'] : a.levels ? Object.keys(a.levels)[0] : true) : undefined);
    const inner = a.tabs ? `<label class="ck"><input type="checkbox" name="a_${a.id}" value="*"${Array.isArray(cur) && cur.includes('*') ? ' checked' : ''}><b>Semua tab</b></label>` + Object.keys(a.tabs).map(t => `<label class="ck"><input type="checkbox" name="a_${a.id}" value="${t}"${Array.isArray(cur) && cur.includes(t) ? ' checked' : ''}>${esc(a.tabs[t])}</label>`).join('')
      : a.levels ? `<select name="a_${a.id}" aria-labelledby="lg_${a.id}"><option value="">Tidak ada akses</option>${Object.keys(a.levels).map(l => `<option value="${l}"${cur === l ? ' selected' : ''}>${esc(a.levels[l])}</option>`).join('')}</select>`
      : `<label class="ck"><input type="checkbox" name="a_${a.id}" value="1"${cur ? ' checked' : ''}>Boleh membuka</label>`;
    return `<fieldset><legend id="lg_${a.id}">${esc(a.name)}${asked ? ' &middot; diminta' : ''}</legend>${inner}</fieldset>`; };
  return doc('Atur akses', `<form class="card wide" method="post" action="/admin/access">${topBar(sess, 'Atur akses', '/admin/user')}
<p class="sub"><b>${esc(email)}</b>${u.name ? ' &middot; ' + esc(u.name) : ''}${u.username ? ' &middot; @' + esc(u.username) : ''} &middot; status: ${esc(u.status)}${u.role === 'admin' ? ' &middot; <b>admin hub (otomatis punya semua akses)</b>' : ''}</p>
${note ? `<div class="msg ok" style="margin:0 0 6px">${note}</div>` : ''}<input type="hidden" name="email" value="${esc(email)}">
<fieldset><legend>Role pekerjaan</legend><select name="job" aria-label="Role pekerjaan"><option value="none"${J[u.job] ? '' : ' selected'}>Tanpa role (user biasa: hanya memakai tool)</option>${jobOpts(org, u.job)}</select><small class="hint">Akun dengan role masuk daftar anggota Content Planner dan bisa diberi tugas. ${regT.length ? `Anggota tim ${regT.join(' &amp; ')}: di Content Planner hanya melihat dan mencatat <b>Kegiatan cabang</b> dan rencana galeri. ` : ''}<a href="/admin/role">Atur tim &amp; role</a></small>
<button type="button" class="sm ghost" id="regAcc" style="margin:8px 0 0">Pakai akses tim regional</button></fieldset>
<fieldset><legend>Regional &amp; cabang / galeri</legend>${B.length || u.branch ? `<select name="branch" aria-label="Cabang / galeri"><option value="none"${u.branch ? '' : ' selected'}>Tanpa cabang</option>${brOpts(u.branch, B)}</select>` : ''}<small class="hint">${B.length ? 'Untuk tim regional: cabang bawaan saat mencatat kegiatan, dan regional bawaan di laporan.' : 'Daftar cabang belum diisi.'} <a href="/admin/cabang">Atur daftar regional &amp; cabang</a></small></fieldset><div class="apps">${APPS.map(blk).join('')}</div>
<div style="margin-top:18px" class="row"><button type="submit"${pend ? ' name="approve" value="1"' : ''}>${pend ? 'Setujui dengan akses ini' : 'Simpan akses'}</button><a href="/admin" style="flex:none;align-self:center">Kembali ke daftar</a></div>
<p class="sub" style="margin:14px 0 0">Perubahan berlaku paling lambat 2 jam kemudian di tool yang sedang dibuka orangnya, atau langsung setelah ia keluar lalu masuk lagi.</p></form>${regionalJs}`);
}
/** Tim & role pekerjaan: nama role, timnya, dan hak tambahannya (Head, membuat program & membagi tugas, peringatan ops).
 *  Tim bisa ditambah, diganti nama, ditandai regional, atau dihapus (role-nya jadi tanpa tim). Role yang masih dipakai tidak bisa dihapus. */
function rolePage(sess, org, users, note = '', err = '') {
  const n = k => users.filter(x => x.status === 'approved' && x.job === k).length;
  const tOpts = cur => `<option value=""${cur ? '' : ' selected'}>Tanpa tim</option>` + org.teams.map(t => `<option value="${t.id}"${cur === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
  const ck = (name, on, label) => `<label class="ck"><input type="checkbox" name="${name}" value="1"${on ? ' checked' : ''}>${label}</label>`;
  const flags = (x, r) => ck(x + '_head', r.head, 'Head') + ck(x + '_assign', r.assign, 'Program &amp; tugas') + ck(x + '_ops', r.ops, 'Peringatan ops');
  const row = r => `<tr><td><input name="r_${r.k}_name" value="${esc(r.name)}" maxlength="60" required aria-label="Nama role ${esc(r.name)}"></td><td><select name="r_${r.k}_team" aria-label="Tim ${esc(r.name)}">${tOpts(r.team)}</select></td><td>${flags('r_' + r.k, r)}</td><td class="inl"><small><span class="ml">Orang</span>${n(r.k) || '–'}</small></td><td class="inl">${n(r.k) ? '<small>dipakai</small>' : ck(`r_${r.k}_del`, false, 'Hapus')}</td></tr>`;
  return doc('Tim & role', `<form class="card wide xl" method="post" action="/admin/role">${topBar(sess, 'Tim &amp; role pekerjaan', '/admin/role')}
<p class="sub">Role pekerjaan dipilih per orang di <a href="/admin">Admin</a> &rarr; Atur akses. Di Content Planner, laporan dibuat per tim; orang dengan role tanpa tim membuat laporannya masing-masing.</p>
${note ? `<div class="msg ok" style="margin:0 0 6px">${note}</div>` : ''}${err ? `<div class="msg err" style="margin:0 0 6px">${err}</div>` : ''}
<h2>Tim (${org.teams.length})</h2><div class="scroll"><table class="rt"><tr><th>Nama tim</th><th>Tim regional</th><th>Role</th><th></th></tr>${org.teams.map(t => `<tr><td><input name="t_${t.id}_name" value="${esc(t.name)}" maxlength="60" required aria-label="Nama tim ${esc(t.name)}"></td><td class="inl"><span class="ml">Tim regional</span>${ck(`t_${t.id}_reg`, t.regional, 'Ya')}</td><td class="inl"><small><span class="ml">Role</span>${org.roles.filter(r => r.team === t.id).length}</small></td><td class="inl">${ck(`t_${t.id}_del`, false, 'Hapus')}</td></tr>`).join('')}
<tr><td><input name="nt_name" maxlength="60" placeholder="Tim baru (opsional)" aria-label="Nama tim baru"></td><td class="inl"><span class="ml">Tim regional</span>${ck('nt_reg', false, 'Ya')}</td><td></td><td></td></tr></table></div>
<p class="sub" style="margin:4px 0 0">Tim regional: anggotanya di Content Planner hanya melihat dan mencatat kegiatan cabang dan rencana galeri. Menghapus tim membuat role-nya menjadi tanpa tim.</p>
${orgGroups(org).map(([l, R]) => `<h2>${esc(l)} (${R.length})</h2><div class="scroll"><table class="rt"><tr><th>Role</th><th>Tim</th><th>Hak tambahan</th><th>Orang</th><th></th></tr>${R.map(row).join('')}</table></div>`).join('')}
<h2>Tambah role</h2><div class="scroll"><table class="rt"><tr><th>Nama role</th><th>Tim</th><th>Hak tambahan</th></tr><tr><td><input name="nr_name" maxlength="60" placeholder="Mis. Digital Marketing Specialist" aria-label="Nama role baru"></td><td><select name="nr_team" aria-label="Tim role baru">${tOpts('')}</select></td><td>${flags('nr', {})}</td></tr></table></div>
<p class="sub" style="margin:4px 0 0"><b>Head</b>: pimpinan tim, laporannya bawaan seluruh tim (untuk tim regional, semua regional). <b>Program &amp; tugas</b>: boleh membuat program partnership dan membagi tugas. <b>Peringatan ops</b>: lonceng NAB terlambat, premium/diskon ETF, dan gerak harian tidak biasa.</p>
<div style="margin-top:14px" class="row"><button type="submit">Simpan</button><a href="/admin" style="flex:none;align-self:center">Kembali ke Admin</a></div>
<p class="sub" style="margin:10px 0 0">Mengganti nama atau tim sebuah role tidak mengubah kegiatan yang sudah tercatat; laporan langsung memakai tim yang baru. Berlaku di tool yang sedang dibuka paling lambat 2 jam kemudian.</p></form>`);
}
/** Daftar regional & cabang / galeri investasi: diketik atau ditempel dari Excel (2–3 kolom), satu per baris.
 *  P = usulan galeri baru dari Content Planner (tombol "Tambahkan ke daftar" di form yang sama: name=add). */
function branchPage(sess, B, users, note = '', err = '', raw = null, P = []) {
  const n = c => users.filter(x => x.status === 'approved' && x.br === c).length, R = [...new Set(B.map(x => x.r))], G = B.filter(x => x.t === 'galeri').length;
  const ST = { mou: 'MoU ditandatangani', resmi: 'Diresmikan' };
  return doc('Regional & cabang', `<form class="card wide" method="post" action="/admin/cabang">${topBar(sess, 'Regional &amp; cabang', '/admin/cabang')}
<p class="sub">Dipakai tim regional (Sales &amp; GI Coordinator) untuk mencatat kegiatan cabang di Content Planner, dan untuk memfilter laporan per regional, per cabang, atau per galeri. Cabang / galeri tiap orang diatur di <a href="/admin">Admin</a> &rarr; Atur akses.</p>
${note ? `<div class="msg ok" style="margin:0 0 6px">${note}</div>` : ''}${err ? `<div class="msg err" style="margin:0 0 6px">${err}</div>` : ''}
${P.length ? `<h2>Usulan galeri baru (${P.length})</h2><p class="sub" style="margin:0 0 6px">Dari rencana kerja sama galeri di Content Planner yang sudah MoU atau diresmikan, tapi belum ada di daftar.</p>
<div class="scroll"><table><tr><th>Regional</th><th>Galeri</th><th>Mitra &middot; kota</th><th>Tahap</th><th></th></tr>${P.map(p => `<tr><td>${esc(p.r)}</td><td><b>${esc(p.c)}</b><small>PIC: ${esc(p.by || '–')}</small></td><td>${esc([p.partner, p.city].filter(Boolean).join(' · ') || '–')}</td><td>${esc(ST[p.status] || p.status)}</td><td><button type="submit" class="ghost" name="add" value="${esc(p.id)}" formnovalidate>Tambahkan ke daftar</button></td></tr>`).join('')}</table></div>` : ''}
<label for="brList">Satu per baris: <b>Regional | Cabang / galeri</b>. Bisa juga tempel 2 kolom dari Excel. Nama berawalan &ldquo;Galeri&rdquo; otomatis tercatat sebagai galeri investasi.</label>
<p class="sub" style="margin:2px 0 6px">Contoh penulisan: <code>Jakarta | Cabang Sudirman</code> &middot; <code>Jawa Timur | Galeri Investasi Unair</code>. Galeri yang namanya tidak berawalan &ldquo;Galeri&rdquo;: tulis jenisnya di tengah, <code>Jawa Timur | Galeri | Pojok Investasi ITS</code>.</p>
<textarea id="brList" name="list" rows="14" placeholder="Ketik atau tempel daftar cabang di sini">${esc(raw ?? B.map(branchLine).join('\n'))}</textarea>
<div style="margin-top:10px" class="row"><button type="submit">Simpan daftar</button><a href="/admin" style="flex:none;align-self:center">Kembali ke Admin</a></div>
<p class="sub" style="margin:10px 0 0">Mengganti nama cabang tidak mengubah kegiatan yang sudah tercatat dengan nama lama. Orang yang cabangnya dihapus dari daftar tetap memakai cabang lamanya sampai diganti di Atur akses.</p>
${B.length ? `<h2>${R.length} regional &middot; ${B.length - G} cabang &middot; ${G} galeri</h2><div class="scroll"><table><tr><th>Regional</th><th>Cabang / galeri</th><th>Jenis</th><th>Anggota</th></tr>${R.map(r => B.filter(x => x.r === r).map((x, i) => `<tr><td>${i ? '' : `<b>${esc(r)}</b>`}</td><td>${esc(x.c)}</td><td><small>${x.t === 'galeri' ? 'Galeri investasi' : 'Cabang'}</small></td><td><small><span class="ml">Anggota</span>${n(x.c) || '–'}</small></td></tr>`).join('')).join('')}</table></div>` : ''}</form>`);
}
const readAccess = f => { const out = {}; APPS.forEach(a => { const vals = f.getAll('a_' + a.id).map(String);
  if (a.tabs) { const t = vals.includes('*') ? ['*'] : vals.filter(v => a.tabs[v]); if (t.length) out[a.id] = t; }
  else if (a.levels) { if (a.levels[vals[0]]) out[a.id] = vals[0]; }
  else if (vals.length) out[a.id] = true; }); return out; };

/** Impor akun lama. Bentuk: { users: [{ email, username?, name?, hash?, status?, role?, access? }] }. Akun yang sudah ada tidak ditimpa. */
async function importUsers(env, text) {
  let list; try { list = JSON.parse(text).users; } catch (e) { list = null; }
  if (!Array.isArray(list)) return { err: 'Isi tidak terbaca. Tempel seluruh isi berkas akun-lama.json.' };
  let added = 0, skipped = 0;
  for (const x of list.slice(0, 500)) {
    const email = String(x.email || '').toLowerCase().trim();
    if (!EMAIL_RE.test(email) || await env.HUB_KV.get('u:' + email)) { skipped++; continue; }
    const acc = {}; APPS.forEach(a => { const v = x.access && x.access[a.id]; if (a.tabs ? Array.isArray(v) && v.length : a.levels ? a.levels[v] : v === true) acc[a.id] = v; });
    const u = { role: x.role === 'admin' ? 'admin' : 'user', status: ['approved', 'pending', 'rejected', 'revoked'].includes(x.status) ? x.status : 'approved', name: String(x.name || '').slice(0, 60), why: 'impor dari tool lama', at: stamp(), access: acc };
    if (/^(pbkdf2|sats|kfi)\$/.test(String(x.hash || ''))) u.hash = String(x.hash);
    const un = String(x.username || '').toLowerCase();
    if (USER_RE.test(un) && !(await env.HUB_KV.get('n:' + un))) { u.username = un; await env.HUB_KV.put('n:' + un, email); }
    await saveUser(env, email, u); added++;
  }
  return { added, skipped };
}

async function admin(request, env, url, sess) {
  if (sess.role !== 'admin') return page(403, doc('Tidak diizinkan', `<div class="card"><h1>Khusus admin</h1><p class="sub">Akun Anda tidak punya akses ke halaman ini.</p><a href="/">Kembali ke beranda</a></div>`));
  const post = request.method === 'POST', path = url.pathname;
  if (!post && path === '/admin/user') { const e = (url.searchParams.get('e') || '').toLowerCase(), u = await getUser(env, e); return u ? page(200, userPage(sess, e, u, '', await getBranches(env), await getOrg(env))) : page(404, await adminPage(env, sess, 'Akun tidak ditemukan.', true)); }
  if (!post && path === '/admin/role') return page(200, rolePage(sess, await getOrg(env), await listUsers(env)));
  if (!post && path === '/admin/cabang') return page(200, branchPage(sess, await getBranches(env), await listUsers(env), '', '', null, await galleryProposals(env)));
  if (!post) return page(200, await adminPage(env, sess));
  if (request.headers.get('origin') !== url.origin) return page(403, 'Permintaan ditolak.');          // cegah form dari situs lain (CSRF)
  const f = await form(request), email = fv(f, 'email').toLowerCase(), act = fv(f, 'act');
  if (path === '/admin/role') {
    const [old, users] = await Promise.all([getOrg(env), listUsers(env)]), used = k => users.some(x => x.status === 'approved' && x.job === k);
    const teams = old.teams.filter(t => !fv(f, `t_${t.id}_del`)).map(t => ({ id: t.id, name: fv(f, `t_${t.id}_name`) || t.name, regional: !!fv(f, `t_${t.id}_reg`) }));
    const nt = fv(f, 'nt_name').slice(0, 60);
    if (nt) { if (teams.some(t => t.name.toLowerCase() === nt.toLowerCase())) return page(400, rolePage(sess, old, users, '', `Belum tersimpan: tim &ldquo;${esc(nt)}&rdquo; sudah ada.`)); teams.push({ id: newKey(nt, old.teams.map(t => t.id)), name: nt, regional: !!fv(f, 'nt_reg') }); }
    const flag = (x, r) => ({ ...r, head: !!fv(f, x + '_head'), assign: !!fv(f, x + '_assign'), ops: !!fv(f, x + '_ops') });
    const roles = old.roles.filter(r => !(fv(f, `r_${r.k}_del`) && !used(r.k))).map(r => flag('r_' + r.k, { k: r.k, name: fv(f, `r_${r.k}_name`) || r.name, team: fv(f, `r_${r.k}_team`) }));
    const nr = fv(f, 'nr_name').slice(0, 60);
    if (nr) roles.push(flag('nr', { k: newKey(nr, old.roles.map(r => r.k)), name: nr, team: fv(f, 'nr_team') }));
    const dup = roles.find((r, i) => roles.findIndex(x => x.name.toLowerCase() === r.name.toLowerCase()) !== i);
    if (dup) return page(400, rolePage(sess, old, users, '', `Belum tersimpan: ada dua role bernama &ldquo;${esc(dup.name)}&rdquo;.`));
    if (!roles.length) return page(400, rolePage(sess, old, users, '', 'Belum tersimpan: minimal satu role.'));
    const org = cleanOrg({ teams, roles });
    await env.HUB_KV.put('cfg:org', JSON.stringify(org)); await syncPlanner(env);
    return page(200, rolePage(sess, org, users, `Tersimpan: ${org.teams.length} tim, ${org.roles.length} role.${nr ? ` Role &ldquo;${esc(nr)}&rdquo; sudah bisa dipilih di Atur akses.` : ''} Content Planner ikut diperbarui.`));
  }
  if (path === '/admin/cabang') {
    const old = await getBranches(env), users = await listUsers(env), P = await galleryProposals(env), add = fv(f, 'add');
    // "Tambahkan ke daftar" pada usulan galeri: diambil ulang dari Planner (bukan dari isian form), isi kotak yang belum disimpan diabaikan
    if (add) {
      const p = P.find(x => x.id === add), r = String((p && p.r) || '').slice(0, 60), c = String((p && p.c) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!p || !r || !c) return page(400, branchPage(sess, old, users, '', 'Usulan ini sudah tidak ada. Mungkin sudah ditambahkan atau tahapnya diubah di Content Planner.', null, P));
      if (old.some(x => x.c.toLowerCase() === c.toLowerCase())) return page(200, branchPage(sess, old, users, `${esc(c)} sudah ada di daftar.`, '', null, P));
      const B = [...old, { r, c, t: 'galeri' }];
      await env.HUB_KV.put('cfg:cabang', JSON.stringify(B)); await syncPlanner(env);
      return page(200, branchPage(sess, B, users, `${esc(c)} ditambahkan ke regional ${esc(r)} sebagai galeri investasi. Atur pengelolanya lewat Admin &rarr; Atur akses.`, '', null, P.filter(x => x.id !== add)));
    }
    const raw = fv(f, 'list'), B = parseBranches(raw);
    const lines = raw.split(/\r?\n/).filter(l => l.trim()), odd = lines.filter(l => !/\S\s*[|\t]\s*\S/.test(l));
    // Kotak kosong, atau ada isi tapi tak satu pun terbaca: jangan simpan (daftar lama tetap).
    if (!B.length) return page(400, branchPage(sess, old, users, '', lines.length
      ? 'Belum tersimpan: tidak ada baris yang terbaca. Tiap baris berisi regional, tanda <b>|</b>, lalu nama cabang, misalnya <code>Jakarta | Cabang Sudirman</code>.'
      : 'Belum tersimpan: kotak kosong. Daftar lama tidak dihapus; untuk menghapus satu cabang, hapus barisnya saja lalu simpan.', raw, P));
    await env.HUB_KV.put('cfg:cabang', JSON.stringify(B)); await syncPlanner(env);
    const skip = odd.length ? ` ${odd.length} baris dilewati karena tidak ada tanda |: ${odd.slice(0, 3).map(l => `<code>${esc(l.trim().slice(0, 60))}</code>`).join(', ')}${odd.length > 3 ? ', …' : ''}.` : '';
    const G = B.filter(x => x.t === 'galeri').length, left = P.filter(p => !B.some(x => x.c.toLowerCase() === String(p.c).toLowerCase()));
    return page(200, branchPage(sess, B, users, `Tersimpan: ${B.length - G} cabang dan ${G} galeri di ${new Set(B.map(x => x.r)).size} regional. Pilihan cabang di Content Planner ikut diperbarui.${skip}`, '', null, left));
  }
  const bad = note => adminPage(env, sess, note, true).then(h => page(400, h));
  if (path === '/admin/import') { const r = await importUsers(env, fv(f, 'data')); return r.err ? bad(r.err) : page(200, await adminPage(env, sess, `Impor selesai: ${r.added} akun ditambahkan, ${r.skipped} dilewati (sudah ada atau email tidak valid). Daftar di bawah bisa terlambat tampil sampai 1 menit.`)); }
  if (!EMAIL_RE.test(email) || email.length > 120) return bad('Email belum benar.');
  let u = await getUser(env, email);
  if (path === '/admin/access') {
    if (!u) return bad('Akun tidak ditemukan.');
    u.access = readAccess(f); const ok = fv(f, 'approve') && u.status === 'pending'; if (ok) u.status = 'approved';
    // role pekerjaan ditentukan admin: "none" = user biasa (tanpa role)
    const org = await getOrg(env), job = fv(f, 'job'); if (jobsOf(org)[job]) u.job = job; else if (job === 'none') delete u.job;
    // cabang harus dari daftar; cabang lama yang sudah dihapus dari daftar dibiarkan sampai diganti
    const B = await getBranches(env), br = fv(f, 'branch'), hit = B.find(x => x.c === br);
    if (br === 'none') { delete u.branch; delete u.region; } else if (hit) { u.branch = hit.c; u.region = hit.r; }
    await saveUser(env, email, u); await syncPlanner(env, { email, u });
    return page(200, userPage(sess, email, u, ok ? 'Disetujui. Akses disimpan.' : 'Akses disimpan.', B, org));
  }
  if (path !== '/admin/act') return page(404, 'Tidak ditemukan');
  if (act === 'add') {
    if (u && u.status === 'approved') return bad(`<b>${esc(email)}</b> sudah disetujui.`);
    u = { role: 'user', at: stamp(), why: 'ditambahkan admin', access: {}, ...(u || {}), status: 'approved' };
    await saveUser(env, email, u); await syncPlanner(env, { email, u });
    return page(200, await adminPage(env, sess, `<b>${esc(email)}</b> ditambahkan.${u.hash ? '' : ' Minta ia klik Daftar dengan email itu untuk membuat password.'} Klik <b>Atur akses</b> untuk memilih tool-nya.`, false, { email, u }));
  }
  if (!ACTS[act]) return bad('Aksi tidak dikenal.');
  if (!u) return bad('Akun tidak ditemukan.');
  if (isMain(env, email)) return bad('Admin utama diatur lewat ADMIN_EMAILS di Cloudflare, bukan dari halaman ini.');
  if (email === sess.email) return bad('Tidak bisa mengubah akun yang sedang dipakai.');
  if (act === 'delete') { await env.HUB_KV.delete('u:' + email); if (u.username) await env.HUB_KV.delete('n:' + u.username); u = null; } else { ACTS[act][1](u); await saveUser(env, email, u); }
  if (act !== 'reset') await syncPlanner(env, { email, u });
  return page(200, await adminPage(env, sess, `<b>${esc(email)}</b> ${ACTS[act][2]}.${act === 'approve' ? ' Klik <b>Atur akses</b> untuk memilih tool-nya.' : ''}`, false, { email, u }));
}

async function account(request, env, url, sess) {
  const view = (note = '', bad = false) => doc('Ganti password', `<form class="card" method="post" action="/akun">${topBar(sess, 'Ganti password', '/akun')}
<label for="po">Password sekarang</label>${pwField('po', 'old', 'current-password')}<label for="pn">Password baru (minimal 8 karakter)</label>${pwField('pn', 'pw', 'new-password', ' minlength="8"')}
<div style="margin-top:20px"><button type="submit" style="width:100%">Simpan</button></div>${note ? `<div class="msg ${bad ? 'err' : 'ok'}">${note}</div>` : ''}<p class="sub" style="margin:16px 0 0">Satu password ini berlaku untuk semua tool.</p></form>`);
  if (request.method !== 'POST') return page(200, view());
  if (request.headers.get('origin') !== url.origin) return page(403, 'Permintaan ditolak.');
  const f = await form(request), pw = fv(f, 'pw');
  if (!(await checkPw(fv(f, 'old'), sess.u.hash))) return page(400, view('Password sekarang salah.', true));
  if (pw.length < 8 || pw.length > 200) return page(400, view('Password baru minimal 8 karakter.', true));
  sess.u.hash = await hashPw(pw); await saveUser(env, sess.email, sess.u);
  return page(200, view('Password diganti.'), { 'set-cookie': cookieStr(await makeSession(env, sess.email, sess.u), SESSION_DAYS * 86400) });
}

/** Label hak akses pengguna untuk satu tool (ditampilkan di halaman detail). */
function levelLabel(a, acc) {
  if (a.tabs) return Array.isArray(acc) && acc.includes('*') ? 'Semua tab' : Array.isArray(acc) ? acc.map(t => a.tabs[t] || t).join(', ') : '';
  if (a.levels) return a.levels[acc] || '';
  return '';
}

/** Dashboard: sidebar, beranda (Tool kamu, Ritme & kartu hari ini), Semua tools, detail tool, dan tool di dalam bingkai.
 *  Tampilan ada di shell.html; di sini hanya data pengguna yang disuntikkan. Tool tetap dibuka di bingkai lewat /sso seperti sebelumnya. */
function shellPage(env, sess, mine, pending, fav, org = cleanOrg(null)) {
  const p = profile(env), repo = env.GITHUB_REPO || p.github.repo || '';
  const src = a => a.firebase || a.frame === false ? appUrl(env, a.id) + ((a.paths && a.paths[accessOf(sess.u, a)]) || a.path || '/') : '/sso?app=' + a.id + '&back=' + encodeURIComponent(appUrl(env, a.id) + (a.entry || a.path || '/'));
  const pages = a => (a.pages || []).filter(x => !x.only || x.only === accessOf(sess.u, a)).map(x => [x.label, appUrl(env, a.id) + x.path, x.share ? 1 : 0]);
  const boot = {
    me: { name: sess.u.name || '', email: sess.email, admin: sess.role === 'admin', job: jobsOf(org)[sess.u.job] || '', ops: sess.role === 'admin' || opsAlert(org, sess.u.job) },
    pending,
    brand: { name: title(env, 'Tool Hub'), short: p.brand.short || '', logo: p.brand.logo || '', logoDark: p.brand.logoDark || '' },
    cats: CATEGORIES,
    apps: mine.map(a => ({
      id: a.id, name: a.name, desc: a.desc, blurb: a.blurb || '', cat: CATEGORIES[a.cat] ? a.cat : 'research', icon: a.icon || 'grid',
      features: a.features || [], ai: a.ai || '', kw: a.kw || '', src: src(a), pages: pages(a), lvl: levelLabel(a, accessOf(sess.u, a)),
    })),
    fav,
    today: { ...Object.fromEntries(FEEDS.map(f => [f.id, mine.some(a => a.id === f.id)])), jobs: !!repo, cron: !!env.CRON,
      rhythm: RHYTHM.some(s => s.tools.some(id => mine.some(a => a.id === id))) || mine.some(a => a.id === 'planner') },
    actions: repo ? 'https://github.com/' + repo + '/actions' : '',
  };
  // JSON di dalam <script>: "<" dan pemisah baris Unicode di-escape supaya isi data tidak bisa menutup tag script
  const LSEP = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
  const json = JSON.stringify(boot).replace(/</g, '\\u003c').replace(LSEP, c => '\\u' + c.charCodeAt(0).toString(16));
  return SHELL.replace('<title>Tool Hub</title>', () => '<title>' + esc(title(env, 'Tool Hub')) + '</title>').replace('"__BOOT__"', () => json);
}

/* ---------- Beranda: favorit & ringkasan "Hari ini" ---------- */
// Favorit disimpan per akun di kunci terpisah (pref:<email>), jadi menyimpan favorit tidak pernah menimpa data akun.
const MAX_FAV = 12;
async function getFav(env, email, mine) {
  const p = await env.HUB_KV.get('pref:' + email, 'json').catch(() => null);
  return Array.isArray(p && p.fav) ? p.fav.filter(id => mine.some(a => a.id === id)) : [];
}
async function savePrefs(request, env, url, sess, mine) {
  if (request.headers.get('origin') !== url.origin) return Response.json({ error: 'Permintaan ditolak.' }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  if (!b || !Array.isArray(b.fav)) return Response.json({ error: 'Isian tidak sah.' }, { status: 400 });
  const fav = [...new Set(b.fav.map(String))].filter(id => mine.some(a => a.id === id)).slice(0, MAX_FAV);
  await env.HUB_KV.put('pref:' + sess.email, JSON.stringify({ fav }));
  return Response.json({ fav }, { headers: { 'cache-control': 'no-store' } });
}

const timeout = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(what + ' tidak menjawab dalam ' + ms / 1000 + ' detik.')), ms))]);
/** Ringkasan tool lewat service binding (shared/hubfeed.js). Hanya dipanggil untuk tool yang boleh diakses pengguna. */
async function feedFrom(env, binding, name, query = '') {
  if (!env[binding]) throw new Error(name + ' belum tersambung ke Tool Hub (service binding ' + binding + ').');
  const r = await timeout(env[binding].fetch('https://' + binding.toLowerCase() + '/__hub/today' + query, { headers: { 'x-hub-key': env.SSO_SECRET } }), 6000, name);
  if (r.status === 403 || r.status === 404) throw new Error(name + ' belum diperbarui untuk ringkasan ini. Deploy ulang ' + name + '.');
  if (!r.ok) throw new Error(name + ': HTTP ' + r.status);
  return r.json();
}
// Status GitHub Actions: satu permintaan, disimpan 2 menit per isolate (Cache API tidak berlaku di workers.dev).
// Untuk run yang gagal, langkah yang gagal dibaca sekali per run (maks. 3 per muat; run yang sudah selesai tidak berubah lagi).
let ghCache = null;
const ghSteps = new Map();
async function jobRuns(env) {
  const repo = env.GITHUB_REPO || profile(env).github.repo || '';
  if (!repo) throw new Error('Repo GitHub belum diatur di profil (github.repo).');
  if (ghCache && ghCache.repo === repo && Date.now() - ghCache.t < 120e3) return ghCache.v;
  const get = (auth, p) => fetch('https://api.github.com/repos/' + repo + p, {
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'tool-hub', ...(auth ? { authorization: 'Bearer ' + env.GITHUB_TOKEN } : {}) },
  });
  const RUNS = '/actions/runs?per_page=60&exclude_pull_requests=true';
  let auth = !!env.GITHUB_TOKEN, r = await timeout(get(auth, RUNS), 6000, 'GitHub');
  if ((r.status === 401 || r.status === 403) && auth) { auth = false; r = await timeout(get(false, RUNS), 6000, 'GitHub'); }   // token tanpa izin Actions: repo publik tetap terbaca
  if (r.status === 403 || r.status === 429) throw new Error('Batas permintaan GitHub tercapai. Coba lagi beberapa menit lagi.');
  if (!r.ok) throw new Error('GitHub: HTTP ' + r.status);
  const runs = (await r.json()).workflow_runs || [], latest = new Map();
  for (const x of runs) if (!latest.has(x.workflow_id)) latest.set(x.workflow_id, x);   // API mengurutkan dari yang terbaru
  const state = x => x.status !== 'completed' ? 'run' : x.conclusion === 'success' ? 'ok'
    : ['failure', 'timed_out', 'startup_failure'].includes(x.conclusion) ? 'err' : x.conclusion === 'cancelled' ? 'warn' : 'muted';
  const order = { err: 0, run: 1, warn: 2, ok: 3, muted: 4 };
  const list = [...latest.values()].map(x => ({ id: x.id, name: x.name, state: state(x), at: x.updated_at || x.created_at, url: x.html_url, event: x.event }))
    .sort((a, b) => (order[a.state] - order[b.state]) || a.name.localeCompare(b.name));
  if (ghSteps.size > 200) ghSteps.clear();
  await Promise.all(list.filter(x => x.state === 'err' && !ghSteps.has(x.id)).slice(0, 3).map(async x => {
    try {
      const j = await timeout(get(auth, '/actions/runs/' + x.id + '/jobs?filter=latest&per_page=30'), 4000, 'GitHub');
      if (!j.ok) return;
      const bad = c => c === 'failure' || c === 'timed_out', jobs = (await j.json()).jobs || [], job = jobs.find(y => bad(y.conclusion));
      const step = job && (job.steps || []).find(s => bad(s.conclusion));
      ghSteps.set(x.id, job ? [jobs.length > 1 || !step ? job.name : '', step ? step.name : ''].filter(Boolean).join(' › ') : '');
    } catch (e) { }   // tanpa nama langkah, baris job tetap tampil
  }));
  // semua run hari ini (WIB), untuk garis waktu Ritme hari ini
  const start = Date.parse(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00+07:00');
  const today = runs.filter(x => Date.parse(x.created_at) >= start).map(x => ({ wf: String(x.path || '').split('/').pop(), state: state(x), at: Date.parse(x.created_at), url: x.html_url, step: ghSteps.get(x.id) || '' }));
  const v = { at: new Date().toISOString(), runs: list.map(({ id, ...x }) => ({ ...x, step: ghSteps.get(id) || '' })), today };
  ghCache = { repo, t: Date.now(), v };
  return v;
}
/** POST /api/notif/read { ids: [...] } atau { all: true }: notifikasi tugas disimpan di Content Planner, jadi diteruskan ke sana. */
async function readNotif(request, env, url, sess, mine) {
  if (request.headers.get('origin') !== url.origin) return Response.json({ error: 'Permintaan ditolak.' }, { status: 403 });
  if (!env.PLANNER || !mine.some(a => a.id === 'planner')) return Response.json({ error: 'Tidak ada notifikasi.' }, { status: 404 });
  const b = await request.json().catch(() => ({}));
  const body = { email: sess.email, ...(b && b.all ? { all: true } : { ids: Array.isArray(b && b.ids) ? b.ids.slice(0, 90) : [] }) };
  const r = await timeout(env.PLANNER.fetch('https://planner/__hub/notif', { method: 'POST', headers: { 'x-hub-key': env.SSO_SECRET, 'content-type': 'application/json' }, body: JSON.stringify(body) }), 6000, 'Content Planner');
  return Response.json(await r.json().catch(() => ({})), { status: r.ok ? 200 : 502, headers: { 'cache-control': 'no-store' } });
}
/** Kartu "Hari ini": id tool, service binding, dan apakah tool perlu tahu email pengguna (isi "milikmu"). */
const FEEDS = [
  { id: 'recap', binding: 'RECAP', name: 'Market Recap' },
  { id: 'planner', binding: 'PLANNER', name: 'Content Planner', email: true },
  { id: 'fund', binding: 'FUND', name: 'Fund Insight' },
  { id: 'competitor', binding: 'COMPETITOR', name: 'Competitor Intelligence' },
  { id: 'edukasi', binding: 'EDUKASI', name: 'Edukasi Studio', email: true },
  { id: 'news', binding: 'NEWS', name: 'Market News' },
  { id: 'etf', binding: 'ETF', name: 'ETF Insight' },
  { id: 'bond', binding: 'BOND', name: 'Bond Insight' },
];
/** GET /api/today: tiap bagian berdiri sendiri; kalau satu tool lambat atau error, bagian lain tetap tampil. */
async function todayFeed(env, sess, mine) {
  const has = id => mine.some(a => a.id === id), out = {};
  const wrap = (k, p) => p.then(data => { out[k] = { ok: true, data }; }, e => { out[k] = { ok: false, error: String((e && e.message) || e).slice(0, 240) }; });
  await Promise.all([
    ...FEEDS.filter(f => has(f.id)).map(f => wrap(f.id, feedFrom(env, f.binding, f.name, f.email ? '?email=' + encodeURIComponent(sess.email) : ''))),
    wrap('jobs', jobRuns(env)),
    env.CRON && wrap('cron', feedFrom(env, 'CRON', 'Jadwal cron')),
  ].filter(Boolean));
  try { out.rhythm = { ok: true, data: rhythm(Date.now(), out, has) }; } catch (e) { out.rhythm = { ok: false, error: String((e && e.message) || e).slice(0, 240) }; }
  return Response.json(out, { headers: { 'cache-control': 'no-store' } });
}

/* ---------- Ritme hari ini: langkah harian menurut jam bursa (WIB) ---------- */
// at = jadwal, late = batas wajar (lewat ini tanpa hasil = merah), bourse = hanya Senin–Jumat, tools = tampil bila salah satunya boleh dibuka.
// Bukti selesai: wf = run workflow GitHub (nama berkas) yang dimulai dalam jendela [from, to) hari ini; fundAt = tarikan data Fund Insight
// setelah jam itu; recap = status sesi Market Recap. Jadwalnya mengikuti apps/cron, apps/story-data, dan .github/workflows.
const RHYTHM = [
  { id: 'cal', at: '00:00', late: '03:00', title: 'Data Story Morning', sub: 'Kalender & penutupan terakhir', tools: ['story'], bourse: true, wf: 'story-data.yml', from: '00:00', to: '12:00' },
  { id: 'pdf', at: '07:00', late: '08:30', title: 'PDF produk', sub: 'Fund & Bond', tools: ['fund', 'bond'], wf: 'pdf.yml', from: '00:00', to: '24:00' },
  { id: 'nav1', at: '09:05', late: '10:30', title: 'NAB reksa dana pagi', sub: 'Tarikan data Fund Insight', tools: ['fund'], fundAt: '09:00' },
  { id: 's1', at: '12:00', late: '13:45', title: 'Market Recap sesi 1', sub: 'Disusun saat jeda siang', tools: ['recap'], bourse: true, recap: 's1' },
  { id: 'wrap', at: '16:50', late: '18:00', title: 'Data Story Wrap', sub: 'Penutupan IDX', retry: 'dicoba lagi 17.25', tools: ['story'], bourse: true, wf: 'story-data.yml', from: '16:00', to: '24:00' },
  { id: 'close', at: '17:20', late: '18:30', title: 'Market Recap penutupan', sub: 'Setelah data penutupan ada', tools: ['recap'], bourse: true, recap: 'close' },
  { id: 'sats', at: '17:20', late: '20:30', title: 'Sinyal SATS', sub: '', retry: 'Dicoba lagi 19.20 bila belum', tools: ['sats'], bourse: true, wf: 'sats-eod.yml', from: '17:00', to: '24:00' },
  { id: 'nav2', at: '18:05', late: '19:30', title: 'NAB reksa dana sore', sub: 'Tarikan data Fund Insight', tools: ['fund'], fundAt: '18:00' },
];
const hm = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
const hhmm = ms => new Date(ms + 7 * 3600e3).toISOString().slice(11, 16).replace(':', '.');
/** Garis waktu hari ini. Fungsi murni: now = ms, parts = isi /api/today (recap, planner, fund, jobs), has(id) = pengguna boleh membuka tool itu.
 *  state: ok (selesai), warn (ada hasil tapi belum tuntas, mis. draf), err (gagal / lewat batas tanpa hasil), run (sedang jalan),
 *  due (sudah waktunya, menunggu hasil), wait (belum waktunya), muted (status tidak terbaca / batal). */
export function rhythm(now, parts, has) {
  const w = new Date(now + 7 * 3600e3), date = w.toISOString().slice(0, 10), min = w.getUTCHours() * 60 + w.getUTCMinutes(), dow = w.getUTCDay();
  const bourse = dow >= 1 && dow <= 5, start = Date.parse(date + 'T00:00:00+07:00'), at = t => start + hm(t) * 60e3;
  const data = k => (parts[k] && parts[k].ok ? parts[k].data : null);
  const jobs = data('jobs'), recap = data('recap'), fund = data('fund'), plan = data('planner');
  const steps = [];
  // tanpa bukti: belum waktunya, menunggu, atau lewat batas
  const none = (s, what) => min < hm(s.at) ? ['wait', 'Dijadwalkan ' + s.at.replace(':', '.')] : min < hm(s.late) ? ['due', what || 'Menunggu hasil'] : ['err', 'Belum ada hasil sampai ' + s.late.replace(':', '.')];
  for (const s0 of RHYTHM) {
    if (!s0.tools.some(has) || (s0.bourse && !bourse)) continue;
    const s = dow === 5 && s0.id === 's1' ? { ...s0, at: '11:30', late: '14:15', sub: 'Disusun saat jeda siang (Jumat)' } : s0;
    let st, url = '', sub = s.sub;
    if (s.wf) {
      if (!jobs) st = ['muted', 'Status GitHub tidak terbaca'];
      else {
        const rs = (jobs.today || []).filter(x => x.wf === s.wf && x.at >= at(s.from) && x.at < at(s.to)).sort((a, b) => b.at - a.at);
        const good = rs.find(x => x.state === 'ok'), last = rs[0];
        if (good) { st = ['ok', 'Selesai ' + hhmm(good.at)]; url = good.url; }
        else if (last && last.state === 'run') { st = ['run', 'Sedang jalan sejak ' + hhmm(last.at)]; url = last.url; }
        else if (last && last.state === 'err') { st = ['err', 'Gagal' + (last.step ? ' di ' + last.step : '') + ' · ' + hhmm(last.at)]; url = last.url; }
        else st = none(s);
      }
    } else if (s.fundAt) {
      // Fund Insight hanya melaporkan tarikan terakhir. Kalau tarikan itu sudah milik langkah berikutnya (mis. NAB sore),
      // jam selesai langkah ini tidak diketahui; jangan tampilkan jam tarikan sore sebagai jam selesai pagi.
      const t = fund && Date.parse(fund.at), later = RHYTHM.find(x => x.fundAt && hm(x.fundAt) > hm(s.fundAt));
      st = !fund ? ['muted', 'Data Fund Insight tidak terbaca'] : t >= at(s.fundAt)
        ? ['ok', later && t >= at(later.fundAt) ? 'Selesai · data terbaru ' + hhmm(t) : 'Selesai ' + hhmm(t)] : none(s);
    } else if (s.recap) {
      const x = recap && recap.date === date ? (recap.sessions || []).find(y => y.session === s.recap) : null;
      st = !recap ? ['muted', 'Market Recap tidak terbaca'] : x && x.status === 'published' ? ['ok', 'Terbit'] : x && x.status === 'draft' ? ['warn', 'Draf, belum terbit'] : none(s, 'Sedang disusun otomatis');
      // isi kartu Market Recap lama ikut di sini: judul rangkuman & perubahan IHSG
      if (x && x.status !== 'none') {
        if (x.pct != null && x.pct !== '' && !isNaN(+x.pct)) st = [st[0], st[1] + ' · IHSG ' + (+x.pct > 0 ? '+' : '') + (+x.pct).toFixed(2).replace('.', ',') + '%'];
        if (x.title) sub = x.title;
      }
    }
    if (s.retry && st[0] !== 'ok') sub = [sub, s.retry].filter(Boolean).join(', ');   // catatan coba ulang hanya selama belum selesai
    steps.push({ id: s.id, at: s.at, title: s.title, sub, state: st[0], note: st[1], tool: s.tools.find(has), url });
  }
  // kegiatan Content Planner hari ini yang berjam (konten, artikel, edukasi): tandanya mengikuti statusnya
  let untimed = 0;
  if (plan && has('planner')) for (const it of plan.today || []) {
    if (!/^\d{2}:\d{2}/.test(it.time || '')) { untimed++; continue; }
    const t = it.time.slice(0, 5), stt = it.status || '';
    const st = ['terbit', 'selesai'].includes(stt) ? ['ok', stt === 'terbit' ? 'Terbit' : 'Selesai'] : stt === 'batal' ? ['muted', 'Batal']
      : min >= hm(t) + 60 ? ['warn', 'Masih ' + (stt || 'belum ada status')] : min >= hm(t) ? ['due', 'Sekarang · ' + (stt || 'belum ada status')] : ['wait', 'Status: ' + (stt || '-')];
    steps.push({ id: 'plan:' + it.id, at: t, title: it.title, sub: [(plan.kinds || {})[it.kind] || it.kind, it.channel].filter(Boolean).join(' · '), state: st[0], note: st[1], tool: 'planner', url: '', planner: true });
  }
  steps.sort((a, b) => hm(a.at) - hm(b.at));
  return { date, now: hhmm(now), bourse, steps, untimed, planner: !!(plan && has('planner')) };
}

export { APPS, checkPw, hashPw, RHYTHM };
export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url), path = url.pathname, post = request.method === 'POST';
    if (!configured(env)) return page(500, setupPage(env));
    if (path.startsWith('/gh/')) return ghProxy(request, env, url);
    if (path === '/logout') return redirect('/login', { 'set-cookie': cookieStr('', 0) });
    const sess = await readSession(env, request.headers.get('cookie'));
    const next = safeNext(url.searchParams.get('next'));
    if (path === '/login' || path === '/daftar') {
      const reg = path === '/daftar';
      if (post) return reg ? register(request, env, next) : login(request, env, next);
      return sess ? redirect(next) : page(200, authPage(env, reg, '', {}, next));
    }
    if (!sess) return post || path.startsWith('/api/') ? page(401, 'Sesi habis. Muat ulang halaman lalu login lagi.') : redirect('/login' + (path === '/' ? '' : '?next=' + encodeURIComponent(path + url.search)));
    if (sess.status !== 'approved') return page(403, gatePage(sess));
    if (path === '/role') return redirect('/');   // dulu halaman pilih role; sekarang role ditentukan admin
    if (path === '/sso') return sso(env, url, sess);
    if (path === '/admin' || path.startsWith('/admin/')) return admin(request, env, url, sess);
    if (path === '/akun') return account(request, env, url, sess);
    const mine = APPS.filter(a => accessOf(sess.u, a));
    if (path === '/api/today' && !post) return todayFeed(env, sess, mine);
    if (path === '/api/prefs' && post) return savePrefs(request, env, url, sess, mine);
    if (path === '/api/notif/read' && post) return readNotif(request, env, url, sess, mine);
    if (path !== '/') return redirect('/');
    if (Date.now() - plannerSyncAt > 30 * 60e3) await syncPlanner(env);   // sesekali, supaya daftar anggota Planner tetap sama dengan hub
    return page(200, shellPage(env, sess, mine, sess.role === 'admin' ? (await listUsers(env)).filter(x => x.status === 'pending').length : 0, await getFav(env, sess.email, mine), await getOrg(env)),
      { 'set-cookie': cookieStr(await makeSession(env, sess.email, sess.u), SESSION_DAYS * 86400) });   // perbarui cookie (juga memperpanjang sesi 30 hari)
  },
};