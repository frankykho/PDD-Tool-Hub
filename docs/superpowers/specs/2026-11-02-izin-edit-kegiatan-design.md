# Izin mengubah kegiatan kalender (Content Planner) — desain singkat

**Kenapa:** sekarang semua anggota bisa mengubah kegiatan siapa pun di kalender. User mau kegiatan hanya diubah oleh orang yang berkepentingan; admin (user) tetap bisa mengubah semuanya.

**Aturan (disetujui user):**
- Boleh mengubah kegiatan: **pembuat** (`created_email`), **PIC** (`owner_email`), **desainer visual** (`d_who`, bila `d_need`), dan **admin hub** (`me.adm`).
- Orang lain: hanya melihat dan berkomentar.
- Hapus kegiatan: pembuat dan admin (sudah begitu sekarang, tidak berubah).
- Membuat kegiatan baru: tetap semua anggota seperti sekarang.

**Pendekatan:** dicek di server dalam `saveItem` (satu-satunya jalur simpan form, geser tanggal, dan ubah massal). Halaman ikut mengunci form untuk orang yang tidak berhak. Hanya menyembunyikan tombol di halaman ditolak karena bisa ditembus lewat permintaan langsung.

**Tetap seperti sekarang (tidak lewat aturan ini):** persetujuan konten (`/api/approval`), komentar, impor angka performa CSV Meta (`/api/metrics/import`), impor rencana galeri, sinkron Event & Lead (`/__hub/*`). Aturan lain di `saveItem` (tim regional, hak Program) tetap berlaku di atas aturan ini.

## Perilaku

- Kegiatan yang sudah ada disimpan oleh orang yang tidak berhak -> ditolak (403) dengan pesan "Hanya pembuat, PIC, desainer, atau admin yang bisa mengubah kegiatan ini." Dicek terhadap data lama (`prev`), jadi orang tidak bisa memasukkan dirinya sebagai PIC lalu menyimpan.
- PIC / desainer boleh mengubah semua kolom seperti sebelumnya, termasuk mengganti PIC (*keputusan saya*: tidak menambah aturan per kolom).
- Halaman: bila tidak berhak, form kegiatan tampil hanya-lihat (tanpa Simpan, tanpa Hapus), kegiatan tidak bisa digeser di kalender, dan muncul keterangan singkat siapa yang bisa mengubah. Komentar tetap bisa.
- Pencocokan email tanpa membedakan huruf besar/kecil. Kegiatan lama tanpa `created_email` (saat ini tidak ada, 0 dari 19) hanya bisa diubah PIC, desainer, dan admin (*keputusan saya*).

## Untuk pembuat

- Fungsi murni `canEditItem(me, item)` di `apps/content-planner/worker.js`, dipakai `saveItem`; halaman memakai aturan yang sama (`created_email`, `owner_email`, `d_need`+`d_who`, `adm`).
- Tes di `apps/content-planner/test.mjs`: anggota lain 403 dan data tidak berubah; pembuat, PIC, desainer, admin berhasil; orang yang menambahkan dirinya sebagai PIC tetap ditolak; persetujuan dan impor CSV tetap jalan untuk bukan pembuat.
- Kunci i18n baru untuk pesan dan keterangan.
