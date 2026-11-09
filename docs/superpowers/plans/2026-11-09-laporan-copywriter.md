# Laporan Copywriter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laporan PDF/PPT pekerjaan copywriter (artikel, email blast, YouTube) dengan gambar otomatis dari link / Email Studio, angka YouTube otomatis, dan klik dari link pelacak.

**Architecture:** Content Planner mendapat pengambil gambar dari link (`/api/linkimg`, browser mengecilkan lalu `/api/img`), penyegar statistik YouTube (`/api/yt/refresh`, secret `YOUTUBE_API_KEY`), jalur hub `/__hub/email` (buat/perbarui kegiatan email blast + link pelacak + gambar), dan jenis laporan `cw` yang memakai blok `posts` dari Laporan IG. Email Studio mendapat tombol "📅 Catat ke Planner" (html2canvas 1.4.1) dan rute server `/api/planner` yang meneruskan lewat service binding `PLANNER`.

**Tech Stack:** Cloudflare Workers + D1, HTML/JS tanpa build, html2canvas 1.4.1 (cdnjs), YouTube Data API v3, test `node apps/content-planner/test.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-09-laporan-copywriter-design.md`

## Global Constraints
- Ambil URL dari luar hanya `https:`, host bukan IP literal / `localhost`; HTML maks. 1,5 MB, gambar maks. 5 MB, timeout 10 dtk; gambar hanya `image/jpeg|png|webp` (selain itu 415).
- Gambar yang disimpan lewat `imgOk` (sudah ada), ±480px (Planner) atau maks. 600×900 JPEG 0.8 (potret email).
- Laporan Copywriter hanya kegiatan dengan `owner_email` milik anggota ber-role `copy` (`users.role`).
- Artikel = `kind:"artikel"` (kanal Website/Blog = internal, Media partner = eksternal, Email / Newsletter = email blast); YouTube = `kind:"konten"` dengan link youtube.com / youtu.be.
- Tanpa jadwal otomatis: angka YouTube diambil saat kegiatan disimpan dan saat laporan disusun.
- Angka impor/API tidak menghapus angka lain (`COALESCE`, pola `importMetrics`).
- Literal `</script>` di string JS → `<\/script>`; teks UI baru + English di `i18n.js` tool masing-masing.
- Endpoint baru tidak masuk `REG_GET`/`REG_POST` (tim regional tidak bisa).

## Review Focus
- Link artikel tanpa `og:image` / situs memblokir → kegiatan tetap tersimpan, kotak gambar menampilkan "Gambar tidak ditemukan di link ini", tombol manual tetap ada.
- `YOUTUBE_API_KEY` belum dipasang / kuota habis / video privat → angka manual tidak terhapus, laporan tetap jadi.
- "Catat ke Planner" ditekan dua kali untuk email yang sama → satu kegiatan (diperbarui), link pelacak dipakai ulang bila tujuannya sama.
- Gambar banner dari host tanpa CORS → potret email tidak kosong melompong (proxy) atau tetap tersimpan tanpa gambar itu.
- Copywriter tanpa pekerjaan di periode → tiap bagian menulis "Belum ada … di periode ini.", PDF/PPT tetap jadi.

---

### Task 1: Planner — gambar dari link & statistik YouTube (server)

**Files:** Modify `apps/content-planner/worker.js` (COLS, router GET/POST, komentar kepala); Test `apps/content-planner/test.mjs`

**Interfaces — Produces:**
- `export function ytId(link) -> string` ("" bila bukan YouTube; watch?v=, youtu.be/, shorts/, embed/).
- `export function ogImage(html, base) -> string` (absolute https URL dari `og:image`/`og:image:secure_url`/`twitter:image`, "" bila tidak ada).
- `GET /api/linkimg?url=` → bytes gambar (content-type gambar) | 400 `{error}` (URL tidak sah) | 404 `{error:"Gambar tidak ditemukan di link ini."}` | 415.
- `POST /api/yt/refresh {ids:[itemId]}` → `{updated:n, skipped:"no-key"|undefined}`; mengisi `m_views,m_likes,m_comments` via COALESCE, `m_src='yt'`, `m_at=now`.
- Kolom `items.email_tpl TEXT`.

- [ ] **Step 1: Test gagal** (tambahkan setelah blok gambar Laporan IG; stub `globalThis.fetch` sementara lalu kembalikan):

