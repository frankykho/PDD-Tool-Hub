# Laporan Copywriter (Content Planner + Email Studio) — design

## Maksud
Copywriter KISI butuh laporan pekerjaannya — **artikel** (website KISI & media partner), **email blast**, dan
**video YouTube** — dengan gambar tiap pekerjaan dan angkanya, tanpa banyak isian manual: cukup tempel link, gambar
diambil otomatis; email blast tercatat dari Email Studio. Dibangun di Content Planner (kegiatan, link pelacak klik,
gambar `item_img`, dan template laporan PDF/PPT sudah ada), sejalan dengan Laporan IG (spec 2026-11-09-laporan-ig).

## Tujuan
1. Tempel link artikel / YouTube di kegiatan → gambar sampul / thumbnail tersimpan otomatis (tanpa unggah).
2. YouTube: views, like, comment otomatis (YouTube Data API).
3. Artikel: klik dari link pelacak otomatis; jumlah pembaca diketik (boleh kosong).
4. Email blast: tombol "📅 Catat ke Planner" di Email Studio membuat kegiatan berisi template, subject, tanggal, dan
   gambar email (potret pratinjau). Ukuran hasil = klik banner lewat link pelacak Planner.
5. Laporan baru "Laporan Copywriter" (PDF/PPT 16:9): bagian Artikel, Email blast, YouTube; kartu bergambar + angka.

## Bukan tujuan
- Angka terkirim / dibuka / diklik dari aplikasi pengirim email (user: cukup klik banner).
- Pembaca artikel otomatis dari Google Analytics (tidak ada akses GA) — bisa ditambah kelak.
- Pembaca artikel di media partner otomatis (data milik media).
- Gambar dari link Instagram lewat server (diblokir IG; tetap bookmark / manual).
- Jadwal otomatis (cron) untuk menyegarkan angka — angka diambil saat link disimpan dan saat laporan dibuat
  (aturan user: tanpa otomatisasi terjadwal kecuali diminta).

## Anti-tujuan
- Email blast tercatat dobel karena HTML disalin berkali-kali saat revisi → pencatatan hanya lewat tombol khusus,
  tidak menempel di "Salin HTML".
- Link apa saja bisa dipakai menembak alamat internal (SSRF) lewat pengambil gambar → hanya https publik, ukuran dibatasi.

## Pendekatan (dipilih: A)
- **A. Email Studio mencatat ke Planner (dipilih).** Tombol "📅 Catat ke Planner" → browser memotret bagian atas
  pratinjau email (html2canvas 1.4.1 dari cdnjs, sudah dipakai Story Generator & Market Recap) → Email Studio server
  meneruskan ke Planner lewat service binding `PLANNER` + `/__hub/item` (pola Content Insight → Planner).
  Catatan: rencana awal "ambil banner email" diganti potret pratinjau karena template Market Insight, Penawaran
  Obligasi, Reminder, Weekly tidak punya kolom gambar banner.
- B. Semua dicatat manual di Planner (pilih template, unggah screenshot). Ditolak user: gambar tidak otomatis.

## Rancangan
### Content Planner
1. **Gambar dari link.** `GET /api/linkimg?url=` (login, bukan regional): https saja; YouTube → thumbnail
   `https://i.ytimg.com/vi/<id>/hqdefault.jpg`; lainnya → ambil HTML (maks. ±1,5 MB, timeout 10 dtk), baca
   `og:image` / `twitter:image`, lalu ambil gambarnya (image/jpeg|png|webp, maks. 5 MB) dan kembalikan apa adanya.
   Browser mengecilkannya ke 480px (`shrinkImg` yang sudah ada) lalu `POST /api/img`. Dipanggil otomatis setelah
   kegiatan berlink disimpan bila belum punya gambar (bukan link Instagram), dan lewat tombol "↻ Ambil dari link" di
   kotak gambar. Kotak gambar (`#mImgBox`) dipakai untuk semua kegiatan yang punya grup Performa.
2. **YouTube.** Secret opsional `YOUTUBE_API_KEY` di Planner. `POST /api/yt/refresh {ids}`: untuk kegiatan YouTube
   (link youtube.com/youtu.be) ambil `videos.list?part=statistics` (maks. 50 id per panggilan) → isi `m_views`,
   `m_likes`, `m_comments` (COALESCE, sumber `m_src='yt'`). Dipanggil setelah kegiatan YouTube disimpan dan saat
   Laporan Copywriter disusun. Tanpa key: diam, angka manual tetap jalan; dialog menampilkan catatan kecil.
