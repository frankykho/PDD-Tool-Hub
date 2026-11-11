# Banner What's New dengan mockup HP — desain

Tanggal: 2026-11-10 · Tool: Copy Studio (apps/copy-studio), tab **What's New**

## Maksud & alasan
Setiap ada fitur baru di aplikasi iKISI, tim butuh banner 1920×1080 dengan mockup HP berisi screenshot fitur. Sekarang belum ada desain sama sekali dan banner dibuat manual. Yang diminta user: **cukup upload screenshot dan isi teks, banner jadi otomatis** dari template tetap.

## Tujuan
- Banner PNG **1920×1080** dibuat di tab What's New Copy Studio.
- Upload **1–3 screenshot**; tiap screenshot otomatis masuk ke layar HP (sudut layar ikut membulat).
- **11 susunan × 2 latar** = 22 kombinasi, dipilih per banner, pratinjau langsung, lalu unduh.
- Teks terisi otomatis dari hasil What's New (bisa diedit).

## Bukan tujuan
- Ukuran lain (story, feed, dsb.) — hanya 1920×1080.
- Menyimpan banner/screenshot di server atau D1. Tidak ada riwayat banner.
- Editor bebas (geser-geser elemen, ganti warna/font). Template tetap.
- Mengatur template lewat menu admin (pilihan pendekatan 2 ditolak).

## Anti-tujuan (gagal walau "jalan")
- Screenshot sampai ke server/pihak luar (fitur belum rilis = rahasia).
- Logo selain logo resmi `brand/ikisi-color.png` / `brand/ikisi-white.png`.
- Teks keluar dari banner atau menabrak HP; judul terpotong tanpa tanda.
- Hasil berbeda antar-PC karena font cadangan dipakai diam-diam.
- Mockup HP yang meniru merek/model HP tertentu (bentuk generik saja).

