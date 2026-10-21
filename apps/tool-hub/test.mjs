// Cek Tool Hub: dashboard, hak akses, favorit, ringkasan "Hari ini" dari Market Recap, Content Planner, Fund Insight,
// Competitor Intelligence, Edukasi Studio, dan status cron (lewat service binding, shared/hubfeed.js). Jalankan: node apps/tool-hub/test.mjs   (Node 22.15+)
// KV & GitHub ditiru di memori; D1 ditiru dengan node:sqlite, jadi query ringkasan benar-benar dijalankan.
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

// worker mengimpor halaman .html sebagai teks (seperti wrangler)
registerHooks({
  load(url, ctx, next) {
    if (url.startsWith("file:") && url.endsWith(".html")) return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(fs.readFileSync(fileURLToPath(url), "utf8")) };
    return next(url, ctx);
  },
});
const { default: hub, hashPw, rhythm } = await import("./worker.js");
const { default: recap } = await import("../market-recap/worker.js");
const { default: planner } = await import("../content-planner/worker.js");
const { default: fund } = await import("../fund-insight/worker.js");
const { default: competitor } = await import("../competitor-intel/worker.js");
const { default: edukasi } = await import("../edukasi-studio/worker.js");
const { default: cron } = await import("../cron/worker.js");

/* ---------- tiruan ---------- */
function kv() {
  const m = new Map();
  return {
    m,
    async get(k, t) { const x = m.get(k); return x == null ? null : t === "json" ? JSON.parse(x.v) : x.v; },
    async put(k, v, o = {}) { m.set(k, { v: String(v), meta: o.metadata }); },
    async delete(k) { m.delete(k); },
    async list({ prefix = "" } = {}) { return { keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, x]) => ({ name, metadata: x.meta })), list_complete: true }; },
  };
}
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
  });
  return { db, prepare: (sql) => st(sql), batch: async (list) => { const out = []; for (const x of list) out.push(await x.all()); return out; } };
}
const SECRET = "s".repeat(40), ADMIN = "admin@acme.test", HUB = "https://hub.acme.test";
const IDS = ["email", "story", "fund", "competitor", "content", "edukasi", "bond", "etf", "recap", "planner", "sats", "tutorial"];
const PROFILE = JSON.stringify({ urls: Object.fromEntries([["hub", HUB], ...IDS.map((id) => [id, `https://${id}.acme.test`])]), github: { repo: "acme/tools" }, brand: { short: "Acme" } });
const recapEnv = { SSO_SECRET: SECRET, DB: d1(), PROFILE, HUB_URL: HUB };
const plannerEnv = { SSO_SECRET: SECRET, DB: d1(), PROFILE, HUB_URL: HUB };
const fundEnv = { SSO_SECRET: SECRET, DB: d1(), PROFILE, HUB_URL: HUB };
const compEnv = { SSO_SECRET: SECRET, DB: d1(), PROFILE, HUB_URL: HUB };
const eduEnv = { SSO_SECRET: SECRET, DB: d1(), PROFILE, HUB_URL: HUB };
const cronEnv = { SSO_SECRET: SECRET, DB: d1() };
const bind = (w, e) => ({ fetch: (u, init) => w.fetch(new Request(u, init), e, { waitUntil() { } }) });
const env = { ADMIN_EMAILS: ADMIN, SSO_SECRET: SECRET, HUB_KV: kv(), PROFILE, HUB_URL: HUB, GITHUB_REPO: "acme/tools", RECAP: bind(recap, recapEnv), PLANNER: bind(planner, plannerEnv),
  FUND: bind(fund, fundEnv), COMPETITOR: bind(competitor, compEnv), EDUKASI: bind(edukasi, eduEnv), CRON: bind(cron, cronEnv) };

let ghCalls = 0, stepCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => {
  const url = String((u && u.url) || u);
  if (url.startsWith("https://api.github.com/repos/acme/tools/actions/runs/101/jobs")) {
    stepCalls++;
    return Response.json({ jobs: [{ name: "pdf", conclusion: "failure", steps: [{ name: "Checkout", conclusion: "success" }, { name: "Ambil alamat", conclusion: "failure" }, { name: "Buat PDF", conclusion: "skipped" }] }] });
  }
  if (url.startsWith("https://api.github.com/repos/acme/tools/actions/runs")) {
    ghCalls++;
    const run = (wid, id, name, status, conclusion, at) => ({ workflow_id: wid, id, name, status, conclusion, updated_at: at, html_url: `https://github.com/acme/tools/actions/runs/${id}`, event: "schedule" });
    return Response.json({ workflow_runs: [
      run(2, 201, "Deploy", "in_progress", null, "2026-10-20T01:05:00Z"),
      run(1, 101, "Buat PDF produk", "completed", "failure", "2026-10-20T00:31:40Z"),
      run(3, 301, "Data Story", "completed", "success", "2026-10-20T00:20:00Z"),
      run(1, 100, "Buat PDF produk", "completed", "success", "2026-10-16T09:03:00Z"),   // lebih lama: diabaikan
    ] });
  }
  if (url.startsWith("https://raw.githubusercontent.com/")) return new Response("tidak ada", { status: 404 });   // agenda otomatis Fund Insight
  return realFetch(u, init);
};

