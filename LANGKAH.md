# Langkah Pindah ke Akun Baru

Semua langkah di bawah gratis. Perintah dijalankan di terminal dari folder proyek ini. Node.js sudah terpasang di laptop.

## 1. Siapkan akun

1. **Cloudflare:** buat akun baru di dash.cloudflare.com (paket Free).
   Buka **Workers & Pages**, lalu pilih nama subdomain `workers.dev`, misalnya `namaanda`.
2. **GitHub:** buat repo baru yang **Public** dan masih kosong, tanpa README. Contoh nama: `tool-hub`.
3. Isi dua kolom di `profile.json`:
   - `"subdomain": "namaanda"`
   - `"github": { "repo": "usernameanda/tool-hub", "branch": "main" }`

## 2. Pindahkan data dari akun lama

Data yang dipindah adalah akun pengguna Tool Hub, data reksa dana, promo kompetitor, artikel edukasi, sinyal SATS, riwayat obligasi, dan draf.

```bash
npx wrangler login                       # pilih akun Cloudflare LAMA di browser
node scripts/migrate.mjs list            # tampilkan database & KV lama
```
Buka `.migrate/map.json`. Ganti setiap `NAMA_LAMA` dengan nama dari daftar tadi dan hapus baris yang tidak punya padanan.

```bash
node scripts/migrate.mjs export          # unduh data lama ke folder .migrate/
npx wrangler logout
npx wrangler login                       # sekarang pilih akun Cloudflare BARU
node scripts/deploy.mjs                  # buat semua tool, database & KV di akun baru
node scripts/migrate.mjs import          # masukkan data lama
```

## 3. Isi secret

1. Salin `.secrets.example.json` menjadi `.secrets.json`, lalu isi:
   - **SSO_SECRET**: teks acak minimal 32 karakter. Buat yang baru, misalnya hasil `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`.
   - **GITHUB_TOKEN** (hub, sats) dan **GH_TOKEN** (storydata): satu *fine-grained token* GitHub boleh dipakai untuk ketiganya. Buat di GitHub, lalu batasi hanya ke repo baru dengan izin **Contents: Read and write** dan **Actions: Read and write**.
   - **FIREBASE_SA** (hub): isi berkas service account Firebase proyek Tutorial.
   - **ADMIN_KEY**, **EDIT_KEY**, **NOTIFY_WEBHOOK**, **ANTHROPIC_API_KEY**: opsional. Pakai nilai lama kalau masih ada.
2. Kirim secret ke setiap tool:
   ```bash
   node scripts/deploy.mjs secrets
   ```

## 4. Hubungkan GitHub

1. **Gambar Tutorial:** `apps/tutorial/site/images/` berisi tangkapan layar aplikasi lama. Hapus dulu kalau tidak ingin gambar itu terlihat publik. Tutorial yang memakai gambar tersebut nanti perlu diunggah ulang gambarnya.
2. **Kirim kode ke GitHub.** Ganti dulu identitas commit dengan akun GitHub Anda:
   ```bash
   git config user.name "username-github-anda"
   git config user.email "ID+username@users.noreply.github.com"   # lihat GitHub → Settings → Emails
   git commit --amend --reset-author --no-edit
   git remote add origin https://github.com/usernameanda/tool-hub.git
   git push -u origin main
   ```
3. **Secret repo:** di GitHub, buka repo → **Settings → Secrets and variables → Actions**, lalu tambahkan:
   - `CLOUDFLARE_API_TOKEN`: buat di Cloudflare lewat **My Profile → API Tokens → Create Token**. Pakai template **Edit Cloudflare Workers**, lalu tambahkan izin **D1: Edit**.
   - `CLOUDFLARE_ACCOUNT_ID`: ada di dashboard Cloudflare, di sisi kanan halaman Workers & Pages.
   - `PROFILE_JSON`: seluruh isi `profile.json`.
4. **Izin workflow:** buka **Settings → Actions → General → Workflow permissions**, lalu pilih **Read and write permissions**.
5. **Jalankan sekali secara manual** (tab **Actions**): **Buat PDF produk**, **Data IDX** (mode `calendar`), dan **EOD SATS**. Untuk EOD SATS, centang `full` kalau data SATS tidak ikut dipindah.

## 5. Firebase (Tutorial)

1. Firebase Console → **Authentication → Settings → Authorized domains**. Tambahkan `tutorial.<subdomain>.workers.dev` dan `tool-hub.<subdomain>.workers.dev`.
2. Alamat gambar tutorial lama masih menunjuk ke alamat lama. Buka halaman admin Tutorial dan tekan **Pindahkan gambar lama**. Lakukan selagi situs lama masih hidup.

## 6. Coba & pindah

1. Buka `https://tool-hub.<subdomain>.workers.dev`, login, lalu buka setiap tool.
2. **Bookmarklet perlu dipasang ulang** (tarik lagi ke bookmark bar):
   - Content Insight: "Simpan ke Content Insight"
   - Story Generator: Foreign Lens, Wrap, Kalender
3. Bagikan alamat Tool Hub yang baru ke tim.
4. Setelah semuanya berjalan sekitar seminggu:
   - Hapus worker di akun lama.
   - Hapus folder `.migrate/` (berisi data asli).
   - Folder lama `D:\Franky Project` boleh dihapus.

## Sehari-hari

- Ubah kode lalu `git push`; tool yang berubah otomatis di-deploy.
- Ubah `profile.json` (misalnya ganti logo atau link): perbarui juga secret `PROFILE_JSON` di GitHub, lalu jalankan `node scripts/deploy.mjs`.
