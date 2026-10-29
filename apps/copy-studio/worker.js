// Copy Studio — Cloudflare Worker
// Tempat Copywriter & Social Media Specialist menulis dan menyiapkan konten, di dalam Tool Hub:
// - "/"                    halaman tim: Cek Caption, Variasi A/B, Teks Aplikasi, What's New, Naskah Reels/TikTok, Subtitle, Ubah Ukuran, Panduan Gaya
// - GET  /api/style        panduan gaya & glosarium
// - POST /api/style        simpan panduan gaya (editor & admin)
// - POST /api/ai           tulis dengan AI: kind = ab | app | wn (What's New fitur aplikasi) | reels | fix (batas per hari: COPY_AI_DAILY)
// - POST /api/transcribe   {audio: WAV 16 kHz mono base64} -> potongan subtitle lewat Workers AI Whisper (batas: COPY_STT_DAILY potongan)
// - GET  /__hub/style      panduan gaya untuk tool lain (service binding, header x-hub-key = SSO_SECRET)
// Cek kepatuhan & panjang teks: shared/compliance.js, dijalankan di browser. Ubah ukuran gambar & potong audio juga di browser.
import { title, profileScript, profile } from "../../shared/profile.js";
import { themeHead } from "../../shared/theme.js";
import { ai, AiError } from "../../shared/ai.js";
import { hubFeedAllowed } from "../../shared/hubfeed.js";
import { complianceScript, PLATFORMS, RULES_PROMPT } from "../../shared/compliance.js";
import PAGE from "./page.html";
import EN from "./i18n.js";

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
/** Petunjuk khusus per jenis teks A/B. */
const AB_HINT = {
  headline: "Taruh manfaat atau kata kunci di 3–5 kata pertama.",
  subject: "Hindari pemicu spam (huruf kapital semua, \"GRATIS\", tanda seru beruntun); angka, pertanyaan, atau rasa ingin tahu biasanya menaikkan open rate.",
  hook: "Harus bisa dipahami tanpa konteks; jangan buka dengan salam, nama brand, atau \"Halo sobat\".",
  cta: "Mulai dengan kata kerja dan sebut langkah atau manfaat berikutnya (mis. \"Cek simulasinya\", \"Mulai dari Rp10 ribu\").",
};
/** Formula copywriting untuk variasi A/B; tiap variasi memakai satu formula yang berbeda. */
const FORMULAS = "manfaat langsung, pertanyaan, angka spesifik, mitos vs fakta, kesalahan umum, \"kalau kamu…\", cerita mini, rasa ingin tahu, perbandingan, PAS (masalah–dampak–solusi)";

/** Nada tulisan yang bisa dipilih di tiap menu AI. */
export const TONES = {
  santai: { label: "Santai", desc: "santai dan akrab seperti teman yang paham investasi; sapa pembaca dengan \"kamu\"" },
  semangat: { label: "Semangat", desc: "energik dan memotivasi, kalimat pendek bertenaga; tetap tanpa janji hasil" },
  edukatif: { label: "Edukatif", desc: "jelas dan sabar seperti mentor; satu konsep, satu contoh angka sederhana" },
  profesional: { label: "Profesional", desc: "rapi, ringkas, dan meyakinkan untuk investor berpengalaman; sapa pembaca dengan \"Anda\"" },
  syariah: { label: "Syariah", desc: "hangat dan santun, istilah syariah tepat (akad, sesuai prinsip syariah, DSN-MUI) tanpa menggurui" },
};
const toneLine = (b) => (TONES[b && b.tone] ? `Nada: ${TONES[b.tone].desc}.\n` : "");

