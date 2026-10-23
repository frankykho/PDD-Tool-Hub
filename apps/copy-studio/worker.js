// Copy Studio — Cloudflare Worker
// Tempat Copywriter & Social Media Specialist menulis dan menyiapkan konten, di dalam Tool Hub:
// - "/"                    halaman tim: Cek Caption, Variasi A/B, Teks Aplikasi, Naskah Reels/TikTok, Subtitle, Ubah Ukuran, Panduan Gaya
// - GET  /api/style        panduan gaya & glosarium
// - POST /api/style        simpan panduan gaya (editor & admin)
// - POST /api/ai           tulis dengan AI: kind = ab | app | reels | fix (batas per hari: COPY_AI_DAILY)
// - POST /api/transcribe   {audio: WAV 16 kHz mono base64} -> potongan subtitle lewat Workers AI Whisper (batas: COPY_STT_DAILY potongan)
// - GET  /__hub/style      panduan gaya untuk tool lain (service binding, header x-hub-key = SSO_SECRET)
// Cek kepatuhan & panjang teks: shared/compliance.js, dijalankan di browser. Ubah ukuran gambar & potong audio juga di browser.
import { title, profileScript, profile } from "../../shared/profile.js";
import { themeHead } from "../../shared/theme.js";
import { ai, AiError } from "../../shared/ai.js";
import { hubFeedAllowed } from "../../shared/hubfeed.js";
import { complianceScript, PLATFORMS, RULES_PROMPT } from "../../shared/compliance.js";
import PAGE from "./page.html";

/* =========================================================
   LOGIN LEWAT TOOL HUB
   ========================================================= */
const HUBSSO = (() => {
  const APP = "copy", COOKIE = "hub_" + APP, HOURS = 8, te = new TextEncoder();
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
   PANDUAN GAYA (D1: copy-db, tabel meta)
   ========================================================= */
export const DEFAULT_STYLE = {
  guide: [
    "Nada: ramah, jelas, dan meyakinkan tanpa melebih-lebihkan. Edukatif dulu, jualan belakangan.",
    "Sapaan: \"kamu\" untuk media sosial, \"Anda\" untuk email dan dokumen resmi.",
    "Kalimat pendek (maks. ±20 kata). Satu ide per kalimat. Istilah teknis dijelaskan singkat saat pertama muncul.",
    "Angka selalu dengan sumber dan periode (mis. \"return 1 tahun per 30 Sep 2026, sumber: fund fact sheet\").",
    "Emoji secukupnya (maks. 3 per caption), tidak di tengah angka.",
    "Akhiri dengan satu ajakan yang jelas (unduh aplikasi, pelajari, simak), bukan ajakan membeli saham tertentu.",
  ].join("\n"),
  glossary: [
    { bad: "reksadana", good: "reksa dana", note: "" },
    { bad: "resiko", good: "risiko", note: "" },
    { bad: "deviden", good: "dividen", note: "" },
    { bad: "analisa", good: "analisis", note: "" },
    { bad: "praktek", good: "praktik", note: "" },
    { bad: "aktifitas", good: "aktivitas", note: "" },
    { bad: "obligasi retail", good: "obligasi ritel", note: "" },
    { bad: "sukuk retail", good: "sukuk ritel", note: "" },
  ],
};
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)").run();
  ready = true;
}
async function getStyle(env) {
  await ensure(env);
  const r = await env.DB.prepare("SELECT v FROM meta WHERE k='style'").first();
  let s = null; try { s = r && JSON.parse(r.v); } catch {}
  return s && typeof s === "object" ? { ...DEFAULT_STYLE, ...s } : { ...DEFAULT_STYLE };
}
const str = (v, n) => (typeof v === "string" ? v : v == null ? "" : String(v)).trim().slice(0, n);
/** Bersihkan kiriman panduan gaya: teks panduan + glosarium (maks. 300 baris, kata salah unik). */
export function cleanStyle(b) {
  const seen = new Set(), glossary = [];
  for (const g of Array.isArray(b && b.glossary) ? b.glossary : []) {
    const bad = str(g && g.bad, 60), key = bad.toLowerCase();
    if (!bad || seen.has(key)) continue;
    seen.add(key);
    glossary.push({ bad, good: str(g.good, 60), note: str(g.note, 200) });
    if (glossary.length >= 300) break;
  }
  return { guide: str(b && b.guide, 6000), glossary };
}

