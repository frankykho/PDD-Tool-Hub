// Dua bahasa (Indonesia / Inggris) mengikuti satu tombol bahasa di Tool Hub, sama seperti tema (shared/theme.js).
// Tool Hub mengirim {type:"toolhub-lang", lang:"id"|"en"} ke iframe tool (saat dimuat & saat tombol diklik); tool meminta lewat
// {type:"toolhub-lang-request"}. Pilihan terakhir disimpan di localStorage "hub_lang". Di luar iframe, ?lang=en di alamat ikut dipakai
// (halaman publik bisa dibagikan dalam bahasa Inggris).
//
// Cara kerja: halaman tetap ditulis dalam bahasa Indonesia. Saat bahasa = en, skrip ini mengganti teks yang tampil (teks elemen,
// placeholder, title, aria-label, alt, value tombol, alert/confirm/prompt) memakai kamus Indonesia -> Inggris. Teks asli disimpan,
// jadi kembali ke Indonesia tanpa memuat ulang. Elemen baru/berubah (render ulang, React) diterjemahkan lewat MutationObserver.
//
// Kamus: { "Simpan": "Save", "Tersimpan: {n} cabang": "Saved: {n} branches" }
//  - kunci dicocokkan persis setelah spasi dirapikan; huruf besar di awal boleh beda ("simpan" ikut cocok dengan "Simpan").
//  - simbol di depan (✓ • · emoji) dan tanda baca di belakang (: . … ! ?) tidak perlu ditulis di kunci.
//  - {nama} = bagian yang berubah (angka, nama). Isinya ikut diterjemahkan kalau ada di kamus (mis. "Status: {s}").
//  - tanggal (Senin, 29 Oktober 2026 / 29 Okt) diterjemahkan otomatis.
// Teks yang tidak boleh diterjemahkan (isian pengguna, nama produk): beri elemennya translate="no" atau data-noi18n.
//
// Untuk teks di luar halaman (PPT, Excel, canvas): window.hubT("Teks") mengembalikan terjemahan saat bahasa = en; window.hubLang()
// = "id" | "en"; event "hub-lang" di window dikirim tiap bahasa berganti.
//
// Di server:  import { i18nHead } from "../../shared/i18n.js";  import EN from "./i18n.js";  lalu sisipkan i18nHead(EN) ke <head>
// (themeHead(css, EN) sudah menyertakannya).

