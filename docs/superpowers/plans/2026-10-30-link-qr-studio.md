# Link & QR Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tool baru Link & QR Studio (worker `go`): link pendek + QR hijau berlogo 友 untuk kegiatan/Program Content Planner, klik dihitung per hari, total klik masuk ke Planner (Program = gabungan kegiatan di bawahnya).

**Architecture:** Worker baru `apps/link-qr` (nama `go`, D1 `go-db`) dengan pengalih publik `/<kode>`. Link-QR memanggil Content Planner lewat service binding `PLANNER`: membaca pilihan kegiatan (`/__hub/link-items`) dan mendorong total klik per kegiatan (`/__hub/link-clicks`, nilai absolut, disimpan `MAX`). Planner menjumlahkan klik `/go/` lama + klik Studio, dengan roll-up Program. Tombol buat link di Planner diganti "Buat di Link & QR Studio" (`toolhub-open`).

**Tech Stack:** Cloudflare Workers + D1, JavaScript ES modules tanpa build, qrcode-generator 1.4.4 (cdnjs), tes Node 22 (`node:sqlite`).

**Spec:** `docs/superpowers/specs/2026-10-30-link-qr-studio-design.md`

## Global Constraints

- Balasan UI berbahasa Indonesia; setiap teks baru punya terjemahan di `i18n.js` tool itu; `node scripts/i18n-check.mjs` lolos.
- `apps/tool-hub/worker.js` memakai CRLF; edit dengan Edit tool, jangan ubah akhir baris.
- Id tool di Hub/deploy/profile = `go`; nama worker = `go`; folder `apps/link-qr`; HUBSSO `APP = "go"`, cookie `hub_go`.
- Kode link: 6 huruf dari `abcdefghijkmnpqrstuvwxyz23456789` (tanpa `l`, `o`, `0`, `1`); rute pengalih `^/([a-km-np-z2-9]{6})$`.
- Kanal (kunci → label, utm_source, utm_medium): `poster` Poster/cetak `poster` `cetak`; `instagram` Instagram `instagram` `social`; `whatsapp` WhatsApp `whatsapp` `social`; `iklan` Iklan `iklan` `ads`; `email` Email `email` `email`; `lainnya` Lainnya `lainnya` `lainnya`. `utm_campaign` = slug judul kegiatan (pola `slug` Planner), `utm_content` = kode. UTM yang sudah ada tidak ditimpa.
- Link tujuan hanya `http:`/`https:`, maks 500 karakter. Tujuan tidak bisa diubah setelah dibuat (tidak ada endpoint ubah tujuan).
- Bot tidak dihitung: regex `BOT_UA` disalin dari `apps/content-planner/worker.js` (diekspor juga dari Link-QR); hanya `GET` yang dihitung.
- Hari klik = tanggal WIB (`new Date(now + 7*3600e3).toISOString().slice(0,10)`); `env.NOW_MS` boleh menimpa waktu untuk tes (pola Brand Kit).
- Regional = `isRegional(org, me.j, me.adm)` dari `shared/jobs.js` dengan `org` dari sinkron Hub; regional hanya jenis `cabang` dan `galeri`.
- Menonaktifkan/mengaktifkan: pembuat (`created_email`), Head (`roleIn(org, me.j).head`), atau admin hub.
- Pengalih: `cache-control: no-store`, `x-robots-tag: noindex`; tidak pernah membaca tujuan dari query.
- QR: koreksi error `H`, warna modul `#14532d` di latar putih, zona tenang 4 modul, kotak putih + `truefriend-mark.png` = 20% lebar simbol; PNG 1200 px; SVG berisi logo sebagai data URI.
- Tanpa cron baru, tanpa layanan berbayar.
- Commit berbahasa Indonesia, diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Jangan push tanpa izin.

## Review Focus

1. **Open redirect:** `/<kode>?to=https://jahat.test` dan path aneh (`/abc`, `/ABCDEF`, `/logout`) tidak pernah mengalihkan ke alamat luar; tujuan `javascript:`/`data:` ditolak saat dibuat. Tes di Task 3 & 4.
2. **Planner mati / lambat:** pengalih tetap 302 seketika; dorongan klik di `waitUntil`, galat ditelan. Tes di Task 3.
3. **Regional membuat link ke Program lewat API langsung** (bukan lewat UI): server memeriksa kegiatan ke Planner dengan `reg=1`, bukan mempercayai `kind` dari klien. Tes di Task 4.
4. **Kegiatan dihapus di Planner:** link tetap mengalihkan; daftar menandai `gone`. Tes di Task 3 & 4.
5. **Dorongan klik datang tidak berurutan** (total lama tiba setelah total baru): Planner menyimpan `MAX`, angka tidak turun. Tes di Task 1.