/** Hitung pemakaian per hari (WIB); false kalau sudah melewati batas. */
async function spend(env, kind, limit, n = 1) {
  await ensure(env);
  const key = `${kind}:${new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)}`;
  const r = await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind(key).first();
  const used = Number(r && r.v) || 0;
  if (used + n > limit) return false;
  await env.DB.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(key, String(used + n)).run();
  return true;
}

/* =========================================================
   AI
   ========================================================= */
export const AB_TYPES = {
  headline: "judul konten / headline (maks. 70 karakter)",
  subject: "subject email (maks. 45 karakter)",
  hook: "kalimat pembuka (hook) caption atau video (maks. 120 karakter)",
  cta: "ajakan bertindak / CTA (maks. 60 karakter)",
};
const ANGLES = "manfaat, pertanyaan, angka/data, cerita singkat, rasa ingin tahu, kontras/mitos-vs-fakta";

function system(env, style) {
  const p = profile(env), co = p.brand.company || "perusahaan sekuritas", app = p.app.name;
  const gl = style.glossary.filter((g) => g.good).map((g) => `"${g.good}" (bukan "${g.bad}")`).join(", ");
  const ban = style.glossary.filter((g) => !g.good).map((g) => `"${g.bad}"`).join(", ");
  return [
    `Kamu copywriter senior untuk ${co}${app ? ` (aplikasi investasi ${app})` : ""}. Tulis dalam Bahasa Indonesia.`,
    style.guide ? "Panduan gaya tim:\n" + style.guide : "",
    gl ? "Ejaan wajib: " + gl + "." : "",
    ban ? "Kata yang tidak boleh dipakai: " + ban + "." : "",
    RULES_PROMPT,
    "Jawab HANYA dengan JSON yang sah, tanpa teks lain dan tanpa ```.",
  ].filter(Boolean).join("\n\n");
}

/** Susun perintah untuk satu jenis tulisan. null kalau masukan tidak sah. */
export function prompt(kind, b) {
  if (kind === "ab") {
    const type = AB_TYPES[b.type] ? b.type : "headline", n = Math.min(8, Math.max(3, Number(b.n) || 5)), brief = str(b.brief, 3000);
    if (!brief) return null;
    return { max: 1500, user: `Buat ${n} variasi ${AB_TYPES[type]} untuk diuji A/B.\nPlatform: ${PLATFORMS[b.platform] ? PLATFORMS[b.platform].label : "umum"}.\nBrief:\n${brief}\n\nSetiap variasi memakai sudut berbeda (pilih dari: ${ANGLES}) dan patuhi batas karakternya.\nFormat: {"items":[{"text":"","angle":""}]}` };
  }
  if (kind === "app") {
    const brief = str(b.brief, 3000);
    if (!brief) return null;
    return { max: 1500, user: `Buat teks pendek di dalam aplikasi dari brief ini:\n${brief}\n${b.goal ? "Tujuan: " + str(b.goal, 200) + "\n" : ""}\n- 3 push notification: title maks. 40 karakter, body maks. 110 karakter. Boleh 1 emoji di title.\n- 3 banner in-app: title maks. 40 karakter, body maks. 90 karakter, cta maks. 18 karakter.\nPromo selalu sebut \"S&K berlaku\" di body.\nFormat: {"push":[{"title":"","body":""}],"inapp":[{"title":"","body":"","cta":""}]}` };
  }
  if (kind === "reels") {
    const topic = str(b.topic, 500), source = str(b.source, 8000), dur = [15, 30, 60, 90].includes(Number(b.duration)) ? Number(b.duration) : 30;
    if (!topic && !source) return null;
    const plat = { reels: "Instagram Reels", tiktok: "TikTok", shorts: "YouTube Shorts" }[b.platform] || "Instagram Reels";
    return { max: 2500, user: `Tulis naskah video vertikal ${plat} berdurasi ${dur} detik.\n${topic ? "Topik: " + topic + "\n" : ""}${b.audience ? "Penonton: " + str(b.audience, 200) + "\n" : ""}${source ? "Bahan (gunakan hanya fakta dari sini, jangan menyalin kalimatnya):\n" + source + "\n" : ""}\nAturan naskah:\n- hook: kalimat 0–3 detik pertama yang membuat orang berhenti scroll.\n- scenes: 4–8 adegan; time (mis. \"0–3 dtk\"), visual (apa yang tampil/direkam), voiceover (yang diucapkan), onscreen (teks di layar, maks. 8 kata).\n- Total voiceover pas untuk ${dur} detik (±2,5 kata per detik).\n- cta: satu ajakan di akhir. caption: caption posting (maks. 600 karakter). hashtags: 3–6 tagar. notes: catatan produksi singkat (musik, b-roll, risiko yang perlu disebut).\nFormat: {"title":"","hook":"","scenes":[{"time":"","visual":"","voiceover":"","onscreen":""}],"cta":"","caption":"","hashtags":[],"notes":""}` };
  }
  if (kind === "fix") {
    const text = str(b.text, 5000);
    if (!text) return null;
    const issues = (Array.isArray(b.issues) ? b.issues : []).map((x) => "- " + str(x, 300)).slice(0, 20).join("\n");
    return { max: 2000, user: `Perbaiki teks ${PLATFORMS[b.platform] ? "untuk " + PLATFORMS[b.platform].label : ""} berikut supaya patuh aturan dan panduan gaya, tanpa mengubah maksud, fakta, angka, dan link.\n${issues ? "Masalah yang ditemukan:\n" + issues + "\n" : ""}${PLATFORMS[b.platform] ? `Panjang maks. ${PLATFORMS[b.platform].max} karakter.\n` : ""}Teks:\n${text}\n\nFormat: {"text":""}` };
  }
  return null;
}

