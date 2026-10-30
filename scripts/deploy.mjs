// Deploy semua tool ke Cloudflare dengan satu perintah.
//
//   node scripts/deploy.mjs                 deploy semua tool
//   node scripts/deploy.mjs fund bond       deploy tool tertentu (pakai id di daftar APPS)
//   node scripts/deploy.mjs --changed <sha> deploy tool yang berubah sejak commit <sha> (dipakai GitHub Actions)
//   node scripts/deploy.mjs --dry-run       cek bundel semua tool tanpa menyentuh Cloudflare
//   node scripts/deploy.mjs --resolve sats  hanya tulis wrangler.deploy.json (untuk perintah wrangler d1 di workflow)
//   node scripts/deploy.mjs secrets [id..]  kirim secret dari .secrets.json ke tiap tool
//   node scripts/deploy.mjs ai-keys         kirim env GEMINI_API_KEY / GROQ_API_KEY (yang terisi saja) ke semua tool yang memakai AI
//
// Profil (nama brand, link, subdomain) dibaca dari profile.json atau env PROFILE_JSON, lalu disuntikkan ke setiap
// worker sebagai variabel PROFILE, HUB_URL, ADMIN_EMAILS, dan GITHUB_REPO. Database D1 dan KV dicari menurut nama;
// kalau belum ada, dibuat otomatis. ID-nya tidak perlu ditulis di mana pun.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonc } from "../shared/jsonc.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Urutan penting: worker yang dipanggil lewat service binding harus ada lebih dulu.
// id = id di Tool Hub & di profile.urls; dir = folder berisi wrangler.jsonc; build = perintah sebelum deploy.
export const APPS = [
  { id: "email", dir: "apps/email-studio" },
  { id: "fund", dir: "apps/fund-insight" },
  { id: "bond", dir: "apps/bond-insight" },
  { id: "etf", dir: "apps/etf-insight" },
  { id: "competitor", dir: "apps/competitor-intel" },
  { id: "edukasi", dir: "apps/edukasi-studio" },
  { id: "copy", dir: "apps/copy-studio" },
  { id: "marketproxy", dir: "apps/market-proxy" },
  { id: "storydata", dir: "apps/story-data" },
  { id: "story", dir: "apps/story-generator" },
  { id: "tutorial", dir: "apps/tutorial" },
  // setelah fund & bond: memakai keduanya lewat service binding
  { id: "planner", dir: "apps/content-planner" },
  // setelah planner: memilih/membuat kegiatan & mengirim angka peserta ke Content Planner lewat service binding
  { id: "event", dir: "apps/event-lead" },
  // setelah event, copy, edukasi: daftar event untuk poster & kirim disclaimer lewat service binding (tidak ada tool yang memanggil Brand Kit kecuali hub)
  { id: "brand", dir: "apps/brand-kit" },
  // setelah planner: konsep konten dikirim ke Content Planner lewat service binding
  { id: "content", dir: "apps/content-insight" },
  // setelah storydata: memakainya lewat service binding
  { id: "recap", dir: "apps/market-recap" },
  // membaca database Market Recap (recap-db) untuk ringkasan pasar
  { id: "news", dir: "apps/market-news" },
  { id: "sats", dir: "apps/sats/worker", watch: ["apps/sats/frontend", "apps/sats/database"],
    build: [["npm", ["ci"], "../frontend"], ["npm", ["run", "build"], "../frontend"]] },
  // paling akhir: memanggil tool lain lewat service binding, dan tool lain harus sudah melepas cron lamanya
  { id: "cron", dir: "apps/cron" },
  // setelah semuanya: beranda hub membaca ringkasan "Hari ini" (Recap, Planner, Fund, Competitor, Edukasi) dan status cron lewat service binding
  { id: "hub", dir: "apps/tool-hub" },
];
const SHARED = ["shared/", "scripts/deploy.mjs", "package.json"];

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); if (i < 0) return null; args.splice(i, 1); return true; };
const opt = (f) => { const i = args.indexOf(f); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };

const die = (msg) => { console.error("\n✗ " + msg); process.exit(1); };
const log = (msg) => console.log(msg);

export { parseJsonc };

const configPath = (app) => {
  for (const f of ["wrangler.jsonc", "wrangler.json"]) { const p = path.join(ROOT, app.dir, f); if (fs.existsSync(p)) return p; }
  return null;
};
const readConfig = (app) => { const p = configPath(app); return p ? parseJsonc(fs.readFileSync(p, "utf8")) : null; };

