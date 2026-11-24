// Baca/buat .docx tanpa DOM (regex saja) supaya bisa diuji di Node. ZIP dikerjakan JSZip yang dikirim pemanggil.
export const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const xmlUnesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");

// Teks satu <w:p>: gabungan semua <w:t>, <w:tab/> jadi \t, <w:br/> jadi \n.
export function paragraphText(pXml) {
  let out = "";
  for (const m of pXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br(?:\s[^>]*)?\/?>/g)) out += m[0].startsWith("<w:tab") ? "\t" : m[0].startsWith("<w:br") ? "\n" : xmlUnesc(m[1]);
  return out;
}

// shortcut: isi textbox (mc:AlternateContent / w:txbxContent) diganti penanda supaya </w:p> di dalamnya tidak memotong paragraf; teksnya tidak ikut direview. Textbox bersarang tidak ditangani.
export function maskBoxes(xml) {
  const saved = [];
  return { xml: xml.replace(/<mc:AlternateContent\b[\s\S]*?<\/mc:AlternateContent>|<w:txbxContent\b[\s\S]*?<\/w:txbxContent>/g, (m) => `<w:zzMask i="${saved.push(m) - 1}"/>`), restore: (x) => x.replace(/<w:zzMask i="(\d+)"\/>/g, (_, i) => saved[+i]) };
}

export function docxParagraphs(documentXml) {
  documentXml = maskBoxes(documentXml).xml;
  const out = [];
  let depth = 0;
  for (const m of documentXml.matchAll(/<w:tbl>|<\/w:tbl>|<w:p(?:\s[^>]*?)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
    if (m[0] === "<w:tbl>") depth++;
    else if (m[0] === "</w:tbl>") depth--;
    else out.push({ i: out.length, text: paragraphText(m[0]), inTable: depth > 0 });
  }
  return out;
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";

const runXml = (r) => `<w:r>${r.b || r.i ? `<w:rPr>${r.b ? "<w:b/>" : ""}${r.i ? "<w:i/>" : ""}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEsc(r.text)}</w:t></w:r>`;

const drawing = (rid, id, w, h, name) => {
  const cx = Math.round(w * 9525), cy = Math.round(h * 9525);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${xmlEsc(name)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${xmlEsc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
};

const BULLET = "• "; // li: teks diawali bullet + indentasi gantung (tanpa numbering.xml)
const STYLE = { h1: "Heading1", h2: "Heading2", li: "ListBullet" };
const styles = () => `${HDR}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:style></w:styles>`;

export function makeDocx(blocks, opts = {}) {
  const files = {};
  const rels = [`<Relationship Id="rIdSt" Type="${REL}styles" Target="styles.xml"/>`];
  const exts = new Set();
  let n = 0;
  const media = (img, name) => { files["word/media/" + name] = img.data; exts.add(name.split(".")[1]); };
  const body = blocks.map((b) => {
    if (b.t === "img") {
      const name = `image${++n}.${b.img.ext === "jpg" ? "jpeg" : b.img.ext}`;
      media(b.img, name);
      rels.push(`<Relationship Id="rIdImg${n}" Type="${REL}image" Target="media/${name}"/>`);
      return `<w:p>${drawing("rIdImg" + n, n + 1, b.img.w, b.img.h, name)}</w:p>`;
    }
    const st = STYLE[b.t];
    return `<w:p>${st ? `<w:pPr><w:pStyle w:val="${st}"/></w:pPr>` : ""}${(b.t === "li" ? [{ text: BULLET }, ...(b.runs || [])] : b.runs || []).map(runXml).join("")}</w:p>`;
  }).join("");
  let sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
  const overrides = ['<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>', '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'];
  if (opts.logo) {
    media(opts.logo, "logo.png");
    files["word/_rels/header1.xml.rels"] = `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="${REL}image" Target="media/logo.png"/></Relationships>`;
    files["word/header1.xml"] = `${HDR}<w:hdr ${NS}><w:p>${drawing("rIdLogo", 100, opts.logo.w, opts.logo.h, "logo.png")}</w:p></w:hdr>`;
    rels.push(`<Relationship Id="rIdHdr" Type="${REL}header" Target="header1.xml"/>`);
    overrides.push('<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>');
    sect = sect.replace("<w:pgSz", '<w:headerReference w:type="default" r:id="rIdHdr"/><w:pgSz');
  }
  const mime = { png: "image/png", jpeg: "image/jpeg" };
  files["[Content_Types].xml"] = `${HDR}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...exts].map((e) => `<Default Extension="${e}" ContentType="${mime[e]}"/>`).join("")}${overrides.join("")}</Types>`;
  files["_rels/.rels"] = `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}officeDocument" Target="word/document.xml"/></Relationships>`;
  files["word/document.xml"] = `${HDR}<w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`;
  files["word/styles.xml"] = styles();
  files["word/_rels/document.xml.rels"] = `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`;
  return files;
}