/* ---------- pembantu ---------- */
async function call(path, { method = "GET", cookie = "", form, json, origin } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  let body;
  if (form) { body = new URLSearchParams(form); headers["content-type"] = "application/x-www-form-urlencoded"; }
  if (json !== undefined) { body = JSON.stringify(json); headers["content-type"] = "application/json"; }
  return hub.fetch(new Request(HUB + path, { method, headers, body, redirect: "manual" }), env);
}
const cookieOf = (r) => (r.headers.get("set-cookie") || "").split(";")[0];
const bootOf = (html) => {
  const m = /window\.HUB=(.*?);<\/script>/s.exec(html);
  if (!m) throw new Error("data dashboard tidak ditemukan:\n" + html.slice(0, 400));
  return JSON.parse(m[1]);
};
const wib = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const plus = (n) => { const d = new Date(wib + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* ---------- admin: dashboard lengkap ---------- */
assert.doesNotMatch(await (await call("/daftar")).text(), /name="job"/, "role pekerjaan tidak dipilih saat daftar (ditentukan admin)");
const reg = await call("/daftar", { method: "POST", form: { name: "Dewi </script><b>x", email: ADMIN, password: "rahasia-123", job: "partnership" } });
assert.equal(reg.status, 303);
assert.equal(JSON.parse(env.HUB_KV.m.get("u:" + ADMIN).v).job, undefined, "isian job dari formulir daftar diabaikan");
{ const x = env.HUB_KV.m.get("u:" + ADMIN), rec = JSON.parse(x.v); rec.job = "partnership"; x.v = JSON.stringify(rec); x.meta = { ...(x.meta || {}), job: "partnership" }; }   // seperti diatur admin (isi + metadata daftar)
const admin = cookieOf(reg);
assert.match(admin, /^hub_sess=/);

let r = await call("/", { cookie: admin });
assert.equal(r.status, 200);
let html = await r.text(), boot = bootOf(html);
assert.equal(boot.apps.length, 12, "admin melihat semua 12 tool");
assert.deepEqual(boot.apps.map((a) => a.id).sort(), [...IDS].sort());
for (const a of boot.apps) {
  assert.ok(boot.cats[a.cat], `${a.id}: kategori sah`);
  assert.ok(a.icon && a.blurb && a.features.length, `${a.id}: ikon, ringkasan, dan fitur terisi`);
  assert.ok(a.src, `${a.id}: punya alamat buka`);
}
assert.deepEqual(boot.apps.filter((a) => a.ai).map((a) => a.id).sort(), ["edukasi", "recap"], "AI Workbench hanya tool yang memang memakai AI");
assert.deepEqual(boot.today, { recap: true, planner: true, fund: true, competitor: true, edukasi: true, jobs: true, cron: true, rhythm: true });
assert.deepEqual(boot.fav, []);
assert.equal(boot.me.admin, true);
assert.equal(boot.me.job, "Partnership");
// admin hub tidak wajib memilih role pekerjaan
{ const rec = JSON.parse(env.HUB_KV.m.get("u:" + ADMIN).v), job = rec.job; delete rec.job; env.HUB_KV.m.get("u:" + ADMIN).v = JSON.stringify(rec);
  assert.equal((await call("/", { cookie: admin })).status, 200, "admin tanpa role tetap langsung ke beranda");
  assert.equal((await call("/api/today", { cookie: admin })).status, 200);
  rec.job = job; env.HUB_KV.m.get("u:" + ADMIN).v = JSON.stringify(rec); }
assert.equal(boot.apps.find((a) => a.id === "recap").lvl, "Admin");
assert.equal(boot.apps.find((a) => a.id === "story").lvl, "Semua tab");
assert.equal(boot.apps.find((a) => a.id === "fund").src, "/sso?app=fund&back=" + encodeURIComponent("https://fund.acme.test/"), "tool tetap dibuka lewat SSO");
assert.equal(boot.apps.find((a) => a.id === "sats").src, "/sso?app=sats&back=" + encodeURIComponent("https://sats.acme.test/api/auth/hub?to=%2F"));
assert.match(html, /<title>Acme Tool Hub<\/title>/);
assert.ok(!html.includes("</script><b>"), "nama pengguna tidak bisa menutup tag script");
assert.ok(!html.includes('id="hub-theme-toggle"'), "tombol tema lama tidak ikut disuntikkan");

/* ---------- ringkasan Hari ini ---------- */
r = await call("/api/today", { cookie: admin });   // juga membuat tabel di kedua tool
assert.equal(r.status, 200);
recapEnv.DB.db.prepare("INSERT INTO recaps (date, session, data, narrative, status) VALUES (?, 's1', ?, ?, 'published')").run(wib, JSON.stringify({ ihsg: { pct: 0.42 } }), "IHSG naik tipis\nisi rangkuman");
const item = plannerEnv.DB.db.prepare("INSERT INTO items (id, date, title, kind, status, owner_email, time, d_need, d_who, d_status) VALUES (?, ?, ?, 'konten', ?, ?, ?, ?, ?, ?)");
item.run("a", wib, "Story pagi", "draf", "lain@acme.test", "08:00", 0, "", "");
item.run("b", plus(1), "Artikel ETF", "draf", ADMIN, "", 0, "", "");
item.run("c", plus(2), "Sudah terbit", "terbit", ADMIN, "", 0, "", "");
item.run("d", plus(20), "Di luar 7 hari", "ide", ADMIN, "", 0, "", "");
item.run("e", plus(3), "Banner webinar", "ide", "lain@acme.test", "", 1, ADMIN, "proses");
item.run("f", plus(3), "Banner selesai", "ide", "lain@acme.test", "", 1, ADMIN, "selesai");
item.run("g", plus(3), "Banner orang lain", "ide", "lain@acme.test", "", 1, "lain@acme.test", "belum");

// Fund Insight: NAB terakhir kemarin; 2576 (saham) turun 7x gerak biasanya, 2567 normal, 4110 datanya tertinggal (dilewati)
const yday = plus(-1), stabRow = (rec) => ({ n: 238, sd: 1, avg: 1, down: 1, worst: -1, sdd: 1.2, rec });
fundEnv.DB.db.exec("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)");
const fmeta = fundEnv.DB.db.prepare("INSERT OR REPLACE INTO meta VALUES (?, ?)");
fmeta.run("latest", JSON.stringify({ at: "2026-10-20T02:35:00Z", funds: { 2576: { navDate: yday }, 2567: { navDate: yday }, 4110: { navDate: plus(-9) } } }));
fmeta.run("stab", JSON.stringify({ 2576: stabRow([[plus(-2), 0.4, 0.3], [yday, -8.5, -7.1]]), 2567: stabRow([[yday, 0.02, 0.4]]), 4110: stabRow([[plus(-9), -3, -9]]) }));
fmeta.run("agenda", JSON.stringify([{ id: "x1", d: wib, t: "Webinar reksa dana", k: "internal", by: "Dewi" }, { id: "x2", d: plus(10), t: "Terlalu jauh", k: "internal" }]));
// Competitor: 2 promo baru sejak kemarin (satu tidak relevan, tidak dihitung), 1 promo lama
const ciRow = (id, title, seen, status) => compEnv.DB.db.prepare("INSERT INTO ci_programs (id, title, platform, category, source_url, discovered_at, first_seen, status) VALUES (?, ?, 'Bibit', 'Reksa dana', 'https://x.test', ?, ?, ?)").run(id, title, seen, seen, status);
const iso = (d) => new Date(Date.now() - d * 3600e3).toISOString();
ciRow("p1", "Cashback 50 ribu", iso(1), "Perlu verifikasi");
ciRow("p2", "Bunga spesial", iso(2), "Aktif");
ciRow("p3", "Bukan promo", iso(1), "Tidak relevan");
ciRow("p4", "Promo lama", iso(24 * 10), "Aktif");
// Edukasi: draf 7 hari terakhir (satu milik admin) + satu draf lama; satu artikel sumber hari ini
const dr = eduEnv.DB.db.prepare("INSERT INTO drafts (format, title, body, author, created_at) VALUES (?, ?, 'isi', ?, ?)");
dr.run("web", "Apa itu reksa dana pasar uang", ADMIN, Date.now() - 3600e3);
dr.run("feed", "5 mitos investasi", "lain@acme.test", Date.now() - 2 * 864e5);
dr.run("story", "Draf lama", ADMIN, Date.now() - 9 * 864e5);
eduEnv.DB.db.prepare("INSERT INTO articles (url, title, scraped_at) VALUES ('https://a.test/1', 'Sumber', ?)").run(Date.now());
// Cron: jalan Senin 09:05 WIB (02:05 UTC): Fund berhasil, Story Data gagal
const okB = { fetch: async () => new Response("ok") }, failB = { fetch: async () => new Response("x", { status: 500 }) };
Object.assign(cronEnv, { FUND: okB, COMPETITOR: okB, EDUKASI: okB, STORYDATA: failB, SATS: okB, RECAP: okB, CONTENT: okB });
const cronAt = Date.UTC(2026, 9, 19, 2, 5);   // waktu tetap: Senin 09:05 WIB = slot Fund + Story Data
await assert.rejects(cron.scheduled({ scheduledTime: cronAt }, cronEnv), /^Error: STORYDATA: HTTP 500$/);

r = await call("/api/today", { cookie: admin });
const t = await r.json();
assert.equal(t.recap.ok, true, JSON.stringify(t.recap));
assert.equal(t.recap.data.date, wib);
assert.deepEqual(t.recap.data.sessions.map((s) => [s.session, s.status, s.title || "", s.pct ?? null]), [["s1", "published", "IHSG naik tipis", 0.42], ["close", "none", "", null]]);
assert.equal(t.recap.data.last, null);
assert.equal(t.planner.ok, true, JSON.stringify(t.planner));
assert.deepEqual(t.planner.data.today.map((x) => x.id), ["a"]);
assert.deepEqual(t.planner.data.mine.map((x) => x.id), ["b"], "milik pengguna: 7 hari ke depan, belum selesai");
assert.deepEqual(t.planner.data.design.map((x) => x.id), ["e"], "tugas desain: hanya untuk pengguna ini dan belum selesai");
assert.equal(t.jobs.ok, true);
assert.deepEqual(t.jobs.data.runs.map((x) => [x.name, x.state, x.step]), [["Buat PDF produk", "err", "Ambil alamat"], ["Deploy", "run", ""], ["Data Story", "ok", ""]], "langkah yang gagal ikut tampil");
assert.ok(t.jobs.data.runs.every((x) => !("id" in x)));
const calls = ghCalls;
await call("/api/today", { cookie: admin });
assert.equal(ghCalls, calls, "status GitHub disimpan sebentar, tidak diminta ulang tiap muat");
assert.equal(stepCalls, 1, "langkah gagal dibaca sekali per run");

assert.equal(t.fund.ok, true, JSON.stringify(t.fund));
assert.equal(t.fund.data.moves.nav, yday);
assert.equal(t.fund.data.moves.n, 1, "hanya produk dengan NAB terbaru yang dihitung");
assert.deepEqual(t.fund.data.moves.dev.map((x) => [x.pid, x.chg, x.z]), [["2576", -8.5, -7.1]]);
assert.equal(t.fund.data.moves.prev, null);
assert.deepEqual(t.fund.data.agenda.map((x) => x.t), ["Webinar reksa dana"], "agenda hari ini sampai lusa saja");
assert.equal(t.competitor.ok, true, JSON.stringify(t.competitor));
assert.deepEqual([t.competitor.data.n, t.competitor.data.review, t.competitor.data.active], [2, 1, 2]);
assert.deepEqual(t.competitor.data.items.map((x) => x.id), ["p1", "p2"], "promo baru, terbaru dulu, tanpa yang tidak relevan");
assert.equal(t.edukasi.ok, true, JSON.stringify(t.edukasi));
assert.deepEqual([t.edukasi.data.n, t.edukasi.data.mine, t.edukasi.data.articles], [2, 1, 1]);
assert.deepEqual(t.edukasi.data.drafts.map((x) => x.title), ["Apa itu reksa dana pasar uang", "5 mitos investasi"]);
assert.ok(t.edukasi.data.drafts.every((x) => !("body" in x)), "isi draf tidak ikut dikirim");
assert.equal(t.cron.ok, true, JSON.stringify(t.cron));
const runsBy = Object.fromEntries(t.cron.data.runs.map((x) => [x.job, x]));
assert.equal(runsBy._cron.at, cronAt);
assert.match(runsBy.STORYDATA.err, /HTTP 500/);
assert.equal(runsBy.STORYDATA.ok_at, null);
// jalan berikutnya berhasil: pesan gagal hilang, waktu gagal terakhir tetap tercatat
cronEnv.STORYDATA = okB;
await cron.scheduled({ scheduledTime: cronAt + 5 * 60e3 }, cronEnv);
const runs2 = Object.fromEntries((await (await call("/api/today", { cookie: admin })).json()).cron.data.runs.map((x) => [x.job, x]));
assert.equal(runs2.STORYDATA.err, null);
assert.equal(runs2.STORYDATA.ok_at, cronAt + 5 * 60e3);
assert.equal(runs2.FUND.ok_at, cronAt, "tugas yang tidak jalan di slot ini tetap menyimpan catatan lamanya");
assert.equal(runs2._cron.at, cronAt + 5 * 60e3);
assert.equal(runs2.STORYDATA.err_at, cronAt);
assert.equal(t.rhythm.ok, true, JSON.stringify(t.rhythm));
assert.ok(t.rhythm.data.steps.some((s) => s.id === "plan:a"), "kegiatan Planner berjam ikut di garis waktu");

/* ---------- Ritme hari ini (fungsi murni, jam tetap) ---------- */
{
  const W = (s) => Date.parse(s + "+07:00"), all = () => true;
  const P = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ok: true, data: v }]));
  const parts = (date, recapSt = "none") => P({
    jobs: { today: [
      { wf: "story-data.yml", state: "ok", at: W(date + "T00:03:00"), url: "u-cal" },
      { wf: "pdf.yml", state: "err", at: W(date + "T07:02:00"), url: "u-pdf", step: "Ambil alamat" },
    ] },
    fund: { at: new Date(W(date + "T09:06:00")).toISOString() },
    recap: { date, sessions: [{ session: "s1", status: recapSt }, { session: "close", status: "none" }] },
    planner: { kinds: { konten: "Konten sosmed" }, today: [
      { id: "a", time: "08:00", title: "Story pagi", kind: "konten", channel: "IG Story", status: "terbit" },
      { id: "b", time: "10:30", title: "Artikel ETF", kind: "artikel", status: "draf" },
      { id: "c", time: "", title: "Tanpa jam", status: "ide" },
    ] },
  });
  const by = (R) => Object.fromEntries(R.steps.map((s) => [s.id, [s.state, s.note]]));
  let R = rhythm(W("2026-10-19T12:30:00"), parts("2026-10-19"), all), s = by(R);   // Senin
  assert.equal(R.now, "12.30"); assert.equal(R.bourse, true); assert.equal(R.untimed, 1);
  assert.deepEqual(s.cal, ["ok", "Selesai 00.03"]);
  assert.deepEqual(s.pdf, ["err", "Gagal di Ambil alamat · 07.02"]);
  assert.deepEqual(s.nav1, ["ok", "Selesai 09.06"]);
  assert.deepEqual(s.s1, ["due", "Sedang disusun otomatis"]);
  assert.deepEqual(s.wrap, ["wait", "Dijadwalkan 16.50"]);
  assert.equal(s.nav2[0], "wait");
  assert.deepEqual(s["plan:a"], ["ok", "Terbit"]);
  assert.deepEqual(s["plan:b"], ["warn", "Masih draf"], "lewat 1 jam dari jadwal dan belum terbit");
  assert.deepEqual(R.steps.map((x) => x.at), ["00:00", "07:00", "08:00", "09:05", "10:30", "12:00", "16:50", "17:20", "17:20", "18:05"]);
  assert.equal(R.steps.find((x) => x.id === "pdf").url, "u-pdf");
  assert.deepEqual(by(rhythm(W("2026-10-19T14:00:00"), parts("2026-10-19"), all)).s1, ["err", "Belum ada hasil sampai 13.45"]);
  assert.deepEqual(by(rhythm(W("2026-10-19T14:00:00"), parts("2026-10-19", "draft"), all)).s1, ["warn", "Draf, belum terbit"]);
  assert.deepEqual(by(rhythm(W("2026-10-19T14:00:00"), parts("2026-10-19", "published"), all)).s1, ["ok", "Terbit"]);
  const pr = parts("2026-10-19", "published"); Object.assign(pr.recap.data.sessions[0], { title: "IHSG naik tipis", pct: 0.42 });
  const s1 = rhythm(W("2026-10-19T14:00:00"), pr, all).steps.find((x) => x.id === "s1");
  assert.deepEqual([s1.note, s1.sub], ["Terbit · IHSG +0,42%", "IHSG naik tipis"], "isi kartu Market Recap lama pindah ke Ritme");
  Object.assign(pr.recap.data.sessions[0], { status: "draft", pct: -0.18 });
  assert.equal(rhythm(W("2026-10-19T14:00:00"), pr, all).steps.find((x) => x.id === "s1").note, "Draf, belum terbit · IHSG -0,18%");
  // tanpa run Wrap setelah 16.00: run kalender pagi tidak dihitung sebagai Wrap
  assert.deepEqual(by(rhythm(W("2026-10-19T18:10:00"), parts("2026-10-19"), all)).wrap, ["err", "Belum ada hasil sampai 18.00"]);
  // catatan coba ulang hanya tampil selama langkah belum selesai
  {
    const sub = (R, id) => R.steps.find((x) => x.id === id).sub;
    assert.equal(sub(rhythm(W("2026-10-19T17:00:00"), parts("2026-10-19"), all), "wrap"), "Penutupan IDX, dicoba lagi 17.25");
    assert.equal(sub(rhythm(W("2026-10-19T17:00:00"), parts("2026-10-19"), all), "sats"), "Dicoba lagi 19.20 bila belum");
    const done = parts("2026-10-19");
    done.jobs.data.today.push({ wf: "story-data.yml", state: "ok", at: W("2026-10-19T17:25:00"), url: "u-wrap" }, { wf: "sats-eod.yml", state: "ok", at: W("2026-10-19T20:23:00"), url: "u-sats" });
    const Rd = rhythm(W("2026-10-19T21:00:00"), done, all);
    assert.equal(sub(Rd, "wrap"), "Penutupan IDX"); assert.equal(sub(Rd, "sats"), "");
  }
  // NAB pagi: kalau tarikan terakhir sudah tarikan sore, jam sore tidak ditampilkan sebagai jam selesai pagi
  {
    const ev = parts("2026-10-19"); ev.fund.data.at = new Date(W("2026-10-19T18:35:00")).toISOString();
    const s = by(rhythm(W("2026-10-19T21:00:00"), ev, all));
    assert.deepEqual(s.nav1, ["ok", "Selesai · data terbaru 18.35"]);
    assert.deepEqual(s.nav2, ["ok", "Selesai 18.35"]);
  }
  // Jumat: jeda siang 11.30–14.00
  R = rhythm(W("2026-10-23T11:40:00"), parts("2026-10-23"), all);
  assert.equal(R.steps.find((x) => x.id === "s1").at, "11:30"); assert.equal(by(R).s1[0], "due");
  // Sabtu: tanpa langkah bursa
  R = rhythm(W("2026-10-24T10:00:00"), parts("2026-10-24"), all);
  assert.equal(R.bourse, false);
  assert.deepEqual(R.steps.filter((x) => !x.planner).map((x) => x.id), ["pdf", "nav1", "nav2"]);
  // akses terbatas: hanya Fund Insight
  R = rhythm(W("2026-10-19T12:30:00"), parts("2026-10-19"), (id) => id === "fund");
  assert.deepEqual(R.steps.map((x) => x.id), ["pdf", "nav1", "nav2"]); assert.equal(R.planner, false);
  // status GitHub gagal dimuat: langkah GitHub abu-abu, bukan merah
  const p2 = parts("2026-10-19"); p2.jobs = { ok: false, error: "x" };
  assert.deepEqual(by(rhythm(W("2026-10-19T12:30:00"), p2, all)).pdf, ["muted", "Status GitHub tidak terbaca"]);
}

