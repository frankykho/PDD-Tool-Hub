// Cek Feature Intelligence: tabel ft_ di insight-db (bersama Competitor Intelligence & Content Insight), login & hak akses.
// Jalankan: node apps/feature-intel/test.mjs   (Node 22.15+). D1 ditiru dengan node:sqlite.
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";

registerHooks({
  load(url, ctx, next) {
    if (url.startsWith("file:") && url.endsWith(".html")) return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(fs.readFileSync(fileURLToPath(url), "utf8")) };
    return next(url, ctx);
  },
});
const { default: worker, ftMigrate } = await import("./worker.js");
const { ciMigrate } = await import("../competitor-intel/worker.js");

function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
  });
  return { db, prepare: (sql) => st(sql), batch: async (list) => { const out = []; for (const x of list) out.push(await x.all()); return out; } };
}
const SECRET = "s".repeat(40), HUB = "https://hub.acme.test", BASE = "https://feature.acme.test";
const env = { SSO_SECRET: SECRET, DB: d1(), HUB_URL: HUB, PROFILE: JSON.stringify({ urls: { hub: HUB, feature: BASE } }) };

// cookie sesi hub_feature yang sah untuk peran tertentu (format HUBSSO: base64url(JSON).hmac)
const te = new TextEncoder();
const b64 = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function cookie(role) {
  const body = b64(te.encode(JSON.stringify({ app: "feature", x: Date.now() + 36e5, e: role + "@acme.test", n: "Tim " + role, u: role, a: role === "hubadmin" ? "viewer" : role, adm: role === "hubadmin" })));
  const key = await webcrypto.subtle.importKey("raw", te.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `hub_feature=${body}.${b64(await webcrypto.subtle.sign("HMAC", key, te.encode(body)))}`;
}
const call = async (method, path, body, role) => {
  const headers = { origin: BASE };
  if (role) headers.cookie = await cookie(role);
  if (body != null) headers["content-type"] = "application/json";
  return worker.fetch(new Request(BASE + path, { method, headers, body: body == null ? undefined : JSON.stringify(body) }), env, { waitUntil() {} });
};

/* ---------- Task 1: tabel, login, hak akses ---------- */
// tabel Content Insight (DDL disalin dari apps/content-insight/worker.js) supaya nama yang bentrok ketahuan
env.DB.db.exec(`CREATE TABLE IF NOT EXISTS ci_content (id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, platform TEXT, account TEXT, format TEXT, caption TEXT, posted_at TEXT, likes INTEGER, comments INTEGER, pillar TEXT, topic TEXT, note TEXT, idea TEXT, image_data TEXT, image_url TEXT, saved_at TEXT NOT NULL, saved_by TEXT, edited_by TEXT);
CREATE TABLE IF NOT EXISTS ci_accounts (platform TEXT NOT NULL, account TEXT NOT NULL, kind TEXT, PRIMARY KEY (platform, account));`);
await ciMigrate(env); await ftMigrate(env); await ftMigrate(env);   // idempoten, tidak bentrok
const tabs = env.DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
assert.ok(["ft_competitors", "ft_features", "ft_evidence", "ft_brds", "ft_meta"].every((t) => tabs.includes(t)), tabs.join(","));
assert.deepEqual(env.DB.db.prepare("SELECT name FROM ft_competitors ORDER BY name").all().map((r) => r.name), ["IPOT", "Stockbit"]);
assert.equal((await call("GET", "/api/me", null, "viewer")).status, 200);
assert.deepEqual(await (await call("GET", "/api/me", null, "hubadmin")).json(), { name: "Tim hubadmin", role: "admin" }, "admin hub selalu admin");
assert.equal((await call("GET", "/api/me", null, null)).status, 401);
assert.equal((await call("POST", "/api/features", { name: "x" }, "viewer")).status, 403);
const page = await call("GET", "/", null, "viewer");
assert.equal(page.status, 200);
assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'self' https:\/\/hub\.acme\.test/);
assert.equal((await call("GET", "/", null, null)).status, 303, "tanpa sesi -> login lewat hub");
const cross = await worker.fetch(new Request(BASE + "/api/features", { method: "POST", headers: { origin: "https://evil.test", cookie: await cookie("editor"), "content-type": "application/json" }, body: "{}" }), env, {});
assert.equal(cross.status, 403, "POST dari situs lain ditolak");

