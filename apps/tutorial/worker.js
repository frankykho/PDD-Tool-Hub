// Tutorial: halaman statis di folder site/ disajikan sebagai aset Worker (gratis).
// Worker hanya menyisipkan window.PROFILE (nama aplikasi, alamat Tool Hub, konfigurasi Firebase, dsb.) ke halaman HTML.
// Gambar di site/images/ tidak lewat worker (lihat run_worker_first di wrangler.jsonc).
import { injectProfile } from "../../shared/profile.js";

export default {
  async fetch(request, env) {
    // tanpa If-None-Match: kalau tidak, browser bisa terus memakai HTML lama (dengan profil lama) dari cache
    const req = new Request(request);
    req.headers.delete("if-none-match");
    return injectProfile(await env.ASSETS.fetch(req), env);
  },
};
