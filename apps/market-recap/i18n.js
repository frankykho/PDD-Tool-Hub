// Kamus bahasa Inggris Market Recap (halaman tim). Format & aturan: shared/i18n.js.
// Slide carousel, PNG, PDF (A4 & slide), narasi, dan halaman publik /p = materi nasabah: tetap bahasa Indonesia.
export default {
  "Arsip": "Archive",
  "Sesi 1": "Session 1",
  "Penutupan": "Close",
  "{s}: terbit": "{s}: published",
  "{s}: draf": "{s}: draft",
  "Halaman publik ↗": "Public page ↗",
  "Unduh PNG": "Download PNG",
  "Unduh PDF A4": "Download A4 PDF",
  "Laporan A4: teks lengkap, angka kunci, grafik, tabel, dan berita": "A4 report: full text, key figures, charts, tables, and news",
  "PDF slide": "Slide PDF",
  "Slide carousel 1080×1080, satu per halaman": "1080×1080 carousel slides, one per page",
  "Satu baris per label (JUDUL, PENGGERAK, INTRADAY, GLOBAL, AGENDA, OUTLOOK); setelah \"NARASI:\" teks untuk halaman web. Slide di atas ikut berubah saat diketik":
    "One line per label (JUDUL, PENGGERAK, INTRADAY, GLOBAL, AGENDA, OUTLOOK); after \"NARASI:\" comes the text for the web page. The slides above update as you type",
  "Teks AI gagal dibuat ({e}); slide memakai judul otomatis. Tulis manual atau klik Susun ulang.":   // titik ikut: tanpa itu pola "Teks {s}" yang menang
    "AI text could not be generated ({e}); the slides use automatic titles. Write it manually or click Rebuild.",
  "Tarik dari publik": "Unpublish",
  "Terbitkan": "Publish",
  "Susun ulang": "Rebuild",
  "Susun {s} sekarang": "Build {s} now",
  "Diperbarui {w}": "Updated by {w}",
  "teks: {m}": "text: {m}",
  "teks": "text",   // "Diperbarui … · teks: model" (bagian dipecah di ": ")
  "Tersimpan ✓": "Saved ✓",
  "Menyusun… (±30 detik)": "Building… (~30 s)",
  "Membuat gambar…": "Generating images…",
  "Belum ada rangkuman untuk tanggal ini. Sesi 1 tersusun otomatis sekitar 12:20 WIB, penutupan sekitar 17:20 WIB":
    "No recap for this date yet. Session 1 is built automatically around 12:20 WIB, the close around 17:20 WIB",
  "Rangkuman ini sudah terbit. Susun ulang mengganti data & teks dan mengembalikannya ke draf. Lanjut?":
    "This recap is already published. Rebuilding replaces the data & text and returns it to draft. Continue?",
  "Susun ulang mengganti data & teks (suntingan hilang). Lanjut?": "Rebuilding replaces the data & text (your edits will be lost). Continue?",

  // error dari worker
  "Belum login atau sesi habis. Muat ulang halaman dari Tool Hub": "Not signed in or session expired. Reload the page from Tool Hub",
  "Tanggal tidak sah": "Invalid date",
  "Permintaan ditolak": "Request rejected",
  "Hanya editor atau admin yang bisa mengubah rangkuman": "Only editors or admins can change recaps",
  "Tanggal atau sesi tidak sah": "Invalid date or session",
  "Hanya rangkuman hari ini yang bisa disusun ulang (data diambil saat ini)": "Only today's recap can be rebuilt (data is fetched right now)",
  "Sesi 1 hanya bisa disusun ulang saat jeda siang (12:00–13:30 WIB, Jumat 11:30–14:00); setelah itu harga sudah bergerak di sesi 2":
    "Session 1 can only be rebuilt during the lunch break (12:00–13:30 WIB, Friday 11:30–14:00); after that prices have moved in session 2",
  "Penutupan bisa disusun setelah bursa tutup (16:15 WIB)": "The close can be built after the market closes (16:15 WIB)",
  "bursa tidak dibuka hari ini": "the market is not open today",
  "menunggu data penutupan IDX": "waiting for IDX closing data",
  "Harga IHSG belum tersedia dari Story Data": "IHSG price is not yet available from Story Data",
  "Gagal: {e}": "Failed: {e}",
  // pesan AI (shared/ai.js), tampil di "Teks AI gagal dibuat (…)"
  "Claude menolak permintaan ini": "Claude declined this request",
  "Binding Workers AI (nama: AI) belum dipasang di worker ini": "The Workers AI binding (name: AI) is not set up on this worker",
  "Kuota AI gratis hari ini sudah habis. Kuota terisi lagi pukul 07.00 WIB": "Today's free AI quota is used up. It refills at 07.00 WIB",
  "AI gagal menjawab: {e}": "AI failed to answer: {e}",
  // pola umum di akhir supaya pola yang lebih khusus (mis. "Teks AI gagal dibuat …") dicocokkan lebih dulu
  "Teks {s}": "{s} text",
};
