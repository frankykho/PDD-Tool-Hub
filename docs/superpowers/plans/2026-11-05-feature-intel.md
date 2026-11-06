# Feature Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tool baru `apps/feature-intel` di Tool Hub untuk mendata fitur aplikasi Stockbit & IPOT, membandingkannya dengan iKISI, lalu menghasilkan BRD Word (template F-IT-BRD-0624-00) dan report PDF untuk management.

**Architecture:** Satu Cloudflare Worker (pola `apps/link-qr`: `worker.js` + `page.html` + `i18n.js` + `assets/`), login lewat Tool Hub (salin `HUBSSO` dari `apps/competitor-intel/worker.js:17-61`), D1 `insight-db` dengan tabel `ft_*`, AI lewat `shared/ai.js`, scan dipanggil `apps/cron`. File Word dibuat di browser: `assets/brd.js` mengganti penanda di template `.docx` (zip dibuka dengan PizZip yang disimpan di `assets/vendor/`). Report = halaman HTML + `window.print`.

**Tech Stack:** Cloudflare Workers + D1, JavaScript ES modules tanpa build, Node 22.15+ `node:sqlite` untuk tes, PizZip 3.1.7 (vendored).

**Spec:** `docs/superpowers/specs/2026-11-05-feature-intel-design.md`

## Global Constraints

- Semua tabel berawalan `ft_`; tidak boleh membuat/menulis tabel milik tool lain (`meta`, `ci_*`, `users`, dll.). `ci_content` hanya DIBACA.
- AI hanya lewat `ai(env, system, user, maxTokens, undefined, { temperature: 0.2, json: true })` dari `shared/ai.js`; jangan memasang `ANTHROPIC_API_KEY`. Batas harian `env.FT_AI_DAILY` (bawaan 30), dihitung di `ft_meta`.
- Peran dari Tool Hub: `viewer` hanya GET; `editor` tambah/verifikasi/keputusan/BRD/report; `admin` + daftar kompetitor & scan. Admin hub selalu `admin`. Permintaan non-GET wajib lolos `HUBSSO.sameOrigin`.
- Teks tampilan Bahasa Indonesia; setiap teks UI baru punya terjemahan di `apps/feature-intel/i18n.js`.
- Logo hanya dari `brand/`: `ikisi-color.png` untuk report, logo KISI yang sudah ada di kepala halaman template untuk BRD.
- Kompetitor awal: `Stockbit` dan `IPOT` (Indo Premier). Area fitur: `Saham`, `Reksa Dana`, `Obligasi/SBN`, `Akun & Onboarding`, `Pembayaran/RDN`, `Riset & Konten`, `Lainnya`.
- Status iKISI: `Sudah ada` / `Sebagian` / `Belum ada`. Keputusan: `Kejar` / `Pantau` / `Abaikan`. Prioritas: `H` / `M` / `L`.
- Status bukti: `Perlu verifikasi` / `Terverifikasi` / `Ditolak`. Status BRD: `Draf` / `Diserahkan ke IT` / `Disetujui` / `Dibatalkan`. Versi BRD bawaan `1.0 – Draft untuk direview`.
- BRD tidak pernah mengisi No. Dokumen (tetap `IT-BRD-2026-___ (akan ditetapkan)`), nama orang, durasi/tanggal jadwal, atau kolom tanda tangan; kolom itu `___`.
- Scan otomatis: `apps/cron` memanggil FEATURE di menit :00/:30 hari Minggu (UTC); worker memulai scan minggu itu pada 01:00 UTC (08.00 WIB). Tidak ada Cron Trigger baru.
- Pembuatan .docx dan PDF di browser, bukan di worker (batas CPU paket gratis).

## Review Focus

- **Caption IG/catatan rilis berisi teks yang bukan fitur** (promo, "perbaikan bug dan peningkatan performa"): tidak boleh masuk Temuan → tes `ftIsBugfixOnly` dan tes AI-verdict "bukan fitur" di Task 3.
- **Scan dijalankan dua kali** (tombol + cron, atau cron mengulang): tidak ada bukti ganda → tes hash UNIQUE di Task 3.
- **Teks AI berisi `<`, `&`, atau tanda kutip** masuk ke .docx: file harus tetap terbuka di Word → tes escape XML di Task 5.
- **AI mengembalikan JSON rusak, kosong, atau mengisi No. Dokumen/nama/tanggal**: draf tetap tersimpan dengan kerangka tetap dan kolom itu dipaksa `___` → tes `ftBrdParse` di Task 4.
- **Play Store memblokir/HTML berubah atau iTunes tidak menjawab**: sumber lain tetap jalan, status gagal tercatat per sumber → tes di Task 3.

---

### Task 1: Kerangka worker, tabel, login, hak akses

