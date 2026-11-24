// Tab Copywriter. Jangan sentuh DOM di level atas modul (diimpor juga oleh tes Node).
import * as O from "./office.js";
const load = (src) => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Gagal memuat " + src)); document.head.appendChild(s); });
const once = (src, get) => { let p; return () => (p = p || load(src).then(get)); };
const PDF = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
export const libs = {
  jszip: once("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", () => window.JSZip),
  pdf: once(PDF, () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF.replace("pdf.min.js", "pdf.worker.min.js"); return window.pdfjsLib; }),
};
export function init(cs) {
  initArticle(cs);
  initReview(cs);
  const sel = document.getElementById("cwKind"), panes = document.querySelectorAll("[data-cw]");
  const show = () => { panes.forEach((p) => { p.hidden = p.dataset.cw !== sel.value; }); try { localStorage.setItem("cs_cw", sel.value); } catch (e) {} };
  try { const k = localStorage.getItem("cs_cw"); if (k && [...sel.options].some((o) => o.value === k)) sel.value = k; } catch (e) {}
  sel.addEventListener("change", show);
  show();
}

/* ---- Artikel berita (IGS -> website KISI) ---- */
export const OPENER = "Behind The Candle – ";
export const BYLINE = "Dimuat oleh Tim Investment Growth Specialist KISI.";
export const DISC_ARTICLE = "Disclaimer: Semua investasi memiliki risiko. Lakukan analisis mandiri dan pahami potensi kerugian sebelum mengambil keputusan.";
export const FIXED_TAGS = ["iKISI", "KISI", "Behind The Candle"];
export const PRIZE_DISC = "Hadiah adalah bentuk apresiasi aktivitas transaksi, bukan jaminan keuntungan investasi. Pastikan Anda memahami risiko sebelum bertransaksi.";

