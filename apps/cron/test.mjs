// Cek jadwal apps/cron & pengaman /__cron (shared/cron.js) dengan simulasi satu minggu. Jalankan: node apps/cron/test.mjs
import assert from "node:assert";
const { default: cron } = await import("./worker.js");
const { withCron } = await import("../../shared/cron.js");

// withCron: rute /__cron memanggil scheduled() dengan waktu yang dikirim; selain itu ke fetch asli
const seen = [];
const w = withCron({ fetch: () => new Response("asli"), scheduled: (e) => { seen.push(e.scheduledTime); } });
const env = { SSO_SECRET: "rahasia" };
assert.equal(await (await w.fetch(new Request("https://x/"), env)).text(), "asli");
assert.equal((await w.fetch(new Request("https://x/__cron?t=5", { method: "POST" }), env)).status, 403);
assert.equal((await w.fetch(new Request("https://x/__cron?t=5", { method: "POST", headers: { "x-cron-key": "salah" } }), env)).status, 403);
assert.equal((await w.fetch(new Request("https://x/__cron?t=5", { method: "POST", headers: { "x-cron-key": "rahasia" } }), {})).status, 403);
assert.equal((await w.fetch(new Request("https://x/__cron?t=5", { method: "GET", headers: { "x-cron-key": "rahasia" } }), env)).status, 403);
assert.equal((await w.fetch(new Request("https://x/__cron?t=5", { method: "POST", headers: { "x-cron-key": "rahasia" } }), env)).status, 200);
assert.deepEqual(seen, [5]);

// dispatcher: simulasikan satu minggu (Senin 2026-10-19 00:00 UTC) tiap 5 menit
const calls = {};
const bind = (b) => ({ fetch: async (url, init) => { assert.equal(init.headers["x-cron-key"], "rahasia"); (calls[b] ||= []).push(Number(new URL(url).searchParams.get("t"))); return new Response("ok"); } });
const denv = { SSO_SECRET: "rahasia", ...Object.fromEntries(["FUND", "COMPETITOR", "EDUKASI", "STORYDATA", "SATS", "RECAP", "CONTENT"].map((b) => [b, bind(b)])) };
const start = Date.UTC(2026, 9, 19);
let heavyClash = 0;
for (let t = start; t < start + 7 * 864e5; t += 3e5) {
  const before = Object.fromEntries(Object.entries(calls).map(([k, v]) => [k, v.length]));
  await cron.scheduled({ scheduledTime: t }, denv);
  const ran = Object.keys(calls).filter((k) => calls[k].length !== (before[k] || 0));
  if (ran.filter((k) => ["FUND", "COMPETITOR", "EDUKASI"].includes(k)).length > 1) heavyClash++;
}
const hhmm = (t) => new Date(t).toISOString().slice(11, 16);
assert.equal(heavyClash, 0, "dua pekerjaan berat di menit yang sama");
assert.equal(calls.FUND.length, 7 * 48);          // */30 seperti dulu
assert.equal(calls.COMPETITOR.length, 7 * 48);    // */30 seperti dulu
assert.equal(calls.EDUKASI.length, 7 * 96);       // */15 seperti dulu
assert.equal(calls.STORYDATA.length, 5 * 288);    // */5 Senin–Jumat seperti dulu
assert.deepEqual([...new Set(calls.SATS.map(hhmm))], ["10:20", "12:20"]);
assert.equal(calls.SATS.length, 10);
assert.equal(calls.RECAP.length, 5 * 48);         // :20/:50 Senin–Jumat
assert.equal(calls.CONTENT.length, 7 * 288);      // Content Insight (scan Instagram) tiap 5 menit, termasuk 07.00 WIB = 00:00 UTC
assert(calls.CONTENT.some((t) => hhmm(t) === "00:00"));
assert(calls.RECAP.every((t) => new Date(t).getUTCMinutes() % 30 === 20));
// waktu Story Data penting (Wrap 09:50 & 10:25, LME 19:30 & 23:00) ikut terkirim tepat
for (const s of ["09:50", "10:25", "19:30", "23:00"]) assert(calls.STORYDATA.some((t) => hhmm(t) === s), s);
// LME di :00/:30 tidak berbarengan dengan pekerjaan berat
for (const s of ["19:30", "23:00"]) for (const k of ["FUND", "COMPETITOR", "EDUKASI"]) assert(!calls[k].some((t) => hhmm(t) === s), `${k} ${s}`);
// Competitor: mulai pemindaian mingguan Sabtu 19:xx UTC tetap terpanggil
assert(calls.COMPETITOR.some((t) => new Date(t).getUTCDay() === 6 && hhmm(t) === "19:10"));
// Fund: tarikan jam 02 & 11 UTC tetap dua kali per jam
assert.equal(calls.FUND.filter((t) => [2, 11].includes(new Date(t).getUTCHours())).length, 7 * 4);

// kegagalan satu tool tidak menghentikan yang lain, dan jalannya ditandai gagal
const fail = { ...denv, FUND: { fetch: async () => new Response("x", { status: 500 }) } };
await assert.rejects(cron.scheduled({ scheduledTime: Date.UTC(2026, 9, 19, 2, 5) }, fail), /FUND: HTTP 500/);
console.log("semua cek lolos");