**Files:**
- Create: `apps/feature-intel/wrangler.jsonc`, `apps/feature-intel/worker.js`, `apps/feature-intel/page.html` (kerangka kosong dengan tab), `apps/feature-intel/i18n.js`, `apps/feature-intel/test.mjs`
- Create: `apps/feature-intel/assets/brand/ikisi-color.png` (salin dari `brand/ikisi-color.png`)

**Interfaces:**
- Produces: `export async function ftMigrate(env)`; `export const FT = { AREAS, IKISI, DECISIONS, PRIOS, EV_STATUS, BRD_STATUS }` (nilai dari Global Constraints); helper tes `d1()` di `test.mjs` (pola `apps/link-qr/test.mjs:18-27`) dan `call(method, path, body, role)` yang membuat cookie sesi `hub_feature` sah untuk peran itu.
- Route: `GET /` (halaman), `GET /api/me` → `{ name, role }`, `/__cron` lewat `withCron`.

- [ ] **Step 1: Tulis `wrangler.jsonc`**: name `feature-intel`, main `worker.js`, compatibility_date `2026-09-22`, `"triggers": { "crons": [] }` dengan komentar `// dijadwalkan oleh apps/cron (Minggu :00/:30 UTC)`, `"assets": { "directory": "./assets" }`, D1 `{ "binding": "DB", "database_name": "insight-db", "database_id": "auto" }`, `"ai": { "binding": "AI" }`. Komentar kepala: secret `SSO_SECRET`, var opsional `FT_AI_DAILY`.

- [ ] **Step 2: Tulis tes gagal di `test.mjs`**

```js
// D1 tiruan yang JUGA berisi tabel Competitor Intelligence & Content Insight (satu insight-db di produksi)
await ciMigrate(env); await ftMigrate(env); await ftMigrate(env);           // idempoten, tidak bentrok
const tabs = env.DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
assert.ok(["ft_competitors","ft_features","ft_evidence","ft_brds","ft_meta"].every(t => tabs.includes(t)));
assert.deepEqual(env.DB.db.prepare("SELECT name FROM ft_competitors ORDER BY name").all().map(r => r.name), ["IPOT", "Stockbit"]);
assert.equal((await call("GET", "/api/me", null, "viewer")).status, 200);
assert.equal((await call("GET", "/api/me", null, null)).status, 401);
assert.equal((await call("POST", "/api/features", { name: "x" }, "viewer")).status, 403);
```

`ciMigrate` diimpor dari `../competitor-intel/worker.js`; tabel Content Insight dibuat dengan menyalin DDL `ci_content`/`ci_accounts` dari `apps/content-insight/worker.js:85-86` ke tes.

- [ ] **Step 3: Jalankan** `node apps/feature-intel/test.mjs` → gagal (modul belum ada).

- [ ] **Step 4: Implementasi `worker.js`**: `HUBSSO` disalin dari Competitor Intelligence dengan `APP = "feature"`; `ROLES = ["admin","editor","viewer"]`; `ftMigrate` membuat tabel sesuai spec "Data" (kolom snake_case: `ft_features(id, name, area, description, ikisi_status, decision, priority, notes, created_by, created_at, updated_by, updated_at)`, `ft_evidence(id, feature_id, competitor_id, source, url, text, image_data, launched_at, ai_json, status, hash UNIQUE, created_by, created_at)`, `ft_brds(id, title, feature_ids, brief, sections, version, status, created_by, created_at, updated_by, updated_at)`, `ft_competitors(id, name, play_id, appstore_id, ig_account, enabled)`, `ft_meta(k PRIMARY KEY, v)`) dan `INSERT OR IGNORE` dua kompetitor. Id aplikasi & akun IG di-seed setelah dicek (Step 5). Pola `ensure` + coba lagi 10 menit dari `ciEnsure`. Halaman: `page.html` disajikan dengan `themeHead("", EN)` + `profileScript(env)` + `HUBSSO.onlyInHub(env)`, CSP `HUBSSO.frame(env)` (pola `apps/link-qr/worker.js:287`). Error kuota tulis D1 → 503 dengan pesan Competitor Intelligence (`worker.js:1049-1050`).

- [ ] **Step 5: Cek id aplikasi & akun IG**: buka App Store (`https://itunes.apple.com/search?term=stockbit&country=id&entity=software`, sama untuk `ipot`), Play Store (`id=` di URL halaman aplikasi), dan `SELECT DISTINCT account FROM ci_content WHERE platform='Instagram'` lewat `npx wrangler d1 execute insight-db --remote --command ...`. Tulis nilainya ke seed. Kalau perintah remote tidak bisa dijalankan, biarkan `ig_account` kosong dan catat di laporan task.

- [ ] **Step 6: Jalankan** `node apps/feature-intel/test.mjs` → lolos.

- [ ] **Step 7: Commit** `git add apps/feature-intel && git commit -m "Feature Intelligence: kerangka worker, tabel ft_, login Tool Hub & hak akses"`

---

