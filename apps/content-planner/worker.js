// Content Planner — Cloudflare Worker
// - "/"            -> Kalender kegiatan tim: konten sosmed, artikel, edukasi/narasumber, dan tugas desain; laporan PPT/PDF (di browser)
// - "/paket"       -> Paket konten mingguan: rangkuman reksa dana, obligasi, dan agenda minggu depan + draf caption/email
// - "/api/items"   -> kegiatan (GET ?from=&to=, GET ?design=1 tugas desain, POST simpan, POST /api/items/delete hapus)
// - "/api/users"   -> anggota tim yang pernah membuka tool ini + perannya (POST /api/me/role: pilih peran sendiri)
// - "/api/weekly"  -> data paket mingguan (disusun saat diminta, cache 10 menit)
// Semua halaman & data hanya untuk yang login lewat Tool Hub. Semua yang punya akses boleh menambah & mengubah;
// menghapus hanya admin Tool Hub atau pembuat kegiatan itu sendiri.
//
// Sumber paket mingguan (semua sudah ada, tidak menarik data baru):
//   Fund Insight (service binding FUND): daftar RD + return (/api/funds), gerak harian tidak biasa (/api/stab)
//   Fund Insight (D1 FUND_DB, hanya dibaca): NAB seminggu lalu (return 1 minggu), agenda yang ditambahkan tim
//   Bond Insight (service binding BOND): obligasi (/data/bonds.json) dan riwayat yield (/data/history.json)
//   Story Generator (GitHub): agenda makro (data/macro.js + public/calendar.json), sama seperti agenda di Fund Insight
import { title, profileScript, appUrl } from "../../shared/profile.js";
import { themeHead } from "../../shared/theme.js";
import { macroItems, macroUrls } from "../../shared/macro.js";
import PAGE from "./page.html";

/* =========================================================
   LOGIN LEWAT TOOL HUB
   ========================================================= */
const HUBSSO = (() => {
  const APP = "planner", COOKIE = "hub_" + APP, HOURS = 8, te = new TextEncoder();
  // SameSite=None + Partitioned: cookie tetap terkirim saat tool tampil di dalam dashboard Tool Hub (bingkai).
  const CK = "Path=/; HttpOnly; Secure; SameSite=None; Partitioned";
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64 = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
  const eq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
  const sign = async (secret, body) => b64(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), te.encode(body)));
  // isi tiket/sesi kalau tanda tangannya sah, untuk tool ini, dan belum kedaluwarsa; selain itu null
  const open = async (env, tok) => {
    const [body, sig] = String(tok || "").split(".");
    if (!body || !sig || !eq(await sign(env.SSO_SECRET, body), sig)) return null;
    let p; try { p = JSON.parse(new TextDecoder().decode(unb64(body))); } catch (e) { return null; }
    return p && p.app === APP && p.x > Date.now() ? p : null;
  };
  const hub = (env) => String(env.HUB_URL || "").replace(/\/+$/, "");
  const go = (to, extra = {}) => new Response(null, { status: 303, headers: { location: to, "cache-control": "no-store", ...extra } });
  return {
    ready: (env) => String(env.SSO_SECRET || "").length >= 32,
    notReady: () => new Response("Tool ini belum dikonfigurasi: pasang secret SSO_SECRET (sama dengan di Tool Hub).", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } }),
    /** Kembali dari hub membawa ?hub_t=... -> tukar dengan cookie sesi. null kalau alamat tidak membawa tiket. onLogin(p) dipanggil sekali per login. */
    async ticket(request, env, onLogin) {
      const url = new URL(request.url), t = url.searchParams.get("hub_t");
      if (!t) return null;
      const p = await open(env, t); url.searchParams.delete("hub_t");
      if (!p) return go(url.pathname + url.search);
      if (onLogin) await onLogin(p).catch((e) => console.error("onLogin:", e.message));
      const body = b64(te.encode(JSON.stringify({ ...p, x: Date.now() + HOURS * 3600e3 })));
      return go(url.pathname + url.search, { "set-cookie": `${COOKIE}=${body}.${await sign(env.SSO_SECRET, body)}; ${CK}; Max-Age=${HOURS * 3600}` });
    },
    async user(request, env) {
      const m = (request.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
      return m ? open(env, m[1]) : null;
    },
    login: (request, env) => { const url = new URL(request.url); return go(`${hub(env)}/sso?app=${APP}&back=${encodeURIComponent(url.origin + url.pathname + url.search)}`); },
    logout: (env) => go(hub(env) + "/logout", { "set-cookie": `${COOKIE}=; ${CK}; Max-Age=0` }),
    /** Halaman aplikasi hanya dipakai di dalam dashboard: dibuka langsung -> pindah ke tab-nya di hub. */
    onlyInHub: (env) => `if(window.top===window.self)location.replace(${JSON.stringify(hub(env) + "/#" + APP)});`,
    frame: (env) => `frame-ancestors 'self' ${hub(env)}`,
    // cookie sesi ikut terkirim dari dalam bingkai, jadi permintaan yang mengubah data wajib berasal dari halaman ini sendiri
    sameOrigin: (request) => { const o = request.headers.get("origin"); return !o || o === new URL(request.url).origin; },
  };
})();