/** Pola hook (kalimat pembuka yang menghentikan scroll) dengan contoh yang patuh aturan. */
export const HOOKS = [
  ["pertanyaan langsung", "Masih nyimpen semua uang di tabungan?"],
  ["angka spesifik", "Rp10 ribu sudah cukup untuk mulai reksa dana."],
  ["mitos vs fakta", "Katanya investasi harus modal besar. Faktanya?"],
  ["kesalahan umum", "3 kesalahan pemula saat pertama beli saham."],
  ["kalau kamu…", "Kalau kamu baru gajian, baca ini dulu."],
  ["sebelum–sesudah", "Dulu bingung mulai dari mana. Sekarang tiap bulan rutin investasi."],
  ["rasa ingin tahu", "Ini alasan banyak pemula mulai dari reksa dana pasar uang."],
  ["cerita mini", "Rina mulai investasi Rp50 ribu per minggu. Ini yang dia pelajari."],
  ["langkah/daftar", "Cara mulai investasi dalam 3 langkah."],
  ["perbandingan", "Deposito vs reksa dana pasar uang: mana yang cocok untuk dana darurat?"],
];
/** Cara menulis copy yang menjual; aturan kepatuhan (RULES_PROMPT) tetap di atasnya. */
const CRAFT = [
  "Cara menulis copy yang menjual:",
  "- Kalimat pertama adalah hook: buat orang berhenti scroll dalam 1–2 detik. Pola yang bisa dipakai: " + HOOKS.map(([n, e]) => `${n} ("${e}")`).join("; ") + ".",
  "- Manfaat dulu, fitur kemudian: tulis apa yang pembaca dapat atau rasakan, bukan hanya nama fitur.",
  "- Spesifik mengalahkan umum: angka, waktu, langkah, dan situasi nyata pembaca (gajian, dana darurat, THR, biaya sekolah, liburan).",
  "- Satu pesan utama per teks. Kalimat pendek, kata kerja aktif, ritme bervariasi; kalimat satu-dua kata boleh untuk penekanan.",
  "- Bicara ke satu orang dengan bahasa sehari-hari yang natural, bukan bahasa brosur atau siaran pers.",
  "- Satu CTA yang jelas, diawali kata kerja: Mulai, Cek, Pelajari, Simpan, Bagikan, Buka aplikasi.",
  "- Hindari klise dan gaya tulisan AI: \"di era digital\", \"tidak hanya … tetapi juga\", \"mari kita\", \"yuk simak\", \"kesempatan emas\", \"solusi terbaik\", \"wujudkan impianmu\", \"tunggu apa lagi\", \"jangan sampai ketinggalan\", tanda seru beruntun.",
  "- Urgensi hanya bila nyata (tanggal penawaran, kuota resmi); jangan membuat FOMO palsu.",
  "- Emoji secukupnya dan bermakna (maks. 3), tidak menggantikan kata penting.",
  "- Sebelum menjawab, baca ulang tiap teks: ganti kata generik dengan yang konkret dan buang kata yang tidak menambah makna.",
].join("\n");

function system(env, style) {
  const p = profile(env), co = p.brand.company || "perusahaan sekuritas", app = p.app.name;
  const gl = style.glossary.filter((g) => g.good).map((g) => `"${g.good}" (bukan "${g.bad}")`).join(", ");
  const ban = style.glossary.filter((g) => !g.good).map((g) => `"${g.bad}"`).join(", ");
  return [
    `Kamu copywriter senior untuk ${co}${app ? ` (aplikasi investasi ${app})` : ""}: tulisanmu menarik, terasa manusiawi, dan membuat orang bertindak. Tulis dalam Bahasa Indonesia.`,
    CRAFT,
    style.guide ? "Panduan gaya tim (utamakan bila berbeda dengan cara menulis di atas):\n" + style.guide : "",
    gl ? "Ejaan wajib: " + gl + "." : "",
    ban ? "Kata yang tidak boleh dipakai: " + ban + "." : "",
    RULES_PROMPT,
    "Jawab HANYA dengan JSON yang sah, tanpa teks lain dan tanpa ```.",
  ].filter(Boolean).join("\n\n");
}

/** Naskah YouTube: durasi (menit) yang bisa dipilih, format video, dan kecepatan bicara untuk menghitung panjang & penanda bab. */
export const YT_DURATIONS = [3, 5, 8, 10, 12, 15];
export const YT_FORMATS = {
  explainer: "edukasi / penjelasan konsep",
  list: "tips / daftar (mis. \"5 cara…\")",
  review: "ulasan produk (fakta hanya dari bahan)",
  story: "studi kasus / cerita",
  qa: "tanya-jawab (menjawab pertanyaan yang sering ditanyakan penonton)",
};
export const YT_WPM = 140;
const words = (s) => (String(s || "").match(/\S+/g) || []).length;