```js
assert.equal(ytId("https://www.youtube.com/watch?v=abcDEF12345&t=3"), "abcDEF12345");
assert.equal(ytId("https://youtu.be/abcDEF12345"), "abcDEF12345");
assert.equal(ytId("https://youtube.com/shorts/abcDEF12345"), "abcDEF12345");
assert.equal(ytId("https://example.com/v=abc"), "");
assert.equal(ogImage('<meta property="og:image" content="/img/a.jpg">', "https://kisi.co.id/artikel/x"), "https://kisi.co.id/img/a.jpg");
assert.equal(ogImage('<meta name="twitter:image" content="https://cdn.x/b.png">', "https://x"), "https://cdn.x/b.png");
assert.equal(ogImage("<p>tanpa</p>", "https://x"), "");
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => String(u).includes("artikel")
  ? new Response('<meta property="og:image" content="https://cdn.test/a.jpg">', { headers: { "content-type": "text/html" } })
  : String(u).includes("googleapis.com/youtube")
  ? Response.json({ items: [{ id: "abcDEF12345", statistics: { viewCount: "1200", likeCount: "45", commentCount: "6" } }] })
  : new Response(new Uint8Array([255, 216, 255]), { headers: { "content-type": "image/jpeg" } });
r = await planner.fetch(new Request(BASE + "/api/linkimg?url=" + encodeURIComponent("https://kisi.test/artikel/a"), { headers: { cookie: CI } }), env);
assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/jpeg");
for (const bad of ["http://kisi.test/a", "https://127.0.0.1/a", "https://localhost/a", "javascript:alert(1)"])
  assert.equal((await planner.fetch(new Request(BASE + "/api/linkimg?url=" + encodeURIComponent(bad), { headers: { cookie: CI } }), env)).status, 400, bad);
const yid = (await call("/api/items", { ck: CI, body: { kind: "konten", channel: "YouTube", title: "Video", date: plus(2), status: "terbit", link: "https://youtu.be/abcDEF12345", m_shares: "3" } })).j.id;
assert.deepEqual((await call("/api/yt/refresh", { ck: CI, body: { ids: [yid] } })).j, { updated: 0, skipped: "no-key" });
env.YOUTUBE_API_KEY = "k";
assert.equal((await call("/api/yt/refresh", { ck: CI, body: { ids: [yid] } })).j.updated, 1);
const yv = (await call("/api/items?id=" + yid, { ck: CI })).j;
assert.deepEqual([yv.m_views, yv.m_likes, yv.m_comments, yv.m_shares, yv.m_src], [1200, 45, 6, 3, "yt"]);
delete env.YOUTUBE_API_KEY; globalThis.fetch = realFetch;
```
- [ ] **Step 2:** `node apps/content-planner/test.mjs` → FAIL (`ytId` belum diekspor).
- [ ] **Step 3: Implementasi.** `ytId`, `ogImage` (regex atribut `property|name` + `content` dua urutan, `new URL(c, base)`), `safeHttps(u)` (https, hostname bukan IP v4/v6 literal & bukan `localhost`/`.local`), `GET /api/linkimg` (YouTube → `https://i.ytimg.com/vi/<id>/hqdefault.jpg`; lainnya ambil HTML dengan UA browser, baca maks. 1,5 MB, `ogImage`, ambil gambar `redirect:"follow"`, cek tipe & panjang), `POST /api/yt/refresh` (kegiatan dari `ids` maks. 50 yang `ytId(link)`; tanpa key → `{updated:0,skipped:"no-key"}`; `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=..&key=..`; UPDATE COALESCE). Komentar kepala: rute baru + cara membuat `YOUTUBE_API_KEY` (Google Cloud → aktifkan YouTube Data API v3 → Credentials → API key, batasi ke API itu) dan `wrangler secret put YOUTUBE_API_KEY`.
- [ ] **Step 4:** test → `semua cek lolos`.
- [ ] **Step 5: Commit** `Content Planner: gambar dari link artikel/YouTube & statistik YouTube`

---

### Task 2: Planner — jalur hub email blast

**Files:** Modify `apps/content-planner/worker.js` (rute `/__hub/email` di samping `/__hub/item`); Test `test.mjs`

**Interfaces — Consumes:** `saveItem`, `saveLink` (pola), `canEditItem`, `imgOk`, `appUrl(env,"planner")` dari `shared/profile.js`.
**Produces:** `POST /__hub/email` (header `x-hub-key`, `hubPushAllowed`) body
`{ by:{email,name,job}, id?, item:{title, date, email_tpl}, target, img? }` →
`{ id, code, url }` (`url` = `<appUrl planner>/go/<code>`), membuat kegiatan `{kind:"artikel", channel:"Email / Newsletter", status:"terbit", owner = by}` atau memperbarui `id` (harus ada, kanal Email / Newsletter, dan `canEditItem(by)`; selain itu 403/404 `{error}`); link pelacak dipakai ulang bila `links.target` sama untuk kegiatan itu, kalau tidak dibuat baru; `img` sah → `item_img`.

- [ ] **Step 1: Test gagal:**

