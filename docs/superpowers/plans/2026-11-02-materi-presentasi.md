# Materi Presentasi (Brand Kit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bagian "Presentasi" di Brand Kit: Investment Growth Specialist mengajukan deck (PPT/PPTX/PDF ≤100 MB) yang tersimpan di Google Drive privat, admin hub atau Head Regional menyetujui / minta revisi / menarik, sales mengunduh hanya versi resmi terbaru dan diberi tahu lewat beranda Tool Hub saat deck yang pernah diunduh diganti atau ditarik.

**Architecture:** Dua modul baru di Brand Kit: `gdrive.js` (OAuth satu kali → refresh token terenkripsi di `cfg`, access token di KV, panggilan Drive REST: folder, sesi unggah *resumable*, pindah, trash, unduh stream) dan `decks.js` (aturan & tabel di `brand-db`). `worker.js` hanya menambah rute. Browser mengunggah langsung ke Drive lewat URL sesi dari server. Tool Hub menambah Brand Kit ke `FEEDS` dan panel "Materi presentasi".

**Tech Stack:** Cloudflare Workers + D1 (`brand-db`) + KV (`BRAND_KV`), Google Drive API v3 (scope `drive.file`), Google OAuth 2.0, tes Node 22 (`node:sqlite`, Google tiruan lewat `globalThis.fetch`).

**Spec:** `docs/superpowers/specs/2026-11-02-materi-presentasi-design.md`

## Global Constraints