/** Susun perintah untuk satu jenis tulisan. null kalau masukan tidak sah. */
export function prompt(kind, b) {
  if (kind === "ab") {
    const type = AB_TYPES[b.type] ? b.type : "headline", n = Math.min(8, Math.max(3, Number(b.n) || 5)), brief = str(b.brief, 3000);
    if (!brief) return null;
    return { max: 2000, user: `Buat ${n} variasi ${AB_TYPES[type]} untuk diuji A/B.\nPlatform: ${PLATFORMS[b.platform] ? PLATFORMS[b.platform].label : "umum"}.\n${toneLine(b)}Brief:\n${brief}\n\nSetiap variasi memakai formula yang berbeda (pilih dari: ${FORMULAS}) sehingga hasil ujinya benar-benar membandingkan pendekatan, bukan sekadar ganti kata. ${AB_HINT[type]} Patuhi batas karakternya.\n- angle: nama formula yang dipakai.\n- why: alasan singkat (maks. 100 karakter) kenapa versi ini bisa menang dan untuk pembaca seperti apa.\nFormat: {"items":[{"text":"","angle":"","why":""}]}` };
  }
  if (kind === "app") {
    const brief = str(b.brief, 3000);
    if (!brief) return null;
    return { max: 1800, user: `Buat teks pendek di dalam aplikasi dari brief ini:\n${brief}\n${b.goal ? "Tujuan: " + str(b.goal, 200) + "\n" : ""}${toneLine(b)}\n- 3 push notification: title maks. 40 karakter, body maks. 110 karakter. Boleh 1 emoji di title. Ketiganya memakai pendekatan berbeda: manfaat, rasa ingin tahu, dan pengingat/tenggat (tenggat hanya bila ada di brief).\n- Title harus membuat orang ingin membuka notifikasi; body menjelaskan apa yang didapat dan langkah berikutnya.\n- 3 banner in-app: title maks. 40 karakter, body maks. 90 karakter, cta maks. 18 karakter diawali kata kerja.\nPromo selalu sebut \"S&K berlaku\" di body.\nFormat: {"push":[{"title":"","body":""}],"inapp":[{"title":"","body":"","cta":""}]}` };
  }
  if (kind === "wn") {
    const name = str(b.name, 120), notes = str(b.notes, 5000);
    if (!name && !notes) return null;
    // langkah kasar dipertahankan per baris (str() meratakan baris baru)
    const steps = String(b.steps ?? "").split(/\r?\n/).map((s) => str(s, 300)).filter(Boolean).slice(0, 15).join("\n");
    return { max: 2600, user: `Tulis What's New untuk fitur baru di dalam aplikasi${b.version ? " versi " + str(b.version, 40) : ""}.
${name ? "Nama fitur: " + name + "\n" : ""}${notes ? "Catatan rilis / poin fitur:\n" + notes + "\n" : ""}${b.where ? "Letak di aplikasi: " + str(b.where, 300) + "\n" : ""}${b.who ? "Siapa yang bisa memakai: " + str(b.who, 300) + "\n" : ""}${steps ? "Langkah pemakaian (kasar):\n" + steps + "\n" : ""}${toneLine(b)}
Ini teks informasi fitur yang dibaca nasabah di dalam aplikasi, bukan iklan: jelas, ramah, dan langsung ke manfaat. Tanpa hook bombastis, tanpa hashtag, tanpa emoji, tanpa tanda seru beruntun.
Gunakan HANYA fakta dari bahan di atas. Jangan mengarang nama menu, tombol, syarat, angka, atau biaya; kalau nama menu/tombol tidak ada di bahan, tulis penanda dalam kurung siku, mis. [nama menu], dan sebut di "check".
- title: nama fitur yang tampil di What's New (maks. 40 karakter).
- short: deskripsi singkat 1–2 kalimat (maks. 120 karakter): manfaat utama untuk nasabah, untuk daftar What's New atau pop-up.
- long: deskripsi lengkap 2–4 paragraf pendek (total ±400–800 karakter): apa fiturnya, manfaat konkret, siapa yang bisa memakai / syaratnya, dan di mana menemukannya.
- manual: intro (1 kalimat), steps (3–8 langkah, satu tindakan per langkah, diawali kata kerja, sebut nama menu/tombol persis seperti di bahan; tanpa nomor di depan), notes (0–4 catatan penting: syarat, batas, biaya, jam layanan; hanya bila ada di bahan).
- faq: 2–4 tanya-jawab singkat yang kemungkinan ditanyakan nasabah (jawab hanya dari bahan).
- check: hal yang perlu dikonfirmasi ke tim produk/IT sebelum terbit (nama menu, syarat, angka yang belum jelas).
Format: {"title":"","short":"","long":[""],"manual":{"intro":"","steps":[""],"notes":[""]},"faq":[{"q":"","a":""}],"check":[""]}` };
  }
  if (kind === "reels") {
    const topic = str(b.topic, 500), source = str(b.source, 8000), dur = [15, 30, 60, 90].includes(Number(b.duration)) ? Number(b.duration) : 30;
    if (!topic && !source) return null;
    const plat = { reels: "Instagram Reels", tiktok: "TikTok", shorts: "YouTube Shorts" }[b.platform] || "Instagram Reels";
    return { max: 3000, user: `Tulis naskah video vertikal ${plat} berdurasi ${dur} detik.\n${topic ? "Topik: " + topic + "\n" : ""}${b.audience ? "Penonton: " + str(b.audience, 200) + "\n" : ""}${toneLine(b)}${source ? "Bahan (gunakan hanya fakta dari sini, jangan menyalin kalimatnya):\n" + source + "\n" : ""}\nAturan naskah:\n- hook: kalimat 0–3 detik pertama yang membuat orang berhenti scroll; ucapan dan teks layar langsung ke inti, tanpa salam pembuka.\n- hooks: 3 hook alternatif dengan pola berbeda (text, pattern = nama pola) untuk diuji.\n- Buka rasa penasaran di awal dan jawab di akhir supaya penonton menonton sampai habis; tiap adegan menambah informasi baru.\n- scenes: 4–8 adegan; time (mis. \"0–3 dtk\"), visual (apa yang tampil/direkam), voiceover (yang diucapkan), onscreen (teks di layar, maks. 8 kata).\n- Total voiceover pas untuk ${dur} detik (±2,5 kata per detik).\n- cta: satu ajakan di akhir. caption: caption posting (maks. 600 karakter). hashtags: 3–6 tagar. notes: catatan produksi singkat (musik, b-roll, risiko yang perlu disebut).\nFormat: {"title":"","hook":"","hooks":[{"text":"","pattern":""}],"scenes":[{"time":"","visual":"","voiceover":"","onscreen":""}],"cta":"","caption":"","hashtags":[],"notes":""}` };
  }
  if (kind === "yt") {
    const topic = str(b.topic, 500), source = str(b.source, 12000), dur = YT_DURATIONS.includes(Number(b.duration)) ? Number(b.duration) : 8;
    if (!topic && !source) return null;
    const fmt = YT_FORMATS[b.format] ? b.format : "explainer", target = dur * YT_WPM, bab = dur <= 3 ? "3–4" : dur <= 5 ? "4–5" : dur <= 10 ? "5–7" : "6–9";
    return { max: Math.min(9000, Math.round(target * 2.5) + 2500), user: `Tulis naskah video YouTube format panjang (horizontal) berdurasi ±${dur} menit.\nFormat video: ${YT_FORMATS[fmt]}.\n${topic ? "Topik: " + topic + "\n" : ""}${b.audience ? "Penonton: " + str(b.audience, 200) + "\n" : ""}${toneLine(b)}${source ? "Bahan (gunakan hanya fakta dari sini, jangan menyalin kalimatnya):\n" + source + "\n" : ""}
Aturan naskah:
- titles: 3 judul (maks. 70 karakter): kata kunci yang dicari orang di depan, memancing klik tanpa clickbait yang menyesatkan; why = alasan singkat.
- thumbnails: 3 teks thumbnail (maks. 4 kata), berbeda dari judul, terbaca di layar HP.
- hook: ucapan 15–30 detik pertama: langsung sebut apa yang penonton dapat dan alasan menonton sampai habis; tanpa "Halo guys, balik lagi di channel…".
- chapters: ${bab} bab; bab pertama = pengantar singkat setelah hook. title (maks. 40 karakter, jadi penanda bab di YouTube), goal (inti yang harus dipahami penonton), voiceover (naskah ucapan lengkap kata per kata, bahasa lisan yang natural), visual (b-roll, grafis, angka di layar, contoh layar aplikasi), onscreen (teks besar di layar, maks. 8 kata).
- Setiap 2–3 menit beri pengikat perhatian (pertanyaan ke penonton, janji di bagian akhir, contoh angka) supaya penonton bertahan.
- cta_mid: satu kalimat ajakan di tengah video (subscribe, komentar, atau buka aplikasi); sebut tempat penyisipannya di notes.
- outro: penutup yang merangkum 3 poin utama, satu CTA, dan ajakan menonton video berikutnya.
- Total kata yang diucapkan (hook + semua voiceover + cta_mid + outro) ±${target} kata (±${YT_WPM} kata per menit). Jangan memendekkan naskah.
- description: deskripsi YouTube; 2 baris pertama (maks. 150 karakter) merangkum manfaat menonton dengan kata kunci, lalu paragraf singkat, CTA, dan pengingat risiko. Jangan tulis daftar bab (dibuat otomatis).
- hashtags: 3 tagar. tags: 8–15 kata kunci pencarian tanpa #.
- pinned: komentar yang disematkan, berupa pertanyaan yang memancing penonton berkomentar.
- notes: catatan produksi (gaya pengambilan gambar, musik, bagian yang perlu dicek compliance, tempat cta_mid).
Format: {"titles":[{"text":"","why":""}],"thumbnails":[""],"hook":"","chapters":[{"title":"","goal":"","voiceover":"","visual":"","onscreen":""}],"cta_mid":"","outro":"","description":"","hashtags":[],"tags":[],"pinned":"","notes":""}` };
  }
  if (kind === "kit") {
    const facts = factLines(b.product);
    if (!facts) return null;
    const co = b.mode === "comarketing" && str(b.partner, 120);
    return { max: 3500, user: `Susun paket konten ${co ? `co-marketing bersama ${co} (manajer investasi / mitra produk)` : "promosi produk"} dari fakta berikut. Gunakan HANYA angka dan fakta ini, sebut tanggal datanya, dan jangan menambah klaim.\n${facts}\n${b.audience ? "Target pembaca: " + str(b.audience, 200) + "\n" : ""}${b.goal ? "Tujuan: " + str(b.goal, 200) + "\n" : ""}${toneLine(b)}${co ? `Sebut ${co} sebagai manajer investasi/mitra secara netral; ajakan bertindak tetap ke aplikasi kita.\n` : ""}
Isi:
- headline: judul kampanye (maks. 60 karakter). key_message: pesan utama 1 kalimat.
- feed: caption Instagram feed (maks. 900 karakter): baris pertama hook (maks. 125 karakter, terlihat sebelum "lainnya"), lalu manfaat, bukti dari fakta (angka + tanggal), CTA, dan 3–5 hashtag di akhir.
- story: 3–5 frame Instagram Story; tiap frame teks pendek (maks. 120 karakter); frame pertama hook, frame terakhir CTA.
- wa: pesan WhatsApp broadcast/Channel (maks. 700 karakter): paragraf pendek, judul tebal dengan *...*, satu CTA.
- email: subject (maks. 45 karakter), preheader (maks. 90 karakter), body (3–6 paragraf pendek).
- push: notifikasi aplikasi, title (maks. 40 karakter) dan body (maks. 110 karakter).
- faq: 4–6 tanya-jawab singkat untuk tim CS/sales (biaya, risiko, cara beli, minimal pembelian bila ada di fakta).
- visual_brief: brief untuk desainer (komposisi, teks utama, data yang ditonjolkan).
- notes: hal yang perlu dicek compliance sebelum terbit.
Sertakan "Kinerja masa lalu tidak mencerminkan kinerja masa depan." bila menyebut return, dan pengingat risiko.
Format: {"headline":"","key_message":"","feed":"","story":[""],"wa":"","email":{"subject":"","preheader":"","body":""},"push":{"title":"","body":""},"faq":[{"q":"","a":""}],"visual_brief":"","notes":""}` };
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
  if (kind === "ab") return { items: list(j.items, 8).map((x) => ({ text: str(x && x.text, 300), angle: str(x && x.angle, 60), why: str(x && x.why, 200) })).filter((x) => x.text) };
  if (kind === "app") return {
    push: list(j.push, 5).map((x) => ({ title: str(x && x.title, 80), body: str(x && x.body, 200) })).filter((x) => x.title || x.body),
    inapp: list(j.inapp, 5).map((x) => ({ title: str(x && x.title, 80), body: str(x && x.body, 200), cta: str(x && x.cta, 40) })).filter((x) => x.title || x.body),
  };
  if (kind === "wn") {
    const m = j.manual && typeof j.manual === "object" ? j.manual : {}, paras = typeof j.long === "string" ? j.long.split(/\n\s*\n/) : list(j.long, 6);
    return {
      title: str(j.title, 80), short: str(j.short, 300), long: paras.map((p) => str(p, 1200)).filter(Boolean).slice(0, 6),
      manual: { intro: str(m.intro, 400), steps: list(m.steps, 12).map((s) => str(s, 400).replace(/^(?:langkah\s*)?\d+[.)]\s*/i, "")).filter(Boolean), notes: list(m.notes, 6).map((s) => str(s, 300)).filter(Boolean) },
      faq: list(j.faq, 6).map((x) => ({ q: str(x && x.q, 200), a: str(x && x.a, 500) })).filter((x) => x.q && x.a),
      check: list(j.check, 8).map((s) => str(s, 300)).filter(Boolean),
    };
  }
  if (kind === "reels") return {
    title: str(j.title, 150), hook: str(j.hook, 300),
    hooks: list(j.hooks, 5).map((h) => (typeof h === "string" ? { text: str(h, 300), pattern: "" } : { text: str(h && h.text, 300), pattern: str(h && h.pattern, 60) })).filter((h) => h.text),
    cta: str(j.cta, 200), caption: str(j.caption, 2200), notes: str(j.notes, 1000),
    hashtags: list(j.hashtags, 10).map((h) => str(h, 40).replace(/^#?/, "#").replace(/\s+/g, "")).filter((h) => h.length > 1),
    scenes: list(j.scenes, 12).map((s) => ({ time: str(s && s.time, 30), visual: str(s && s.visual, 400), voiceover: str(s && s.voiceover, 600), onscreen: str(s && s.onscreen, 120) })),
  };
  if (kind === "yt") {
    const r = {
      titles: list(j.titles, 5).map((x) => (typeof x === "string" ? { text: str(x, 120), why: "" } : { text: str(x && x.text, 120), why: str(x && x.why, 200) })).filter((x) => x.text),
      thumbnails: list(j.thumbnails, 5).map((x) => str(typeof x === "string" ? x : x && x.text, 60)).filter(Boolean),
      hook: str(j.hook, 1500), cta_mid: str(j.cta_mid, 400), outro: str(j.outro, 3000), description: str(j.description, 4500), pinned: str(j.pinned, 500), notes: str(j.notes, 1500),
      chapters: list(j.chapters, 12).map((c) => ({ title: str(c && c.title, 60), goal: str(c && c.goal, 300), voiceover: str(c && c.voiceover, 8000), visual: str(c && c.visual, 1500), onscreen: str(c && c.onscreen, 150) })).filter((c) => c.title || c.voiceover),
      hashtags: list(j.hashtags, 5).map((h) => str(h, 40).replace(/^#?/, "#").replace(/\s+/g, "")).filter((h) => h.length > 1),
      tags: list(j.tags, 20).map((t) => str(t, 40).replace(/^#/, "")).filter(Boolean),
    };
    // penanda bab dari jumlah kata (bab pertama di 0:00 dan ikut memuat hook, syarat chapter YouTube)
    let at = words(r.hook);
    r.chapters.forEach((c, i) => { c.start = i === 0 ? 0 : Math.round(at / YT_WPM * 60); at += words(c.voiceover) + (i === Math.floor(r.chapters.length / 2) ? words(r.cta_mid) : 0); });
    r.words = at + words(r.outro) + (r.chapters.length ? 0 : words(r.cta_mid));
    r.seconds = Math.round(r.words / YT_WPM * 60);
    return r;
  }
  if (kind === "fix") return { text: str(j.text, 6000) };
  if (kind === "kit") {
    const e = j.email && typeof j.email === "object" ? j.email : {}, p = j.push && typeof j.push === "object" ? j.push : {};
    return {
      headline: str(j.headline, 120), key_message: str(j.key_message, 300), feed: str(j.feed, 2200), wa: str(j.wa, 1500),
      story: list(j.story, 6).map((s) => str(typeof s === "string" ? s : s && (s.text || s.frame), 200)).filter(Boolean),
      email: { subject: str(e.subject, 80), preheader: str(e.preheader, 150), body: str(e.body, 4000) },
      push: { title: str(p.title, 80), body: str(p.body, 200) },
      faq: list(j.faq, 8).map((x) => ({ q: str(x && x.q, 200), a: str(x && x.a, 600) })).filter((x) => x.q && x.a),
      visual_brief: str(j.visual_brief, 1000), notes: str(j.notes, 1000),
    };
  }
  return {};
}

/** Fakta produk (dari daftar /api/products yang dipilih di browser) -> baris teks untuk prompt. null kalau kosong. */
const FACT_LABEL = { kind: "Jenis produk", name: "Nama", code: "Kode", im: "Manajer investasi", issuer: "Penerbit", type: "Kategori", risk: "Tingkat risiko", index: "Indeks acuan",
  nav: "NAB per unit", navDate: "Tanggal NAB", price: "Harga di bursa", aum: "Dana kelolaan (Rp)", min: "Minimal pembelian (Rp)", coupon: "Kupon (% per tahun)", yield: "Yield (%)",
  rating: "Peringkat", maturity: "Jatuh tempo", couponType: "Jenis kupon", fee: "Biaya per tahun (%)", sy: "Syariah", asOf: "Data per" };
export function factLines(p) {
  if (!p || typeof p !== "object" || !str(p.name, 200)) return null;
  const L = [];
  for (const [k, label] of Object.entries(FACT_LABEL)) {
    const v = p[k];
    if (v == null || v === "" || v === false) continue;
    L.push(`- ${label}: ${k === "sy" ? "ya" : str(v, 200)}`);
  }
  const R = { m1: "1 bulan", ytd: "YTD", y1: "1 tahun", y3: "3 tahun" };
  for (const [k, label] of Object.entries(R)) if (p.ret && typeof p.ret[k] === "number" && isFinite(p.ret[k])) L.push(`- Return ${label}: ${p.ret[k].toFixed(2)}%`);
  return L.join("\n").slice(0, 3000);
}

/* =========================================================
   DATA PRODUK (Paket Produk): dibaca dari tool lain lewat service binding, cache 10 menit
   ========================================================= */
const getJ = async (svc, url) => { if (!svc) throw new Error("binding belum dipasang"); const r = await svc.fetch(url); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };
const nr = (v) => (typeof v === "number" && isFinite(v) ? v : null);
export async function products(env) {
  const [f, b, e] = await Promise.allSettled([getJ(env.FUND, "https://fund-insight/api/funds"), getJ(env.BOND, "https://bond-insight/data/bonds.json"), getJ(env.ETF, "https://etf-insight/api/etf")]);
  const rd = f.status === "fulfilled" ? (f.value.funds || []).filter((x) => x && x.name && x.nav).map((x) => ({
    kind: "Reksa dana", id: String(x.pid), name: x.name, im: x.im || "", type: x.type || "", risk: x.risk || "", sy: x.sy != null ? x.sy === 1 : /syariah|sharia|sukuk|falah/i.test(x.name),
    nav: nr(x.nav), navDate: x.navDate || "", aum: nr(x.aum), min: nr(x.minSubs), ret: { m1: nr(x.ret && x.ret.m1), ytd: nr(x.ret && x.ret.ytd), y1: nr(x.ret && x.ret.y1), y3: nr(x.ret && x.ret.y3) } })) : [];
  const bond = b.status === "fulfilled" ? (b.value.bonds || []).filter((x) => x && x.code).map((x) => ({
    kind: "Obligasi", id: x.code, code: x.code, name: x.name || x.code, issuer: x.issuer || "", type: { Government: "Obligasi negara", Corporate: "Obligasi korporasi", Sukuk: "Sukuk" }[x.type] || x.type || "",
    sy: x.type === "Sukuk", coupon: nr(x.coupon), yield: nr(x.yield), rating: x.rating || "", maturity: x.maturity || "", min: nr(x.min), couponType: x.couponType || "", asOf: (b.value.meta && b.value.meta.date) || "" })) : [];
  const etf = e.status === "fulfilled" ? (e.value.kisi || []).map((x) => ({
    kind: "ETF", id: x.code, code: x.code, name: x.name || x.code, im: x.im || "", index: x.index || "", price: nr(x.close), nav: nr(x.nav), navDate: x.navDate || "", aum: x.aum != null ? x.aum * 1e9 : null,
    fee: nr(x.fee), min: x.close ? Math.round(x.close * 100) : null, ret: { m1: nr(x.ret && x.ret.m1), ytd: nr(x.ret && x.ret.ytd), y1: nr(x.ret && x.ret.y1), y3: nr(x.ret && x.ret.y3) } })) : [];
  const err = (r, n) => (r.status === "rejected" ? `${n}: ${(r.reason && r.reason.message) || r.reason}` : null);
  return { at: new Date().toISOString(), rd, bond, etf, errors: [err(f, "Reksa dana"), err(b, "Obligasi"), err(e, "ETF")].filter(Boolean) };
}
async function productsCached(env, ctx) {
  const cache = typeof caches !== "undefined" && caches.default, key = new Request("https://copy-studio.cache/products-v1");
  if (cache) { const hit = await cache.match(key); if (hit) return hit.json(); }
  const v = await products(env);
  if (cache && !v.errors.length) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(v), { headers: { "content-type": "application/json", "cache-control": "public, max-age=600" } })));
  return v;
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
  const head = `<title>${esc(title(env, "Copy Studio"))}</title>${profileScript(env)}${themeHead("", EN)}${complianceScript()}<script>${HUBSSO.onlyInHub(env)}window.CS=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script>`;
  return PAGE.replace("<title>Copy Studio</title>", () => head);
}
/** Kode produk sendiri yang boleh disebut bersama ajakan "beli" (ETF di profil + tools.copy.allow). */
const allowCodes = (env) => { const t = profile(env).tools || {}; return [...Object.keys((t.etf && t.etf.facts) || {}), ...(((t.copy && t.copy.allow) || []))].map((c) => String(c).toUpperCase()); };

export default {
  async fetch(request, env, ctx) {
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
        return html(page(env, { canEdit, style: await getStyle(env), allow: allowCodes(env), abTypes: AB_TYPES, tones: Object.fromEntries(Object.entries(TONES).map(([k, t]) => [k, t.label])),
          brand: { hashtags: p.brand.hashtags, license: p.brand.license, disclaimer: p.brand.disclaimer, app: p.app.name } }), { "content-security-policy": HUBSSO.frame(env) });
      }
      if (request.method === "GET" && path === "/api/style") return json(await getStyle(env));
      if (request.method === "GET" && path === "/api/products") return json(await productsCached(env, ctx));
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
          const { text, model } = await ai(env, system(env, await getStyle(env)), q.user, q.max, undefined, { json: true, temperature: b.kind === "fix" ? 0.3 : b.kind === "wn" ? 0.5 : 0.9 });
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