/* ---------- notifikasi tugas (disimpan di Content Planner, dibaca lewat hub) ---------- */
assert.ok(t.planner.data.notif && t.planner.data.notif.unread === 0, JSON.stringify(t.planner.data.notif));
plannerEnv.DB.db.prepare("INSERT INTO notifs (email, at, kind, title, body, item_id) VALUES (?, ?, 'task', 'Tugas baru: Visual banner', 'Program X', 'a')").run(ADMIN, new Date().toISOString());
plannerEnv.DB.db.prepare("INSERT INTO notifs (email, at, kind, title) VALUES ('lain@acme.test', ?, 'task', 'Bukan untuk admin')").run(new Date().toISOString());
let pn = (await (await call("/api/today", { cookie: admin })).json()).planner.data.notif;
assert.equal(pn.unread, 1); assert.equal(pn.items[0].title, "Tugas baru: Visual banner");
assert.equal((await call("/api/notif/read", { method: "POST", cookie: admin, json: { all: true } })).status, 403, "tanpa Origin ditolak");
assert.equal((await call("/api/notif/read", { method: "POST", cookie: admin, origin: HUB, json: { ids: [pn.items[0].id] } })).status, 200);
assert.equal((await (await call("/api/today", { cookie: admin })).json()).planner.data.notif.unread, 0);
assert.equal(plannerEnv.DB.db.prepare("SELECT COUNT(*) n FROM notifs WHERE read_at IS NULL").get().n, 1, "notifikasi orang lain tidak ikut terbaca");

