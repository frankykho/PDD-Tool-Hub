// npx tsx src/flow/test-xlsx.ts — pembaca .xlsx & "Ringkasan Saham" BEI (kode di frontend/src/flow, dipakai di browser)
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { readXlsx } from "../../../frontend/src/flow/xlsx";
import { dateFromName, parseDate, parseIdxSummary } from "../../../frontend/src/flow/idxSummary";

// --- tiny zip writer (deflate) to build a real .xlsx
function zip(files: Record<string, string>): ArrayBuffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8");
    const data = deflateRawSync(raw);
    const nameB = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameB.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(raw.length, 24); cen.writeUInt16LE(nameB.length, 28); cen.writeUInt32LE(offset, 42);
    parts.push(local, nameB, data);
    central.push(cen, nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  const b = Buffer.concat([...parts, cd, end]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
}

const head = ["No", "Kode Saham", "Nama Perusahaan", "Penutupan", "Volume", "Nilai", "Frekuensi", "Foreign Sell", "Foreign Buy", "Non Regular Volume", "Non Regular Frequency", "Tanggal Perdagangan Terakhir"];
const shared = [...head, "BBCA", "Bank Central Asia Tbk.", "AALI", "Astra Agro &amp; Co", "23 Okt 2026"];
const si = (s: string) => shared.indexOf(s);
const sc = (ref: string, s: string) => `<c r="${ref}" t="s"><v>${si(s)}</v></c>`;
const nc = (ref: string, n: number) => `<c r="${ref}"><v>${n}</v></c>`;
const cols = "ABCDEFGHIJKL";
const sheet = `<?xml version="1.0"?><worksheet><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Ringkasan Saham</t></is></c></row>
<row r="3">${head.map((h, i) => sc(`${cols[i]}3`, h)).join("")}</row>
<row r="4">${nc("A4", 1)}${sc("B4", "BBCA")}${sc("C4", "Bank Central Asia Tbk.")}${nc("D4", 5025)}${nc("E4", 177399000)}${nc("F4", 891234567890)}${nc("G4", 39790)}${nc("H4", 50000000)}${nc("I4", 20000000)}${nc("J4", 1000000)}${nc("K4", 12)}${sc("L4", "23 Okt 2026")}</row>
<row r="5">${nc("A5", 2)}${sc("B5", "AALI")}${sc("C5", "Astra Agro &amp; Co")}${nc("D5", 8000)}${nc("E5", 300000)}${nc("F5", 2400000000)}${nc("G5", 150)}${nc("H5", 0)}${nc("I5", 0)}${nc("J5", 0)}${nc("K5", 0)}<c r="L5"><v>46318</v></c></row>
<row r="7"><c r="A7" t="inlineStr"><is><t>Total</t></is></c></row>
</sheetData></worksheet>`;
const sst = `<?xml version="1.0"?><sst>${shared.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`;

async function main() {
  const rows = await readXlsx(zip({ "[Content_Types].xml": "<Types/>", "xl/sharedStrings.xml": sst, "xl/worksheets/sheet1.xml": sheet }));
  assert.equal(rows[1][1], "Kode Saham");
  assert.equal(rows[3][2], "Astra Agro & Co", "entity di-unescape");
  const r = parseIdxSummary(rows, "Ringkasan Saham-20261023.xlsx");
  assert.equal(r.date, "2026-10-23");
  assert.equal(r.rows.length, 2, "baris judul & total dilewati");
  assert.deepEqual(r.rows[0], { code: "BBCA", close: 5025, volume: 177399000, value: 891234567890, freq: 39790, nr_volume: 1000000, nr_freq: 12, foreign_buy: 20000000, foreign_sell: 50000000 });
  assert.equal(parseIdxSummary(rows, "ringkasan.xlsx").date, "2026-10-23", "tanpa tanggal di nama file: dari kolom tanggal");
  assert.equal(parseDate("46318"), "2026-10-23");
  assert.equal(parseDate("2026-10-23T00:00:00"), "2026-10-23");
  assert.equal(parseDate("5 Mei 2026"), "2026-05-05");
  assert.equal(dateFromName("x.xlsx"), null);
  assert.throws(() => parseIdxSummary([["a", "b"]]), /Kode Saham/);
  await assert.rejects(readXlsx(new ArrayBuffer(10)), /zip/);
  console.log("xlsx: semua cek lolos");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
