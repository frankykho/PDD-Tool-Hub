// Banner What's New 1920×1080 dengan mockup HP (dipakai page.html lewat import("/banner.js") dan diuji di Node: test.mjs).
// Bagian atas = hitungan murni (tanpa DOM). Screenshot tidak pernah keluar dari browser.
export const W = 1920, H = 1080;

// Posisi versi "HP di kanan" [x, y, w, h, rotasi°]; urutan = urutan gambar (yang belakang dulu). Versi kiri = dicerminkan.
// seri: HP utama (screenshot 1) lalu layar lanjutan tanpa bingkai, tiap layar berikutnya di depan layar sebelumnya.
export const LAYOUTS = [
  { id: "tegak", name: "1 HP tegak", n: 1, tw: 1000, p: [[1280, 150, 520, 1070, 0]] },
  { id: "miring", name: "1 HP miring", n: 1, tw: 1000, p: [[1250, 170, 540, 1110, -8]] },
  { id: "utuh", name: "1 HP utuh", n: 1, tw: 1000, p: [[1330, 90, 440, 900, 0]] },
  { id: "dua", name: "2 HP bertumpuk", n: 2, tw: 820, p: [[1060, 230, 440, 900, 0], [1400, 120, 440, 900, 0]] },
  { id: "sejajar", name: "2 HP sejajar", n: 2, tw: 820, p: [[1000, 200, 400, 830, 0], [1440, 200, 400, 830, 0]] },
  { id: "dua-miring", name: "2 HP miring", n: 2, tw: 820, p: [[1040, 210, 420, 860, -10], [1400, 110, 420, 860, -10]] },
  { id: "melayang", name: "2 HP melayang", n: 2, tw: 820, float: true, p: [[1450, 70, 340, 700, 12], [1080, 90, 400, 820, -14]] },
  { id: "kipas", name: "3 HP kipas", n: 3, tw: 760, p: [[950, 260, 380, 780, -6], [1530, 260, 380, 780, 6], [1210, 150, 440, 900, 0]] },
  { id: "seri2", name: "2 HP seri (alur fitur)", n: 2, tw: 820, seri: true, p: [[1000, 260, 380, 780, 6], [1330, 160, 380, 780, 8]] },
  { id: "seri3", name: "3 HP seri (alur fitur)", n: 3, tw: 720, seri: true, p: [[900, 320, 340, 700, 6], [1160, 240, 340, 700, 8], [1420, 160, 340, 700, 8]] },
  { id: "seri4", name: "4 HP seri (alur fitur)", n: 4, tw: 700, seri: true, p: [[880, 340, 320, 660, 6], [1070, 270, 320, 660, 8], [1260, 200, 320, 660, 8], [1450, 130, 320, 660, 8]] },
  { id: "tengah", name: "3 HP tengah", n: 3, mid: true, p: [[460, 470, 360, 740, 0], [1100, 470, 360, 740, 0], [780, 420, 360, 740, 0]] },
];
const byId = (id) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];

