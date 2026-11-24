// Tab Copywriter. Jangan sentuh DOM di level atas modul (diimpor juga oleh tes Node).
import * as O from "./office.js";
const load = (src) => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Gagal memuat " + src)); document.head.appendChild(s); });
const once = (src, get) => { let p; return () => (p = p || load(src).then(get)); };
const PDF = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
export const libs = {
  jszip: once("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", () => window.JSZip),
  pdf: once(PDF, () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF.replace("pdf.min.js", "pdf.worker.min.js"); return window.pdfjsLib; }),
};
const $ = (id) => document.getElementById(id), toast = (m) => { const t = $("toast"); t.textContent = m; t.hidden = false; setTimeout(() => { t.hidden = true; }, 2600); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const extOf = (name) => ((String(name).match(/\.(docx|xlsx|pdf)$/i) || [])[1] || "").toLowerCase();
// Baris pertama naskah = judul kerja IGS bila pendek.
export const igsTitle = (text) => { const l = String(text).split("\n").map((x) => x.trim()).find(Boolean) || ""; return l.length <= 120 ? l : ""; };
// Pesan galat input bersama (kosong = boleh lanjut).
// Pisahkan judul kerja (baris pertama pendek) dari isi naskah.
export function splitTitle(text) {
  const t = igsTitle(text), lines = String(text).split("\n"), i = lines.findIndex((l) => l.trim());
  return t ? { title: t, body: lines.slice(i + 1).join("\n").trim() } : { title: "", body: String(text).trim() };
}
export function inputError(goal, fileName, text) {
  const type = extOf(fileName);
  if (fileName && !type) return "Pilih file .docx, .xlsx, atau .pdf.";
  if (fileName && type !== "docx" && goal !== "review") return "File Excel/PDF hanya untuk Cek wording.";
  if (!fileName && !String(text).trim()) return "Unggah file atau tempel teks dulu.";
  if (!fileName && goal === "review") return "Cek wording perlu file Word, Excel, atau PDF.";
  return "";
}
const BUSY = { article: "Menulis…", review: "Mengecek…", pr: "Menulis…", brief: "Menulis…" };
const FAIL = { article: "Gagal membuat artikel.", review: "Gagal memeriksa.", pr: "Gagal membuat press release.", brief: "Gagal membuat brief." };
export function init(cs) {
  const flows = { article: initArticle(cs), review: initReview(cs), brief: initBrief(cs), pr: initPr(cs) }, btn = $("cwGo"), goals = document.querySelectorAll("[data-goal]");
  let goal = "", file = null;
  const pick = (g) => {
    if (btn.disabled || g === goal) return; goal = g;
    goals.forEach((b) => b.classList.toggle("pri", b.dataset.goal === g));
    document.querySelectorAll("[data-opts]").forEach((o) => { o.hidden = o.dataset.opts !== g; });
    Object.values(flows).forEach((f) => f.hide());
    try { localStorage.setItem("cs_cw", g); } catch (e) {}
  };
  goals.forEach((b) => { b.onclick = () => pick(b.dataset.goal); });
  $("cwFile").onchange = (e) => {
    file = e.target.files[0] || null; e.target.value = ""; $("cwName").textContent = file ? file.name : "";
    if (file) { $("cwPaste").value = ""; $("cwPaste").hidden = true; }
  };
  $("cwPasteLink").onclick = (e) => { e.preventDefault(); file = null; $("cwName").textContent = ""; $("cwPaste").hidden = false; $("cwPaste").focus(); };
  btn.onclick = async () => {
    const err = inputError(goal, file ? file.name : "", $("cwPaste").value); if (err) return toast(err);
    if (file && file.size > 10 * 1024 * 1024) return toast("File terlalu besar. Maksimal 10 MB.");
    const label = btn.textContent, f = file; btn.disabled = true; btn.textContent = BUSY[goal];
    try {
      let text = $("cwPaste").value.trim();
      if (f && goal !== "review") {
        try { text = O.docxParagraphs((await O.unzip(await libs.jszip(), f))["word/document.xml"]).map((p) => p.text).join("\n").trim(); } catch (e) { return toast("File .docx tidak bisa dibaca."); }
        if (!text) return toast("Unggah file atau tempel teks dulu.");
      }
      await flows[goal].go({ text, file: f });
    } catch (e) { toast(e.message || FAIL[goal]); } finally { btn.disabled = false; btn.textContent = label; }
  };
  let g = "article"; try { const k = localStorage.getItem("cs_cw"); if (k && flows[k]) g = k; } catch (e) {}
  pick(g);
}

/* ---- Artikel berita (IGS -> website KISI) ---- */
export const OPENER = "Behind The Candle – ";
export const BYLINE = "Dimuat oleh Tim Investment Growth Specialist KISI.";
export const DISC_ARTICLE = "Disclaimer: Semua investasi memiliki risiko. Lakukan analisis mandiri dan pahami potensi kerugian sebelum mengambil keputusan.";
export const FIXED_TAGS = ["iKISI", "KISI", "Behind The Candle"];
export const PRIZE_DISC = "Hadiah adalah bentuk apresiasi aktivitas transaksi, bukan jaminan keuntungan investasi. Pastikan Anda memahami risiko sebelum bertransaksi.";

export const numbers = (text) => (String(text).match(/\d+(?:[.,]\d+)*(?:\s*%)?/g) || []).map((x) => x.replace(/\s+/g, ""));
const tally = (a) => a.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
const lacking = (a, b) => { const have = tally(numbers(b)), miss = []; for (const [n, c] of tally(numbers(a))) if ((have.get(n) || 0) < c) miss.push(n); return miss; };
// angka sama (multiset) walau pemisah ribuan/desimal dan spasi % berbeda
const core = (t) => numbers(t).map((x) => x.replace(/[.,%]/g, "")).sort().join("|");
export const sameNumbers = (a, b) => core(a) === core(b);
export const transFindings = (units, trans) => units.filter((u) => trans.has(u.id) && !sameNumbers(u.text, trans.get(u.id))).map((u) => ({ kind: "konsistensi", loc: u.id, from: numbers(u.text).join(", "), to: "", why: "Angka terjemahan berbeda dari asli: " + numbers(trans.get(u.id)).join(", ") }));
export const missingNumbers = (src, out) => lacking(src, out);
export const extraNumbers = (src, out) => lacking(out, src);
export function applyEdits(text, edits) {
  const skipped = [];
  for (const e of edits) { const i = text.indexOf(e.from); if (i < 0) skipped.push(e); else text = text.slice(0, i) + e.to + text.slice(i + e.from.length); }
  return { text, skipped };
}
export function buildArticle({ body, title, closing, close, tags }) {
  let b = String(body || "").replace(BYLINE, "").replace(DISC_ARTICLE, "").trim();
  if (!b.startsWith(OPENER) && !b.startsWith(OPENER.replace("–", "-"))) b = OPENER + b;
  const parts = [b, close !== "none" && closing && closing.trim(), close === "promo" && PRIZE_DISC, BYLINE, DISC_ARTICLE].filter(Boolean);
  const seen = new Set();
  return { title, text: parts.join("\n\n"), tags: [...(tags || []), ...FIXED_TAGS].filter((t) => { const k = t.toLowerCase(); return !seen.has(k) && seen.add(k); }) };
}

/* ---- Cek tanpa AI: format angka, total tabel, konsistensi EN-ID ---- */
const dots = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const parseIdr = (s) => { const t = String(s).replace(/^\s*Rp\.?\s*/i, "").trim(); return /^\d{1,3}([.,]\d{3})+$|^\d+$/.test(t) ? +t.replace(/[.,]/g, "") : null; };
// Panggil per bahasa: kirim unit satu bahasa saja per panggilan (jangan campur EN dan ID).
export function numberFormatFindings(units) {
  const hits = [];
  for (const u of units) for (const m of String(u.text).matchAll(/(?<![\d.,])(\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+)(?![.,]?\d)/g)) hits.push({ loc: u.loc, from: m[1], dot: m[1].includes(".") });
  const nd = hits.filter((h) => h.dot).length, useDot = nd >= hits.length - nd;
  return hits.filter((h) => h.dot !== useDot).map((h) => ({ kind: "angka", loc: h.loc, from: h.from, to: h.from.replace(/[.,]/g, useDot ? "." : ","), why: "Format angka tidak seragam (mayoritas pakai " + (useDot ? "titik" : "koma") + ")" }));
}
export function totalFindings(rows) {
  const out = []; let grand = 0, sub = 0;
  const check = (r, sum) => { if (sum !== r.value) out.push({ kind: "hitungan", loc: r.loc, from: dots(r.value), to: "", why: "Jumlah baris = " + dots(sum) }); };
  for (const r of rows) {
    const label = String(r.label).trim(), isSub = /^sub\s*-?\s*total$/i.test(label), isTot = /^(grand\s*)?total$/i.test(label);
    if (!Number.isFinite(r.value)) continue;
    if (isSub) { check(r, sub); sub = 0; } else if (isTot) { check(r, grand); grand = sub = 0; } else { grand += r.value; sub += r.value; }
  }
  return out;
}
// Aturan "belum ada X" (izin OJK, S&K, pengingat risiko, disclaimer kinerja) dicek sekali untuk seluruh dokumen,
// karena disclaimer cukup ditulis sekali; aturan kata/kalimat terlarang tetap per paragraf.
const DOC_RULES = new Set(["izin", "snk", "risiko", "kinerja", "panjang", "hashtag"]);
export function docCompliance(units, check) {
  const out = [];
  for (const u of units) for (const i of check(u.text)) if (!DOC_RULES.has(i.id)) out.push({ kind: "compliance", loc: u.id, from: i.match || "", to: "", why: i.msg });
  for (const i of check(units.map((u) => u.text).join("\n"))) if (DOC_RULES.has(i.id)) out.push({ kind: "compliance", loc: "dokumen", from: i.match || "", to: "", why: i.msg });
  return out;
}
export function langFindings(enUnits, idUnits) {
  const key = (t) => numbers(t).map((x) => x.replace(/[.,]/g, "")).sort().join("|");
  return idUnits.flatMap((u, i) => enUnits[i] && key(enUnits[i].text) !== key(u.text) ? [{ kind: "konsistensi", loc: u.loc, from: numbers(u.text).join(", "), to: "", why: "Angka berbeda dari versi Inggris: " + numbers(enUnits[i].text).join(", ") }] : []);
}

/* ---- Cek wording file: potongan, baris tabel ---- */
export function chunks(units, maxChars = 9000, maxUnits = 120) {
  const out = []; let cur = [], n = 0;
  for (const u of units) {
    if (cur.length && (n + u.text.length > maxChars || cur.length >= maxUnits)) { out.push(cur); cur = []; n = 0; }
    cur.push(u); n += u.text.length;
  }
  return cur.length ? [...out, cur] : out;
}
export const estimateCalls = (units, translate) => chunks(units).length * (translate ? 2 : 1);
// Baris tabel docx -> [{loc, label, value}] (label = sel pertama, value = angka pertama sesudahnya)
export function docxRows(xml) {
  const rows = []; let row = null, i = 0;
  for (const m of O.maskBoxes(xml).xml.matchAll(/<w:tr(?:\s[^>]*)?>|<\/w:tr>|<w:tc(?:\s[^>]*)?>|<w:p(?:\s[^>]*?)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
    const t = m[0];
    if (t.startsWith("<w:tr")) row = { loc: "", cells: [] };
    else if (t === "</w:tr>") { if (row && row.cells.length) { const v = row.cells.slice(1).map((c) => parseIdr(c)).find((x) => x != null); if (v != null) rows.push({ loc: row.loc, label: row.cells[0], value: v }); } row = null; }
    else if (t.startsWith("<w:tc")) row && row.cells.push("");
    else { const p = i++; if (row && row.cells.length) { if (!row.loc) row.loc = "p" + p; const c = row.cells.length - 1; row.cells[c] = (row.cells[c] + " " + O.paragraphText(t)).trim(); } }
  }
  return rows;
}
// Baris sheet xlsx -> [{loc: path!ref, label, value}]
export function xlsxRows(files) {
  const text = new Map(O.xlsxCells(files).map((c) => [c.path + "!" + c.ref, c.text])), rows = [];
  for (const path of Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))) {
    for (const r of String(files[path]).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      let label = null;
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const loc = path + "!" + (/\sr="([^"]*)"/.exec(c[1]) || [])[1], tx = text.get(loc), v = /<v>([^<]*)<\/v>/.exec(c[2] || "");
        if (label == null) { if (tx != null) label = tx; continue; }
        const val = tx != null ? parseIdr(tx) : v && !/\st="(?!n")/.test(c[1]) && v[1] !== "" ? Number(v[1]) : null;
        if (val != null && Number.isFinite(val)) { rows.push({ loc, label, value: val }); break; }
      }
    }
  }
  return rows;
}

