# Izin mengubah kegiatan kalender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kegiatan kalender hanya bisa diubah pembuat, PIC, desainer visual, atau admin hub.

**Architecture:** Fungsi murni `canEditItem(me, item)` di worker dipanggil `saveItem` terhadap data lama; halaman memakai aturan yang sama (`canEditItem` di page, mirip `canEditTask`) untuk mengunci form dan geser.

**Tech Stack:** Cloudflare Worker + D1, `apps/content-planner/test.mjs` (Node).

**Spec:** `docs/superpowers/specs/2026-11-02-izin-edit-kegiatan-design.md`

## Global Constraints

- Pesan tolak: "Hanya pembuat, PIC, desainer, atau admin yang bisa mengubah kegiatan ini." status 403.
- Email dibandingkan huruf kecil. Desainer hanya dihitung bila `d_need` bernilai benar.
- Tidak mengubah `/api/approval`, `/api/comments`, `/api/metrics/import`, `/api/galeri/import`, `/__hub/*`, `deleteItem`.

## Review Focus

- Bukan pembuat menyimpan kegiatan sambil mengisi dirinya sebagai PIC -> tetap 403 (cek memakai `prev`).
- Desainer lama setelah `d_need` dimatikan -> tidak lagi berhak.
- Ubah massal (`/api/items/bulk`) hanya membuat baru -> tidak terdampak.
- Penyetuju bukan pembuat tetap bisa menyetujui lewat `/api/approval`.
- Admin tanpa role tetap bisa mengubah semua.

---

### Task 1: Izin edit kegiatan (server, halaman, tes)

**Files:**
- Modify: `apps/content-planner/worker.js` (`canEditItem` baru, dekat `saveItem`; cek di `saveItem` setelah `prev` dibaca; route `/api/items` memakai status 403 bila `r.forbidden`)
- Modify: `apps/content-planner/page.html` (`openForm`: hanya-lihat bila tidak berhak; chip `draggable` hanya bila berhak; handler drop menolak bila tidak berhak)
- Modify: `apps/content-planner/i18n.js` bila halaman memakai kunci i18n untuk teks baru
- Test: `apps/content-planner/test.mjs`

**Interfaces:**
- Produces: `export const canEditItem = (me, it) => boolean` (`me = { e, adm }`, `it` baris items).

- [ ] **Step 1: Tes gagal** di `test.mjs`: satu kegiatan dibuat anggota A dengan PIC B dan desainer C (`d_need: 1`). Simpan oleh D -> status 403, judul tidak berubah. D menyimpan dengan `owner_email` = D -> 403. A, B, C, dan admin masing-masing menyimpan -> 200. Setelah `d_need: 0` disimpan A, C -> 403. Unit `canEditItem` untuk email huruf besar. Persetujuan oleh penyetuju bukan pembuat tetap 200 (bila tes persetujuan sudah ada, cukup pastikan masih hijau).
- [ ] **Step 2: Jalankan** `node apps/content-planner/test.mjs` — Expected: FAIL pada 403.
- [ ] **Step 3: Implementasi** `canEditItem`; di `saveItem` setelah cek `prev` hilang: `if (prev && !canEditItem(me, prev)) return { error: <pesan>, forbidden: true }`; route mengembalikan 403 untuk `forbidden`. Halaman: `canEditItem` versi page dari `PL.me` (email, adm); form tidak berhak -> input `disabled`, `iSave`/`iDel` disembunyikan, keterangan "Hanya pembuat, PIC, desainer, atau admin yang bisa mengubah kegiatan ini."; chip tidak berhak tanpa `draggable`.
- [ ] **Step 4: Jalankan** `node apps/content-planner/test.mjs`, `node apps/tool-hub/test.mjs`, `node apps/event-lead/test.mjs`, `node apps/link-qr/test.mjs`, `node scripts/i18n-check.mjs`, `node scripts/deploy.mjs planner --dry-run` — Expected: semua "semua cek lolos" / "✓ selesai".
- [ ] **Step 5: Commit** "Content Planner: kegiatan hanya bisa diubah pembuat, PIC, desainer, atau admin".