function wrangler(wargs, { cwd = ROOT, capture = false, env = {} } = {}) {
  const bin = path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
  if (!fs.existsSync(bin)) die("wrangler belum terpasang. Jalankan dulu: npm install");
  const r = spawnSync(process.execPath, [bin, ...wargs], { cwd, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) die(`wrangler ${wargs.join(" ")} gagal${capture ? ":\n" + (r.stderr || r.stdout) : ""}`);
  return capture ? r.stdout : "";
}
const jsonOut = (s) => { const i = s.search(/[[{]/); return JSON.parse(s.slice(i)); };

function loadProfile(dry = false) {
  const file = path.join(ROOT, "profile.json");
  const raw = process.env.PROFILE_JSON || (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  if (!raw && !dry) die("profile.json belum ada. Salin profile.example.json menjadi profile.json lalu isi.");
  const p = raw ? parseJsonc(raw) : {};
  if (dry) p.subdomain ||= "contoh";
  if (p.subdomain && !/^[a-z0-9-]+$/.test(p.subdomain))
    die(`"subdomain" di profile.json tidak sah: "${p.subdomain}". Isi persis seperti di Cloudflare (Workers & Pages -> Subdomain), huruf kecil tanpa spasi, mis. "frankykho".`);
  if (!p.subdomain && !APPS.every((a) => p.urls && p.urls[a.id])) die("Isi \"subdomain\" di profile.json (nama subdomain workers.dev akun Cloudflare Anda).");
  // alamat setiap tool: dari profile.urls kalau diisi (domain sendiri), selain itu https://<nama-worker>.<subdomain>.workers.dev
  p.urls = { ...(p.urls || {}) };
  for (const app of APPS) {
    const c = readConfig(app);
    if (c && !p.urls[app.id]) p.urls[app.id] = `https://${c.name}.${p.subdomain}.workers.dev`;
  }
  return p;
}

// ---------- sumber daya Cloudflare (dicari menurut nama, dibuat kalau belum ada) ----------
let d1Cache, kvCache;
function d1Id(name, dry) {
  if (dry) return "00000000-0000-0000-0000-000000000000";
  d1Cache ??= jsonOut(wrangler(["d1", "list", "--json"], { capture: true }));
  let db = d1Cache.find((d) => d.name === name);
  if (!db) {
    log(`  + membuat database D1 "${name}"`);
    wrangler(["d1", "create", name], { capture: true });
    d1Cache = jsonOut(wrangler(["d1", "list", "--json"], { capture: true }));
    db = d1Cache.find((d) => d.name === name);
  }
  return db.uuid;
}
function kvId(title, dry) {
  if (dry) return "00000000000000000000000000000000";
  kvCache ??= jsonOut(wrangler(["kv", "namespace", "list"], { capture: true }));
  let ns = kvCache.find((k) => k.title === title);
  if (!ns) {
    log(`  + membuat KV "${title}"`);
    wrangler(["kv", "namespace", "create", title], { capture: true });
    kvCache = jsonOut(wrangler(["kv", "namespace", "list"], { capture: true }));
    ns = kvCache.find((k) => k.title === title);
  }
  return ns.id;
}

/** Tulis wrangler.deploy.json (config lengkap: ID sumber daya + variabel profil) di folder tool. */
function resolve(app, profile, dry) {
  const c = readConfig(app);
  if (!c) return null;
  for (const db of c.d1_databases || []) if (!db.database_id || db.database_id === "auto") db.database_id = d1Id(db.database_name, dry);
  for (const kv of c.kv_namespaces || []) if (!kv.id || kv.id === "auto") kv.id = kvId(`${c.name}-${kv.binding.toLowerCase()}`, dry);
  // PROFILE ikut terkirim ke browser, jadi subdomain & email admin tidak dimasukkan (admin lewat ADMIN_EMAILS)
  const { subdomain, admins, ...pub } = profile;
  const PROFILE = JSON.stringify(pub);
  if (PROFILE.length > 5000) die(`profile.json terlalu besar (${PROFILE.length} karakter; batas variabel Cloudflare 5.000).`);
  c.vars = {
    ...(c.vars || {}),
    PROFILE,
    HUB_URL: profile.urls.hub || "",
    ADMIN_EMAILS: (profile.admins || []).join(","),
    GITHUB_REPO: (profile.github && profile.github.repo) || "",
  };
  const out = path.join(ROOT, app.dir, "wrangler.deploy.json");
  fs.writeFileSync(out, JSON.stringify(c, null, 2));
  return out;
}

function changedApps(base) {
  const r = spawnSync("git", ["diff", "--name-only", base, "HEAD"], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) return APPS; // commit pembanding tidak ada (push pertama) -> deploy semua
  const files = r.stdout.split("\n").filter(Boolean);
  if (files.some((f) => SHARED.some((s) => f.startsWith(s)))) return APPS;
  const root = (a) => a.dir.replace(/\/worker$/, "");
  return APPS.filter((a) => files.some((f) => [root(a), ...(a.watch || [])].some((d) => f.startsWith(d + "/"))));
}

// ---------- perintah ----------
function secrets(ids) {
  const file = path.join(ROOT, ".secrets.json");
  if (!fs.existsSync(file)) die(".secrets.json belum ada. Salin .secrets.example.json menjadi .secrets.json lalu isi.");
  const all = parseJsonc(fs.readFileSync(file, "utf8"));
  const profile = loadProfile();
  for (const app of APPS.filter((a) => !ids.length || ids.includes(a.id))) {
    // nilai berupa objek (mis. FIREBASE_SA yang ditempel utuh dari berkas .json) dikirim sebagai teks JSON
    const vals = Object.fromEntries(Object.entries({ ...(all["*"] || {}), ...(all[app.id] || {}) })
      .filter(([, v]) => v).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
    if (Object.keys(vals).length) putSecrets(app, profile, vals);
  }
}
function putSecrets(app, profile, vals) {
  const cfg = resolve(app, profile, false);
  const tmp = path.join(ROOT, app.dir, ".secrets.tmp.json");
  fs.writeFileSync(tmp, JSON.stringify(vals));
  try { log(`\n▶ secret ${app.id}: ${Object.keys(vals).join(", ")}`); wrangler(["secret", "bulk", tmp, "-c", cfg], { cwd: path.dirname(cfg) }); }
  finally { fs.rmSync(tmp, { force: true }); }
}
// Key AI dari env (workflow "AI keys" mengisinya dari secret repo GitHub) ke semua tool yang memanggil shared/ai.js.
// Key yang kosong tidak dikirim, jadi secret yang sudah ada di worker tidak tertimpa.
const AI_APPS = ["edukasi", "recap", "content", "competitor", "news", "copy", "tutorial", "sats"];
function aiKeys() {
  const vals = Object.fromEntries(["GEMINI_API_KEY", "GROQ_API_KEY"].map((k) => [k, (process.env[k] || "").trim()]).filter(([, v]) => v));
  if (!Object.keys(vals).length) die("GEMINI_API_KEY dan GROQ_API_KEY kosong: isi minimal satu sebagai secret repo GitHub (Settings › Secrets and variables › Actions).");
  const profile = loadProfile();
  for (const app of APPS.filter((a) => AI_APPS.includes(a.id))) putSecrets(app, profile, vals);
  log(`\n✓ ${Object.keys(vals).join(" & ")} terpasang di: ${AI_APPS.join(", ")}`);
}

function deploy(list, dry) {
  const profile = loadProfile(dry);
  for (const app of list) {
    const cfg = resolve(app, profile, dry);
    if (!cfg) { log(`- ${app.id}: belum ada wrangler.jsonc, dilewati`); continue; }
    log(`\n▶ ${app.id} (${app.dir})`);
    for (const [cmd, a, dir] of app.build || []) {
      const cwd = path.join(ROOT, app.dir, dir);
      if (dry && a[0] === "ci" && fs.existsSync(path.join(cwd, "node_modules"))) continue;
      const r = spawnSync(cmd, a, { cwd, stdio: "inherit", shell: process.platform === "win32" });
      if (r.status !== 0) die(`${cmd} ${a.join(" ")} gagal di ${app.dir}/${dir}`);
    }
    wrangler(["deploy", "-c", cfg, ...(dry ? ["--dry-run", "--outdir", path.join(ROOT, ".dry", app.id)] : [])], { cwd: path.dirname(cfg) });
  }
}

if (args[0] === "secrets") secrets(args.slice(1));
else if (args[0] === "ai-keys") aiKeys();
else {
  const dry = flag("--dry-run"), base = opt("--changed"), only = opt("--resolve");
  if (only) { const a = APPS.find((x) => x.id === only) || die(`tool "${only}" tidak dikenal`); log(resolve(a, loadProfile(), false)); }
  else {
    const list = base ? changedApps(base) : args.length ? args.map((id) => APPS.find((a) => a.id === id) || die(`tool "${id}" tidak dikenal. Pilihan: ${APPS.map((a) => a.id).join(", ")}`)) : APPS;
    if (!list.length) log("Tidak ada tool yang berubah.");
    deploy(list, dry);
    log(`\n✓ selesai: ${list.map((a) => a.id).join(", ") || "-"}`);
  }
}
