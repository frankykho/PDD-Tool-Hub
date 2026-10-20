// Cron: satu-satunya Cron Trigger di akun (batas paket gratis 5 cron). Tiap 5 menit memanggil scheduled() tool lain
// lewat service binding (lihat shared/cron.js). Pekerjaan berat (Fund, Competitor, Edukasi) diberi menit sendiri,
// satu per jalan, supaya tiap jalan tetap di bawah batas CPU 10 ms seperti saat masing-masing punya cron sendiri.
//
// Menit (UTC) dalam tiap setengah jam:
//   :00/:30          kosong untuk pekerjaan berat: Story Data mencatat LME di 19:30 & 23:00
//   :05/:35          Fund Insight      (dulu */30)
//   :10/:40          Competitor Intel  (dulu */30)
//   :15/:45, :25/:55 Edukasi Studio    (dulu */15)
//   :20/:50          Market Recap, Senin–Jumat; memilih sendiri sesi 1 / penutupan menurut jam
//   10:20 & 12:20    SATS, Senin–Jumat (dulu 10:17 & 12:17)
//   tiap 5 menit     Story Data, Senin–Jumat; memilih tugas sendiri menurut jam (dulu */5 * * * 1-5)
//
// Hasil tiap jalan dicatat di D1 (tabel cron_runs) dan dibaca beranda Tool Hub lewat GET /__hub/today (shared/hubfeed.js).
import { HUB_FEED, hubFeedAllowed } from "../../shared/hubfeed.js";

const SLOTS = { 5: "FUND", 10: "COMPETITOR", 15: "EDUKASI", 25: "EDUKASI" };

export default {
  async scheduled(event, env) {
    const d = new Date(event.scheduledTime), h = d.getUTCHours(), m = d.getUTCMinutes() % 30;
    const weekday = d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
    const jobs = [SLOTS[m]];
    if (weekday) jobs.push("STORYDATA");
    if (weekday && m === 20) jobs.push("RECAP");
    if (weekday && d.getUTCMinutes() === 20 && (h === 10 || h === 12)) jobs.push("SATS");

    const ran = jobs.filter(Boolean);
    const res = await Promise.allSettled(ran.map(async (b) => {
      const r = await env[b].fetch(`https://cron/__cron?t=${event.scheduledTime}`, { method: "POST", headers: { "x-cron-key": env.SSO_SECRET || "" } });
      if (!r.ok) throw new Error(`${b}: HTTP ${r.status}`);
    }));
    await logRun(env, event.scheduledTime, ran, res);
    const err = res.filter((r) => r.status === "rejected").map((r) => r.reason.message);
    if (err.length) throw new Error(err.join("; "));  // tampil sebagai gagal di log Cron Cloudflare
  },
  async fetch(request, env) {
    if (new URL(request.url).pathname !== HUB_FEED) return new Response("not found", { status: 404 });
    if (!hubFeedAllowed(request, env)) return new Response("forbidden", { status: 403 });
    const runs = env.DB ? await env.DB.prepare("SELECT job, at, ok_at, err, err_at FROM cron_runs").all().then((r) => r.results || [], () => []) : [];
    return Response.json({ now: Date.now(), every: 5, runs }, { headers: { "cache-control": "no-store" } });
  },
};

// Jalan terakhir per tugas: at = terakhir dipanggil, ok_at = terakhir berhasil, err = pesan gagal terakhir (kosong lagi setelah berhasil).
// Baris "_cron" = jalan cron itu sendiri, untuk mendeteksi cron yang berhenti. Gagal mencatat tidak menggagalkan jadwal.
let logReady = false;
async function logRun(env, t, ran, res) {
  if (!env.DB) return;
  try {
    if (!logReady) { await env.DB.prepare("CREATE TABLE IF NOT EXISTS cron_runs (job TEXT PRIMARY KEY, at INTEGER, ok_at INTEGER, err TEXT, err_at INTEGER)").run(); logReady = true; }
    const up = env.DB.prepare("INSERT INTO cron_runs VALUES (?1, ?2, CASE WHEN ?3 IS NULL THEN ?2 END, ?3, CASE WHEN ?3 IS NULL THEN NULL ELSE ?2 END) ON CONFLICT(job) DO UPDATE SET at = excluded.at, ok_at = COALESCE(excluded.ok_at, ok_at), err = excluded.err, err_at = COALESCE(excluded.err_at, err_at)");
    await env.DB.batch([up.bind("_cron", t, null), ...ran.map((b, i) => up.bind(b, t, res[i].status === "rejected" ? String(res[i].reason?.message || res[i].reason).slice(0, 300) : null))]);
  } catch (e) { console.log("catatan cron gagal:", e.message); }
}
