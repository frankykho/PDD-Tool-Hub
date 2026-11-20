# Market News — Bahan Live IG mingguan

## Maksud
Tim Investment Growth Specialist siaran live Instagram tiap awal minggu: rekap pasar minggu lalu + tanya-jawab follower.
Tool ini menyiapkan bahannya sekali klik: angka kunci, naskah siap baca, pertanyaan cadangan, dan pengolahan pertanyaan
follower asli dari screenshot. Dipakai tiap minggu.

## Alur tim
- **Jumat sore** (setelah penutupan resmi, ±17.20 WIB): klik "Susun bahan minggu ini" → rekap Senin–Jumat + naskah +
  8–10 pertanyaan cadangan. Rekan tim memakai pertanyaan cadangan di kotak pertanyaan story (keputusan tim).
- **Akhir pekan**: follower bertanya lewat stiker pertanyaan story.
- **Senin pagi**: unggah screenshot jawaban stiker → tool membaca, mengelompokkan, memilih, dan menyiapkan poin jawaban.
  Naskah bisa disusun ulang bila ada berita besar di akhir pekan.

## Tujuan / bukan tujuan
- Tujuan: tab baru di Market News; arsip per minggu; semua teks bisa disunting, disalin, dan disusun ulang per bagian.
- Bukan tujuan: jadwal otomatis (bisa ditambah nanti atas permintaan), posting ke Instagram, ambil pertanyaan lewat API
  (Meta tidak menyediakan isi jawaban stiker pertanyaan), halaman publik.
- Anti-tujuan: rekomendasi beli/jual atau target harga di naskah maupun jawaban; angka yang tidak berasal dari data.

## Pendekatan
- **A. Tombol di tab Market News (dipilih)** — tim yang memicu; tanpa jadwal baru; data diambil saat diklik.
- B. Disusun otomatis Senin 06.00 lewat apps/cron — tidak dipilih: menambah otomatisasi, AI jalan walau tidak ada live.
- Tool baru terpisah — tidak dipilih: worker, SSO, pendaftaran Hub, dan database baru (kuota D1 penuh 10/10), tanpa
  manfaat tambahan; Market News sudah punya berita + akses baca arsip Market Recap (binding `RECAP_DB`).

## Isi bahan (satu minggu = Senin–Jumat hari bursa terakhir yang lengkap)
1. **Angka kunci** (poin singkat): IHSG awal→akhir minggu (%), tertinggi/terendah; asing net beli/jual seminggu;
   sektor terkuat/terlemah (gabungan %); 5 penggerak indeks seminggu; 3–5 saham paling hype; 3–5 berita paling ramai
   (+1 kalimat "kenapa penting"); agenda minggu depan.
2. **Naskah siap baca** ±5–7 menit (±700–900 kata): pembuka → IHSG → saham hype → berita → agenda minggu depan → ajakan
   bertanya. Gaya: santai untuk IG, untuk follower yang **sudah biasa trading** (istilah breakout, net sell asing,
   cum date dipakai apa adanya).
3. **Pertanyaan cadangan** 8–10, ditulis seperti follower sungguhan (singkat, santai, kadang menyebut kode saham), campuran
   terkait minggu itu (saham/berita) dan strategi/membaca pasar; tiap pertanyaan + 3–5 poin jawaban.
4. **Pertanyaan follower** (Senin): dari screenshot → daftar {akun, pertanyaan}; yang mirip dikelompokkan; ditandai
   "layak dijawab" (relevan, tidak minta rekomendasi pribadi) dan diurutkan; tiap kelompok + poin jawaban.

## Sumber data
- **Rekap harian**: `recaps` di recap-db (session `close`, kolom `data` JSON: ihsg open/close/high/low/pct, sectors,
  movers up/down per hari, foreign, agenda). Seminggu dijumlah/digabung dari 5 baris.
- **Berita**: `mn_items` minggu itu (skor `score`, `tickers`, `cat`, `summary`/`why` bila ada). Berita dihapus setelah
  7 hari → saat disusun, berita terpilih **disalin** ke arsip mingguan.
- **Saham hype**: gabungan (a) seberapa sering kode saham muncul di berita minggu itu (bobot skor), dan (b) scan
  TradingView (sudah dipakai Market News) — perubahan 1 minggu terbesar naik/turun dan volume relatif tinggi, saham
  likuid saja. Skor gabungan, ambil 3–5 teratas; tiap saham membawa angkanya (% seminggu, alasan dari berita bila ada).