/** Kata yang dipakai hampir semua tool. Kamus tiap tool ditambahkan di atasnya (kunci tool menang). */
export const COMMON_EN = {
  "Simpan": "Save", "Batal": "Cancel", "Tutup": "Close", "Hapus": "Delete", "Ubah": "Edit", "Tambah": "Add",
  "Kembali": "Back", "Lanjut": "Next", "Sebelumnya": "Previous", "Berikutnya": "Next", "Selesai": "Done", "Kirim": "Send",
  "Cari": "Search", "Cari…": "Search…", "Semua": "All", "Muat ulang": "Reload", "Segarkan": "Refresh",
  "Salin": "Copy", "Tersalin": "Copied", "Disalin": "Copied", "Unduh": "Download", "Unggah": "Upload", "Bagikan": "Share",
  "Pratinjau": "Preview", "Cetak": "Print", "Ekspor": "Export", "Impor": "Import", "Pilih": "Select", "Pilih file": "Choose file",
  "Ya": "Yes", "Tidak": "No", "Oke": "OK", "Coba lagi": "Try again", "Lihat": "View", "Lihat semua": "View all",
  "Lainnya": "Other", "Lain-lain": "Others", "Opsional": "Optional", "opsional": "optional", "Wajib": "Required", "wajib": "required",
  "Memuat": "Loading", "Memuat…": "Loading…", "Memuat...": "Loading...", "Menyimpan": "Saving", "Menyimpan…": "Saving…",
  "Tersimpan": "Saved", "Gagal": "Failed", "Gagal memuat": "Failed to load", "Gagal menyimpan": "Failed to save",
  "Berhasil": "Success", "Terjadi kesalahan": "Something went wrong", "Tidak ada data": "No data", "Belum ada data": "No data yet",
  "Kosong": "Empty", "Hari ini": "Today", "Kemarin": "Yesterday", "Besok": "Tomorrow", "Minggu ini": "This week",
  "Bulan ini": "This month", "Tahun ini": "This year", "Minggu lalu": "Last week", "Bulan lalu": "Last month",
  "Tanggal": "Date", "Waktu": "Time", "Jam": "Time", "Judul": "Title", "Nama": "Name", "Status": "Status",
  "Catatan": "Notes", "Keterangan": "Description", "Deskripsi": "Description", "Kategori": "Category", "Jenis": "Type",
  "Tipe": "Type", "Sumber": "Source", "Tautan": "Link", "Gambar": "Image", "Aksi": "Actions", "Detail": "Details",
  "Ringkasan": "Summary", "Laporan": "Report", "Pengaturan": "Settings", "Bantuan": "Help", "Akun": "Account", "Keluar": "Sign out",
  "Pengguna": "User", "Tim": "Team", "Periode": "Period",
  "Mulai": "Start", "Akhir": "End", "Dari": "From", "Sampai": "To", "Jumlah": "Count", "Rata-rata": "Average",
  "Aktif": "Active", "Nonaktif": "Inactive", "Draf": "Draft", "Terbit": "Published", "Diterbitkan": "Published",
  "Menunggu": "Pending", "Disetujui": "Approved", "Ditolak": "Rejected", "Setujui": "Approve", "Tolak": "Reject",
  "Baru": "New", "Terbaru": "Latest", "Terlama": "Oldest", "Urutkan": "Sort", "Tampilkan": "Show",
  "Sembunyikan": "Hide", "Lebih banyak": "More", "Selengkapnya": "Read more", "Ringkas": "Less", "Atur ulang": "Reset",
  "Terapkan": "Apply", "Buka": "Open", "Buat": "Create", "Buat baru": "Create new", "Perbarui": "Update",
  "Diperbarui": "Updated", "Terakhir diperbarui": "Last updated", "Versi": "Version", "Bahasa": "Language", "Tema": "Theme",
  "Terang": "Light", "Gelap": "Dark", "Sistem": "System", "Beranda": "Home", "Profil": "Profile",
  "Hari": "Day", "Bulan": "Month", "Tahun": "Year", "Harian": "Daily", "Mingguan": "Weekly",
  "Bulanan": "Monthly", "Tahunan": "Yearly", "hari": "days", "bulan": "months", "tahun": "years",
  "jam": "hours", "menit": "minutes", "detik": "seconds", "baru saja": "just now", "{n} menit lalu": "{n} min ago",
  "{n} jam lalu": "{n} h ago", "{n} hari lalu": "{n} days ago", "{n} minggu lalu": "{n} weeks ago", "{n} bulan lalu": "{n} months ago",
  "Dibuat oleh {x}": "Created by {x}", "oleh {x}": "by {x}", "Halaman {a} dari {b}": "Page {a} of {b}",
  "Tidak ditemukan": "Not found", "Akses ditolak": "Access denied", "Sesi berakhir": "Session expired",
  "Silakan masuk lagi": "Please sign in again", "Koneksi terputus": "Connection lost", "Tidak ada hasil": "No results",
  "Belum ada": "None yet", "Semua tool": "All tools", "Memakai AI": "Uses AI", "Dibuat dengan AI": "Made with AI",
  "Harga": "Price", "Kinerja": "Performance", "Risiko": "Risk", "Imbal hasil": "Return", "Reksa dana": "Mutual fund",
  "Obligasi": "Bond", "Saham": "Stock", "Nasabah": "Client", "Produk": "Product", "Pasar": "Market", "Berita": "News",
};