export const numbers = (text) => (String(text).match(/\d+(?:[.,]\d+)*%?/g) || []).map((x) => x.replace(/\s+/g, ""));
const tally = (a) => a.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
const lacking = (a, b) => { const have = tally(numbers(b)), miss = []; for (const [n, c] of tally(numbers(a))) if ((have.get(n) || 0) < c) miss.push(n); return miss; };
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
  for (const m of xml.matchAll(/<w:tr(?:\s[^>]*)?>|<\/w:tr>|<w:tc(?:\s[^>]*)?>|<w:p(?:\s[^>]*?)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
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
  const $ = (id) => document.getElementById(id), toast = (m) => { const t = $("toast"); t.textContent = m; t.hidden = false; setTimeout(() => { t.hidden = true; }, 2600); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const stamp = () => ({ author: "Copy Studio", date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") });
  let S = null, F = [], trans = new Map(), partial = false, quota = null;
  const wantEn = () => $("rvEn").checked && !$("rvEnBox").hidden;
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
    for (const u of S.units) for (const i of window.Compliance ? window.Compliance.check(u.text, { glossary: (cs.style || {}).glossary, allow: cs.allow || [] }).issues : []) out.push({ kind: "compliance", loc: u.id, from: i.match || "", to: "", why: i.msg });
    return out;
  };
  const mk = (a, ai) => a.map((f, n) => ({ ...f, key: (ai ? "a" : "b") + n, info: !f.to && INFO.includes(f.kind), on: !!f.to }));
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
    $("rvList").innerHTML = (partial ? '<div class="note small"><b>Hasil sebagian: kuota AI hari ini habis</b></div>' : "") + (F.map((f, n) =>
      '<label class="small" style="display:block">' + (can && !f.info ? '<input type="checkbox" data-n="' + n + '"' + (f.on ? " checked" : "") + "> " : "") + "<b>" + esc(f.kind) + '</b> <span class="muted">' + esc(f.loc) + '</span> <span translate="no">' + esc(f.from) + (f.to ? " &rarr; " + esc(f.to) : "") + "</span>" +
      (f.why ? ' <span class="muted" translate="no">(' + esc(f.why) + ")</span>" : "") + (failed.has(f.key) ? ' <b style="color:#c0392b">tidak bisa diterapkan otomatis</b>' : "") + "</label>").join("") || '<span class="muted small">Tidak ada temuan.</span>');
    $("rvTrack").hidden = $("rvClean").hidden = S.type !== "docx"; $("rvXlsx").hidden = S.type !== "xlsx";
    $("rvOut").hidden = false;
  };
  $("rvList").onchange = (e) => { const n = e.target.dataset.n; if (n != null) { F[+n].on = e.target.checked; render(); } };
  const refreshQuota = () => fetch("/api/quota").then((r) => r.json()).then((q) => { quota = q; status(); }).catch(() => status());
  $("rvFile").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    const type = ((f.name.match(/\.(docx|xlsx|pdf)$/i) || [])[1] || "").toLowerCase();
    if (!type) return toast("Pilih file .docx, .xlsx, atau .pdf.");
    if (f.size > 10 * 1024 * 1024) return toast("File terlalu besar. Maksimal 10 MB.");
    try { S = { ...(await read(f, type)), name: f.name.replace(/\.[^.]+$/, "") }; } catch (err) { S = null; return toast("File tidak bisa dibaca."); }
    F = mk(base(), false); trans = new Map(); partial = false;
    $("rvName").textContent = f.name; $("rvEnBox").hidden = !(type === "xlsx" || (type === "docx" && !S.bi)); $("rvEn").checked = false;
    status(); refreshQuota(); $("rvGo").disabled = false; render();
  };
  $("rvEn").onchange = status;
  const ask = async (kind, units, lang) => {
    const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, units: units.map(({ id, text }) => ({ id, text })), lang }) });
    if (r.status === 429) throw Object.assign(new Error("kuota"), { quota: true });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
    return j.result;
  };
  $("rvGo").onclick = async () => {
    if (!S) return; const s = S, btn = $("rvGo"); btn.disabled = true; $("rvFile").disabled = true; partial = false; trans = new Map();
    const lang = s.bi ? "mix" : "id", ids = new Set(s.units.map((u) => u.id)), found = [], cs1 = chunks(s.units); let n = 0;
    try {
      for (const c of cs1) { $("rvInfo").textContent = "Memeriksa " + ++n + "/" + cs1.length + "…"; found.push(...(await ask("cw_review", c, lang)).findings.filter((x) => ids.has(x.id)).map((x) => ({ kind: x.kind, loc: x.id, from: x.from, to: x.to, why: x.why }))); }
      if (wantEn()) { n = 0; for (const c of cs1) { $("rvInfo").textContent = "Menerjemahkan " + ++n + "/" + cs1.length + "…"; for (const it of (await ask("cw_translate", c)).items) if (ids.has(it.id)) trans.set(it.id, it.en); } }
    } catch (err) { if (err.quota) partial = true; else toast(err.message || "Gagal memeriksa."); }
    $("rvFile").disabled = false; btn.disabled = false;
    if (S !== s) return; // file diganti selama proses: abaikan hasil lama
    F = [...mk(base(), false), ...mk(found, true)];
    refreshQuota(); render();
  };
  const save = async (track, suffix, ext) => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(await O.zipFiles(await libs.jszip(), build(track).files)); a.download = S.name + suffix + "." + ext; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  $("rvTrack").onclick = () => save(true, " - review", "docx");
  $("rvClean").onclick = () => save(false, " - review (bersih)", "docx");
  $("rvXlsx").onclick = () => save(false, " - review", "xlsx");
}