/* ---------- Task 2: fitur, bukti, verifikasi, perbandingan ---------- */
const SB = "stockbit", IP = "ipot";
let pendingN = 0;
const insertPending = (competitor, source, text) => {
  const id = "ev" + ++pendingN;
  env.DB.db.prepare("INSERT INTO ft_evidence (id, competitor_id, source, url, text, launched_at, status, hash, created_at) VALUES (?, ?, ?, ?, ?, NULL, 'Perlu verifikasi', ?, ?)")
    .run(id, competitor, source, "https://contoh.test/" + id, text, "h-" + id, new Date().toISOString());
  return id;
};
const j = async (r) => [(await r).status, await (await r).clone().json()];
// isian manual wajib bukti: url ATAU gambar; tanggal peluncuran wajib
assert.equal((await call("POST", "/api/evidence", { competitor_id: SB, name: "Auto Invest", area: "Reksa Dana", launched_at: "2026-10-01" }, "editor")).status, 400, "tanpa url & gambar");
assert.equal((await call("POST", "/api/evidence", { competitor_id: SB, name: "Auto Invest", area: "Reksa Dana", url: "https://stockbit.com/x" }, "editor")).status, 400, "tanpa tanggal");
assert.equal((await call("POST", "/api/evidence", { competitor_id: SB, name: "Auto Invest", area: "Reksa Dana", launched_at: "2026-10-01", url: "javascript:alert(1)" }, "editor")).status, 400, "url bukan http");
assert.equal((await call("POST", "/api/evidence", { competitor_id: "tidakada", name: "Auto Invest", area: "Reksa Dana", launched_at: "2026-10-01", url: "https://x.test" }, "editor")).status, 400, "kompetitor tidak dikenal");
const [ms, m] = await j(call("POST", "/api/evidence", { competitor_id: SB, name: "Auto Invest", area: "Reksa Dana", description: "Beli rutin", launched_at: "2026-10-01", url: "https://stockbit.com/x" }, "editor"));
assert.equal(ms, 200, JSON.stringify(m));
assert.ok(m.feature_id && m.id);
// temuan otomatis: gabung ke fitur yang ada butuh launched_at
const evId = insertPending(IP, "ig", "Fitur Auto Invest kini hadir");
assert.equal((await call("POST", "/api/evidence/verify", { id: evId, action: "merge", feature_id: m.feature_id }, "editor")).status, 400);
assert.equal((await call("POST", "/api/evidence/verify", { id: evId, action: "merge", feature_id: m.feature_id, launched_at: "2026-10-05" }, "viewer")).status, 403);
assert.equal((await call("POST", "/api/evidence/verify", { id: evId, action: "merge", feature_id: m.feature_id, launched_at: "2026-10-05" }, "editor")).status, 200);
assert.equal((await call("POST", "/api/evidence/verify", { id: evId, action: "reject" }, "editor")).status, 400, "yang sudah diverifikasi tidak bisa diproses lagi");
let [, list] = await j(call("GET", "/api/features", null, "viewer"));
let f = list.features[0];
assert.deepEqual(f.has, { [SB]: "2026-10-01", [IP]: "2026-10-05" });
assert.equal(f.ikisi_status, "Belum ada");                               // bawaan
assert.deepEqual(list.competitors.map((c) => c.id).sort(), [IP, SB]);
assert.equal((await call("PATCH", "/api/features", { id: f.id, decision: "Beli" }, "editor")).status, 400);  // di luar FT.DECISIONS
assert.equal((await call("PATCH", "/api/features", { id: f.id, decision: "Kejar", priority: "H", ikisi_status: "Sebagian" }, "editor")).status, 200);
assert.equal((await call("PATCH", "/api/features", { id: f.id, priority: "H" }, "viewer")).status, 403);
// jadikan fitur baru dari temuan; area di luar daftar ditolak
const ev3 = insertPending(SB, "playstore", "[Baru] Pro Chart di Company Page");
assert.equal((await call("POST", "/api/evidence/verify", { id: ev3, action: "new", name: "Pro Chart", area: "Kripto", launched_at: "2026-11-01" }, "editor")).status, 400);
assert.equal((await call("POST", "/api/evidence/verify", { id: ev3, action: "new", name: "Pro Chart", area: "Saham", launched_at: "2026-11-01" }, "editor")).status, 200);
// bukti ditolak tidak dihitung
const ev2 = insertPending(IP, "appstore", "x");
assert.equal((await call("POST", "/api/evidence/verify", { id: ev2, action: "reject" }, "editor")).status, 200);
assert.equal(env.DB.db.prepare("SELECT status FROM ft_evidence WHERE id=?").get(ev2).status, "Ditolak");
[, list] = await j(call("GET", "/api/features?area=Saham", null, "viewer"));
assert.deepEqual(list.features.map((x) => [x.name, x.has]), [["Pro Chart", { [SB]: "2026-11-01" }]], "filter area; ditolak tidak dihitung");
[, list] = await j(call("GET", "/api/features?decision=Kejar&priority=H", null, "viewer"));
assert.deepEqual(list.features.map((x) => x.name), ["Auto Invest"]);
const [, pend] = await j(call("GET", "/api/evidence?status=Perlu%20verifikasi", null, "viewer"));
assert.equal(pend.evidence.length, 0);
const [, det] = await j(call("GET", "/api/features/" + f.id, null, "viewer"));
assert.equal(det.feature.name, "Auto Invest"); assert.equal(det.evidence.length, 2);
// gambar bukti: hanya data:image png/jpeg/webp
assert.equal((await call("POST", "/api/evidence", { competitor_id: IP, name: "Y", area: "Saham", launched_at: "2026-10-01", image_data: "data:text/html;base64,PGI+" }, "editor")).status, 400);
assert.equal((await call("POST", "/api/evidence", { competitor_id: IP, name: "Y", area: "Saham", launched_at: "2026-10-01", image_data: "data:image/png;base64,iVBORw0KGgo=" }, "editor")).status, 200);
// kompetitor: hanya admin
assert.equal((await call("POST", "/api/competitors", { name: "Ajaib" }, "editor")).status, 403);
assert.equal((await call("POST", "/api/competitors", { name: "Ajaib", enabled: 0 }, "admin")).status, 200);
assert.equal((await call("POST", "/api/competitors", { id: SB, name: "Stockbit", ig_account: "stockbit", play_id: "com.stockbit.android", appstore_id: "1184800207", enabled: 1 }, "admin")).status, 200);
const [, comps] = await j(call("GET", "/api/competitors", null, "viewer"));
assert.deepEqual(comps.competitors.map((c) => [c.name, c.enabled]).sort(), [["Ajaib", 0], ["IPOT", 1], ["Stockbit", 1]]);

