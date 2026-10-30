// Event & Lead — Cloudflare Worker
// Pendaftaran peserta event (nasabah daftar sendiri lewat link / QR), konfirmasi oleh Sales lewat WhatsApp, absen di hari acara.
// - "/"                -> halaman tim (di dalam Tool Hub): daftar event, form, link & QR, peserta, ekspor Excel
// - "/api/*"           -> data event & peserta (login lewat Tool Hub)
// - "/__hub/users" (POST) -> anggota, daftar cabang, dan tim & role dari Tool Hub
// Hak akses: admin hub semua event; Head tim regional semua event regional; Sales / GI coordinator event cabangnya;
// pemegang akses di luar tim regional hanya event buatannya (+ Head timnya).
import { HUB_FEED, hubFeedAllowed, hubPushAllowed } from "../../shared/hubfeed.js";
import { cleanOrg, roleIn, teamIn, isRegional } from "../../shared/jobs.js";

/* =========================================================
   LOGIN LEWAT TOOL HUB
   ========================================================= */
const HUBSSO = (() => {
  const APP = "event", COOKIE = "hub_" + APP, HOURS = 8, te = new TextEncoder();
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
   AKSES
   ========================================================= */
/** Boleh melihat event ini (dan pesertanya)? me = sesi { e, n, j, c, adm }, ev = baris event. */
export function canSee(me, ev, org) {
  if (!me || !ev) return false;
  if (me.adm) return true;
  const rl = roleIn(org, me.j), e = String(me.e || "").toLowerCase();
  if (isRegional(org, me.j, me.adm)) {
    if (rl && rl.head && ev.branch) return true;
    if (ev.branch && ev.branch === me.c) return true;
  }
  if (ev.creator_email && ev.creator_email === e) return true;
  return !!(rl && rl.head && rl.team && rl.team === ev.creator_team);
}
/** Boleh mengubah event & pesertanya: sama dengan boleh melihat (dipisah supaya mudah diubah nanti). */
export const canManage = (me, ev, org) => canSee(me, ev, org);
/** Boleh menghapus peserta: admin hub atau Head tim mana pun. */
export const canDelete = (me, org) => !!(me && (me.adm || (roleIn(org, me.j) || {}).head));

/* =========================================================
   DATA (D1: event-db)
   ========================================================= */
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, code TEXT UNIQUE, acode TEXT UNIQUE, title TEXT, mode TEXT, date TEXT, time_start TEXT, time_end TEXT, place TEXT, online_url TEXT, "
      + "branch TEXT, region TEXT, descr TEXT, quota INTEGER, open INTEGER DEFAULT 1, wa_tpl TEXT, item_id TEXT, item_kind TEXT, item_gone INTEGER DEFAULT 0, status TEXT, "
      + "creator_email TEXT, creator_name TEXT, creator_job TEXT, creator_team TEXT, created_at TEXT, updated_at TEXT, "
      + "purged INTEGER DEFAULT 0, n_reg INTEGER DEFAULT 0, n_conf INTEGER DEFAULT 0, n_hadir INTEGER DEFAULT 0, n_walkin INTEGER DEFAULT 0)"),
    // data pribadi peserta: satu nomor HP satu baris per event
    env.DB.prepare("CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, name TEXT, phone TEXT, email TEXT, is_client INTEGER, client_code TEXT, "
      + "status TEXT, walkin INTEGER DEFAULT 0, src TEXT, consent_at TEXT, consent_ver INTEGER, created_at TEXT, updated_at TEXT, updated_by TEXT, UNIQUE (event_id, phone))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT NOT NULL, at TEXT, by_name TEXT, from_status TEXT, to_status TEXT)"),
    // batas kiriman form publik per IP per jam (UTC)
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hits (ip TEXT, hour TEXT, n INTEGER, PRIMARY KEY (ip, hour))"),
    // pengaturan: org, branches, users (dari Tool Hub), consent (teks persetujuan), purged_at
    env.DB.prepare("CREATE TABLE IF NOT EXISTS cfg (k TEXT PRIMARY KEY, v TEXT)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS people_event ON people (event_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS history_person ON history (person_id)"),
  ]);
  ready = true;
}
const json = (v, status = 200) => Response.json(v, { status, headers: { "cache-control": "no-store" } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    if (path === "/logout") return HUBSSO.logout(env);
    if (!HUBSSO.ready(env)) return HUBSSO.notReady();
    const tk = await HUBSSO.ticket(request, env); if (tk) return tk;
    const me = await HUBSSO.user(request, env);
    if (!me) return path.startsWith("/api/") ? json({ error: "Sesi habis. Muat ulang halaman." }, 401) : HUBSSO.login(request, env);
    await ensure(env);
    return new Response("Tidak ditemukan", { status: 404 });
  },
};
