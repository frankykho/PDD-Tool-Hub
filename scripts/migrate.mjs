// Pindah data dari akun Cloudflare LAMA ke akun BARU (sekali jalan, saat pindah akun).
//
// 1) Login ke akun LAMA:  npx wrangler login   (atau isi CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID akun lama)
//      node scripts/migrate.mjs list            -> tampilkan database D1 & KV di akun lama, buat .migrate/map.json
//    Isi .migrate/map.json: nama lama -> nama baru (nama baru sudah terisi; cukup cocokkan).
//      node scripts/migrate.mjs export          -> unduh semua data ke folder .migrate/
// 2) Login ke akun BARU:  npx wrangler logout && npx wrangler login
//      node scripts/deploy.mjs                  -> buat worker, database & KV kosong (jangan buka tool dulu)
//      node scripts/migrate.mjs import          -> masukkan data ke akun baru
//
// Folder .migrate/ berisi data asli (akun pengguna, draf, riwayat) dan TIDAK masuk repo. Hapus setelah selesai.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, ".migrate");
const MAP = path.join(DIR, "map.json");

// Tujuan di akun baru (lihat wrangler.jsonc tiap tool; nama KV = <nama-worker>-<binding huruf kecil>).
const TARGET_D1 = ["insight-db", "edukasi-db", "sats-db"];
const TARGET_KV = ["tool-hub-hub_kv", "email-studio-drafts", "bond-insight-bonds_kv", "story-data-lme_kv", "story-generator-drafts"];

// Kolom aksi di tabel ci_programs (Competitor Intel) berganti nama menjadi our_action; nama lamanya dikenali otomatis.
const renameAction = (sql) => sql.replace(/\b(?!our_)[a-z]+_action\b/g, "our_action");