/* ---------- Task 3: scan IG (ci_content), App Store, Play Store ---------- */
const { ftIsBugfixOnly, ftAppStore, ftPlayNotes, ftAiVerdict, ftAiFeatures, ftHash, ftScan } = await import("./worker.js");
assert.equal(ftIsBugfixOnly("Perbaikan bug dan peningkatan performa."), true);
assert.equal(ftIsBugfixOnly("Bug fixes and performance improvements"), true);
assert.equal(ftIsBugfixOnly("Kami memperbaiki beberapa bug & meningkatkan stabilitas aplikasi"), true);
assert.equal(ftIsBugfixOnly(""), true);
assert.equal(ftIsBugfixOnly("Fitur baru: Auto Invest reksa dana. Perbaikan bug."), false);
assert.deepEqual(ftAppStore({ results: [{ version: "5.2.0", releaseNotes: "Auto Invest", currentVersionReleaseDate: "2026-10-03T07:00:00Z" }] }), { version: "5.2.0", notes: "Auto Invest", date: "2026-10-03" });
assert.equal(ftAppStore({ results: [] }), null);
assert.equal(ftAppStore(null), null);
const PLAY = (notes) => `<html><section><header><h2 class="XfZNbf">Yang baru</h2></header><div class="SfzRHd"><div itemprop="description">${notes}</div></div></section><div itemprop="description">Deskripsi aplikasi</div></html>`;
assert.equal(ftPlayNotes(PLAY("Yang Baru di Versi ini:<br>•  [Baru] Pro Chart<br>•  Sector &amp; Industry")), "Yang Baru di Versi ini:\n•  [Baru] Pro Chart\n•  Sector & Industry");
assert.equal(ftPlayNotes("<html>tidak ada</html>"), "");
assert.deepEqual(ftAiVerdict("bukan json"), { feature: false });
assert.deepEqual(ftAiVerdict('{"feature":false}'), { feature: false });
assert.equal(ftAiVerdict('{"feature":true,"name":"X","area":"Kripto","description":"d"}').area, "Lainnya");
assert.deepEqual(ftAiVerdict('{"feature":true,"area":"Saham"}'), { feature: false }, "tanpa nama bukan fitur");
assert.deepEqual(ftAiFeatures('```json\n{"features":[{"name":"Pro Chart","area":"Saham","description":"d","merge_id":"f1"},{"name":""}]}\n```'), [{ name: "Pro Chart", area: "Saham", description: "d", merge_id: "f1" }]);
assert.deepEqual(ftAiFeatures("{rusak"), []);
assert.notEqual(ftHash("stockbit", "ig", "a"), ftHash("ipot", "ig", "a"));

