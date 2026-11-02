# Hapus deck presentasi (Brand Kit) — desain singkat

**Kenapa:** admin perlu membuang deck tes dan salah unggah sampai bersih. Saat ini hanya ada **Tarik** (deck resmi, riwayat tetap) dan **Minta revisi** (pengajuan tetap ada), jadi sampah tetap tampil di daftar.

**Tujuan:** admin hub bisa menghapus satu deck beserta semua versinya dalam status apa pun (unggah, menunggu, revisi, resmi, arsip, ditarik).

**Bukan tujuan:** hapus per versi; tombol untuk Head Regional atau pengaju; memulihkan dari Brand Kit.

## Pendekatan

- **A. Hapus bersih (dipilih):** baris `decks`, `deck_versions`, `deck_log` milik deck dihapus; file Drive tiap versi masuk Trash (bisa dipulihkan dari Drive 30 hari). Tidak ada sisa di daftar maupun database.
- B. Sembunyikan (tanda dihapus): bisa dikembalikan, tetapi data dan file tes menumpuk. Ditolak.

## Perilaku

- Siapa: hanya admin hub (`me.adm`). Head Regional dan pengaju mendapat 403.
- Tombol **Hapus** (gaya bahaya) di baris deck untuk admin: daftar deck resmi dan daftar pengajuan. Konfirmasi: "Hapus deck "<judul>" beserta semua versinya? File masuk Trash Google Drive." Tanpa alasan wajib.
- `POST /api/decks/delete { deck_id }` (same-origin seperti POST lain).
- Urutan: semua file versi yang masih punya `file_id` dan belum `trash` dibuang ke Trash Drive dulu. File yang sudah tidak ada (404) dianggap beres. Bila Drive gagal karena hal lain, tidak ada yang dihapus di D1 dan admin melihat pesan galat Drive biasa, lalu bisa mengulang (*keputusan saya*: lebih baik gagal utuh daripada file yatim di Drive).
- Setelah file beres: hapus `deck_versions`, `deck_log`, `decks` untuk deck itu dalam satu batch.
- `deck_downloads` tidak dihapus; di Pemakaian tampil sebagai "(deck terhapus)".
- Dampak lain otomatis: hilang dari daftar sales, pengajuan, panel beranda Tool Hub (menunggu, keputusan, pemberitahuan diganti/ditarik).

## Untuk pembuat

- Tes di `apps/brand-kit/deck.test.mjs`: 403 untuk HEAD/IGS; admin menghapus deck dengan versi resmi + arsip + menunggu → baris D1 hilang, semua file Drive `trashed`, unduhan lama tetap, `/deck/<versi>` 404; Drive gagal → 502 dan tidak ada yang terhapus; file Drive yang sudah hilang (404) tidak menghalangi.
- Kunci i18n baru untuk teks tombol, konfirmasi, dan pesan berhasil.