/* ---------- tiket SSO membawa role pekerjaan ---------- */
r = await call("/sso?app=planner&back=" + encodeURIComponent("https://planner.acme.test/"), { cookie: admin });
assert.equal(r.status, 303);
const tk = new URL(r.headers.get("location")).searchParams.get("hub_t").split(".")[0];
assert.equal(JSON.parse(Buffer.from(tk, "base64url").toString()).j, "partnership");

/* ---------- favorit ---------- */
r = await call("/api/prefs", { method: "POST", cookie: admin, json: { fav: ["fund"] } });
assert.equal(r.status, 403, "tanpa Origin ditolak");
r = await call("/api/prefs", { method: "POST", cookie: admin, origin: "https://jahat.test", json: { fav: ["fund"] } });
assert.equal(r.status, 403, "Origin lain ditolak");
r = await call("/api/prefs", { method: "POST", cookie: admin, origin: HUB, json: { fav: ["fund", "tidak-ada", "fund", "recap"] } });
assert.equal(r.status, 200);
assert.deepEqual((await r.json()).fav, ["fund", "recap"]);
assert.deepEqual(bootOf(await (await call("/", { cookie: admin })).text()).fav, ["fund", "recap"]);
assert.ok(env.HUB_KV.m.has("pref:" + ADMIN) && JSON.parse(env.HUB_KV.m.get("u:" + ADMIN).v).hash, "favorit di kunci sendiri, akun utuh");

