// Cek kepatuhan & panjang teks pemasaran (caption, push notif, subject email) — satu aturan untuk semua tool.
// Aturan mengikuti semangat POJK perlindungan konsumen & etika iklan produk investasi: tidak menjanjikan untung,
// tidak mengajak transaksi saham tertentu, klaim superlatif perlu dasar, promo menyebut S&K, ada pengingat risiko & izin OJK.
// Hasilnya saran untuk tim, bukan pengganti review compliance.
//
// Di server:  import { checkCopy, PLATFORMS } from "../../shared/compliance.js";
// Di browser: sisipkan complianceScript() ke HTML -> window.Compliance.check(teks, { platform, glossary })
//
// level: "error" = harus diperbaiki, "warn" = periksa lagi, "info" = saran.

/** Batas per platform. max = batas keras; rec = panjang yang disarankan; fold = karakter yang terlihat sebelum "lainnya";
 *  tags = maks. hashtag; short = teks pendek (tanpa cek disclaimer/izin/kinerja). */
export const PLATFORMS = {
  ig: { label: "Instagram (feed / Reels)", max: 2200, fold: 125, tags: 30, recTags: 5 },
  tiktok: { label: "TikTok", max: 4000, fold: 100, recTags: 5 },
  linkedin: { label: "LinkedIn", max: 3000, fold: 210, recTags: 5 },
  x: { label: "X / Twitter", max: 280, recTags: 2 },
  fb: { label: "Facebook", max: 63206, rec: 500, fold: 240 },
  wa: { label: "WhatsApp (pesan / Channel)", max: 65536, rec: 1000 },
  yt_title: { label: "YouTube: judul", max: 100, rec: 70, short: true },
  yt_desc: { label: "YouTube: deskripsi", max: 5000, fold: 157, tags: 15 },
  push_title: { label: "Push notif: judul", max: 50, rec: 40, short: true },
  push_body: { label: "Push notif: isi", max: 150, rec: 110, short: true },
  inapp_title: { label: "Banner in-app: judul", max: 40, short: true },
  inapp_body: { label: "Banner in-app: isi", max: 100, short: true },
  email_subject: { label: "Email: subject", max: 45, short: true },
  email_pre: { label: "Email: preheader", max: 90, short: true },
  artikel: { label: "Artikel / email", max: 100000 },
};

