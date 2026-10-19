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

// frame: false = belum bisa tampil di dalam dashboard, dibuka di tab browser baru (hapus setelah tool itu disambungkan ke hub).
// Daftar tool. Alamat tool = profile.urls[id] (appUrl); tiket hanya dikirim ke alamat ini. levels / tabs = pilihan hak akses di halaman admin.
const APPS = [
  { id: 'email', name: 'Email Studio', desc: 'Generator email marketing' },
  { id: 'story', name: 'Story Generator', desc: 'Generator Instagram Story', tabs: { morning: 'Morning', halftime: 'Halftime', wrap: 'Wrap', weekly: 'Weekly Update', rdh: 'RD Highlights', bondpicks: 'Bond Picks' } },
  { id: 'fund', name: 'Fund Insight', desc: 'Data & analisis reksa dana', levels: { viewer: 'Lihat saja', editor: 'Editor', admin: 'Admin' } },
  { id: 'competitor', name: 'Competitor Intelligence', desc: 'Promo kompetitor: sekuritas & APERD', levels: { viewer: 'Lihat saja', editor: 'Editor', admin: 'Admin' } },
  { id: 'content', name: 'Content Insight', desc: 'Konten media sosial kompetitor', levels: { viewer: 'Lihat saja', editor: 'Editor', admin: 'Admin' } },
  { id: 'edukasi', name: 'Edukasi Studio', desc: 'Riset artikel edukasi & tulis konten orisinal', levels: { user: 'Pengguna', admin: 'Admin' } },
  { id: 'bond', name: 'Bond Insight', desc: 'Data & analisis obligasi' },
  { id: 'etf', name: 'ETF Insight', desc: 'ETF KISI (XKMS, XKID) & pembanding ETF di BEI' },
  { id: 'planner', name: 'Content Planner', desc: 'Kalender konten tim & paket konten mingguan', pages: [{ label: 'Kalender', path: '/' }, { label: 'Paket Mingguan', path: '/paket' }] },
  { id: 'sats', name: 'SATS Radar', desc: 'Sinyal & screener saham', entry: '/api/auth/hub?to=%2F', levels: { user: 'Pengguna', admin: 'Admin' } },
  // gh = gambar tutorial disimpan ke repo env.GITHUB_REPO (cabang profile.github.branch), hanya di dalam folder ghDir
  { id: 'tutorial', name: 'Tutorial Aplikasi', desc: 'Usulan & kelola tutorial', firebase: true, gh: true, ghDir: 'apps/tutorial/site/images', paths: { submit: '/submit', admin: '/admin' }, levels: { submit: 'Kirim usulan', admin: 'Admin' },
    // halaman di dalam tab ini; only = hanya untuk tingkat itu; share = halaman publik, dapat tombol "Bagikan link"
    pages: [{ label: 'Lihat tutorial', path: '/', share: true }, { label: 'Kirim usulan', path: '/submit' }, { label: 'Admin', path: '/admin', only: 'admin' }] },
];
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
#hub-theme-toggle{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:inline-flex;align-items:center;gap:7px;padding:10px 13px;border:1px solid #b8c9c1;border-radius:999px;background:#fff;color:#174d3c;box-shadow:0 6px 24px rgba(0,0,0,.16);font:600 12px system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}
#hub-theme-toggle:focus-visible{outline:3px solid #5dd62c;outline-offset:3px}
html[data-theme="dark"] body{background:#101714!important;color:#e7eee9!important}
html[data-theme="dark"] .card,html[data-theme="dark"] .tile,html[data-theme="dark"] .empty,html[data-theme="dark"] .acct .menu{background:#1a2420!important;color:#e7eee9!important;border-color:#34463d!important}
html[data-theme="dark"] h1,html[data-theme="dark"] .tile b{color:#a8e8c4!important}
html[data-theme="dark"] p.sub,html[data-theme="dark"] label,html[data-theme="dark"] th,html[data-theme="dark"] td small,html[data-theme="dark"] .acct .menu small{color:#a8b8af!important}
html[data-theme="dark"] input,html[data-theme="dark"] select,html[data-theme="dark"] textarea{background:#111a16!important;color:#e7eee9!important;border-color:#40544a!important}
html[data-theme="dark"] td,html[data-theme="dark"] th,html[data-theme="dark"] fieldset{border-color:#34463d!important}
html[data-theme="dark"] .tabs a,html[data-theme="dark"] a.nav,html[data-theme="dark"] button.ghost,html[data-theme="dark"] a.sm{background:#263b31!important;color:#c4f3d7!important}
html[data-theme="dark"] .tile:hover,html[data-theme="dark"] .acct .menu a:hover{background:#26352e!important}
html[data-theme="dark"] .msg.ok{background:#173b2a!important;color:#c4f3d7!important;border-color:#2f6748!important}
html[data-theme="dark"] .msg.err{background:#421f20!important;color:#ffd8d5!important;border-color:#783b3a!important}
html[data-theme="dark"] #sub{background:#192720!important}html[data-theme="dark"] #sub button{background:#202e27!important;color:#c4f3d7!important;border-color:#40594a!important}
html[data-theme="dark"] #sub button.on{background:#287653!important;color:#fff!important}
html[data-theme="dark"] .acct .menu a{color:#e7eee9!important}
@media(prefers-color-scheme:dark){html[data-theme="system"] body{background:#101714!important;color:#e7eee9!important}html[data-theme="system"] .card,html[data-theme="system"] .tile,html[data-theme="system"] .empty,html[data-theme="system"] .acct .menu{background:#1a2420!important;color:#e7eee9!important;border-color:#34463d!important}html[data-theme="system"] h1,html[data-theme="system"] .tile b{color:#a8e8c4!important}html[data-theme="system"] p.sub,html[data-theme="system"] label,html[data-theme="system"] th,html[data-theme="system"] td small,html[data-theme="system"] .acct .menu small{color:#a8b8af!important}html[data-theme="system"] input,html[data-theme="system"] select,html[data-theme="system"] textarea{background:#111a16!important;color:#e7eee9!important;border-color:#40544a!important}html[data-theme="system"] td,html[data-theme="system"] th,html[data-theme="system"] fieldset{border-color:#34463d!important}html[data-theme="system"] .tabs a,html[data-theme="system"] a.nav,html[data-theme="system"] button.ghost,html[data-theme="system"] a.sm{background:#263b31!important;color:#c4f3d7!important}html[data-theme="system"] .tile:hover,html[data-theme="system"] .acct .menu a:hover{background:#26352e!important}html[data-theme="system"] .msg.ok{background:#173b2a!important;color:#c4f3d7!important;border-color:#2f6748!important}html[data-theme="system"] .msg.err{background:#421f20!important;color:#ffd8d5!important;border-color:#783b3a!important}html[data-theme="system"] #sub{background:#192720!important}html[data-theme="system"] #sub button{background:#202e27!important;color:#c4f3d7!important;border-color:#40594a!important}html[data-theme="system"] #sub button.on{background:#287653!important;color:#fff!important}html[data-theme="system"] .acct .menu a{color:#e7eee9!important}}
</style>`;
const THEME_BUTTON = `<button id="hub-theme-toggle" type="button" aria-label="Ganti tema">◐ Tema sistem</button>`;
const THEME_SCRIPT = `<script>(function(){var k='toolhub-theme-v2',v='system';try{v=localStorage.getItem(k)||'system'}catch(e){}if(['light','dark','system'].indexOf(v)<0)v='system';var root=document.documentElement;function apply(n){v=n;root.setAttribute('data-theme',v);try{localStorage.setItem(k,v)}catch(e){}var b=document.getElementById('hub-theme-toggle');if(b){b.textContent=v==='dark'?'☀ Tema terang':v==='light'?'☾ Tema gelap':'◐ Tema sistem';b.title='Tema aktif: '+v+' — klik untuk mengganti';b.setAttribute('aria-label','Tema aktif: '+v+'. Klik untuk mengganti.')}try{document.querySelectorAll('iframe').forEach(function(f){f.contentWindow.postMessage({type:'toolhub-theme',theme:v},'*')})}catch(e){}}root.setAttribute('data-theme',v);var b=document.getElementById('hub-theme-toggle');if(b){b.onclick=function(){apply(v==='system'?'light':v==='light'?'dark':'system')};apply(v)}window.addEventListener('message',function(e){if(e.data&&e.data.type==='toolhub-theme-request'&&e.source){try{e.source.postMessage({type:'toolhub-theme',theme:v},e.origin)}catch(err){}}});})();</script>`;
const themedHtml = body => { if (typeof body !== 'string' || !/<html[\s>]/i.test(body)) return body; let out = body; if (!out.includes('id="hub-theme-style"')) out = out.replace(/<\/head>/i, THEME_CSS + '</head>'); if (!out.includes('hub-theme-v2')) { if (!out.includes('id="hub-theme-toggle"')) out = out.replace(/<\/body>/i, THEME_BUTTON + THEME_SCRIPT + '</body>'); else out = out.replace(/<\/body>/i, THEME_SCRIPT + '</body>'); } return out; };
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

/** Akun: { hash?, role, status, name, why, at, username?, access:{appId: true | level | [tab]} }. Kunci KV: u:<email>; n:<username> -> email. */
async function getUser(env, email) {
  const u = await env.HUB_KV.get('u:' + email, 'json');
  if (!u) return null;
  if (isMain(env, email)) { u.role = 'admin'; u.status = 'approved'; }   // admin utama tidak bisa terkunci dari halaman admin
  return u;
}
const meta = u => ({ role: u.role, status: u.status, name: u.name || '', why: u.why || '', at: u.at || '', reg: !!u.hash, un: u.username || '', apps: Object.keys(u.access || {}).join(','), want: (u.want || []).join(',') });
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

const CSS = `*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f1f4f3;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#14201c;padding:24px 16px}
.card{background:#fff;max-width:400px;margin:8vh auto 0;padding:30px 28px;border-radius:14px;box-shadow:0 4px 24px rgba(15,23,42,.08)}.wide{max-width:900px;margin-top:0}
h1{font-size:19px;margin:0 0 4px;color:#1f5e4b}h2{font-size:15px;margin:26px 0 10px}p.sub{margin:0 0 18px;color:#64716c;font-size:13px;line-height:1.5}
label{display:block;font-size:12px;font-weight:600;color:#374151;margin:14px 0 6px}label.ck{display:inline-block;font-weight:400;font-size:13px;margin:4px 14px 4px 0}label.ck input{width:auto;margin-right:5px}
input,select{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font:14px inherit}input:focus,select:focus{outline:2px solid #bfe8d4;border-color:#3fae78}
button{padding:10px 16px;border:0;border-radius:8px;background:#1f5e4b;color:#fff;font:700 14px inherit;cursor:pointer}
button.sm,a.sm{padding:6px 10px;font-size:12px;margin:2px 0 2px 4px}button.ghost,a.sm{background:#ecfdf5;color:#1f5e4b}a.sm{display:inline-block;border-radius:8px;font-weight:700;text-decoration:none}button.del{background:#fff;color:#b3261e;border:1px solid #f3c7c2}
.msg{margin-top:16px;padding:10px 12px;border-radius:8px;font-size:13px;line-height:1.5}.err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}.ok{background:#ecfdf5;color:#166534;border:1px solid #bfe8d4}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:9px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}th{font-size:12px;color:#64716c}td small{color:#64716c;display:block;line-height:1.4}td form{display:inline}
.tabs{display:flex;gap:6px;margin:14px 0 4px}.tabs a{flex:1;text-align:center;padding:9px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;background:#f1f4f3;color:#64716c}.tabs a.on{background:#1f5e4b;color:#fff}
.badge{display:inline-block;min-width:18px;padding:1px 6px;border-radius:9px;background:#d92d20;color:#fff;font-size:11px;font-weight:700;text-align:center}
.row{display:flex;gap:8px}.row>*{flex:1}.row button{flex:none}a{color:#1f5e4b}.top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}.scroll{overflow-x:auto}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-top:16px}.tile{display:block;border:1px solid #d9e2dd;border-radius:12px;padding:18px;text-decoration:none;color:inherit}.tile:hover{border-color:#3fae78;background:#f7fcf9}.tile b{display:block;font-size:16px;color:#1f5e4b;margin-bottom:4px}.tile span{font-size:13px;color:#64716c}
a.nav{display:inline-block;padding:7px 11px;border-radius:8px;background:#f1f4f3;color:#1f5e4b;font-weight:600;font-size:13px;text-decoration:none;margin:2px 0 2px 4px}a.nav:hover{background:#e3efe9}.navs{display:flex;flex-wrap:wrap;align-items:center;gap:2px;font-size:13px;color:#64716c}
label.opt{display:flex;gap:10px;align-items:center;font-weight:400;font-size:14px;margin:0;padding:9px 10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer}label.opt+label.opt{margin-top:6px}label.opt input{width:18px;height:18px;margin:0;flex:none;accent-color:#1f5e4b}label.opt small{color:#6b7280;font-size:12px}label.opt:has(input:checked){border-color:#3fae78;background:#f3fbf7}
.pw{position:relative}.pw input{padding-right:64px}.pw button{position:absolute;right:4px;top:4px;bottom:4px;padding:0 10px;background:transparent;color:#1f5e4b;font-size:12px}
.vh{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}details.more{margin-top:26px}details.more summary{cursor:pointer;font-size:13px;color:#64716c}
fieldset{border:1px solid #e5e7eb;border-radius:10px;margin:12px 0 0;padding:10px 14px 12px}legend{font-size:13px;font-weight:700;padding:0 6px}.card{overflow-wrap:anywhere}
@media(max-width:640px){body{padding:12px 8px}.card{padding:20px 16px}.row{flex-wrap:wrap}
table,tbody,tr,td{display:block;width:100%}th{display:none}tr{padding:10px 0;border-bottom:1px solid #e5e7eb}tr:first-child{padding:0;border:0}td{border:0;padding:2px 0;text-align:left!important;white-space:normal!important}td:last-child{padding-top:6px}button.sm,a.sm{margin:2px 6px 2px 0;padding:8px 12px}}`;
const doc = (title, body) => `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Tool Hub</title><style>${CSS}</style></head><body>${body}</body></html>`;
const topBar = (sess, title, here) => `<div class="top"><h1>${title}</h1><span class="navs"><span style="margin-right:4px">${esc(sess.email)}</span>${here !== '/' ? '<a class="nav" href="/">Beranda</a>' : ''}${sess.role === 'admin' && here !== '/admin' ? '<a class="nav" href="/admin">Admin</a>' : ''}${here !== '/akun' ? '<a class="nav" href="/akun">Ganti password</a>' : ''}<a class="nav" href="/logout">Keluar</a></span></div>`;

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
  // akun lama tanpa password (ditambahkan admin / di-reset) mempertahankan status, peran, dan hak aksesnya
  const u = { role: main ? 'admin' : 'user', status: main ? 'approved' : 'pending', at: stamp(), access: {}, ...(old || {}), name: v.name, why: v.why || (old && old.why) || '', want: v.want, hash: await hashPw(password) };
  if (v.username && !u.username) { u.username = v.username; await env.HUB_KV.put('n:' + v.username, v.email); }
  await saveUser(env, v.email, u);
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
  const body = b64u(enc.encode(JSON.stringify({ app: app.id, e: sess.email, n: sess.u.name || '', u: sess.u.username || '', a, adm: sess.role === 'admin', x: Date.now() + TICKET_SEC * 1000 })));
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
  let users = await listUsers(env);
  if (changed) { users = users.filter(x => x.email !== changed.email); if (changed.u) users.push({ email: changed.email, ...meta(changed.u) }); }
  users.forEach(x => { if (isMain(env, x.email)) { x.role = 'admin'; x.status = 'approved'; x.main = true; } });
  users.sort((a, b) => a.email < b.email ? -1 : 1);
  const btn = (x, act, cls = 'ghost') => `<form method="post" action="/admin/act"${{ delete: 'Hapus akun', reject: 'Tolak pendaftaran', revoke: 'Cabut akses' }[act] ? ` onsubmit="return confirm('${{ delete: 'Hapus akun', reject: 'Tolak pendaftaran', revoke: 'Cabut akses' }[act]} ${esc(x.email)}?')"` : ''}><input type="hidden" name="email" value="${esc(x.email)}"><input type="hidden" name="act" value="${act}"><button class="sm ${cls}">${ACTS[act][0]}</button></form>`;
  const akses = x => `<a class="sm" href="/admin/user?e=${encodeURIComponent(x.email)}">Atur akses</a>`;
  const acts = x => x.main ? '<small>admin utama</small>' : x.email === sess.email ? '<small>akun Anda</small>'
    : x.status === 'pending' ? `<a class="sm" href="/admin/user?e=${encodeURIComponent(x.email)}">Tinjau &amp; setujui</a>` + btn(x, 'reject', 'del')
    : x.status === 'approved' ? akses(x) + (x.reg ? btn(x, x.role === 'admin' ? 'remove_admin' : 'make_admin') + btn(x, 'reset') : '') + btn(x, 'revoke', 'del') + (x.reg ? '' : btn(x, 'delete', 'del'))
    : btn(x, 'approve', '') + btn(x, 'delete', 'del');
  const tbl = (title, rows, empty) => `<h2>${title} (${rows.length})</h2>` + (rows.length ? `<div class="scroll"><table><tr><th>Pengguna</th><th>Akses tool</th><th>Terdaftar</th><th></th></tr>${rows.map(x => `<tr><td><b>${esc(x.email)}</b><small>${esc(x.name || '-')}${x.un ? ' &middot; @' + esc(x.un) : ''}${x.reg ? '' : ' &middot; belum membuat password'}</small>${x.why ? `<small>${esc(x.why)}</small>` : ''}</td><td><small>${esc(x.status === 'pending' && x.role !== 'admin' ? 'minta: ' + (accessLabel(x, x.want) === 'belum ada tool' ? 'tidak memilih' : accessLabel(x, x.want)) : accessLabel(x, x.apps))}</small></td><td style="white-space:nowrap"><small>${esc(atTxt(x.at))}</small></td><td style="text-align:right">${acts(x)}</td></tr>`).join('')}</table></div>` : `<p class="sub">${empty}</p>`);
  const by = s => users.filter(x => s.includes(x.status));
  return doc('Admin', `<div class="card wide">${topBar(sess, 'Admin &middot; Tool Hub', '/admin')}
<p class="sub">Kelola siapa saja yang boleh masuk dan tool apa yang boleh dibuka.</p>${note ? `<div class="msg ${bad ? 'err' : 'ok'}" style="margin:0 0 6px">${note}</div>` : ''}
${tbl('Menunggu persetujuan', by(['pending']), 'Tidak ada pengajuan baru.')}${tbl('Disetujui', by(['approved']), 'Belum ada.')}${tbl('Ditolak / dicabut', by(['rejected', 'revoked']), 'Tidak ada.')}
<h2>Tambahkan langsung</h2><p class="sub">Menyetujui email sebelum orangnya mendaftar. Ia tinggal klik Daftar dengan email itu dan langsung bisa masuk.</p>
<form method="post" action="/admin/act" class="row"><input type="hidden" name="act" value="add"><label for="addE" class="vh">Email yang disetujui</label><input id="addE" name="email" type="email" required maxlength="120" placeholder="nama@email.com"><button type="submit">Tambahkan</button></form>
<details class="more"><summary>Impor akun lama (jarang dipakai)</summary><p class="sub" style="margin-top:10px">Tempel isi berkas <b>akun-lama.json</b> untuk memindahkan akun dari tool lama. Akun yang sudah ada di hub tidak ditimpa.</p>
<form method="post" action="/admin/import"><label for="impD" class="vh">Isi akun-lama.json</label><textarea id="impD" name="data" rows="3" required style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font:12px ui-monospace,monospace" placeholder='{"users":[...]}'></textarea><div style="margin-top:8px"><button type="submit" class="ghost">Impor</button></div></form></details></div>`);
}

/** Halaman hak akses satu pengguna: per tool, sesuai jenisnya (boleh/tidak, tingkatan, atau per tab). */
function userPage(sess, email, u, note = '') {
  const acc = u.access || {};
  // akun yang masih menunggu: tool yang diminta saat daftar sudah terpilih (tingkat terendah); admin tinggal mencoret yang tidak disetujui
  const pend = u.status === 'pending', want = u.want || [];
  const blk = a => { const asked = want.includes(a.id), cur = acc[a.id] || (pend && asked ? (a.tabs ? ['*'] : a.levels ? Object.keys(a.levels)[0] : true) : undefined);
    const inner = a.tabs ? `<label class="ck"><input type="checkbox" name="a_${a.id}" value="*"${Array.isArray(cur) && cur.includes('*') ? ' checked' : ''}><b>Semua tab</b></label>` + Object.keys(a.tabs).map(t => `<label class="ck"><input type="checkbox" name="a_${a.id}" value="${t}"${Array.isArray(cur) && cur.includes(t) ? ' checked' : ''}>${esc(a.tabs[t])}</label>`).join('')
      : a.levels ? `<select name="a_${a.id}"><option value="">Tidak ada akses</option>${Object.keys(a.levels).map(l => `<option value="${l}"${cur === l ? ' selected' : ''}>${esc(a.levels[l])}</option>`).join('')}</select>`
      : `<label class="ck"><input type="checkbox" name="a_${a.id}" value="1"${cur ? ' checked' : ''}>Boleh membuka</label>`;
    return `<fieldset><legend>${esc(a.name)}${asked ? ' &middot; diminta' : ''}</legend>${inner}</fieldset>`; };
  return doc('Atur akses', `<form class="card wide" method="post" action="/admin/access">${topBar(sess, 'Atur akses', '/admin/user')}
<p class="sub"><b>${esc(email)}</b>${u.name ? ' &middot; ' + esc(u.name) : ''}${u.username ? ' &middot; @' + esc(u.username) : ''} &middot; status: ${esc(u.status)}${u.role === 'admin' ? ' &middot; <b>admin hub (otomatis punya semua akses)</b>' : ''}</p>
${note ? `<div class="msg ok" style="margin:0 0 6px">${note}</div>` : ''}<input type="hidden" name="email" value="${esc(email)}">${APPS.map(blk).join('')}
<div style="margin-top:18px" class="row"><button type="submit"${pend ? ' name="approve" value="1"' : ''}>${pend ? 'Setujui dengan akses ini' : 'Simpan akses'}</button><a href="/admin" style="flex:none;align-self:center">Kembali ke daftar</a></div>
<p class="sub" style="margin:14px 0 0">Perubahan berlaku paling lambat 2 jam kemudian di tool yang sedang dibuka orangnya, atau langsung setelah ia keluar lalu masuk lagi.</p></form>`);
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
  if (!post && path === '/admin/user') { const e = (url.searchParams.get('e') || '').toLowerCase(), u = await getUser(env, e); return u ? page(200, userPage(sess, e, u)) : page(404, await adminPage(env, sess, 'Akun tidak ditemukan.', true)); }
  if (!post) return page(200, await adminPage(env, sess));
  if (request.headers.get('origin') !== url.origin) return page(403, 'Permintaan ditolak.');          // cegah form dari situs lain (CSRF)
  const f = await form(request), email = fv(f, 'email').toLowerCase(), act = fv(f, 'act');
  const bad = note => adminPage(env, sess, note, true).then(h => page(400, h));
  if (path === '/admin/import') { const r = await importUsers(env, fv(f, 'data')); return r.err ? bad(r.err) : page(200, await adminPage(env, sess, `Impor selesai: ${r.added} akun ditambahkan, ${r.skipped} dilewati (sudah ada atau email tidak valid). Daftar di bawah bisa terlambat tampil sampai 1 menit.`)); }
  if (!EMAIL_RE.test(email) || email.length > 120) return bad('Email belum benar.');
  let u = await getUser(env, email);
  if (path === '/admin/access') {
    if (!u) return bad('Akun tidak ditemukan.');
    u.access = readAccess(f); const ok = fv(f, 'approve') && u.status === 'pending'; if (ok) u.status = 'approved'; await saveUser(env, email, u);
    return page(200, userPage(sess, email, u, ok ? 'Disetujui. Akses disimpan.' : 'Akses disimpan.'));
  }
  if (path !== '/admin/act') return page(404, 'Tidak ditemukan');
  if (act === 'add') {
    if (u && u.status === 'approved') return bad(`<b>${esc(email)}</b> sudah disetujui.`);
    u = { role: 'user', at: stamp(), why: 'ditambahkan admin', access: {}, ...(u || {}), status: 'approved' };
    await saveUser(env, email, u);
    return page(200, await adminPage(env, sess, `<b>${esc(email)}</b> ditambahkan.${u.hash ? '' : ' Minta ia klik Daftar dengan email itu untuk membuat password.'} Klik <b>Atur akses</b> untuk memilih tool-nya.`, false, { email, u }));
  }
  if (!ACTS[act]) return bad('Aksi tidak dikenal.');
  if (!u) return bad('Akun tidak ditemukan.');
  if (isMain(env, email)) return bad('Admin utama diatur lewat ADMIN_EMAILS di Cloudflare, bukan dari halaman ini.');
  if (email === sess.email) return bad('Tidak bisa mengubah akun yang sedang dipakai.');
  if (act === 'delete') { await env.HUB_KV.delete('u:' + email); if (u.username) await env.HUB_KV.delete('n:' + u.username); u = null; } else { ACTS[act][1](u); await saveUser(env, email, u); }
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

/** Dashboard satu halaman: baris tab di atas, tool tampil di bawahnya (dimuat saat tabnya pertama kali dibuka, lalu tetap hidup). */
function shellPage(env, sess, mine, pending) {
  const pages = {}; mine.forEach(a => { if (a.pages) pages[a.id] = a.pages.filter(p => !p.only || p.only === accessOf(sess.u, a)).map(p => [p.label, appUrl(env, a.id) + p.path, p.share ? 1 : 0]); });
  const src = a => a.firebase || a.frame === false ? appUrl(env, a.id) + ((a.paths && a.paths[accessOf(sess.u, a)]) || a.path || '/') : '/sso?app=' + a.id + '&back=' + encodeURIComponent(appUrl(env, a.id) + (a.entry || a.path || '/'));
  const icon = {email:'✉',story:'▧',fund:'▥',competitor:'◈',content:'❖',bond:'♙',etf:'◫',planner:'▦',sats:'⌕',tutorial:'▤',edukasi:'✎'};
  const css = `*{box-sizing:border-box} :root{color-scheme:light} html,body{margin:0;min-height:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}body{background:#edf3ef;color:#17251d;padding:24px 18px}.workspace{max-width:1240px;margin:0 auto;background:#fff;border:1px solid #dce7df;border-radius:24px;padding:clamp(20px,3vw,36px);min-height:calc(100vh - 48px);box-shadow:0 18px 60px rgba(18,55,34,.08)}.top{display:flex;align-items:center;gap:15px;margin-bottom:30px}.brandicon{width:52px;height:52px;border-radius:17px;background:linear-gradient(145deg,#e1f8e9,#c9f0d8);color:#176044;display:grid;place-items:center;font-size:27px;flex:none;box-shadow:inset 0 0 0 1px #c6e8d2}.heading{flex:1;min-width:0}h1{font-size:clamp(23px,3vw,31px);line-height:1.15;margin:0 0 6px;font-weight:780;letter-spacing:-.8px;color:#173c2a}p.sub{margin:0;color:#6d7d72;font-size:13px;line-height:1.5}.actions{display:flex;align-items:center;gap:8px}.iconbtn{border:1px solid #e0e9e2;background:#f7faf8;color:#315b43;padding:9px;border-radius:12px;cursor:pointer;font-size:17px;min-width:40px;min-height:40px}.iconbtn:hover{background:#eaf7ee;border-color:#b9ddc5}.hero{position:relative;overflow:hidden;border-radius:20px;background:radial-gradient(ellipse at 85% 0%,rgba(79,205,125,.2),transparent 38%),linear-gradient(120deg,#10291e,#174a33 72%,#1c5a3d);color:#f5fff7;padding:clamp(24px,4vw,42px);margin-bottom:28px}.hero:after{content:"";position:absolute;width:240px;height:240px;border:1px solid rgba(173,255,201,.15);border-radius:50%;right:-80px;bottom:-150px;box-shadow:0 0 0 26px rgba(173,255,201,.035),0 0 0 54px rgba(173,255,201,.025)}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:1.8px;font-weight:800;color:#9be8b6;margin-bottom:13px}.hero h2{font-size:clamp(27px,4vw,42px);line-height:1.07;letter-spacing:-1.2px;max-width:650px;margin:0 0 13px}.hero p{color:#c0d8c8;font-size:14px;line-height:1.65;max-width:620px;margin:0}.herofoot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:23px;color:#d9f0e0;font-size:12px}.hero-pill{display:inline-flex;align-items:center;gap:7px;border:1px solid #47765a;background:#214d35;border-radius:999px;padding:8px 11px}.dot{width:7px;height:7px;border-radius:50%;background:#63e58e;box-shadow:0 0 0 4px #63e58e22}.sectionhead{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:0 0 16px}.sectionhead h2{font-size:18px;letter-spacing:-.3px;margin:0 0 5px;color:#1b3526}.sectionhead p{margin:0;font-size:12px;color:#718077}.searchwrap{position:relative;width:min(100%,300px)}.searchwrap span{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:#728279}.search{width:100%;padding:12px 14px 12px 38px;border:1px solid #dce7df;border-radius:12px;background:#f9fbf9;color:#20382a;font:inherit;font-size:13px;outline:none}.search:focus{border-color:#55b879;box-shadow:0 0 0 3px #55b87922}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}.appcard{position:relative;min-width:0;border:1px solid #dce7df;background:linear-gradient(145deg,#fff,#f9fcfa);border-radius:17px;padding:20px;min-height:174px;display:flex;flex-direction:column;gap:13px;text-align:left;color:inherit;cursor:pointer;font:inherit;transition:transform .18s,border-color .18s,box-shadow .18s,background .18s}.appcard:after{content:"↗";position:absolute;right:18px;top:19px;color:#9aa99f;font-size:16px;transition:transform .18s,color .18s}.appcard:hover{border-color:#83c99a;background:#f5fcf7;transform:translateY(-3px);box-shadow:0 12px 26px rgba(20,73,42,.08)}.appcard:hover:after{color:#1d8a4f;transform:translate(2px,-2px)}.appicon{width:44px;height:44px;border-radius:14px;background:#e9f8ee;color:#16834b;display:grid;place-items:center;font-size:23px;line-height:1}.appname{font-size:15px;font-weight:760;letter-spacing:-.2px;padding-right:18px}.appdesc{font-size:12px;line-height:1.55;color:#748278;margin-top:auto;max-width:260px}.appcard:focus-visible,.iconbtn:focus-visible,.back:focus-visible,.subp button:focus-visible{outline:3px solid #5dd62c;outline-offset:3px}.userbar{font-size:12px;color:#6e7f74;background:#f3f8f4;border:1px solid #e0ebe3;border-radius:999px;padding:9px 12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.accountmenu{position:relative}.accountmenu .menu{display:none;position:absolute;right:0;top:46px;z-index:50;min-width:190px;background:white;border:1px solid #e1e8e3;border-radius:14px;padding:7px;box-shadow:0 12px 34px #183b2520}.accountmenu.open .menu{display:block}.menu a{display:block;padding:11px;color:#24332a;text-decoration:none;font-size:13px;border-radius:9px}.menu a:hover{background:#f0f7f2}.empty{grid-column:1/-1;padding:28px;border:1px dashed #cad8ce;border-radius:15px;color:#66756c;font-size:14px;background:#fbfdfb}.noresults{display:none;grid-column:1/-1;padding:24px;text-align:center;color:#718077;background:#f7faf8;border-radius:14px}.appview{display:none;position:fixed;inset:0;background:#edf3ef;z-index:20}.appview.on{display:flex;flex-direction:column}.appbar{min-height:62px;display:flex;align-items:center;gap:12px;padding:10px 18px;background:#fff;border-bottom:1px solid #dce7df;box-shadow:0 3px 12px #153c2510}.back{border:1px solid #dbe5de;background:#f5f8f5;border-radius:11px;padding:10px 13px;cursor:pointer;font-weight:700;color:#24372b;white-space:nowrap;flex:none}.appbar strong{font-size:14px;white-space:nowrap;color:#20392a}.subp{display:flex;gap:6px;overflow-x:auto;min-width:0;scrollbar-width:none}.subp::-webkit-scrollbar{display:none}.subp button{border:1px solid #cfe0d6;background:#f5f8f5;color:#1f5e4b;border-radius:999px;padding:7px 12px;font:600 12px inherit;cursor:pointer;white-space:nowrap}.subp button.on{background:#1f5e4b;color:#fff;border-color:#1f5e4b}.back{white-space:nowrap;flex:none}.appframe{position:relative;flex:1;min-height:0}.appframe iframe{width:100%;height:100%;border:0;background:#fff}.ld{position:absolute;inset:0;display:none;place-items:center;background:#edf3ef;color:#65736a;font-size:14px;z-index:2}.ld.on{display:grid}.ld:before{content:"";width:22px;height:22px;border:3px solid #d6e7db;border-top-color:#238650;border-radius:50%;animation:spin .7s linear infinite;margin-right:10px}@keyframes spin{to{transform:rotate(360deg)}}html[data-theme="dark"] body{background:#0c1510;color:#e7eee9}html[data-theme="dark"] .workspace{background:#111a15;border-color:#293b30;box-shadow:0 18px 60px #0003}html[data-theme="dark"] .brandicon{background:#20372a;color:#8fe3b5;box-shadow:none}html[data-theme="dark"] h1,html[data-theme="dark"] .sectionhead h2{color:#d7f5df}html[data-theme="dark"] p.sub,html[data-theme="dark"] .appdesc,html[data-theme="dark"] .userbar,html[data-theme="dark"] .sectionhead p{color:#aab9b0}html[data-theme="dark"] .userbar,html[data-theme="dark"] .iconbtn{background:#1a2820;border-color:#35483c;color:#c9efd5}html[data-theme="dark"] .hero{background:radial-gradient(ellipse at 85% 0%,#255638,transparent 40%),linear-gradient(120deg,#0a1a11,#123b27 72%,#17482f)}html[data-theme="dark"] .appcard{background:linear-gradient(145deg,#18251d,#141e18);border-color:#304337;color:#e7eee9}html[data-theme="dark"] .appcard:hover{background:#1d3224;border-color:#3b9b61}html[data-theme="dark"] .appicon{background:#203a29;color:#70e59b}html[data-theme="dark"] .search{background:#18251d;border-color:#304337;color:#e7eee9}html[data-theme="dark"] .empty,html[data-theme="dark"] .noresults{background:#17231b;border-color:#304337;color:#b6c7bc}html[data-theme="dark"] .appbar{background:#111a15;border-color:#293b30;color:#e7eee9}html[data-theme="dark"] .appbar strong{color:#e7eee9}html[data-theme="dark"] .back{background:#1c2922;color:#e7eee9;border-color:#35483c}html[data-theme="dark"] .appview,html[data-theme="dark"] .ld{background:#0d1511;color:#c2d2c8}html[data-theme="dark"] .accountmenu .menu{background:#17231c;border-color:#35483c}html[data-theme="dark"] .menu a{color:#e7eee9}html[data-theme="dark"] .menu a:hover{background:#24392d}html[data-theme="dark"] .subp button{background:#1c2922;color:#c4f3d7;border-color:#35483c}html[data-theme="dark"] .subp button.on{background:#287653;color:#fff}@media(prefers-color-scheme:dark){html[data-theme="system"] body{background:#0c1510;color:#e7eee9}html[data-theme="system"] .workspace{background:#111a15;border-color:#293b30;box-shadow:0 18px 60px #0003}html[data-theme="system"] .brandicon{background:#20372a;color:#8fe3b5}html[data-theme="system"] h1,html[data-theme="system"] .sectionhead h2{color:#d7f5df}html[data-theme="system"] p.sub,html[data-theme="system"] .appdesc,html[data-theme="system"] .userbar,html[data-theme="system"] .sectionhead p{color:#aab9b0}html[data-theme="system"] .userbar,html[data-theme="system"] .iconbtn{background:#1a2820;border-color:#35483c;color:#c9efd5}html[data-theme="system"] .appcard{background:linear-gradient(145deg,#18251d,#141e18);border-color:#304337;color:#e7eee9}html[data-theme="system"] .appicon{background:#203a29;color:#70e59b}html[data-theme="system"] .search{background:#18251d;border-color:#304337;color:#e7eee9}html[data-theme="system"] .empty,html[data-theme="system"] .noresults{background:#17231b;border-color:#304337;color:#b6c7bc}html[data-theme="system"] .appbar{background:#111a15;border-color:#293b30;color:#e7eee9}html[data-theme="system"] .appview,html[data-theme="system"] .ld{background:#0d1511;color:#c2d2c8}}@media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.workspace{min-height:calc(100vh - 32px)}}@media(max-width:600px){body{padding:8px}.workspace{padding:16px;border-radius:17px;min-height:calc(100vh - 16px)}.top{gap:9px;margin-bottom:22px}.brandicon{width:42px;height:42px;border-radius:13px}h1{font-size:22px}.userbar{display:none}.hero{padding:24px 20px;border-radius:16px}.hero h2{font-size:29px}.sectionhead{align-items:stretch}.searchwrap{width:100%}.grid{grid-template-columns:1fr;gap:10px}.appcard{padding:16px;min-height:130px}.appbar{gap:8px;padding:8px 10px}.appbar strong{display:none}.back{padding:9px 10px}.subp button{padding:7px 10px}}`;
  const cards = mine.map(a => `<button class="appcard" type="button" data-app="${esc(a.id)}" aria-label="Buka ${esc(a.name)}"><span class="appicon">${icon[a.id] || '▦'}</span><span class="appname">${esc(a.name)}</span><span class="appdesc">${esc(a.desc)} ↗</span></button>`).join('');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Workspace · Tool Hub</title><style>${css}</style></head><body>
<section class="workspace" id="workspace"><div class="top"><div class="brandicon">▱</div><div class="heading"><h1>${esc(title(env, 'Tool Hub'))}</h1><p class="sub">Ruang kerja tim — semua tools dalam satu tempat.</p></div><span class="userbar" title="${esc(sess.u.name || sess.email)}">${esc(sess.u.name || sess.email)}</span><div class="actions"><button id="hub-theme-toggle" class="iconbtn" type="button" title="Ganti tema" aria-label="Ganti tema">☼</button><div class="accountmenu" id="accountmenu"><button class="iconbtn" id="accounttoggle" type="button" aria-label="Menu akun">⋮</button><div class="menu"><a href="/akun">Ganti password</a>${sess.role === 'admin' ? '<a href="/admin">Admin' + (pending ? ' ('+pending+' menunggu)' : '') + '</a>' : ''}<a href="/logout">Keluar</a></div></div></div></div>
<section class="hero"><div class="eyebrow">${esc(title(env, 'Workspace'))}</div><h2>Semua pekerjaan penting, dalam satu ruang.</h2><p>Akses aplikasi kerja, analisis, dan konten dari satu dashboard yang rapi. Pilih tools yang kamu butuhkan untuk mulai bekerja.</p><div class="herofoot"><span class="hero-pill"><span class="dot"></span>${mine.length} tools tersedia</span><span class="hero-pill">Akses sesuai akun</span>${sess.role === 'admin' && pending ? '<a class="hero-pill" href="/admin" style="color:inherit;text-decoration:none">◷ '+pending+' permintaan akses menunggu</a>' : ''}</div></section>
<div class="sectionhead"><div><h2>Aplikasi kamu</h2><p>Pilih aplikasi untuk membuka workspace-nya.</p></div><label class="searchwrap"><span>⌕</span><input id="appSearch" class="search" type="search" placeholder="Cari aplikasi..." aria-label="Cari aplikasi"></label></div>
<div class="grid" id="appGrid">${cards || '<div class="empty">Belum ada aplikasi yang diberikan akses. Hubungi admin.</div>'}<div class="noresults" id="noResults">Tidak ada aplikasi yang cocok dengan pencarian.</div></div></section>
<section class="appview" id="appview"><div class="appbar"><button class="back" id="back">← Workspace</button><strong id="appTitle">Aplikasi</strong><nav class="subp" id="subp" aria-label="Halaman aplikasi"></nav><span style="flex:1"></span><button class="iconbtn" id="theme2" type="button" title="Ganti tema">☼</button></div><div class="appframe" id="appframe"><div class="ld" id="ld">Memuat aplikasi…</div></div></section>
<script>(function(){var apps=${JSON.stringify(mine.map(a=>({id:a.id,name:a.name,src:src(a),pages:pages[a.id]||[]}))).replace(/</g,'\\u003c')},frames={},workspace=document.getElementById('workspace'),view=document.getElementById('appview'),framebox=document.getElementById('appframe'),loader=document.getElementById('ld'),title=document.getElementById('appTitle');
var key='toolhub-theme-v2',theme='system';try{theme=localStorage.getItem(key)||'system'}catch(e){}function applyTheme(){document.documentElement.setAttribute('data-theme',theme);try{localStorage.setItem(key,theme)}catch(e){}document.getElementById('hub-theme-toggle').textContent=theme==='dark'?'☀':theme==='light'?'☾':'☼';document.getElementById('theme2').textContent=theme==='dark'?'☀':theme==='light'?'☾':'☼';Object.keys(frames).forEach(function(k){try{frames[k].contentWindow.postMessage({type:'toolhub-theme',theme:theme},'*')}catch(e){}})}function cycle(){theme=theme==='system'?'dark':theme==='dark'?'light':'system';applyTheme()}document.getElementById('hub-theme-toggle').onclick=cycle;document.getElementById('theme2').onclick=cycle;applyTheme();
var appSearch=document.getElementById('appSearch'),appCards=[].slice.call(document.querySelectorAll('.appcard')),noResults=document.getElementById('noResults');
if(appSearch)appSearch.addEventListener('input',function(){var q=this.value.toLowerCase().trim(),shown=0;appCards.forEach(function(c){var match=(c.innerText||c.textContent||'').toLowerCase().indexOf(q)!==-1;c.style.display=match?'flex':'none';if(match)shown++});if(noResults)noResults.style.display=shown?'none':'block'});

document.getElementById('accounttoggle').onclick=function(){document.getElementById('accountmenu').classList.toggle('open')};document.addEventListener('click',function(e){var m=document.getElementById('accountmenu');if(!m.contains(e.target))m.classList.remove('open')});
var curId=null,SH={},subp=document.getElementById('subp'),T0=document.title;
// sub-halaman (mis. Tutorial: Lihat tutorial / Kirim usulan / Admin) + tombol Bagikan link untuk halaman publik
function subnav(a){var f=frames[a.id];subp.innerHTML='';(a.pages||[]).forEach(function(p){var b=document.createElement('button');b.type='button';b.textContent=p[0];b.className=f.dataset.cur===p[1]?'on':'';b.onclick=function(){f.dataset.cur=p[1];f.dataset.loaded='';loader.classList.add('on');f.src=p[1];subnav(a)};subp.appendChild(b)});
  var cur=(a.pages||[]).filter(function(p){return p[1]===f.dataset.cur})[0];if(!cur||!cur[2])return;var s=document.createElement('button');s.type='button';s.textContent='🔗 Bagikan link';
  s.onclick=function(){var u=SH[a.id]&&SH[a.id].indexOf(new URL(cur[1]).origin+'/')===0?SH[a.id]:cur[1],ok=function(){s.textContent='Link tersalin ✓';setTimeout(function(){s.textContent='🔗 Bagikan link'},2000)};
    if(navigator.share&&matchMedia('(pointer:coarse)').matches)return navigator.share({url:u}).catch(function(){});
    if(navigator.clipboard)navigator.clipboard.writeText(u).then(ok,function(){prompt('Salin link ini:',u)});else prompt('Salin link ini:',u)};subp.appendChild(s)}
function openApp(id){var a=apps.filter(function(x){return x.id===id})[0];if(!a)return;curId=id;workspace.style.display='none';view.classList.add('on');title.textContent=a.name;
  Object.keys(frames).forEach(function(k){frames[k].style.display=k===id?'block':'none'});var f=frames[id];
  if(!f){f=document.createElement('iframe');f.title=a.name;f.style.display='block';f.dataset.cur=a.src;
    f.onload=function(){f.dataset.loaded='1';if(curId===id)loader.classList.remove('on');try{f.contentWindow.postMessage({type:'toolhub-theme',theme:theme},'*')}catch(e){}};
    framebox.appendChild(f);frames[id]=f;f.src=a.src}
  loader.classList.toggle('on',!f.dataset.loaded);subnav(a);try{history.replaceState(null,'','#'+id)}catch(e){}}
// tool di dalam bingkai: judul halaman untuk nama file PDF, dan alamat halaman untuk tombol Bagikan
addEventListener('message',function(e){var d=e.data||{};for(var k in frames)if(frames[k].contentWindow===e.source){if(typeof d.hubPrintTitle==='string'&&d.hubPrintTitle.length<=120)document.title=d.hubPrintTitle||T0;if(typeof d.hubShareUrl==='string'&&d.hubShareUrl.length<=500&&d.hubShareUrl.indexOf(e.origin+'/')===0)SH[k]=d.hubShareUrl}});
document.querySelectorAll('[data-app]').forEach(function(b){b.onclick=function(){openApp(b.dataset.app)}});document.getElementById('back').onclick=function(){curId=null;view.classList.remove('on');workspace.style.display='block';document.title=T0;try{history.replaceState(null,'',location.pathname)}catch(e){}};
// alamat hub/#fund (dipakai tool yang dibuka di luar hub) langsung membuka tool itu
if(location.hash.length>1)openApp(location.hash.slice(1));addEventListener('hashchange',function(){var h=location.hash.slice(1);if(h&&h!==curId)openApp(h)});})();</script></body></html>`;
}

export { APPS, checkPw, hashPw };
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
    if (!sess) return post ? page(401, 'Sesi habis. Muat ulang halaman lalu login lagi.') : redirect('/login' + (path === '/' ? '' : '?next=' + encodeURIComponent(path + url.search)));
    if (sess.status !== 'approved') return page(403, gatePage(sess));
    if (path === '/sso') return sso(env, url, sess);
    if (path === '/admin' || path.startsWith('/admin/')) return admin(request, env, url, sess);
    if (path === '/akun') return account(request, env, url, sess);
    if (path !== '/') return redirect('/');
    return page(200, shellPage(env, sess, APPS.filter(a => accessOf(sess.u, a)), sess.role === 'admin' ? (await listUsers(env)).filter(x => x.status === 'pending').length : 0),
      { 'set-cookie': cookieStr(await makeSession(env, sess.email, sess.u), SESSION_DAYS * 86400) });   // perbarui cookie (juga memperpanjang sesi 30 hari)
  },
};