/** Semua kombinasi susunan × sisi (23), atau hanya yang jumlah HP-nya n. */
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
  phones.forEach((p, i) => { p.no = l.seri ? i + 1 : xs.indexOf(p.x) + 1; p.bare = !!l.seri && i > 0; });
  if (mid) return { phones, text: { x: 160, y: 160, w: W - 320, align: "center" }, logo: { x: W / 2, y: 56, h: 66, align: "center" }, desc: false, glow: [0.5, 0.45] };
  return {
    phones,
    float: !!l.float,
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

export const BEZEL = 5; // tebal bingkai HP (px banner)
export const HL_SCALE = 1.35;
/**
 * Kotak "menu yang disorot": area r (0..1 dari screenshot iw×ih) di HP p, diperbesar dan digeser keluar HP ke arah teks
 * (tidak sampai menabrak kolom teks, tetap di dalam banner). Hasil: pusat, ukuran, rotasi (ikut HP).
 */
export function hlBox(L, p, iw, ih, r) {
  const m = p.bare ? 0 : BEZEL, sw = p.w - 2 * m, sh = p.h - 2 * m, c = coverTop(iw, ih, sw, sh), k = sw / c.sw, rw = r.w * iw * k, rh = r.h * ih * k;
  const mid = L.text.align === "center", toLeft = !mid && L.text.x < p.x;
  // ruang kosong antara kolom teks dan tepi banner (susunan tengah: selebar banner)
  const edge = mid ? 40 : toLeft ? L.text.x + L.text.w + 30 : L.text.x - 30, room = mid ? W - 80 : toLeft ? W - 40 - edge : edge - 40;
  const s = Math.min(HL_SCALE, room / rw, (H * 0.6) / rh), w = rw * s, h = rh * s;
  // pusat area di koordinat HP (pusat HP = 0,0), lalu diputar seperti HP-nya
  const lx = -p.w / 2 + m + ((r.x + r.w / 2) * iw - c.sx) * k, ly = -p.h / 2 + m + ((r.y + r.h / 2) * ih - c.sy) * k, a = (p.rot * Math.PI) / 180;
  let cx = p.x + p.w / 2 + lx * Math.cos(a) - ly * Math.sin(a), cy = p.y + p.h / 2 + lx * Math.sin(a) + ly * Math.cos(a);
  if (!mid) { cx += (toLeft ? -1 : 1) * p.w * 0.25; cx = toLeft ? Math.max(cx, edge + w / 2) : Math.min(cx, edge - w / 2); }
  cx = Math.min(Math.max(cx, 40 + w / 2), W - 40 - w / 2); cy = Math.min(Math.max(cy, 40 + h / 2), H - 40 - h / 2);
  return { cx, cy, w, h, rot: p.rot };
}

/** Geser kotak sorotan sejauh d = [dx, dy], tetap di dalam banner. d pada hasil = geseran yang benar-benar dipakai. */
export function moveHl(b, d) {
  const cx = Math.min(Math.max(b.cx + ((d && d[0]) || 0), 40 + b.w / 2), W - 40 - b.w / 2), cy = Math.min(Math.max(b.cy + ((d && d[1]) || 0), 40 + b.h / 2), H - 40 - b.h / 2);
  return { ...b, cx, cy, d: [cx - b.cx, cy - b.cy] };
}

/** Bungkus teks ke lebar w; Enter = baris baru. Huruf mengecil 2 px per langkah sampai muat di maxLines atau sampai minSize (lalu overflow). */
export function fitText(measure, text, { w, size, minSize, maxLines }) {
  const paras = String(text || "").trim().split(/\r?\n/).map((p) => p.split(/\s+/).filter(Boolean));
  for (let s = size; ; s = Math.max(minSize, s - 2)) {
    const lines = [];
    for (const words of paras) {
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
      lines.push(cur); // baris kosong dari Enter dua kali tetap jadi jarak
    }
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
  terang: { bg: "linear", stops: ["#ffffff", "#e8f4ee"], logo: "color", title: "#136F4A", desc: "#3a4a42", tagBg: "#136F4A", tagFg: "#ffffff", shadow: "rgba(0,0,0,.3)", rim: null, hlGlow: "rgba(19,111,74,.5)", hlRim: "#136F4A" },
  gelap: { bg: "radial", stops: ["#1a6b48", "#0d3b28", "#08261a"], logo: "white", title: "#ffffff", desc: "rgba(255,255,255,.88)", tagBg: "#F5A623", tagFg: "#17251d", shadow: "rgba(0,0,0,.55)", rim: "rgba(255,255,255,.12)", hlGlow: "rgba(72,232,150,.85)", hlRim: "rgba(140,255,195,.95)" },
};
const FONT = "Inter, Arial, sans-serif";
const font = (w, s) => `${w} ${s}px ${FONT}`;

function drawPhone(ctx, p, img, T) {
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  ctx.rotate((p.rot * Math.PI) / 180);
  const x = -p.w / 2, y = -p.h / 2;
  ctx.shadowColor = T.shadow; ctx.shadowBlur = 80; ctx.shadowOffsetY = 40;
  const m = p.bare ? 0 : BEZEL; // layar lanjutan (seri): kartu layar saja, tanpa bingkai HP
  ctx.fillStyle = p.bare ? "#ffffff" : "#111111"; ctx.beginPath(); ctx.roundRect(x, y, p.w, p.h, p.bare ? 46 : 58); ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  if (!p.bare) { ctx.strokeStyle = T.rim || "#4a4f4d"; ctx.lineWidth = 2; ctx.stroke(); } // tepi tipis seperti rangka logam
  const sx = x + m, sy = y + m, sw = p.w - 2 * m, sh = p.h - 2 * m;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, p.bare ? 46 : 58 - BEZEL); ctx.clip();
  if (img) { const c = coverTop(img.naturalWidth || img.width, img.naturalHeight || img.height, sw, sh); ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, sx, sy, sw, sh); }
  else { ctx.fillStyle = "#d9dedb"; ctx.fillRect(sx, sy, sw, sh); }
  ctx.restore();
  if (!p.bare) { ctx.fillStyle = "#111111"; ctx.beginPath(); ctx.roundRect(-42, sy + 14, 84, 24, 12); ctx.fill(); }
  ctx.restore();
}