// AI palsu (Workers AI): IG -> fitur bila caption menyebut "Fitur"; catatan rilis -> satu fitur per baris "[Baru]"
let aiCalls = 0;
env.AI = { run: async (model, { messages }) => {
  aiCalls++;
  const u = messages[1].content;
  if (/Catatan rilis/.test(u)) return { response: JSON.stringify({ features: [...u.matchAll(/\[Baru\] ([^\n]+)/g)].map((x) => ({ name: x[1].trim(), area: "Saham", description: "Fitur " + x[1].trim() + " dari catatan rilis" })) }) };
  return { response: /Fitur/.test(u.split("Caption:")[1]) ? JSON.stringify({ feature: true, name: "Auto Invest", area: "Reksa Dana", description: "Investasi rutin otomatis dari caption" }) : JSON.stringify({ feature: false, reason: "promo atau edukasi, bukan fitur" }) };
} };
let ciN = 0;
const seedContent = (rows) => { for (const r of rows) env.DB.db.prepare("INSERT INTO ci_content (id, url, platform, account, caption, posted_at, saved_at) VALUES (?, ?, 'Instagram', ?, ?, ?, ?)").run("c" + ++ciN, "https://instagram.com/p/" + ciN, r.account, r.caption, r.posted_at || "2026-10-30T10:00:00Z", r.saved_at); };
let storeVersion = "5.2.0", storeNotes = "Fitur baru:\n[Baru] Auto Invest", playNotes = "Yang Baru:<br>[Baru] Pro Chart di Company Page<br>[Baru] Trade Summary";
const fakeStores = async (url) => {
  if (/itunes\.apple\.com\/lookup/.test(url)) return Response.json({ results: [{ version: storeVersion, releaseNotes: storeNotes, currentVersionReleaseDate: "2026-10-03T07:00:00Z" }] });
  if (/play\.google\.com/.test(url)) return new Response(PLAY(playNotes));
  return new Response("?", { status: 404 });
};
const pending = () => env.DB.db.prepare("SELECT competitor_id, source, text, launched_at, ai_json FROM ft_evidence WHERE status='Perlu verifikasi' ORDER BY source, competitor_id").all();
seedContent([{ account: "Stockbit", caption: "Fitur baru Auto Invest sudah hadir!", saved_at: "2026-11-01T00:00:00Z" },
             { account: "stockbit", caption: "Promo cashback akhir bulan", saved_at: "2026-11-01T00:01:00Z" },
             { account: "akunlain", caption: "Fitur baru", saved_at: "2026-11-01T00:02:00Z" }]);
const r1 = await ftScan(env, { fetcher: fakeStores });
assert.equal(r1.ig.n, 1, "hanya akun kompetitor (huruf besar/kecil sama) dan hanya caption fitur");
assert.equal(r1.appstore.n, 2, "Stockbit & IPOT masing-masing 1 fitur dari App Store");
assert.equal(r1.playstore.n, 4, "2 kompetitor × 2 fitur Play Store");
const igRow = pending().find((r) => r.source === "ig");
assert.equal(igRow.competitor_id, "stockbit"); assert.equal(igRow.launched_at, "2026-10-30");
assert.equal(JSON.parse(igRow.ai_json).name, "Auto Invest");
const r2 = await ftScan(env, { fetcher: fakeStores });                  // jalan ulang
assert.deepEqual([r2.ig.n, r2.appstore.n, r2.playstore.n], [0, 0, 0], "tidak ada duplikat");
// versi baru yang isinya hanya perbaikan bug dilewati
storeVersion = "5.2.1"; storeNotes = "Perbaikan bug dan peningkatan performa.";
assert.equal((await ftScan(env, { fetcher: fakeStores })).appstore.n, 0);
// Play Store gagal / diblokir tidak menggagalkan sumber lain; status tersimpan per sumber
const r3 = await ftScan(env, { fetcher: (u) => /play\.google/.test(u) ? Promise.reject(new Error("blocked")) : fakeStores(u) });
assert.match(r3.playstore.error, /blocked/); assert.ok(!r3.appstore.error); assert.ok(!r3.ig.error);
const [, scanSt] = await j(call("GET", "/api/scan", null, "viewer"));
assert.match(scanSt.playstore.error, /blocked/); assert.ok(scanSt.ig.at);
// batas AI harian: tidak ada panggilan AI, penanda IG tidak maju (dicoba lagi nanti)
env.FT_AI_DAILY = "0"; aiCalls = 0;
seedContent([{ account: "stockbit", caption: "Fitur lain", saved_at: "2026-11-02T00:00:00Z" }]);
assert.equal((await ftScan(env, { fetcher: fakeStores })).ig.n, 0);
assert.equal(aiCalls, 0);
delete env.FT_AI_DAILY;
assert.equal((await ftScan(env, { fetcher: fakeStores })).ig.n, 1, "setelah kuota ada lagi, caption yang tertunda diproses");
// tombol Scan sekarang: hanya admin
assert.equal((await call("POST", "/api/scan", {}, "editor")).status, 403);

