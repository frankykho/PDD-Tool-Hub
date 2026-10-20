/** JSON dengan komentar (// dan /* *\/) dan koma di akhir -> objek. Komentar di dalam string dibiarkan.
 *  Dipakai scripts/deploy.mjs dan jobs/pdf-generator/urls.mjs, supaya profil dibaca dengan cara yang sama di mana pun. */
export function parseJsonc(text) {
  let out = "", i = 0, str = false;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (str) { out += c; if (c === "\\") { out += n; i += 2; continue; } if (c === '"') str = false; i++; continue; }
    if (c === '"') { str = true; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i = text.indexOf("*/", i + 2) + 2; continue; }
    out += c; i++;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}
