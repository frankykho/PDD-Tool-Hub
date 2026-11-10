// Banner What's New 1920×1080 dengan mockup HP (dipakai page.html lewat import("/banner.js") dan diuji di Node: test.mjs).
// Bagian atas = hitungan murni (tanpa DOM). Screenshot tidak pernah keluar dari browser.
export const W = 1920, H = 1080;

// Posisi versi "HP di kanan" [x, y, w, h, rotasi°]; urutan = urutan gambar (yang belakang dulu). Versi kiri = dicerminkan.
export const LAYOUTS = [
  { id: "tegak", name: "1 HP tegak", n: 1, tw: 1000, p: [[1280, 150, 520, 1070, 0]] },
  { id: "miring", name: "1 HP miring", n: 1, tw: 1000, p: [[1250, 170, 540, 1110, -8]] },
  { id: "utuh", name: "1 HP utuh", n: 1, tw: 1000, p: [[1330, 90, 440, 900, 0]] },
  { id: "dua", name: "2 HP bertumpuk", n: 2, tw: 820, p: [[1060, 230, 440, 900, 0], [1400, 120, 440, 900, 0]] },
  { id: "kipas", name: "3 HP kipas", n: 3, tw: 760, p: [[950, 260, 380, 780, -6], [1530, 260, 380, 780, 6], [1210, 150, 440, 900, 0]] },
  { id: "tengah", name: "3 HP tengah", n: 3, mid: true, p: [[460, 470, 360, 740, 0], [1100, 470, 360, 740, 0], [780, 420, 360, 740, 0]] },
];
const byId = (id) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];

/** Semua kombinasi susunan × sisi (11), atau hanya yang jumlah HP-nya n. */
export function combos(n) {
  const out = [];
  for (const l of LAYOUTS) if (!n || l.n === n) for (const side of l.mid ? ["tengah"] : ["kanan", "kiri"]) out.push({ id: l.id, side, name: l.name + (l.mid ? "" : " — " + side) });
  return out;
}

/** Posisi HP, kotak teks, dan logo untuk satu susunan. no = nomor screenshot (urutan kiri→kanan). */
export function layoutFor(id, side) {
  const l = byId(id), mid = !!l.mid, left = !mid && side === "kiri";
  const phones = l.p.map(([x, y, w, h, rot]) => (left ? { x: W - x - w, y, w, h, rot: -rot } : { x, y, w, h, rot }));
  const xs = phones.map((p) => p.x).sort((a, b) => a - b);
  phones.forEach((p) => (p.no = xs.indexOf(p.x) + 1));
  if (mid) return { phones, text: { x: 160, y: 160, w: W - 320, align: "center" }, logo: { x: W / 2, y: 60, h: 54, align: "center" }, desc: false, glow: [0.5, 0.45] };
  return {
    phones,
    text: { x: left ? W - 120 - l.tw : 120, y: 300, w: l.tw, align: "left" },
    logo: left ? { x: W - 120, y: 100, h: 60, align: "right" } : { x: 120, y: 100, h: 60, align: "left" },
    desc: true,
    glow: [left ? 0.25 : 0.75, 0.45],
  };
}

/** Potongan sumber supaya screenshot mengisi w×h tanpa gepeng: sisa lebar dibagi rata, sisa tinggi dibuang dari bawah. */
export function coverTop(iw, ih, w, h) {
  const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
  return { sx: (iw - sw) / 2, sy: 0, sw, sh };
}

/** Bungkus teks ke lebar w; huruf mengecil 2 px per langkah sampai muat di maxLines atau sampai minSize (lalu overflow). */
export function fitText(measure, text, { w, size, minSize, maxLines }) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  for (let s = size; ; s = Math.max(minSize, s - 2)) {
    const lines = [];
    let cur = "";
    for (let word of words) {
      // kata yang lebih lebar dari kolom dipecah per huruf
      while (measure(word, s) > w && word.length > 1) {
        let k = word.length - 1;
        while (k > 1 && measure(word.slice(0, k), s) > w) k--;
        if (cur) { lines.push(cur); cur = ""; }
        lines.push(word.slice(0, k));
        word = word.slice(k);
      }
      const next = cur ? cur + " " + word : word;
      if (cur && measure(next, s) > w) { lines.push(cur); cur = word; } else cur = next;
    }
    if (cur) lines.push(cur);
    if (lines.length <= maxLines) return { size: s, lines, overflow: false };
    if (s <= minSize) return { size: s, lines: lines.slice(0, maxLines), overflow: true };
  }
}

/** Nama file unduhan dari judul fitur. */
export function fileName(title) {
  const slug = String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return "whats-new-" + (slug || "banner") + ".png";
}
