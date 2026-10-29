// Cek kamus bahasa Inggris semua tool (apps/*/i18n.js dan apps/sats/worker/src/i18n.*): bisa diimpor, terjemahan tidak kosong,
// {nama} di terjemahan ada juga di kunci, dan mesin di shared/i18n.js menerjemahkan contoh dasar.
//   node scripts/i18n-check.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { makeTranslator, i18nHead } from "../shared/i18n.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let bad = 0;
const fail = (m) => { bad++; console.log("✗ " + m); };

// mesin
const t = makeTranslator({ "Tersimpan: {n} cabang dan {m} galeri": "Saved: {n} branches and {m} galleries", "Galeri": "Gallery" });
const cases = [["Simpan", "Save"], [" simpan ", " save "], ["✓ Tersimpan.", "✓ Saved."], ["Tersimpan: 3 cabang dan 2 galeri", "Saved: 3 branches and 2 galleries"],
  ["Status: Disetujui", "Status: Approved"], ["Rabu, 29 Oktober 2026", "Wednesday, 29 October 2026"], ["Galeri · Menunggu", "Gallery · Pending"], ["Halo dunia", "Halo dunia"]];
for (const [a, b] of cases) if (t(a) !== b) fail(`mesin: ${JSON.stringify(a)} -> ${JSON.stringify(t(a))}, harusnya ${JSON.stringify(b)}`);
if (!/toolhub-lang-request/.test(i18nHead({}))) fail("i18nHead tanpa listener bahasa");

const files = [];
for (const d of fs.readdirSync(path.join(root, "apps"))) {
  for (const f of ["i18n.js", "worker/src/i18n.js", "worker/src/i18n.ts"]) { const p = path.join(root, "apps", d, f); if (fs.existsSync(p)) files.push(p); }
}
for (const p of files) {
  const name = path.relative(root, p);
  if (p.endsWith(".ts")) { console.log(`· ${name}: TypeScript, dicek lewat build worker`); continue; }
  let D;
  try { D = (await import(pathToFileURL(p).href)).default; } catch (e) { fail(`${name}: gagal diimpor (${e.message})`); continue; }
  if (!D || typeof D !== "object") { fail(`${name}: export default bukan objek`); continue; }
  let n = 0;
  for (const [k, v] of Object.entries(D)) {
    n++;
    if (typeof v !== "string" || !v.trim()) fail(`${name}: terjemahan kosong untuk ${JSON.stringify(k)}`);
    const ks = new Set((k.match(/\{\w+\}/g) || [])), vs = (String(v).match(/\{\w+\}/g) || []);
    for (const x of vs) if (!ks.has(x)) fail(`${name}: ${x} di terjemahan tidak ada di kunci ${JSON.stringify(k)}`);
  }
  try { makeTranslator(D)("Simpan"); } catch (e) { fail(`${name}: kamus membuat mesin gagal (${e.message})`); }
  console.log(`· ${name}: ${n} kunci`);
}
console.log(bad ? `${bad} masalah` : "semua cek lolos");
process.exit(bad ? 1 : 0);