/** Aturan teks. long = hanya untuk teks panjang (bukan platform short). */
export const RULES = [
  { id: "janji", level: "error", msg: "Menjanjikan keuntungan atau menyebut tanpa risiko. Ini dilarang untuk produk investasi.",
    re: /\b(?:pasti|dijamin|terjamin|garansi|jaminan)\s+(?:untung|cuan|profit|naik|aman|balik modal|return|imbal hasil|keuntungan)\b|\b(?:tanpa|bebas|nol|zero)\s+risiko\b|\banti[- ]?rugi\b|\btidak\s+(?:akan\s+)?(?:pernah\s+)?rugi\b|\b100\s?%\s+(?:aman|untung|cuan)\b|\bcuan\s+(?:pasti|terus|tiap hari|setiap hari)\b|\bpasti\s+(?:cuan|untung|profit)\b/gi },
  // code: kode 4 huruf terakhir di temuan dicek ke stop (bukan kode saham) dan opts.allow (kode produk sendiri, mis. ETF)
  { id: "ajakan", level: "error", msg: "Ajakan transaksi saham tertentu atau target harga. Ini hanya boleh dari analis berizin, bukan konten marketing.",
    re: /\b(?:[Bb]eli|[Jj]ual|[Tt]ahan|[Aa]kumulasi|[Bb]orong|[Ss]erok|[Hh]ajar|[Bb]uy|[Ss]ell|[Hh]old|[Ee]ntry|[Aa]verage [Dd]own)\b[^.!?\n]{0,25}?\b[A-Z]{4}\b|\b[Tt]arget [Hh]arga\b|\b[Rr]ekomendasi\s+(?:beli|jual|saham)\b|\b(?:TP|SL)\s*:?\s*\d/g,
    code: true, stop: ["IHSG", "KISI", "BUMN", "ISSI", "KSEI", "NPWP", "SBSN", "IPOT"] },
  { id: "superlatif", level: "warn", msg: "Klaim superlatif. Sertakan dasar datanya (sumber & periode) atau ganti kata.",
    re: /\b(?:terbaik|nomor\s*1|no\.?\s*1|paling\s+(?:untung|menguntungkan|aman|murah|tinggi|cuan)|termurah|tertinggi|teraman|terbesar)\b/gi },
  { id: "fomo", level: "warn", msg: "Bahasa mendesak atau berlebihan. Hindari menekan orang untuk berinvestasi.",
    re: /\b(?:kesempatan terakhir|jangan sampai ketinggalan|buruan|cepetan|sebelum terlambat|langsung kaya|kaya mendadak|cepat kaya|auto cuan|to the moon|cuan maksimal)\b/gi },
  { id: "kinerja", level: "warn", long: true, msg: "Menyebut angka kinerja/imbal hasil. Tambahkan: \"Kinerja masa lalu tidak mencerminkan kinerja masa depan.\"",
    re: /\b(?:imbal hasil|return|kinerja|yield)\b[^.!?\n]{0,40}?\d+(?:[.,]\d+)?\s?%|\d+(?:[.,]\d+)?\s?%[^.!?\n]{0,30}?\b(?:setahun|per tahun|p\.a\.?|ytd|1 tahun|sebulan)\b/gi,
    unless: /kinerja masa lalu|tidak mencerminkan|tidak menjamin/i, once: true },
  { id: "snk", level: "warn", msg: "Menyebut promo/hadiah tanpa \"S&K berlaku\".",
    re: /\b(?:cashback|gratis|hadiah|bonus|voucher|diskon|undian|giveaway)\b/gi, unless: /S\s?&\s?K|syarat\s+(?:dan|&)\s+ketentuan|ketentuan berlaku/i, once: true },
  { id: "risiko", level: "info", long: true, msg: "Membahas produk investasi tanpa pengingat risiko singkat (mis. \"Investasi mengandung risiko\").",
    re: /\b(?:reksa ?dana|saham|obligasi|sukuk|ETF|waran|SBN|SBR|ORI)\b/gi, unless: /risiko/i, once: true },
  { id: "teriak", level: "info", msg: "Tanda seru berderet atau huruf kapital semua. Terkesan berteriak.",
    re: /!{2,}|\b[A-Z]{3,}(?:\s+[A-Z]{3,}){3,}\b/g, once: true },
];

const HASHTAG = /(?:^|\s)#[\p{L}\p{N}_]+/gu;

/**
 * Cek satu teks. opts: platform (kunci PLATFORMS, bawaan "ig"), glossary [{bad, good, note}] (kata yang harus diganti), allow (kode produk sendiri, mis. ["XKMS"]),
 * license (true = teks panjang wajib menyebut OJK; bawaan true).
 * Hasil: { len, max, rec, fold, tags, preview, issues: [{ level, id, msg, match, at }] } urut dari error.
 */