---

### Task 1: Content Planner — endpoint untuk Link-QR dan klik gabungan

**Files:**
- Modify: `apps/content-planner/worker.js` (tabel di `ensure` ±baris 168; `CLICKS` baris 262; `programReport` ±baris 840; rute `/__hub/*` ±baris 1072)
- Test: `apps/content-planner/test.mjs` (tambah blok sebelum `console.log("semua cek lolos")`)

**Interfaces:**
- Produces:
  - Tabel `qrclicks (item_id TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, at TEXT)`.
  - `GET /__hub/link-items` (`hubFeedAllowed`): `?reg=1` batasi ke `REG_SQL`; `?q=` cari judul (`LIKE`, maks 60 karakter); `?ids=a,b` (maks 200) ambil kegiatan tertentu. Kembali `{ items: [{ id, kind, title, date, branch, status }] }`; tanpa `ids`: urut `date DESC, created_at DESC`, `LIMIT 50`. Semua status termasuk selesai/batal.
  - `POST /__hub/link-clicks` (`hubPushAllowed`): body `{ items: { "<item_id>": <total>, ... } }` (maks 200 entri, angka dibulatkan ≥0). Simpan `ON CONFLICT(item_id) DO UPDATE SET n = MAX(n, excluded.n), at = excluded.at` hanya untuk kegiatan yang ada. Kembali `{ ok: true, gone: [<item_id yang tidak ada>] }`.
  - `CLICKS` baru = klik sendiri (`links` lama + `qrclicks`), ditambah untuk `kind = 'program'` jumlah klik sendiri semua kegiatan dengan `program_id = items.id`. Tetap bernilai `NULL` bila semua nol (supaya tampilan lama tidak berubah):

```js
const OWN = (t) => `COALESCE((SELECT SUM(clicks) FROM links WHERE links.item_id = ${t}.id), 0) + COALESCE((SELECT n FROM qrclicks WHERE qrclicks.item_id = ${t}.id), 0)`;
const CLICKS = `NULLIF(${OWN("items")} + CASE WHEN items.kind = 'program' THEN COALESCE((SELECT SUM(${OWN("c")}) FROM items c WHERE c.program_id = items.id), 0) ELSE 0 END, 0) AS clicks`;
```
  - `programReport` memilih `items.*, ${CLICKS}` untuk program dan kegiatan terkaitnya.

- [ ] **Step 1: Tulis tes yang gagal** (di `test.mjs`, pakai helper yang sudah ada: `planner`, `env`, `call`, kunci `SECRET`; buat Program `P`, kegiatan `K` dengan `program_id = P`, kegiatan cabang `C`):

```js
const hubGet = (p) => planner.fetch(new Request(BASE + p, { headers: { "x-hub-key": SECRET } }), env, { waitUntil() {} });
const hubPost = (p, b) => planner.fetch(new Request(BASE + p, { method: "POST", headers: { "x-hub-key": SECRET, "content-type": "application/json" }, body: JSON.stringify(b) }), env, { waitUntil() {} });
assert.equal((await planner.fetch(new Request(BASE + "/__hub/link-items"), env, { waitUntil() {} })).status, 403, "tanpa kunci ditolak");
let LI = (await (await hubGet("/__hub/link-items?reg=1")).json()).items;
assert.ok(LI.every((i) => ["cabang", "galeri"].includes(i.kind)) && LI.some((i) => i.id === C), "regional: hanya cabang & galeri");
LI = (await (await hubGet("/__hub/link-items")).json()).items;
assert.ok(LI.some((i) => i.id === P), "non-regional: Program ikut");
assert.deepEqual((await (await hubGet("/__hub/link-items?ids=" + K + ",hilang")).json()).items.map((i) => i.id), [K]);
let r2 = await (await hubPost("/__hub/link-clicks", { items: { [K]: 5, [P]: 2, hilang: 9 } })).json();
assert.deepEqual(r2.gone, ["hilang"]);
await hubPost("/__hub/link-clicks", { items: { [K]: 3 } });   // datang terlambat: tidak menurunkan
const getIt = async (id) => (await call("/api/items?id=" + id, { ck: CI })).j;
assert.equal((await getIt(K)).clicks, 5, "MAX, tidak turun");
assert.equal((await getIt(P)).clicks, 7, "Program = 2 sendiri + 5 kegiatan terkait");
const PR = (await call(`/api/program-report?id=${P}`, { ck: CI })).j.programs[0];
assert.equal(PR.clicks, 7); assert.equal(PR.items.find((i) => i.id === K).clicks, 5);
```

