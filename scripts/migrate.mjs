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

// Kolom yang berganti nama saat white-label diisi di .migrate/map.json ("renames": [[lama, baru]]); lihat NILAI-LAMA.md.

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
    _petunjuk: "Ganti NAMA_LAMA dengan nama di akun lama (lihat daftar di atas); hapus baris yang tidak dipakai. NAMA_KOLOM_LAMA: lihat NILAI-LAMA.md.",
    d1: Object.fromEntries(TARGET_D1.map((t) => [t, "NAMA_LAMA"])),
    kv: Object.fromEntries(TARGET_KV.map((t) => [t, "NAMA_LAMA"])),
    renames: [["NAMA_KOLOM_LAMA", "our_action"]],
  };
  fs.writeFileSync(MAP, JSON.stringify(tpl, null, 2));
  console.log(`\nIsi nama lama di ${MAP}, lalu jalankan: node scripts/migrate.mjs export`);
}

function readMap() {
  if (!fs.existsSync(MAP)) die("Jalankan dulu: node scripts/migrate.mjs list");
  const m = JSON.parse(fs.readFileSync(MAP, "utf8"));
  const keep = (o) => Object.entries(o || {}).filter(([, v]) => v && v !== "NAMA_LAMA");
  const renames = (m.renames || []).filter(([a, b]) => a && b && a !== "NAMA_KOLOM_LAMA");
  return { d1: keep(m.d1), kv: keep(m.kv), renames };
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
    for (const [a, b] of map.renames) sql = sql.split(a).join(b);
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

function importAll() {
  const d1 = d1List(), kv = kvList();
  for (const target of TARGET_D1) {
    const file = path.join(DIR, `${target}.sql`);
    if (!fs.existsSync(file)) continue;
    const db = d1.find((d) => d.name === target) || die(`D1 "${target}" belum ada di akun baru. Jalankan dulu: node scripts/deploy.mjs`);
    console.log(`▶ D1 ${target}`);
    wrangler(["d1", "execute", target, "--remote", "--yes", "--file", file, "-c", d1Config(target, db.uuid)], { capture: false });
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