// Dijalankan di browser (fungsi ini dikirim sebagai teks; jangan pakai variabel dari luar).
function runtime(D) {
  var W = window, doc = document, lang = "id";
  try { var q = new URLSearchParams(location.search).get("lang"); if (q === "en" || q === "id") lang = q; else lang = localStorage.getItem("hub_lang") || "id"; } catch (e) { }
  if (lang !== "en") lang = "id";
  var exact = new Map(), lower = new Map(), pats = [];
  var norm = function (s) { return s.replace(/\s+/g, " ").trim(); };
  Object.keys(D).forEach(function (k) {
    var v = D[k], n = norm(k);
    if (n.indexOf("{") < 0) { exact.set(n, v); lower.set(n.toLowerCase(), v); return; }
    var names = [], src = n.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, function (_, a) { names.push(a); return "(.+?)"; });
    var pre = n.split("{")[0], suf = n.slice(n.lastIndexOf("}") + 1);
    pats.push({ re: new RegExp("^" + src + "$", "i"), names: names, out: v, pre: pre.toLowerCase(), suf: suf.toLowerCase(), lit: n.replace(/\{\w+\}/g, "").length });
  });
  // pola paling spesifik (teks tetap terpanjang) dicoba dulu, supaya "Terisi: {a}." tidak menelan kalimat yang lebih panjang
  pats = pats.map(function (p, i) { p.i = i; return p; }).sort(function (a, b) { return b.lit - a.lit || a.i - b.i; });
  var MON = { januari: "January", februari: "February", maret: "March", april: "April", mei: "May", juni: "June", juli: "July", agustus: "August", september: "September", oktober: "October", november: "November", desember: "December", jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", jun: "Jun", jul: "Jul", agu: "Aug", agt: "Aug", agus: "Aug", sep: "Sep", sept: "Sep", okt: "Oct", nov: "Nov", des: "Dec", senin: "Monday", selasa: "Tuesday", rabu: "Wednesday", kamis: "Thursday", jumat: "Friday", "jum'at": "Friday", sabtu: "Saturday", minggu: "Sunday", ahad: "Sunday", sen: "Mon", sel: "Tue", rab: "Wed", kam: "Thu", jum: "Fri", sab: "Sat", min: "Sun", pukul: "at", wib: "WIB", dan: "and", "s.d.": "to", "s/d": "to", sd: "to", hingga: "to", sampai: "to" };
  var DATE_RE = /^(?:[\d\s,.\-–—/:()]|\b(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|agt|agus|sep|sept|okt|nov|des|senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad|sen|sel|rab|kam|jum|sab|min|pukul|wib|dan|s\.d\.|s\/d|sd|hingga|sampai)\b)+$/i;
  function date(s) {
    if (!/[a-z]/i.test(s) || !DATE_RE.test(s) || !/\d/.test(s) && !/^(senin|selasa|rabu|kamis|jumat|sabtu|minggu)$/i.test(s)) return null;
    return s.replace(/s\.d\.|s\/d|jum'at|[a-z]+/gi, function (w) { var t = MON[w.toLowerCase()]; return t == null ? w : t; });
  }
  function cap(v, like) { var c = like.charAt(0); return c && c === c.toUpperCase() && c !== c.toLowerCase() ? v.charAt(0).toUpperCase() + v.slice(1) : c && c !== c.toUpperCase() ? v.charAt(0).toLowerCase() + v.slice(1) : v; }
  function word(s) {
    var v = exact.get(s); if (v != null) return v;
    v = lower.get(s.toLowerCase()); return v != null ? cap(v, s) : null;
  }
  function pattern(s, deep) {
    var l = s.toLowerCase();
    for (var i = 0; i < pats.length; i++) {
      var p = pats[i]; if (l.length < p.pre.length + p.suf.length || l.lastIndexOf(p.pre, 0) !== 0 || l.slice(l.length - p.suf.length) !== p.suf) continue;
      var m = p.re.exec(s); if (!m) continue;
      var out = p.out;
      for (var j = 0; j < p.names.length; j++) { var g = m[j + 1], t = deep < 3 ? tr(g, deep + 1) : g; out = out.split("{" + p.names[j] + "}").join(t == null ? g : t); }
      return p.pre ? cap(out, s) : out;   // huruf awal mengikuti teks asli (kunci "diubah {x}" juga cocok untuk "Diubah Budi")
    }
    return null;
  }
  // terjemahan satu teks, null = tidak ada di kamus. Spasi di tepi, simbol di depan & tanda baca di belakang dipertahankan.
  // Urutan: kunci persis (teks utuh, lalu tanpa simbol/tanda baca di tepi) > pola (sama) > tanggal > dipecah per " · " / ": ".
  function tr(s, deep) {
    if (!s || !/[a-z]/i.test(s)) return null;
    // beberapa baris (alert, kotak status): kunci utuh bila ada, selain itu per baris dengan baris baru dipertahankan
    if (/\S[^\S\n]*\n\s*\S/.test(s) && word(norm(s)) == null) {
      var ok = false, out = s.split("\n").map(function (x) { var y = tr(x, deep); if (y != null) ok = true; return y == null ? x : y; }).join("\n");
      return ok ? out : null;
    }
    var n = norm(s); if (!n || n.length > 2000) return null;
    deep = deep || 0;
    var m = /^([^\p{L}\p{N}]*)(.*?)([\s:.,;…!?)*]*)$/u.exec(n), bare = m && (m[1] || m[3]) && m[2] ? m : null, c;
    // tanpa membuang ")" di belakang: "Foo (bar)." cocok dengan kunci "Foo (bar)"
    var m2 = /^([^\p{L}\p{N}(]*)(.*?)([\s:.,;…!?*]*)$/u.exec(n), bare2 = m2 && (m2[1] || m2[3]) && m2[2] && m2[2] !== (bare && bare[2]) ? m2 : null;
    var v = word(n);
    if (v == null && bare && (c = word(bare[2])) != null) v = bare[1] + c + bare[3];
    if (v == null && bare2 && (c = word(bare2[2])) != null) v = bare2[1] + c + bare2[3];
    if (v == null) v = pattern(n, deep);
    if (v == null && bare && (c = pattern(bare[2], deep)) != null) v = bare[1] + c + bare[3];
    if (v == null) v = date(n);
    if (v == null && n.indexOf("\n") < 0 && / · | — | \| |: /.test(n)) {   // "Draf · 3 tugas", "Status: Disetujui" -> tiap bagian
      var parts = n.split(/( · | — | \| |: )/), ok = false;
      v = parts.map(function (x, i) { if (i % 2) return x; var t = tr(x, (deep || 0) + 1); if (t != null) ok = true; return t == null ? x : t; }).join("");
      if (!ok) v = null;
    }
    if (v == null) return null;
    var lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0];
    return lead + v + trail;
  }
  function trText(s) {
    if (lang !== "en" || typeof s !== "string") return s;
    var t = tr(s); return t == null ? s : t;
  }
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, TEMPLATE: 1, CODE: 1, PRE: 1 };
  var ATTRS = ["placeholder", "title", "aria-label", "alt", "label", "data-tip", "data-label"];
  function skip(el) {
    for (; el && el.nodeType === 1; el = el.parentNode) {
      if (SKIP[el.tagName.toUpperCase()] || el.isContentEditable || el.getAttribute("translate") === "no" || el.hasAttribute("data-noi18n")) return true;
    }
    return false;
  }
  var O = "__i18o", T = "__i18t";
  function doText(n) {
    var cur = n.data;
    if (n[T] !== undefined && cur === n[T]) return;
    if (n[O] !== undefined && cur !== n[T]) { n[O] = undefined; n[T] = undefined; }
    if (lang !== "en" || !/[a-z]/i.test(cur) || skip(n.parentNode)) return;
    var t = tr(cur); if (t == null || t === cur) return;
    // <option> tanpa value: nilainya = teksnya. Kunci dulu ke teks asli supaya yang dikirim ke server tidak ikut berubah.
    var p = n.parentNode; if (p && p.tagName === "OPTION" && !p.hasAttribute("value")) p.setAttribute("value", p.text);
    n[O] = cur; n[T] = t; n.data = t;
  }
  function doAttrs(el, check) {
    if (lang !== "en" || check && skip(el.tagName === "TEXTAREA" && !el.hasAttribute("translate") && !el.hasAttribute("data-noi18n") ? el.parentNode : el)) return;
    var list = el.tagName === "INPUT" && /^(button|submit|reset)$/i.test(el.type) ? ATTRS.concat("value") : ATTRS;
    for (var i = 0; i < list.length; i++) {
      var a = list[i], v = el.getAttribute(a), t = el[T]; if (v == null || !/[a-z]/i.test(v)) continue;
      if (t && t[a] !== undefined && v === t[a]) continue;
      var x = tr(v); if (x == null || x === v) { if (t) t[a] = undefined; continue; }
      if (!t) { el[T] = t = {}; el[O] = {}; }
      el[O][a] = v; t[a] = x; el.setAttribute(a, x);
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (root.tagName === "TEXTAREA") { doAttrs(root, true); return; } if (skip(root)) return; doAttrs(root); }
    // textarea: isinya (ketikan pengguna) dilewati, placeholder/title-nya tetap diterjemahkan
    var it = doc.createTreeWalker(root, 5, { acceptNode: function (n) { if (n.nodeType !== 1) return 1; if (n.tagName === "TEXTAREA" && !n.hasAttribute("translate") && !n.hasAttribute("data-noi18n")) { doAttrs(n); return 2; } return SKIP[n.tagName.toUpperCase()] || n.getAttribute("translate") === "no" || n.hasAttribute("data-noi18n") || n.isContentEditable ? 2 : 1; } }), n;
    while ((n = it.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  function restore(root) {
    var it = doc.createTreeWalker(root, 5), n;
    while ((n = it.nextNode())) {
      if (n.nodeType === 3) { if (n[T] !== undefined && n.data === n[T]) n.data = n[O]; n[O] = n[T] = undefined; continue; }
      var o = n[O], t = n[T]; if (!o) continue;
      for (var a in t) if (t[a] !== undefined && n.getAttribute(a) === t[a]) n.setAttribute(a, o[a]);
      n[O] = n[T] = undefined;
    }
  }
  var mo = new MutationObserver(function (ms) {
    if (lang !== "en") return;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m.type === "childList") { for (var j = 0; j < m.addedNodes.length; j++) if (m.addedNodes[j].isConnected) walk(m.addedNodes[j]); }
      else if (m.type === "characterData") doText(m.target);
      else doAttrs(m.target, true);   // atribut: hanya elemen itu, bukan seluruh isinya
    }
  });
  mo.observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat("value") });
  function apply() {
    doc.documentElement.setAttribute("lang", lang);
    if (lang === "en") walk(doc.documentElement); else restore(doc.documentElement);
    try { W.dispatchEvent(new CustomEvent("hub-lang", { detail: lang })); } catch (e) { }
  }
  function set(l) {
    l = l === "en" ? "en" : "id"; try { localStorage.setItem("hub_lang", l); } catch (e) { }
    if (l === lang) return; lang = l; apply();
  }
  W.hubLang = function () { return lang; };
  W.hubT = trText;
  W.hubSetLang = set;
  ["alert", "confirm", "prompt"].forEach(function (f) { var o = W[f]; if (o) W[f] = function (m, d) { return o.call(W, trText(m == null ? "" : String(m)), d); }; });
  W.addEventListener("message", function (e) { var d = e.data || {}; if (e.source === W.parent && W.parent !== W && d.type === "toolhub-lang") set(d.lang); });
  try { if (W.parent !== W) W.parent.postMessage({ type: "toolhub-lang-request" }, "*"); } catch (e) { }
  if (lang === "en") { doc.documentElement.setAttribute("lang", "en"); if (doc.readyState !== "loading") apply(); else doc.addEventListener("DOMContentLoaded", apply); }
}

