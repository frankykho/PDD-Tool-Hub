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
  if (mid) return { phones, text: { x: 160, y: 160, w: W - 320, align: "center" }, logo: { x: W / 2, y: 56, h: 66, align: "center" }, desc: false, glow: [0.5, 0.45] };
  return {
    phones,
    text: { x: left ? W - 120 - l.tw : 120, y: 300, w: l.tw, align: "left" },
    logo: left ? { x: W - 120, y: 96, h: 76, align: "right" } : { x: 120, y: 96, h: 76, align: "left" },
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

export const THEMES = {
  terang: { bg: "linear", stops: ["#ffffff", "#e8f4ee"], logo: "color", title: "#136F4A", desc: "#3a4a42", tagBg: "#136F4A", tagFg: "#ffffff", shadow: "rgba(0,0,0,.3)", rim: null },
  gelap: { bg: "radial", stops: ["#1a6b48", "#0d3b28", "#08261a"], logo: "white", title: "#ffffff", desc: "rgba(255,255,255,.88)", tagBg: "#F5A623", tagFg: "#17251d", shadow: "rgba(0,0,0,.55)", rim: "rgba(255,255,255,.12)" },
};
const FONT = "Inter, Arial, sans-serif";
const font = (w, s) => `${w} ${s}px ${FONT}`;

function drawPhone(ctx, p, img, T) {
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  ctx.rotate((p.rot * Math.PI) / 180);
  const x = -p.w / 2, y = -p.h / 2;
  ctx.shadowColor = T.shadow; ctx.shadowBlur = 80; ctx.shadowOffsetY = 40;
  ctx.fillStyle = "#111111"; ctx.beginPath(); ctx.roundRect(x, y, p.w, p.h, 64); ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  if (T.rim) { ctx.strokeStyle = T.rim; ctx.lineWidth = 2; ctx.stroke(); }
  const sx = x + 20, sy = y + 20, sw = p.w - 40, sh = p.h - 40;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 46); ctx.clip();
  if (img) { const c = coverTop(img.naturalWidth || img.width, img.naturalHeight || img.height, sw, sh); ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, sx, sy, sw, sh); }
  else { ctx.fillStyle = "#d9dedb"; ctx.fillRect(sx, sy, sw, sh); }
  ctx.restore();
  ctx.fillStyle = "#111111"; ctx.beginPath(); ctx.roundRect(-55, sy + 12, 110, 30, 15); ctx.fill();
  ctx.restore();
}

/** Gambar banner: latar -> logo -> label -> judul -> penjelasan -> HP. Hasil: kolom teks yang tidak muat. */
export function draw(ctx, o) {
  const L = layoutFor(o.id, o.side), T = THEMES[o.theme] || THEMES.terang, overflow = [], mid = L.text.align === "center";
  const measureWith = (w) => (t, s) => { ctx.font = font(w, s); return ctx.measureText(t).width; };
  ctx.save();
  ctx.textBaseline = "top";
  // latar
  let g;
  if (T.bg === "linear") { g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, T.stops[0]); g.addColorStop(1, T.stops[1]); }
  else {
    const cx = L.glow[0] * W, cy = L.glow[1] * H, r = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, T.stops[0]); g.addColorStop(0.55, T.stops[1]); g.addColorStop(1, T.stops[2]);
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // logo
  if (o.logo) {
    const lg = L.logo, w = (lg.h * (o.logo.naturalWidth || o.logo.width)) / (o.logo.naturalHeight || o.logo.height);
    ctx.drawImage(o.logo, lg.align === "left" ? lg.x : lg.align === "right" ? lg.x - w : lg.x - w / 2, lg.y, w, lg.h);
  }
  const ax = mid ? L.text.x + L.text.w / 2 : L.text.x;
  ctx.textAlign = mid ? "center" : "left";
  let y = L.text.y;
  // label (pil)
  const tag = String(o.tag || "").trim();
  if (tag) {
    const f = fitText(measureWith(800), tag, { w: L.text.w - 60, size: 34, minSize: 20, maxLines: 1 });
    if (f.overflow) overflow.push("tag");
    ctx.font = font(800, f.size);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
    const tw = ctx.measureText(f.lines[0]).width + 64, th = 72, tx = mid ? ax - tw / 2 : ax;
    ctx.fillStyle = T.tagBg; ctx.beginPath(); ctx.roundRect(tx, y, tw, th, th / 2); ctx.fill();
    ctx.fillStyle = T.tagFg; ctx.fillText(f.lines[0], mid ? ax : ax + 32, y + (th - f.size) / 2);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    y += th + (mid ? 20 : 34);
  }
  // judul & penjelasan
  const block = (text, key, weight, size, lh, maxLines, color) => {
    const f = fitText(measureWith(weight), text, { w: L.text.w, size, minSize: Math.round(size * 0.6), maxLines });
    if (f.overflow) overflow.push(key);
    ctx.font = font(weight, f.size); ctx.fillStyle = color;
    f.lines.forEach((l, i) => ctx.fillText(l, ax, y + i * f.size * lh));
    y += f.lines.length * f.size * lh;
  };
  const title = String(o.title || "").trim(), desc = String(o.desc || "").trim();
  if (title) block(title, "title", 800, mid ? 84 : 104, 1.05, mid ? 1 : 3, T.title);
  if (L.desc && desc) { y += 28; block(desc, "desc", 400, 44, 1.4, 3, T.desc); }
  // HP
  for (const p of L.phones) drawPhone(ctx, p, (o.shots || [])[p.no - 1] || null, T);
  ctx.restore();
  return { overflow };
}