// jadwal: hanya Minggu; mulai 01:00 UTC; :30 berikutnya hanya melanjutkan IG yang tertunda
const cron = (iso) => worker.fetch(new Request(`${BASE}/__cron?t=${Date.parse(iso)}`, { method: "POST", headers: { "x-cron-key": SECRET } }), env, {});
const igAt = () => JSON.parse(env.DB.db.prepare("SELECT v FROM ft_meta WHERE k='scan_ig'").get().v).at;
const before = igAt();
assert.equal((await cron("2026-11-09T01:00:00Z")).status, 200);        // Senin
assert.equal(igAt(), before, "Senin tidak scan");
await cron("2026-11-08T00:30:00Z");                                     // Minggu sebelum jam mulai
assert.equal(igAt(), before);
await cron("2026-11-08T01:00:00Z");                                     // Minggu 08.00 WIB
assert.notEqual(igAt(), before, "Minggu 01:00 UTC scan");

/* ---------- Task 4: BRD (kerangka tetap, draf AI, kolom manusia dikunci) ---------- */
const { BRD_KEYS, brdSkeleton, brdParse } = await import("./brd.js");
assert.deepEqual(BRD_KEYS, ["ringkasan", "tujuan", "ruang_lingkup", "kebutuhan", "definisi", "keamanan", "pemangku", "kendala", "tambahan", "jadwal", "open_items", "lampiran"]);
const F = { id: "f1", name: "Auto Invest", area: "Reksa Dana", description: "Beli rutin", ikisi_status: "Belum ada", priority: "H" };
const E = { feature_id: "f1", competitor: "Stockbit", launched_at: "2026-10-01", url: "https://stockbit.com/x", source: "manual" };
const sk = brdSkeleton({ title: "Auto Invest", features: [F], evidence: [E] });
assert.equal(sk.identitas.no_dokumen, "IT-BRD-2026-___ (akan ditetapkan)");
assert.equal(sk.identitas.tanggal, "___");
assert.equal(sk.identitas.versi, "1.0 – Draft untuk direview");
assert.equal(sk.identitas.disusun_oleh, "Product / Business Analyst – Divisi Digital Business");
assert.equal(sk.jadwal.length, 8); assert.equal(sk.pemangku.length, 10);
assert.ok(sk.pemangku.every((x) => x.jabatan && x.tugas && !("nama" in x)), "nama pemangku tidak diisi");
assert.match(sk.lampiran.at(-1), /^Lampiran E – Referensi Kompetitor: .*Stockbit.*2026-10-01/);
assert.match(sk.ringkasan.at(-1), /Stockbit/, "satu kalimat referensi kompetitor di Ringkasan Eksekutif");
assert.ok(sk.kebutuhan.length >= 2 && sk.kebutuhan.every((m) => m.tetap), "modul Data & Integrasi + Non-Fungsional tetap");
assert.ok(sk.keamanan.some((x) => /TLS 1\.2/.test(x)));
const p = brdParse(JSON.stringify({ identitas: { no_dokumen: "IT-BRD-2026-077", tanggal: "1 Nov 2026", nama_proyek: "Investasi Berkala Reksa Dana" },
  ringkasan: ["Paragraf AI."],
  kebutuhan: [{ modul: "Modul 1 – Auto Invest", rows: [{ id: "X", pri: "Z", text: "Harus ada <jadwal> & \"pause\"" }, { text: "" }] }],
  jadwal: [{ fase: "1", aktivitas: "x", durasi: "10", target: "1 Des" }], pemangku: [{ nama: "Budi", jabatan: "PM", tugas: "x" }], hacker: 1 }), sk);