/* ---- Cek wording file (docx / xlsx / pdf) ---- */
const INFO = ["hitungan", "konsistensi", "compliance"];
function initReview(cs) {
  const stamp = () => ({ author: "Copy Studio", date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") });
  let S = null, F = [], trans = new Map(), partial = false, quota = null;
  const wantEn = () => $("rvEn").checked && (S.type === "xlsx" || (S.type === "docx" && !S.bi));
  const status = () => {
    if (!S) { $("rvInfo").textContent = ""; return; }
    const n = estimateCalls(S.units, wantEn()), l = quota ? quota.limit - quota.used : null;
    $("rvInfo").innerHTML = esc(S.units.length) + " bagian teks. Perkiraan " + esc(n) + " permintaan AI" + (l != null ? ", sisa kuota hari ini " + esc(l) : "") + "." + (l != null && n > l ? ' <b style="color:#c0392b">Kuota mungkin tidak cukup; hasil bisa sebagian.</b>' : "");
  };
  const readPdf = async (f) => {
    const doc = await (await libs.pdf()).getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise, units = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const lines = new Map();
      for (const it of (await (await doc.getPage(p)).getTextContent()).items) if (it.str && it.str.trim()) { const y = Math.round(it.transform[5]); lines.set(y, (lines.get(y) || "") + (lines.has(y) ? " " : "") + it.str); }
      [...lines.entries()].sort((a, b) => b[0] - a[0]).forEach(([, t], n) => units.push({ id: "h" + p + "-" + (n + 1), text: t }));
    }
    return { units };
  };
  const read = async (f, type) => {
    if (type === "pdf") return { ...(await readPdf(f)), type };
    const files = await O.unzip(await libs.jszip(), f);
    if (type === "docx") {
      const xml = files["word/document.xml"], paras = O.docxParagraphs(xml), units = paras.filter((p) => p.text.trim()).map((p) => ({ id: "p" + p.i, text: p.text }));
      const at = (w) => paras.findIndex((p) => p.text.trim().toUpperCase() === w), e = at("ENGLISH"), d = at("INDONESIA"), bi = O.hasLangMarkers(xml) && e < d, num = (u) => +u.id.slice(1);
      return { type, files, xml, units, bi, en: bi ? units.filter((u) => num(u) > e && num(u) < d) : [], id: bi ? units.filter((u) => num(u) > d) : [], rows: docxRows(xml) };
    }
    const cells = O.xlsxCells(files).filter((c) => c.text.trim());
    return { type, files, units: cells.map((c) => ({ id: c.path + "!" + c.ref, text: c.text, sheet: c.sheet, path: c.path, ref: c.ref })), rows: xlsxRows(files) };
  };
  const base = () => {
    const L = (us) => us.map((u) => ({ loc: u.id, text: u.text })), out = [];
    if (S.bi) out.push(...numberFormatFindings(L(S.en)), ...numberFormatFindings(L(S.id)), ...langFindings(L(S.en), L(S.id)));
    else out.push(...numberFormatFindings(L(S.units)));
    if (S.rows) out.push(...totalFindings(S.rows));
    if (window.Compliance) out.push(...docCompliance(S.units, (t) => window.Compliance.check(t, { glossary: (cs.style || {}).glossary, allow: cs.allow || [] }).issues));
    return out;
  };
  const mk = (a, ai) => a.map((f, n) => ({ ...f, key: (ai ? "a" : "b") + n, info: !f.to && INFO.includes(f.kind), on: !!f.to && sameNumbers(f.from, f.to), numChg: !!f.to && !sameNumbers(f.from, f.to) }));
  const edits = () => F.filter((f) => f.on && !f.info && f.from).map((f) => {
    if (S.type === "docx") return { id: f.key, p: +f.loc.slice(1), from: f.from, to: f.to };
    const k = f.loc.lastIndexOf("!"); return { id: f.key, path: f.loc.slice(0, k), ref: f.loc.slice(k + 1), from: f.from, to: f.to };
  });
  const build = (track) => {
    const ed = edits(), o = { track, ...stamp() };
    if (S.type === "docx") {
      const r = O.applyDocx(S.xml, ed, o); let xml = r.xml;
      if (trans.size && !S.bi) xml = O.insertEnglish(xml, new Map([...trans].map(([id, en]) => [+id.slice(1), en])), o);
      return { files: { ...S.files, "word/document.xml": xml }, failed: new Set(r.failed) };
    }
    const r = O.applyXlsx(S.files, ed); let files = r.files;
    const bySheet = new Map();
    for (const u of S.units) if (trans.has(u.id)) (bySheet.get(u.path) || bySheet.set(u.path, { name: u.sheet, m: new Map() }).get(u.path)).m.set(u.ref, trans.get(u.id));
    for (const [path, s] of bySheet) files = O.copySheetTranslated(files, path, s.name.slice(0, 28).trim() + " EN", s.m);
    const st = (f) => (f.info ? "Info" : !f.on ? "Ditolak" : r.failed.includes(f.key) ? "Tidak bisa diterapkan otomatis" : "Diterima");
    files = O.addSheet(files, "Catatan Review", [["Lokasi", "Kategori", "Asli", "Saran", "Alasan", "Status"], ...F.map((f) => [f.loc, f.kind, f.from, f.to, f.why, st(f)])]);
    return { files, failed: new Set(r.failed) };
  };
  const render = () => {
    const can = S.type !== "pdf", failed = can ? build(true).failed : new Set();
    $("rvList").innerHTML = (partial ? '<div class="note small"><b>' + (partial === "kuota" ? "Hasil sebagian: kuota AI hari ini habis" : "Hasil sebagian: pemeriksaan terhenti karena kesalahan") + "</b></div>" : "") + (F.map((f, n) =>
      '<label class="small" style="display:block">' + (can && !f.info ? '<input type="checkbox" data-n="' + n + '"' + (f.on ? " checked" : "") + "> " : "") + "<b>" + esc(f.kind) + '</b>' + (f.numChg ? ' <b style="color:#c0392b">angka berubah</b>' : "") + ' <span class="muted" translate="no">' + esc(f.loc) + '</span> <span translate="no">' + esc(f.from) + (f.to ? " &rarr; " + esc(f.to) : "") + "</span>" +
      (f.why ? ' <span class="muted" translate="no">(' + esc(f.why) + ")</span>" : "") + (failed.has(f.key) ? ' <b style="color:#c0392b">tidak bisa diterapkan otomatis</b>' : "") + "</label>").join("") || '<span class="muted small">Tidak ada temuan.</span>');
    $("rvTrack").hidden = $("rvClean").hidden = S.type !== "docx"; $("rvXlsx").hidden = S.type !== "xlsx";
    $("rvOut").hidden = false;
  };
  $("rvList").onchange = (e) => { const n = e.target.dataset.n; if (n != null) { F[+n].on = e.target.checked; render(); } };
  const refreshQuota = () => fetch("/api/quota").then((r) => r.json()).then((q) => { quota = q; status(); }).catch(() => status());
  $("rvEn").onchange = status;
  const ask = async (kind, units, lang) => {
    const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, units: units.map(({ id, text }) => ({ id, text })), lang }) });
    if (r.status === 429) throw Object.assign(new Error("kuota"), { quota: true });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
    return j.result;
  };
  const go = async (f) => {
    const type = extOf(f.name); let s;
    try { s = { ...(await read(f, type)), name: f.name.replace(/\.[^.]+$/, "") }; } catch (err) { throw new Error("File tidak bisa dibaca."); }
    if (!s.units.length) throw new Error("Unggah file atau tempel teks dulu.");
    S = s; F = mk(base(), false); trans = new Map(); partial = false; $("rvOut").hidden = true; $("rvBox").hidden = false; status(); await refreshQuota();
    if (quota && estimateCalls(s.units, wantEn()) > quota.limit - quota.used && !confirm("Perkiraan permintaan AI melebihi sisa kuota hari ini; hasil bisa sebagian. Lanjutkan?")) { S = null; $("rvBox").hidden = true; return; }
    const lang = s.bi ? "mix" : "id", ids = new Set(s.units.map((u) => u.id)), found = [], cs1 = chunks(s.units); let n = 0;
    try {
      for (const c of cs1) { $("rvInfo").textContent = "Memeriksa " + ++n + "/" + cs1.length + "…"; found.push(...(await ask("cw_review", c, lang)).findings.filter((x) => ids.has(x.id)).map((x) => ({ kind: x.kind, loc: x.id, from: x.from, to: x.to, why: x.why }))); }
      if (wantEn()) { n = 0; for (const c of cs1) { $("rvInfo").textContent = "Menerjemahkan " + ++n + "/" + cs1.length + "…"; for (const it of (await ask("cw_translate", c)).items) if (ids.has(it.id)) trans.set(it.id, it.en); } }
    } catch (err) { if (err.quota) partial = "kuota"; else { if (found.length || trans.size) partial = "galat"; toast(err.message || "Gagal memeriksa."); } }
    found.push(...transFindings(s.units, trans));
    F = [...mk(base(), false), ...mk(found, true)];
    refreshQuota(); render();
  };
  const save = async (track, suffix, ext) => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(await O.zipFiles(await libs.jszip(), build(track).files)); a.download = S.name + suffix + "." + ext; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  $("rvTrack").onclick = () => save(true, " - review", "docx");
  $("rvClean").onclick = () => save(false, " - review (bersih)", "docx");
  $("rvXlsx").onclick = () => save(false, " - review", "xlsx");
  return { go: ({ file }) => go(file), hide: () => { S = null; $("rvBox").hidden = $("rvOut").hidden = true; } };
}

