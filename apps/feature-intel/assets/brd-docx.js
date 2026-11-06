// BRD -> file Word: mengisi assets/brd-template.docx (salinan template resmi F-IT-BRD-0624-00 yang diberi penanda {{f:..}} / {{s:..}}
// oleh tools/tag-template.mjs). Dipakai halaman (browser) dan test.mjs (Node). Tanpa library: zip dibaca dengan
// DecompressionStream("deflate-raw") dan ditulis tanpa kompresi (Word menerima entri "stored").
// Gaya tabel isi disalin dari contoh BRD: garis 8EAADB, baris judul DEEAF6 tebal, Verdana 8 pt; paragraf isi Verdana 9 pt.

const te = new TextEncoder(), td = new TextDecoder();
export const xmlEsc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- zip ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (d) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
async function inflate(data) {
  const s = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
/** Isi zip -> [{ name, data }] sesuai urutan direktori pusat. */
export async function unzip(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = b.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Bukan file .docx (zip) yang sah.");
  const count = v.getUint16(e + 10, true), out = [];
  for (let i = 0, p = v.getUint32(e + 16, true); i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("Direktori zip rusak.");
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const name = td.decode(b.subarray(p + 46, p + 46 + nl)), start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true);
    const raw = b.subarray(start, start + size);
    out.push({ name, data: method === 8 ? await inflate(raw) : method === 0 ? raw.slice() : (() => { throw new Error("Kompresi zip tidak dikenal: " + method); })() });
    p += 46 + nl + xl + cl;
  }
  return out;
}
/** [{ name, data }] -> isi zip (entri tanpa kompresi, nama UTF-8). */
export function zip(entries) {
  const parts = [], dir = [];
  let off = 0;
  for (const { name, data } of entries) {
    const n = te.encode(name), c = crc32(data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, c, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, n.length, true);
    const d = new DataView(new ArrayBuffer(46));
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x0800, true); d.setUint16(14, 0x21, true);
    d.setUint32(16, c, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true); d.setUint16(28, n.length, true); d.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), n, data); dir.push(new Uint8Array(d.buffer), n);
    off += 30 + n.length + data.length;
  }
  const dirLen = dir.reduce((a, x) => a + x.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, dirLen, true); end.setUint32(16, off, true);
  const all = [...parts, ...dir, new Uint8Array(end.buffer)], res = new Uint8Array(all.reduce((a, x) => a + x.length, 0));
  let i = 0; for (const x of all) { res.set(x, i); i += x.length; }
  return res;
}