### Task 2: Fitur, bukti, verifikasi, perbandingan

**Files:**
- Modify: `apps/feature-intel/worker.js`, `apps/feature-intel/test.mjs`

**Interfaces:**
- Consumes: `ftMigrate`, `FT`, `call()`.
- Produces API (JSON):
  - `GET /api/features?area=&decision=&priority=` → `{ features: [{ id, name, area, description, ikisi_status, decision, priority, notes, has: { [competitor_id]: launched_at|null } }], competitors: [{ id, name }] }` (`has` hanya dari bukti `Terverifikasi`).
  - `GET /api/features/:id` → `{ feature, evidence: [...] }`.
  - `POST /api/features` (editor) `{ name, area, description }` → `{ id }`; `PATCH /api/features` `{ id, ...field }` untuk `ikisi_status|decision|priority|notes|name|area|description`.
  - `GET /api/evidence?status=Perlu verifikasi` → `{ evidence: [...] }`.
  - `POST /api/evidence` (editor, isian manual) `{ competitor_id, name, area, description, launched_at, url?, image_data? }` → membuat fitur baru + bukti `Terverifikasi`, `source:'manual'`.
  - `POST /api/evidence/verify` (editor) `{ id, action: 'merge'|'new'|'reject', feature_id?, name?, area?, description?, launched_at }`.
  - `GET /api/competitors` → `{ competitors: [...] }`; `POST /api/competitors` (admin) `{ id?, name, play_id, appstore_id, ig_account, enabled }` tambah/ubah (tidak ada hapus; nonaktifkan lewat `enabled:0`).
  - `export function ftClean(field, value)` → nilai yang dirapikan atau `null` bila tidak sah.

- [ ] **Step 1: Tulis tes gagal**

```js
// isian manual wajib bukti: url ATAU gambar; tanggal peluncuran wajib
assert.equal((await call("POST", "/api/evidence", { competitor_id: SB, name: "Auto Invest", area: "Reksa Dana", launched_at: "2026-10-01" }, "editor")).status, 400);
const m = await (await call("POST", "/api/evidence", { competitor_id: SB, name: "Auto Invest", area: "Reksa Dana", launched_at: "2026-10-01", url: "https://stockbit.com/x" }, "editor")).json();
// temuan otomatis: merge ke fitur yang ada butuh launched_at
const evId = insertPending(IP, "ig", "Fitur Auto Invest kini hadir");
assert.equal((await call("POST", "/api/evidence/verify", { id: evId, action: "merge", feature_id: m.feature_id }, "editor")).status, 400);
assert.equal((await call("POST", "/api/evidence/verify", { id: evId, action: "merge", feature_id: m.feature_id, launched_at: "2026-10-05" }, "editor")).status, 200);
assert.equal((await call("POST", "/api/competitors", { name: "Ajaib" }, "editor")).status, 403);   // hanya admin
assert.equal((await call("POST", "/api/competitors", { name: "Ajaib", enabled: 0 }, "admin")).status, 200);
const f = (await (await call("GET", "/api/features", null, "viewer")).json()).features[0];
assert.deepEqual(f.has, { [SB]: "2026-10-01", [IP]: "2026-10-05" });
assert.equal(f.ikisi_status, "Belum ada");                               // bawaan
assert.equal((await call("PATCH", "/api/features", { id: f.id, decision: "Beli" }, "editor")).status, 400);  // di luar FT.DECISIONS
// bukti ditolak tidak dihitung
const ev2 = insertPending(SB, "appstore", "x"); await call("POST", "/api/evidence/verify", { id: ev2, action: "reject" }, "editor");
assert.equal(env.DB.db.prepare("SELECT status FROM ft_evidence WHERE id=?").get(ev2).status, "Ditolak");
```

`insertPending` = helper tes yang memasukkan baris `ft_evidence` berstatus `Perlu verifikasi`.

- [ ] **Step 2: Jalankan** → gagal.
- [ ] **Step 3: Implementasi** route di atas. `image_data` hanya `data:image/(png|jpeg|webp);base64,` ≤ 700 KB (kompres di browser, pola `apps/tutorial/site` `compressImage`); `url` hanya `https?://`; `launched_at` format `YYYY-MM-DD`. Panjang maksimal: name 160, description 2000, notes 2000.
- [ ] **Step 4: Jalankan** → lolos.
- [ ] **Step 5: Commit** `"Feature Intelligence: fitur, bukti, verifikasi temuan, tabel perbandingan"`

---

### Task 3: Scan Instagram, App Store, Play Store + jadwal

**Files:**
- Modify: `apps/feature-intel/worker.js`, `apps/feature-intel/test.mjs`
- Modify: `apps/cron/worker.js` (baris jadwal + komentar menit), `apps/cron/wrangler.jsonc` & `wrangler.deploy.json` (binding `{ "binding": "FEATURE", "service": "feature-intel" }`), `apps/cron/test.mjs`

