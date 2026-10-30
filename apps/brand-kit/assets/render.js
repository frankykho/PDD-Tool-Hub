// Mesin gambar Brand Kit (dipakai halaman lewat <script type="module"> dan diuji di Node: render.test.mjs).
// Bagian atas = hitungan murni (tanpa DOM). draw() = menggambar ke canvas 2D: latar -> logo -> teks -> narasumber -> QR -> disclaimer.

/** Skala gambar supaya canvas tidak lewat batas piksel HP (Safari iOS ±16,7 MP). 1 = ukuran penuh. */
export function canvasScale(w, h, max = 16e6) {
  return w * h <= max ? 1 : Math.sqrt(max / (w * h));
}
/** Susunan baris narasumber: 1–3 satu baris; 4 = 2+2; 5 = 3+2; 6 = 3+3. */
export function rowsFor(n) {
  return n <= 3 ? [n] : n === 4 ? [2, 2] : [3, n - 3];
}
/** Narasumber yang muat di ukuran ini (urutan dipertahankan) + jumlah yang terpotong. */
export function speakersFor(list, max) {
  const shown = list.slice(0, Math.max(0, max));
  return { shown, cut: list.length - shown.length };
}
/** Posisi tiap narasumber di kotaknya: lingkaran foto (cx, cy, r) + garis dasar nama & jabatan, lebar teks w. Baris di tengah kotak. */
export function speakerLayout(slot, n) {
  if (!n) return [];
  const rows = rowsFor(n), cols = Math.max(...rows), cw = slot.w / cols, rh = slot.h / rows.length;
  const gap = slot.nameSize * 0.4, textH = gap + slot.nameSize * 1.2 + slot.titleSize * 1.2 * 2;
  const r = Math.max(4, Math.min(cw * 0.42, (rh - textH) / 2));
  const out = [];
  rows.forEach((k, i) => {
    const x0 = slot.x + (slot.w - k * cw) / 2, top = slot.y + rh * i + Math.max(0, (rh - (2 * r + textH)) / 2);
    for (let j = 0; j < k; j++) {
      const cy = top + r, nameY = top + 2 * r + gap + slot.nameSize;
      out.push({ cx: x0 + cw * (j + 0.5), cy, r, nameY, titleY: nameY + slot.titleSize * 1.2, w: cw * 0.94 });
    }
  });
  return out;
}
/** Pecah teks per kata supaya tiap baris <= w (kata yang terlalu panjang tetap satu baris sendiri). */
export function wrap(measure, text, size, w) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean), lines = [];
  let cur = "";
  for (const wd of words) {
    const t = cur ? cur + " " + wd : wd;
    if (!cur || measure(t, size) <= w) cur = t; else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}
/** Teks menyesuaikan kotak: perkecil 1 px sampai minSize. Kalau tetap tidak muat: overflow, baris dipotong dengan "…" di dalam kotak. */
export function fitText(measure, text, slot) {
  if (!String(text || "").trim()) return { lines: [], size: slot.size, overflow: false };
  const min = Math.min(slot.minSize || slot.size, slot.size);
  for (let size = slot.size; size >= min; size--) {
    const lines = wrap(measure, text, size, slot.w), max = Math.max(1, Math.floor(slot.h / (size * 1.2)));
    if (lines.length <= max && lines.every((l) => measure(l, size) <= slot.w)) return { lines, size, overflow: false };
  }
  const max = Math.max(1, Math.floor(slot.h / (min * 1.2))), all = wrap(measure, text, min, slot.w), lines = all.slice(0, max);
  const cut = (s) => { let t = s; while (t && measure(t + "…", min) > slot.w) t = t.slice(0, -1); return t.replace(/\s+$/, "") + "…"; };
  lines.forEach((l, i) => { if (measure(l, min) > slot.w || (i === lines.length - 1 && all.length > lines.length)) lines[i] = cut(l); });
  return { lines, size: min, overflow: true };
}
/** Isian form gabungan semua ukuran: teks per kunci field (yang pertama menang, batas huruf terkecil), narasumber terbanyak, QR ada/tidak. */
export function fieldsOf(sizes) {
  const text = [], by = {};
  let speakers = 0, qr = false;
  for (const s of sizes) for (const x of s.slots || []) {
    if (x.type === "text") {
      if (!by[x.field]) { by[x.field] = { field: x.field, label: x.label, required: !!x.required, max: x.max, auto: x.auto || "", def: x.def || "" }; text.push(by[x.field]); }
      else by[x.field].max = Math.min(by[x.field].max, x.max);
    } else if (x.type === "speakers") speakers = Math.max(speakers, x.max);
    else if (x.type === "qr") qr = true;
  }
  return { text, speakers, qr };
}