function initArticle(cs) {
  let ai = null, src = "", igs = "", last = "";
  const sync = () => { $("caPromoBox").hidden = $("caPromoUrl").hidden = $("caClose").value !== "promo"; };
  $("caClose").onchange = () => { sync(); if (ai) toast("Pilihan penutup berubah. Klik Buat lagi."); };
  sync();
  const chosen = () => { const r = document.querySelector('input[name="caT"]:checked'); return r ? ai.titles[+r.value] : igs; };
  const render = () => {
    const acc = [...document.querySelectorAll("#caEdits input:checked")].map((c) => ai.edits[+c.dataset.n]);
    const art = buildArticle({ body: applyEdits(src, acc).text, title: chosen(), closing: ai.closing, close: $("caClose").value, tags: ai.tags });
    $("caFinal").value = last = art.text; $("caTags").textContent = art.tags.join(", ");
    check();
  };
  const check = () => {
    const t = $("caFinal").value, miss = missingNumbers(src, t), extra = extraNumbers(igs + " " + src + " " + $("caPName").value + " " + $("caPUrl").value, t + " " + chosen()), iss = window.Compliance ? window.Compliance.check(t, { glossary: (cs.style || {}).glossary, allow: cs.allow || [] }).issues : [];
    $("caWarn").innerHTML = (miss.length ? '<div class="note small" style="color:#c0392b"><b>Angka dari naskah asli hilang atau berubah:</b> <span translate="no">' + esc(miss.join(", ")) + "</span></div>" : "") +
      (extra.length ? '<div class="note small" style="color:#c0392b"><b>Angka tidak ada di naskah IGS:</b> <span translate="no">' + esc(extra.join(", ")) + "</span></div>" : "") +
      iss.map((i) => '<div class="note small"><span translate="no">' + esc(i.msg) + "</span></div>").join("");
  };
  $("caFinal").oninput = check;
  const go = async ({ text }) => {
    ({ title: igs, body: src } = splitTitle(text)); if (!src) throw new Error("Unggah file atau tempel teks dulu.");
    const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "cw_article", text: src, title: igs, close: $("caClose").value, promo: { name: $("caPName").value, url: $("caPUrl").value } }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
    ai = j.result;
    $("caTitles").innerHTML = ai.titles.map((t, n) => '<label><input type="radio" name="caT" value="' + n + '"' + (n ? "" : " checked") + "> " + esc(t) + "</label>").join("");
    $("caEdits").innerHTML = ai.edits.map((e, n) => '<label><input type="checkbox" data-n="' + n + '" checked> ' + esc(e.from) + " &rarr; " + esc(e.to) + (e.why ? ' <span class="muted small">(' + esc(e.why) + ")</span>" : "") + "</label>").join("") || '<span class="muted small" translate="yes">Tidak ada perbaikan.</span>';
    $("caOut").hidden = false; render();
  };
  $("caTitles").onchange = check;
  $("caEdits").onchange = (e) => { if ($("caFinal").value !== last && !confirm("Teks akhir sudah Anda ubah. Terapkan ulang perbaikan dan hapus suntingan Anda?")) { e.target.checked = !e.target.checked; return; } render(); };
  $("caCopy").onclick = () => { navigator.clipboard.writeText(chosen() + "\n\n" + $("caFinal").value).then(() => toast("Tersalin"), () => toast("Gagal menyalin")); };
  $("caDocx").onclick = async () => {
    const blocks = [{ t: "h1", runs: [{ text: chosen() }] }, ...$("caFinal").value.split("\n").filter(Boolean).map((l) => ({ t: "p", runs: [{ text: l }] })), { t: "p", runs: [{ text: "Tag: " + $("caTags").textContent }] }];
    const a = document.createElement("a"); a.href = URL.createObjectURL(await O.zipFiles(await libs.jszip(), O.makeDocx(blocks, {}))); a.download = "artikel.docx"; a.click();
  };
  return { go, hide: () => { ai = null; $("caOut").hidden = true; } };
}