/* ---------- pengguna terbatas ---------- */
// user biasa (tanpa role pekerjaan): langsung bisa memakai tool, tidak diminta memilih role
await env.HUB_KV.put("u:user@acme.test", JSON.stringify({ role: "user", status: "approved", name: "Rina", access: { fund: "viewer" }, hash: await hashPw("rahasia-456") }), { metadata: { role: "user", status: "approved", name: "Rina", reg: true, apps: "fund", job: "" } });
const user = cookieOf(await call("/login", { method: "POST", form: { email: "user@acme.test", password: "rahasia-456" } }));
assert.match(user, /^hub_sess=/);
assert.equal((await call("/", { cookie: user })).status, 200, "user biasa langsung ke beranda");
assert.equal((await call("/api/today", { cookie: user })).status, 200);
assert.equal((await call("/sso?app=fund&back=" + encodeURIComponent("https://fund.acme.test/"), { cookie: user })).status, 303, "user biasa bisa membuka tool");
assert.equal((await call("/role", { cookie: user })).headers.get("location"), "/", "halaman pilih role sudah tidak ada");
assert.equal(bootOf(await (await call("/", { cookie: user })).text()).me.job, "");
assert.match(await (await call("/admin/user?e=user@acme.test", { cookie: admin })).text(), /<option value="none" selected>Tanpa role/);
assert.match(await (await call("/admin", { cookie: admin })).text(), /user biasa/, "daftar admin menandai user biasa");
// admin memberi role
assert.equal((await call("/admin/access", { method: "POST", cookie: admin, origin: HUB, form: { email: "user@acme.test", job: "copy", a_fund: "viewer" } })).status, 200);
assert.equal(JSON.parse(env.HUB_KV.m.get("u:user@acme.test").v).job, "copy");
boot = bootOf(await (await call("/", { cookie: user })).text());
assert.deepEqual(boot.apps.map((a) => a.id), ["fund"], "hanya tool yang diberi akses");
assert.equal(boot.apps[0].lvl, "Lihat saja");
assert.equal(boot.me.job, "Copywriter");
assert.deepEqual(boot.today, { recap: false, planner: false, fund: true, competitor: false, edukasi: false, jobs: true, cron: true, rhythm: true });
assert.equal(boot.me.admin, false);
const ut = await (await call("/api/today", { cookie: user })).json();
assert.deepEqual(Object.keys(ut).sort(), ["cron", "fund", "jobs", "rhythm"], "ringkasan tool tanpa akses tidak diminta");
assert.ok(ut.rhythm.data.steps.every((s) => ["pdf", "nav1", "nav2"].includes(s.id)), "ritme: hanya langkah tool yang boleh dibuka");
r = await call("/api/prefs", { method: "POST", cookie: user, origin: HUB, json: { fav: ["fund", "recap"] } });
assert.deepEqual((await r.json()).fav, ["fund"], "tidak bisa memfavoritkan tool tanpa akses");
assert.equal((await call("/sso?app=recap&back=" + encodeURIComponent("https://recap.acme.test/"), { cookie: user })).status, 403, "SSO tetap menolak tool tanpa akses");

