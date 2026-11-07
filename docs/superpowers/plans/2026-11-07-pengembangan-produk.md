# Pengembangan produk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jenis kegiatan "🧩 Pengembangan produk" di Content Planner, hanya admin yang mengisi, dengan riwayat update status dan bagian di Laporan Kegiatan.

**Architecture:** Jenis baru di `KINDS` (tabel `items`). Kolom yang dipakai ulang: `partner` = produk, `goal` = deskripsi fungsi, `end_date` = target rilis.
Riwayat memakai pola galeri: baris `comments` dengan kind `progres:<status>`. Riwayat dibaca lewat `/api/galeri?id=` atau `/api/galeri?kind=produk`.

**Tech Stack:** Cloudflare Worker + D1, satu halaman `page.html`, tes `node apps/content-planner/test.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-07-pengembangan-produk-design.md`

## Global Constraints
- Key jenis: `produk`. Label: "Pengembangan produk". Ikon: 🧩.
- Kanal: `["Fitur baru", "Fungsi / peningkatan", "Perbaikan", "Lainnya"]`.
- Status: `["ide", "rencana", "pengembangan", "uji", "rilis", "batal"]`.
- Yang boleh menyimpan atau mengubah: hanya `me.adm`. Pesan error: "Pengembangan produk hanya bisa dicatat dan diubah oleh admin Tool Hub."
- Tanpa tabel, kolom, atau database baru.

## Review Focus
- Non-admin mengubah kegiatan lama menjadi `produk`, atau mengubah `produk` milik admin, harus ditolak.
- Target rilis sebelum tanggal mulai dikosongkan.
- Simpan tanpa pindah status dan tanpa catatan tidak menambah baris riwayat.
- Riwayat galeri tetap seperti sebelumnya.
- Status baru tampil dengan label dan tahap laporan yang benar (pengembangan/uji = berjalan, rilis = selesai).

### Task 1: Server (worker.js) + tes
**Files:** Modify `apps/content-planner/worker.js` (KINDS, cleanItem, saveItem, galleries, route `/api/galeri`). Test: `apps/content-planner/test.mjs`.

- [ ] Tes: non-admin (COPY) POST `kind:"produk"` → 400. Admin POST → 200; `partner`, `goal`, `end_date` tersimpan; `program_id: ""`, `d_need: 0`.
  Satu riwayat `progres:ide`. Admin mengubah ke `uji` dengan `progress:"Siap UAT"` → riwayat ke-2 `{st:"uji", text:"Siap UAT"}`.
  Simpan ulang tanpa perubahan → tetap 2 baris. `/api/galeri?kind=produk` mengembalikan item beserta `log`. Konten lama COPY dijadikan produk → 400.
- [ ] Implementasi:
  - `cleanItem`: blok `produk` (partner 120, goal 1000, end_date ≥ date atau "").
  - `saveItem`: cek admin. Kondisi log menjadi `["galeri","produk"].includes(it.kind)`.
  - `galleries(env, id, kind)`: kind `galeri` (bawaan) atau `produk`. Jika ada id, kedua jenis diterima.
- [ ] `node apps/content-planner/test.mjs` → "semua cek lolos". Commit.

### Task 2: Halaman (page.html) + kamus EN
**Files:** Modify `apps/content-planner/page.html`, `apps/content-planner/i18n.js`.

- [ ] Form: grup `gProd` (Produk / aplikasi, Deskripsi fungsi, Target rilis, Update status, Riwayat update).
  Tombol jenis hanya tampil untuk admin. Program, desain, dan angka hasil disembunyikan. `formData` mengirim partner/goal/end_date/progress.
  `loadGalLog` juga melayani produk.
- [ ] Label: STL/SCL/STAGE untuk pengembangan, uji, rilis. ICON, LAB, HINT, STAT_W.
- [ ] Laporan: RK, KEG, SEC, COLS.produk (Tanggal, Produk, Fitur, Jenis, PIC, Status, Target rilis, Update terakhir), PPL, rekap per orang, KPI.
  Riwayat diambil dari `/api/galeri?kind=produk`.
- [ ] Teks EN baru di `i18n.js`. Tes tetap lolos. Commit, lalu push.