const RUNTIME = `(${runtime.toString()})`;
const cache = new WeakMap();
const UNSAFE = new RegExp("[<" + String.fromCharCode(0x2028, 0x2029) + "]", "g");
/** Skrip <head> untuk dua bahasa. dict = kamus tool (Indonesia -> Inggris), digabung dengan COMMON_EN. */
export function i18nHead(dict = {}) {
  let s = cache.get(dict);
  if (!s) {
    // < dan pemisah baris U+2028/2029 di-escape supaya aman di dalam <script>
    const json = JSON.stringify({ ...COMMON_EN, ...dict }).replace(UNSAFE, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
    s = `<script>${RUNTIME}(${json})</script>`;
    cache.set(dict, s);
  }
  return s;
}
/** Untuk pengujian di Node: fungsi terjemahan yang sama dengan di browser. */
export function makeTranslator(dict = {}) {
  const D = { ...COMMON_EN, ...dict };
  const fake = { location: { search: "?lang=en" }, addEventListener() { }, dispatchEvent() { }, parent: null };
  fake.parent = fake;
  const store = {};
  const g = { window: fake, document: { documentElement: { setAttribute() { } }, readyState: "loading", addEventListener() { }, createTreeWalker() { return { nextNode() { return null; } }; } }, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, MutationObserver: class { observe() { } }, URLSearchParams, CustomEvent: class { } };
  new Function("window", "document", "localStorage", "MutationObserver", "URLSearchParams", "CustomEvent", "location", `${RUNTIME}(arguments[7])`)(g.window, g.document, g.localStorage, g.MutationObserver, g.URLSearchParams, g.CustomEvent, fake.location, D);
  return fake.hubT;
}