assert.equal(p.identitas.no_dokumen, sk.identitas.no_dokumen);
assert.equal(p.identitas.tanggal, "___");
assert.equal(p.identitas.nama_proyek, "Investasi Berkala Reksa Dana");
assert.deepEqual(p.kebutuhan[0], { modul: "Modul 1 – Auto Invest", rows: [{ id: "BR-1.1", pri: "M", text: "Harus ada <jadwal> & \"pause\"" }] });
assert.equal(p.kebutuhan.length, sk.kebutuhan.length + 1, "modul tetap tetap ada");
assert.match(p.kebutuhan[1].rows[0].id, /^BR-2\.1$/, "modul tetap dinomori ulang");
assert.deepEqual(p.jadwal, sk.jadwal); assert.deepEqual(p.pemangku, sk.pemangku);
assert.deepEqual(p.ringkasan, ["Paragraf AI.", sk.ringkasan.at(-1)]);
assert.deepEqual(brdParse(JSON.stringify(p), sk).ringkasan, p.ringkasan, "kalimat kompetitor tidak dobel saat disimpan ulang");
assert.deepEqual(brdParse(JSON.stringify(p), sk).kebutuhan, p.kebutuhan, "simpan ulang tidak menggandakan modul tetap");
assert.equal("hacker" in p, false);
assert.deepEqual(brdParse("{rusak", sk), sk);
// API: viewer tidak boleh membuat; status di luar daftar ditolak; draf AI
assert.equal((await call("POST", "/api/brds", { title: "x", feature_ids: [f.id] }, "viewer")).status, 403);
assert.equal((await call("POST", "/api/brds", { title: "x", feature_ids: ["tidakada"] }, "editor")).status, 400);
const [bs, brd] = await j(call("POST", "/api/brds", { title: "Auto Invest", feature_ids: [f.id], brief: { modul: "Reksa Dana", catatan: "Debet RDN", target: "Nasabah ritel" } }, "editor"));
assert.equal(bs, 200, JSON.stringify(brd));
assert.equal((await call("PATCH", "/api/brds", { id: brd.id, status: "Selesai" }, "editor")).status, 400);
assert.equal((await call("PATCH", "/api/brds", { id: brd.id, status: "Diserahkan ke IT", version: "1.1 – Revisi IT" }, "editor")).status, 200);
let [, one] = await j(call("GET", "/api/brds/" + brd.id, null, "viewer"));
assert.equal(one.brd.status, "Diserahkan ke IT"); assert.equal(one.brd.sections.identitas.versi, "1.1 – Revisi IT");
assert.match(one.brd.sections.lampiran.at(-1), /Stockbit.*2026-10-01/);
env.AI = { run: async () => ({ response: JSON.stringify({ ringkasan: ["Ringkasan dari AI untuk Auto Invest."], tujuan: ["Tujuan A"], identitas: { no_dokumen: "IT-BRD-2026-001" } }) }) };
const [ds, dr] = await j(call("POST", "/api/brds/draft", { id: brd.id }, "editor"));
assert.equal(ds, 200, JSON.stringify(dr));
assert.equal(dr.sections.ringkasan[0], "Ringkasan dari AI untuk Auto Invest.");
assert.equal(dr.sections.identitas.no_dokumen, "IT-BRD-2026-___ (akan ditetapkan)");
env.AI = { run: async () => ({ response: JSON.stringify({ tujuan: ["Tujuan B saja, bagian lain tidak berubah"] }) }) };
const [, dk] = await j(call("POST", "/api/brds/draft", { id: brd.id, key: "tujuan" }, "editor"));
assert.deepEqual(dk.sections.tujuan, ["Tujuan B saja, bagian lain tidak berubah"]);
assert.equal(dk.sections.ringkasan[0], "Ringkasan dari AI untuk Auto Invest.", "tulis ulang satu bagian tidak menyentuh bagian lain");
assert.equal((await call("POST", "/api/brds/draft", { id: brd.id, key: "jadwal" }, "editor")).status, 400, "bagian terkunci tidak ditulis AI");
const [, blist] = await j(call("GET", "/api/brds", null, "viewer"));
assert.deepEqual(blist.brds.map((x) => [x.title, x.status, x.feature_names]), [["Auto Invest", "Diserahkan ke IT", ["Auto Invest"]]]);

console.log("feature-intel: semua tes lolos");