**Interfaces:**
- Consumes: Task 2 tabel & `FT`.
- Produces:
  - `export const ftHash = (competitorId, source, key) => string` (key = url postingan, atau `version` untuk toko aplikasi).
  - `export function ftIsBugfixOnly(text) => boolean`.
  - `export function ftAppStore(json) => { version, notes, date } | null` (dari `results[0].version`, `.releaseNotes`, `.currentVersionReleaseDate`).
  - `export function ftPlayNotes(html) => string` (teks "Yang baru"/"What's new"; `""` bila tidak ketemu).
  - `export function ftAiVerdict(raw) => { feature: false } | { feature: true, name, area, description, merge_id|null }` (area di luar `FT.AREAS` → `Lainnya`; JSON rusak → `{ feature: false }`).
  - `export async function ftScan(env, { fetcher = fetch } = {}) => { ig: {n, error?}, appstore: {...}, playstore: {...} }`.
  - `POST /api/scan` (admin) → hasil `ftScan`; `GET /api/scan` → status terakhir per sumber (dari `ft_meta`).

- [ ] **Step 1: Tulis tes gagal**

```js
assert.equal(ftIsBugfixOnly("Perbaikan bug dan peningkatan performa."), true);
assert.equal(ftIsBugfixOnly("Bug fixes and performance improvements"), true);
assert.equal(ftIsBugfixOnly("Fitur baru: Auto Invest reksa dana. Perbaikan bug."), false);
assert.deepEqual(ftAppStore({ results: [{ version: "5.2.0", releaseNotes: "Auto Invest", currentVersionReleaseDate: "2026-10-03T07:00:00Z" }] }), { version: "5.2.0", notes: "Auto Invest", date: "2026-10-03" });
assert.equal(ftAppStore({ results: [] }), null);
assert.deepEqual(ftAiVerdict("bukan json"), { feature: false });
assert.equal(ftAiVerdict('{"feature":true,"name":"X","area":"Kripto","description":"d"}').area, "Lainnya");
// IG: hanya akun kompetitor, hanya yang lebih baru dari penanda; AI dipalsukan lewat env.AI
seedContent([{ account: "stockbit", caption: "Fitur baru Auto Invest", saved_at: "2026-11-01T00:00:00Z" },
             { account: "akunlain", caption: "Fitur baru", saved_at: "2026-11-01T00:00:00Z" }]);
const r1 = await ftScan(env, { fetcher: fakeStores });
assert.equal(r1.ig.n, 1);
const r2 = await ftScan(env, { fetcher: fakeStores });                   // jalan ulang
assert.equal(r2.ig.n, 0); assert.equal(r2.appstore.n, 0);              // tidak ada duplikat
// Play Store gagal tidak menggagalkan sumber lain
const r3 = await ftScan(env, { fetcher: (u) => /play\.google/.test(u) ? Promise.reject(new Error("blocked")) : fakeStores(u) });
assert.match(r3.playstore.error, /blocked/); assert.ok(!r3.appstore.error);
// batas AI harian
env.FT_AI_DAILY = "0"; seedContent([{ account: "stockbit", caption: "Fitur lain", saved_at: "2026-11-02T00:00:00Z" }]);
assert.equal((await ftScan(env, { fetcher: fakeStores })).ig.n, 0);
```

AI dipalsukan dengan `env.AI = { run: async () => ({ response: '{"feature":true,...}' }) }` (tanpa secret Gemini/Groq, `shared/ai.js` jatuh ke Workers AI). `seedContent(rows)` memasukkan baris `ci_content` (platform `Instagram`, url unik); `fakeStores(url)` mengembalikan `Response` JSON iTunes tetap (versi `5.2.0`) dan HTML Play Store berisi bagian "Yang baru".