- Tidak ada database D1 baru (akun 10/10); semua tabel di `brand-db`. Tidak ada cron baru.
- Scope Google: hanya `https://www.googleapis.com/auth/drive.file`. Secret baru: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (bagian `"brand"` di `.secrets.example.json`). Refresh token disimpan di `cfg` kunci `gdrive`, dienkripsi AES-GCM dengan kunci turunan SHA-256 dari `SSO_SECRET`.
- Folder Drive dibuat tool: induk `Brand Kit – Materi presentasi` berisi `Menunggu`, `Resmi`, `Arsip`; id disimpan di `cfg` kunci `gfolders` `{ root, menunggu, resmi, arsip }`. Tidak pernah di dalam folder `drive_folder` publik.
- Format: ekstensi `.ppt` `.pptx` `.pdf` dengan MIME `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `application/pdf`; ukuran 1 B–100 MB (104857600).
- Pengaju = `me.j === "is"` (bukan admin). Penyetuju = `me.adm` atau `(roleIn(org, me.j)||{}).head && (teamIn(org, me.j)||{}).regional`. Peran untuk feed (tanpa tiket) diambil dari `cfg users` (`job`, `adm`).
- Status versi: `unggah` → `menunggu` → `resmi` | `revisi`; `resmi` → `arsip` (diganti / ditarik); `revisi` → `arsip` (saat versi baru diajukan); `arsip` → `trash` (lebih dari 3 arsip per deck). Satu deck paling banyak satu versi `unggah`/`menunggu`.
- Keputusan pertama yang berlaku: perubahan status memakai `UPDATE … WHERE id = ? AND status = 'menunggu'` dan memeriksa `meta.changes`.
- Pemberitahuan sales: deck yang pernah diunduh orang itu dan sejak unduhan terakhirnya diganti (versi resmi baru) atau ditarik, dalam 30 hari terakhir; hilang sendiri setelah orang itu mengunduh versi resmi terbaru.
- Tanda "Diperbarui" di daftar: versi resmi `n > 1` yang disetujui ≤14 hari lalu.
- Teks UI Indonesia; semua teks baru ada di `apps/brand-kit/i18n.js` / `apps/tool-hub/i18n.js`; `node scripts/i18n-check.mjs` lolos. `apps/tool-hub/worker.js` CRLF (pakai Edit tool).
- Commit berbahasa Indonesia, diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Jangan push tanpa izin.

## Review Focus

1. **Dua penyetuju memutuskan bersamaan** (satu setuju, satu minta revisi, versi sama): hanya keputusan pertama tercatat; yang kedua dapat pesan "Sudah diputuskan oleh …". Tes di Task 2.
2. **Pemindahan Drive gagal di tengah persetujuan** (Drive 500 setelah status berubah): status D1 dan letak file tidak boleh berbeda diam-diam; kolom `folder` mencatat letak sebenarnya dan `repair()` memindahkan sisanya pada tindakan berikutnya. Tes di Task 2.
3. **Sales membuka `/deck/<id>` versi menunggu / arsip secara langsung**: 404; hanya versi `resmi` yang bisa diunduh sales. Tes di Task 3.
4. **Konfirmasi unggah dengan `file_id` asing** (file bukan di folder Menunggu, atau milik versi lain): ditolak. Tes di Task 2.
5. **Izin Google dicabut / refresh token tidak sah** (`invalid_grant`): admin melihat "Google Drive perlu dihubungkan ulang", daftar deck resmi tetap tampil, unduhan memberi pesan jelas (bukan 500). Tes di Task 1 & 3.

---

### Task 1: `gdrive.js` — sambungan Google Drive

**Files:**
- Create: `apps/brand-kit/gdrive.js`
- Create: `apps/brand-kit/deck.test.mjs` (Google tiruan + tes Task 1–3; diimpor di akhir `apps/brand-kit/test.mjs` seperti `render.test.mjs`)
- Modify: `apps/brand-kit/worker.js` (rute `/drive/connect`, `/drive/callback`, `GET /api/gdrive`, `POST /api/gdrive/disconnect`)
- Modify: `.secrets.example.json` (`"brand": { "DRIVE_API_KEY": "", "GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": "" }`)

**Interfaces:**
- Produces (dari `gdrive.js`):
  - `seal(env, text) -> Promise<string>` / `unseal(env, sealed) -> Promise<string|null>` (AES-GCM, iv acak 12 B, base64url `iv.cipher`).
  - `authUrl(env, origin, email) -> Promise<string>`: URL consent Google (`access_type=offline`, `prompt=consent`, `scope=drive.file`, `redirect_uri=<origin>/drive/callback`, `state` = HMAC-SHA256(SSO_SECRET) atas `{ e, x: now+10 menit }`).
  - `finishAuth(env, origin, code, state, email) -> Promise<{ ok } | { error }>`: cek `state` (email sama, belum kedaluwarsa), tukar `code` di `https://oauth2.googleapis.com/token`, simpan `cfg gdrive = { t: seal(refresh), by, at }`, hapus cache token, lalu `ensureFolders`.
  - `token(env) -> Promise<string>`: access token dari KV `gtoken` (sisa umur >60 dtk) atau tukar refresh token; `invalid_grant` → hapus `cfg gdrive` dan lempar `Error("Google Drive perlu dihubungkan ulang.")` dengan `e.reconnect = true`.
  - `drive(env, path, init) -> Promise<Response>`: `fetch("https://www.googleapis.com" + path)` dengan Bearer, batas waktu 15 dtk; HTTP ≥400 → `Error("Google Drive: HTTP <n>")`.
  - `ensureFolders(env) -> Promise<{ root, menunggu, resmi, arsip }>`: buat yang belum ada (`mimeType` folder, `parents`), simpan `cfg gfolders`.
  - `startUpload(env, origin, { name, mime, size, folder }) -> Promise<string>` (URL sesi resumable; header `Origin`, `X-Upload-Content-Type`, `X-Upload-Content-Length`).
  - `fileInfo(env, id) -> Promise<{ id, name, mimeType, size, parents }>`; `moveFile(env, id, from, to)`; `trashFile(env, id)`; `streamFile(env, id) -> Promise<Response>` (`alt=media`).
  - `status(env) -> Promise<{ ready, connected, by, at, error? }>` (`ready` = secret client terpasang).
- Rute: `GET /drive/connect` (admin, buka di tab baru) → 302 ke `authUrl`; `GET /drive/callback?code&state` (admin) → halaman kecil "Google Drive terhubung. Tab ini boleh ditutup." atau pesan galat; `GET /api/gdrive` (admin) → `status`; `POST /api/gdrive/disconnect` (admin).

- [ ] **Step 1: Tes gagal** di `deck.test.mjs`: Google tiruan `G` (token: `code-ok` → `{ refresh_token: "rt1", access_token: "at1", expires_in: 3600 }`, `refresh_token=rt1` → access token baru, `rt-bad` → 400 `{ error: "invalid_grant" }`; files: create folder/metadata, `PATCH addParents/removeParents`, `trashed`, `GET ?fields`, `alt=media`; upload: `POST /upload/drive/v3/files?uploadType=resumable` → header `location`). Kasus:
  - `seal`/`unseal` bolak-balik; `unseal` dengan `SSO_SECRET` lain → `null`.
  - non-admin `/drive/connect` → 403; admin → 302 ke `accounts.google.com` dengan `scope` berisi `drive.file` dan `access_type=offline`.
  - callback dengan `state` dari email lain atau kedaluwarsa → pesan galat, `cfg gdrive` tidak tersimpan.
  - callback sah → `cfg gdrive.t` bukan `"rt1"` mentah (terenkripsi), `GET /api/gdrive` → `connected: true`, 4 folder dibuat, induk bernama `Brand Kit – Materi presentasi`, dan tidak satu pun ber-`parents` = `drive_folder` publik.
  - `token()` kedua memakai cache KV (tiruan token dipanggil sekali).
  - refresh token dicabut (`rt-bad`) → `status` `connected: false` + `error: "Google Drive perlu dihubungkan ulang."`.