/* ---------- OOXML ---------- */
const FONT = '<w:rFonts w:ascii="Verdana" w:eastAsia="Verdana" w:hAnsi="Verdana" w:cs="Verdana"/>';
const run = (t, { b, i, sz = 18 } = {}) => `<w:r><w:rPr>${FONT}${b ? "<w:b/><w:bCs/>" : ""}${i ? "<w:i/><w:iCs/>" : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
const para = (t, o = {}) => `<w:p><w:pPr><w:spacing w:before="${o.before || 0}" w:after="${o.after ?? 100}" w:line="276" w:lineRule="auto"/>${o.ind ? '<w:ind w:left="360" w:hanging="360"/>' : ""}</w:pPr>${t === "" ? "" : run(t, o)}</w:p>`;
const bullet = (t) => para("•\t" + t, { ind: true, after: 60 });
const SPACER = para("", { after: 80 });
const MAR = '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>';
const cell = (t, w, head) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="DEEAF6"/>' : ""}${MAR}</w:tcPr>${String(t).split("\n").map((x) => para(x, { b: head, sz: 16, after: 0 })).join("")}</w:tc>`;
/** Tabel bergaya contoh BRD. head = baris judul (null = tanpa baris judul). */
function table(widths, head, rows) {
  const W = widths.reduce((a, x) => a + x, 0), B = (k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="8EAADB"/>`;
  const tr = (cells, h) => `<w:tr>${h ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells.map((c, i) => cell(c, widths[i], h)).join("")}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(B).join("")}</w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`
    + `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${head ? tr(head, true) : ""}${rows.map((r) => tr(r, false)).join("")}</w:tbl>` + SPACER;
}
const BLANK = "___";
/** Isi tiap bagian sebagai OOXML; kunci = penanda {{s:kunci}} di template. */
const SECTION = {
  ringkasan: (S) => S.ringkasan.map((t) => para(t)).join(""),
  tujuan: (S) => S.tujuan.map(bullet).join(""),
  ruang_lingkup: (S) => para("Termasuk dalam Ruang Lingkup", { b: true }) + S.ruang_lingkup.map(bullet).join(""),
  kebutuhan: (S) => para("Prioritas: H = wajib untuk go-live, M = sebaiknya ada, L = pelengkap / fase berikutnya.", { i: true })
    + S.kebutuhan.map((m) => para(m.modul, { b: true, sz: 20, before: 120 }) + table([900, 780, 7377], ["ID", "Pri.", "Deskripsi kebutuhan"], m.rows.map((r) => [r.id, r.pri, r.text]))).join(""),
  definisi: (S) => S.definisi.length ? table([2200, 3428, 3429], ["Metrik", "Bahasa Indonesia", "English"], S.definisi.map((d) => [d.istilah, d.id, d.en])) : para("Tidak ada istilah atau teks pop-up baru pada fitur ini."),
  keamanan: (S) => S.keamanan.map(bullet).join(""),
  pemangku: (S) => table([2500, 2800, 3757], ["Nama", "Jabatan", "Tugas"], S.pemangku.map((p) => ["", p.jabatan, p.tugas])),
  kendala: (S) => table([2600, 6457], ["Kendala", "Deskripsi"], S.kendala.map((k) => [k.kendala, k.deskripsi])),
  tambahan: (S) => para("Hal-hal berikut perlu dikonfirmasi terlebih dahulu, kemudian ditambahkan ke tabel kebutuhan di atas.")
    + table([2600, 6457], ["Butir", "Alasan diperlukan / yang perlu ditambahkan"], S.tambahan.map((t) => [t.butir, t.alasan])),
  jadwal: (S) => table([900, 4357, 1900, 1900], ["Fase", "Aktivitas", "Durasi (hari kerja)", "Target tanggal"], S.jadwal.map((j) => [j.fase, j.aktivitas, BLANK, BLANK]))
    + para("Tanggal akan dilengkapi oleh Project Manager setelah konfirmasi sumber daya.", { i: true }),
  open_items: (S) => table([900, 8157], ["No", "Hal yang perlu dikonfirmasi"], S.open_items.map((t, i) => [String(i + 1), t])),
  persetujuan: () => table([3019, 3019, 3019], null, [["Diajukan Oleh,", "Diketahui Oleh,", "Disetujui Oleh,"], ["\n\n", "\n\n", "\n\n"],
    ["(_________________)", "(_________________)", "(_________________)"], ["Project Manager", "Head Department", "Associate Director"], ["Tanggal:", "Tanggal:", "Tanggal:"]]),
  lampiran: (S) => para("Lampiran", { b: true, sz: 24, before: 240 }) + S.lampiran.map((t) => para(t)).join(""),
};

/** Template bertanda + isi BRD (bentuk brd.js) -> isi file .docx. File lain di zip (kepala/kaki halaman, gaya, logo) tidak disentuh. */
export async function brdDocx(templateBytes, S) {
  const files = await unzip(templateBytes), doc = files.find((f) => f.name === "word/document.xml");
  if (!doc) throw new Error("Template BRD tidak berisi word/document.xml.");
  const xml = td.decode(doc.data)
    .replace(/\{\{f:(\w+)\}\}/g, (_, k) => xmlEsc(S.identitas[k] ?? BLANK))
    .replace(/<w:p>(?:(?!<w:p>)[\s\S])*?\{\{s:(\w+)\}\}[\s\S]*?<\/w:p>/g, (_, k) => {
      const x = SECTION[k] ? SECTION[k](S) : "";
      return x.endsWith(SPACER) ? x : x + SPACER;   // jarak sebelum kotak judul berikutnya, seperti contoh
    });
  doc.data = te.encode(xml);
  return zip(files);
}