- [ ] **Step 2: Jalankan** → gagal.
- [ ] **Step 3: Implementasi**. IG: `SELECT id, url, account, caption, posted_at, saved_at FROM ci_content WHERE platform='Instagram' AND lower(account) IN (...) AND saved_at > ? ORDER BY saved_at LIMIT 10`; penanda `ft_meta.k='ig_since'` maju ke `saved_at` terakhir yang diproses; `launched_at` = `posted_at` (10 karakter). App Store: `https://itunes.apple.com/lookup?id=<appstore_id>&country=id`; proses hanya bila `version` ≠ `ft_meta.appstore_<id>` dan `!ftIsBugfixOnly(notes)`. Play Store: `https://play.google.com/store/apps/details?id=<play_id>&hl=id&gl=ID`; key hash = hash teks catatan. Prompt AI memuat daftar `{id,name}` fitur yang ada supaya bisa mengisi `merge_id`. Hasil "feature:true" → `ft_evidence` `Perlu verifikasi` dengan `ai_json`. Status per sumber disimpan di `ft_meta.k='scan_<source>'` sebagai `{at, n, error}`. AI dibatasi `FT_AI_DAILY` (pola `ciAiTake`, kunci `ft_ai_day` di `ft_meta`).
- [ ] **Step 4: `scheduled(e, env)`**: jalankan `ftScan` hanya bila hari Minggu UTC dan (jam UTC = 1 dan `ft_meta.week` ≠ minggu ini → tandai mulai) atau `ft_meta.pending='1'`; `pending` jadi `'0'` setelah IG tidak punya baris tersisa. Bungkus `export default withCron({ fetch, scheduled })`.
- [ ] **Step 5: `apps/cron/worker.js`**: `if (d.getUTCDay() === 0 && m === 0) jobs.push("FEATURE");` + baris komentar `//   :00/:30 Minggu   Feature Intelligence (scan mulai 01:00 UTC = 08.00 WIB)`. Di `apps/cron/test.mjs` tambahkan `"FEATURE"` ke daftar binding (`test.mjs:21`) dan `assert.equal(calls.FEATURE.length, 48);`.
- [ ] **Step 6: Jalankan** `node apps/feature-intel/test.mjs && node apps/cron/test.mjs` → lolos.
- [ ] **Step 7: Commit** `"Feature Intelligence: scan IG (data Content Insight), App Store, Play Store; jadwal Minggu lewat tool-cron"`

---

### Task 4: BRD: data, kerangka tetap, draf AI

**Files:**
- Create: `apps/feature-intel/brd.js` (dipakai worker; tanpa DOM)
- Modify: `apps/feature-intel/worker.js`, `apps/feature-intel/test.mjs`

**Interfaces:**
- Produces (di `brd.js`):
  - `export const BRD_KEYS = ["ringkasan","tujuan","ruang_lingkup","kebutuhan","definisi","keamanan","pemangku","kendala","tambahan","jadwal","open_items","lampiran"]` (urutan = template).
  - `export function brdSkeleton({ title, features, evidence }) => Sections` dengan bentuk:
    `{ identitas: { nama_proyek, no_dokumen: "IT-BRD-2026-___ (akan ditetapkan)", versi, tanggal: "___", disusun_oleh: "Product / Business Analyst – Divisi Digital Business", referensi }, ringkasan: [para], tujuan: [bullet], ruang_lingkup: [bullet], kebutuhan: [{ modul, rows: [{ id, pri, text }] }], definisi: [{ istilah, id, en }], keamanan: [bullet], pemangku: [{ jabatan, tugas }], kendala: [{ kendala, deskripsi }], tambahan: [{ butir, alasan }], jadwal: [{ fase, aktivitas }], open_items: [text], lampiran: [text] }`.
    Isi kerangka tetap disalin dari contoh BRD (`docs/superpowers/specs/assets/BRD_Pengembangan_Reksa_Dana_iKISI_v1_2_ID.docx`): butir `keamanan` umum (TLS 1.2, validasi server, PIN/biometrik, audit trail, UU PDP, secrets store, security review/pentest), modul akhir `Kebutuhan Data dan Integrasi` & `Kebutuhan Non-Fungsional` (BR-9.x: 3 detik 4G p95, OS minimum, analitik, aksesibilitas 44 px & 4,5:1), `pemangku` 10 jabatan dari contoh, 8 fase `jadwal` dari contoh. `lampiran` selalu berakhir dengan `"Lampiran E – Referensi Kompetitor: " + daftar (kompetitor, tanggal peluncuran, url)` dari bukti terverifikasi.
  - `export function brdParse(raw, skeleton) => Sections`: gabungkan JSON AI ke kerangka; buang kunci asing; `id` BR dinomori ulang `BR-<modul>.<baris>`; `pri` di luar H/M/L → `M`; **`identitas.no_dokumen`, `identitas.tanggal`, `jadwal` (hanya fase & aktivitas), nama pemangku selalu diambil dari kerangka**; JSON rusak → kerangka utuh.
- Produces API: `POST /api/brds` (editor) `{ title, feature_ids, brief: { modul, catatan, target } }` → `{ id }` (status `Draf`, versi bawaan); `GET /api/brds`, `GET /api/brds/:id`; `PATCH /api/brds` `{ id, sections?, version?, status?, title? }`; `POST /api/brds/draft` `{ id, key? }` → panggil AI untuk semua bagian atau satu `key`, simpan, kembalikan `sections`.

- [ ] **Step 1: Tulis tes gagal**

