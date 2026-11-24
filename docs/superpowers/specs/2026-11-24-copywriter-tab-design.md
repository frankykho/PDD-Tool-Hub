# Tab "Copywriter" di Copy Studio — rancangan

Tanggal: 24 Nov 2026 · Status: menunggu persetujuan

## Untuk apa

Copywriter KISI punya empat pekerjaan rutin yang sekarang dikerjakan manual:

1. **Artikel harian dari IGS.** Tim Investment Growth Specialist mengirim naskah berita yang hampir jadi (Word atau teks), plus judul kerja. Copywriter mempertajam judul, merapikan, menambah tag, lalu menerbitkannya di kisi.co.id (rubrik Behind The Candle).
2. **Brief KISI Challenge** untuk media (artikel/berita) dan komunitas (single post, carousel, reels, story).
3. **Press release** dari highlight acara/pencapaian.
4. **Review wording proposal** promo/distribusi (Word/Excel): typo, kalimat, terjemahan ke Inggris. Setelah itu file diunggah ke IMO. Unggahan ke IMO tetap manual, di luar tool.

User minta **satu menu** supaya pengguna tidak bingung. Alurnya sama untuk semua jenis: **pilih jenis → isi bahan → AI buat draf → edit → salin/unduh**.

## Sasaran, bukan sasaran, anti-sasaran

- **Sasaran:** draf siap pakai yang mengikuti format KISI yang sudah terbit (contoh di bawah), lebih cepat dari menulis manual, dan aman terhadap aturan OJK.
- **Bukan sasaran:** unggah ke IMO, menerbitkan ke website, membuat desain visual (Copy Studio/Canva sudah ada), membaca PDF untuk diperbaiki (PDF hanya dibaca).
- **Anti-sasaran (gagal walau jalan):**
  - AI mengarang angka, nama, gelar, jabatan, atau kutipan.
  - Isi analisis IGS berubah makna.
  - Format file proposal rusak setelah diperbaiki.
  - Artikel berita terbaca sebagai ajakan beli.

## Batasan

- Cloudflare Workers gratis. D1 penuh (10/10), jadi tidak ada database baru. Copy Studio sudah punya `copy-db` dengan tabel `meta (k, v)`.
- AI lewat `shared/ai.js` (Claude → Gemini → Groq → Workers AI). Kuota bersama `COPY_AI_DAILY` **dinaikkan dari 60 ke 100** (keputusan user) di `wrangler.jsonc` dan `wrangler.deploy.json`.
- File Word/Excel **diolah di browser**. Hanya teksnya yang dikirim ke `/api/ai`.
- Logo kop press release: `brand/kisi-color.png` (logo resmi, lihat brand/README.md). Disalin ke `apps/copy-studio/assets/brand/` kalau belum ada.
- Bahasa UI Indonesia, dengan terjemahan Inggris di `i18n.js` seperti tab lain.

## Pendekatan

**Penempatan.**
- (A) Satu tab "Copywriter" di Copy Studio. **Dipilih user.** Login, aturan OJK (`shared/compliance.js`), glosarium dan panduan gaya, `copy-db`, serta kuota AI sudah ada di sana.
- (B) Tool terpisah di hub. Ditolak: aturan dan glosarium harus disambung ulang, dan tetap harus menumpang D1.

**Hasil file Word/Excel yang diperbaiki.**
- (A) Hanya mengganti teks di dalam file asli.
- (B) Seperti A, tapi di Word perubahan ditulis sebagai **Track Changes** (`w:ins`/`w:del`). Atasan bisa melihat apa yang diubah, lalu "Accept All" sebelum diunggah ke IMO. **Dipilih user.**
- (C) Membuat ulang file dari teks. Ditolak karena format aslinya hilang.

## Rancangan per jenis

Tab punya pemilih jenis di atas: **Artikel berita · Brief KISI Challenge · Press release · Cek wording file**. Satu tab, empat formulir. Hanya formulir yang dipilih yang tampil.

### 1. Artikel berita (IGS → website)