function initArticle(cs) {
  const $ = (id) => document.getElementById(id), toast = (m) => { const t = $("toast"); t.textContent = m; t.hidden = false; setTimeout(() => { t.hidden = true; }, 2600); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let ai = null, src = "", program = null, last = "";
  const sync = () => { $("caPromoBox").hidden = $("caPromoUrl").hidden = $("caClose").value !== "promo"; };
  const fillPromo = () => { if (program && !$("caPName").value) { $("caPName").value = program.name || ""; $("caPUrl").value = program.event_url || ""; } };
  $("caClose").onchange = () => { sync(); fillPromo(); if (ai) toast("Pilihan penutup berubah. Klik Buat artikel lagi."); };
  fetch("/api/cw").then((r) => r.json()).then((j) => { program = j.program; fillPromo(); }).catch(() => {});
  $("caFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const files = await O.unzip(await libs.jszip(), f); $("caText").value = O.docxParagraphs(files["word/document.xml"]).map((p) => p.text).join("\n"); }
    catch (err) { toast("File .docx tidak bisa dibaca."); }
    e.target.value = "";
  };
  const chosen = () => { const r = document.querySelector('input[name="caT"]:checked'); return r ? ai.titles[+r.value] : $("caTitle").value.trim(); };
  const render = () => {
    const acc = [...document.querySelectorAll("#caEdits input:checked")].map((c) => ai.edits[+c.dataset.n]);
    const art = buildArticle({ body: applyEdits(src, acc).text, title: chosen(), closing: ai.closing, close: $("caClose").value, tags: ai.tags });
    $("caFinal").value = last = art.text; $("caTags").textContent = art.tags.join(", ");
    check();
  };
  const check = () => {
    const t = $("caFinal").value, miss = missingNumbers(src, t), extra = extraNumbers(src + " " + $("caPName").value + " " + $("caPUrl").value, t + " " + chosen()), iss = window.Compliance ? window.Compliance.check(t, { glossary: (cs.style || {}).glossary, allow: cs.allow || [] }).issues : [];
    $("caWarn").innerHTML = (miss.length ? '<div class="note small" style="color:#c0392b"><b>Angka dari naskah asli hilang atau berubah:</b> <span translate="no">' + esc(miss.join(", ")) + "</span></div>" : "") +
      (extra.length ? '<div class="note small" style="color:#c0392b"><b>Angka tidak ada di naskah IGS:</b> <span translate="no">' + esc(extra.join(", ")) + "</span></div>" : "") +
      iss.map((i) => '<div class="note small"><span translate="no">' + esc(i.msg) + "</span></div>").join("");
  };
  $("caFinal").oninput = check;
  $("caGo").onclick = async () => {
    src = $("caText").value.trim(); if (!src) return toast("Isi dulu naskah IGS.");
    const btn = $("caGo"); btn.disabled = true;
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "cw_article", text: src, title: $("caTitle").value, close: $("caClose").value, promo: { name: $("caPName").value, url: $("caPUrl").value } }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
      ai = j.result;
      $("caTitles").innerHTML = ai.titles.map((t, n) => '<label><input type="radio" name="caT" value="' + n + '"' + (n ? "" : " checked") + "> " + esc(t) + "</label>").join("");
      $("caEdits").innerHTML = ai.edits.map((e, n) => '<label><input type="checkbox" data-n="' + n + '" checked> ' + esc(e.from) + " &rarr; " + esc(e.to) + (e.why ? ' <span class="muted small">(' + esc(e.why) + ")</span>" : "") + "</label>").join("") || '<span class="muted small" translate="yes">Tidak ada perbaikan.</span>';
      $("caOut").hidden = false; render();
    } catch (err) { toast(err.message || "Gagal membuat artikel."); } finally { btn.disabled = false; }
  };
  $("caTitles").onchange = check;
  $("caEdits").onchange = (e) => { if ($("caFinal").value !== last && !confirm("Teks akhir sudah Anda ubah. Terapkan ulang perbaikan dan hapus suntingan Anda?")) { e.target.checked = !e.target.checked; return; } render(); };
  $("caCopy").onclick = () => { navigator.clipboard.writeText(chosen() + "\n\n" + $("caFinal").value).then(() => toast("Tersalin"), () => toast("Gagal menyalin")); };
  $("caDocx").onclick = async () => {
    const blocks = [{ t: "h1", runs: [{ text: chosen() }] }, ...$("caFinal").value.split("\n").filter(Boolean).map((l) => ({ t: "p", runs: [{ text: l }] })), { t: "p", runs: [{ text: "Tag: " + $("caTags").textContent }] }];
    const a = document.createElement("a"); a.href = URL.createObjectURL(await O.zipFiles(await libs.jszip(), O.makeDocx(blocks, {}))); a.download = "artikel.docx"; a.click();
  };
}
