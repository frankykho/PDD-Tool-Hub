// Tutorial: halaman statis di folder site/ disajikan sebagai aset Worker (gratis).
// Worker hanya menyisipkan window.PROFILE (nama aplikasi, alamat Tool Hub, konfigurasi Firebase, dsb.) ke halaman HTML.
// Gambar di site/images/ tidak lewat worker (lihat run_worker_first di wrangler.jsonc).
import { injectProfile } from "../../shared/profile.js";
import { themeHead } from "../../shared/theme.js";
import { TUTORIAL_THEME_CSS } from "./theme.js";

export default {
  async fetch(request, env) {
    // tanpa If-None-Match: kalau tidak, browser bisa terus memakai HTML lama (dengan profil lama) dari cache
    const req = new Request(request);
    req.headers.delete("if-none-match");
    const res = injectProfile(await env.ASSETS.fetch(req), env);
    // tema dari Tool Hub hanya untuk halaman yang dibuka di dalamnya; index.html (publik & bahan export) tetap terang
    if (!/^\/(submit|admin)(\.html)?\/?$/.test(new URL(request.url).pathname) || !(res.headers.get("content-type") || "").includes("text/html")) return res;
    return new HTMLRewriter().on("head", { element(el) { el.append(themeHead(TUTORIAL_THEME_CSS), { html: true }); } }).transform(res);
  },
};
