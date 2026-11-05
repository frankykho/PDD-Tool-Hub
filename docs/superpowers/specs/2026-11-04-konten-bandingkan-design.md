# Konten WA Channel dari Bandingkan (Fund Insight) — rancangan

## Maksud
Seminggu sekali, tim membuat satu konten perbandingan reksa dana untuk **WA Channel publik** (anggotanya masyarakat umum).
Kontennya berupa satu gambar HD (tabel + grafik) dan caption ringkasan yang ditulis AI.
Bahannya diambil langsung dari layar **Bandingkan** di Fund Insight, jadi tidak ada data atau hitungan baru.

## Tujuan
- Tombol **"Buat konten"** di Bandingkan (1–3 produk terpilih) → pratinjau gambar → **Unduh PNG 2160×3840**.
- **Caption AI** di kotak yang bisa diedit + tombol **Salin caption**. Hasil cek kepatuhan tampil di bawah kotak.
- Yang boleh memakai hanya **admin hub** dan **Investment Growth Specialist** (kunci jabatan `is`). Dicek di layar dan di server.

## Bukan tujuan
- Tidak ada jadwal, kirim otomatis, atau posting langsung ke WhatsApp. Semua jalan hanya saat tombol diklik.
- Tidak ada riwayat konten, tidak ada tabel baru di D1, tidak ada batas AI harian (cukup dibatasi peran, karena dipakai seminggu sekali).
- Tidak ada editor desain. Tata letak ditulis di kode.

## Anti-tujuan (gagal walau jalan)
- Caption menjanjikan untung, mengajak "beli sekarang", atau menyebut "terbaik" tanpa dasar.
- Angka di gambar atau caption berbeda dengan layar Bandingkan.
- Teks di gambar buram atau terlalu kecil saat dibuka di HP.

## Batasan
- Hanya solusi gratis. AI memakai `shared/ai.js`. Fund Insight tidak punya secret AI, jadi yang terpakai adalah Workers AI (gratis).
  Perlu menambah binding `"ai": { "binding": "AI" }` di `apps/fund-insight/wrangler.jsonc` dan `wrangler.deploy.json`.
- Logo resmi iKISI dari `brand/` (versi putih untuk latar gelap).
- Teks tampilan dalam Bahasa Indonesia. Kunci terjemahan baru ditambahkan ke `apps/fund-insight/i18n.js`.

## Pendekatan
1. **Dipilih: generator kanvas di Bandingkan.** Gambar digambar di browser (2160×3840). Caption dibuat oleh satu endpoint baru.
   Polanya sama dengan Generator Konten di Bond Insight yang sudah jalan. Kekurangannya, mengubah desain berarti mengubah kode.
2. Template di Brand Kit. Desainnya bisa diatur dari layar, tapi Brand Kit belum bisa menggambar tabel dan grafik, jadi pekerjaannya jauh lebih besar.
3. Tangkapan layar HTML. Hasilnya kurang rapi di ukuran HD dan butuh library tambahan.

## Yang sudah diputuskan
- Ukuran gambar 2160×3840 PNG (9:16). Satu gambar per konten.
- Pengguna: admin + Investment Growth Specialist.
- Frekuensi: seminggu sekali (manual).

## Usulan saya (boleh dikoreksi)
- **Isi gambar, dari atas ke bawah:**
  1. Logo iKISI.
  2. Judul "Perbandingan Reksa Dana" dan "Data per {tanggal}".
  3. Tabel. Baris yang dipakai: Jenis, Profil risiko, Manajer investasi, return per periode (sama dengan tabel Bandingkan), Naik-turun harga 1 th, Dana kelolaan, Min. pembelian.
     Rasio Sharpe, NAB per unit, dan rating bintang tidak dipakai, karena istilah itu sulit dipahami pembaca umum.
  4. Grafik pergerakan sejak tanggal yang sama, memakai rentang yang sedang dipilih di Bandingkan.
  5. Peringatan "jenis berbeda" bila produknya beda jenis.
  6. Disclaimer OJK di kaki gambar.
- **Tanda ▲ (nilai terbaik)** tidak dipakai di gambar publik, supaya tidak terbaca sebagai rekomendasi.
- **Endpoint `POST api/caption` `{ids, range}`:**
  - Server mengecek peran.
  - Server mengambil angka dari datanya sendiri, bukan dari kiriman browser.
  - Server memanggil `ai()` dengan `RULES_PROMPT` dari `shared/compliance.js`, lalu mengembalikan `{text, model}`.
- **Pemeriksaan caption:**
  - Browser memeriksa caption dengan `Compliance.check(teks, {platform:"wa"})` lewat `complianceScript()`.
  - Peringatan tampil di bawah kotak caption.
- **Bentuk caption:**
  - 1 kalimat pembuka, lalu 3–5 poin ringkas (mis. "Return 1 tahun: A x%, B y%"), lalu 1 kalimat netral.
  - Ditutup disclaimer: "Kinerja masa lalu tidak menjamin kinerja masa depan…".

## Diserahkan ke pembuat
- Detail warna dan huruf (ikut tema Fund Insight), cara menggambar tabel dan grafik di kanvas, dan susunan kalimat prompt.
- Tes: endpoint caption menolak peran lain (403), dan fakta yang dikirim ke AI memakai angka server.
