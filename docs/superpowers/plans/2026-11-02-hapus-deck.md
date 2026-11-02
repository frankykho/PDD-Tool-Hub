# Hapus deck presentasi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin hub bisa menghapus satu deck presentasi beserta semua versinya; file Drive masuk Trash.

**Architecture:** Fungsi baru `remove()` di `apps/brand-kit/decks.js`, rute `POST /api/decks/delete` di `worker.js`, tombol Hapus di tab Presentasi (`page.html`), tanda `can.del` di `GET /api/decks`.

**Tech Stack:** Cloudflare Worker + D1, Google Drive v3 (gdrive.js), tes Node (`node apps/brand-kit/test.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-02-hapus-deck-design.md`

## Global Constraints

- Hanya `me.adm`; lainnya 403 "Hanya admin hub yang bisa menghapus deck."
- File Drive dibuang dulu; 404 dianggap beres; galat lain -> tidak ada baris D1 yang terhapus, pesan `driveErr`.
- `deck_downloads` tidak dihapus.
- Teks UI Bahasa Indonesia + kunci baru di `apps/brand-kit/i18n.js`.

## Review Focus

- Deck yang sedang punya sesi `unggah` (belum ada file_id) -> baris unggah ikut terhapus, tidak error.
- Versi yang sudah `trash` -> tidak dibuang ulang ke Drive.
- Deck tidak ada / id kosong -> 404 "Deck tidak ditemukan."
- Unduhan langsung `/deck/<versi>` setelah dihapus -> 404 untuk semua.
- Pemakaian (`/api/usage`) tetap menghitung unduhan lama sebagai "(deck terhapus)".

---

### Task 1: Hapus deck (server, halaman, tes)

**Files:**
- Modify: `apps/brand-kit/decks.js` (fungsi baru setelah `withdraw`; `list` menambah `can.del`)
- Modify: `apps/brand-kit/worker.js` (rute di samping `/api/decks/withdraw`)
- Modify: `apps/brand-kit/page.html` (`workRow`, `deckList`, handler `#tDeck`)
- Modify: `apps/brand-kit/i18n.js`
- Test: `apps/brand-kit/deck.test.mjs` (sebelum blok "halaman")

**Interfaces:**
- Produces: `export async function remove(env, me, b) -> { ok: true } | { error, status }` dengan `b = { deck_id }`; `list()` -> `can: { submit, approve, del }`.

- [ ] **Step 1: Tulis tes yang gagal** di `deck.test.mjs`, memakai deck Saham Syariah (`ds`: versi resmi `vb`, arsip `da2`) ditambah satu sesi unggah:
  - `HEAD` dan `IGS` -> 403; `ADM` dengan `deck_id: "zzz"` -> 404.
  - `G.fail = "PATCH"` -> status 502, baris `decks` dan `deck_versions` deck itu masih ada; `G.fail = null`.
  - Hapus satu file Drive dari `G.files` (versi arsip) lalu `ADM` hapus -> 200: tidak ada baris `decks`/`deck_versions`/`deck_log` untuk `ds`; semua file versi yang masih ada `trashed`; `dl(SARI, vb)` 404; `deck_downloads` untuk `ds` jumlahnya sama seperti sebelum dihapus.
  - `L.can` sesuai: `{ submit, approve, del }` dengan `del` hanya true untuk ADM (perbarui assert `can` yang ada).
- [ ] **Step 2: Jalankan** `node apps/brand-kit/test.mjs` — Expected: FAIL (rute belum ada).
- [ ] **Step 3: Implementasi** `remove()`: cek admin & deck; ambil versi `file_id <> '' AND status <> 'trash'`; `GD.trashFile` tiap file, tangkap `e.status === 404` sebagai beres, galat lain -> `driveErr(e)`; lalu satu `DB.batch` DELETE `deck_versions`, `deck_log`, `decks` untuk deck itu. Rute `POST /api/decks/delete` -> `out(await DK.remove(env, me, b))`. Halaman: tombol `btn sm danger` "Hapus" `data-dk="del"` di `deckList` dan `workRow` bila `DECKS.can.del`; konfirmasi `T("Hapus deck ini beserta semua versinya? File masuk Trash Google Drive.")+"\n\n"+judul`; sukses -> `decks(true)` dan `showMsg("dkMsg", T("Deck dihapus."), "ok")`.
- [ ] **Step 4: Jalankan** semua: `node apps/brand-kit/test.mjs`, `node apps/tool-hub/test.mjs`, `node scripts/i18n-check.mjs`, `node scripts/deploy.mjs brand --dry-run` — Expected: "semua cek lolos" / "✓ selesai: brand".
- [ ] **Step 5: Commit** "Brand Kit: admin bisa menghapus deck presentasi (file ke Trash Drive)".
