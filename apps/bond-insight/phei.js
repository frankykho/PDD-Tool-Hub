// Kurva yield dari PHEI (PT Penilai Harga Efek Indonesia, dulu IBPA): halaman publik "HPW dan Imbal Hasil", tanpa akun.
// - IGSYC (Indonesia Government Securities Yield Curve): tenor 0,1–40 tahun, kolom hari ini & kemarin
// - Corporate Bond Yield by Tenor: IGS, AAA, AA, A, BBB untuk tenor 0,1–10 tahun
// Diambil di server (cache memori 30 menit), disimpan di KV BONDS_KV: "curve_last" (cadangan saat PHEI gangguan / tampilan
// halaman berubah) dan "curve_hist_v1" (satu titik per tanggal data PHEI, ditulis hanya bila tanggalnya baru).
// Diperbarui otomatis oleh apps/cron (17.00 & 19.00 WIB, Senin–Jumat) dan saat /data/curve.json diminta.

export const PHEI_URL = "https://www.phei.co.id/Data/HPW-dan-Imbal-Hasil";
export const RATINGS = ["AAA", "AA", "A", "BBB"];
// tenor yang disimpan di riwayat (hemat ruang KV)
export const HIST_TENORS = [1, 2, 3, 5, 7, 10, 15, 20, 30];
const HIST_KEY = "curve_hist_v1", LAST_KEY = "curve_last", HIST_DAYS = 400, TTL_MS = 30 * 60e3;
const BULAN = { januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, august: 8, october: 10, december: 12 };

const text = (s) => s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const num = (s) => { const v = Number(String(s).replace(/\./g, "").replace(",", ".")); return s !== "" && Number.isFinite(v) ? v : null; };
const tables = (html) => [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) =>
  [...m[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => text(c[1])).filter((c) => c !== "")));