3. **Artikel.** Grup Performa untuk artikel menampilkan "Pembaca" (kolom `m_views`) + klik link pelacak (sudah ada).
4. **Email blast** = kegiatan jenis Artikel, kanal "Email / Newsletter", kolom baru `email_tpl TEXT` (nama template).
   `/__hub/item` menerima `img` (data URL, `imgOk`) → `item_img`.
5. **Laporan Copywriter** (`rType` "cw"): periode (bawaan bulan lalu); isinya **hanya kegiatan yang PIC-nya
   (`owner_email`) ber-role Copywriter** (`copy`, keputusan user); filter Orang berisi anggota ber-role Copywriter
   (tidak mengikuti pilihan Tim).
   Isi: sampul; ringkasan (jumlah artikel, email blast, video; total klik, pembaca, views YouTube); lalu bagian
   **Artikel** (kartu: gambar, tanggal, judul, kanal Website/Blog = internal atau Media partner = eksternal, Pembaca,
   Klik), **Email blast** (gambar, tanggal kirim, subject, template, Klik), **YouTube** (thumbnail, tanggal, judul,
   Views, Suka, Komentar, Klik). Bagian kosong ditulis "Belum ada … di periode ini." Memakai blok `posts`
   (Laporan IG) — jumlah angka per kartu boleh 2–6.

### Email Studio
6. Tombol "📅 Catat ke Planner" di bar ekspor, ditekan **sebelum email dikirim** (link pelacak hanya bisa dibuat
   untuk kegiatan yang sudah ada):
   - Dialog kecil: tanggal kirim (bawaan hari ini), subject (dari isian), **URL tujuan banner/CTA** (bawaan = isi
     kolom link banner/CTA template saat ini).
   - Email Studio server → Planner (service binding `PLANNER`, `x-hub-key: SSO_SECRET`, atas nama user yang login
     `by: {email, name, job}`): buat kegiatan email blast **atau perbarui** kegiatan yang tercatat untuk draft ini
     (id kegiatan disimpan di draft Email Studio), lalu buat link pelacak `…/go/<kode>` ke URL tujuan itu (link yang
     sudah ada untuk kegiatan itu dipakai ulang bila tujuannya sama).
   - Link pendek **dipasang otomatis** ke kolom link banner/CTA template, pratinjau diperbarui, lalu html2canvas
     memotret pratinjau (lebar 600px, tinggi maks. 900px, JPEG 0.8, ≤ 700 KB) dan gambarnya dikirim ke kegiatan.
   - Menekan lagi untuk draft yang sama = memperbarui kegiatan yang sama (tanpa catatan dobel).
   - Planner butuh jalur hub untuk memperbarui kegiatan email & membuat link pelacak (perluasan `/__hub/item`).
   - Bila gambar dari host luar tidak ikut terpotret (CORS), Email Studio memakai proxy gambar kecil (https publik
     saja, batas ukuran) — dicek di awal pengerjaan.

## Keputusan yang saya ambil (bisa dikoreksi)
- Email blast tetap jenis Artikel (kanal Email / Newsletter sudah ada), bukan jenis kegiatan baru.
- Klik = link pelacak Link & QR Studio yang dipasang copywriter di banner (fitur yang sudah ada).
- Potret email = bagian atas email (maks. 900px), cukup untuk kartu laporan.
- Siapa yang boleh membuat Laporan Copywriter: sama dengan laporan lain di dialog Laporan (bukan tim regional).
- Alur "Catat ke Planner" sebelum kirim + link banner diganti otomatis: usulan saya (belum dijawab tegas user).

## Untuk pembangun
- Teks UI baru + English di i18n.js masing-masing tool; literal `</script>` dalam string JS ditulis `<\/script>`.
- Test: `node apps/content-planner/test.mjs` (linkimg: tolak http/non-gambar; yt refresh dengan fetch tiruan;
  `/__hub/item` dengan img); Email Studio: test yang ada di folder itu bila ada.
- Cara membuat `YOUTUBE_API_KEY` (Google Cloud → API YouTube Data v3 → Credentials → API key) ditulis di komentar
  kepala worker Planner; secret dipasang lewat `wrangler secret put` / skrip deploy yang ada.