export function checkCopy(text, opts) {
  opts = opts || {};
  const P = PLATFORMS[opts.platform] || PLATFORMS.ig, allow = (opts.allow || []).map((c) => String(c).toUpperCase());
  const t = String(text || ""), len = Array.from(t).length, issues = [];
  const add = (level, id, msg, match, at) => issues.push({ level, id, msg, match: match || "", at: at == null ? -1 : at });
  for (const r of RULES) {
    if (r.long && P.short) continue;
    if (r.unless && r.unless.test(t)) continue;
    r.re.lastIndex = 0;
    let m;
    while ((m = r.re.exec(t))) {
      const code = r.code && (m[0].match(/[A-Z]{4}(?![A-Z])/g) || []).pop();
      if (code && (r.stop.includes(code) || allow.includes(code))) continue;
      add(r.level, r.id, r.msg, m[0].trim(), m.index);
      if (r.once || !r.re.global) break;
      if (m[0] === "") r.re.lastIndex++;
    }
  }
  for (const g of opts.glossary || []) {
    const bad = String((g && g.bad) || "").trim();
    if (!bad) continue;
    const re = new RegExp("(^|[^\\p{L}\\p{N}])(" + bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?=$|[^\\p{L}\\p{N}])", "giu");
    let m;
    while ((m = re.exec(t))) {
      // kata yang sudah persis sama dengan bentuk benar, dan tagar (#reksadana: tagar memang tanpa spasi), tidak ditandai
      if ((g.good && m[2] === g.good) || m[1] === "#") continue;
      add("warn", "glosarium", g.good ? `Tulis "${g.good}", bukan "${m[2]}".` + (g.note ? " " + g.note : "") : `Hindari kata "${m[2]}".` + (g.note ? " " + g.note : ""), m[2], m.index + m[1].length);
    }
  }
  const tags = (t.match(HASHTAG) || []).length;
  if (len > P.max) add("error", "panjang", `Terlalu panjang: ${len} dari batas ${P.max} karakter.`);
  else if (P.rec && len > P.rec) add("info", "panjang", `Lebih dari panjang yang disarankan (${P.rec} karakter).`);
  if (P.tags && tags > P.tags) add("error", "hashtag", `Hashtag ${tags}, batasnya ${P.tags}.`);
  else if (P.recTags && tags > P.recTags) add("info", "hashtag", `Hashtag ${tags}. Disarankan maks. ${P.recTags} yang relevan.`);
  if (!P.short && opts.license !== false && len > 200 && !/OJK/i.test(t)) add("warn", "izin", "Belum ada keterangan izin, mis. \"berizin dan diawasi OJK\".");
  const rank = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => rank[a.level] - rank[b.level] || a.at - b.at);
  return { len, max: P.max, rec: P.rec || 0, fold: P.fold || 0, tags, preview: P.fold ? Array.from(t).slice(0, P.fold).join("") : "", issues };
}

/** Tag <script> yang mengisi window.Compliance = { check, PLATFORMS, RULES } di browser. */
export function complianceScript() {
  const rules = "[" + RULES.map((r) => "{" + Object.entries(r).map(([k, v]) => JSON.stringify(k) + ":" + (v instanceof RegExp ? v.toString() : JSON.stringify(v))).join(",") + "}").join(",") + "]";
  // __name: helper yang disisipkan wrangler (keepNames) ke dalam fungsi saat bundling; ikut terbawa oleh toString(), jadi disediakan di sini
  const src = `(function(){var __name=function(f){return f};var PLATFORMS=${JSON.stringify(PLATFORMS)};var RULES=${rules};var HASHTAG=${HASHTAG.toString()};${checkCopy.toString()}window.Compliance={check:checkCopy,PLATFORMS:PLATFORMS,RULES:RULES};})();`;
  return `<script>${src.replace(/<\/script/gi, "<\\/script")}</script>`;
}

/** Ringkasan aturan untuk prompt AI, supaya tulisan AI sudah patuh sejak awal. */
export const RULES_PROMPT = [
  "Aturan kepatuhan (wajib):",
  "- Jangan menjanjikan keuntungan, imbal hasil pasti, atau menyebut tanpa risiko.",
  "- Jangan mengajak beli/jual saham tertentu, jangan menulis target harga atau rekomendasi.",
  "- Klaim \"terbaik/tertinggi/nomor 1\" hanya bila ada data dan sumbernya; selain itu hindari.",
  "- Hindari bahasa yang menekan (buruan, kesempatan terakhir, auto cuan).",
  "- Promo/hadiah selalu disertai \"S&K berlaku\". Angka kinerja disertai \"Kinerja masa lalu tidak mencerminkan kinerja masa depan.\"",
  "- Untuk produk investasi sertakan pengingat singkat bahwa investasi mengandung risiko.",
].join("\n");
