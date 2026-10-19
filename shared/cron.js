// Satu Cron Trigger untuk semua tool (batas paket gratis 5 cron per akun). Worker apps/cron memanggil handler
// scheduled() tool lain lewat service binding: POST /__cron?t=<scheduledTime> dengan header x-cron-key = SSO_SECRET.
//
//   import { withCron } from "../../shared/cron.js";
//   export default withCron({ fetch, scheduled });
export function withCron(worker) {
  return {
    ...worker,
    async fetch(req, env, ctx) {
      const u = new URL(req.url);
      if (u.pathname !== "/__cron") return worker.fetch(req, env, ctx);
      if (req.method !== "POST" || !env.SSO_SECRET || req.headers.get("x-cron-key") !== env.SSO_SECRET)
        return new Response("forbidden", { status: 403 });
      await worker.scheduled({ scheduledTime: Number(u.searchParams.get("t")) || Date.now(), cron: "" }, env, ctx);
      return new Response("ok");
    },
  };
}
