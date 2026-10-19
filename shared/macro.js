// Agenda makro otomatis dari Story Generator: data/macro.js + public/calendar.json di repo GitHub publik.
// Dipakai Fund Insight (Home -> Agenda) dan Content Planner (Paket Mingguan).
//
// Di server:  import { STORY_DIR, macroItems, macroUrls } from "../../shared/macro.js";
import { profile } from "./profile.js";

export const STORY_DIR = "apps/story-generator/site"; // folder situs Story Generator di repo
export function macroItems(js, cal) {
  const out = [];
  for (const m of String(js || "").matchAll(/\{\s*date:\s*'(\d{4}-\d{2}-\d{2})'\s*,\s*time:\s*(null|'([^']*)')\s*,\s*country:\s*'(\w+)'\s*,\s*event:\s*'([^']*)'/g))
    out.push({ d: m[1], time: m[3] || "", country: m[4], t: m[5] });
  for (const e of (cal && cal.macro) || []) if (/^\d{4}-\d{2}-\d{2}$/.test(e.date || "") && e.event) out.push({ d: e.date, time: e.time || "", country: e.country || "", t: e.event });
  const seen = new Set();
  return out.filter((x) => { const k = x.d + "|" + x.t; return !seen.has(k) && seen.add(k); })
    .map((x) => ({ id: "auto-" + x.d + "-" + x.t.length, d: x.d, t: x.t, time: x.time, country: x.country, k: "makro", auto: true }));
}
/** Alamat mentah kedua berkas di GitHub; null kalau repo belum diatur (GITHUB_REPO / profile.github.repo). */
export function macroUrls(env) {
  const repo = env.GITHUB_REPO || profile(env).github.repo;
  if (!repo) return null;
  const base = `https://raw.githubusercontent.com/${repo}/${profile(env).github.branch || "main"}/${STORY_DIR}`;
  return { js: base + "/data/macro.js", cal: base + "/public/calendar.json" };
}