/* =========================================================
   KEGIATAN (D1: planner-db)
   ========================================================= */
// Tiga jenis kegiatan, masing-masing dengan kanal/format dan alur statusnya sendiri.
export const KINDS = {
  konten: { label: "Konten sosmed", channels: ["IG Story", "IG Feed", "IG Reels", "TikTok", "YouTube", "WA Broadcast", "WA Channel", "Lainnya"], statuses: ["ide", "draf", "review", "terbit"] },
  artikel: { label: "Artikel", channels: ["Website", "Blog", "Email / Newsletter", "Media partner", "Lainnya"], statuses: ["ide", "draf", "review", "terbit"] },
  edukasi: { label: "Edukasi / narasumber", channels: ["Webinar", "Seminar", "Talkshow", "Kelas / kunjungan", "Live IG / TikTok", "Lainnya"], statuses: ["rencana", "konfirmasi", "selesai", "batal"] },
};
export const EDU_ROLES = ["Narasumber", "Moderator", "Penyelenggara", "Peserta"];
export const DESIGN_STATUSES = ["belum", "proses", "revisi", "selesai"];
// peran anggota tim (dipilih sendiri; menentukan tampilan bawaan & pengelompokan di laporan)
export const ROLES = { is: "Investment Specialist", copy: "Copywriter", sosmed: "Social Media Specialist", design: "Desainer", lain: "Lainnya" };
const ISO = /^\d{4}-\d{2}-\d{2}$/, EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Kolom selain id/date/title. Tabel versi pertama dibuat tanpa sebagian kolom ini; ensure() menambahkannya tanpa menyentuh isi.
const COLS = {
  kind: "TEXT", channel: "TEXT", status: "TEXT", owner: "TEXT", owner_email: "TEXT", note: "TEXT", link: "TEXT",
  time: "TEXT", place: "TEXT", role: "TEXT", audience: "TEXT", result_num: "INTEGER", result_note: "TEXT",
  d_need: "INTEGER", d_who: "TEXT", d_name: "TEXT", d_due: "TEXT", d_status: "TEXT", d_link: "TEXT", d_brief: "TEXT",
  created_by: "TEXT", created_email: "TEXT", created_at: "TEXT", updated_by: "TEXT", updated_at: "TEXT",
};
const EDIT = ["date", "title", ...Object.keys(COLS).filter((k) => !/^(created_|updated_)/.test(k))];
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, date TEXT NOT NULL, title TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, role TEXT, seen_at TEXT)"),
  ]);
  const have = new Set((await env.DB.prepare("PRAGMA table_info(items)").all()).results.map((c) => c.name));
  const add = Object.entries(COLS).filter(([k]) => !have.has(k)).map(([k, t]) => env.DB.prepare(`ALTER TABLE items ADD COLUMN ${k} ${t}`));
  add.push(env.DB.prepare("CREATE INDEX IF NOT EXISTS items_date ON items (date)"), env.DB.prepare("CREATE INDEX IF NOT EXISTS items_design ON items (d_need, d_status)"));
  await env.DB.batch(add);
  ready = true;
}
const who = (me) => me.n || me.u || me.e;
/** Isian dari browser -> baris yang sah, atau { error }. */
export function cleanItem(b) {
  const s = (v, n) => String(v ?? "").trim().slice(0, n);
  const url = (v) => { const x = s(v, 500); return x && !/^https?:\/\//i.test(x) ? "https://" + x : x; };
  const kind = KINDS[b.kind] ? b.kind : "konten", K = KINDS[kind];
  const it = {
    kind, date: s(b.date, 10), title: s(b.title, 160), channel: s(b.channel, 40), status: s(b.status, 12),
    owner: s(b.owner, 60), owner_email: EMAIL.test(s(b.owner_email, 120)) ? s(b.owner_email, 120).toLowerCase() : "",
    note: s(b.note, 4000), link: url(b.link), time: "", place: "", role: "", audience: "", result_num: null, result_note: s(b.result_note, 300),
    d_need: b.d_need ? 1 : 0, d_who: "", d_name: "", d_due: "", d_status: "", d_link: "", d_brief: "",
  };
  if (!ISO.test(it.date) || isNaN(Date.parse(it.date))) return { error: "Tanggal belum diisi." };
  if (!it.title) return { error: "Judul belum diisi." };
  if (!K.channels.includes(it.channel)) it.channel = "Lainnya";
  if (!K.statuses.includes(it.status)) it.status = K.statuses[0];
  const n = Math.round(Number(String(b.result_num ?? "").replace(/[.\s]/g, "").replace(",", ".")));
  it.result_num = String(b.result_num ?? "").trim() !== "" && n >= 0 && n < 1e12 ? n : null;
  if (kind === "edukasi") {
    it.time = /^\d{2}:\d{2}$/.test(s(b.time, 5)) ? s(b.time, 5) : "";
    it.place = s(b.place, 160); it.audience = s(b.audience, 160);
    it.role = EDU_ROLES.includes(b.role) ? b.role : EDU_ROLES[0];
  }
  if (it.d_need) {
    it.d_who = EMAIL.test(s(b.d_who, 120)) ? s(b.d_who, 120).toLowerCase() : "";
    it.d_name = s(b.d_name, 60); it.d_brief = s(b.d_brief, 2000); it.d_link = url(b.d_link);
    it.d_due = ISO.test(s(b.d_due, 10)) ? s(b.d_due, 10) : it.date;
    it.d_status = DESIGN_STATUSES.includes(b.d_status) ? b.d_status : "belum";
  }
  return it;
}
async function listItems(env, from, to) {
  await ensure(env);
  if (!ISO.test(from) || !ISO.test(to)) return [];
  return (await env.DB.prepare("SELECT * FROM items WHERE date >= ? AND date <= ? ORDER BY date, time, created_at").bind(from, to).all()).results;
}
/** Tugas desain: semua yang belum selesai (tanggal berapa pun) + yang selesai dengan tenggat di rentang itu. */
async function designItems(env, from, to) {
  await ensure(env);
  return (await env.DB.prepare("SELECT * FROM items WHERE d_need = 1 AND (COALESCE(d_status, 'belum') <> 'selesai' OR COALESCE(d_due, date) BETWEEN ? AND ?) ORDER BY COALESCE(d_due, date), created_at LIMIT 500")
    .bind(ISO.test(from) ? from : "0000-00-00", ISO.test(to) ? to : "9999-12-31").all()).results;
}
async function saveItem(env, me, b) {
  await ensure(env);
  const it = cleanItem(b);
  if (it.error) return it;
  const now = new Date().toISOString(), by = who(me), vals = EDIT.map((k) => it[k] ?? null);
  if (b.id) {
    const r = await env.DB.prepare(`UPDATE items SET ${EDIT.map((k) => k + "=?").join(", ")}, updated_by=?, updated_at=? WHERE id=?`).bind(...vals, by, now, String(b.id)).run();
    if (!r.meta.changes) return { error: "Kegiatan ini sudah dihapus orang lain. Muat ulang kalender." };
    return { id: String(b.id) };
  }
  const id = crypto.randomUUID(), cols = ["id", ...EDIT, "created_by", "created_email", "created_at", "updated_by", "updated_at"];
  await env.DB.prepare(`INSERT INTO items (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(",")})`).bind(id, ...vals, by, String(me.e || "").toLowerCase(), now, by, now).run();
  return { id };
}
async function deleteItem(env, me, id) {
  await ensure(env);
  const r = await env.DB.prepare("SELECT created_by, created_email FROM items WHERE id=?").bind(String(id || "")).first();
  if (!r) return { ok: true };
  const mine = r.created_email ? r.created_email === String(me.e || "").toLowerCase() : r.created_by === who(me);
  if (!me.adm && !mine) return { error: "Hanya admin atau pembuat kegiatan ini yang bisa menghapusnya." };
  await env.DB.prepare("DELETE FROM items WHERE id=?").bind(String(id)).run();
  return { ok: true };
}
/** Dicatat saat login: daftar anggota tim untuk pilihan penanggung jawab & desainer. Peran tidak ditimpa. */
async function seen(env, p) {
  const email = String(p.e || "").toLowerCase();
  if (!EMAIL.test(email)) return;
  await ensure(env);
  await env.DB.prepare("INSERT INTO users (email, name, seen_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name, seen_at = excluded.seen_at")
    .bind(email, String(p.n || p.u || email).slice(0, 60), new Date().toISOString()).run();
}
async function users(env) {
  await ensure(env);
  return (await env.DB.prepare("SELECT email, name, role FROM users ORDER BY name").all()).results;
}
async function myRole(env, me) {
  await ensure(env);
  const r = await env.DB.prepare("SELECT role FROM users WHERE email=?").bind(String(me.e || "").toLowerCase()).first();
  return r && ROLES[r.role] ? r.role : "";
}
async function setRole(env, me, role) {
  if (!ROLES[role]) return { error: "Peran tidak dikenal." };
  await seen(env, me);
  await env.DB.prepare("UPDATE users SET role=? WHERE email=?").bind(role, String(me.e || "").toLowerCase()).run();
  return { ok: true };
}

/* =========================================================
   PAKET MINGGUAN
   ========================================================= */
const wib = (d = new Date()) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
export const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Senin & Minggu pekan depan dari tanggal (WIB) tertentu. */
export function nextWeek(today) {
  const dow = new Date(today + "T00:00:00Z").getUTCDay(); // 0 = Minggu
  const mon = addDays(today, dow === 0 ? 1 : 8 - dow);
  return { from: mon, to: addDays(mon, 6) };
}
const getJson = async (svc, path) => {
  if (!svc) throw new Error("service binding belum ada");
  const r = await svc.fetch("https://svc" + path);
  if (!r.ok) throw new Error(path + " HTTP " + r.status);
  return r.json();
};
const settle = async (p) => { try { return { v: await p }; } catch (e) { return { err: String(e.message || e) }; } };

/** Reksa dana: return 1 minggu (dari NAB), return 1 tahun, dan gerak harian tidak biasa dalam 7 hari terakhir. */
async function fundPart(env) {
  const [{ funds = [] }, stab] = await Promise.all([getJson(env.FUND, "/api/funds"), getJson(env.FUND, "/api/stab").catch(() => ({}))]);
  const list = funds.filter((f) => f && f.name && f.nav > 0 && f.navDate);
  // NAB terakhir pada atau sebelum 7 hari sebelum tanggal NAB tiap produk (satu kueri, pencarian lewat kunci utama pid+date)
  const want = list.map((f) => ({ p: String(f.pid), d: addDays(f.navDate, -7) }));
  const old = {};
  if (want.length && env.FUND_DB) {
    const { results } = await env.FUND_DB.prepare("SELECT value->>'p' p, (SELECT nav FROM nav WHERE pid = value->>'p' AND date <= value->>'d' ORDER BY date DESC LIMIT 1) n FROM json_each(?)").bind(JSON.stringify(want)).all();
    for (const r of results) if (r.n > 0) old[r.p] = r.n;
  }
  const navDate = list.map((f) => f.navDate).sort().pop() || null;
  const rows = list.map((f) => {
    const t = f.ret || {}, o = old[f.pid];
    return { pid: f.pid, name: f.name, type: f.type, risk: f.risk || "", min: f.minSubs ?? null, navDate: f.navDate,
      w1: o ? (f.nav / o - 1) * 100 : null, m1: t.m1 ?? null, y1: t.y1 ?? null, y1x: t.y1x ?? null, ytd: t.ytd ?? null, aum: f.aum ?? null };
  });
  // aturan sama dengan peringatan di Home Fund Insight: >= 3x simpangan harian biasanya dan >= 0,1%
  const since = navDate ? addDays(navDate, -7) : "";
  const movers = [];
  for (const f of list) {
    const s = stab[f.pid];
    for (const [d, pct, z] of (s && s.rec) || []) if (d > since && Math.abs(z) >= 3 && Math.abs(pct) >= 0.1) movers.push({ pid: f.pid, name: f.name, type: f.type, d, pct, z, sdd: s.sdd });
  }
  movers.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return { navDate, rows, movers: movers.slice(0, 12) };
}

/** Obligasi: yield tertinggi per jenis dan perubahan yield dibanding sekitar seminggu lalu. */
async function bondPart(env) {
  const [data, hist] = await Promise.all([getJson(env.BOND, "/data/bonds.json"), getJson(env.BOND, "/data/history.json").catch(() => ({ days: {} }))]);
  const bonds = (data.bonds || []).filter((b) => b && b.code && b.yield > 0);
  const days = Object.keys(hist.days || {}).sort(), last = days[days.length - 1];
  const ref = last ? days.filter((d) => d <= addDays(last, -7)).pop() : null, then = ref ? hist.days[ref] : {};
  const today = wib();
  const rows = bonds.filter((b) => !b.maturity || String(b.maturity).slice(0, 10) > today).map((b) => {
    const p = then[b.code];
    return { code: b.code, name: b.name, issuer: b.issuer, type: b.type, coupon: b.coupon, yield: b.yield, price: b.price, rating: b.rating || "",
      maturity: b.maturity ? String(b.maturity).slice(0, 10) : null, min: b.min, syariah: !!b.syariah, best: !!b.best, dy: p && p[1] != null ? b.yield - p[1] : null };
  });
  return { asOf: (data.meta && data.meta.updated_at) || last || null, refDate: ref, rows };
}

/** Agenda pekan depan: agenda makro (Story Generator) + agenda yang ditambahkan tim di Fund Insight. */
async function agendaPart(env, from, to) {
  const out = [];
  const u = macroUrls(env);
  if (u) {
    const get = (url, json) => fetch(url, { signal: AbortSignal.timeout(15000), cf: { cacheTtl: 3600, cacheEverything: true } }).then((r) => (r.ok ? (json ? r.json() : r.text()) : null)).catch(() => null);
    const [js, cal] = await Promise.all([get(u.js), get(u.cal, true)]);
    out.push(...macroItems(js, cal));
  }
  if (env.FUND_DB) {
    const r = await env.FUND_DB.prepare("SELECT v FROM meta WHERE k='agenda'").first().catch(() => null);
    try { out.push(...(r ? JSON.parse(r.v) : [])); } catch (e) {}
  }
  return out.filter((x) => x.d >= from && x.d <= to).sort((a, b) => (a.d + (a.time || "")).localeCompare(b.d + (b.time || "")))
    .map((x) => ({ d: x.d, time: x.time || "", country: x.country || "", t: x.t, k: x.k || "makro" }));
}

async function weekly(env) {
  const today = wib(), wk = nextWeek(today);
  const [f, b, a] = await Promise.all([settle(fundPart(env)), settle(bondPart(env)), settle(agendaPart(env, wk.from, wk.to))]);
  return { at: new Date().toISOString(), today, next: wk, funds: f.v || null, fundsError: f.err || null, bonds: b.v || null, bondsError: b.err || null, agenda: a.v || [], agendaError: a.err || null };
}
let MEM = null;
async function weeklyCached(env, ctx, fresh) {
  if (!fresh && MEM && Date.now() - MEM.t < 10 * 60e3) return MEM.body;
  const cache = caches.default, key = new Request("https://content-planner.cache/api/weekly-v1");
  if (!fresh) { const hit = await cache.match(key); if (hit) { MEM = { t: Date.now(), body: await hit.text() }; return MEM.body; } }
  const data = await weekly(env), body = JSON.stringify(data);
  // hanya disimpan kalau semua bagian berhasil, supaya gangguan sesaat tidak tertahan 10 menit
  if (!data.fundsError && !data.bondsError && !data.agendaError) {
    MEM = { t: Date.now(), body };
    ctx.waitUntil(cache.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=600" } })));
  }
  return body;
}

/* =========================================================
   HALAMAN
   ========================================================= */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
async function page(env, me, mode) {
  const cfg = { mode, me: { name: who(me), email: String(me.e || "").toLowerCase(), adm: !!me.adm, role: await myRole(env, me).catch(() => "") },
    kinds: KINDS, eduRoles: EDU_ROLES, designStatuses: DESIGN_STATUSES, roles: ROLES, hub: String(env.HUB_URL || "").replace(/\/+$/, ""), story: appUrl(env, "story") };
  const head = `<title>${esc(title(env, "Content Planner"))}</title>${profileScript(env)}${themeHead("")}<script>${HUBSSO.onlyInHub(env)}window.PL=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script>`;
  return PAGE.replace("<title>Content Planner</title>", () => head);
}
const json = (v, status = 200) => Response.json(v, { status, headers: { "cache-control": "no-store" } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    if (path === "/logout") return HUBSSO.logout(env);
    if (!HUBSSO.ready(env)) return HUBSSO.notReady();
    const tk = await HUBSSO.ticket(request, env, (p) => seen(env, p)); if (tk) return tk;
    const me = await HUBSSO.user(request, env);
    const isPage = path === "/" || path === "/index.html" || path === "/paket";
    if (!me) return isPage ? HUBSSO.login(request, env) : json({ error: "Belum login atau sesi habis. Muat ulang halaman dari Tool Hub." }, 401);
    if (isPage) {
      return new Response(await page(env, me, path === "/paket" ? "paket" : "kalender"), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": HUBSSO.frame(env), "x-robots-tag": "noindex" },
      });
    }
    try {
      if (request.method === "GET") {
        const from = url.searchParams.get("from") || "", to = url.searchParams.get("to") || "";
        if (path === "/api/items") return json(await (url.searchParams.has("design") ? designItems(env, from, to) : listItems(env, from, to)));
        if (path === "/api/users") return json(await users(env));
      }
      if (path === "/api/weekly" && request.method === "GET") {
        return new Response(await weeklyCached(env, ctx, url.searchParams.has("refresh")), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      }
      if (request.method === "POST") {
        if (!HUBSSO.sameOrigin(request)) return json({ error: "Permintaan ditolak." }, 403);
        const b = await request.json().catch(() => ({}));
        if (path === "/api/items") { const r = await saveItem(env, me, b); return json(r, r.error ? 400 : 200); }
        if (path === "/api/me/role") { const r = await setRole(env, me, b.role); return json(r, r.error ? 400 : 200); }
        if (path === "/api/items/delete") { const r = await deleteItem(env, me, b.id); return json(r, r.error ? 403 : 200); }
        // beberapa rencana sekaligus (dari Paket Mingguan -> "Masukkan ke kalender")
        if (path === "/api/items/bulk") {
          const list = Array.isArray(b.items) ? b.items.slice(0, 20) : [], ids = [];
          for (const it of list) { const r = await saveItem(env, me, { ...it, id: undefined }); if (r.error) return json({ error: r.error, saved: ids.length }, 400); ids.push(r.id); }
          return json({ ids });
        }
      }
    } catch (e) {
      return json({ error: "Gagal: " + (e.message || e) }, 500);
    }
    return new Response("Tidak ditemukan", { status: 404 });
  },
};