```js
const sk = brdSkeleton({ title: "Auto Invest", features: [F], evidence: [E] });
assert.equal(sk.identitas.no_dokumen, "IT-BRD-2026-___ (akan ditetapkan)");
assert.equal(sk.jadwal.length, 8); assert.equal(sk.pemangku.length, 10);
assert.match(sk.lampiran.at(-1), /^Lampiran E – Referensi Kompetitor: .*Stockbit.*2026-10-01/);
const p = brdParse(JSON.stringify({ identitas: { no_dokumen: "IT-BRD-2026-077", tanggal: "1 Nov 2026" },
  kebutuhan: [{ modul: "Modul 1 – Auto Invest", rows: [{ id: "X", pri: "Z", text: "Harus ada <jadwal> & \"pause\"" }] }], hacker: 1 }), sk);
assert.equal(p.identitas.no_dokumen, sk.identitas.no_dokumen);
assert.equal(p.identitas.tanggal, "___");
assert.deepEqual(p.kebutuhan[0].rows[0], { id: "BR-1.1", pri: "M", text: "Harus ada <jadwal> & \"pause\"" });
assert.equal("hacker" in p, false);
assert.deepEqual(brdParse("{rusak", sk), sk);
// API: viewer tidak boleh membuat; status di luar daftar ditolak
assert.equal((await call("POST", "/api/brds", { title: "x", feature_ids: [F.id] }, "viewer")).status, 403);
const b = await (await call("POST", "/api/brds", { title: "Auto Invest", feature_ids: [F.id], brief: { modul: "Reksa Dana" } }, "editor")).json();
assert.equal((await call("PATCH", "/api/brds", { id: b.id, status: "Selesai" }, "editor")).status, 400);
```

- [ ] **Step 2: Jalankan** → gagal.
- [ ] **Step 3: Implementasi `brd.js` + route.** Prompt sistem: peran Business Analyst iKISI; tulis Bahasa Indonesia baku seperti contoh; jangan mengarang angka bisnis, nama, tanggal, No. Dokumen; jawab JSON dengan kunci `BRD_KEYS` (+ `identitas.nama_proyek`, `identitas.referensi`). Prompt pengguna: fitur (nama, area, deskripsi, status iKISI, prioritas), bukti per kompetitor, arahan tim, dan cuplikan contoh (Ringkasan Eksekutif + modul 1 tabel BR dari contoh, ≤ 2.500 karakter) sebagai few-shot. `maxTokens` 6000. Draf per bagian (`key`) mengirim hanya bagian itu + kerangka bagian itu.
- [ ] **Step 4: Jalankan** → lolos.
- [ ] **Step 5: Commit** `"Feature Intelligence: BRD (kerangka tetap dari contoh, draf AI, kolom manusia dikunci)"`

---

### Task 5: Unduh BRD sebagai Word dari template resmi

**Files:**
- Create: `apps/feature-intel/assets/vendor/pizzip.min.js` (unduh `https://cdn.jsdelivr.net/npm/pizzip@3.1.7/dist/pizzip.min.js`, cek respons 200 dan ukuran > 50 KB; catat versi di komentar baris pertama)
- Create: `apps/feature-intel/tools/tag-template.mjs` (skrip sekali jalan) → menghasilkan `apps/feature-intel/assets/brd-template.docx`
- Create: `apps/feature-intel/assets/brd-docx.js` (dipakai browser **dan** tes)
- Modify: `apps/feature-intel/test.mjs`

**Interfaces:**
- Consumes: bentuk `Sections` dari Task 4.
- Produces: `export function brdDocx(PizZip, templateArrayBuffer, sections) => Uint8Array` (isi .docx). `export function xmlEsc(s) => string`.

Fakta template (`docs/superpowers/specs/assets/BRD Template.docx`): tabel 1 = kotak identitas 6 baris (kolom kanan baris Nama Proyek, Versi, Tanggal, Referensi kosong; No. Dokumen & Disusun Oleh sudah terisi). Tabel 2–13 = kotak judul bagian 1 sel, urut: Ringkasan Eksekutif, Tujuan Proyek, Ruang Lingkup Proyek, Kebutuhan Bisnis, Definisi Metrik dan Isi Pop-up Informasi, Kebutuhan Keamanan, Pemangku Kepentingan Utama, Kendala Proyek, Hal Tambahan yang Direkomendasikan untuk Dilengkapi, Jadwal, Hal yang Masih Perlu Dikonfirmasi (Open Items), Persetujuan Untuk Dilaksanakan. Setelah Tujuan, Ruang Lingkup, dan Keamanan ada paragraf "•   " kosong. Tabel isi (BR, pemangku, dll.) TIDAK ada di template; gayanya diambil dari contoh: border `single sz=4 color=8EAADB`, baris judul `tblHeader` + `shd fill=DEEAF6` + teks tebal, sel `tcMar` 60/80, teks Verdana `sz=16`, paragraf isi Verdana `sz=18` `spacing after=100 line=276`, lebar tabel 9057 dxa (BR: kolom 900/780/7377).

