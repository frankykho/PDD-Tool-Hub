# Pusat Tutorial Aplikasi

Halaman tutorial penggunaan aplikasi untuk nasabah, plus form usulan dan halaman admin untuk tim. Data tutorial disimpan di Firebase Firestore, gambar disimpan di folder `site/images/` repo ini, dan situsnya disajikan Worker Cloudflare `tutorial` (static assets, gratis).

## Isi folder

| File | Fungsi |
|---|---|
| `worker.js` | Menyajikan isi `site/` dan menyisipkan `window.PROFILE` (dari profile.json) ke halaman HTML |
| `wrangler.jsonc` | Konfigurasi Worker (`assets` = folder `site/`) |
| `firestore.rules` | Aturan keamanan database, **dipasang manual di Firebase Console** |
| `site/index.html` | Halaman tutorial untuk nasabah |
| `site/submit.html` | Form usulan tutorial (khusus tim, login lewat Tool Hub) |
| `site/admin.html` | Review usulan & kelola tutorial (login lewat Tool Hub) |
| `site/hub-auth.js` | Login lewat Tool Hub |
| `site/image-utils.js` | Mengecilkan gambar sebelum dikirim |
| `site/github-store.js` | Menyimpan gambar ke repo lewat Tool Hub (dipakai admin) |
| `site/github-config.js` | Repo, branch, folder gambar (dari profil) |
| `site/firebase-config.js` | Konfigurasi Firebase (dari profil) |
| `site/images/` | Gambar tutorial yang sudah disetujui |

Hanya isi `site/` yang bisa dibuka publik. `worker.js`, `wrangler.jsonc`, `firestore.rules`, dan README ini tidak tersaji.

## Pengaturan di profile.json

- `app.name` — nama aplikasi yang dibahas (judul halaman, teks "Panduan ..."). Kosong = "Aplikasi".
- `brand.company`, `brand.license` — baris izin di bawah daftar tutorial. Kosong = baris disembunyikan.
- `tools.tutorial.firebase` — objek `firebaseConfig` dari Firebase Console (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
- `github.repo`, `github.branch` — repo proyek ini, tempat gambar disimpan.
- Alamat Tool Hub dan alamat tutorial diisi otomatis oleh `scripts/deploy.mjs`.

## Cara pasang

1. **Deploy:** `node scripts/deploy.mjs tutorial` (atau otomatis lewat GitHub Actions setiap ada commit ke `apps/**`).
2. **Pasang aturan keamanan:** Firebase Console → Firestore Database → Rules → hapus isi lama, tempel isi `firestore.rules`, klik **Publish**.
3. **Sambungkan ke Tool Hub:** pasang secret `FIREBASE_SA` (kunci service account Firebase) dan `GITHUB_TOKEN` di Tool Hub. Token GitHub: fine-grained, **Only select repositories** → repo proyek ini, **Contents: Read and write**.
4. **Tes:** kirim satu usulan bergambar lewat tab Tutorial di Tool Hub, setujui di Admin, tunggu ±2–3 menit, cek di halaman tutorial.

## Akses tim

Form usulan dan halaman admin hanya bisa dibuka dari dashboard Tool Hub. Siapa yang boleh mengirim usulan dan siapa admin diatur di halaman Admin Tool Hub (tool **Tutorial**: "Kirim usulan" atau "Admin"). Tool Hub memberi tiket Firebase berisi peran itu; aturan di `firestore.rules` membacanya.

## Alur gambar

1. Pengusul memilih screenshot → gambar dikecilkan di HP-nya (maks lebar 1080px, WebP).
2. Saat usulan dikirim, screenshot disimpan **tertutup** di Firestore (koleksi `pending_images`). Hanya admin yang bisa melihat, publik tidak bisa.
3. Admin menyetujui → semua screenshot usulan itu disimpan ke `apps/tutorial/site/images/` di repo dalam satu commit (lewat Tool Hub), lalu data sementaranya dihapus.
4. Admin menolak → usulan dan screenshot-nya langsung dihapus. Gambar tidak pernah sempat tampil publik.

Commit gambar memicu deploy otomatis worker `tutorial`. Selama deploy berjalan (±2–3 menit), halaman tutorial menampilkan "Gambar sedang disiapkan" dan mencoba memuat ulang otomatis. Alamat gambar: `<alamat tutorial>/images/<tahun-bulan>/<nama>.webp`.

## Soal token GitHub

- Token **tidak pernah** ditulis di file mana pun di repo dan tidak pernah sampai ke browser. Token hanya ada di secret `GITHUB_TOKEN` Tool Hub.
- Tool Hub hanya meneruskan operasi untuk menambah gambar, dan menolak memajukan branch kalau commit-nya mengubah berkas di luar folder gambar tutorial.
- Token fine-grained punya masa berlaku. Kalau habis, admin akan melihat pesan "Token ... tidak valid". Buat token baru lalu pasang ulang secret-nya.

## Link langsung ke tutorial

Buka tutorialnya, lalu tekan **Bagikan** di kanan atas. Formatnya:

```
<alamat tutorial>/#/k/<id-kategori>/<id-topik>/1
```
