// Ringkasan "Hari ini" di beranda Tool Hub. Hub memanggil tool lewat service binding:
//   GET /__hub/today?email=<email pengguna>   header x-hub-key = SSO_SECRET
// Polanya sama dengan apps/cron (x-cron-key). Hub hanya memanggil tool yang boleh diakses pengguna itu,
// dan tool hanya mengembalikan ringkasan kecil (judul, status, jumlah), bukan isi lengkap.
//
//   import { HUB_FEED, hubFeedAllowed } from "../../shared/hubfeed.js";
//   if (path === HUB_FEED) return hubFeedAllowed(request, env) ? json(await ringkasan(env, email)) : forbidden;
export const HUB_FEED = "/__hub/today";

/** true kalau permintaan membawa x-hub-key yang sama dengan SSO_SECRET (dibandingkan tanpa bocor waktu). */
export function hubFeedAllowed(request, env) {
  const key = request.headers.get("x-hub-key") || "", secret = String((env && env.SSO_SECRET) || "");
  if (request.method !== "GET" || secret.length < 32 || key.length !== secret.length) return false;
  let r = 0;
  for (let i = 0; i < key.length; i++) r |= key.charCodeAt(i) ^ secret.charCodeAt(i);
  return r === 0;
}