- [ ] **Step 1: Tulis `tools/tag-template.mjs`**: buka template dengan PizZip dari `assets/vendor`, tulis penanda `{{f:nama_proyek}}`, `{{f:versi}}`, `{{f:tanggal}}`, `{{f:referensi}}` ke sel kosong tabel 1, dan satu paragraf `{{s:<key>}}` tepat setelah tiap kotak judul (menggantikan paragraf "•   " bila ada), dengan `<key>` = `BRD_KEYS` sesuai urutan kotak dan `persetujuan` untuk kotak terakhir, lalu `{{s:lampiran}}` setelah `persetujuan`. Jalankan `node apps/feature-intel/tools/tag-template.mjs`; hasil di-commit.

- [ ] **Step 2: Tulis tes gagal**

```js
// UMD dimuat tanpa npm: const m = { exports: {} }; new Function("module", "exports", src)(m, m.exports); PizZip = m.exports
const PizZip = loadUmd("apps/feature-intel/assets/vendor/pizzip.min.js");
const tpl = fs.readFileSync("apps/feature-intel/assets/brd-template.docx");
const out = brdDocx(PizZip, tpl, brdParse("{}", sk));
const z = new PizZip(out), doc = z.file("word/document.xml").asText();
assert.ok(!/\{\{[fs]:/.test(doc), "tidak ada penanda tersisa");
assert.equal(z.file("word/header1.xml").asText(), new PizZip(tpl).file("word/header1.xml").asText(), "kepala halaman utuh");
assert.equal(z.file("word/footer1.xml").asText(), new PizZip(tpl).file("word/footer1.xml").asText(), "kaki halaman utuh");
assert.ok((doc.match(/<w:tbl>/g) || []).length > 13, "tabel template + tabel isi");
assert.match(doc, /IT-BRD-2026-___ \(akan ditetapkan\)/);
assert.match(doc, /Harus ada &lt;jadwal&gt; &amp; &quot;pause&quot;/);   // escape dari sections uji Task 4
assert.match(doc, /Lampiran E – Referensi Kompetitor/);
for (const t of ["w:p", "w:tbl", "w:tr", "w:tc", "w:r"])                   // XML tetap seimbang
  assert.equal((doc.match(new RegExp(`<${t}[ >]`, "g")) || []).length, (doc.match(new RegExp(`</${t}>`, "g")) || []).length, t);
```

- [ ] **Step 3: Jalankan** → gagal.
- [ ] **Step 4: Implementasi `brd-docx.js`**: ganti tiap `<w:p>` yang memuat penanda dengan OOXML yang dibangkitkan: paragraf (`ringkasan`), butir "•" dengan indentasi seperti paragraf "•   " template (`tujuan`, `ruang_lingkup`, `keamanan`, `open_items` bernomor, `lampiran`), sub-judul modul tebal + tabel BR (`kebutuhan`), tabel 3 kolom `definisi` (Metrik/Bahasa Indonesia/English; kosong → paragraf "Tidak ada"), `pemangku` (Nama kosong/Jabatan/Tugas), `kendala`, `tambahan`, `jadwal` (Fase/Aktivitas/Durasi `___`/Target `___`), `persetujuan` (tabel 3 kolom Diajukan/Diketahui/Disetujui dengan baris nama `(_________________)` dan baris jabatan Project Manager / Head Department / Associate Director, persis contoh). Semua teks lewat `xmlEsc`. File lain di zip tidak disentuh.
- [ ] **Step 5: Jalankan** → lolos. Lalu buka hasil uji di Word (`node apps/feature-intel/tools/tag-template.mjs --sample out.docx` boleh ditambahkan) dan cek manual: terbuka tanpa peringatan perbaikan, kepala/kaki halaman sama dengan template. Laporkan bila tidak bisa dicek.
- [ ] **Step 6: Commit** `"Feature Intelligence: unduh BRD Word dengan mengisi template F-IT-BRD-0624-00"`

---

### Task 6: Report management

**Files:**
- Modify: `apps/feature-intel/worker.js`, `apps/feature-intel/test.mjs`

**Interfaces:**
- Produces: `GET /api/report?from=YYYY-MM-DD&to=YYYY-MM-DD` (editor) → `{ from, to, launched: [{ competitor, feature, area, launched_at, url }], features: [...seperti /api/features], pursued: [{ feature, priority, brd: { title, status } | null }] }`; `launched` difilter `launched_at` bukti terverifikasi dalam rentang (bawaan 3 bulan terakhir WIB). `POST /api/report/summary` `{ from, to, feature_ids }` → `{ text }` (AI, ≤ 5 paragraf, dibatasi `FT_AI_DAILY`).

- [ ] **Step 1: Tulis tes gagal**: bukti 2026-07-15 tidak masuk rentang `2026-08-01..2026-10-31`, bukti 2026-10-01 masuk; fitur `decision='Kejar'` muncul di `pursued` dengan `brd.status` dari `ft_brds` yang memuat id-nya; `from > to` → 400; viewer → 403.
- [ ] **Step 2: Jalankan** → gagal. **Step 3: Implementasi.** **Step 4: Jalankan** → lolos.
- [ ] **Step 5: Commit** `"Feature Intelligence: data & ringkasan AI untuk report management"`