/* ---- Brief KISI Challenge ---- */
const FMT = { single: "Single Post", carousel: "Carousel", reels: "Reels", story: "Story" };
export function snsDisclaimer(partner, assetUrl, format) {
  return [format === "single" ? "Tambahin tulisan kecil:" : "Tambahin tulisan kecil di setiap slide:", "Disclaimer:",
    "● " + PRIZE_DISC,
    ...(partner ? ["● " + partner + " tidak terafiliasi sebagai pegawai PT KISI dan tidak memiliki izin dari Otoritas Jasa Keuangan (OJK)."] : []),
    "● PT Korea Investment And Sekuritas Indonesia Berizin dan Diawasi oleh Otoritas Jasa Keuangan.",
    "● Semua investasi memiliki risiko. Lakukan analisis mandiri dan pahami potensi kerugian sebelum mengambil keputusan",
    ...(assetUrl ? ["Link aset: " + assetUrl] : [])].join("\n");
}
export function briefText(res, { format, platform, date }) {
  const assetUrl = res.asset_url;
  return res.sns.map((s) => [(s.partner ? s.partner + ": " : "") + platform + " " + (FMT[format] || format), date ? "Posting tanggal " + date : "",
    ...s.frames.map((f) => (f.label ? f.label.replace(/:\s*$/, "") + ":\n" : "") + f.lines.join("\n")),
    snsDisclaimer(s.partner, assetUrl, format)].filter(Boolean).join("\n\n")).join("\n\n----------\n\n");
}