/* ---------- menggambar (browser) ---------- */
const font = (weight, size, family) => `${weight} ${size}px "${family}", sans-serif`;
function drawLines(ctx, lines, size, box, align) {
  const lh = size * 1.2, top = box.y + Math.max(0, (box.h - lines.length * lh) / 2);
  ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  const x = align === "center" ? box.x + box.w / 2 : align === "right" ? box.x + box.w : box.x;
  lines.forEach((l, i) => ctx.fillText(l, x, top + lh * i + size * 0.92));
}
/** Foto dalam lingkaran; crop = { x, y } (-1..1, geser) dan zoom (>= 1). */
function drawPhoto(ctx, img, cx, cy, r, crop) {
  const c = crop || {}, zoom = Math.max(1, Number(c.zoom) || 1), iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const sc = Math.max((2 * r) / iw, (2 * r) / ih) * zoom, dw = iw * sc, dh = ih * sc;
  const dx = cx - dw / 2 + ((Number(c.x) || 0) * (dw - 2 * r)) / 2, dy = cy - dh / 2 + ((Number(c.y) || 0) * (dh - 2 * r)) / 2;
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh); ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.lineWidth = Math.max(2, r * 0.04); ctx.strokeStyle = "#ffffff"; ctx.stroke();
}
/**
 * Gambar satu ukuran. o = { size (baris ukuran: slots, logo, disc), S ({ w, h }), bg, logo (gambar), values ({ field: teks }),
 * speakers ([{ name, title, img, crop }]), qr (objek qrcode-generator atau null), disclaimer (teks), scale }.
 * Hasil: { overflow: [field...], cut } — isian yang tidak muat & jumlah narasumber yang tidak tampil.
 */
export function draw(ctx, o) {
  const { size, S } = o, scale = o.scale || 1, overflow = [];
  let cut = 0;
  const measureWith = (w, f) => (t, s) => { ctx.font = font(w, s, f); return ctx.measureText(t).width; };
  ctx.save(); ctx.scale(scale, scale);
  ctx.clearRect(0, 0, S.w, S.h);
  if (o.bg) ctx.drawImage(o.bg, 0, 0, S.w, S.h); else { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, S.w, S.h); }
  if (o.logo && size.logo) {
    const h = size.logo.h, w = ((o.logo.naturalWidth || o.logo.width) * h) / (o.logo.naturalHeight || o.logo.height);
    ctx.drawImage(o.logo, (S.w - w) / 2, size.logo.y, w, h);
  }
  for (const sl of size.slots || []) {
    if (sl.type === "text") {
      const v = String((o.values || {})[sl.field] ?? "").trim() || sl.def || "";
      if (!v) continue;
      const fit = fitText(measureWith(sl.weight, sl.font), v.slice(0, sl.max), sl);
      if (fit.overflow) overflow.push(sl.field);
      ctx.fillStyle = sl.color; ctx.font = font(sl.weight, fit.size, sl.font);
      drawLines(ctx, fit.lines, fit.size, sl, sl.align);
    } else if (sl.type === "speakers") {
      const { shown, cut: c } = speakersFor(o.speakers || [], sl.max);
      cut = c;
      speakerLayout(sl, shown.length).forEach((p, i) => {
        const sp = shown[i];
        if (sp.img) drawPhoto(ctx, sp.img, p.cx, p.cy, p.r, sp.crop);
        ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        const nm = fitText(measureWith(700, sl.font), sp.name || "", { w: p.w, h: sl.nameSize * 1.2, size: sl.nameSize, minSize: Math.round(sl.nameSize * 0.7) });
        ctx.fillStyle = sl.nameColor; ctx.font = font(700, nm.size, sl.font);
        if (nm.lines[0]) ctx.fillText(nm.lines[0], p.cx, p.nameY);
        const tt = fitText(measureWith(400, sl.font), sp.title || "", { w: p.w, h: sl.titleSize * 1.2 * 2, size: sl.titleSize, minSize: Math.round(sl.titleSize * 0.8) });
        ctx.fillStyle = sl.titleColor; ctx.font = font(400, tt.size, sl.font);
        tt.lines.forEach((l, k) => ctx.fillText(l, p.cx, p.titleY + k * tt.size * 1.2));
        if (nm.overflow || tt.overflow) overflow.push("speakers");
      });
    } else if (sl.type === "qr" && o.qr) {
      // latar putih + zona tenang 2 modul di setiap sisi
      const n = o.qr.getModuleCount(), cell = sl.size / (n + 4);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(sl.x, sl.y, sl.size, sl.size);
      ctx.fillStyle = sl.color;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (o.qr.isDark(r, c)) ctx.fillRect(sl.x + (c + 2) * cell, sl.y + (r + 2) * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
  if (o.disclaimer && size.disc) {
    const d = size.disc, ms = measureWith(400, "Inter"), lines = String(o.disclaimer).split(/\n/).flatMap((p) => wrap(ms, p, d.size, d.w));
    ctx.fillStyle = d.color; ctx.font = font(400, d.size, "Inter");
    drawLines(ctx, lines, d.size, { x: d.x, y: d.y, w: d.w, h: lines.length * d.size * 1.2 }, d.align);
  }
  ctx.restore();
  return { overflow: [...new Set(overflow)], cut };
}
/** PDF satu halaman seukuran kertas + bleed (mm); gambar memenuhi halaman. */
export function toPdf(jsPDF, canvas, mm) {
  const doc = new jsPDF({ orientation: mm[0] > mm[1] ? "l" : "p", unit: "mm", format: [mm[0], mm[1]], compress: true });
  doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, mm[0], mm[1]);
  return doc.output("blob");
}