- [ ] **Step 2: Jalankan** `node apps/brand-kit/test.mjs` → Expected: FAIL (modul / rute belum ada).
- [ ] **Step 3: Implementasi** `gdrive.js` dan rute.
- [ ] **Step 4: Jalankan** `node apps/brand-kit/test.mjs` → Expected: `semua cek lolos`.
- [ ] **Step 5: Commit** `git commit -m "Brand Kit: sambungan Google Drive untuk materi presentasi (izin sekali, folder privat)"`

---

### Task 2: `decks.js` — pengajuan, persetujuan, revisi, tarik, arsip

**Files:**
- Create: `apps/brand-kit/decks.js`
- Modify: `apps/brand-kit/worker.js` (tabel di `ensure`, rute `/api/decks*`)
- Test: `apps/brand-kit/deck.test.mjs`

**Interfaces:**
- Consumes: `gdrive.js` (Task 1).
- Tabel (di `ensure`):
  - `decks (id TEXT PRIMARY KEY, title TEXT, note TEXT, official TEXT, withdrawn_at TEXT, withdrawn_by TEXT, withdraw_note TEXT, created_at TEXT, updated_at TEXT)` — `official` = id versi resmi.
  - `deck_versions (id TEXT PRIMARY KEY, deck_id TEXT, n INTEGER, file_id TEXT, name TEXT, mime TEXT, size INTEGER, status TEXT, folder TEXT, by_email TEXT, by_name TEXT, at TEXT, decided_by TEXT, decided_at TEXT, note TEXT)` + indeks `(deck_id)`, `(status)`.
  - `deck_log (id INTEGER PRIMARY KEY AUTOINCREMENT, deck_id TEXT, version_id TEXT, at TEXT, by_email TEXT, by_name TEXT, action TEXT, note TEXT)` (`action`: ajukan, setujui, revisi, tarik, arsip, hapus-arsip).
- Produces (dari `decks.js`): `canSubmit(me)`, `canApprove(me, org)`, dan fungsi API di bawah (semua kembali `{ error, status? }` atau data):
  - `POST /api/decks/upload` `{ deck_id?, title, note?, name, mime, size }` → `{ version_id, upload_url }`: pengaju saja; validasi format/ukuran/judul (≤120); deck baru atau deck yang tidak punya versi `unggah`/`menunggu` (400 "Masih ada versi yang menunggu persetujuan."). Baris versi `unggah`, `folder: ""`.
  - `POST /api/decks/uploaded` `{ version_id, file_id }` → `{ ok }`: hanya pengunggah versi itu; `fileInfo` harus `parents` berisi `menunggu` dan `size` sama; lalu `status = menunggu`, `folder = menunggu`; versi `revisi` sebelumnya di deck itu → `arsip` (pindah file); judul/keterangan deck diperbarui; log `ajukan`.
  - `POST /api/decks/decide` `{ version_id, action: "setujui" | "revisi", note }` → `{ ok }`: penyetuju; `revisi` wajib catatan; keputusan pertama (UPDATE bersyarat); kalah → 409 `{ error: "Sudah diputuskan oleh <nama>." }`. `setujui`: versi → `resmi`, `decks.official` = versi ini, `withdrawn_*` dikosongkan, versi resmi lama → `arsip`; lalu `repair` memindahkan file sesuai status dan `prune` (simpan 3 arsip terbaru per deck, sisanya `trashFile` + `status = trash`).
  - `POST /api/decks/withdraw` `{ deck_id, note }` → `{ ok }`: penyetuju; catatan wajib; versi resmi → `arsip`, `official = NULL`, isi `withdrawn_*`.
  - `GET /api/decks` → `{ official: [...], work: [...] | undefined, can: { submit, approve }, drive: { connected } }`: `official` = deck dengan versi resmi `{ id, title, note, version_id, n, name, mime, size, approved_at, updated: bool }`, urut `approved_at DESC`. `work` (hanya pengaju & penyetuju) = deck dengan versi `unggah`/`menunggu`/`revisi` atau ditarik ≤30 hari, beserta versi terakhir dan 20 log terakhir.
  - `repair(env, limit = 10)`: versi dengan `folder` ≠ folder tujuan statusnya (`menunggu`→menunggu, `resmi`→resmi, `revisi`→menunggu, `arsip`→arsip) dipindah; `folder` diisi hanya setelah Drive berhasil. Dipanggil di akhir setiap tindakan dan saat `GET /api/decks` oleh penyetuju.
  - Versi `unggah` lebih dari 24 jam tanpa konfirmasi dihapus barisnya (file Drive yang mungkin ada → `trashFile`, galat diabaikan).