function initBrief() {
  const sync = () => { $("bfSns").hidden = $("bfType").value !== "sns"; };
  $("bfType").onchange = sync; sync();
  const go = async ({ text }) => {
    const sns = $("bfType").value === "sns", partners = $("bfPartners").value.split(",").map((x) => x.trim()).filter(Boolean);
    const fmt = $("bfFmt").value, o = { format: fmt, platform: $("bfPlatSns").value.trim() || "IG", date: $("bfDate").value.trim() };
    const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "cw_brief", text, type: sns ? "sns" : "media", partners, format: fmt, platform: o.platform, date: o.date }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
    if (sns ? !j.result.sns.length : !j.result.media.body.length) throw new Error("AI tidak menghasilkan brief. Coba lagi.");
    $("bfFinal").value = sns ? briefText(j.result, o) : j.result.media.title + "\n\n" + j.result.media.body.join("\n\n");
    $("bfOut").hidden = false;
  };
  $("bfCopy").onclick = () => { navigator.clipboard.writeText($("bfFinal").value).then(() => toast("Tersalin"), () => toast("Gagal menyalin")); };
  $("bfDocx").onclick = async () => {
    const blocks = $("bfFinal").value.split("\n").map((l) => ({ t: "p", runs: [{ text: l }] }));
    const a = document.createElement("a"); a.href = URL.createObjectURL(await O.zipFiles(await libs.jszip(), O.makeDocx(blocks, {}))); a.download = "brief.docx"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  return { go, hide: () => { $("bfOut").hidden = true; } };
}

