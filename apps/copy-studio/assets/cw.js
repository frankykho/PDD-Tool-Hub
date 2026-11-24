// Tab Copywriter: kerangka. Jangan sentuh DOM di level atas modul (diimpor juga oleh tes Node).
const load = (src) => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Gagal memuat " + src)); document.head.appendChild(s); });
const once = (src, get) => { let p; return () => (p = p || load(src).then(get)); };
const PDF = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
export const libs = {
  jszip: once("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", () => window.JSZip),
  pdf: once(PDF, () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF.replace("pdf.min.js", "pdf.worker.min.js"); return window.pdfjsLib; }),
};
export function init(cs) {
  const sel = document.getElementById("cwKind"), panes = document.querySelectorAll("[data-cw]");
  const show = () => { panes.forEach((p) => { p.hidden = p.dataset.cw !== sel.value; }); try { localStorage.setItem("cs_cw", sel.value); } catch (e) {} };
  try { const k = localStorage.getItem("cs_cw"); if (k && [...sel.options].some((o) => o.value === k)) sel.value = k; } catch (e) {}
  sel.addEventListener("change", show);
  show();
}