export function zipFiles(JSZip, files) {
  const z = new JSZip();
  for (const [p, d] of Object.entries(files)) z.file(p, d);
  return z.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function unzip(JSZip, blob) {
  const z = await JSZip.loadAsync(blob), out = {};
  for (const [p, f] of Object.entries(z.files)) if (!f.dir) out[p] = await f.async(/\.(xml|rels)$/.test(p) ? "string" : "uint8array");
  return out;
}

// ---- Edit Word: saran sebagai Track Changes / bersih, dan salinan Inggris ----
// id baru mulai 9001 atau di atas id terbesar yang sudah ada
const nextId = (xml) => Math.max(9000, ...[...xml.matchAll(/\sw:id="(\d+)"/g)].map((m) => +m[1])) + 1;
const PARA = /<w:p(?:\s[^>]*?)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
// shortcut: run di dalam ins/del/hyperlink/sdt dianggap buram (tidak dicari/diubah), upgrade bila saran perlu menjangkau hyperlink
const ITEM = /<w:(ins|del|hyperlink|smartTag|sdt|moveFrom|moveTo|fldSimple)(?:\s[^>]*)?(?<!\/)>[\s\S]*?<\/w:\1>|<w:r(?:\s[^>]*)?\/>|<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;

function tokens(inner) {
  const out = [];
  let last = 0;
  for (const m of inner.matchAll(ITEM)) {
    if (m.index > last) out.push({ xml: inner.slice(last, m.index) });
    out.push(/^<w:r[\s>/]/.test(m[0]) ? { xml: m[0], run: parseRun(m[0]) } : { xml: m[0] });
    last = m.index + m[0].length;
  }
  if (last < inner.length) out.push({ xml: inner.slice(last) });
  return out;
}

function parseRun(xml) {
  const m = xml.match(/^<w:r((?:\s[^>]*?)?)(?:\/>|>([\s\S]*)<\/w:r>)$/);
  let body = m[2] || "";
  const rPr = (body.match(/^<w:rPr(?:\s[^>]*)?\/>|^<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
  body = body.slice(rPr.length);
  const atoms = [];
  for (const a of body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t\/>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>|<(w:\w+)(?:\s[^>]*)?\/>|<(w:\w+)(?:\s[^>]*)?>[\s\S]*?<\/\3>/g)) {
    if (/^<w:t[\s>/]/.test(a[0])) atoms.push({ k: "t", text: xmlUnesc(a[1] || "") });
    else if (a[0] === "<w:tab/>") atoms.push({ k: "c", text: "\t", xml: a[0] });
    else if (a[0].startsWith("<w:br")) atoms.push({ k: "c", text: "\n", xml: a[0] });
    else atoms.push({ k: "x", xml: a[0] });
  }
  return { attrs: m[1], rPr, atoms, text: atoms.map((a) => a.text || "").join("") };
}

const textAtoms = (s) => s.split(/(\t|\n)/).filter(Boolean).map((p) => p === "\t" ? { k: "c", xml: "<w:tab/>" } : p === "\n" ? { k: "c", xml: "<w:br/>" } : { k: "t", text: p });
const atomXml = (a, del) => a.k === "t" ? `<w:${del ? "delText" : "t"} xml:space="preserve">${xmlEsc(a.text)}</w:${del ? "delText" : "t"}>` : a.xml;
const runXmlOf = (r, atoms, del) => atoms.length ? `<w:r${r.attrs}>${r.rPr}${atoms.map((a) => atomXml(a, del)).join("")}</w:r>` : "";

// Bagi atom satu run ke 4 keranjang menurut rentang [s,e) koordinat run. Atom non-teks (gambar, fldChar) di dalam rentang disimpan (keep), tidak ikut terhapus.
function cut(r, s, e) {
  const b = { before: [], mid: [], keep: [], after: [] };
  let pos = 0;
  for (const a of r.atoms) {
    if (a.k === "x") (pos < s ? b.before : pos < e ? b.keep : b.after).push(a);
    else if (a.k === "c") { (pos < s ? b.before : pos < e ? b.mid : b.after).push(a); pos++; }
    else {
      const x = Math.max(0, Math.min(a.text.length, s - pos)), y = Math.max(x, Math.min(a.text.length, e - pos));
      for (const [k, t] of [["before", a.text.slice(0, x)], ["mid", a.text.slice(x, y)], ["after", a.text.slice(y)]]) if (t) b[k].push({ k: "t", text: t });
      pos += a.text.length;
    }
  }
  return b;
}

function editParagraph(pXml, edit, track, attrs) {
  const m = pXml.match(/^(<w:p(?:\s[^>]*?)?>)([\s\S]*)(<\/w:p>)$/);
  if (!m || !edit.from) return null;
  const toks = tokens(m[2]);
  const idx = toks.map((t) => t.run?.text || "").join("").indexOf(edit.from);
  if (idx < 0) return null;
  const s = idx, e = idx + edit.from.length;
  let start = 0, first = -1, last = -1;
  toks.forEach((t, i) => {
    if (!t.run) return;
    const len = t.run.text.length;
    t.start = start;
    if (len && start < e && start + len > s) { if (first < 0) first = i; last = i; }
    start += len;
  });
  const pre = [], mids = [], keeps = [], post = [], between = [];
  let rPr = "";
  for (let i = first; i <= last; i++) {
    const t = toks[i];
    if (!t.run) { between.push(t.xml); continue; }
    const r = t.run, len = r.text.length;
    if (!len || t.start >= e || t.start + len <= s) { between.push(t.xml); continue; } // run di antara yang tak tercakup
    if (i === first) rPr = r.rPr;
    const b = cut(r, s - t.start, e - t.start);
    pre.push(runXmlOf(r, b.before)); mids.push(runXmlOf(r, b.mid, track)); keeps.push(runXmlOf(r, b.keep)); post.push(runXmlOf(r, b.after));
  }
  const newRun = edit.to ? runXmlOf({ attrs: "", rPr }, textAtoms(edit.to)) : "";
  const mid = track ? `<w:del ${attrs()}>${mids.join("")}</w:del>${newRun && `<w:ins ${attrs()}>${newRun}</w:ins>`}` : newRun;
  return m[1] + toks.slice(0, first).map((t) => t.xml).join("") + pre.join("") + mid + between.join("") + keeps.join("") + post.join("") + toks.slice(last + 1).map((t) => t.xml).join("") + m[3];
}

export function applyDocx(documentXml, edits, { track, author, date }) {
  const box = maskBoxes(documentXml);
  documentXml = box.xml;
  let id = nextId(documentXml);
  const attrs = () => `w:id="${id++}" w:author="${xmlEsc(author)}" w:date="${xmlEsc(date)}"`;
  const by = new Map(), applied = [];
  for (const ed of edits) (by.get(ed.p) || by.set(ed.p, []).get(ed.p)).push(ed);
  let n = 0;
  const xml = documentXml.replace(/<w:tbl>|<\/w:tbl>|<w:p(?:\s[^>]*?)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (p) => {
    if (p.startsWith("<w:tbl") || p === "</w:tbl>") return p;
    for (const ed of by.get(n++) || []) {
      const out = editParagraph(p, ed, track, attrs);
      if (out != null) { p = out; applied.push(ed.id); }
    }
    return p;
  });
  return { xml: box.restore(xml), applied, failed: edits.map((e) => e.id).filter((i) => !applied.includes(i)) };
}

export function hasLangMarkers(documentXml) {
  const t = docxParagraphs(documentXml).map((p) => p.text.trim().toUpperCase());
  return t.includes("ENGLISH") && t.includes("INDONESIA");
}

export function bodyBlocks(documentXml) {
  const a = documentXml.indexOf("<w:body>");
  if (a < 0) return [];
  const b = documentXml.lastIndexOf("<w:sectPr"), inner = documentXml.slice(a + 8, b < 0 ? documentXml.lastIndexOf("</w:body>") : b);
  const out = [];
  let depth = 0, from = 0;
  for (const m of inner.matchAll(/<w:tbl>|<\/w:tbl>|<w:p(?:\s[^>]*?)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
    if (m[0] === "<w:tbl>") { if (!depth++) from = m.index; }
    else if (m[0] === "</w:tbl>") { if (!--depth) out.push(inner.slice(from, m.index + m[0].length)); }
    else if (!depth) out.push(m[0]);
  }
  return out;
}

export function insertEnglish(documentXml, translated, { track, author, date }) {
  const box = maskBoxes(documentXml), orig = documentXml;
  documentXml = box.xml;
  const ins = (x) => track && x ? `<w:ins w:id="0" w:author="${xmlEsc(author)}" w:date="${xmlEsc(date)}">${x}</w:ins>` : x;
  const marker = (t) => `<w:p>${ins(`<w:r><w:t>${t}</w:t></w:r>`)}</w:p>`;
  let n = 0;
  const copy = (blk) => blk.replace(PARA, (p) => {
    // komentar tetap hanya di asli
    p = p.replace(/<w:sectPr(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:sectPr>)/g, "").replace(/<w:comment(?:RangeStart|RangeEnd)\b[^>]*\/>/g, "").replace(/<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*?<w:commentReference\b[^>]*\/>[\s\S]*?<\/w:r>/g, "");
    const i = n++, m = p.match(/^(<w:p(?:\s[^>]*?)?)\/?>([\s\S]*?)(?:<\/w:p>)?$/), o = m[1] + ">";
    const toks = tokens(p.endsWith("/>") ? "" : m[2]);
    if (translated.has(i)) {
      const pPr = toks.filter((t) => /^<w:pPr[\s>/]/.test(t.xml)).map((t) => t.xml).join("");
      const r = toks.find((t) => t.run)?.run || { attrs: "", rPr: "" };
      return `${o}${pPr}${ins(runXmlOf(r, textAtoms(translated.get(i))))}</w:p>`;
    }
    return `${o}${toks.map((t) => t.run ? ins(t.xml) : t.xml).join("")}</w:p>`;
  });
  let id = nextId(orig), dp = Math.max(0, ...[...orig.matchAll(/<wp:docPr\b[^>]*?\sid="(\d+)"/g)].map((m) => +m[1]));
  // salinan tidak boleh membawa id yang sudah dipakai asli: paraId/textId dan bookmark dibuang, docPr dan id revisi dinomori ulang
  const blocks = box.restore(marker("ENGLISH") + bodyBlocks(documentXml).map(copy).join("") + marker("INDONESIA"))
    .replace(/\sw14:(?:paraId|textId)="[^"]*"/g, "").replace(/<w:bookmark(?:Start|End)\b[^>]*\/>/g, "")
    .replace(/(<wp:docPr\b[^>]*?\sid=")\d+"/g, (_, a) => `${a}${++dp}"`)
    .replace(/(<w:(?:ins|del|moveFrom|moveTo|[pr]PrChange|sectPrChange|tblPrChange|trPrChange|tcPrChange|numberingChange)\s[^>]*?w:id=")\d+"/g, (_, a) => `${a}${id++}"`);
  return orig.replace("<w:body>", () => `<w:body>${blocks}`);
}

/* ---------- Excel ---------- */
const attr = (a, n) => (a.match(new RegExp(`(?:^|\\s)${n}="([^"]*)"`)) || [])[1];
const tText = (x) => [...x.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t(?:\s[^>/]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlUnesc(m[1])).join("");
const CELL = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const inlineCell = (a, text) => `<c${/\st="[^"]*"/.test(a) ? a.replace(/\st="[^"]*"/, ' t="inlineStr"') : `${a} t="inlineStr"`}><is><t xml:space="preserve">${xmlEsc(String(text).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]/g, ""))}</t></is></c>`;

function sharedStrings(files) {
  return [...(files["xl/sharedStrings.xml"] || "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => tText(m[1]));
}
function sheetList(files) {
  const rels = new Map([...(files["xl/_rels/workbook.xml.rels"] || "").matchAll(/<Relationship\b([^>]*?)\/?>/g)].map((m) => [attr(m[1], "Id"), attr(m[1], "Target")]));
  return [...(files["xl/workbook.xml"] || "").matchAll(/<sheet\b([^>]*?)\/?>/g)].map((m) => {
    const t = rels.get(attr(m[1], "r:id")) || "";
    return { name: xmlUnesc(attr(m[1], "name") || ""), path: t.startsWith("/") ? t.slice(1) : "xl/" + t };
  });
}
// teks sel (shared/inline) atau null untuk angka, rumus, kosong
function cellText(a, body, sst) {
  const t = attr(a, "t");
  if (body == null || /<f[\s>/]/.test(body)) return null;
  if (t === "s") { const v = /<v>(\d+)<\/v>/.exec(body); return v ? sst[+v[1]] ?? null : null; }
  if (t === "inlineStr") { const is = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body); return is ? tText(is[1]) : null; }
  return null;
}

export function xlsxCells(files) {
  const sst = sharedStrings(files), out = [];
  for (const { name, path } of sheetList(files)) {
    for (const m of (files[path] || "").matchAll(CELL)) {
      const text = cellText(m[1], m[2], sst), ref = attr(m[1], "r");
      if (text != null && ref) out.push({ sheet: name, path, ref, text });
    }
  }
  return out;
}

// shortcut: sel ditulis ulang sebagai teks polos, jadi format rich text sel yang diubah hilang; upgrade bila perlu menjaga run
export function applyXlsx(files, edits) {
  const sst = sharedStrings(files), out = { ...files }, applied = [];
  for (const ed of edits) {
    if (typeof out[ed.path] !== "string") continue;
    let done = false;
    out[ed.path] = out[ed.path].replace(CELL, (all, a, body) => {
      const cur = attr(a, "r") === ed.ref && !done && ed.from ? cellText(a, body, sst) : null;
      if (cur == null || !cur.includes(ed.from)) return all;
      done = true;
      return inlineCell(a, cur.replace(ed.from, () => ed.to));
    });
    if (done) applied.push(ed.id);
  }
  return { files: out, applied, failed: edits.map((e) => e.id).filter((i) => !applied.includes(i)) };
}

function registerSheet(files, name, path, xml) {
  const names = sheetList(files).map((s) => s.name.toLowerCase());
  const base = (String(name).replace(/[\x00-\x1f]/g, "").replace(/[\[\]:*?\/\\]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "").trim() || "Sheet").slice(0, 31).replace(/'+$/, "").trim() || "Sheet";
  let nm = base;
  for (let i = 2; names.includes(nm.toLowerCase()); i++) nm = base.slice(0, 31 - ` ${i}`.length).trim() + ` ${i}`;
  const wb = files["xl/workbook.xml"], rels = files["xl/_rels/workbook.xml.rels"];
  const sid = Math.max(0, ...[...wb.matchAll(/\ssheetId="(\d+)"/g)].map((m) => +m[1])) + 1;
  const rid = "rId" + (Math.max(0, ...[...rels.matchAll(/\sId="rId(\d+)"/g)].map((m) => +m[1])) + 1);
  return {
    ...files,
    [path]: xml,
    "xl/workbook.xml": wb.replace("</sheets>", () => `<sheet name="${xmlEsc(nm)}" sheetId="${sid}" r:id="${rid}"/></sheets>`),
    "xl/_rels/workbook.xml.rels": rels.replace("</Relationships>", () => `<Relationship Id="${rid}" Type="${REL}worksheet" Target="${path.slice(3)}"/></Relationships>`),
    "[Content_Types].xml": files["[Content_Types].xml"].replace("</Types>", () => `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
  };
}
const newSheetPath = (files) => `xl/worksheets/sheet${Math.max(0, ...Object.keys(files).map((k) => +(/^xl\/worksheets\/sheet(\d+)\.xml$/.exec(k) || [])[1] || 0)) + 1}.xml`;
const colName = (i) => { let s = ""; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };

export function addSheet(files, name, rows) {
  const data = rows.map((r, y) => `<row r="${y + 1}">${r.map((v, x) => v === "" || v == null ? "" : inlineCell(` r="${colName(x)}${y + 1}"`, v)).join("")}</row>`).join("");
  return registerSheet(files, name, newSheetPath(files), `${HDR}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data}</sheetData></worksheet>`);
}

export function copySheetTranslated(files, path, name, translated) {
  const sst = sharedStrings(files);
  const xml = files[path]
    .replace(/<(?:drawing|legacyDrawing|legacyDrawingHF|picture)\b[^>]*\/>/g, "")
    .replace(/<tableParts\b[\s\S]*?<\/tableParts>|<tableParts\b[^>]*\/>/g, "")
    .replace(/<hyperlink\b[^>]*\sr:id="[^"]*"[^>]*\/>/g, "").replace(/<hyperlinks>\s*<\/hyperlinks>/g, "")
    .replace(/\stabSelected="1"/g, "")
    .replace(/<mc:AlternateContent\b[\s\S]*?<\/mc:AlternateContent>/g, "")
    .replace(/<(oleObjects|controls|extLst)\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/\1>)/g, "").replace(/(<pageSetup\b[^>]*?)\sr:id="[^"]*"/g, "$1").replace(/\sxr:uid="[^"]*"/g, "")
    .replace(CELL, (all, a, body) => {
      const ref = attr(a, "r");
      return translated.has(ref) && cellText(a, body, sst) != null ? inlineCell(a, translated.get(ref)) : all;
    });
  return registerSheet(files, name, newSheetPath(files), xml);
}
