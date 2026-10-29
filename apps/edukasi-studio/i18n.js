// Kamus bahasa Inggris Edukasi Studio. Format & aturan: shared/i18n.js.
// Naskah hasil AI (editor & pratinjau), catatan fakta, judul & cuplikan artikel sumber, dan judul draf diberi translate="no" di worker.js.
export default {
  // ---- kepala & tab ----
  "Riset artikel edukasi → konten orisinal": "Educational article research → original content",
  "Riset artikel edukasi → konten orisinal {b}": "Educational article research → original {b} content",
  "Bank Artikel": "Article Bank", "Tulis": "Write", "Draf": "Drafts", "Sumber": "Sources",

  // ---- topik (TOPICS) ----
  "Saham": "Stocks", "Saham Syariah": "Sharia Stocks", "Reksa Dana": "Mutual Funds", "ETF": "ETF", "Obligasi & SBN": "Bonds & SBN",
  "Structured Warrant": "Structured Warrant", "Derivatif": "Derivatives", "DIRE, DINFRA & EBA": "DIRE, DINFRA & EBA",
  "Right Issue & Waran": "Rights Issue & Warrants", "Margin & Short Selling": "Margin & Short Selling",

  // ---- bank artikel ----
  "Semua sumber": "All sources", "Cari judul atau isi…": "Search title or content…", "+ Tambah artikel dari link": "+ Add article from link",
  "https://… (artikel edukasi yang bagus tapi sumbernya belum terdaftar)": "https://… (a good educational article whose source is not registered yet)",
  "Topik": "Topic", "Topik otomatis": "Automatic topic",
  "Tool tetap mengecek robots.txt situsnya. Halaman PDF belum didukung.": "The tool still checks the site's robots.txt. PDF pages are not supported yet.",
  "Muat lagi": "Load more", "Kosongkan": "Clear", "Tulis dari artikel ini →": "Write from these articles →",
  "Tempel link artikel dulu.": "Paste the article link first.", "Mengambil…": "Fetching…", "Tersimpan: {t}": "Saved: {t}",
  "Belum ada artikel yang cocok.": "No matching articles yet.", "Belum ada artikel. Buka tab": "No articles yet. Open the", "lalu klik": "tab, then click",
  "Perbarui sekarang": "Update now", "{n} artikel": "{n} articles", "Pilih artikel": "Select article", "Baru": "New",
  "{n} kata": "{n} words", "Ditambah manual": "Added manually",
  "Lihat catatan fakta": "View fact notes", "Buat catatan fakta": "Create fact notes", "Membuat catatan…": "Creating notes…", "Tutup / lihat catatan": "Close / view notes",
  "Maksimal 5 artikel sekaligus.": "Max. 5 articles at once.", "{n} artikel dipilih": "{n} articles selected",

  // ---- tulis ----
  "1. Bahan riset": "1. Research material", "Kata kunci (opsional), mis. kupon": "Keyword (optional), e.g. coupon", "Kata kunci": "Keyword", "Pilih otomatis": "Auto-pick",
  "Gunakan 2–4 artikel dari sumber berbeda. AI hanya membaca catatan fakta dari tiap artikel, bukan kalimat aslinya.": "Use 2–4 articles from different sources. The AI only reads the fact notes from each article, not its original sentences.",
  "2. Arahan": "2. Direction", "Format": "Format", "Artikel website": "Website article", "Feed carousel": "Feed carousel", "Story": "Story",
  "Judul atau ide (opsional)": "Title or idea (optional)", "mis. Bedanya obligasi negara dan korporasi untuk pemula": "e.g. The difference between government and corporate bonds for beginners",
  "Sudut pandang / pesan {b} (opsional)": "Angle / {b} message (optional)",
  "mis. tekankan diversifikasi; ajak belajar lewat kelas edukasi kita": "e.g. emphasize diversification; invite readers to learn through our education classes",
  "Pembaca": "Readers", "Pemula": "Beginners", "Sudah paham dasar": "Know the basics", "Panjang artikel": "Article length",
  "Tulis konten": "Write content", "3. Hasil": "3. Result", "Hasil tulisan muncul di sini.": "The written result appears here.",
  "Edit": "Edit", "Cek ulang kemiripan": "Recheck similarity", "Tulis ulang kalimat yang ditandai": "Rewrite flagged sentences",
  "Jadikan feed": "Turn into feed", "Jadikan story": "Turn into story", "Unduh .md": "Download .md", "Simpan draf": "Save draft",
  "Sumber riset (catatan internal, tidak ikut tersalin)": "Research sources (internal notes, not copied)",
  "Wajib dicek manusia sebelum tayang: angka, aturan, dan tanda [cek ulang]. Konten untuk publik tetap lewat review Compliance sesuai aturan internal.": "Must be checked by a person before going live: figures, rules, and [cek ulang] (recheck) markers. Public content still goes through Compliance review per internal rules.",
  "Belum ada artikel. Pilih di Bank Artikel, atau pakai “Pilih otomatis”.": "No articles yet. Choose them in the Article Bank, or use “Auto-pick”.",
  "Belum ada artikel untuk topik ini. Perbarui sumber dulu.": "No articles for this topic yet. Update the sources first.",
  "Pilih artikel sumber dulu.": "Choose source articles first.", "Catatan fakta {a}: {t}": "Fact notes {a}: {t}",
  "Menulis konten…": "Writing content…", "Cek kemiripan dengan sumber…": "Checking similarity with sources…", "AI: {m}": "AI: {m}",
  // cek kemiripan
  "{n} kalimat sama persis dengan sumber": "{n} sentences identical to the sources", "{n} kalimat mirip": "{n} similar sentences",
  "kemiripan {p}": "similarity {p}", "struktur mirip": "similar structure", "{a} dari {b} subjudul": "{a} of {b} subheadings",
  "struktur berbeda dari semua sumber": "structure differs from all sources", "sama dengan {x}": "same as {x}",
  "Tulis ulang kalimat yang ditandai dulu. Draf baru bisa disimpan setelah 0 kalimat mirip.": "Rewrite the flagged sentences first. The draft can only be saved once there are 0 similar sentences.",
  "Ubah urutan atau sudut subjudul supaya tidak mengikuti satu artikel sumber.": "Change the order or angle of the subheadings so they don't follow a single source article.",
  "{x}. Ini cek internal, bukan jaminan lolos alat cek plagiat lain; tetap sunting sebelum terbit.": "{x}. This is an internal check, not a guarantee of passing other plagiarism checkers; still edit before publishing.",
  "Dicek terhadap {n} artikel bahan": "Checked against {n} source articles",
  "cek ke seluruh bank artikel sedang berjalan…": "check against the whole article bank in progress…",
  "cek ke seluruh bank artikel gagal, klik Cek ulang": "check against the whole article bank failed, click Recheck",
  "dicek juga ke seluruh bank artikel ({n} frasa): {r}": "also checked against the whole article bank ({n} phrases): {r}",
  "dicek juga ke seluruh bank artikel ({n} frasa)": "also checked against the whole article bank ({n} phrases)",
  "tidak ada artikel lain yang sama": "no other article matches", "{n} artikel lain memuat frasa yang sama": "{n} other articles contain the same phrases",
  "Masih ada kalimat yang sama persis dengan sumber": "There are still sentences identical to the sources",
  "Menulis ulang…": "Rewriting…", "Kalimat yang ditandai sudah ditulis ulang. Cek lagi hasilnya.": "The flagged sentences have been rewritten. Check the result again.",
  "Menyusun…": "Composing…", "Naskah {f} dibuat dari artikel. Simpan sebagai draf terpisah.": "{f} script created from the article. Save it as a separate draft.",
  "feed": "feed", "story": "story", "Tersalin.": "Copied.", "Tulis ulang kalimat yang ditandai dulu.": "Rewrite the flagged sentences first.", "Draf tersimpan.": "Draft saved.",

  // ---- draf ----
  "Draf tersimpan": "Saved drafts", "Belum ada draf.": "No drafts yet.", "Artikel": "Article", "Feed": "Feed", "Hapus draf ini?": "Delete this draft?",

  // ---- sumber ----
  "Sumber artikel": "Article sources", "Berhenti": "Stop",
  "Artikel baru diambil otomatis bila jadwal (Cron) dipasang. Tool ini menghormati robots.txt dan hanya mengambil artikel bertopik edukasi.": "New articles are fetched automatically when the schedule (Cron) is set up. This tool respects robots.txt and only fetches educational articles.",
  "{n} artikel di bank": "{n} articles in the bank", "{n} baru dalam 24 jam terakhir": "{n} new in the last 24 hours",
  "Antrean": "Queue", "Terakhir dicek": "Last checked", "resmi": "official", "{n} baru": "{n} new", "+{n} baru": "+{n} new",
  "{n} dilewati": "{n} skipped", "{n} gagal": "{n} failed", "sedang berjalan": "running", "aktif": "active", "nonaktif": "inactive",
  "Cek ulang": "Recheck", "Sumber dicek ulang saat Perbarui berikutnya.": "The source will be rechecked on the next Update.", "Hapus sumber ini?": "Delete this source?",
  "Tambah sumber (admin)": "Add source (admin)", "Nama sumber": "Source name", "Sitemap XML": "Sitemap XML", "RSS feed": "RSS feed",
  "Filter alamat (opsional), mis. /edukasi/": "URL filter (optional), e.g. /edukasi/",
  "Cek dulu robots.txt situsnya dan pastikan artikelnya bisa dibaca tanpa login.": "Check the site's robots.txt first and make sure its articles can be read without signing in.",
  "Sumber ditambahkan.": "Source added.",
  // log Perbarui sekarang
  "Mulai…": "Starting…", "Selesai. Semua sumber sudah dicek dalam 24 jam terakhir.": "Done. All sources were checked in the last 24 hours.",
  "Cek {s}: +{n} URL": "Check {s}: +{n} URLs", "Cek {s}: +{n} URL ({e})": "Check {s}: +{n} URLs ({e})",
  "Galat: {m}": "Error: {m}", "lanjut ke langkah berikutnya": "continuing to the next step",
  "Berhenti setelah 3 galat berturut-turut.": "Stopped after 3 errors in a row.", "Artikel baru tersimpan: {n}": "New articles saved: {n}",
  // catatan sumber bawaan (SOURCES)
  "IDX (Bursa Efek Indonesia)": "IDX (Indonesia Stock Exchange)",
  "Contoh banyak memakai saham/ETF Amerika.": "Examples often use US stocks/ETFs.", "Situs kripto; artikel non-topik otomatis disaring.": "Crypto site; off-topic articles are filtered automatically.",
  "Banyak promosi produk BCA; AI hanya mengambil faktanya.": "Lots of BCA product promotion; the AI only takes the facts.", "Kuat di SBN ritel & reksa dana.": "Strong on retail SBN & mutual funds.",
  "Manajer investasi; fokus reksa dana.": "Investment manager; focused on mutual funds.", "Manajer investasi; topik ditentukan dari judul.": "Investment manager; topic determined from the title.",
  "Kuat di obligasi/SBN; ada promosi produk DBS.": "Strong on bonds/SBN; includes DBS product promotion.", "Ada promosi produk CIMB Niaga.": "Includes CIMB Niaga product promotion.",
  "Contoh banyak memakai saham AS.": "Examples often use US stocks.", "Media berita; hanya artikel penjelasan yang diambil.": "News outlet; only explainer articles are taken.",
  "robots.txt situs ini menolak GPTBot & CCBot. Aktifkan hanya bila tim setuju.": "This site's robots.txt blocks GPTBot & CCBot. Enable only if the team agrees.",
  "robots.txt situs ini menolak bot AI. Aktifkan hanya bila tim setuju.": "This site's robots.txt blocks AI bots. Enable only if the team agrees.",
  // status & galat sumber / artikel dari server
  "Terhenti saat memproses {t} (kemungkinan batas CPU); bagian ini dilewati.": "Stopped while processing {t} (probably the CPU limit); this part was skipped.",
  "Diblokir robots.txt: {t}": "Blocked by robots.txt: {t}", "HTTP {s} di {t}": "HTTP {s} at {t}",
  "robots.txt situs ini melarang": "this site's robots.txt disallows it", "bukan halaman HTML (PDF belum didukung)": "not an HTML page (PDF not supported yet)",
  "isi terlalu sedikit (mungkin butuh JavaScript)": "too little content (may require JavaScript)", "lebih mirip berita": "looks more like news",
  "bukan topik pasar modal yang dipantau": "not a monitored capital market topic", "terhenti 2x saat diproses (halaman terlalu berat?)": "stopped twice while processing (page too heavy?)",
  "diulang": "retried",

  // ---- pesan dari server (API) ----
  "Sesi habis": "Session expired", "Sesi habis. Muat ulang halaman.": "Session expired. Reload the page.",
  "Cloudflare membalas halaman galat (HTTP {s}), biasanya karena batas CPU paket gratis terlampaui": "Cloudflare returned an error page (HTTP {s}), usually because the free plan CPU limit was exceeded",
  "Artikel tidak ditemukan.": "Article not found.", "Link belum benar.": "The link is not valid.", "Gunakan link https.": "Use an https link.",
  "Tidak bisa disimpan: {i}": "Cannot be saved: {i}", "Pilih minimal satu artikel sumber.": "Choose at least one source article.",
  "Tidak ada kalimat yang ditandai.": "No sentences are flagged.", "Naskah kosong.": "The script is empty.", "Draf ini milik orang lain.": "This draft belongs to someone else.",
  "Hanya pembuat draf atau admin yang bisa menghapus.": "Only the draft's creator or an admin can delete it.", "Khusus admin.": "Admins only.",
  "URL belum benar.": "The URL is not valid.", "Isi nama dan URL https.": "Fill in the name and an https URL.", "Filter alamat tidak valid.": "The URL filter is not valid.",
  "Sumber bawaan tidak bisa dihapus, cukup dinonaktifkan.": "Built-in sources cannot be deleted, only disabled.", "Tidak ditemukan.": "Not found.",
  "Terjadi kesalahan: {m}": "Something went wrong: {m}",

  // ---- halaman pengaturan (belum dikonfigurasi) ----
  "Edukasi Studio belum dikonfigurasi": "Edukasi Studio is not configured yet", "Di Cloudflare buka Worker ini →": "In Cloudflare, open this Worker →",
  "lalu lengkapi": "then complete", "Variables and Secrets → alamat Tool Hub (diisi otomatis oleh scripts/deploy.mjs)": "Variables and Secrets → Tool Hub address (filled in automatically by scripts/deploy.mjs)",
  "Tipe Secret, isinya sama persis dengan SSO_SECRET di Tool Hub": "Type Secret, with exactly the same value as SSO_SECRET in Tool Hub",
  "Bindings → Add → D1 database, Variable name": "Bindings → Add → D1 database, Variable name", "Bindings → Add → Workers AI, Variable name": "Bindings → Add → Workers AI, Variable name",
};