(Sesuaikan nama variabel cookie/helper dengan yang sudah ada di file; `C` dibuat lewat `/api/items` dengan `kind: "cabang"` oleh akun yang sudah dipakai tes lain.)

- [ ] **Step 2: Jalankan, pastikan gagal**
  Run: `node apps/content-planner/test.mjs`
  Expected: FAIL pada `tanpa kunci ditolak` (status 404, bukan 403) atau setelahnya.

- [ ] **Step 3: Implementasi** tabel, `linkItems(env, q)`, `linkClicks(env, b)`, `CLICKS` baru, `programReport` dengan `${CLICKS}`, dan dua rute di sebelah `/__hub/event-items`.

- [ ] **Step 4: Jalankan, pastikan lolos**
  Run: `node apps/content-planner/test.mjs`
  Expected: `semua cek lolos`.

- [ ] **Step 5: Commit**
  `git add apps/content-planner/worker.js apps/content-planner/test.mjs && git commit -m "Content Planner: pilihan kegiatan & klik dari Link & QR Studio (Program menggabungkan kegiatan terkait)"`

---

### Task 2: Content Planner — tombol ke Studio dan kolom klik di laporan

**Files:**
- Modify: `apps/content-planner/page.html` (baris 373 `lkAddRow`; `loadLinks` ±953; `lkAdd` ±987; reset ±1026; laporan konten ±1246; Program `pk` ±1287 & `rekap` ±1298)
- Modify: `apps/content-planner/i18n.js`
- Test: `apps/content-planner/test.mjs`

**Interfaces:**
- Consumes: `clicks` pada kegiatan & Program dari Task 1.
- Produces: tombol `#lkStudio` yang mengirim `parent.postMessage({ type: "toolhub-open", app: "go", path: "/?item=" + encodeURIComponent(id) }, "*")`; tampil hanya bila `HUBAPPS.includes("go")` dan kegiatan sudah tersimpan. Bila tidak punya akses: teks "Minta akses Link & QR Studio ke admin untuk membuat link baru."

- [ ] **Step 1: Tes gagal** — halaman tidak lagi punya form buat link `/go/`, punya tombol Studio:

```js
const html = await (await planner.fetch(new Request(BASE + "/", { headers: { cookie: CI } }), env, { waitUntil() {} })).text();
assert.ok(!html.includes('id="lkTarget"') && html.includes('id="lkStudio"'), "buat link pindah ke Link & QR Studio");
assert.ok(html.includes('"toolhub-apps"'), "halaman mendengar daftar tool");
```

- [ ] **Step 2: Jalankan** `node apps/content-planner/test.mjs` → Expected: FAIL `buat link pindah ke Link & QR Studio`.
- [ ] **Step 3: Implementasi:**
  - Ganti isi `lkAddRow` dengan tombol `<button type="button" class="btn sm" id="lkStudio" hidden>Buat di Link & QR Studio</button>` + `<span class="muted small" id="lkAsk" hidden>…</span>`; hapus handler `lkAdd`, `lkTarget`, `lkUtm` (daftar link lama + tombol Salin tetap).
  - `let HUBAPPS=[]` + listener `toolhub-apps` (pola `apps/event-lead/page.html:268-271`), panggil ulang `loadLinks` saat daftar tiba.
  - Laporan konten (baris 1246) tambah kolom `["Klik",i=>int(i.clicks)]`; Program `pk` tambah `["Klik link",int(p.clicks),"termasuk kegiatan terkait"]`; `rekap` tambah `["Klik",p=>int(p.clicks),1,.8]` (kecilkan lebar kolom lain bila tabel melebar).
  - Teks baru ke `i18n.js`: "Buat di Link & QR Studio", "Minta akses Link & QR Studio ke admin untuk membuat link baru.", "termasuk kegiatan terkait", "Klik".