Contoh nyata (terbit 23 Nov 2026, kisi.co.id/blog/edukasi/…/279): teks terbit **identik** dengan kiriman IGS. Bedanya hanya judul ("Deal Indonesia-Eropa" menjadi "Deal Indonesia-Eropa, Peluang Baru Buat Sektor Ini!") dan tag tetap (iKISI, KISI, Behind The Candle).

- **Input:** unggah .docx (pakai ulang cara baca `apps/feature-intel/assets/brd-docx.js`) atau tempel teks. Ada juga judul kerja IGS dan pilihan **penutup**: Tanpa tambahan / Branding / Bridging promo (nama promo dan link diisi, atau diambil dari data program KISI Challenge yang tersimpan).
- **Hasil:**
  - **3–5 usulan judul** dari judul IGS, gaya memancing rasa ingin tahu.
  - **Isi tetap dari IGS.** AI hanya memperbaiki ejaan dan kalimat janggal. Setiap perubahan ditampilkan (sebelum → sesudah) dan bisa ditolak. **Angka, nama, dan kutipan tidak boleh berubah.** Ini dicek di kode: setiap angka di teks asli harus ada di hasil.
  - Bagian wajib dilengkapi kalau belum ada: pembuka "Behind The Candle – ", "Dimuat oleh Tim Investment Growth Specialist KISI.", dan disclaimer baku ("Semua investasi memiliki risiko. Lakukan analisis mandiri dan pahami potensi kerugian sebelum mengambil keputusan.").
  - **Penutup branding/promo:** satu paragraf 2–3 kalimat, diletakkan sebelum "Dimuat oleh…". Isi IGS tidak disentuh. Penutup promo menambah disclaimer hadiah ("Hadiah adalah bentuk apresiasi aktivitas transaksi, bukan jaminan keuntungan investasi…").
  - **Tag:** 3–4 dari isi berita, ditambah iKISI, KISI, Behind The Candle.
  - Cek wording OJK otomatis (`complianceScript` yang sudah dipakai Cek Caption).
- **Keluar:** salin teks, unduh .docx.

### 2. Brief KISI Challenge

- **Data program** diisi sekali dan disimpan di `meta` dengan kunci `cw_program`. Isinya:
  - nama dan tema, periode
  - platform (iKISI, KOINS HTS/MTS)
  - link event dan link buka rekening
  - daftar hadiah (teks + emoji)
  - kategori dan rinciannya (Umum/Universitas)
  - capaian sebelumnya
  - link aset Drive
  - daftar partner (Sahamology, Kuliah Saham, …)

  Yang boleh mengubah: editor/admin, sama seperti panduan gaya.
- **Jenis brief:**
  - **Artikel/berita ke media:** ±350 kata. Urutan mengikuti contoh: KISI dan edisi ke berapa → makna tema → periode dan platform + link buka rekening → hadiah kategori Umum (jumlah, first come first served, hadiah utama, daftar) → kategori Universitas → penutup event.kisi.co.id.
  - **SNS:** pilih satu atau lebih partner, format (single post / carousel / reels / story), platform (IG/Telegram), tanggal posting, dan highlight (bebas, mis. "hadiah utama", "banyak pilihan hadiah").
    - Hasil per partner: judul "Partner: Format + Platform", "Posting tanggal …", lalu teks per slide/frame. Untuk reels: adegan + teks layar.
    - **Hook tiap partner dibuat berbeda.**
    - Di bawahnya: "Tambahin tulisan kecil:" + 4 disclaimer baku dengan **nama partner otomatis masuk** ke kalimat "… tidak terafiliasi sebagai pegawai PT KISI dan tidak memiliki izin dari OJK", lalu "Link aset: …".
- AI hanya boleh memakai hadiah, angka, tanggal, dan link dari data program.

### 3. Press release

Dua contoh terbit (21 Okt dan 23 Nov 2026) memakai struktur yang sama persis:

1. Kop logo KISI.
2. "*PRESS RELEASE*" (miring, tebal).
3. Judul tebal.
4. Foto (opsional).
5. "**Jakarta, 23 November 2026** – PT Korea Investment And Sekuritas Indonesia (KISI) …".
6. Isi: apa/kapan/di mana/bersama siapa. Daftar tamu ditulis lengkap dengan gelar dan jabatan. Nama, acara, dan angka **tebal**, istilah asing *miring*.
7. Kutipan narasumber miring + "ujar **nama, jabatan**".
8. Paragraf komitmen KISI.
9. Ajakan/kontak tambahan dan link dokumentasi (opsional).
10. "Tentang PT Korea Investment And Sekuritas Indonesia (KISI)" (teks baku).
11. Media Contact (teks baku).

- **Input:** highlight (bebas atau per kolom: acara/pencapaian, tanggal, kota, mitra, tamu + jabatan, angka, narasumber + inti kutipan, kontak tambahan, link dokumentasi) dan foto.
- **Teks baku** "Tentang KISI" dan Media Contact disimpan di `meta` dengan kunci `cw_pr`, bisa diedit editor/admin. Isi awal "Tentang KISI" disalin dari lampiran. Media Contact awalnya kosong.
- **Aturan AI:**
  - Nama, gelar, jabatan, dan angka hanya dari highlight. Kalau kurang, hasilnya memuat daftar "perlu dilengkapi", bukan karangan.
  - Kutipan buatan AI ditandai "perlu disetujui narasumber".
- **Keluar:** .docx dengan kop, tebal/miring, dan foto.

### 4. Cek wording file (Word/Excel)

Contoh proposal KISI Challenge (EN di atas, ID di bawah, tabel biaya) menunjukkan jenis temuan yang dicari:

- **Typo:** "Adverstisement", "Termyn".
- **Kalimat EN janggal:** "Detailed of Budget", "will run … and have", "Ceremonial of".
- **Format angka campur:** "277,500,000" dan "188.700.000".
- **Bagian ID yang masih berbahasa Inggris:** kepala tabel dan Remark.
- **Hitungan total:** di contoh ini benar.

**Alur:**
- **Input:** .docx atau .xlsx. PDF boleh, tapi hanya untuk dibaca dan diberi daftar temuan, tanpa file hasil.
- **Pengolahan:** teks diambil per paragraf/sel lalu dikirim ke AI dalam potongan. Satu proposal ≈ 3–5 permintaan.
- **Daftar temuan:** lokasi (paragraf/halaman atau sheet!sel), teks asli, saran, jenis (typo, kalimat, istilah, format angka, OJK, konsistensi EN–ID, hitungan). Masing-masing bisa **Terima / Tolak**.
- **Cek tanpa AI (di kode):**
  - jumlah baris vs total di tabel
  - format angka seragam
  - angka, tanggal, dan nama sama antara bagian EN dan ID kalau dokumen punya keduanya
- **Terjemahan ID → EN:**
  - **Word:** untuk dokumen yang belum punya versi Inggris, paragraf ID disalin beserta formatnya lalu teksnya diganti terjemahan, ditempatkan sebagai bagian baru di atas bagian ID (mengikuti contoh). Kalau sudah ada bagian EN, yang dicek hanya kesesuaiannya.
  - **Excel:** terjemahan ditulis ke sheet salinan "EN".
- **File hasil:**
  - **Word (pendekatan B):** saran yang diterima ditulis sebagai Track Changes, dengan penulis "Copy Studio" dan tanggal. Bagian terjemahan baru juga ditulis sebagai sisipan (`w:ins`). Ada tombol kedua "Unduh versi bersih", yang memakai mesin yang sama tanpa tanda perubahan.
  - **Excel:** tidak punya Track Changes. Sel yang diubah hanya diganti teksnya (sharedStrings/inlineStr). Rumus, angka, dan style tidak disentuh. Ditambahkan satu sheet "Catatan Review" berisi sel / sebelum / sesudah.
- **Batasan yang disetujui:** kalau perubahan mengenai teks dengan format campuran dalam satu paragraf (mis. separuh tebal), teks pengganti mengikuti format potongan pertama.

## Yang sudah diputuskan (oleh user)

