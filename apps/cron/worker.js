// Cron: satu-satunya Cron Trigger di akun (batas paket gratis 5 cron). Tiap 5 menit memanggil scheduled() tool lain
// lewat service binding (lihat shared/cron.js). Pekerjaan berat (Fund, Competitor, Edukasi) diberi menit sendiri,
// satu per jalan, supaya tiap jalan tetap di bawah batas CPU 10 ms seperti saat masing-masing punya cron sendiri.
//
// Menit (UTC) dalam tiap setengah jam:
//   :00/:30          kosong untuk pekerjaan berat: Story Data mencatat LME di 19:30 & 23:00
//   :05/:35          Fund Insight      (dulu */30)
//   :10/:40          Competitor Intel  (dulu */30)
//   :15/:45, :25/:55 Edukasi Studio    (dulu */15)
//   10:20 & 12:20    SATS, Senin–Jumat (dulu 10:17 & 12:17)
//   tiap 5 menit     Story Data, Senin–Jumat; memilih tugas sendiri menurut jam (dulu */5 * * * 1-5)
const SLOTS = { 5: "FUND", 10: "COMPETITOR", 15: "EDUKASI", 25: "EDUKASI" };

export default {
  async scheduled(event, env) {
    const d = new Date(event.scheduledTime), h = d.getUTCHours(), m = d.getUTCMinutes() % 30;
    const weekday = d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
    const jobs = [SLOTS[m]];
    if (weekday) jobs.push("STORYDATA");
    if (weekday && d.getUTCMinutes() === 20 && (h === 10 || h === 12)) jobs.push("SATS");

    const res = await Promise.allSettled(jobs.filter(Boolean).map(async (b) => {
      const r = await env[b].fetch(`https://cron/__cron?t=${event.scheduledTime}`, { method: "POST", headers: { "x-cron-key": env.SSO_SECRET || "" } });
      if (!r.ok) throw new Error(`${b}: HTTP ${r.status}`);
    }));
    const err = res.filter((r) => r.status === "rejected").map((r) => r.reason.message);
    if (err.length) throw new Error(err.join("; "));  // tampil sebagai gagal di log Cron Cloudflare
  },
};
