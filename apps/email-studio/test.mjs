// Cek Email Studio: "Catat ke Planner" (/api/planner diteruskan ke Content Planner), /api/imgproxy, dan skrip halaman.
// Jalankan: node apps/email-studio/test.mjs
import assert from "node:assert/strict";
const { default: studio } = await import("./worker.js");

const SECRET = "s".repeat(40), BASE = "https://email.acme.test";
const te = new TextEncoder(), b64 = (buf) => Buffer.from(buf).toString("base64url");
async function cookie(p) {
  const body = b64(te.encode(JSON.stringify({ app: "email", x: Date.now() + 3600e3, ...p })));
  const key = await crypto.subtle.importKey("raw", te.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `hub_email=${body}.${b64(await crypto.subtle.sign("HMAC", key, te.encode(body)))}`;
}
const CK = await cookie({ e: "cici@acme.test", n: "Cici", j: "copy" });
const sent = [];
const PLANNER = { fetch: async (url, init) => { sent.push({ url, init, body: JSON.parse(init.body) }); return Response.json({ id: "it1", code: "abc123", url: "https://planner.acme.test/go/abc123" }); } };
const env = { SSO_SECRET: SECRET, PLANNER };
const post = (path, body, { origin = BASE, e = env } = {}) => studio.fetch(new Request(BASE + path, { method: "POST", headers: { cookie: CK, "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }), e);

// diteruskan atas nama user yang login, dengan kunci hub
let r = await post("/api/planner", { title: "Promo", date: "2026-11-10", email_tpl: "Promo Reksa Dana", target: "https://kisi.test/promo", img: "data:image/jpeg;base64,AAAA" });
assert.equal(r.status, 200); assert.equal((await r.json()).code, "abc123");
assert.equal(sent[0].url, "https://planner/__hub/email");
assert.equal(sent[0].init.headers["x-hub-key"], SECRET);
assert.deepEqual(sent[0].body.by, { email: "cici@acme.test", name: "Cici", job: "copy" });
assert.deepEqual(sent[0].body.item, { title: "Promo", date: "2026-11-10", email_tpl: "Promo Reksa Dana" });
assert.equal(sent[0].body.target, "https://kisi.test/promo");
assert.equal((await post("/api/planner", {}, { origin: "https://jahat.test" })).status, 403, "origin lain ditolak");
assert.equal((await post("/api/planner", {}, { origin: "" })).status, 403, "tanpa origin ditolak");
assert.equal((await post("/api/planner", {}, { e: { SSO_SECRET: SECRET } })).status, 503, "tanpa service binding");
assert.equal((await studio.fetch(new Request(BASE + "/api/planner", { method: "POST", body: "{}", headers: { origin: BASE } }), env)).status, 401, "wajib login");

// proxy gambar: https publik saja
for (const bad of ["http://x.test/a.png", "https://127.0.0.1/a.png", "https://localhost/a.png", "https://[::1]/a.png", "javascript:1"])
  assert.equal((await studio.fetch(new Request(BASE + "/api/imgproxy?url=" + encodeURIComponent(bad), { headers: { cookie: CK } }), env)).status, 400, bad);

// halaman: tombol & dialog ada, skrip utuh (tanpa </script> di dalam string)
const html = await (await studio.fetch(new Request(BASE + "/", { headers: { cookie: CK } }), env)).text();
assert.match(html, /id="bPlan"/);
// tujuan diambil dari catatan sebelumnya walau membuat kegiatan baru (tidak merantai /go/ lama); email yang tanggal kirimnya lewat = bawaan kegiatan baru
assert.ok(html.includes("P0 = d._planner, P = $('plNew').checked ? null : P0, target = P0 && x.url === P0.url ? P0.target"));
assert.ok(html.includes("$('plNew').checked = sent;")); assert.match(html, /id="plDlg"/);
for (const [, code] of html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)) new Function(code);
console.log("semua cek lolos");