// bayangan lantai untuk HP melayang: elips lembut di bawah HP (setelah diputar)
function drawFloor(ctx, p, T) {
  const r = (Math.abs(p.rot) * Math.PI) / 180, cx = p.x + p.w / 2, cy = p.y + p.h / 2 + (p.h * Math.cos(r) + p.w * Math.sin(r)) / 2 + 60, rx = p.w * 0.6;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  g.addColorStop(0, T.shadow); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.12); ctx.translate(-cx, -cy);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rx, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// potongan screenshot yang diperbesar, menyala di atas HP
function drawHl(ctx, b, img, r, T) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, x = -b.w / 2, y = -b.h / 2, rad = Math.min(28, b.h / 4);
  ctx.save();
  ctx.translate(b.cx, b.cy); ctx.rotate((b.rot * Math.PI) / 180);
  ctx.shadowColor = T.hlGlow; ctx.shadowBlur = 70;
  ctx.fillStyle = "#111111"; ctx.beginPath(); ctx.roundRect(x, y, b.w, b.h, rad); ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
  ctx.save(); ctx.clip(); ctx.drawImage(img, r.x * iw, r.y * ih, r.w * iw, r.h * ih, x, y, b.w, b.h); ctx.restore();
  ctx.strokeStyle = T.hlRim; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(x, y, b.w, b.h, rad); ctx.stroke();
  ctx.restore();
}

/** Gambar banner: latar -> logo -> label -> judul -> penjelasan -> HP -> menu yang disorot. Hasil: kolom teks yang tidak muat. */
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
  if (L.desc && desc) { y += 28; block(desc, "desc", 400, Math.min(52, Math.max(28, +o.descSize || 44)), 1.4, 4, T.desc); }
  // HP
  if (L.float) for (const p of L.phones) drawFloor(ctx, p, T);
  for (const p of L.phones) drawPhone(ctx, p, (o.shots || [])[p.no - 1] || null, T);
  // menu yang disorot: o.hl = { shot: indeks screenshot (0 = HP 1), r: {x, y, w, h} 0..1, d: [dx, dy] geseran manual (px banner) }
  const hl = o.hl, hp = hl && hl.r && L.phones.find((p) => p.no - 1 === hl.shot), him = hp && (o.shots || [])[hl.shot];
  let hb = null;
  if (him) { hb = moveHl(hlBox(L, hp, him.naturalWidth || him.width, him.naturalHeight || him.height, hl.r), hl.d); drawHl(ctx, hb, him, hl.r, T); }
  ctx.restore();
  return { overflow, hl: hb };
}