- [ ] **Step 4: Jalankan** `node apps/content-planner/test.mjs && node scripts/i18n-check.mjs` → Expected: `semua cek lolos`, i18n tanpa `✗`.
- [ ] **Step 5: Commit** `git commit -m "Content Planner: buat link lewat Link & QR Studio, klik tampil di laporan konten & Program"` (API `/api/links` lama dibiarkan untuk link yang sudah ada.)

---

### Task 3: Link-QR — kerangka worker, sinkron Hub, pengalih publik

**Files:**
- Create: `apps/link-qr/wrangler.jsonc` (`name "go"`, `main worker.js`, `compatibility_date "2026-09-22"`, `assets ./assets`, D1 `DB` → `go-db` `"auto"`, service `PLANNER` → `content-planner`)
- Create: `apps/link-qr/worker.js`, `apps/link-qr/i18n.js` (export default `{}` dulu), `apps/link-qr/page.html` (kerangka kosong), `apps/link-qr/assets/brand/truefriend-mark.png` dan `kisi-color.png` (salin dari `brand/`)
- Test: `apps/link-qr/test.mjs` (helper `d1()` + hook `.html` disalin dari `apps/brand-kit/test.mjs`; `PLANNER` = worker Planner asli dengan D1 sendiri, dibungkus pencatat panggilan)

**Interfaces:**
- Produces (diekspor dari `worker.js`): `BOT_UA`, `CODE_RE = /^\/([a-km-np-z2-9]{6})$/`, `KANAL` (tabel Global Constraints), `wibDay(ms) -> "YYYY-MM-DD"`.
- Tabel: `cfg (k PRIMARY KEY, v)`; `links (code TEXT PRIMARY KEY, item_id TEXT NOT NULL, item_kind TEXT, item_title TEXT, gone INTEGER DEFAULT 0, target TEXT NOT NULL, channel TEXT, name TEXT, utm INTEGER, active INTEGER DEFAULT 1, clicks INTEGER DEFAULT 0, created_by TEXT, created_email TEXT, created_at TEXT, off_by TEXT, off_at TEXT)`, indeks `links(item_id)`; `daily (code TEXT, day TEXT, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (code, day))`.
- `POST /__hub/users` (`hubPushAllowed`) menyimpan `users`, `branches`, `org` di `cfg` (pola `syncFromHub` Brand Kit). `whoAmI(env, sess)` seperti Brand Kit (`adm` dari daftar Hub, `head` dari `roleIn`).
- `async function pushClicks(env, itemIds) -> { gone: string[] }`: hitung `SUM(clicks)` per `item_id`, POST ke `PLANNER /__hub/link-clicks` dengan `x-hub-key`, batas waktu 5 dtk; set `gone = 1` untuk id di `gone`. Galat → log, kembali `{ gone: [] }`.
- `GET /<kode>` (sebelum pemeriksaan login):
  - tidak ada → 404 halaman sederhana "Link tidak ditemukan." (logo `kisi-color.png`);
  - `active = 0` → 410 halaman logo + "Link ini sudah tidak aktif" + tombol ke `profile(env).contact.website` (tombol disembunyikan bila kosong), tidak dihitung;
  - aktif → 302 `location: target`; bila `GET` dan UA bukan bot: `ctx.waitUntil(count(env, code, item_id))` = `UPDATE links SET clicks = clicks + 1`, upsert `daily` hari WIB `n = n + 1`, lalu `pushClicks(env, [item_id])`.

- [ ] **Step 1: Tes gagal** (`test.mjs`): sinkron Hub (403 tanpa kunci, 200 dengan kunci); masukkan baris `links` langsung ke D1 (`code "abcdef"`, aktif, `item_id` = kegiatan Planner `K`) dan `"zzzzzz"` nonaktif; lalu:

```js
const go = (p, ua = "Mozilla/5.0", method = "GET") => { const W = []; return worker.fetch(new Request(BASE + p, { method, headers: { "user-agent": ua } }), env, { waitUntil: (x) => W.push(x) }).then(async (r) => (await Promise.all(W), r)); };
let r = await go("/abcdef?to=https://jahat.test");
assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "https://tujuan.test/a"); assert.equal(r.headers.get("cache-control"), "no-store");
await go("/abcdef", "WhatsApp/2.23"); await go("/abcdef", "Mozilla/5.0", "HEAD");
assert.equal(env.DB.db.prepare("SELECT clicks FROM links WHERE code='abcdef'").get().clicks, 1, "bot & HEAD tidak dihitung");
assert.equal(env.DB.db.prepare("SELECT n FROM daily WHERE code='abcdef' AND day=?").get(wibDay(NOW)).n, 1);
assert.equal(plannerCalls.at(-1).url, "https://content-planner/__hub/link-clicks"); assert.equal(plannerCalls.at(-1).key, SECRET);
assert.equal((await go("/zzzzzz")).status, 410, "nonaktif");
assert.equal(env.DB.db.prepare("SELECT clicks FROM links WHERE code='zzzzzz'").get().clicks, 0);
for (const p of ["/abc", "/ABCDEF", "/abcde1", "/logout"]) assert.notEqual((await go(p)).status, 302, p);
envDown.PLANNER = { fetch: () => Promise.reject(new Error("mati")) };   // env lain yang memakai DB sama
assert.equal((await worker.fetch(new Request(BASE + "/abcdef"), envDown, { waitUntil: (x) => x })).status, 302, "Planner mati: tetap dialihkan");
// kegiatan dihapus di Planner -> link tetap jalan, ditandai gone
plannerEnv.DB.db.prepare("DELETE FROM items WHERE id=?").run(K); await go("/abcdef");
assert.equal(env.DB.db.prepare("SELECT gone FROM links WHERE code='abcdef'").get().gone, 1);
```

- [ ] **Step 2: Jalankan** `node apps/link-qr/test.mjs` → Expected: FAIL (modul `./worker.js` belum ada).
- [ ] **Step 3: Implementasi** kerangka (HUBSSO disalin dari Brand Kit dengan `APP = "go"`), `ensure`, sinkron, pengalih, `count`, `pushClicks`, halaman 404/410 (HTML kecil inline, gaya terang/gelap via `prefers-color-scheme`, gambar dari `/brand/...`).
- [ ] **Step 4: Jalankan** `node apps/link-qr/test.mjs` → Expected: `semua cek lolos`.
- [ ] **Step 5: Commit** `git add apps/link-qr && git commit -m "Link & QR Studio: kerangka, sinkron Tool Hub, pengalih publik & hitung klik"`

---

### Task 4: Link-QR — API buat, daftar, statistik, nonaktif

**Files:**
- Modify: `apps/link-qr/worker.js`
- Test: `apps/link-qr/test.mjs`

**Interfaces:**
- Consumes: Planner `/__hub/link-items` dan `/__hub/link-clicks` (Task 1); `pushClicks`, `KANAL`, tabel (Task 3).
- Produces (semua butuh sesi; POST wajib `HUBSSO.sameOrigin`):
  - `GET /api/items?q=` → `{ items }` dari Planner dengan `reg=1` bila regional; `?id=` → `{ item }` atau 404. Planner tak terjangkau → `{ items: [], off: true }` / 502.
  - `POST /api/links` `{ item_id, target, channel, name?, utm? (bawaan true) }` → `{ code, url, target }`. Kegiatan diperiksa ke Planner (`ids=<item_id>` + `reg` sesi); tidak ada/terlarang → 400 "Kegiatan tidak ditemukan atau tidak bisa kamu pilih." `channel` harus kunci `KANAL`; `name` ≤ 60. `url = appUrl(env, "go") + "/" + code`. `utmUrl(target, title, channel, code)` diekspor.
  - `GET /api/links?item=&mine=1&state=active|off` → `{ links: [...], gone: [...] }`: regional hanya `item_kind IN ('cabang','galeri')`; urut `created_at DESC`, `LIMIT 300`; tiap link membawa `can` (boleh nonaktifkan). Setelah membaca, perbarui `item_title`/`item_kind`/`gone` dari Planner (`ids=`) dan `ctx.waitUntil(pushClicks(env, itemIds))` (memperbaiki dorongan yang dulu gagal; Planner menyimpan `MAX`).
  - `GET /api/stats?code=` atau `?item=` dan `days=30|90` (bawaan 30) → `{ days: [{ day, n }] }` lengkap per hari (hari tanpa klik = 0), hanya untuk link yang boleh dilihat.
  - `POST /api/links/active` `{ code, active: boolean }` → `{ ok: true }`; selain pembuat/Head/admin → 403 "Hanya pembuat link, Head, atau admin yang bisa mengubah status link." `target` tidak pernah disentuh.

- [ ] **Step 1: Tes gagal** — akun: `SARI` (tim non-regional, pembuat), `REG` (role tim regional), `HEAD` (role head), `ADMIN`; sesi dibuat dengan tiket HUBSSO (pola `apps/brand-kit/test.mjs`). Kasus:

```js
assert.equal((await api(SARI, "/api/links", { item_id: K, target: "javascript:alert(1)", channel: "poster" })).status, 400);
assert.equal((await api(SARI, "/api/links", { item_id: K, target: "https://x.test", channel: "fax" })).status, 400);
let c = (await api(SARI, "/api/links", { item_id: K, target: "https://x.test/p?utm_source=lama", channel: "instagram", name: "Caption IG 1" })).j;
assert.match(c.code, /^[a-km-np-z2-9]{6}$/); assert.equal(c.url, BASE + "/" + c.code);
const t = new URL(c.target); assert.equal(t.searchParams.get("utm_source"), "lama"); assert.equal(t.searchParams.get("utm_medium"), "social"); assert.equal(t.searchParams.get("utm_content"), c.code);
assert.equal(new URL((await api(SARI, "/api/links", { item_id: K, target: "https://x.test", channel: "poster", utm: false })).j.target).search, "");
assert.equal((await api(REG, "/api/links", { item_id: P, target: "https://x.test", channel: "poster" })).status, 400, "regional tidak bisa menempel ke Program lewat API");
assert.ok((await api(REG, "/api/links?item=" + K)).j.links.length === 0, "regional tidak melihat link kegiatan pusat");
assert.equal((await api(REG, "/api/links/active", { code: c.code, active: false })).status, 403);
assert.equal((await api(HEAD, "/api/links/active", { code: c.code, active: false })).status, 200);
assert.equal((await go("/" + c.code)).status, 410);
await api(SARI, "/api/links/active", { code: c.code, active: true });
assert.equal((await go("/" + c.code)).headers.get("location"), c.target, "aktif lagi, tujuan tetap");
const S = (await api(SARI, "/api/stats?code=" + c.code + "&days=30")).j.days;
assert.equal(S.length, 30); assert.equal(S.at(-1).n, 1);
assert.equal((await api(SARI, "/api/links", { item_id: K, target: "https://x.test", channel: "poster" }, { origin: "https://jahat.test" })).status, 403, "CSRF");
```

- [ ] **Step 2: Jalankan** `node apps/link-qr/test.mjs` → Expected: FAIL pada baris pertama blok baru (404).
- [ ] **Step 3: Implementasi** rute dan fungsi di atas (kode unik: coba 4× `INSERT OR IGNORE`, pola `saveLink` Planner).
- [ ] **Step 4: Jalankan** `node apps/link-qr/test.mjs` → Expected: `semua cek lolos`.
- [ ] **Step 5: Commit** `git commit -m "Link & QR Studio: buat link (UTM otomatis), daftar, grafik harian, nonaktifkan"`

---

### Task 5: Link-QR — halaman

**Files:**
- Modify: `apps/link-qr/page.html`, `apps/link-qr/i18n.js`, `apps/link-qr/worker.js` (fungsi `page(env, me, org)`: sisipkan `window.LQ = { me, kanal, base, website }`, `themeHead`, `profileScript`, `HUBSSO.onlyInHub`, CSP `HUBSSO.frame`)
- Test: `apps/link-qr/test.mjs`

**Interfaces:**
- Consumes: API Task 4.
- Produces: halaman satu layar (gaya dan token warna seperti `apps/brand-kit/page.html`, target sentuh ≥44 px, nyaman di 360 px):
  - **Buat link:** pencarian kegiatan (`/api/items?q=`, debounce 250 ms, tampil judul · jenis · tanggal); `?item=<id>` di alamat → kegiatan terpilih otomatis (`/api/items?id=`). Isian link tujuan, kanal (6 tombol pilihan), nama singkat, centang "Tambah UTM otomatis" (menyala). Tombol Buat → kartu hasil: link pendek + Salin, QR, Unduh PNG, Unduh SVG.
  - **QR:** `qrcode(0,"H")`; fungsi `qrSvg(text, markDataUri) -> string` dan `qrPng(text, markImg) -> Promise<Blob>` (1200 px) sesuai Global Constraints; logo dimuat sekali dari `/brand/truefriend-mark.png` (data URI untuk SVG). Nama file `qr-<kode>.png/svg`.
  - **Daftar:** filter kegiatan (dari hasil), "Buatanku", Aktif/Nonaktif; baris: nama/kanal, kegiatan (+ label "Kegiatan sudah dihapus di Planner" bila `gone`), link pendek, total klik, tombol QR, Grafik, Nonaktifkan/Aktifkan (bila `can`).
  - **Grafik:** batang SVG per hari dari `/api/stats` (30/90 hari), sumbu tanggal tiap 7 hari, total di judul; tersedia per link dan per kegiatan.
  - Teks Planner tidak terjangkau: "Content Planner tidak bisa dihubungi. Coba lagi sebentar."