- [ ] **Step 1: Tes gagal** (akun: `IGS` j `is`, `HRM` j `head_rm`, `ADM` adm, `SALES` j `sales`; Google tiruan dari Task 1, sudah terhubung):
  - SALES/HRM/ADM `POST /api/decks/upload` → 403; IGS dengan `.docx`, MIME salah, `size` 0 atau 104857601 → 400.
  - IGS unggah → `upload_url` dari tiruan; `uploaded` dengan `file_id` yang `parents` bukan folder Menunggu → 400; dengan file sah → status `menunggu`; IGS unggah lagi untuk deck sama → 400 "Masih ada versi yang menunggu persetujuan.".
  - IGS `decide` → 403. HRM `revisi` tanpa catatan → 400; HRM `revisi` "Slide 5" → ok; ADM `setujui` versi itu → 409 "Sudah diputuskan oleh Hadi.".
  - Versi 2 diajukan → versi 1 (revisi) `arsip` dan filenya di folder Arsip; ADM `setujui` v2 → `official` = v2, file di Resmi.
  - Versi 3 disetujui → v2 `arsip`, `GET /api/decks` sebagai SALES: hanya v3, `updated: true`, tanpa `work`.
  - Lima kali ganti versi → hanya 3 arsip terbaru tersisa; yang lebih tua `trash` dan `trashFile` dipanggil.
  - Drive tiruan memberi 500 pada `PATCH` saat persetujuan → respons tetap `ok` dengan `warning`, versi `resmi` tetapi `folder` masih `menunggu`; Drive pulih → `GET /api/decks` oleh penyetuju memindahkannya (`folder = resmi`).
  - HRM `withdraw` tanpa catatan → 400; dengan catatan → deck hilang dari `official`, ada di `work` dengan `withdrawn_at`.
  - CSRF: `origin` asing → 403.
- [ ] **Step 2: Jalankan** `node apps/brand-kit/test.mjs` → Expected: FAIL (404 pada `/api/decks/upload`).
- [ ] **Step 3: Implementasi** `decks.js`, tabel, rute.
- [ ] **Step 4: Jalankan** `node apps/brand-kit/test.mjs` → Expected: `semua cek lolos`.
- [ ] **Step 5: Commit** `git commit -m "Brand Kit: alur materi presentasi (ajukan, setujui / revisi, tarik, arsip 3 versi)"`

---

### Task 3: Unduhan, catatan unduhan, ringkasan untuk Tool Hub

**Files:**
- Modify: `apps/brand-kit/decks.js`, `apps/brand-kit/worker.js`
- Test: `apps/brand-kit/deck.test.mjs`

**Interfaces:**
- Tabel: `deck_downloads (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, email TEXT, branch TEXT, deck_id TEXT, version_id TEXT)` + indeks `(email, deck_id)`.
- `GET /deck/<version_id>[?view=1]`: versi `resmi` → semua pemegang akses; versi lain → hanya pengaju & penyetuju; selain itu 404. Body = `streamFile` diteruskan apa adanya (tanpa ditampung), header `content-type` = mime, `content-disposition: attachment; filename*=UTF-8''<nama>` (`inline` untuk PDF dengan `view=1`), `cache-control: private, no-store`. Unduhan versi resmi oleh siapa pun dicatat di `deck_downloads`. Drive gagal → 502 teks "Google Drive tidak bisa dihubungi. Coba lagi sebentar." / "Google Drive perlu dihubungkan ulang. Hubungi admin.".
- `GET /__hub/today?email=` (`hubFeedAllowed`) → `{ pending: [{ deck_id, title, by, at }], mine: [{ deck_id, title, status: "resmi"|"revisi", note, at }], notices: [{ deck_id, title, kind: "diganti"|"ditarik", at }] }`:
  - `pending` hanya bila orang itu penyetuju (dari `cfg users` + `org`).
  - `mine` hanya bila pengaju: keputusan atas versi yang dia unggah dalam 14 hari.
  - `notices`: Global Constraints (30 hari, hilang setelah unduh versi resmi terbaru).