/** "per 23-Oktober-2026" -> "2026-10-23"; null kalau tidak ada. */
export function pheiDate(html) {
  const m = /per\s+(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{4})/i.exec(html);
  const mo = m && BULAN[m[2].toLowerCase()];
  return mo ? `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/** Urai halaman PHEI -> { date, igs: [[tenor, hariIni, kemarin]], corp: { tenors, AAA: [..], AA, A, BBB } }. Lempar galat bila tabelnya tidak ada. */
export function parsePhei(html) {
  const T = tables(String(html || "")), igs = [], corp = { tenors: [], AAA: [], AA: [], A: [], BBB: [] };
  for (const rows of T) {
    const head = (rows[0] || []).join("|").toLowerCase();
    if (/tenor/.test(head) && /today/.test(head) && /yesterday/.test(head) && !/series/.test(head)) {
      for (const r of rows.slice(1)) { const [t, a, b] = r.map(num); if (t != null && a != null) igs.push([t, a, b]); }
    } else if (/tenor/.test(head) && /\|aaa\|/.test("|" + head + "|")) {
      const cols = rows[0].map((c) => c.toUpperCase()), ix = Object.fromEntries(RATINGS.map((k) => [k, cols.indexOf(k)]));
      for (const r of rows.slice(1)) {
        const t = num(r[0]); if (t == null) continue;
        corp.tenors.push(t); RATINGS.forEach((k) => corp[k].push(ix[k] >= 0 ? num(r[ix[k]]) : null));
      }
    }
  }
  igs.sort((a, b) => a[0] - b[0]);
  if (igs.length < 5 || !igs.some((x) => x[0] === 2)) throw new Error("Tabel IGSYC tidak ditemukan di halaman PHEI (tampilan halaman mungkin berubah).");
  return { date: pheiDate(html), igs, corp: corp.tenors.length ? corp : null };
}

/** Interpolasi linear di kurva [[tenor, yield]]; di luar rentang memakai ujung terdekat. */
export function interp(points, t) {
  const p = points.filter((x) => x[1] != null);
  if (!p.length || !Number.isFinite(t)) return null;
  if (t <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (t <= p[i][0]) { const [t0, y0] = p[i - 1], [t1, y1] = p[i]; return y0 + (y1 - y0) * (t - t0) / (t1 - t0); }
  return p[p.length - 1][1];
}
/** Rating obligasi ("idAA+", "AA-(idn)", "idA") -> kelompok kurva PHEI (AAA/AA/A/BBB); null kalau di luar itu. */
export function ratingGroup(r) {
  const s = String(r || "").toUpperCase().replace(/^ID/, "").replace(/\(IDN\)|\(SY\)|SY$/g, "");
  const m = /^(AAA|AA|BBB|A)(?![A-Z])/.exec(s.trim());
  return m ? m[1] : null;
}
/** Titik kurva satu rating dari data korporasi: [[tenor, yield]]. */
export const corpCurve = (c, k) => (c && c.corp && c.corp[k] ? c.corp.tenors.map((t, i) => [t, c.corp[k][i]]) : []);

/** Ringkasan untuk konten & Tool Hub: tenor utama dengan perubahan dari kemarin (bps). */
export function keyRates(c, tenors = [1, 2, 5, 10]) {
  return tenors.map((t) => { const x = c.igs.find((p) => p[0] === t); return x ? { t, y: x[1], d: x[2] != null ? Math.round((x[1] - x[2]) * 1000) / 10 : null } : null; }).filter(Boolean);
}

let memo = null; // { at, c }
async function fetchPhei() {
  const r = await fetch(PHEI_URL, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", accept: "text/html" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("PHEI menjawab HTTP " + r.status);
  return { ...parsePhei(await r.text()), fetched_at: new Date().toISOString(), source: "PHEI (phei.co.id)", url: PHEI_URL };
}
/** Simpan cadangan & riwayat; menulis KV hanya bila tanggal data PHEI baru (hemat batas tulis paket gratis). */
async function save(env, c) {
  if (!env.BONDS_KV || !c.date) return;
  const last = await env.BONDS_KV.get(LAST_KEY, "json");
  if (last && last.date === c.date && JSON.stringify(last.igs) === JSON.stringify(c.igs)) return;
  await env.BONDS_KV.put(LAST_KEY, JSON.stringify(c));
  const h = (await env.BONDS_KV.get(HIST_KEY, "json")) || { days: {} };
  const igs = {}, corp = {};
  HIST_TENORS.forEach((t) => { const y = interp(c.igs.map((p) => [p[0], p[1]]), t); if (y != null) igs[t] = y; });
  RATINGS.forEach((k) => { const pts = corpCurve(c, k); if (pts.length) corp[k] = Object.fromEntries([1, 2, 3, 5, 10].map((t) => [t, interp(pts, t)])); });
  h.days[c.date] = { igs, corp };
  // kolom "kemarin" mengisi hari sebelumnya bila belum tercatat (riwayat langsung punya 2 titik di hari pertama)
  const prev = Object.fromEntries(HIST_TENORS.map((t) => [t, interp(c.igs.filter((p) => p[2] != null).map((p) => [p[0], p[2]]), t)]).filter((x) => x[1] != null));
  if (!Object.keys(h.days).some((d) => d < c.date) && Object.keys(prev).length) h.days[c.date + "~prev"] = { igs: prev, corp: {} };
  const keys = Object.keys(h.days).sort();
  keys.slice(0, Math.max(0, keys.length - HIST_DAYS)).forEach((k) => delete h.days[k]);
  await env.BONDS_KV.put(HIST_KEY, JSON.stringify(h));
}
/** Kurva terbaru: memori -> PHEI -> cadangan KV. Hasil + state ("memory" | "live" | "stale-memory" | "stale-kv"). */
export async function getCurve(env, force = false, ctx = null) {
  if (!force && memo && Date.now() - memo.at < TTL_MS) return { ...memo.c, state: "memory" };
  try {
    const c = await fetchPhei();
    memo = { at: Date.now(), c };
    const p = save(env, c).catch((e) => console.error("PHEI KV:", e.message));
    if (ctx) ctx.waitUntil(p); else await p;
    return { ...c, state: "live" };
  } catch (e) {
    if (memo) return { ...memo.c, state: "stale-memory", error: e.message };
    const saved = env.BONDS_KV && (await env.BONDS_KV.get(LAST_KEY, "json"));
    if (saved) return { ...saved, state: "stale-kv", error: e.message };
    throw e;
  }
}
/** Riwayat harian { days: { "YYYY-MM-DD": { igs: { tenor: yield }, corp: { AAA: { tenor: yield } } } } }. */
export async function curveHistory(env) {
  const h = env.BONDS_KV ? (await env.BONDS_KV.get(HIST_KEY, "json")) || { days: {} } : { days: {} };
  // titik "~prev" (kolom kemarin di hari pertama) ditampilkan sebagai hari kerja sebelumnya
  const days = {};
  for (const [k, v] of Object.entries(h.days)) {
    if (!k.endsWith("~prev")) { days[k] = v; continue; }
    const d = new Date(k.slice(0, 10) + "T00:00:00Z");
    do d.setUTCDate(d.getUTCDate() - 1); while ([0, 6].includes(d.getUTCDay()));
    const key = d.toISOString().slice(0, 10);
    if (!days[key] && !h.days[key]) days[key] = v;
  }
  return { kv: !!env.BONDS_KV, days };
}