- [ ] **Step 1: Tes gagal** — halaman untuk sesi sah:

```js
const h = await (await get(SARI, "/")).text();
assert.ok(h.includes("window.LQ=") && h.includes("qrcode-generator/1.4.4") && h.includes('qrcode(0,"H")'), "halaman Studio");
assert.equal((await get(null, "/")).status, 303, "tanpa sesi -> login Hub");
```

- [ ] **Step 2: Jalankan** → Expected: FAIL `halaman Studio`.
- [ ] **Step 3: Implementasi** halaman + kamus `i18n.js` untuk semua teks baru.
- [ ] **Step 4: Jalankan** `node apps/link-qr/test.mjs && node scripts/i18n-check.mjs` → lolos. Lalu cek visual dengan Chrome headless (salin pola `bk-harness.mjs` di scratchpad: jalankan worker lewat `wrangler dev` atau render statis dengan data tiruan) untuk tema terang/gelap dan lebar 360 px; pindai QR hasil unduhan dengan kamera HP atau `zbarimg` bila ada.
- [ ] **Step 5: Commit** `git commit -m "Link & QR Studio: halaman (buat link, QR PNG/SVG berlogo, daftar, grafik harian)"`

---

### Task 6: Tool Hub, deploy, README

**Files:**
- Modify: `apps/tool-hub/worker.js` (CRLF): entri `APPS` setelah `brand`: `{ id: 'go', name: 'Link & QR Studio', desc: 'Link pendek & QR berlogo, klik per kegiatan', cat: 'campaign', icon: 'qr', blurb, features, kw }`; sinkron `await post(env.LINK, 'go', 'Link & QR Studio', users.filter(... has(x, 'go') ...).map(row))`
- Modify: `apps/tool-hub/wrangler.jsonc` (`{ "binding": "LINK", "service": "go" }`), `apps/tool-hub/shell.html` (ikon `qr`: `'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>'`), `apps/tool-hub/i18n.js`, `apps/tool-hub/test.mjs` (`IDS` + `"go"`, binding `LINK` ke worker Link-QR asli, cek sekali kirim ke `https://go/__hub/users`)
- Modify: `scripts/deploy.mjs` (`{ id: "go", dir: "apps/link-qr" }` tepat setelah `planner`, dengan komentar alasan)
- Modify: `README.md` (baris tabel + bagian "### Link & QR Studio": cara pakai, alamat `go.<subdomain>.workers.dev`, klik masuk ke Planner)
- `.secrets.example.json`: tidak berubah (`SSO_SECRET` dari `"*"`).

- [ ] **Step 1: Tes gagal** di `apps/tool-hub/test.mjs`: hub mengenal 17 tool dan sinkron mengirim ke `https://go/__hub/users` dengan kunci.
- [ ] **Step 2: Jalankan** `node apps/tool-hub/test.mjs` → Expected: FAIL.
- [ ] **Step 3: Implementasi** semua perubahan di atas.
- [ ] **Step 4: Jalankan semua:**
  `node apps/tool-hub/test.mjs && node apps/content-planner/test.mjs && node apps/link-qr/test.mjs && node apps/event-lead/test.mjs && node apps/brand-kit/test.mjs && node scripts/i18n-check.mjs && node scripts/deploy.mjs --dry-run`
  Expected: semua `semua cek lolos`, i18n tanpa `✗`, dry-run tanpa galat untuk `go`.
- [ ] **Step 5: Commit** `git commit -m "Link & QR Studio: daftar di Tool Hub, urutan deploy, README"`

---

## Setelah semua task

Review akhir seluruh cabang → satu putaran perbaikan → minta izin push → deploy (GitHub Actions) → `node scripts/deploy.mjs secrets go` → cek langsung: `/` → 303 ke SSO Hub, `/api/links` → 401, `/abcdef` → 404, `/__hub/users` tanpa kunci → 403, Planner `/__hub/link-items` tanpa kunci → 403.