- Ringkasan unduhan deck ikut di `GET /api/usage` (admin): `decks: [{ title, n }]` 90 hari.

- [ ] **Step 1: Tes gagal**:
  - SALES `/deck/<v menunggu>` dan `/deck/<v arsip>` → 404; `/deck/<v resmi>` → 200, isi byte dari tiruan, `content-disposition` attachment, satu baris `deck_downloads`.
  - `?view=1` PDF → `inline`.
  - `/__hub/today` tanpa kunci → 403; HRM → `pending` berisi deck menunggu; SALES → `pending` kosong.
  - SALES unduh v1, lalu v2 disetujui → `notices` `[{ kind: "diganti" }]`; SALES unduh v2 → `notices` kosong; deck ditarik → `notices` `ditarik`.
  - IGS → `mine` memuat keputusan revisi beserta catatannya.
  - Refresh token dicabut → `/deck/<v resmi>` 502 dengan pesan "perlu dihubungkan ulang", `GET /api/decks` tetap 200 dengan daftar resmi dan `drive.connected: false`.
- [ ] **Step 2: Jalankan** `node apps/brand-kit/test.mjs` → Expected: FAIL.
- [ ] **Step 3: Implementasi**.
- [ ] **Step 4: Jalankan** → Expected: `semua cek lolos`.
- [ ] **Step 5: Commit** `git commit -m "Brand Kit: unduh deck resmi, catatan unduhan, ringkasan untuk beranda Tool Hub"`

---

### Task 4: Tool Hub — panel "Materi presentasi"

**Files:**
- Modify: `apps/tool-hub/worker.js` (CRLF; `FEEDS` tambah `{ id: 'brand', binding: 'BRAND', name: 'Brand Kit', email: true }`)
- Modify: `apps/tool-hub/shell.html` (`PANELS` tambah `["brand", "brandBody", "palette", "campaign", "Materi presentasi"]`; `fillBrand(r)` dipanggil di `fillAll` dan objek galat; panel disembunyikan bila `pending`, `mine`, `notices` kosong; tombol buka Brand Kit ke `#/deck`)
- Modify: `apps/tool-hub/i18n.js`, `apps/tool-hub/test.mjs`

**Interfaces:**
- Consumes: `/__hub/today` Brand Kit (Task 3).
- Teks panel: "Menunggu persetujuanmu", "Keputusan atas deck-mu", "Deck yang kamu unduh sudah diganti", "Deck yang kamu unduh sudah ditarik", "Buka Brand Kit".

- [ ] **Step 1: Tes gagal** di `apps/tool-hub/test.mjs`: `/api/today` untuk admin memanggil `https://brand/__hub/today?email=...` dengan kunci dan mengembalikan `brand.ok === true`; halaman hub berisi `"brandBody"`.
- [ ] **Step 2: Jalankan** `node apps/tool-hub/test.mjs` → Expected: FAIL.
- [ ] **Step 3: Implementasi**.
- [ ] **Step 4: Jalankan** `node apps/tool-hub/test.mjs && node scripts/i18n-check.mjs` → Expected: lolos.
- [ ] **Step 5: Commit** `git commit -m "Tool Hub: panel Materi presentasi dari Brand Kit di beranda"`

---

### Task 5: Brand Kit — layar Presentasi

**Files:**
- Modify: `apps/brand-kit/page.html`, `apps/brand-kit/i18n.js`, `apps/brand-kit/worker.js` (`page()`: `BK.deck = { submit, approve }`)
- Test: `apps/brand-kit/test.mjs`

