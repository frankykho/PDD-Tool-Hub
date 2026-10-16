// =============================================================================
//  HELPER GAMBAR — dipakai submit.html dan admin.html
// =============================================================================
//  compressImage(): mengecilkan gambar di browser sebelum dikirim
//  (lebar maks 1080px, format WebP; fallback JPEG di browser lama).
//  Screenshot HP 2–6 MB biasanya jadi ±100–300 KB.
//
//  Hasilnya dijaga di bawah MAX_BYTES supaya muat disimpan sementara di
//  Firestore (batas 1 dokumen = 1 MB) selama usulan menunggu review.
// =============================================================================

export const MAX_IMAGE_WIDTH = 1080;
export const MAX_BYTES = 600 * 1024;

function loadViaImgElement(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality){
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

async function render(source, width, quality){
  const scale = Math.min(1, width / source.width);
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  let blob = await canvasToBlob(canvas, 'image/webp', quality);
  if(!blob || blob.type !== 'image/webp'){
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }
  return blob;
}

/**
 * Kecilkan gambar. Mengembalikan Blob (image/webp atau image/jpeg).
 * Melempar Error dengan pesan yang bisa langsung ditampilkan ke pengguna.
 */
export async function compressImage(file){
  if(!file || !file.type || !file.type.startsWith('image/')){
    throw new Error('File ini bukan gambar. Pilih file JPG, PNG, atau WebP.');
  }
  let source;
  try{
    source = await createImageBitmap(file);
  }catch(_){
    try{
      source = await loadViaImgElement(file);
    }catch(__){
      throw new Error('Gambar tidak bisa dibaca browser (format HEIC dari iPhone sering begini). Simpan ulang sebagai JPG/PNG lalu pilih lagi.');
    }
  }
  // Turunkan kualitas/ukuran bertahap sampai di bawah batas
  const attempts = [
    [MAX_IMAGE_WIDTH, 0.82], [MAX_IMAGE_WIDTH, 0.7], [MAX_IMAGE_WIDTH, 0.6],
    [900, 0.6], [720, 0.6]
  ];
  let blob = null;
  for(const [w, q] of attempts){
    blob = await render(source, w, q);
    if(blob && blob.size <= MAX_BYTES) break;
  }
  if(source.close) source.close();
  if(!blob) throw new Error('Gagal memproses gambar. Coba gambar lain.');
  if(blob.size > MAX_BYTES) throw new Error('Gambar terlalu besar walau sudah dikecilkan. Coba potong (crop) gambarnya dulu.');
  return blob;
}

/** Blob -> string base64 (tanpa awalan "data:...;base64,") */
export function blobToBase64(blob){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function extForMime(mime){
  return mime === 'image/webp' ? 'webp' : (mime === 'image/png' ? 'png' : 'jpg');
}