- Satu menu, sebagai tab di Copy Studio (1A).
- Word memakai Track Changes (2B). File hasil harus Word/Excel, bukan sekadar daftar.
- `COPY_AI_DAILY` = 100.
- Artikel: isi IGS tidak diubah; branding/promo hanya lewat paragraf penutup. Terbit di website KISI.
- Contoh nyata di atas adalah acuan format.

## Keputusan saya (boleh dikoreksi)

- Pilihan penutup artikel ketiga ("Tanpa tambahan") dan cek angka otomatis.
- Data program, teks baku press release, dan daftar partner disimpan di `meta` (`cw_program`, `cw_pr`), satu set aktif. Program baru menimpa yang lama.
- Excel: sheet "Catatan Review" sebagai pengganti Track Changes. Terjemahan masuk ke sheet "EN".
- Word: tombol tambahan "Unduh versi bersih".
- PDF hanya dibaca.
- Zip dibaca/ditulis dengan **JSZip dari cdnjs** (seperti SheetJS di Event & Lead), bukan pembaca buatan sendiri. SheetJS tidak dipakai untuk menulis karena versi gratisnya membuang style.
- Unduhan .docx untuk artikel, brief, dan press release dibuat dari template docx minimal (kop + style tebal/miring) di browser.
- `/api/ai` mendapat `kind` baru (`cw_article`, `cw_brief`, `cw_pr`, `cw_review`, `cw_translate`) dan memakai kuota yang sama.

## Keputusan saya setelah cek pembangun (boleh dikoreksi)

- **Terjemahan ID → EN di Word bukan otomatis.** Ada tombol "Tambah versi Inggris".
  - Dokumen dianggap **sudah dwibahasa** kalau ada paragraf penanda "ENGLISH" dan "INDONESIA" (seperti contoh). Dalam hal itu yang dilakukan hanya cek kesesuaian: paragraf dan sel dipasangkan menurut urutan di antara kedua penanda.
  - Kalau tidak ada penanda, tombol menyalin isi body (paragraf **dan tabel**, termasuk gambar di dalamnya karena memakai rId yang sama) ke atas dengan penanda "ENGLISH". Header, footer, dan section break tidak disentuh.
- **Format angka.** Temuan "format angka campur" menyarankan **format mayoritas di dokumen itu**. Di contoh, mayoritasnya titik (188.700.000), sehingga "277,500,000" disarankan menjadi "277.500.000". Di Excel yang dicek hanya **sel teks**. Sel angka dan number format tidak disentuh.
- **Kuota AI.** Setiap permintaan ke AI dihitung 1, seperti sekarang. Sebelum memproses file, halaman memperkirakan jumlah permintaan dan memberi tahu kalau sisa kuota hari ini kurang. Kalau kuota habis di tengah proses, temuan yang sudah didapat tetap tampil dengan keterangan "sebagian".
- **Artikel .docx** dibuat dari template minimal, bukan dari file IGS. Artikel ditempel ke CMS website, dan gambar diunggah terpisah di sana.
- **Teks baku** diambil persis dari contoh yang diberikan user (lampiran di bawah), tidak dikarang. **Media Contact** (nama, telepon, email pribadi) **tidak dimasukkan ke repo**. Kolomnya kosong dan diisi sekali oleh editor di layar.
- **Fixture tes** dibuat dari teks contoh di lampiran: `document.xml` sintetis kecil yang memuat "Adverstisement", "Termyn", dan tabel dengan total, ditambah `sheet1.xml` + `sharedStrings.xml` sintetis yang punya satu sel rumus.

## Lampiran: teks baku dan contoh (dari user, 24 Nov 2026)

**Disclaimer artikel IGS:** "Disclaimer: Semua investasi memiliki risiko. Lakukan analisis mandiri dan pahami potensi kerugian sebelum mengambil keputusan."
**Baris penutup artikel:** "Dimuat oleh Tim Investment Growth Specialist KISI."
**Tag tetap artikel:** iKISI, KISI, Behind The Candle.

