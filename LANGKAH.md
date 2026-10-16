# Langkah Pindah ke Akun Baru

Panduan ini memindahkan semua tool (Tool Hub, Fund Insight, Story Generator, SATS, dan lainnya) dari akun Cloudflare **lama** ke akun Cloudflare **baru**, beserta datanya. Semua layanan yang dipakai gratis.

Kerjakan **berurutan dari atas ke bawah**. Setiap bagian punya tanda **✅ Berhasil kalau…** supaya Anda tahu kapan boleh lanjut. Kalau muncul error, lihat bagian [Kalau ada masalah](#kalau-ada-masalah) di paling bawah.

Waktu yang dibutuhkan: sekitar 1–2 jam.

---

## 0. Persiapan: cara menjalankan perintah

Hampir semua langkah berupa **perintah** yang diketik di **terminal**. Caranya:

1. Buka folder proyek ini di **VS Code** (`D:\Franky Tool Hub Project`).
2. Buka terminal: menu **Terminal → New Terminal** (atau tekan <kbd>Ctrl</kbd> + <kbd>`</kbd>). Panel hitam/putih muncul di bagian bawah.
3. Pastikan tulisan di depan kursor berakhir dengan `D:\Franky Tool Hub Project>`. Kalau bukan, ketik ini lalu tekan <kbd>Enter</kbd>:
   ```
   cd "D:\Franky Tool Hub Project"
   ```
4. Untuk setiap perintah di panduan ini: **salin satu baris**, tempel di terminal (klik kanan atau <kbd>Ctrl</kbd> + <kbd>V</kbd>), lalu tekan <kbd>Enter</kbd>. Tunggu sampai selesai (kursor muncul lagi) sebelum menjalankan perintah berikutnya.

> **Catatan:** teks setelah tanda `#` di dalam kotak perintah hanyalah penjelasan. Tidak perlu ikut disalin.

Sekali saja di awal, pasang alat yang dibutuhkan:
```
npm install
```
✅ **Berhasil kalau** muncul tulisan seperti `added 50 packages` dan tidak ada tulisan `ERR!`.

---

## 1. Siapkan akun baru

### 1a. Akun Cloudflare baru

1. Buka <https://dash.cloudflare.com/sign-up> dan daftar dengan email baru. Pilih paket **Free**.
2. Setelah masuk, klik **Workers & Pages** di menu kiri (kadang ada di bawah **Compute**).
3. Di sisi kanan halaman ada bagian **Subdomain**. Klik **Set up** atau **Change**, lalu isi nama pendek, misalnya `frankykho`. Gunakan huruf kecil, angka, atau tanda `-` saja, tanpa spasi.
4. **Catat nama subdomain ini.** Nanti alamat tool menjadi `https://tool-hub.<subdomain>.workers.dev`.

### 1b. Repo GitHub baru

1. Masuk ke <https://github.com> (buat akun kalau belum punya).
2. Klik tombol **+** di kanan atas → **New repository**.
3. Isi **Repository name**, misalnya `tool-hub`.
4. Pilih **Public**.
5. **Jangan** centang "Add a README file", dan biarkan .gitignore dan license berisi "None". Repo harus benar-benar kosong.
6. Klik **Create repository**.
7. Catat nama lengkapnya dalam format `username/nama-repo`, misalnya `frankykho/tool-hub`.

### 1c. Isi `profile.json`

1. Di VS Code, buka berkas `profile.json` (panel kiri).
2. Pastikan dua bagian ini sudah benar:
   ```jsonc
   "subdomain": "frankykho",                                   // dari langkah 1a
   "github": { "repo": "frankykho/tool-hub", "branch": "main" }, // dari langkah 1b
   ```
3. Simpan (<kbd>Ctrl</kbd> + <kbd>S</kbd>).

✅ **Berhasil kalau** kedua isian di atas sudah sesuai dengan akun Anda. Bagian lain (logo, kontak, dll.) boleh dibiarkan kosong.

---

## 2. Pindahkan data dari akun lama

Yang dipindah: akun pengguna Tool Hub, data reksa dana, promo kompetitor, artikel edukasi, sinyal SATS, riwayat obligasi, dan draf.

### 2a. Ambil data dari akun LAMA

1. Hubungkan terminal ke akun Cloudflare **lama**:
   ```
   npx wrangler login
   ```
   Browser akan terbuka. Masuk dengan akun Cloudflare **LAMA**, lalu klik **Allow**. Setelah muncul tulisan "You have granted authorization", kembali ke VS Code.

2. Cek bahwa yang tersambung memang akun lama:
   ```
   npx wrangler whoami
   ```
   Lihat email yang muncul. Kalau salah akun, jalankan `npx wrangler logout`, lalu ulangi nomor 1.

3. Tampilkan daftar database lama:
   ```
   node scripts/migrate.mjs list
   ```
   Terminal menampilkan dua daftar (**Database D1** dan **KV**), lalu membuat berkas `.migrate/map.json`.

4. Buka `.migrate/map.json` di VS Code. Isinya kira-kira seperti ini:
   ```json
   "d1": {
     "insight-db": "NAMA_LAMA",
     "edukasi-db": "NAMA_LAMA",
     ...
   ```
   Ganti setiap `NAMA_LAMA` dengan nama yang **sepadan** dari daftar di terminal tadi. Contoh: kalau di akun lama databasenya bernama `kisi-edukasi`, tulis `"edukasi-db": "kisi-edukasi"`.
   Kalau ada yang tidak punya padanan, hapus barisnya. Simpan berkasnya.

5. Unduh semua data lama:
   ```
   node scripts/migrate.mjs export
   ```
   ✅ **Berhasil kalau** di akhir muncul `✓ Data tersimpan di ...`. Folder `.migrate` sekarang berisi berkas `.sql` dan `.kv.json`.

### 2b. Pindah ke akun BARU dan buat semua tool

1. Putuskan sambungan dari akun lama, lalu sambungkan ke akun **baru**:
   ```
   npx wrangler logout
   npx wrangler login
   ```
   Di browser, kali ini masuk dengan akun Cloudflare **BARU**, lalu klik **Allow**.

2. Pastikan sekarang tersambung ke akun baru:
   ```
   npx wrangler whoami
   ```

3. Buat semua tool, database, dan penyimpanan di akun baru:
   ```
   node scripts/deploy.mjs
   ```
   Proses ini memakan waktu beberapa menit dan menampilkan banyak tulisan.
   ✅ **Berhasil kalau** tidak ada tulisan `✗` di akhir. **Jangan buka tool-nya dulu** sebelum langkah berikutnya selesai.

4. Masukkan data lama ke akun baru:
   ```
   node scripts/migrate.mjs import
   ```
   Data besar otomatis dipecah. Kalau muncul `... baris besar dipecah`, itu normal. Proses ini bisa makan waktu beberapa menit per database.
   ✅ **Berhasil kalau** di akhir muncul `✓ Data sudah dipindah.`

> Kalau `import` gagal di tengah jalan, aman untuk dijalankan ulang. Database yang gagal otomatis kembali seperti semula.

---

## 3. Isi kunci rahasia (secret)

Secret adalah kata sandi atau kunci yang dipakai tool untuk berhubungan dengan layanan lain. Semuanya diisi di berkas `.secrets.json`. Berkas ini **tidak** ikut terunggah ke GitHub.

Buka `.secrets.json` di VS Code. Kalau berkasnya belum ada, salin `.secrets.example.json` lalu ganti namanya menjadi `.secrets.json`. Isi setiap tanda kutip kosong `""` seperti di bawah ini.

### 3a. SSO_SECRET (wajib)

Ini kunci login bersama untuk semua tool. Buat teks acak dengan menjalankan:
```
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```
Salin hasilnya (deretan huruf dan angka yang panjang), lalu tempel di antara tanda kutip:
```jsonc
"*": { "SSO_SECRET": "tempel-di-sini" },
```

### 3b. GITHUB_TOKEN dan GH_TOKEN (wajib)

Satu token GitHub dipakai di **tiga tempat**: `hub` → `GITHUB_TOKEN`, `sats` → `GITHUB_TOKEN`, dan `storydata` → `GH_TOKEN`.

Cara membuat token:
1. Di GitHub, klik foto profil (kanan atas) → **Settings**.
2. Scroll ke paling bawah menu kiri → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
3. Isi:
   - **Token name**: `tool-hub`
   - **Expiration**: pilih yang paling lama. **Catat tanggalnya**, karena token harus dibuat ulang saat kedaluwarsa. Kalau sudah kedaluwarsa, gambar tutorial, data Story, dan SATS berhenti diperbarui.
   - **Repository access**: pilih **Only select repositories**, lalu pilih repo yang dibuat di langkah 1b.
   - **Permissions → Repository permissions**: cari **Contents** dan ubah menjadi **Read and write**. Lakukan hal yang sama untuk **Actions**.
4. Klik **Generate token**. Salin token yang muncul (diawali `github_pat_...`). **Token hanya ditampilkan sekali.**
5. Tempel token yang sama di ketiga tempat:
   ```jsonc
   "hub": { "GITHUB_TOKEN": "github_pat_...", "FIREBASE_SA": "" },
   "storydata": { "GH_TOKEN": "github_pat_..." },
   "sats": { "GITHUB_TOKEN": "github_pat_..." }
   ```

### 3c. FIREBASE_SA (wajib untuk Tutorial)

> **Pindah ke email Google baru?** Jangan buat proyek Firebase baru, karena isi Tutorial (kategori, usulan) tersimpan di proyek lama. Cukup tambahkan email baru ke proyek lama:
> 1. Masuk ke <https://console.firebase.google.com> dengan email **lama**, lalu pilih proyek Tutorial.
> 2. Klik ⚙️ → **Users and permissions** → **Add member**. Isi email **baru**, pilih role **Owner**, lalu klik **Add member**.
> 3. Buka email baru dan terima undangannya. Setelah itu, keluar dari Firebase lalu masuk lagi dengan email **baru**. Proyek Tutorial sekarang muncul di daftar.
> 4. Lanjutkan langkah di bawah dengan email baru.

1. Buka <https://console.firebase.google.com> dan pilih proyek Firebase **Tutorial**.
2. Klik ikon ⚙️ (di samping "Project Overview") → **Project settings** → tab **Service accounts**.
3. Klik **Generate new private key** → **Generate key**. Sebuah berkas `.json` akan terunduh.
4. Buka berkas itu dengan Notepad. Tekan <kbd>Ctrl</kbd> + <kbd>A</kbd>, lalu <kbd>Ctrl</kbd> + <kbd>C</kbd>.
5. Di `.secrets.json`, ganti `""` setelah `"FIREBASE_SA":` dengan isi yang disalin, **termasuk tanda `{` dan `}`**:
   ```jsonc
   "hub": { "GITHUB_TOKEN": "github_pat_...", "FIREBASE_SA": { "type": "service_account", "project_id": "...", ... } },
   ```
6. Setelah selesai, hapus berkas `.json` yang tadi terunduh dari folder Downloads.

### 3d. Yang opsional

Lupa nilai lamanya tidak masalah. Nilai lama tidak perlu dicari, karena semuanya bisa **dibuat baru**. Kalau dibiarkan `""`, tool tetap jalan. Hanya fitur kecil yang disebut di bawah ini yang mati.

**`ADMIN_KEY` (fund dan competitor): sebaiknya dibuat baru**
- Gunanya: kunci cadangan admin. Di Fund Insight, kunci ini dipakai untuk masuk darurat dengan username `admin` dan password = ADMIN_KEY, kalau Tool Hub bermasalah. Di Competitor Intel, kunci ini dipakai untuk menjalankan scan lewat alamat `.../admin/scan?key=...`.
- Kalau kosong: login biasa lewat Tool Hub tetap jalan. Hanya jalur darurat di atas yang tidak bisa dipakai.
- Cara membuat: jalankan perintah yang sama seperti SSO_SECRET dua kali. Tempel hasil pertama di `fund` dan hasil kedua di `competitor`. **Simpan keduanya** di tempat aman, misalnya password manager.
  ```
  node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
  ```

**`EDIT_KEY` (bond): buat baru kalau tim menyimpan "momen konten" di Bond Insight**
- Gunanya: kode yang diketik di Bond Insight saat menyimpan momen konten bersama.
- Kalau kosong: momen konten tetap bisa dilihat, tapi tidak bisa disimpan atau diubah.
- Cara membuat: isi dengan kode yang mudah diingat dan dibagikan ke tim, misalnya `bond-2026-tim`. Kode lama otomatis tidak berlaku lagi.

**`NOTIFY_WEBHOOK` (fund): boleh dikosongkan**
- Gunanya: setiap Senin pagi, Fund Insight mengirim ringkasan reksa dana ke grup chat (Slack, Discord, atau Google Chat).
- Kalau kosong: ringkasan mingguan tidak dikirim. Fitur lain tetap jalan.
- Kalau ingin dinyalakan lagi: buat webhook baru di grup chat tujuan, lalu tempel alamatnya (diawali `https://...`).
  - **Discord**: Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL
  - **Google Chat**: buka space → nama space → Apps & integrations → Webhooks → Add
  - **Slack**: api.slack.com/apps → Create App → Incoming Webhooks → Add New Webhook

**`ANTHROPIC_API_KEY` (edukasi): boleh dikosongkan**
- Gunanya: kalau diisi, penulis artikel Edukasi Studio memakai Claude (berbayar).
- Kalau kosong: penulis artikel memakai Workers AI bawaan Cloudflare (gratis). Fitur tetap jalan.
- Kalau ingin memakai Claude: buat key baru di <https://console.anthropic.com> → **API Keys** → **Create Key**, lalu tempel di sini. Key lama tidak bisa dilihat lagi, jadi memang harus dibuat baru.

### 3e. Kirim secret ke semua tool

Simpan `.secrets.json` (<kbd>Ctrl</kbd> + <kbd>S</kbd>), lalu jalankan:
```
node scripts/deploy.mjs secrets
```
✅ **Berhasil kalau** muncul beberapa baris `▶ secret ...` dan `Success` tanpa tulisan `✗`.

---

## 4. Hubungkan ke GitHub

Setelah langkah ini selesai, setiap perubahan kode otomatis di-deploy, dan tugas terjadwal (PDF, data Story, SATS) berjalan sendiri.

### 4a. Buat token Cloudflare untuk GitHub

1. Di dashboard Cloudflare **baru**, klik ikon profil (kanan atas) → **My Profile** → **API Tokens** → **Create Token**.
2. Di baris **Edit Cloudflare Workers**, klik **Use template**.
3. Di bagian **Permissions**, klik **+ Add more**, lalu pilih: **Account** | **D1** | **Edit**.
4. Di **Account Resources**, pilih akun Anda. Di **Zone Resources**, pilih **All zones**.
5. Klik **Continue to summary** → **Create Token**. Salin token yang muncul. **Token hanya ditampilkan sekali.**
6. Catat juga **Account ID**. Caranya: buka **Workers & Pages**, lalu lihat di sisi kanan halaman (ada tombol salin). Account ID juga terlihat di alamat browser: `dash.cloudflare.com/`**`<account-id>`**`/...`

### 4b. Isi secret di repo GitHub

1. Buka repo Anda di GitHub → tab **Settings** → menu kiri **Secrets and variables** → **Actions**.
2. Klik **New repository secret** untuk masing-masing secret di bawah. Isi **Name** persis seperti tulisan di bawah, tempel isinya di **Secret**, lalu klik **Add secret**.

| Name | Isinya |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token dari langkah 4a |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID dari langkah 4a |
| `PROFILE_JSON` | Seluruh isi `profile.json`: buka berkasnya, tekan <kbd>Ctrl</kbd> + <kbd>A</kbd> lalu <kbd>Ctrl</kbd> + <kbd>C</kbd> |

### 4c. Izinkan workflow menulis ke repo

1. Masih di **Settings** repo → menu kiri **Actions** → **General**.
2. Scroll ke **Workflow permissions**, pilih **Read and write permissions**, lalu klik **Save**.

### 4d. Gambar Tutorial lama (putuskan dulu)

Folder `apps/tutorial/site/images/` berisi tangkapan layar aplikasi lama. Repo ini **publik**, jadi semua orang bisa melihat gambar itu.
- Kalau **tidak** ingin gambar itu terlihat publik, hapus foldernya sekarang (klik kanan di VS Code → **Delete**). Tutorial yang memakai gambar itu perlu diunggah ulang gambarnya nanti.
- Kalau tidak masalah, biarkan saja.

### 4e. Kirim kode ke GitHub

1. Atur nama dan email untuk catatan perubahan (commit). Email "noreply" bisa dilihat di GitHub → **Settings** → **Emails**, bentuknya `12345678+username@users.noreply.github.com`.
   ```
   git config user.name "username-github-anda"
   git config user.email "12345678+username@users.noreply.github.com"
   ```
2. Simpan semua perubahan terakhir sebagai commit:
   ```
   git add -A
   git commit -m "Siap pindah akun"
   ```
   Kalau muncul `nothing to commit`, itu normal. Lanjut saja.
3. Ganti nama pembuat di semua commit lama menjadi nama Anda:
   ```
   git rebase --root --exec "git commit --amend --reset-author --no-edit"
   ```
4. Sambungkan ke repo GitHub, lalu kirim. Ganti `frankykho/tool-hub` dengan nama repo Anda:
   ```
   git remote add origin https://github.com/frankykho/tool-hub.git
   git push -u origin main
   ```
   Kalau jendela login GitHub muncul, masuk dan izinkan.

✅ **Berhasil kalau** berkas proyek terlihat di halaman repo GitHub, dan di tab **Actions** workflow **Deploy** berjalan dengan tanda centang hijau ✔.

> `profile.json`, `.secrets.json`, `NILAI-LAMA.md`, dan folder `.migrate` sengaja **tidak** ikut terkirim, karena isinya data pribadi.

### 4f. Jalankan tiga workflow sekali secara manual

Di repo GitHub, buka tab **Actions**. Untuk setiap workflow di bawah, klik namanya di menu kiri → tombol **Run workflow** (kanan) → atur pilihannya → klik tombol hijau **Run workflow**.

| Workflow | Pilihan |
|---|---|
| **Buat PDF produk** | Tidak ada pilihan, langsung jalankan |
| **Data IDX (Wrap & Kalender)** | Ubah **mode** menjadi `calendar` |
| **EOD SATS** | Biarkan `full` **tidak** dicentang kalau data SATS sudah ikut dipindah di langkah 2. Centang hanya kalau data SATS tidak ikut dipindah. |

✅ **Berhasil kalau** ketiganya selesai dengan tanda centang hijau ✔ (bisa makan waktu 5–30 menit).

---

## 5. Firebase (untuk Tutorial)

1. Buka <https://console.firebase.google.com> → proyek **Tutorial** → **Authentication** (menu kiri, di bawah Build) → tab **Settings** → **Authorized domains** → **Add domain**.
   Tambahkan dua alamat ini satu per satu (ganti `frankykho` dengan subdomain Anda):
   - `tutorial.frankykho.workers.dev`
   - `tool-hub.frankykho.workers.dev`
2. Buka halaman admin Tutorial: `https://tutorial.frankykho.workers.dev/admin.html`. Cari kotak **Pindahkan gambar lama ke GitHub**, lalu klik **Pindahkan** dan tunggu sampai selesai. Lakukan ini selagi akun lama masih aktif.

---

## 6. Coba, lalu umumkan

1. Buka `https://tool-hub.frankykho.workers.dev` (pakai subdomain Anda), login, lalu buka **setiap tool** satu per satu. Pastikan datanya ada: akun pengguna, draf, riwayat, dan artikel.
2. **Pasang ulang bookmarklet.** Bookmarklet lama masih mengarah ke alamat lama. Buka tool berikut, lalu tarik lagi tombol bookmarklet-nya ke bookmark bar browser:
   - **Content Insight**: "Simpan ke Content Insight"
   - **Story Generator**: Foreign Lens, Wrap, Kalender

   Hapus bookmarklet yang lama.
3. Bagikan alamat Tool Hub yang baru ke tim.

### Setelah semuanya lancar sekitar seminggu

- Hapus worker di akun Cloudflare lama (**Workers & Pages** → pilih worker → **Settings** → **Delete**).
- Hapus folder `.migrate` di proyek ini, karena isinya salinan data asli.
- Folder lama `D:\Franky Project` boleh dihapus.

---

## Sehari-hari

- **Mengubah kode:** simpan perubahan, lalu jalankan:
  ```
  git add -A
  git commit -m "jelaskan perubahannya"
  git push
  ```
  Tool yang berubah otomatis di-deploy. Hasilnya bisa dilihat di tab **Actions** GitHub.
- **Mengubah `profile.json`** (misalnya ganti logo atau link):
  1. Simpan `profile.json`.
  2. Perbarui secret `PROFILE_JSON` di GitHub (**Settings → Secrets and variables → Actions** → klik ✏️ di `PROFILE_JSON` → tempel seluruh isi baru → **Update secret**).
  3. Jalankan `node scripts/deploy.mjs`.
- **Mengubah secret** (misalnya token GitHub kedaluwarsa): perbarui isinya di `.secrets.json`, lalu jalankan `node scripts/deploy.mjs secrets`.

---

## Kalau ada masalah

| Tulisan yang muncul | Artinya & yang harus dilakukan |
|---|---|
| `wrangler belum terpasang` | Jalankan `npm install`, lalu ulangi perintahnya. |
| `Authentication error`, `Not logged in`, atau `You must be logged in` | Jalankan `npx wrangler login`, lalu ulangi. |
| `D1 "..." tidak ada di akun ini` (saat `export`) | Nama di `.migrate/map.json` salah ketik. Bandingkan lagi dengan daftar dari `node scripts/migrate.mjs list`. |
| `D1 "..." belum ada di akun baru` (saat `import`) | Jalankan `node scripts/deploy.mjs` dulu, lalu `import` lagi. Pastikan `npx wrangler whoami` menunjukkan akun **baru**. |
| `"subdomain" di profile.json tidak sah` | Subdomain di `profile.json` harus huruf kecil tanpa spasi, persis seperti di Cloudflare (langkah 1a). |
| `.secrets.json belum ada` | Salin `.secrets.example.json` lalu ganti namanya menjadi `.secrets.json` (langkah 3). |
| `Unexpected token` saat `deploy.mjs secrets` | Ada salah ketik di `.secrets.json`, biasanya tanda kutip atau koma yang hilang. Periksa baris yang ditunjuk. |
| `remote origin already exists` (saat `git remote add`) | Jalankan `git remote set-url origin https://github.com/username/nama-repo.git`, lalu `git push -u origin main`. |
| Workflow di GitHub gagal (tanda ✗ merah) | Klik workflow-nya untuk melihat error. Biasanya secret repo (langkah 4b) belum diisi atau salah ketik namanya. |
| Tutorial menampilkan "Tutorial belum tersambung" | `FIREBASE_SA` belum diisi atau tidak lengkap. Ulangi langkah 3c, lalu jalankan `node scripts/deploy.mjs secrets hub`. |
| Login Tutorial gagal (`unauthorized-domain`) | Domain belum ditambahkan di Firebase (langkah 5.1). |
