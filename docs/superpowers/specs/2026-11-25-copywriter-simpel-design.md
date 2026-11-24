# Tab Copywriter disederhanakan — rancangan singkat

Tanggal: 25 Nov 2026 · Status: menunggu persetujuan · Melanjutkan `2026-11-24-copywriter-tab-design.md`

## Kenapa
Setelah mencoba tab Copywriter, user menilai tab ini terlalu susah dipakai. Ada empat formulir berbeda dengan banyak kolom. Isiannya juga sudah terisi data contoh (program "Beyond Tomorrow", daftar hadiah, partner Sahamology/Kuliah Saham), padahal program dan partner ke depan bisa berbeda.

## Yang diinginkan (keputusan user)
- **Satu layar.** Pengguna mengunggah file Word atau menempel teks, memilih tujuan (**Buat artikel / Cek wording / Press release / Brief KISI Challenge**), lalu menekan **Buat**. AI mengerjakannya dari isi file.
- Pilihan kecil sesuai tujuan tetap boleh ada, tapi isinya **umum, bukan data contoh**.
- **Bentuk hasil tetap mengikuti pola contoh** (struktur artikel IGS, press release, dan brief per slide seperti di rancangan 24 Nov). User akan mengecek dulu.
- Pendekatan **A** dipilih: empat formulir diganti satu layar. Pendekatan B (formulir tetap ada, ditambah tombol "Isi dari file") ditolak karena tampilannya tetap ramai.

## Bukan sasaran
- Tidak ada lagi data program yang tersimpan, kolom highlight per item, atau daftar partner/hadiah contoh.
- Tidak mengubah bentuk hasil, cek angka, Track Changes, atau unduhan Word/Excel.

## Tampilan
1. **File:** unggah .docx (Cek wording juga menerima .xlsx/.pdf seperti sekarang). Ada juga tautan "atau tempel teks" yang membuka kotak teks.
2. **Tujuan:** empat tombol pilihan.
3. **Pilihan kecil** (muncul sesuai tujuan):
   - Artikel: Penutup = tanpa / branding / promo. Kalau promo, ada isian nama dan link promo (opsional; kalau kosong, AI mengambilnya dari file kalau ada).
   - Brief: Jenis = media / SNS. Kalau SNS: format (single post / carousel / reels / story), platform (teks bebas, default "IG"), tanggal posting (opsional), dan partner (teks bebas, dipisah koma; kalau kosong, AI mengambil partner yang disebut di file, atau membuat satu versi umum tanpa nama partner).
   - Press release dan Cek wording: tanpa pilihan tambahan (Cek wording tetap punya centang "Tambah versi Inggris").
4. Tombol **Buat** dengan tulisan proses ("Menulis…", "Mengecek…") selama AI bekerja.
5. **Hasil** di bawah, memakai tampilan hasil yang sudah ada untuk tiap jenis (bisa disunting, salin, unduh Word; Cek wording dengan Terima/Tolak dan unduhan Track Changes/bersih/Excel).

## Perubahan di balik layar
- Prompt `cw_brief` menerima **teks file** sebagai pengganti `program`. AI mengambil nama program, periode, hadiah, kategori, link, dan partner hanya dari teks itu. Data yang tidak ada ditulis "[perlu dilengkapi: …]", tidak dikarang.
- Prompt `cw_pr` memakai teks file sebagai bahan (kolom `free` yang sudah ada). Daftar `missing` tetap ada.
- Prompt `cw_article` dan alur Cek wording tidak berubah, hanya sumber teksnya dari langkah 1.
- **Dihapus:** formulir data program, `CW_DEFAULT.program` beserta data contohnya, kolom highlight press release, dan pilihan partner berupa centang. Rute `GET/POST /api/cw` tetap ada hanya untuk teks baku press release.
- **Tetap otomatis** (aturan, bukan contoh): disclaimer artikel, disclaimer hadiah, 4 baris disclaimer SNS (nama partner diisi otomatis; kalau tanpa partner, baris "… tidak terafiliasi …" dilewati), "Tentang KISI", serta pembuka dan byline artikel IGS.
- **Media Contact:** pindah ke tautan kecil "Pengaturan teks baku" (hanya editor/admin) berisi "Tentang KISI" dan Media Contact.
- Ikut masuk: perbaikan cek kepatuhan yang belum di-push (aturan "belum ada izin/S&K/risiko" dicek sekali per dokumen; "bukan jaminan keuntungan" tidak lagi ditandai).

## Keputusan saya (boleh dikoreksi)
- "Tempel teks" tetap ada sebagai cadangan kalau tidak ada file Word.
- Partner kosong pada brief SNS: AI mencari partner di file. Kalau tidak ada, dibuat satu versi umum.
- Pengaturan teks baku hanya dibuka lewat tautan kecil, supaya layar utama tetap bersih.

## Untuk pembangun
- Tata letak mengikuti gaya Copy Studio yang ada. Fungsi murni dan tes lama tetap dipakai. Tes yang memakai `CW_DEFAULT.program` diganti dengan tes prompt `cw_brief` dari teks.
