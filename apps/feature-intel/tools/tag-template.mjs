// Sekali jalan: salin template resmi BRD (docs/superpowers/specs/assets/BRD Template.docx) ke assets/brd-template.docx
// dan beri penanda isian tanpa mengubah gaya. Jalankan ulang bila template resmi diganti:
//   node apps/feature-intel/tools/tag-template.mjs
// - kotak identitas (tabel 1): {{f:nama_proyek}} {{f:versi}} {{f:tanggal}} {{f:referensi}} di sel kanan yang kosong
// - tiap kotak judul (tabel 2–13): paragraf jarak pertama dipertahankan, paragraf kosong / "•" sesudahnya diganti {{s:<bagian>}}
// - setelah Persetujuan: {{s:persetujuan}} lalu {{s:lampiran}}
import fs from "node:fs";
import { unzip, zip } from "../assets/brd-docx.js";

const SRC = new URL("../../../docs/superpowers/specs/assets/BRD Template.docx", import.meta.url);
const OUT = new URL("../assets/brd-template.docx", import.meta.url);
const KEYS = ["ringkasan", "tujuan", "ruang_lingkup", "kebutuhan", "definisi", "keamanan", "pemangku", "kendala", "tambahan", "jadwal", "open_items", "persetujuan"];
const IDENT = { 0: "nama_proyek", 2: "versi", 3: "tanggal", 5: "referensi" };
const RUN = (t) => `<w:r><w:rPr><w:rFonts w:ascii="Verdana" w:eastAsia="Verdana" w:hAnsi="Verdana" w:cs="Verdana"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
const TAG = (k) => `<w:p><w:r><w:t>{{s:${k}}}</w:t></w:r></w:p>`;

const files = await unzip(fs.readFileSync(SRC)), doc = files.find((f) => f.name === "word/document.xml");
let xml = new TextDecoder().decode(doc.data);
const head = xml.slice(0, xml.indexOf("<w:body>") + 8), tail = xml.slice(xml.lastIndexOf("<w:sectPr"));
const body = xml.slice(head.length, xml.length - tail.length);
const parts = body.split(/(<w:tbl>[\s\S]*?<\/w:tbl>)/);
const tables = parts.map((p, i) => (p.startsWith("<w:tbl>") ? i : -1)).filter((i) => i >= 0);
if (tables.length !== 13) throw new Error(`Template berubah: ada ${tables.length} tabel, diharapkan 13`);

// tabel 1: sel kanan baris kosong
let row = -1;
parts[tables[0]] = parts[tables[0]].replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (tr) => {
  const k = IDENT[++row];
  if (!k) return tr;
  const cells = tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g);
  return tr.replace(cells[1], cells[1].replace(/<\/w:p>/, RUN(`{{f:${k}}}`) + "</w:p>"));
});
// tabel 2–13: isi sesudah kotak judul
tables.slice(1).forEach((ti, n) => {
  const seg = parts[ti + 1] || "", ps = seg.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) || [];
  const keep = ps.slice(1).filter((p) => /w:type="page"|<w:sectPr/.test(p));
  parts[ti + 1] = (ps[0] || "") + TAG(KEYS[n]) + (n === KEYS.length - 1 ? TAG("lampiran") : "") + keep.join("");
});
xml = head + parts.join("") + tail;
doc.data = new TextEncoder().encode(xml);
fs.writeFileSync(OUT, zip(files));
console.log("tertulis:", OUT.pathname, (xml.match(/\{\{[fs]:\w+\}\}/g) || []).length, "penanda");