/* ---------- admin mengubah role & akses: daftar anggota Planner ikut diperbarui ---------- */
assert.match(await (await call("/admin/user?e=user@acme.test", { cookie: admin })).text(), /<option value="copy" selected>Copywriter/);
r = await call("/admin/access", { method: "POST", cookie: admin, origin: HUB, form: { email: "user@acme.test", job: "design", a_fund: "viewer", a_planner: "1" } });
assert.equal(r.status, 200);
assert.equal(JSON.parse(env.HUB_KV.m.get("u:user@acme.test").v).job, "design");
const members = plannerEnv.DB.db.prepare("SELECT email, name, role, active FROM users ORDER BY email").all().map((x) => ({ ...x }));
assert.deepEqual(members.filter((x) => x.active === 1).map((x) => [x.email, x.role]), [[ADMIN, "partnership"], ["user@acme.test", "design"]], "anggota Planner = admin + akun dengan akses Planner, beserta role-nya");
assert.match(await (await call("/admin", { cookie: admin })).text(), /Desainer/, "role tampil di daftar pengguna admin");
// role dicabut (user biasa) walau tetap boleh membuka Planner: keluar dari daftar anggota, tidak bisa diberi tugas
r = await call("/admin/access", { method: "POST", cookie: admin, origin: HUB, form: { email: "user@acme.test", job: "none", a_fund: "viewer", a_planner: "1" } });
assert.equal(r.status, 200);
assert.equal(JSON.parse(env.HUB_KV.m.get("u:user@acme.test").v).job, undefined);
assert.deepEqual(plannerEnv.DB.db.prepare("SELECT email FROM users WHERE active = 1 ORDER BY email").all().map((x) => x.email), [ADMIN], "user biasa bukan anggota Planner");

