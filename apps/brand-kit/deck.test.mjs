// Cek materi presentasi Brand Kit: sambungan Google Drive (izin sekali, folder privat), alur deck, unduhan, ringkasan Tool Hub.
// Dijalankan oleh test.mjs (memakai worker, env, dan helper-nya): node apps/brand-kit/test.mjs
import assert from "node:assert/strict";
import { seal, unseal } from "./gdrive.js";

/** Google tiruan: OAuth token, Drive files (folder, metadata, pindah, trash, unduh), sesi unggah resumable. */
export function fakeGoogle() {
  const files = new Map(), sessions = new Map(), calls = [];
  let seq = 0, tokens = 0;
  const G = { files, calls, fail: null, tokenCalls: 0, origin: null };
  const file = (f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size == null ? undefined : String(f.size), parents: f.parents, trashed: !!f.trashed });
  G.fetch = async (u, init = {}) => {
    const req = new Request(u, init), url = new URL(req.url), m = req.method;
    calls.push(m + " " + url.pathname + url.search);
    if (url.host === "oauth2.googleapis.com") {
      G.tokenCalls++;
      const b = new URLSearchParams(await req.text());
      if (b.get("grant_type") === "authorization_code") return b.get("code") === "code-ok" ? Response.json({ refresh_token: "rt1", access_token: "at" + ++tokens, expires_in: 3600 }) : Response.json({ error: "invalid_grant" }, { status: 400 });
      return b.get("refresh_token") === "rt1" ? Response.json({ access_token: "at" + ++tokens, expires_in: 3600 }) : Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    if (url.host !== "www.googleapis.com") throw new Error("tak terduga: " + url);
    if (!/^Bearer at\d+$/.test(req.headers.get("authorization") || "")) return new Response("unauth", { status: 401 });
    if (G.fail && (G.fail === m || G.fail === "*")) return new Response("galat", { status: 500 });
    if (url.pathname === "/upload/drive/v3/files" && m === "POST") {
      const meta = await req.json(), sid = "S" + ++seq;
      sessions.set(sid, { meta, type: req.headers.get("x-upload-content-type"), size: +req.headers.get("x-upload-content-length") });
      G.origin = req.headers.get("origin");
      return new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=" + sid } });
    }
    if (url.pathname === "/drive/v3/files" && m === "POST") {
      const b = await req.json(), id = "f" + ++seq;
      files.set(id, { id, name: b.name, mimeType: b.mimeType, parents: b.parents || ["root"] });
      return Response.json({ id });
    }
    const fm = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname), f = fm && files.get(fm[1]);
    if (fm && !f) return new Response("not found", { status: 404 });
    if (fm && m === "GET") return url.searchParams.get("alt") === "media" ? new Response(f.data, { headers: { "content-type": f.mimeType } }) : Response.json(file(f));
    if (fm && m === "PATCH") {
      const add = url.searchParams.get("addParents"), rem = url.searchParams.get("removeParents");
      if (add || rem) f.parents = [...f.parents.filter((p) => p !== rem), ...(add ? [add] : [])];
      const b = await req.json().catch(() => ({}));
      if (b.trashed) f.trashed = true;
      return Response.json(file(f));
    }
    throw new Error("tak terduga: " + m + " " + url);
  };
  /** Browser mengunggah ke URL sesi: file jadi di folder tujuan sesi. */
  G.upload = (sessionUrl, bytes) => {
    const s = sessions.get(new URL(sessionUrl).searchParams.get("upload_id")), id = "f" + ++seq;
    files.set(id, { id, name: s.meta.name, mimeType: s.type, size: bytes.length, parents: s.meta.parents, data: bytes });
    return id;
  };
  G.revoke = () => { G.revoked = true; };
  return G;
}