---

### Task 7: Halaman (Temuan, Perbandingan, BRD, Report, Pengaturan)

**Files:**
- Modify: `apps/feature-intel/page.html`, `apps/feature-intel/i18n.js`

**Interfaces:**
- Consumes: semua API Task 2–6; `brdDocx` dari `/brd-docx.js` dan PizZip dari `/vendor/pizzip.min.js`, template dari `/brd-template.docx` (aset statis).

- [ ] **Step 1: Bangun halaman** dengan gaya `GLASS_CSS` (lihat `apps/link-qr/page.html` untuk kerangka, tab, form, dan pemanggilan API). Tab dan isinya sesuai spec "Alur dan layar":
  - **Temuan** (bawaan): kartu per bukti dengan aksi Gabung / Jadikan fitur baru / Tolak. Tanggal peluncuran terisi bawaan dari bukti dan wajib. Ada tombol + Tambah manual dengan screenshot dikompres di browser.
  - **Perbandingan**: tabel per area, kolom Stockbit/IPOT/iKISI, filter, dan panel detail dengan tombol Buat BRD.
  - **BRD**: daftar, form arahan, editor per bagian (teks/tabel sederhana), tombol Tulis ulang dengan AI per bagian, Versi, Status, dan Unduh Word. Nama file: `BRD_<judul>_v<versi>.docx`.
  - **Report**: rentang tanggal, centang fitur, ringkasan AI yang bisa disunting, dan Simpan PDF. Tampilan cetak memakai `@media print`, logo `/brand/ikisi-color.png`, periode, dan tanggal dibuat.
  - **Pengaturan** (admin): kompetitor (nama, play_id, appstore_id, ig_account, aktif), status scan per sumber, dan Scan sekarang. Tampilkan peringatan bila `ig_account` tidak ada di `ci_content`.
  - Viewer tidak melihat tombol yang mengubah data.
- [ ] **Step 2: Kamus EN** untuk semua teks baru di `i18n.js`.
- [ ] **Step 3: Cek di browser** (skill `run`, atau `npx wrangler dev` di `apps/feature-intel` dengan `--var SSO_SECRET:...` dan D1 lokal). Jalankan alur: tambah manual → perbandingan → buat BRD → draf AI (tanpa kunci AI: pesan gagal tampil rapi) → Unduh Word → Report → Simpan PDF. Cek juga lebar HP 375 px. Laporkan yang tidak bisa dicek.
- [ ] **Step 4: Commit** `"Feature Intelligence: halaman Temuan, Perbandingan, BRD, Report, Pengaturan + kamus EN"`

---

### Task 8: Sambungkan ke Tool Hub & deploy

**Files:**
- Modify: `apps/tool-hub/worker.js` (entri `APPS` setelah `competitor`), `apps/tool-hub/i18n.js`, `scripts/deploy.mjs` (`APPS` setelah `content`, sebelum `cron`; `AI_APPS` + `"feature"`), `apps/tool-hub/test.mjs` bila ada pengecekan jumlah/daftar tool

**Interfaces:**
- Consumes: worker `feature-intel` (Task 1–7).

- [ ] **Step 1: Entri hub**: `{ id: 'feature', name: 'Feature Intelligence', desc: 'Fitur aplikasi kompetitor, perbandingan, BRD & report', cat: 'research', icon: 'target', blurb, features: [...6 butir dari spec], ai: 'Temukan fitur dari IG & catatan rilis, draf BRD & ringkasan report', kw: 'fitur kompetitor stockbit ipot brd requirement it produk perbandingan', levels: { viewer: 'Lihat saja', editor: 'Editor', admin: 'Admin' }, guide: {tasks, faq} }`. `guide` mengikuti bentuk entri `planner`, dengan tugas: Verifikasi temuan, Tambah fitur manual, Bandingkan & putuskan, Buat BRD & unduh Word, Buat report. Tidak ada service binding hub dan tidak ada kartu "Hari ini" (tidak diminta; spec menyebut binding hub, tapi tanpa kartu "Hari ini" binding itu tidak dipakai).
- [ ] **Step 2: Jalankan** `node apps/tool-hub/test.mjs && node apps/cron/test.mjs && node apps/feature-intel/test.mjs && node scripts/deploy.mjs --dry-run`. Semua harus lolos dan bundel `feature-intel` ikut tercek.
- [ ] **Step 3: Commit** `"Tool Hub: tambah Feature Intelligence (Riset), deploy & AI key"`
- [ ] **Step 4: Deploy hanya atas perintah pengguna.** Urutannya `node scripts/deploy.mjs feature cron hub`, lalu `node scripts/deploy.mjs secrets feature` dan `ai-keys`. Setelah itu admin hub memberi akses tim produk.
