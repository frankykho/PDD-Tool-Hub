// Content Planner — Cloudflare Worker
// - "/"            -> Kalender konten tim (rencana posting per hari: kanal, penanggung jawab, status)
// - "/paket"       -> Paket konten mingguan: rangkuman reksa dana, obligasi, dan agenda minggu depan + draf caption/email
// - "/api/items"   -> rencana konten (GET ?from=&to=, POST simpan, POST /api/items/delete hapus)
// - "/api/weekly"  -> data paket mingguan (disusun saat diminta, cache 10 menit)
// Semua halaman & data hanya untuk yang login lewat Tool Hub. Semua yang punya akses boleh menambah & mengubah;
// menghapus hanya admin Tool Hub atau pembuat rencana itu sendiri.
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
    /** Kembali dari hub membawa ?hub_t=... -> tukar dengan cookie sesi. null kalau alamat tidak membawa tiket. */
    async ticket(request, env) {
      const url = new URL(request.url), t = url.searchParams.get("hub_t");
      if (!t) return null;
      const p = await open(env, t); url.searchParams.delete("hub_t");
      if (!p) return go(url.pathname + url.search);
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
   RENCANA KONTEN (D1: planner-db)
   ========================================================= */
export const CHANNELS = ["IG Story", "IG Feed", "IG Reels", "TikTok", "YouTube", "Email", "WA Broadcast", "WA Channel", "Website", "Lainnya"];
export const STATUSES = ["ide", "draf", "review", "terbit"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, date TEXT NOT NULL, title TEXT NOT NULL, channel TEXT, status TEXT, owner TEXT,
      note TEXT, link TEXT, created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT)`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS items_date ON items (date)"),
  ]);
  ready = true;
}
const who = (me) => me.n || me.u || me.e;
/** Isian dari browser -> baris yang sah, atau { error }. */
export function cleanItem(b) {
  const s = (v, n) => String(v ?? "").trim().slice(0, n);
  const it = { date: s(b.date, 10), title: s(b.title, 160), channel: s(b.channel, 40), status: s(b.status, 10), owner: s(b.owner, 60), note: s(b.note, 2000), link: s(b.link, 500) };
  if (!ISO.test(it.date) || isNaN(Date.parse(it.date))) return { error: "Tanggal belum diisi." };
  if (!it.title) return { error: "Judul belum diisi." };
  if (!CHANNELS.includes(it.channel)) it.channel = "Lainnya";
  if (!STATUSES.includes(it.status)) it.status = "ide";
  if (it.link && !/^https?:\/\//i.test(it.link)) it.link = "https://" + it.link;
  return it;
}
async function listItems(env, from, to) {
  await ensure(env);
  if (!ISO.test(from) || !ISO.test(to)) return [];
  return (await env.DB.prepare("SELECT * FROM items WHERE date >= ? AND date <= ? ORDER BY date, created_at").bind(from, to).all()).results;
}
async function saveItem(env, me, b) {
  await ensure(env);
  const it = cleanItem(b);
  if (it.error) return it;
  const now = new Date().toISOString(), by = who(me);
  if (b.id) {
    const r = await env.DB.prepare("UPDATE items SET date=?, title=?, channel=?, status=?, owner=?, note=?, link=?, updated_by=?, updated_at=? WHERE id=?")
      .bind(it.date, it.title, it.channel, it.status, it.owner, it.note, it.link, by, now, String(b.id)).run();
    if (!r.meta.changes) return { error: "Rencana ini sudah dihapus orang lain. Muat ulang kalender." };
    return { id: String(b.id) };
  }
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO items (id, date, title, channel, status, owner, note, link, created_by, created_at, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, it.date, it.title, it.channel, it.status, it.owner, it.note, it.link, by, now, by, now).run();
  return { id };
}
async function deleteItem(env, me, id) {
  await ensure(env);
  const r = await env.DB.prepare("SELECT created_by FROM items WHERE id=?").bind(String(id || "")).first();
  if (!r) return { ok: true };
  if (!me.adm && r.created_by !== who(me)) return { error: "Hanya admin atau pembuat rencana ini yang bisa menghapusnya." };
  await env.DB.prepare("DELETE FROM items WHERE id=?").bind(String(id)).run();
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
function page(env, me, mode) {
  const cfg = { mode, me: { name: who(me), adm: !!me.adm }, channels: CHANNELS, statuses: STATUSES, hub: String(env.HUB_URL || "").replace(/\/+$/, ""), story: appUrl(env, "story") };
  const head = `<title>${esc(title(env, "Content Planner"))}</title>${profileScript(env)}${themeHead("")}<script>${HUBSSO.onlyInHub(env)}window.PL=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script>`;
  return PAGE.replace("<title>Content Planner</title>", () => head);
}
const json = (v, status = 200) => Response.json(v, { status, headers: { "cache-control": "no-store" } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    if (path === "/logout") return HUBSSO.logout(env);
    if (!HUBSSO.ready(env)) return HUBSSO.notReady();
    const tk = await HUBSSO.ticket(request, env); if (tk) return tk;
    const me = await HUBSSO.user(request, env);
    const isPage = path === "/" || path === "/index.html" || path === "/paket";
    if (!me) return isPage ? HUBSSO.login(request, env) : json({ error: "Belum login atau sesi habis. Muat ulang halaman dari Tool Hub." }, 401);
    if (isPage) {
      return new Response(page(env, me, path === "/paket" ? "paket" : "kalender"), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": HUBSSO.frame(env), "x-robots-tag": "noindex" },
      });
    }
    try {
      if (path === "/api/items" && request.method === "GET") return json(await listItems(env, url.searchParams.get("from") || "", url.searchParams.get("to") || ""));
      if (path === "/api/weekly" && request.method === "GET") {
        return new Response(await weeklyCached(env, ctx, url.searchParams.has("refresh")), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      }
      if (request.method === "POST") {
        if (!HUBSSO.sameOrigin(request)) return json({ error: "Permintaan ditolak." }, 403);
        const b = await request.json().catch(() => ({}));
        if (path === "/api/items") { const r = await saveItem(env, me, b); return json(r, r.error ? 400 : 200); }
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