export default async function deckTests({ worker, env, call, raw, cookie, ADM, SARI, HEAD, BASE }) {
  const G = fakeGoogle(), realFetch = globalThis.fetch;
  globalThis.fetch = (u, i) => G.fetch(u, i);
  env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com"; env.GOOGLE_CLIENT_SECRET = "csecret";
  const cfgOf = (k) => { const r = env.DB.db.prepare("SELECT v FROM cfg WHERE k = ?").get(k); return r ? JSON.parse(r.v) : null; };
  try {
    /* ---------- sambungan Google Drive ---------- */
    const s = await seal(env, "rahasia-123");
    assert.notEqual(s, "rahasia-123"); assert.equal(await unseal(env, s), "rahasia-123");
    assert.equal(await unseal({ ...env, SSO_SECRET: "x".repeat(40) }, s), null, "kunci lain tidak bisa membuka");
    assert.equal((await call("/api/gdrive", { ck: ADM })).j.connected, false);
    assert.equal((await raw("/drive/connect", { ck: SARI })).status, 403, "bukan admin");
    let res = await raw("/drive/connect", { ck: ADM });
    assert.equal(res.status, 302);
    const auth = new URL(res.headers.get("location"));
    assert.equal(auth.host, "accounts.google.com");
    assert.equal(auth.searchParams.get("scope"), "https://www.googleapis.com/auth/drive.file");
    assert.deepEqual([auth.searchParams.get("access_type"), auth.searchParams.get("prompt"), auth.searchParams.get("redirect_uri")], ["offline", "consent", BASE + "/drive/callback"]);
    const state = auth.searchParams.get("state");
    // state milik admin lain / kedaluwarsa / dirusak -> ditolak
    const ADM2 = await cookie({ e: "adm2@acme.test", n: "Adm2", adm: true });
    res = await raw(`/drive/callback?code=code-ok&state=${encodeURIComponent(state)}`, { ck: ADM2 });
    assert.match(await res.text(), /tidak sah/); assert.equal(cfgOf("gdrive"), null);
    res = await raw(`/drive/callback?code=code-ok&state=${encodeURIComponent(state + "x")}`, { ck: ADM });
    assert.match(await res.text(), /tidak sah/);
    env.NOW_MS = String(Date.now() + 11 * 60e3);
    res = await raw(`/drive/callback?code=code-ok&state=${encodeURIComponent(state)}`, { ck: ADM });
    assert.match(await res.text(), /tidak sah/, "kedaluwarsa"); delete env.NOW_MS;
    res = await raw(`/drive/callback?code=code-ok&state=${encodeURIComponent(state)}`, { ck: ADM });
    assert.equal(res.status, 200); assert.match(await res.text(), /Google Drive terhubung/);
    const gd = cfgOf("gdrive");
    assert.ok(gd && gd.t && !gd.t.includes("rt1"), "refresh token disimpan terenkripsi"); assert.equal(gd.by, "Adm");
    const F = cfgOf("gfolders");
    assert.deepEqual(Object.keys(F).sort(), ["arsip", "menunggu", "resmi", "root"]);
    assert.equal(G.files.get(F.root).name, "Brand Kit – Materi presentasi");
    assert.deepEqual(["menunggu", "resmi", "arsip"].map((k) => [G.files.get(F[k]).name, G.files.get(F[k]).parents[0]]), [["Menunggu", F.root], ["Resmi", F.root], ["Arsip", F.root]]);
    assert.ok(![...G.files.values()].some((f) => (f.parents || []).includes(cfgOf("drive_folder"))), "tidak di dalam folder Drive publik");
    let st = (await call("/api/gdrive", { ck: ADM })).j;
    assert.deepEqual([st.ready, st.connected, st.by], [true, true, "Adm"]);
    assert.equal((await call("/api/gdrive", { ck: SARI })).status, 403);
    const t0 = G.tokenCalls; await call("/api/gdrive", { ck: ADM });
    assert.equal(G.tokenCalls, t0, "access token dari cache KV");
    // izin dicabut: refresh token tidak sah
    const keep = gd.t;
    env.DB.db.prepare("UPDATE cfg SET v = ? WHERE k = 'gdrive'").run(JSON.stringify({ ...gd, t: await seal(env, "rt-bad") }));
    await env.BRAND_KV.delete("gtoken");
    st = (await call("/api/gdrive", { ck: ADM })).j;
    assert.deepEqual([st.connected, st.error], [false, "Google Drive perlu dihubungkan ulang."]);
    // dihubungkan lagi (folder lama tetap dipakai)
    env.DB.db.prepare("INSERT INTO cfg (k, v) VALUES ('gdrive', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(JSON.stringify({ ...gd, t: keep }));
    assert.equal((await call("/api/gdrive", { ck: ADM })).j.connected, true);
    assert.deepEqual(cfgOf("gfolders"), F);
    return { G, F };
  } finally {
    globalThis.fetch = realFetch;
  }
}