- **Agenda minggu depan**: `shared/macro.js` (makro); agenda emiten dari calendar.json bila tersedia (saat ini kosong).

## AI
- `shared/ai.js` (Gemini gratis → Workers AI cadangan). Satu panggilan per bagian (angka kunci tidak pakai AI; naskah,
  pertanyaan cadangan, pengolahan pertanyaan follower masing-masing satu panggilan) supaya bisa disusun ulang per bagian.
- AI hanya boleh memakai angka dari data yang diberikan. Teks hasil dicek dengan aturan anti-rekomendasi (pola seperti
  `analyst.ts` di SATS); bila kena, kalimatnya ditandai untuk disunting tim, tidak dihapus diam-diam.
- **Baca screenshot**: `shared/ai.js` ditambah dukungan gambar (Gemini inline image; Workers AI vision sebagai cadangan).
  Belum ada tool yang mengirim gambar, jadi perubahan dibuat tanpa mengubah perilaku pemanggil lama. Maks. ±10 gambar per
  unggahan, dikecilkan di browser sebelum dikirim. Gambar tidak disimpan, hanya teks hasil bacaan.

## Penyimpanan & privasi
- Tabel baru di news-db: `mn_live` (minggu `YYYY-MM-DD` Senin, data angka JSON, berita tersalin JSON, naskah, cadangan
  JSON, pertanyaan follower JSON, model, diubah oleh/kapan).
- Nama akun penanya **disimpan** (dibutuhkan pembawa acara untuk menyapa). Hanya terlihat oleh tim yang login; editor
  bisa menghapus pertanyaan follower satu minggu. Paket gratis Gemini boleh memakai input untuk pelatihan — dicatat di
  halaman unggah.

## Akses
- Lihat: semua yang punya akses Market News. Susun/sunting/unggah/hapus: editor & admin (aturan yang sudah ada).

## Diputuskan oleh saya (bisa dikoreksi)
- Minggu yang disusun = minggu bursa terakhir yang punya rekap `close` hari Jumat (atau hari bursa terakhir minggu itu).
- Angka kunci dihitung kode (bukan AI) supaya selalu benar.
- Panjang naskah ±700–900 kata; 8–10 pertanyaan cadangan.
- Arsip mingguan disimpan tanpa batas waktu (kecil); pertanyaan follower bisa dihapus manual.
- **Susun ulang naskah hari Senin**: angka kunci tetap dari data Senin–Jumat; berita sejak penutupan Jumat sampai saat
  diklik disalin sebagai "berita akhir pekan" (snapshot kedua) dan ikut diberikan ke AI untuk naskah.
- **5 penggerak indeks seminggu**: dihitung dari TradingView saat diklik (perubahan 1 minggu × kapitalisasi), karena
  rekap harian hanya menyimpan 5 teratas per hari. Bila disusun setelah minggu berikutnya dimulai (data TradingView sudah
  bergeser), pakai jumlah 5 rekap harian dan beri label "perkiraan".
- **Berita yang dihitung**: semua berita minggu itu yang tidak diabaikan (`status <> 'abaikan'`), bukan hanya yang
  terbit; "kenapa penting" dari `why` bila ada, selain itu ditulis AI.
- **Gambar screenshot** hanya dikirim ke layanan yang mendukung gambar, urutan sama dengan `ai()` (Claude bila ada key →
  Gemini → Workers AI; Groq dilewati). Catatan privasi di halaman unggah menyebut "layanan AI pihak ketiga" secara umum.
- **Unggahan kedua di minggu yang sama**: pertanyaan mentah ({akun, pertanyaan}) disimpan dan digabung (duplikat persis
  dibuang), lalu seluruhnya dikelompokkan ulang.

## Untuk pembuat
- Tes: agregasi mingguan dari 5 rekap (termasuk minggu dengan libur bursa), skor saham hype, pembersihan hasil baca
  screenshot (JSON rusak/kosong), aturan anti-rekomendasi, dan `shared/ai.js` tetap sama untuk pemanggil teks.
- Tampilan mengikuti tab yang sudah ada di `page.html` (chip "Tampilan" → tambah "Live IG"); teks EN masuk `i18n.js`.