```js
const hub = (b) => planner.fetch(new Request(BASE + "/__hub/email", { method: "POST", headers: { "x-hub-key": SECRET, "content-type": "application/json" }, body: JSON.stringify(b) }), env).then(async (x) => ({ status: x.status, j: await x.json().catch(() => null) }));
const by = { email: "cici@acme.test", name: "Cici", job: "copy" };
let e1 = await hub({ by, item: { title: "Promo RD Oktober", date: plus(1), email_tpl: "Promo Reksa Dana" }, target: "https://kisi.test/promo?utm_campaign=x", img: PNG });
assert.equal(e1.status, 200); assert.match(e1.j.url, /\/go\/[a-z0-9]{6}$/);
let e2 = await hub({ by, id: e1.j.id, item: { title: "Promo RD Oktober (rev)", date: plus(1), email_tpl: "Promo Reksa Dana" }, target: "https://kisi.test/promo?utm_campaign=x" });
assert.deepEqual([e2.j.id, e2.j.code], [e1.j.id, e1.j.code], "tekan ulang = perbarui, link dipakai ulang");
const ev = (await call("/api/items?id=" + e1.j.id, { ck: CI })).j;
assert.deepEqual([ev.kind, ev.channel, ev.title, ev.email_tpl, ev.owner_email], ["artikel", "Email / Newsletter", "Promo RD Oktober (rev)", "Promo Reksa Dana", "cici@acme.test"]);
assert.ok((await call("/api/imgs?ids=" + e1.j.id, { ck: CI })).j[e1.j.id]);
assert.equal((await hub({ by: { email: "dodi@acme.test", name: "Dodi" }, id: e1.j.id, item: { title: "x", date: plus(1) }, target: "https://kisi.test/" })).status, 403);
assert.equal((await planner.fetch(new Request(BASE + "/__hub/email", { method: "POST", body: "{}" }), env)).status, 403, "tanpa x-hub-key");
```
- [ ] **Step 2:** test → FAIL (404/403 rute belum ada).
- [ ] **Step 3: Implementasi** sesuai Interfaces; `email_tpl` masuk `COLS` (Task 1) sehingga `saveItem` menyimpannya; target divalidasi seperti `saveLink`.
- [ ] **Step 4:** test → `semua cek lolos`.
- [ ] **Step 5: Commit** `Content Planner: jalur hub email blast (kegiatan + link pelacak + gambar)`

---

### Task 3: Email Studio — tombol "📅 Catat ke Planner"

**Files:** Modify `apps/email-studio/worker.js` (HTML tertanam: tombol + dialog + JS; rute `/api/planner`), `apps/email-studio/wrangler.jsonc` (`"services":[{"binding":"PLANNER","service":"content-planner"}]`), `apps/email-studio/i18n.js`; cek `wrangler.deploy.json` ikut. Test: skrip uji di scratchpad (lihat Step 4).

**Interfaces — Consumes:** `POST /__hub/email` (Task 2).
**Produces:** `POST /api/planner {id?, title, date, email_tpl, target, img?}` (login Email Studio, `Origin` harus sama) → diteruskan ke `env.PLANNER.fetch("https://planner/__hub/email", …)` dengan `by:{email:me.e,name:me.n,job:me.j}`, `x-hub-key: env.SSO_SECRET` → balasan Planner apa adanya; tanpa binding → 503 `{error:"Email Studio belum tersambung ke Content Planner."}`.
`GET /api/imgproxy?url=` (login) → gambar https publik (aturan sama dengan Global Constraints) untuk html2canvas.

- [ ] **Step 1: Cek CORS dulu.** Buka pratinjau satu template berbanner di headless Chrome (halaman uji scratchpad yang memuat HTML pratinjau + html2canvas `useCORS:true`) → catat apakah gambar banner ikut. Ledger hasilnya; proxy (Step 3c) tetap dibuat karena host gambar tim tidak bisa diatur.
- [ ] **Step 2: UI.** Tombol `📅 Catat ke Planner` di samping `bCopy`. Dialog: Tanggal kirim (bawaan hari ini), Subject (dari `S.data[S.tpl].subject`), **Link yang dilacak**: radio daftar semua isian bernilai `https://…` dari `S.data[S.tpl]` (rekursif, termasuk item list) yang kuncinya cocok `/link|url/i` dan bukan gambar (`/img|foto|logo/i`), label = label field + URL; bila `d._planner` ada: teks "Memperbarui kegiatan: <judul>" + kotak centang "Buat kegiatan baru".
- [ ] **Step 3: Alur Simpan.**
  a. target = URL terpilih setelah `addUtm` (bentuk link akhir di email).
  b. `POST /api/planner` tanpa img → `{id,code,url}`; set isian terpilih = `url`; `d._planner = {id, title}`; render ulang pratinjau (fungsi render yang dipakai form).
  c. Potret: `html2canvas(frame.contentDocument.body, {useCORS:true, width:600, height:min(900, tinggi), scale:1})`; gambar `<img>` di pratinjau yang host-nya beda origin di-`src` ulang ke `/api/imgproxy?url=` sebelum dipotret (lalu dikembalikan). JPEG 0.8, ≤ 700 KB (turunkan kualitas bila lebih).
  d. `POST /api/planner {id, ..., img}` → pesan "✓ Tercatat di Planner · link pelacak dipasang ke <label>". Gagal potret → kegiatan tetap tercatat, pesan "gambar tidak ikut, unggah manual di Planner".
  html2canvas dimuat saat tombol pertama kali ditekan dari `https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js`.
