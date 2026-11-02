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
      // code-ok = akun pemilik (a), code-b = akun Google lain (b); izin dicabut -> refresh token tidak sah
      const acct = b.get("grant_type") === "authorization_code" ? { "code-ok": "a", "code-b": "b" }[b.get("code")] : !G.revoked && { rt1: "a", rt2: "b" }[b.get("refresh_token")];
      if (!acct) return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({ ...(b.get("code") ? { refresh_token: acct === "a" ? "rt1" : "rt2" } : {}), access_token: acct + "t" + ++tokens, expires_in: 3600 });
    }
    if (url.host !== "www.googleapis.com") throw new Error("tak terduga: " + url);
    const who = (/^Bearer ([ab])t\d+$/.exec(req.headers.get("authorization") || "") || [])[1];
    if (!who || G.revoked) return new Response("unauth", { status: 401 });
    if (G.fail && (G.fail === m || G.fail === "*")) return new Response("galat", { status: 500 });
    if (url.pathname === "/upload/drive/v3/files" && m === "POST") {
      const meta = await req.json(), sid = "S" + ++seq;
      sessions.set(sid, { meta, owner: who, type: req.headers.get("x-upload-content-type"), size: +req.headers.get("x-upload-content-length") });
      G.origin = req.headers.get("origin");
      return new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=" + sid } });
    }
    if (url.pathname === "/drive/v3/files" && m === "POST") {
      const b = await req.json(), id = "f" + ++seq;
      files.set(id, { id, name: b.name, mimeType: b.mimeType, parents: b.parents || ["root"], owner: who });
      return Response.json({ id });
    }
    if (url.pathname === "/drive/v3/about" && m === "GET") return Response.json({ user: { emailAddress: who === "a" ? "pemilik@gmail.test" : "lain@gmail.test" } });
    // drive.file: file buatan akun lain tidak terlihat
    const fm = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname), f0 = fm && files.get(fm[1]), f = f0 && (f0.owner || "a") === who ? f0 : null;
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
    files.set(id, { id, name: s.meta.name, mimeType: s.type, size: bytes.length, parents: s.meta.parents, data: bytes, owner: s.owner });
    return id;
  };
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
    assert.deepEqual(Object.keys(F).sort(), ["arsip", "menunggu", "owner", "resmi", "root"]);
    assert.equal(F.owner, "pemilik@gmail.test", "akun Google pemilik folder dicatat");
    assert.equal(G.files.get(F.root).name, "Brand Kit – Materi presentasi");
    assert.deepEqual(["menunggu", "resmi", "arsip"].map((k) => [G.files.get(F[k]).name, G.files.get(F[k]).parents[0]]), [["Menunggu", F.root], ["Resmi", F.root], ["Arsip", F.root]]);
    assert.ok(![...G.files.values()].some((f) => (f.parents || []).includes(cfgOf("drive_folder"))), "tidak di dalam folder Drive publik");
    let st = (await call("/api/gdrive", { ck: ADM })).j;
    assert.deepEqual([st.ready, st.connected, st.by, st.acct], [true, true, "Adm", "pemilik@gmail.test"]);
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
    // izin dicabut di akun Google sementara access token masih di cache: langsung terlihat perlu dihubungkan ulang
    G.revoked = true;
    st = (await call("/api/gdrive", { ck: ADM })).j;
    assert.deepEqual([st.connected, st.error], [false, "Google Drive perlu dihubungkan ulang."], "token di cache ditolak Drive");
    G.revoked = false;
    env.DB.db.prepare("INSERT INTO cfg (k, v) VALUES ('gdrive', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(JSON.stringify({ ...gd, t: keep }));
    // menghubungkan ulang dengan akun Google lain (tidak bisa melihat folder lama) ditolak, sambungan lama tetap
    res = await raw("/drive/connect", { ck: ADM });
    const stateB = new URL(res.headers.get("location")).searchParams.get("state");
    res = await raw(`/drive/callback?code=code-b&state=${encodeURIComponent(stateB)}`, { ck: ADM });
    assert.equal(res.status, 400); assert.match(await res.text(), /akun Google lain[\s\S]*pemilik@gmail\.test/);
    assert.deepEqual([cfgOf("gdrive").t, cfgOf("gfolders")], [keep, F]);
    assert.equal((await call("/api/gdrive", { ck: ADM })).j.acct, "pemilik@gmail.test");

    /* ---------- alur deck: ajukan, revisi, setujui, ganti, tarik, arsip ---------- */
    const IGS = await cookie({ e: "ika@acme.test", n: "Ika", j: "is" }), IGS2 = await cookie({ e: "ivan@acme.test", n: "Ivan", j: "is" });
    const PDF = "application/pdf", PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const bytes = (n, c = 7) => new Uint8Array(n).fill(c);
    const ver = (id) => env.DB.db.prepare("SELECT * FROM deck_versions WHERE id = ?").get(id);
    const where = (vid) => { const f = G.files.get(ver(vid).file_id); return f.trashed ? "trash" : Object.keys(F).find((k) => F[k] === f.parents[0]); };
    /** IGS mengajukan: minta sesi, "browser" mengunggah, lalu konfirmasi. */
    async function submit(ck, body, data = bytes(body.size || 2048)) {
      const r = await call("/api/decks/upload", { ck, body: { name: "deck.pdf", mime: PDF, size: data.length, ...body } });
      assert.equal(r.status, 200, JSON.stringify(r.j));
      const fid = G.upload(r.j.upload_url, data), c = await call("/api/decks/uploaded", { ck, body: { version_id: r.j.version_id, file_id: fid } });
      assert.equal(c.status, 200, JSON.stringify(c.j));
      return r.j.version_id;
    }
    for (const ck of [SARI, HEAD, ADM]) assert.equal((await call("/api/decks/upload", { ck, body: { title: "X", name: "a.pdf", mime: PDF, size: 10 } })).status, 403, "hanya Investment Growth Specialist");
    for (const b of [{ name: "a.docx", mime: PDF }, { name: "a.pdf", mime: "text/plain" }, { name: "a.pdf", mime: PDF, size: 0 }, { name: "a.pdf", mime: PDF, size: 104857601 }, { name: "a.pdf", mime: PDF, title: " " }])
      assert.equal((await call("/api/decks/upload", { ck: IGS, body: { title: "Deck", size: 10, ...b } })).status, 400, JSON.stringify(b));
    // file yang tidak ada di folder Menunggu ditolak
    let r = await call("/api/decks/upload", { ck: IGS, body: { title: "Reksa Dana untuk Pemula", note: "Seminar kampus", name: "rd.pdf", mime: PDF, size: 2048 } });
    assert.equal(G.origin, BASE, "sesi unggah membawa origin Brand Kit (CORS browser)");
    const foreign = "fx1"; G.files.set(foreign, { id: foreign, name: "lain.pdf", mimeType: PDF, size: 2048, parents: [F.resmi] });
    assert.equal((await call("/api/decks/uploaded", { ck: IGS, body: { version_id: r.j.version_id, file_id: foreign } })).status, 400, "file asing ditolak");
    assert.equal((await call("/api/decks/uploaded", { ck: IGS2, body: { version_id: r.j.version_id, file_id: G.upload(r.j.upload_url, bytes(2048)) } })).status, 403, "hanya pengunggahnya");
    const fid1 = G.upload(r.j.upload_url, bytes(2048));
    assert.equal((await call("/api/decks/uploaded", { ck: IGS, body: { version_id: r.j.version_id, file_id: fid1 } })).status, 200);
    const v1 = r.j.version_id, deck = ver(v1).deck_id;
    assert.deepEqual([ver(v1).status, ver(v1).n, where(v1)], ["menunggu", 1, "menunggu"]);
    assert.equal((await call("/api/decks/upload", { ck: IGS2, body: { deck_id: deck, name: "rd2.pdf", mime: PDF, size: 10 } })).status, 400, "masih ada versi yang menunggu");
    // revisi: catatan wajib; keputusan pertama yang berlaku
    assert.equal((await call("/api/decks/decide", { ck: IGS, body: { version_id: v1, action: "setujui" } })).status, 403);
    assert.equal((await call("/api/decks/decide", { ck: HEAD, body: { version_id: v1, action: "revisi", note: " " } })).status, 400);
    assert.equal((await call("/api/decks/decide", { ck: HEAD, body: { version_id: v1, action: "revisi", note: "Slide 5 angkanya salah" } })).status, 200);
    r = await call("/api/decks/decide", { ck: ADM, body: { version_id: v1, action: "setujui" } });
    assert.deepEqual([r.status, r.j.error], [409, "Sudah diputuskan oleh Hana."]);
    let L = (await call("/api/decks", { ck: IGS })).j;
    assert.deepEqual(L.official, []); assert.deepEqual(L.can, { submit: true, approve: false });
    assert.deepEqual([L.work[0].latest.status, L.work[0].latest.note], ["revisi", "Slide 5 angkanya salah"]);
    // versi 2 (pengaju lain di tim yang sama): versi revisi pindah ke Arsip; disetujui -> Resmi
    const v2 = await submit(IGS2, { deck_id: deck, name: "rd-v2.pptx", mime: PPTX });
    assert.deepEqual([ver(v1).status, where(v1), ver(v2).n], ["arsip", "arsip", 2]);
    assert.equal((await call("/api/decks/decide", { ck: ADM, body: { version_id: v2, action: "setujui" } })).status, 200);
    assert.deepEqual([ver(v2).status, where(v2), ver(v2).decided_by], ["resmi", "resmi", "Adm"]);
    L = (await call("/api/decks", { ck: SARI })).j;
    assert.equal(L.work, undefined, "sales tidak melihat pengajuan");
    assert.deepEqual(L.official.map((d) => [d.title, d.note, d.version_id, d.updated]), [["Reksa Dana untuk Pemula", "Seminar kampus", v2, false]]);
    assert.deepEqual(L.can, { submit: false, approve: false });
    // versi baru menimpa: v3 disetujui -> v2 Arsip, daftar sales hanya v3 dengan tanda Diperbarui; judul baru ikut setelah disetujui
    const v3 = await submit(IGS, { deck_id: deck, title: "Reksa Dana untuk Pemula 2026" });
    assert.equal((await call("/api/decks", { ck: SARI })).j.official[0].title, "Reksa Dana untuk Pemula", "judul baru belum berlaku sebelum disetujui");
    await call("/api/decks/decide", { ck: HEAD, body: { version_id: v3, action: "setujui" } });
    L = (await call("/api/decks", { ck: SARI })).j;
    assert.deepEqual(L.official.map((d) => [d.title, d.version_id, d.updated]), [["Reksa Dana untuk Pemula 2026", v3, true]]);
    assert.deepEqual([ver(v2).status, where(v2), where(v3)], ["arsip", "arsip", "resmi"]);
    // arsip hanya 3 versi terakhir per deck
    const vs = [v3];
    for (let i = 0; i < 3; i++) { const v = await submit(IGS, { deck_id: deck }); await call("/api/decks/decide", { ck: ADM, body: { version_id: v, action: "setujui" } }); vs.push(v); }
    const arch = env.DB.db.prepare("SELECT id, status FROM deck_versions WHERE deck_id = ? ORDER BY n").all(deck);
    assert.deepEqual(arch.map((x) => x.status), ["trash", "trash", "arsip", "arsip", "arsip", "resmi"]);
    assert.ok(arch.filter((x) => x.status === "trash").every((x) => where(x.id) === "trash"), "file arsip lama masuk Trash Drive");
    // Drive gagal saat persetujuan: status tetap tercatat, letak file dibetulkan pada tindakan berikutnya
    const v8 = await submit(IGS, { deck_id: deck });
    G.fail = "PATCH";
    r = await call("/api/decks/decide", { ck: ADM, body: { version_id: v8, action: "setujui" } });
    assert.equal(r.status, 200); assert.ok(r.j.warning, "ada peringatan Drive");
    assert.deepEqual([ver(v8).status, ver(v8).folder, where(v8)], ["resmi", "menunggu", "menunggu"]);
    G.fail = null;
    await call("/api/decks", { ck: HEAD });
    assert.deepEqual([ver(v8).folder, where(v8)], ["resmi", "resmi"], "dibetulkan saat penyetuju membuka daftar");
    assert.equal(where(vs.at(-1)), "arsip");
    // tarik
    assert.equal((await call("/api/decks/withdraw", { ck: IGS, body: { deck_id: deck, note: "x" } })).status, 403);
    assert.equal((await call("/api/decks/withdraw", { ck: HEAD, body: { deck_id: deck, note: "" } })).status, 400);
    assert.equal((await call("/api/decks/withdraw", { ck: HEAD, body: { deck_id: deck, note: "Produk sudah tutup" } })).status, 200);
    L = (await call("/api/decks", { ck: ADM })).j;
    assert.deepEqual(L.official, []);
    assert.deepEqual([L.work[0].id, L.work[0].withdrawn_note, L.work[0].withdrawn_by], [deck, "Produk sudah tutup", "Hana"]);
    assert.deepEqual([ver(v8).status, where(v8)], ["arsip", "arsip"]);
    assert.ok(L.work[0].log.some((x) => x.action === "tarik"));
    // CSRF & unggahan yang tidak pernah dikonfirmasi dibersihkan setelah 24 jam
    assert.equal((await call("/api/decks/upload", { ck: IGS, body: { title: "Y", name: "y.pdf", mime: PDF, size: 10 }, headers: { origin: "https://jahat.test" } })).status, 403);
    r = await call("/api/decks/upload", { ck: IGS, body: { title: "Tertinggal", name: "t.pdf", mime: PDF, size: 10 } });
    env.NOW_MS = String(Date.now() + 25 * 3600e3);
    await call("/api/decks/upload", { ck: IGS, body: { title: "Baru", name: "b.pdf", mime: PDF, size: 10 } });
    delete env.NOW_MS;
    assert.equal(ver(r.j.version_id), undefined, "versi unggah lama dihapus");
    /* ---------- unduhan, catatan unduhan, ringkasan untuk Tool Hub ---------- */
    // peran untuk ringkasan (tanpa tiket) diambil dari daftar anggota Tool Hub
    await call("/__hub/users", { body: { users: [{ email: "sari@acme.test", name: "Sari", job: "sales", branch: "Cabang Surabaya" }, { email: "adm@acme.test", name: "Adm", adm: true },
      { email: "head@acme.test", name: "Hana", job: "head_rm" }, { email: "ika@acme.test", name: "Ika", job: "is" }] }, headers: { "x-hub-key": env.SSO_SECRET } });
    const feed = async (email) => (await raw("/__hub/today?email=" + encodeURIComponent(email), { headers: { "x-hub-key": env.SSO_SECRET } })).json();
    const dl = (ck, vid, q = "") => raw("/deck/" + vid + q, { ck });
    const da = await submit(IGS, { title: "Obligasi Ritel", name: "obr.pdf" }, bytes(3000, 9));
    await call("/api/decks/decide", { ck: ADM, body: { version_id: da, action: "setujui" } });
    const db = await submit(IGS, { deck_id: ver(da).deck_id, name: "obr-v2.pdf" });
    for (const v of [db, v8]) assert.equal((await dl(SARI, v)).status, 404, "sales tidak bisa mengunduh versi menunggu / arsip");
    assert.equal((await dl(SARI, "zzzzzzzzzzzz")).status, 404);
    res = await dl(SARI, da);
    assert.equal(res.status, 200); assert.deepEqual(new Uint8Array(await res.arrayBuffer()), bytes(3000, 9));
    assert.match(res.headers.get("content-disposition"), /^attachment; filename\*=UTF-8''obr\.pdf$/); assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.match((await dl(SARI, da, "?view=1")).headers.get("content-disposition"), /^inline/);
    assert.equal((await dl(IGS, db)).status, 200, "pengaju boleh membuka versi menunggu");
    const dls = env.DB.db.prepare("SELECT email, branch, version_id FROM deck_downloads").all();
    assert.deepEqual(dls.map((x) => [x.email, x.branch, x.version_id]), [["sari@acme.test", "Cabang Surabaya", da], ["sari@acme.test", "Cabang Surabaya", da]], "hanya unduhan versi resmi yang dicatat");
    // ringkasan untuk beranda Tool Hub
    assert.equal((await raw("/__hub/today?email=head@acme.test")).status, 403, "tanpa kunci hub");
    let fd = await feed("head@acme.test");
    assert.deepEqual(fd.pending.map((x) => [x.title, x.by]), [["Obligasi Ritel", "Ika"]]);
    assert.deepEqual((await feed("sari@acme.test")).pending, []);
    assert.deepEqual((await feed("sari@acme.test")).notices, []);
    await call("/api/decks/decide", { ck: HEAD, body: { version_id: db, action: "setujui" } });
    assert.deepEqual((await feed("sari@acme.test")).notices.map((x) => [x.title, x.kind]), [["Obligasi Ritel", "diganti"]], "deck yang pernah diunduh sudah diganti");
    await dl(SARI, db);
    assert.deepEqual((await feed("sari@acme.test")).notices, [], "hilang setelah mengunduh versi terbaru");
    await call("/api/decks/withdraw", { ck: ADM, body: { deck_id: ver(db).deck_id, note: "Seri sudah jatuh tempo" } });
    assert.deepEqual((await feed("sari@acme.test")).notices.map((x) => x.kind), ["ditarik"]);
    fd = await feed("ika@acme.test");
    assert.ok(fd.mine.some((x) => x.status === "revisi" && x.note === "Slide 5 angkanya salah"), "pengaju melihat catatan revisi");
    assert.ok(fd.mine.some((x) => x.status === "resmi" && x.title === "Obligasi Ritel"));
    assert.deepEqual(fd.pending, [], "pengaju bukan penyetuju");
    assert.deepEqual((await call("/api/usage", { ck: ADM })).j.decks, [{ title: "Obligasi Ritel", n: 3 }]);
    // izin Google dicabut: daftar tetap tampil, unduhan memberi pesan jelas
    const da2 = await submit(IGS, { title: "Saham Syariah", name: "ss.pdf" });
    await call("/api/decks/decide", { ck: ADM, body: { version_id: da2, action: "setujui" } });
    const gsave = cfgOf("gdrive");
    env.DB.db.prepare("UPDATE cfg SET v = ? WHERE k = 'gdrive'").run(JSON.stringify({ ...gsave, t: await seal(env, "rt-bad") }));
    await env.BRAND_KV.delete("gtoken");
    res = await dl(SARI, da2);
    assert.equal(res.status, 502); assert.match(await res.text(), /perlu dihubungkan ulang/);
    L = (await call("/api/decks", { ck: SARI })).j;
    assert.deepEqual([L.official.length, L.drive.connected], [1, false]);
    env.DB.db.prepare("INSERT INTO cfg (k, v) VALUES ('gdrive', ?)").run(JSON.stringify(gsave));
    // unggahan yang gagal / dibatalkan tidak mengunci deck
    const ds = ver(da2).deck_id, up = (ck) => call("/api/decks/upload", { ck, body: { deck_id: ds, name: "ss2.pdf", mime: PDF, size: 10 } });
    const u1 = await up(IGS), u2 = await up(IGS);
    assert.deepEqual([u1.status, u2.status], [200, 200], "pengaju boleh mengulang unggahannya");
    assert.equal(ver(u1.j.version_id), undefined, "sesi lama miliknya dibuang");
    assert.equal((await up(IGS2)).status, 400, "unggahan orang lain masih berjalan");
    env.NOW_MS = String(Date.now() + 61 * 60e3);
    assert.equal((await up(IGS2)).status, 200, "unggahan orang lain yang macet > 1 jam tidak mengunci");
    delete env.NOW_MS;
    assert.equal(ver(u2.j.version_id), undefined, "sesi macet dibuang supaya tidak ada dua pengajuan");
    // hanya versi resmi deck-nya yang bisa diunduh sales, walau status versi lain tertulis resmi
    env.DB.db.prepare("UPDATE deck_versions SET status = 'resmi' WHERE id = ?").run(v8);
    assert.equal((await dl(SARI, v8)).status, 404, "bukan versi resmi deck");
    env.DB.db.prepare("UPDATE deck_versions SET status = 'arsip' WHERE id = ?").run(v8);
    // tarik bersamaan dengan persetujuan versi baru: persetujuan yang lebih dulu tidak hilang
    const vb = await submit(IGS2, { deck_id: ds, name: "ss-v2.pdf" }), prep = env.DB.prepare;
    env.DB.prepare = (sql) => {
      const s = prep(sql);
      if (sql !== "SELECT * FROM decks WHERE id = ?") return s;
      return { ...s, bind: (...a) => { const b = s.bind(...a); return { ...b, first: async () => {
        const row = await b.first(); env.DB.prepare = prep;
        assert.equal((await call("/api/decks/decide", { ck: HEAD, body: { version_id: vb, action: "setujui" } })).status, 200);
        return row;
      } }; } };
    };
    r = await call("/api/decks/withdraw", { ck: ADM, body: { deck_id: ds, note: "Ditutup" } });
    env.DB.prepare = prep;
    assert.equal(r.status, 409, JSON.stringify(r.j));
    assert.deepEqual([env.DB.db.prepare("SELECT official FROM decks WHERE id = ?").get(ds).official, ver(vb).status], [vb, "resmi"]);
    assert.equal((await dl(SARI, vb)).status, 200);
    /* ---------- halaman ---------- */
    // kebijakan privasi untuk layar izin Google: terbuka tanpa login
    res = await raw("/privasi");
    assert.equal(res.status, 200);
    const priv = await res.text();
    assert.ok(/Kebijakan privasi/.test(priv) && priv.includes("drive.file") && priv.includes("myaccount.google.com/permissions"), "isi kebijakan privasi");
    const page = async (ck) => (await raw("/", { ck })).text(), bk = (h) => JSON.parse(/window\.BK=(.*?);<\/script>/s.exec(h)[1]);
    const hIgs = await page(IGS);
    assert.ok(hIgs.includes('data-tab="deck"') && hIgs.includes("/api/decks/upload") && hIgs.includes("XMLHttpRequest"), "tab Presentasi + unggah langsung ke Drive");
    assert.deepEqual(bk(hIgs).deck, { submit: true, approve: false });
    assert.deepEqual(bk(await page(HEAD)).deck, { submit: false, approve: true });
    assert.deepEqual(bk(await page(SARI)).deck, { submit: false, approve: false });
    assert.ok((await page(ADM)).includes("/drive/connect"), "admin bisa menghubungkan Google Drive");
    const P = { deck, v3, v8, IGS, PDF, submit, ver };
    return { G, F, P };
  } finally {
    globalThis.fetch = realFetch;
  }
}
