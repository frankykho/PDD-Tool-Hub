// Profil proyek: nama brand, logo, link, sumber data, dan alamat semua tool.
// Nilainya TIDAK ditulis di kode. scripts/deploy.mjs membaca profile.json (tidak masuk repo) lalu menyuntikkannya
// ke setiap worker sebagai variabel PROFILE (JSON). Kalau kosong, tool tetap jalan dengan tampilan netral.
//
// Di server:  import { profile, appUrl, title } from "../../shared/profile.js";
// Di browser: worker menyisipkan window.PROFILE lewat profileScript(env) / injectProfile(res, env).

export const DEFAULTS = {
  brand: {
    short: "",        // nama singkat, dipakai sebagai awalan nama produk ("<short> Morning"); kosong = tanpa awalan
    company: "",      // nama perusahaan lengkap (footer, PDF, disclaimer)
    license: "",      // baris izin singkat, mis. "Berizin dan diawasi OJK"
    disclaimer: "",   // disclaimer panjang di bawah konten
    logo: "",         // URL logo untuk latar terang
    logoDark: "",     // URL logo untuk latar gelap
    team: "",         // penanda tangan, mis. "Tim Investment Specialist"
    hashtags: "",     // tagar bawaan untuk caption
  },
  app: {
    name: "",         // nama aplikasi transaksi, mis. di langkah "Buka aplikasi ..."
    logo: "",
    ios: "",          // link App Store
    android: "",      // link Google Play
    download: "",     // link unduh pendek (QR code & CTA)
  },
  contact: {
    website: "", phone: "", email: "", whatsapp: "", waChannel: "",
    instagram: "", tiktok: "", youtube: "", facebook: "", linkedin: "",
  },
  github: { repo: "", branch: "main" },  // repo publik proyek ini (PDF, data Story, gambar Tutorial)
  sources: {},        // alamat sumber data, mis. bondApi
  urls: {},           // alamat setiap tool, diisi otomatis oleh deploy.mjs
  tools: {},          // pengaturan khusus per tool: tools.<id>.<kunci>
};

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
function merge(base, over) {
  if (!isObj(over)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

let cacheRaw, cacheVal;
/** Profil lengkap (default + PROFILE dari env). Hasil di-cache per isolate. */
export function profile(env) {
  const raw = (env && env.PROFILE) || "";
  if (raw === cacheRaw && cacheVal) return cacheVal;
  let p = {};
  try { p = typeof raw === "string" ? (raw ? JSON.parse(raw) : {}) : raw; } catch (e) { console.error("PROFILE bukan JSON yang sah"); }
  cacheRaw = raw; cacheVal = merge(DEFAULTS, p);
  return cacheVal;
}

/** Alamat tool lain tanpa garis miring di akhir, mis. appUrl(env, "fund"). "" kalau belum diatur. */
export const appUrl = (env, id) => String(profile(env).urls[id] || "").replace(/\/+$/, "");

/** Nama produk dengan awalan brand bila ada: title(env, "Bond Insight") -> "Acme Bond Insight" atau "Bond Insight". */
export const title = (env, name) => { const s = profile(env).brand.short; return s ? `${s} ${name}` : name; };

/** Tag <script> yang mengisi window.PROFILE di browser. Aman disisipkan ke HTML. */
export const profileScript = (env) =>
  `<script>window.PROFILE=${JSON.stringify(profile(env)).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "")};</script>`;

/** Sisipkan window.PROFILE ke <head> sebuah respons HTML (untuk halaman statis). Respons non-HTML dikembalikan apa adanya. */
export function injectProfile(res, env) {
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
  return new HTMLRewriter().on("head", { element(el) { el.prepend(profileScript(env), { html: true }); } }).transform(res);
}