- [ ] **Step 4: Verifikasi.** `node --check` pada JS yang diekstrak dari HTML tertanam (pola parse `new Function` per `<script>`), tidak ada `</script>` literal di string; skrip uji scratchpad memanggil handler worker `/api/planner` dengan `PLANNER` tiruan → body yang diteruskan berisi `by` dari sesi & `x-hub-key`; tanpa binding → 503; Origin lain → 403; `/api/imgproxy` menolak http/IP.
- [ ] **Step 5: Commit** `Email Studio: Catat ke Planner (kegiatan email blast, link pelacak banner, potret email)`

---

### Task 4: Planner (browser) — gambar otomatis, isian, Laporan Copywriter

**Files:** Modify `apps/content-planner/page.html`, `apps/content-planner/i18n.js`; Test `test.mjs` (cek statis) + harness PDF headless (scratchpad, pola Laporan IG).

**Interfaces — Consumes:** `/api/linkimg`, `/api/yt/refresh` (Task 1), `/api/img`, `/api/imgs`, blok `posts` (Laporan IG), `USERS` (role).
**Produces:** `REP.cw = {data:cwData, doc:cwDoc, name:"Laporan Copywriter"}`.

- [ ] **Step 1: Test statis gagal** di blok `pg` test.mjs: `data-t="cw">Laporan Copywriter<`, `cw:\{data:cwData,doc:cwDoc,name:"Laporan Copywriter"\}`, `api\("\/api\/yt\/refresh"`, `"\/api\/linkimg\?url="`.
- [ ] **Step 2:** test → FAIL.
- [ ] **Step 3: Implementasi.**
  - Setelah kegiatan disimpan (handler simpan dialog): bila punya link bukan Instagram dan belum punya gambar → `fetch("/api/linkimg?url="+…)` → `shrinkImg(blob)` → `api("/api/img",…)`; bila link YouTube → `api("/api/yt/refresh",{ids:[id]})`. Tanpa menahan penutupan dialog; gagal diam (kecuali tombol manual).
  - Kotak gambar: tombol "↻ Ambil dari link" (tampil bila ada link bukan Instagram); pesan gagal "Gambar tidak ditemukan di link ini." Label `#mViews` = "Pembaca" untuk Artikel, "Views / tayangan" lainnya. Kegiatan berkanal Email / Newsletter menampilkan `email_tpl` (teks kecil, baca saja).
  - Laporan: tombol `data-t="cw">Laporan Copywriter`; `setRT("cw")` → Orang (`rWhoF`) tampil berisi anggota role `copy` saja, Tim/Isi/Regional/Program disembunyikan, periode bawaan bulan lalu (pola `ig`).
  - `cwData`: periode seperti `igData`; `/api/items?from&to`; pilih `owner_email` ∈ anggota `copy` (atau yang dipilih di Orang); artikel = `kind:"artikel"`, YouTube = `kind:"konten"` & link YouTube; panggil `/api/yt/refresh` untuk video di periode (per 50) lalu muat ulang item; gambar dari `/api/imgs` per 100.
  - `cwDoc`: sampul ["Laporan Copywriter", per] + sub nama orang/“Semua copywriter”; ringkasan kpis: Artikel, Email blast, Video YouTube, Total klik, Pembaca artikel, Views YouTube; bagian `page` + `posts` (cols 2): **Artikel** (kanal di baris tanggal; angka Pembaca, Klik), **Email blast** (tanggal kirim · template; angka Klik), **YouTube** (Views, Suka, Komentar, Klik); bagian kosong → `table` kosong dengan teks "Belum ada artikel / email blast / video YouTube di periode ini."
  - i18n English untuk semua teks baru.
- [ ] **Step 4: Verifikasi.** test → `semua cek lolos`; parse script page.html; harness headless (salin `harness.cjs` Laporan IG, ganti ke `cwDoc` + data contoh 3 artikel, 2 email, 0 YouTube) → halaman YouTube kosong menampilkan catatan, kartu email menampilkan template.
- [ ] **Step 5: Commit** `Content Planner: Laporan Copywriter & gambar otomatis dari link`