/** Ambil JSON dari jawaban AI dan rapikan menurut jenisnya. */
export function parse(kind, raw) {
  const t = String(raw || ""), a = t.indexOf("{"), z = t.lastIndexOf("}");
  let j = null; try { if (a >= 0 && z > a) j = JSON.parse(t.slice(a, z + 1)); } catch {}
  if (!j || typeof j !== "object") throw new AiError("Jawaban AI tidak berisi JSON. Coba lagi.");
  const list = (v, n) => (Array.isArray(v) ? v : []).slice(0, n);
  if (kind === "ab") return { items: list(j.items, 8).map((x) => ({ text: str(x && x.text, 300), angle: str(x && x.angle, 60) })).filter((x) => x.text) };
  if (kind === "app") return {
    push: list(j.push, 5).map((x) => ({ title: str(x && x.title, 80), body: str(x && x.body, 200) })).filter((x) => x.title || x.body),
    inapp: list(j.inapp, 5).map((x) => ({ title: str(x && x.title, 80), body: str(x && x.body, 200), cta: str(x && x.cta, 40) })).filter((x) => x.title || x.body),
  };
  if (kind === "reels") return {
    title: str(j.title, 150), hook: str(j.hook, 300), cta: str(j.cta, 200), caption: str(j.caption, 2200), notes: str(j.notes, 1000),
    hashtags: list(j.hashtags, 10).map((h) => str(h, 40).replace(/^#?/, "#").replace(/\s+/g, "")).filter((h) => h.length > 1),
    scenes: list(j.scenes, 12).map((s) => ({ time: str(s && s.time, 30), visual: str(s && s.visual, 400), voiceover: str(s && s.voiceover, 600), onscreen: str(s && s.onscreen, 120) })),
  };
  if (kind === "fix") return { text: str(j.text, 6000) };
  return {};
}

/** Satu potongan audio -> [{start, end, text}] (detik, relatif terhadap awal potongan). */
export function segments(r) {
  const segs = (r && Array.isArray(r.segments) ? r.segments : []).map((s) => ({ start: +s.start || 0, end: +s.end || 0, text: str(s.text, 500) })).filter((s) => s.text);
  if (segs.length) return segs;
  const text = str(r && r.text, 2000);
  return text ? [{ start: 0, end: Number(r.transcription_info && r.transcription_info.duration) || 0, text }] : [];
}

/* =========================================================
   HALAMAN
   ========================================================= */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const html = (body, extra = {}) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex", ...extra } });
const json = (v, status = 200) => Response.json(v, { status, headers: { "cache-control": "no-store" } });
function page(env, cfg) {
  const head = `<title>${esc(title(env, "Copy Studio"))}</title>${profileScript(env)}${themeHead("")}${complianceScript()}<script>${HUBSSO.onlyInHub(env)}window.CS=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script>`;
  return PAGE.replace("<title>Copy Studio</title>", () => head);
}
/** Kode produk sendiri yang boleh disebut bersama ajakan "beli" (ETF di profil + tools.copy.allow). */
const allowCodes = (env) => { const t = profile(env).tools || {}; return [...Object.keys((t.etf && t.etf.facts) || {}), ...(((t.copy && t.copy.allow) || []))].map((c) => String(c).toUpperCase()); };

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    try {
      if (path === "/__hub/style") return hubFeedAllowed(request, env) ? json(await getStyle(env)) : new Response("forbidden", { status: 403 });
      if (path === "/logout") return HUBSSO.logout(env);
      if (!HUBSSO.ready(env)) return HUBSSO.notReady();
      const tk = await HUBSSO.ticket(request, env); if (tk) return tk;
      const me = await HUBSSO.user(request, env);
      const isPage = path === "/" || path === "/index.html";
      if (!me) return isPage ? HUBSSO.login(request, env) : json({ error: "Belum login atau sesi habis. Muat ulang halaman dari Tool Hub." }, 401);
      const role = me.adm ? "admin" : me.a, canEdit = role === "admin" || role === "editor", who = me.n || me.u || me.e;
      if (isPage) {
        const p = profile(env);
        return html(page(env, { canEdit, style: await getStyle(env), allow: allowCodes(env), abTypes: AB_TYPES,
          brand: { hashtags: p.brand.hashtags, license: p.brand.license, disclaimer: p.brand.disclaimer, app: p.app.name } }), { "content-security-policy": HUBSSO.frame(env) });
      }
      if (request.method === "GET" && path === "/api/style") return json(await getStyle(env));
      if (request.method === "POST") {
        if (!HUBSSO.sameOrigin(request)) return json({ error: "Permintaan ditolak." }, 403);
        if (path === "/api/style") {
          if (!canEdit) return json({ error: "Hanya editor atau admin yang bisa mengubah panduan gaya." }, 403);
          const s = { ...cleanStyle(await request.json().catch(() => ({}))), updated_by: who, updated_at: new Date().toISOString() };
          await ensure(env);
          await env.DB.prepare("INSERT INTO meta (k, v) VALUES ('style', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify(s)).run();
          return json({ ok: true, style: s });
        }
        if (path === "/api/ai") {
          const b = await request.json().catch(() => ({}));
          const q = prompt(b.kind, b);
          if (!q) return json({ error: "Isi dulu brief atau teksnya." }, 400);
          if (!(await spend(env, "ai", Number(env.COPY_AI_DAILY) || 60))) return json({ error: "Batas tulisan AI hari ini sudah tercapai. Coba lagi besok." }, 429);
          const { text, model } = await ai(env, system(env, await getStyle(env)), q.user, q.max, undefined, { json: true, temperature: b.kind === "fix" ? 0.3 : 0.9 });
          return json({ result: parse(b.kind, text), model });
        }
        if (path === "/api/transcribe") {
          const b = await request.json().catch(() => ({}));
          const audio = typeof b.audio === "string" ? b.audio : "";
          if (!audio || audio.length > 1.6e6 || !/^[A-Za-z0-9+/=]+$/.test(audio.slice(0, 200))) return json({ error: "Potongan audio tidak sah (maks. ±1 MB)." }, 400);
          if (!env.AI) return json({ error: "Binding Workers AI (AI) belum dipasang." }, 500);
          if (!(await spend(env, "stt", Number(env.COPY_STT_DAILY) || 360))) return json({ error: "Batas subtitle hari ini sudah tercapai. Coba lagi besok." }, 429);
          try {
            const r = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio, ...(/^[a-z]{2}$/.test(b.lang || "") ? { language: b.lang } : {}), vad_filter: true });
            return json({ segments: segments(r) });
          } catch (e) {
            const m = (e && e.message) || String(e);
            return json({ error: /4006|neuron|quota|allocation/i.test(m) ? "Kuota AI gratis hari ini sudah habis. Kuota terisi lagi pukul 07.00 WIB." : "Whisper gagal: " + m }, 502);
          }
        }
      }
    } catch (e) {
      if (e instanceof AiError) return json({ error: e.message }, 502);
      return json({ error: "Gagal: " + (e.message || e) }, 500);
    }
    return new Response("Tidak ditemukan", { status: 404 });
  },
};