/* ---------- tanpa sesi ---------- */
assert.equal((await call("/api/today")).status, 401);
assert.equal((await call("/")).status, 303);

/* ---------- endpoint internal di tool ---------- */
const feed = (w, e, headers = {}, method = "GET") => w.fetch(new Request("https://x.test/__hub/today", { method, headers }), e, { waitUntil() { } });
for (const [w, e] of [[recap, recapEnv], [planner, plannerEnv], [fund, fundEnv], [competitor, compEnv], [edukasi, eduEnv], [cron, cronEnv]]) {
  assert.equal((await feed(w, e)).status, 403, "tanpa kunci ditolak");
  assert.equal((await feed(w, e, { "x-hub-key": "s".repeat(39) + "t" })).status, 403, "kunci salah ditolak");
  assert.equal((await feed(w, e, { "x-hub-key": SECRET }, "POST")).status, 403, "hanya GET");
  assert.equal((await feed(w, e, { "x-hub-key": SECRET })).status, 200);
}

/* ---------- tool belum tersambung / belum diperbarui ---------- */
const old = { RECAP: env.RECAP, PLANNER: env.PLANNER };
delete env.RECAP;
env.PLANNER = { fetch: async () => new Response("Tidak ditemukan", { status: 404 }) };
const bad = await (await call("/api/today", { cookie: admin })).json();
assert.equal(bad.recap.ok, false); assert.match(bad.recap.error, /belum tersambung/);
assert.equal(bad.planner.ok, false); assert.match(bad.planner.error, /belum diperbarui/);
assert.equal(bad.jobs.ok, true, "bagian lain tetap tampil");
Object.assign(env, old);

/* ---------- skrip halaman ---------- */
const page = fs.readFileSync(new URL("./shell.html", import.meta.url), "utf8");
for (const [, code] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(code);
const fillAll = /function fillAll\(d\) \{([^}]*)\}/.exec(page);
assert.ok(fillAll, "fillAll ada di shell.html");
for (const [, fn] of fillAll[1].matchAll(/(\w+)\(/g)) assert.ok(page.includes("function " + fn + "("), `${fn} (dipanggil fillAll) terdefinisi di shell.html`);
assert.equal(page.split('"__BOOT__"').length, 2, "penanda data ada tepat sekali di shell.html (bukan juga di komentar)");

console.log("semua cek lolos");