**Disclaimer brief SNS** (judul "Tambahin tulisan kecil di setiap slide:" untuk carousel/story, "Tambahin tulisan kecil:" untuk single post):
```
Disclaimer:
● Hadiah adalah bentuk apresiasi aktivitas transaksi, bukan jaminan keuntungan investasi. Pastikan Anda memahami risiko sebelum bertransaksi.
● {Partner} tidak terafiliasi sebagai pegawai PT KISI dan tidak memiliki izin dari Otoritas Jasa Keuangan (OJK).
● PT Korea Investment And Sekuritas Indonesia Berizin dan Diawasi oleh Otoritas Jasa Keuangan.
● Semua investasi memiliki risiko. Lakukan analisis mandiri dan pahami potensi kerugian sebelum mengambil keputusan
Link aset: {link aset}
```
Disclaimer hadiah untuk penutup "bridging promo" artikel = kalimat pertama di atas.

**Tentang KISI (press release, versi 23 Nov 2026):**
> PT Korea Investment And Sekuritas Indonesia (KISI) mulai beroperasi pada tahun 2018 setelah diakuisisinya PT Danpac Sekuritas oleh Korea Investment & Securities Co., Ltd (KIS). KISI merupakan anggota PT Bursa Efek Indonesia dengan kode broker BQ dan memiliki izin usaha sebagai Perantara Pedagang Efek (PPE), Penjamin Emisi Efek (PEE), dan Agen Penjual Efek Reksa Dana (APERD) yang diterbitkan oleh Otoritas Jasa Keuangan, serta memiliki izin Shariah Online Trading System (SOTS) yang disertifikasi oleh DSN-MUI.
>
> Didukung oleh pengalaman dan reputasi KISI sebagai salah satu perusahaan sekuritas besar asal Korea Selatan yang berdiri sejak 1974, KISI berkomitmen untuk menjadi perusahaan sekuritas terpercaya dan inovatif di Indonesia dengan menghadirkan berbagai solusi investasi yang inovatif dan berorientasi pada kebutuhan nasabah, termasuk layanan investasi berbasis syariah. Untuk informasi lebih lanjut, kunjungi www.kisi.co.id.

**Data program awal (KISI Challenge: Beyond Tomorrow):**
- Periode: 1 Oktober–30 November 2026. Platform: iKISI dan KOINS (HTS/MTS). Link event: event.kisi.co.id. Buka rekening: https://kisi.co.id/ikisi/download.
- Hadiah Umum: 219 hadiah, first come first served. Daftar: 🚙 BYD Denza D9 (utama), 🚗 Jaecoo J5 EV Premium, 🏍️ Honda Forza 250, ✈️ Korea Trip 2 Pax (Pesawat & Hotel 5D4N), 📱 iPhone 17 Pro 256GB, ⌚ Apple Watch Series 11, 🎧 AirPods Pro Gen 3, 💰 KIM Money Market Fund Rp1 Juta & Rp500 Ribu.
- Universitas: total hadiah > Rp25 juta. Kategori Universitas: Pembukaan Akun Terbanyak, Peserta Terbanyak, Rata-rata Profit Terbanyak, Transaksi Terbanyak. Kategori Individu: Profit Terbesar.
- Capaian sebelumnya: 10.000 peserta (KISI Challenge pertama 2026). Partner: Sahamology, Kuliah Saham. Link aset: diisi user.

**Contoh format** (acuan prompt, sudah diringkas di bagian per jenis): artikel "Deal Indonesia-Eropa" (23 Nov 2026), brief media KISI Challenge, brief carousel 4 slide, brief single post Sahamology & Kuliah Saham, press release 21 Okt & 23 Nov 2026, proposal KISI Challenge EN/ID.

## Diserahkan ke pembangun

- Tata letak formulir, potongan teks per permintaan AI, dan bentuk prompt.
- Cara memetakan temuan AI kembali ke run di XML (pakai teks asli sebagai jangkar; kalau jangkar tidak ketemu, temuan tetap tampil tapi tidak bisa diterapkan otomatis).
- Urutan pembangunan yang diusulkan: Artikel → Cek wording → Brief → Press release.
- Tes di `apps/copy-studio/test.mjs`:
  - prompt baru
  - cek angka artikel
  - penerapan Track Changes ke `document.xml` contoh
  - penggantian sel Excel tanpa menyentuh rumus
  - nama partner masuk ke disclaimer
