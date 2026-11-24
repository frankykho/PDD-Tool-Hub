// Baca/buat .docx tanpa DOM (regex saja) supaya bisa diuji di Node. ZIP dikerjakan JSZip yang dikirim pemanggil.
export const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const xmlUnesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");

// Teks satu <w:p>: gabungan semua <w:t>, <w:tab/> jadi \t, <w:br/> jadi \n.
export function paragraphText(pXml) {
  let out = "";
  for (const m of pXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\s*\/?>/g)) out += m[0].startsWith("<w:tab") ? "\t" : m[0].startsWith("<w:br") ? "\n" : xmlUnesc(m[1]);
  return out;
}

export function docxParagraphs(documentXml) {
  const out = [];
  let depth = 0;
  for (const m of documentXml.matchAll(/<w:tbl>|<\/w:tbl>|<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/g)) {
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
      const name = `image${++n}.${b.img.ext}`;
      media(b.img, name);
      rels.push(`<Relationship Id="rIdImg${n}" Type="${REL}image" Target="media/${name}"/>`);
      return `<w:p>${drawing("rIdImg" + n, n + 1, b.img.w, b.img.h, name)}</w:p>`;
    }
    const st = STYLE[b.t];
    return `<w:p>${st ? `<w:pPr><w:pStyle w:val="${st}"/></w:pPr>` : ""}${(b.runs || []).map(runXml).join("")}</w:p>`;
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