const die = (m) => { console.error("\n✗ " + m); process.exit(1); };
function wrangler(args, { capture = true, cwd = DIR } = {}) {
  const bin = path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", maxBuffer: 1 << 30, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
  if (r.status !== 0) die(`wrangler ${args.join(" ")} gagal:\n${r.stderr || r.stdout || ""}`);
  return r.stdout || "";
}
const json = (s) => JSON.parse(s.slice(s.search(/[[{]/)));
const d1List = () => json(wrangler(["d1", "list", "--json"]));
const kvList = () => json(wrangler(["kv", "namespace", "list"]));
// perintah d1 butuh config berisi database itu
function d1Config(name, uuid) {
  const f = path.join(DIR, `d1-${name}.json`);
  fs.writeFileSync(f, JSON.stringify({ name: "migrate", compatibility_date: "2026-09-22", d1_databases: [{ binding: "DB", database_name: name, database_id: uuid }] }));
  return f;
}

function list() {
  fs.mkdirSync(DIR, { recursive: true });
  const d1 = d1List(), kv = kvList();
  console.log("Database D1 di akun ini:"); d1.forEach((d) => console.log("  " + d.name));
  console.log("KV di akun ini:"); kv.forEach((k) => console.log("  " + k.title));
  if (fs.existsSync(MAP)) return console.log(`\n${MAP} sudah ada; tidak ditimpa.`);
  const tpl = {
    _petunjuk: "Ganti NAMA_LAMA dengan nama di akun lama (lihat daftar di atas); hapus baris yang tidak dipakai.",
    d1: Object.fromEntries(TARGET_D1.map((t) => [t, "NAMA_LAMA"])),
    kv: Object.fromEntries(TARGET_KV.map((t) => [t, "NAMA_LAMA"])),
  };
  fs.writeFileSync(MAP, JSON.stringify(tpl, null, 2));
  console.log(`\nIsi nama lama di ${MAP}, lalu jalankan: node scripts/migrate.mjs export`);
}

function readMap() {
  if (!fs.existsSync(MAP)) die("Jalankan dulu: node scripts/migrate.mjs list");
  const m = JSON.parse(fs.readFileSync(MAP, "utf8"));
  const keep = (o) => Object.entries(o || {}).filter(([, v]) => v && v !== "NAMA_LAMA");
  return { d1: keep(m.d1), kv: keep(m.kv) };
}

function exportAll() {
  const map = readMap(), d1 = d1List(), kv = kvList();
  for (const [target, old] of map.d1) {
    const db = d1.find((d) => d.name === old) || die(`D1 "${old}" tidak ada di akun ini`);
    const out = path.join(DIR, `${target}.sql`);
    console.log(`▶ D1 ${old} -> ${path.basename(out)}`);
    wrangler(["d1", "export", old, "--remote", "--output", out, "-c", d1Config(old, db.uuid)], { capture: false });
    // tabel mungkin sudah dibuat worker baru: jangan gagal karena "already exists", timpa baris yang sama
    let sql = fs.readFileSync(out, "utf8")
      .replace(/^CREATE TABLE (?!IF NOT EXISTS)/gm, "CREATE TABLE IF NOT EXISTS ")
      .replace(/^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/gm, "CREATE $1INDEX IF NOT EXISTS ")
      .replace(/^INSERT INTO /gm, "INSERT OR REPLACE INTO ");
    if (target === "insight-db") sql = renameAction(sql);
    fs.writeFileSync(out, sql);
  }
  for (const [target, old] of map.kv) {
    const ns = kv.find((k) => k.title === old) || die(`KV "${old}" tidak ada di akun ini`);
    console.log(`▶ KV ${old}`);
    const keys = json(wrangler(["kv", "key", "list", "--namespace-id", ns.id, "--remote"]));
    const rows = keys.map((k) => ({
      key: k.name,
      value: wrangler(["kv", "key", "get", k.name, "--namespace-id", ns.id, "--remote", "--text"]),
      ...(k.metadata ? { metadata: k.metadata } : {}),
      ...(k.expiration ? { expiration: k.expiration } : {}),
    }));
    fs.writeFileSync(path.join(DIR, `${target}.kv.json`), JSON.stringify(rows));
    console.log(`  ${rows.length} kunci`);
  }
  console.log(`\n✓ Data tersimpan di ${DIR}. Sekarang login ke akun BARU, jalankan deploy, lalu: node scripts/migrate.mjs import`);
}

// D1 menolak pernyataan SQL di atas 100 KB (SQLITE_TOOBIG). Baris besar (JSON cache, gambar base64) dipecah:
// INSERT dengan kolom besar dikosongkan, lalu isinya disambung lewat beberapa UPDATE "kolom" = "kolom" || 'potongan'.
const STMT_MAX = 90_000, CHUNK = 20_000; // CHUNK dalam karakter: maks ~60 KB UTF-8
function splitTop(s) { // pisah di koma level atas, abaikan koma di dalam '...' dan (...)
  const out = []; let depth = 0, q = false, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === "'") { if (s[i + 1] === "'") i++; else q = false; } }
    else if (c === "'") q = true;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out;
}
function closeQuote(s, a) { for (let i = a + 1; i < s.length; i++) if (s[i] === "'") { if (s[i + 1] === "'") i++; else return i; } return -1; }
function splitStatement(line) {
  const m = line.match(/^(INSERT OR REPLACE INTO ("[^"]+"|\w+)) \((.+?)\) VALUES\((.*)\);\s*$/s);
  if (!m) die(`Pernyataan terlalu panjang dan tidak dikenali:\n${line.slice(0, 200)}…`);
  const [, head, table, colStr, valStr] = m, cols = splitTop(colStr), vals = splitTop(valStr);
  if (cols.length !== vals.length) die(`Jumlah kolom & nilai tidak cocok:\n${line.slice(0, 200)}…`);
  const big = vals.map((v) => Buffer.byteLength(v) > CHUNK);
  const where = cols.map((c, i) => (big[i] ? "" : `${c} IS ${vals[i]}`)).filter(Boolean).join(" AND ");
  if (!where) die(`Tidak ada kolom kecil untuk WHERE:\n${line.slice(0, 200)}…`);
  const out = [`${head} (${colStr}) VALUES(${vals.map((v, i) => (big[i] ? "''" : v)).join(",")});`];
  vals.forEach((v, i) => {
    if (!big[i]) return;
    // nilai berupa '...' atau dibungkus replace('...','\n',char(10)): potong literalnya, bungkus ulang tiap potongan
    const a = v.indexOf("'"), b = closeQuote(v, a);
    if (a < 0 || b < 0) die(`Nilai besar bukan teks di ${table}.${cols[i]}`);
    const pre = v.slice(0, a), lit = v.slice(a + 1, b), post = v.slice(b + 1);
    const escapes = [...post.matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1]).filter((t) => t.length > 1);
    const bad = (e) => lit[e - 1] === "'" || /[\uD800-\uDBFF]/.test(lit[e - 1]) ||
      escapes.some((t) => { for (let k = 1; k < t.length; k++) if (lit.startsWith(t, e - k)) return true; return false; });
    for (let p = 0; p < lit.length;) {
      let e = Math.min(p + CHUNK, lit.length);
      while (e < lit.length && bad(e)) e--;
      out.push(`UPDATE ${table} SET ${cols[i]} = ${cols[i]} || ${pre}'${lit.slice(p, e)}'${post} WHERE ${where};`);
      p = e;
    }
  });
  for (const s of out) if (Buffer.byteLength(s) > STMT_MAX) die(`Potongan masih terlalu besar di ${table}:\n${s.slice(0, 200)}…`);
  return out.join("\n");
}
function splitLong(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let n = 0;
  const sql = lines.map((l) => (Buffer.byteLength(l) > STMT_MAX ? (n++, splitStatement(l)) : l)).join("\n");
  if (!n) return file;
  const out = file.replace(/\.sql$/, ".import.sql");
  fs.writeFileSync(out, sql);
  console.log(`  ${n} baris besar dipecah -> ${path.basename(out)}`);
  return out;
}

function importAll() {
  const d1 = d1List(), kv = kvList();
  for (const target of TARGET_D1) {
    const file = path.join(DIR, `${target}.sql`);
    if (!fs.existsSync(file)) continue;
    const db = d1.find((d) => d.name === target) || die(`D1 "${target}" belum ada di akun baru. Jalankan dulu: node scripts/deploy.mjs`);
    console.log(`▶ D1 ${target}`);
    wrangler(["d1", "execute", target, "--remote", "--yes", "--file", splitLong(file), "-c", d1Config(target, db.uuid)], { capture: false });
  }
  for (const target of TARGET_KV) {
    const file = path.join(DIR, `${target}.kv.json`);
    if (!fs.existsSync(file)) continue;
    const ns = kv.find((k) => k.title === target) || die(`KV "${target}" belum ada di akun baru. Jalankan dulu: node scripts/deploy.mjs`);
    console.log(`▶ KV ${target}`);
    wrangler(["kv", "bulk", "put", file, "--namespace-id", ns.id, "--remote"], { capture: false });
  }
  console.log("\n✓ Data sudah dipindah. Buka Tool Hub di alamat baru dan cek akun pengguna, draf, dan riwayat.");
}

const cmd = process.argv[2];
if (cmd === "list") list();
else if (cmd === "export") exportAll();
else if (cmd === "import") importAll();
else console.log("Pakai: node scripts/migrate.mjs list | export | import   (lihat keterangan di atas file ini)");
