// =============================================================================
//  EDITOR ANOTASI SCREENSHOT — dipakai submit.html dan admin.html
// =============================================================================
//  annotate(file) membuka jendela editor di atas halaman: kotak, panah, nomor
//  langkah, dan sensor (blur kotak-kotak) untuk menutup data pribadi.
//  Hasilnya File PNG baru (lalu dikecilkan compressImage seperti biasa).
//  "Pakai tanpa anotasi" mengembalikan file asli.
// =============================================================================

const RED = '#E5322D';
const MAX_W = 1600;   // kanvas kerja; hasil akhir tetap dikecilkan ke 1080px oleh compressImage

function css(){
  if(document.getElementById('ann-css')) return;
  const s = document.createElement('style');
  s.id = 'ann-css';
  s.textContent = `
  .ann-bg{position:fixed;inset:0;background:rgba(10,16,13,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px}
  .ann{background:#fff;color:#17251d;border-radius:14px;max-width:min(980px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
  .ann-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:10px 12px;border-bottom:1px solid #e3ebe7}
  .ann-bar b{margin-right:6px}
  .ann-bar button{border:1px solid #dfe8e2;background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-weight:600;color:#17251d}
  .ann-bar button[aria-pressed="true"]{background:#e3f2e9;border-color:#1f7a4d;color:#1f7a4d}
  .ann-bar .sp{flex:1}
  .ann-bar .pri{background:#1f7a4d;border-color:#1f7a4d;color:#fff}
  .ann-wrap{overflow:auto;padding:10px;background:#f2f5f3;display:flex;justify-content:center}
  .ann canvas{max-width:100%;max-height:68vh;touch-action:none;cursor:crosshair;box-shadow:0 1px 4px rgba(0,0,0,.2);background:#fff}
  .ann-hint{font-size:12px;color:#5b6d62;padding:8px 12px;border-top:1px solid #e3ebe7}`;
  document.head.appendChild(s);
}

function loadImage(file){
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error('Gambar tidak bisa dibuka.')); };
    img.src = url;
  });
}

function arrow(ctx, x1, y1, x2, y2, w){
  const a = Math.atan2(y2 - y1, x2 - x1), h = w * 4.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(a) * h * .6, y2 - Math.sin(a) * h * .6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - h * Math.cos(a - .45), y2 - h * Math.sin(a - .45));
  ctx.lineTo(x2 - h * Math.cos(a + .45), y2 - h * Math.sin(a + .45));
  ctx.closePath(); ctx.fill();
}
function pixelate(ctx, src, x, y, w, h, cell){
  if(w < 2 || h < 2) return;
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(w / cell)); t.height = Math.max(1, Math.round(h / cell));
  const tx = t.getContext('2d');
  tx.drawImage(src, x, y, w, h, 0, 0, t.width, t.height);
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, t.width, t.height, x, y, w, h); ctx.restore();
}

/** Buka editor. Hasil: File baru (PNG) atau file asli bila dilewati. Ditolak (reject) hanya bila gambar rusak. */
export async function annotate(file){
  if(!file || !/^image\//.test(file.type)) return file;
  css();
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_W / img.naturalWidth), W = Math.round(img.naturalWidth * scale), H = Math.round(img.naturalHeight * scale);
  const base = document.createElement('canvas'); base.width = W; base.height = H;
  base.getContext('2d').drawImage(img, 0, 0, W, H);
  const lw = Math.max(3, Math.round(W / 220)), cell = Math.max(8, Math.round(W / 60));

  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'ann-bg';
    bg.innerHTML = `<div class="ann" role="dialog" aria-modal="true" aria-label="Tandai screenshot">
      <div class="ann-bar"><b>Tandai screenshot</b>
        <button type="button" data-tool="rect" aria-pressed="true">▭ Kotak</button>
        <button type="button" data-tool="arrow" aria-pressed="false">➜ Panah</button>
        <button type="button" data-tool="num" aria-pressed="false">① Nomor</button>
        <button type="button" data-tool="blur" aria-pressed="false">▦ Sensor</button>
        <button type="button" data-act="undo">↶ Urungkan</button>
        <span class="sp"></span>
        <button type="button" data-act="skip">Pakai tanpa anotasi</button>
        <button type="button" class="pri" data-act="done">Selesai</button>
      </div>
      <div class="ann-wrap"><canvas width="${W}" height="${H}"></canvas></div>
      <div class="ann-hint">Tarik untuk membuat kotak, panah, atau sensor; klik untuk nomor langkah. Sensor dipakai untuk menutup nama, nomor rekening, saldo, atau data pribadi lain.</div>
    </div>`;
    document.body.appendChild(bg);
    const cv = bg.querySelector('canvas'), ctx = cv.getContext('2d'), ops = [];
    let tool = 'rect', drag = null;

    function draw(extra){
      ctx.drawImage(base, 0, 0);
      let n = 0;
      for(const o of extra ? [...ops, extra] : ops){
        ctx.strokeStyle = RED; ctx.fillStyle = RED; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        const x = Math.min(o.x1, o.x2), y = Math.min(o.y1, o.y2), w = Math.abs(o.x2 - o.x1), h = Math.abs(o.y2 - o.y1);
        if(o.t === 'rect'){ ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x, y, w, h, lw * 2); else ctx.rect(x, y, w, h); ctx.stroke(); }
        else if(o.t === 'arrow') arrow(ctx, o.x1, o.y1, o.x2, o.y2, lw);
        else if(o.t === 'blur') pixelate(ctx, cv, x, y, w, h, cell);
        else if(o.t === 'num'){
          n++; const r = lw * 5.5;
          ctx.beginPath(); ctx.arc(o.x1, o.y1, r, 0, Math.PI * 2); ctx.fill();
          ctx.lineWidth = Math.max(2, lw / 2); ctx.strokeStyle = '#fff'; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(r * 1.15)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(n), o.x1, o.y1 + r * .05);
        }
      }
    }
    draw();
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = pos(e);
      if(tool === 'num'){ ops.push({ t: 'num', x1: x, y1: y }); draw(); return; }
      drag = { t: tool, x1: x, y1: y, x2: x, y2: y }; cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => { if(!drag) return; [drag.x2, drag.y2] = pos(e); draw(drag); });
    const end = () => { if(!drag) return; if(Math.hypot(drag.x2 - drag.x1, drag.y2 - drag.y1) > 6) ops.push(drag); drag = null; draw(); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

    const close = (v) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if(e.key === 'Escape') close(file); if((e.ctrlKey || e.metaKey) && e.key === 'z'){ ops.pop(); draw(); } };
    document.addEventListener('keydown', onKey);
    bg.querySelector('.ann-bar').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if(!b) return;
      if(b.dataset.tool){ tool = b.dataset.tool; bg.querySelectorAll('[data-tool]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); return; }
      if(b.dataset.act === 'undo'){ ops.pop(); draw(); return; }
      if(b.dataset.act === 'skip') return close(file);
      if(b.dataset.act === 'done'){
        if(!ops.length) return close(file);
        draw();
        cv.toBlob((blob) => close(blob ? new File([blob], (file.name || 'gambar').replace(/\.[^.]+$/, '') + '-anotasi.png', { type: 'image/png' }) : file), 'image/png');
      }
    });
  });
}