/* ---- Press release (.docx berkop) ---- */
const ABOUT_H = "Tentang PT Korea Investment And Sekuritas Indonesia (KISI)";
export function prBlocks(res, { about, contact, photo }) {
  const p = (...runs) => ({ t: "p", runs }), split = (s) => String(s || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const q = res.quote || {};
  return [
    p({ text: "PRESS RELEASE", b: true, i: true }), ...(res.title ? [p({ text: res.title, b: true })] : []),
    ...(photo ? [{ t: "img", img: photo }] : []),
    ...res.paras.map((x) => p(...x.runs)),
    ...(q.text ? [p({ text: "“" + q.text + "”", i: true }, ...(q.speaker ? [{ text: " ujar " }, { text: q.speaker, b: true }] : []))] : []),
    ...res.closing.map((x) => p({ text: x })),
    p({ text: ABOUT_H, b: true }), ...split(about).map((x) => p({ text: x })),
    ...(split(contact).length ? [p({ text: "Media Contact:", b: true, i: true }), ...split(contact).map((x) => p({ text: x }))] : []),
  ];
}

// Bytes logo kop + ukuran piksel dari header PNG (IHDR), diskalakan ke ±200 px.
async function logoBytes() {
  try {
    const r = await fetch("/brand/kisi-color.png"); if (!r.ok) return null;
    const data = new Uint8Array(await r.arrayBuffer()), v = new DataView(data.buffer);
    if (data.length < 24 || v.getUint32(0) !== 0x89504e47) return null;
    const w = v.getUint32(16), h = v.getUint32(20); if (!w || !h) return null;
    return { data, w: 200, h: Math.round((200 * h) / w) };
  } catch (e) { return null; }
}
// Foto unggahan -> JPEG maks. 480 px lebar.
async function photoBytes(file) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 480 / bmp.width), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.9));
  return { data: new Uint8Array(await blob.arrayBuffer()), w, h, ext: "jpeg" };
}

