// Cek bagian murni mesin gambar Brand Kit (assets/render.js): batas canvas, susunan narasumber, teks menyesuaikan kotak, gabungan isian.
// Jalankan: node apps/brand-kit/render.test.mjs (ikut dijalankan oleh test.mjs)
import assert from "node:assert/strict";
import { canvasScale, rowsFor, speakerLayout, speakersFor, fitText, fieldsOf, wrap } from "./assets/render.js";

assert.equal(canvasScale(1080, 1920), 1);
assert.ok(Math.abs(canvasScale(3579, 5031) - Math.sqrt(16e6 / (3579 * 5031))) < 1e-9, "A3 dikecilkan sampai 16 MP");
assert.ok(3579 * 5031 * canvasScale(3579, 5031) ** 2 <= 16e6 + 1);
assert.equal(canvasScale(2386, 6323), 1, "X-banner 100 dpi masih muat");

assert.deepEqual([1, 2, 3, 4, 5, 6].map(rowsFor), [[1], [2], [3], [2, 2], [3, 2], [3, 3]]);
assert.deepEqual(speakersFor([1, 2, 3, 4, 5], 3), { shown: [1, 2, 3], cut: 2 });
assert.deepEqual(speakersFor([1, 2], 6), { shown: [1, 2], cut: 0 });

for (let n = 1; n <= 6; n++) {
  const L = speakerLayout({ x: 0, y: 0, w: 900, h: 600, nameSize: 30, titleSize: 22 }, n);
  assert.equal(L.length, n);
  assert.ok(L.every((p) => p.cx - p.r >= 0 && p.cx + p.r <= 900 && p.cy - p.r >= 0 && p.titleY + 22 * 1.2 <= 600), `${n} orang: semua di dalam kotak`);
  assert.ok(L.every((p) => p.r === L[0].r), "ukuran foto sama");
}
const L5 = speakerLayout({ x: 100, y: 50, w: 900, h: 600, nameSize: 30, titleSize: 22 }, 5);
assert.equal(new Set(L5.map((p) => Math.round(p.cy))).size, 2, "5 orang: dua baris");
assert.ok(Math.abs((L5[3].cx + L5[4].cx) / 2 - 550) < 1e-6, "baris kedua di tengah");
assert.ok(L5.every((p) => p.cx - p.r >= 100 && p.cx + p.r <= 1000), "geser mengikuti posisi kotak");

const m = (t, s) => t.length * s * 0.6;   // ukuran teks tiruan
const f = fitText(m, "Cabang Surabaya Darmo Permai Galeri Investasi", { w: 300, h: 40, size: 40, minSize: 20 });
assert.equal(f.overflow, true); assert.equal(f.size, 20); assert.equal(f.lines.length, 1); assert.ok(f.lines[0].endsWith("…"));
assert.ok(m(f.lines[0], 20) <= 300, "baris terpotong tetap di dalam kotak");
assert.deepEqual(fitText(m, "Surabaya", { w: 300, h: 40, size: 40, minSize: 20 }), { lines: ["Surabaya"], size: 40, overflow: false });
const two = fitText(m, "Sabtu 14 November 2026", { w: 300, h: 100, size: 40, minSize: 10 });
assert.equal(two.overflow, false); assert.ok(two.lines.length >= 2 && two.lines.every((l) => m(l, two.size) <= 300), "pindah baris bila tinggi cukup");
assert.deepEqual(fitText(m, "  ", { w: 300, h: 40, size: 40, minSize: 20 }), { lines: [], size: 40, overflow: false });
assert.deepEqual(wrap(m, "a bb ccc", 10, 30), ["a bb", "ccc"]);

const sizes = [
  { kind: "story", slots: [{ type: "text", field: "cabang", label: "Nama cabang", required: true, max: 30, auto: "branch", def: "" }, { type: "speakers", max: 3 }, { type: "qr" }] },
  { kind: "a4", slots: [{ type: "text", field: "cabang", label: "Cabang", required: false, max: 20, auto: "", def: "" }, { type: "text", field: "tanggal", label: "Tanggal", required: true, max: 40, auto: "event.date", def: "" }, { type: "speakers", max: 6 }] },
];
const F = fieldsOf(sizes);
assert.deepEqual(F.text.map((x) => x.field), ["cabang", "tanggal"]);
assert.deepEqual(F.text[0], { field: "cabang", label: "Nama cabang", required: true, max: 20, auto: "branch", def: "" }, "isian pertama menang, batas huruf yang paling kecil");
assert.equal(F.speakers, 6); assert.equal(F.qr, true);
assert.deepEqual(fieldsOf([{ kind: "feed11", slots: [] }]), { text: [], speakers: 0, qr: false });

console.log("render: semua cek lolos");
