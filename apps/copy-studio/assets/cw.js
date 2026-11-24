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
export function missingNumbers(src, out) {
  const have = tally(numbers(out)), miss = [];
  for (const [n, c] of tally(numbers(src))) if ((have.get(n) || 0) < c) miss.push(n);
  return miss;
}
export function applyEdits(text, edits) {
  const skipped = [];
  for (const e of edits) { const i = text.indexOf(e.from); if (i < 0) skipped.push(e); else text = text.slice(0, i) + e.to + text.slice(i + e.from.length); }
  return { text, skipped };
}
export function buildArticle({ body, title, closing, close, tags }) {
  let b = String(body || "").replace(BYLINE, "").replace(DISC_ARTICLE, "").trim();
  if (!b.startsWith(OPENER)) b = OPENER + b;
  const parts = [b, closing && closing.trim(), close === "promo" && PRIZE_DISC, BYLINE, DISC_ARTICLE].filter(Boolean);
  const seen = new Set();
  return { title, text: parts.join("\n\n"), tags: [...(tags || []), ...FIXED_TAGS].filter((t) => { const k = t.toLowerCase(); return !seen.has(k) && seen.add(k); }) };
}

function initArticle(cs) {
  const $ = (id) => document.getElementById(id), toast = (m) => { const t = $("toast"); t.textContent = m; t.hidden = false; setTimeout(() => { t.hidden = true; }, 2600); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let ai = null, src = "", program = null;
  const sync = () => { $("caPromoBox").hidden = $("caPromoUrl").hidden = $("caClose").value !== "promo"; };
  const fillPromo = () => { if (program && !$("caPName").value) { $("caPName").value = program.name || ""; $("caPUrl").value = program.event_url || ""; } };
  $("caClose").onchange = () => { sync(); fillPromo(); };
  fetch("/api/cw").then((r) => r.json()).then((j) => { program = j.program; fillPromo(); }).catch(() => {});
  $("caFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const files = await O.unzip(await libs.jszip(), f); $("caText").value = O.docxParagraphs(files["word/document.xml"]).map((p) => p.text).join("\n"); }
    catch (err) { toast("File .docx tidak bisa dibaca."); }
  };
  const chosen = () => { const r = document.querySelector('input[name="caT"]:checked'); return r ? ai.titles[+r.value] : $("caTitle").value.trim(); };
  const render = () => {
    const acc = [...document.querySelectorAll("#caEdits input:checked")].map((c) => ai.edits[+c.dataset.n]);
    const art = buildArticle({ body: applyEdits(src, acc).text, title: chosen(), closing: ai.closing, close: $("caClose").value, tags: ai.tags });
    $("caFinal").value = art.text; $("caTags").textContent = art.tags.join(", ");
    check();
  };
  const check = () => {
    const t = $("caFinal").value, miss = missingNumbers(src, t), iss = window.Compliance ? window.Compliance.check(t, { glossary: (cs.style || {}).glossary, allow: cs.allow || [] }).issues : [];
    $("caWarn").innerHTML = (miss.length ? '<div class="note small" style="color:#c0392b"><b>Angka dari naskah asli hilang atau berubah:</b> <span translate="no">' + esc(miss.join(", ")) + "</span></div>" : "") +
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
  $("caTitles").onchange = $("caEdits").onchange = render;
  $("caCopy").onclick = () => { navigator.clipboard.writeText($("caFinal").value).then(() => toast("Tersalin"), () => toast("Gagal menyalin")); };
  $("caDocx").onclick = async () => {
    const blocks = [{ t: "h1", runs: [{ text: chosen() }] }, ...$("caFinal").value.split("\n").filter(Boolean).map((l) => ({ t: "p", runs: [{ text: l }] })), { t: "p", runs: [{ text: "Tag: " + $("caTags").textContent }] }];
    const a = document.createElement("a"); a.href = URL.createObjectURL(await O.zipFiles(await libs.jszip(), O.makeDocx(blocks, {}))); a.download = "artikel.docx"; a.click();
  };
}
