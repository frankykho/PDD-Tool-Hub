// Bahan Live IG mingguan: hitungan tanpa I/O (dites di test-live.mjs) + aturan AI.
// Rancangan: docs/superpowers/specs/2026-11-20-bahan-live-ig-design.md
import { contributions, r2 } from "../market-recap/calc.js";
import { checkCopy } from "../../shared/compliance.js";

const DAY = 864e5;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Senin–Jumat dari minggu tanggal itu (Sabtu/Minggu ikut minggu yang baru lewat). */
export function weekOf(day) {
  const t = Date.parse(day + "T00:00:00Z"), dow = new Date(t).getUTCDay();
  const mon = t - ((dow + 6) % 7) * DAY;
  return { mon: iso(mon), fri: iso(mon + 4 * DAY) };
}
/** Minggu yang disusun saat tombol diklik: Jumat ≥ 17.30 WIB (rekap penutupan sudah ada) s/d Minggu = minggu ini; selain itu minggu lalu. */
export function buildWeek(nowMs = Date.now()) {
  const w = new Date(nowMs + 7 * 3600e3), dow = w.getUTCDay(), day = iso(w.getTime());
  const done = dow === 6 || dow === 0 || (dow === 5 && w.getUTCHours() * 60 + w.getUTCMinutes() >= 17 * 60 + 30);
  return weekOf(done ? day : iso(w.getTime() - 7 * DAY)).mon;
}

/** Angka seminggu dari rekap penutupan harian (urut tanggal). Penggerak = jumlah 5 teratas harian (perkiraan). */
export function weekNumbers(recaps) {
  const R = [...recaps].sort((a, b) => a.date.localeCompare(b.date));
  if (!R.length) return null;
  const open = R[0].ihsg.prev, close = R[R.length - 1].ihsg.close;
  const nums = (k) => R.map((r) => r.ihsg[k]).filter((v) => Number.isFinite(v));
  const withF = R.filter((r) => r.foreign && Number.isFinite(r.foreign.net));
  const sec = new Map();
  for (const r of R) for (const s of r.sectors || []) sec.set(s.name, (sec.get(s.name) ?? 1) * (1 + s.pct / 100));
  const pts = new Map();
  for (const r of R) for (const m of [...((r.movers || {}).up || []), ...((r.movers || {}).down || [])]) pts.set(m.code, (pts.get(m.code) || 0) + m.pts);
  const mv = [...pts].map(([code, p]) => ({ code, pts: r2(p) }));
  return {
    days: R.map((r) => r.date),
    daily: R.map((r) => ({ date: r.date, close: r.ihsg.close, pct: r2((r.ihsg.close / r.ihsg.prev - 1) * 100) })),
    ihsg: { open, close, pct: r2((close / open - 1) * 100), high: Math.max(...nums("high")), low: Math.min(...nums("low")) },
    foreign: withF.length ? { net: withF.reduce((a, r) => a + r.foreign.net, 0), days: withF.length } : null,
    sectors: [...sec].map(([name, f]) => ({ name, pct: r2((f - 1) * 100) })).sort((a, b) => b.pct - a.pct),
    moversDaily: { up: mv.filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 5), down: mv.filter((x) => x.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, 5) },
  };
}

/** Penggerak seminggu dari TradingView: rows [kode, close, Perf.W, kapitalisasi]; rumus sama dengan kontribusi harian Market Recap. */
export function weekMovers(rows, ihsgPrevWeek) {
  const c = contributions(rows, ihsgPrevWeek);
  return { up: c.up, down: c.down };
}

/** Saham paling ramai: rows TradingView [kode, close, Perf.W, volume relatif, nilai transaksi]; nilai < Rp1 M dilewati. */
export function hypeStocks(news, rows, n = 5) {
  const ment = new Map();
  for (const x of news) for (const c of new Set(x.tickers || [])) ment.set(c, (ment.get(c) || 0) + 1);
  return rows.filter((d) => (d[4] || 0) >= 1e9 && Number.isFinite(d[2]))
    .map(([code, close, pct, rel]) => {
      const mentions = ment.get(code) || 0;
      return { code, close, pct: r2(pct), relVol: r2(rel || 0), mentions, s: 2 * mentions + Math.abs(pct) / 5 + Math.max(0, (rel || 0) - 1) };
    })
    .sort((a, b) => b.s - a.s).slice(0, n).map(({ s, ...x }) => x);
}