function initPr(cs) {
  if (cs.canEdit) { $("cwSettings").hidden = false; $("cwSettings").onclick = (e) => { e.preventDefault(); $("cwBox").hidden = !$("cwBox").hidden; }; }
  let R = null, photo = null;
  const txt = () => ({ about: $("prAbout").value, contact: $("prContact").value });
  fetch("/api/cw").then((r) => r.json()).then((j) => { $("prAbout").value = j.pr.about || ""; $("prContact").value = j.pr.contact || ""; }).catch(() => toast("Teks baku gagal dimuat."));
  $("prSave").onclick = async () => {
    try {
      const r = await fetch("/api/cw", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pr: txt() }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
      toast("Tersimpan");
    } catch (err) { toast(err.message || "Gagal menyimpan."); }
  };
  $("prPhoto").onchange = async (e) => {
    const f = e.target.files[0]; photo = null; $("prPhotoName").textContent = "";
    if (!f) return;
    try { photo = await photoBytes(f); $("prPhotoName").textContent = f.name; } catch (err) { toast("Foto tidak bisa dibaca."); }
  };
  const blocks = () => prBlocks(R, { ...txt(), photo });
  const text = () => blocks().filter((b) => b.runs).map((b) => b.runs.map((r) => r.text).join("")).join("\n\n");
  const go = async ({ text: free }) => {
    const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "cw_pr", hl: { free } }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
    R = j.result; if (!R.paras.length) throw new Error("AI tidak menghasilkan press release. Coba lagi.");
    if (R.quote.text && !R.quote.speaker) { R.quote.speaker = "[nama narasumber], [jabatan] KISI"; R.missing.push("nama & jabatan narasumber"); } // kutipan tetap dipakai, narasumber diisi penanda
    $("prQuoteWarn").hidden = !(R.quote.text && R.quote.ai);
    $("prMissing").innerHTML = R.missing.length ? '<div class="small" style="background:#fef3c7;padding:8px;border-radius:6px"><b>Perlu dilengkapi</b><ul>' + R.missing.map((m) => "<li>" + esc(m) + "</li>").join("") + "</ul></div>" : "";
    $("prPrev").innerHTML = blocks().filter((b) => b.runs).map((b) => "<p>" + b.runs.map((x) => { let h = esc(x.text); if (x.i) h = "<i>" + h + "</i>"; return x.b ? "<b>" + h + "</b>" : h; }).join("") + "</p>").join("");
    $("prOut").hidden = false;
  };
  $("prCopy").onclick = () => { navigator.clipboard.writeText(text()).then(() => toast("Tersalin"), () => toast("Gagal menyalin")); };
  $("prDocx").onclick = async () => {
    try {
      const logo = await logoBytes(); if (!logo) toast("Logo gagal dimuat, file dibuat tanpa kop.");
      const a = document.createElement("a"); a.href = URL.createObjectURL(await O.zipFiles(await libs.jszip(), O.makeDocx(blocks(), logo ? { logo } : {}))); a.download = "press-release.docx"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (err) { toast("Gagal membuat file."); }
  };
  return { go, hide: () => { R = null; $("prOut").hidden = true; } };
}