## Keputusan user (dari diskusi)
- Tempat: tab What's New di Copy Studio, di bawah hasil teks.
- Ukuran: 1920×1080 saja.
- Mockup HP digambar sendiri (bingkai generik), tidak ada file mockup.
- Latar **terang** = gradasi putih → hijau muda (#ffffff → #e8f4ee), teks hijau #136F4A, label "FITUR BARU" hijau dengan huruf putih, logo `ikisi-color.png`.
- Latar **gelap** = G2: hijau tua radial (cahaya #1a6b48 di belakang HP → #0d3b28 → #08261a), teks putih, label oranye #F5A623 dengan huruf #17251d, logo `ikisi-white.png`.
- **Logo iKISI lebih kecil** dari contoh pertama (tinggi ±76 px di 1920×1080, dibesarkan lagi 11 Nov 2026 atas permintaan user; judul 104 px, penjelasan 44 px, label 34 px) di semua template.
- Susunan (semua dipakai, semua bisa kiri/kanan; teks & logo pindah ke sisi seberang HP):
  1. 1 HP tegak, sedikit terpotong bawah — kanan / kiri
  2. 1 HP miring ±8°, terpotong bawah — kanan / kiri
  3. 1 HP utuh (tidak terpotong) — kanan / kiri
  4. 2 HP bertumpuk (HP 2 lebih tinggi, menutup tepi HP 1) — kanan / kiri
  5. 3 HP kipas (HP 2 depan & besar, HP 1 & 3 miring ±6° di belakang) — kanan / kiri
  6. 3 HP tengah: judul di atas tengah, tiga HP berjajar di bawah terpotong; **tanpa kalimat penjelasan**
- Upload screenshot → terisi otomatis; kalau rasio beda dari layar HP, dipotong (cover) **rata atas** supaya bagian atas utuh.
- Isi teks: label (default "FITUR BARU"), judul fitur, satu kalimat penjelasan. Judul & penjelasan terisi dari hasil What's New (judul fitur & deskripsi singkat), bisa diedit; bisa juga diisi manual tanpa menjalankan AI.
- Tanpa disclaimer dan tanpa logo perusahaan (banner fitur aplikasi, bukan materi produk).
- Mockup referensi yang disetujui: `.superpowers/brainstorm/1430-1794282215/content/posisi.html`, `multi-hp.html`, `gelap.html` (G2), `layout.html` (C).

## Pendekatan
1. **Digambar di browser, di tab What's New (dipilih).** Canvas 2D di halaman; HP, latar, teks digambar kode. Screenshot tidak keluar dari browser, tidak ada perubahan D1. Kekurangan: ubah posisi/warna = ubah kode.
2. Perluas mesin template Brand Kit dengan kotak "layar HP", 22 template diatur di admin. Ditolak: mesin belum bisa memutar gambar (miring/kipas), latar harus disiapkan sebagai file, letaknya terpisah dari What's New, kerja ±2×.
3. (Dibuang) Render HTML → gambar pakai pustaka html2canvas: tambah dependensi, hasil kurang andal.

## Perilaku
- Kontrol: jumlah HP (1/2/3) → daftar susunan yang cocok; sisi kiri/kanan (tidak tampil untuk "3 HP tengah"); latar terang/gelap; label; judul; penjelasan; slot upload sesuai jumlah HP (urutan = nomor HP 1–3).
- Pratinjau diperbarui setiap ada perubahan; HP tanpa screenshot tampil sebagai layar abu-abu polos (banner tetap bisa dilihat, tombol unduh mengingatkan slot yang kosong).
- Teks terlalu panjang: ukuran huruf mengecil sampai batas minimum; kalau tetap tidak muat, beri peringatan (bukan dipotong diam-diam). Panjang judul mengikuti batas `wn_title` (40) dan penjelasan `wn_short` (150) di `shared/compliance.js`; badge cek panjang/kepatuhan yang sudah ada boleh dipakai ulang.
- Unduh: PNG 1920×1080, nama file dari judul fitur.
- Font: Inter (sama dengan Brand Kit, dimuat dari Google Fonts); tunggu font siap sebelum menggambar supaya hasil sama di semua PC.
- Isian banner diingat di browser (localStorage) seperti isian What's New lain; screenshot tidak disimpan.

## Keputusan Claude (bukan dari user — mohon dicek)
- **Sinkron teks:** isian banner punya kolom sendiri. Setiap hasil What's New baru mengisi judul & penjelasan banner **hanya kalau kolomnya masih kosong**; ada tombol "Ambil dari hasil What's New" untuk menimpa dengan sengaja. Suntingan user tidak pernah hilang diam-diam.
- **Teks tidak muat:** judul maks. 3 baris, penjelasan maks. 3 baris (2 baris di susunan tanpa ruang); huruf mengecil sampai 60% ukuran awal. Kalau tetap tidak muat: peringatan di pratinjau dan **tombol unduh ditolak** sampai teks dipendekkan — tidak ada PNG dengan teks terpotong.
- **Bahasa:** isi banner (termasuk label bawaan "FITUR BARU") selalu Bahasa Indonesia apa adanya, tidak ikut diterjemahkan saat tampilan hub berbahasa Inggris; hanya label kontrol/tombol yang masuk `i18n.js`.
- Slot screenshot kosong saat unduh: minta konfirmasi dulu. Font gagal dimuat: unduh ditolak dengan pesan.

## Diserahkan ke pembangun
- Angka pasti posisi/ukuran/rotasi tiap susunan (ikuti mockup referensi), bentuk bingkai HP (sudut, notch, bayangan).
- Cara menyajikan logo ke halaman (mis. folder `assets/brand` seperti tool lain, atau data URI) — asal dari salinan logo resmi di `brand/`.
- Struktur kode & pengujian: geometri susunan sebaiknya fungsi murni yang bisa diuji di `apps/copy-studio/test.mjs`.
- Teks Inggris di `apps/copy-studio/i18n.js` untuk semua string baru (cek `node scripts/i18n-check.mjs`).