/** Berita minggu itu: satu wakil per kelompok (ckey), urut jumlah media lalu skor. */
export function weekNews(items, n = 5) {
  const g = new Map();
  for (const x of items) { const k = x.ckey || "U:" + x.id; if (!g.has(k)) g.set(k, []); g.get(k).push(x); }
  return [...g.values()].map((L) => {
    const lead = [...L].sort((a, b) => (b.score || 0) - (a.score || 0))[0], media = new Set(L.map((x) => x.src)).size;
    const why = (L.find((x) => x.why) || {}).why || "";
    return { id: lead.id, title: lead.ai_title || lead.title, src: lead.src, url: lead.url, at: lead.at, tickers: lead.tickers || [], summary: lead.summary || "", why, media, s: 2 * media + (lead.score || 0) / 2 };
  }).sort((a, b) => b.s - a.s).slice(0, n).map(({ s, ...x }) => x);
}

/** JSON dari jawaban AI yang kadang berpagar ```json atau diberi kalimat pembuka. null = tidak terbaca. */
export function parseJsonLoose(text) {
  const t = String(text || "").replace(/```(?:json)?/gi, "");
  const a = t.search(/[[{]/);
  if (a < 0) return null;
  const close = t[a] === "[" ? "]" : "}";
  for (let b = t.lastIndexOf(close); b > a; b = t.lastIndexOf(close, b - 1)) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch {}
  }
  return null;
}

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
/** Gabung pertanyaan follower {akun, q}; duplikat persis (akun + teks, tanpa beda huruf besar/spasi) dibuang. */
export function mergeQuestions(old, add) {
  const seen = new Set(), out = [];
  for (const x of [...(old || []), ...(add || [])].filter((x) => x && typeof x === "object")) {
    const q = String(x.q || "").replace(/\s+/g, " ").trim().slice(0, 500), akun = String(x.akun || "").replace(/^@/, "").trim().slice(0, 60);
    const k = norm(akun) + "|" + norm(q);
    if (!q || seen.has(k)) continue;
    seen.add(k);
    out.push({ akun, q });
  }
  return out;
}

/** Temuan kepatuhan berat (janji untung, ajakan transaksi/target harga). */
export const flags = (text) => checkCopy(String(text || ""), { platform: "wa", license: false }).issues.filter((i) => i.level === "error").map(({ msg, match }) => ({ msg, match }));

const rp = (v) => (v == null ? "-" : `Rp${(v / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`);
const pc = (v) => (v == null ? "-" : `${v > 0 ? "+" : ""}${String(v).replace(".", ",")}%`);
/** Ringkasan data untuk AI (hanya angka ini yang boleh dipakai). */
export function factsText(d, news, weekend = []) {
  const N = d.numbers || {};
  const L = [`Minggu ${d.mon} s/d ${d.fri} (hari bursa: ${(N.days || []).join(", ")})`];
  if (N.ihsg) L.push(`IHSG: ${N.ihsg.open} -> ${N.ihsg.close} (${pc(N.ihsg.pct)}), tertinggi ${N.ihsg.high}, terendah ${N.ihsg.low}`);
  if (N.daily) L.push("Harian: " + N.daily.map((x) => `${x.date} ${x.close} (${pc(x.pct)})`).join("; "));
  if (N.foreign) L.push(`Asing seminggu: net ${N.foreign.net >= 0 ? "beli" : "jual"} ${rp(Math.abs(N.foreign.net))} (${N.foreign.days} hari ada data)`);
  if (N.sectors && N.sectors.length) L.push("Sektor: " + N.sectors.map((s) => `${s.name} ${pc(s.pct)}`).join(", "));
  const mv = d.movers || {};
  if (mv.up) L.push(`Penggerak naik${mv.approx ? " (perkiraan)" : ""}: ` + mv.up.map((x) => `${x.code} ${x.pts > 0 ? "+" : ""}${x.pts} poin`).join(", "));
  if (mv.down) L.push(`Penekan${mv.approx ? " (perkiraan)" : ""}: ` + mv.down.map((x) => `${x.code} ${x.pts} poin`).join(", "));
  if (d.hype && d.hype.length) L.push("Saham paling ramai: " + d.hype.map((x) => `${x.code} ${pc(x.pct)} seminggu, ${x.mentions} berita, volume ${x.relVol}x rata-rata`).join("; "));
  const nw = (arr, t) => arr.length && L.push(t + "\n" + arr.map((x) => `- ${x.title} (${x.src}${x.media > 1 ? `, ${x.media} media` : ""})${x.why ? ` — ${x.why}` : ""}`).join("\n"));
  nw(news || [], "Berita paling ramai minggu itu:");
  nw(weekend || [], "Berita akhir pekan (setelah penutupan Jumat):");
  if (d.agenda && d.agenda.length) L.push("Agenda minggu depan:\n" + d.agenda.map((a) => `- ${a.d}${a.time ? " " + a.time : ""} ${a.country || ""} ${a.t}`).join("\n"));
  return L.join("\n");
}

const COMMON = `Kamu menulis untuk live Instagram tim investasi sebuah sekuritas di Indonesia. Penonton: follower yang sudah biasa trading saham,
jadi istilah (breakout, net sell asing, support/resistance, cum date) boleh dipakai tanpa dijelaskan panjang.
Aturan wajib:
1. Pakai HANYA angka & fakta dari data yang diberikan. Jangan menambah angka, harga, atau kejadian lain.
2. Dilarang memberi rekomendasi beli/jual/tahan, target harga, TP/SL, atau ajakan transaksi saham tertentu. Boleh membahas apa yang terjadi dan apa yang perlu dipantau.
3. Dilarang menjanjikan keuntungan. Bahasa Indonesia, santai tapi rapi, persen dengan koma (3,5%).`;

export const SCRIPT_RULES = `${COMMON}
Tulis NASKAH SIAP BACA untuk pembawa acara, ±700–900 kata (5–7 menit bicara), teks biasa tanpa Markdown.
Alur: pembuka singkat -> IHSG seminggu -> saham yang paling ramai -> berita paling ramai -> (bila ada) berita akhir pekan -> agenda minggu depan & apa yang dipantau -> ajakan bertanya lewat kolom komentar.
Pisahkan bagian dengan baris kosong. Tutup dengan satu kalimat "keputusan investasi tetap di tangan masing-masing".`;

export const BACKUP_RULES = `${COMMON}
Buat 9 PERTANYAAN CADANGAN yang terdengar seperti ditulis follower sungguhan di stiker pertanyaan IG: singkat (≤ 20 kata), santai,
kadang menyebut kode saham, variasi gaya (ada yang pakai "kak", ada yang langsung). 5 terkait data/berita minggu itu, 4 soal strategi & membaca pasar.
Untuk tiap pertanyaan beri 3–5 poin jawaban berbasis data (tanpa rekomendasi).
Jawab HANYA JSON: [{"q":"...","points":["...","..."]}]`;

export const OCR_RULES = `Gambar adalah screenshot jawaban stiker pertanyaan Instagram. Salin setiap pertanyaan PERSIS seperti tertulis (jangan diperbaiki),
beserta nama akun penanya bila terlihat (tanpa @). Abaikan teks antarmuka Instagram (tombol, jumlah penonton, waktu).
Jawab HANYA JSON: [{"akun":"...","q":"..."}]. Bila tidak ada pertanyaan: [].`;

export const GROUP_RULES = `${COMMON}
Kamu diberi daftar pertanyaan follower (nomor, akun, pertanyaan) dan data pasar minggu itu.
Kelompokkan pertanyaan yang maksudnya sama. Untuk tiap kelompok: judul singkat, nomor-nomor pertanyaannya, "layak" (true bila relevan
untuk live & bisa dijawab tanpa rekomendasi pribadi; false bila spam, minta sinyal beli/jual pribadi, atau di luar topik) dengan alasan singkat,
dan 3–5 poin jawaban (untuk yang tidak layak: satu poin cara menjawabnya dengan sopan). Urutkan dari yang paling layak & paling banyak ditanyakan.
Jawab HANYA JSON: [{"title":"...","ids":[1,2],"layak":true,"alasan":"...","points":["..."]}]`;