**Interfaces:**
- Consumes: API Task 2–3, `/drive/connect`, `/api/gdrive`.
- Produces:
  - Tab baru **Presentasi** (`data-tab="deck"`, juga lewat `#/deck`): kolom cari judul; daftar deck resmi (judul, keterangan, tanggal disetujui, tanda "Diperbarui", tombol **Unduh**, **Lihat** untuk PDF). Bila Drive belum terhubung: pesan "Materi presentasi belum aktif. Admin perlu menghubungkan Google Drive.".
  - Untuk pengaju & penyetuju, di atas daftar: kartu **Pengajuan** (badge jumlah menunggu) — tiap deck: status (Menunggu / Perlu revisi / Ditarik), versi, pengaju, catatan revisi, riwayat (log), dan tombol sesuai peran: **Setujui**, **Minta revisi** (dialog catatan), **Tarik** (dialog alasan), **Unggah versi baru**. Pengaju: tombol **Ajukan deck baru** (dialog judul, keterangan, file).
  - Unggah: `POST /api/decks/upload` → `XMLHttpRequest PUT upload_url` dengan `Content-Type` = mime, progres persen, tombol batal; selesai → `POST /api/decks/uploaded` dengan `id` dari respons Drive. Galat jaringan → pesan "Unggahan gagal. Coba lagi." dan versi `unggah` dibiarkan (dibersihkan server setelah 24 jam).
  - **Atur Brand Kit → Folder Drive**: bagian "Materi presentasi (Google Drive)": status terhubung (oleh siapa, kapan) / belum, tombol **Hubungkan Google Drive** (`<a href="/drive/connect" target="_blank" rel="noopener">`), **Putuskan**, dan pesan bila `GOOGLE_CLIENT_ID` belum dipasang.

- [ ] **Step 1: Tes gagal**: halaman untuk IGS berisi `data-tab="deck"` dan `BK.deck` `{ submit: true, approve: false }`; HRM `{ submit: false, approve: true }`; SALES `{ submit: false, approve: false }`.
- [ ] **Step 2: Jalankan** → Expected: FAIL.
- [ ] **Step 3: Implementasi** halaman + `i18n.js`.
- [ ] **Step 4: Jalankan** `node apps/brand-kit/test.mjs && node scripts/i18n-check.mjs`; lalu cek visual Chrome headless (pola `bk-harness.mjs` dengan Google tiruan) di 1366 terang dan 375 gelap: alur IGS ajukan → HRM minta revisi → IGS versi baru → ADM setujui → SALES unduh; tanpa scroll samping; progres unggah terlihat.
- [ ] **Step 5: Commit** `git commit -m "Brand Kit: tab Presentasi (daftar resmi, pengajuan, persetujuan, unggah ke Drive)"`

---

### Task 6: README dan panduan izin Google

**Files:**
- Modify: `README.md` (bagian "### Brand Kit": sub-bagian Materi presentasi — peran, alur, folder privat, arsip 3 versi, pemberitahuan di beranda; langkah izin Google)

Langkah izin Google yang ditulis (bahasa Indonesia, berurutan): console.cloud.google.com → project yang sama dengan API key Drive → **Google Auth Platform / OAuth consent screen**: tipe *External*, nama app, email → **Data access**: tambah scope `.../auth/drive.file` → **Audience**: **Publish app** (status *In production*, supaya izin tidak kedaluwarsa 7 hari; `drive.file` tidak perlu verifikasi Google) → **Clients**: Create client → *Web application* → Authorized redirect URI `https://brand.<subdomain>.workers.dev/drive/callback` → salin Client ID & Client secret ke `"brand"` di `.secrets.json` → `node scripts/deploy.mjs secrets brand` → Brand Kit → Atur Brand Kit → Folder Drive → **Hubungkan Google Drive** (login akun Google pemilik folder, setujui peringatan "Google hasn't verified this app" → Advanced → lanjut).

- [ ] **Step 1:** Tulis README.
- [ ] **Step 2: Jalankan semua:** `node apps/brand-kit/test.mjs && node apps/tool-hub/test.mjs && node apps/content-planner/test.mjs && node apps/link-qr/test.mjs && node scripts/i18n-check.mjs && node scripts/deploy.mjs --dry-run brand hub` → Expected: semua lolos.
- [ ] **Step 3: Commit** `git commit -m "Brand Kit: README materi presentasi & langkah izin Google Drive"`

---

## Setelah semua task

Review akhir seluruh cabang → satu putaran perbaikan → minta izin push → deploy → pengguna memasang `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` dan menekan **Hubungkan Google Drive** → cek live: `/api/decks` 401 tanpa sesi, `/drive/connect` tanpa sesi → login hub, `/__hub/today` tanpa kunci 403. Pengguna memberi akses Brand Kit ke Investment Growth Specialist dan Head Regional.
