// Ringkasan "Hari ini" di beranda Tool Hub. Hub memanggil tool lewat service binding:
//   GET /__hub/today?email=<email pengguna>   header x-hub-key = SSO_SECRET
// Polanya sama dengan apps/cron (x-cron-key). Hub hanya memanggil tool yang boleh diakses pengguna itu,
// dan tool hanya mengembalikan ringkasan kecil (judul, status, jumlah), bukan isi lengkap.
// Untuk mengirim data ke tool (daftar anggota, tanda notifikasi sudah dibaca) hub memakai POST ke /__hub/<nama>
// dengan kunci yang sama; tool memeriksanya dengan hubPushAllowed.
//
//   import { HUB_FEED, hubFeedAllowed } from "../../shared/hubfeed.js";
//   if (path === HUB_FEED) return hubFeedAllowed(request, env) ? json(await ringkasan(env, email)) : forbidden;
export const HUB_FEED = "/__hub/today";

/** true kalau x-hub-key sama dengan SSO_SECRET (dibandingkan tanpa bocor waktu). */
function keyOk(request, env) {
  const key = request.headers.get("x-hub-key") || "", secret = String((env && env.SSO_SECRET) || "");
  if (secret.length < 32 || key.length !== secret.length) return false;
  let r = 0;
  for (let i = 0; i < key.length; i++) r |= key.charCodeAt(i) ^ secret.charCodeAt(i);
  return r === 0;
}
/** Permintaan baca dari hub (GET). */
export const hubFeedAllowed = (request, env) => request.method === "GET" && keyOk(request, env);
/** Kiriman data dari hub (POST). */
export const hubPushAllowed = (request, env) => request.method === "POST" && keyOk(request, env);
