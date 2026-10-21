/**
 * AI Stock Analyst: menjelaskan kondisi satu saham dari data yang tersedia (teknikal, sinyal strategi, rekam jejak,
 * fundamental, berita RSS, dividen & stock split dari Yahoo). AI hanya menjelaskan data yang diberikan, tanpa
 * rekomendasi beli/jual atau target harga.
 *
 *   GET  /api/analyst/:code   analisis tersimpan untuk data terbaru (atau null) + sisa kuota hari ini
 *   POST /api/analyst/:code   buat analisis (sekali per saham per tanggal data; dipakai bersama satu tim)
 *
 * AI: shared/ai.js (Workers AI gratis lewat binding AI; Claude bila secret ANTHROPIC_API_KEY dipasang).
 */
import { ai, AiError } from "../../../../shared/ai.js";
import { newsFor } from "../../../../shared/news.js";
import { radarScore } from "../../frontend/src/radar/score";
import type { ScreenerRow } from "../../frontend/src/api";

export interface AnalystEnv {
  screener_db: D1Database;
  AI?: unknown;
  ANTHROPIC_API_KEY?: string;
  /** batas analisis baru per hari untuk semua pengguna (kuota AI gratis ±25/hari) */
  ANALYST_DAILY?: string;
}

const DDL =
  "CREATE TABLE IF NOT EXISTS ai_analysis (code TEXT NOT NULL, as_of TEXT NOT NULL, text TEXT NOT NULL, model TEXT, data TEXT, " +
  "created_by TEXT, created_at TEXT NOT NULL, PRIMARY KEY (code, as_of))";
let ready = false;
const wibDate = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const r2 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : v ?? null);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

/** Nama pendek untuk mencari berita: "PT Bukit Asam (Persero) Tbk." -> "Bukit Asam" */
export function shortName(name: string): string {
  return name.replace(/\(.*?\)/g, "").replace(/\b(PT|Tbk|Persero)\b\.?/gi, "").replace(/[.,]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 2).join(" ");
}

/** Dividen & stock split 5 tahun dari Yahoo (corporate action lain tidak tersedia dari sumber gratis). */
async function corporateActions(code: string) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${code}.JK?range=5y&interval=1mo&events=div%2Csplit`, {
      headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000),
    });
    const ev = r.ok ? ((await r.json()) as any)?.chart?.result?.[0]?.events ?? {} : {};
    const d = (t: number) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);
    const dividends = Object.values(ev.dividends ?? {}).map((x: any) => ({ date: d(x.date), amount: r2(x.amount) })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    const splits = Object.values(ev.splits ?? {}).map((x: any) => ({ date: d(x.date), ratio: x.splitRatio ?? `${x.numerator}:${x.denominator}` }));
    return { ok: r.ok, dividends, splits };
  } catch {
    return { ok: false, dividends: [], splits: [] };
  }
}

/** Semua data yang dikirim ke AI (juga ditampilkan ke pengguna supaya bisa dicek). */
export async function gatherData(db: D1Database, code: string) {
  const stock = await db.prepare("SELECT code, name FROM stocks WHERE code = ?").bind(code).first<{ code: string; name: string }>();
  if (!stock) return null;
  const tech = await db.prepare("SELECT * FROM tech_latest WHERE code = ?").bind(code).first<Record<string, unknown>>();
  const fund = await db.prepare("SELECT * FROM fund_latest WHERE code = ?").bind(code).first<Record<string, unknown>>().catch(() => null);
  const rs = await db
    .prepare("SELECT rs_rank FROM (SELECT code, CAST(ROUND(PERCENT_RANK() OVER (ORDER BY chg126) * 100) AS INTEGER) AS rs_rank FROM tech_latest WHERE value_20d >= 1e9 AND chg126 IS NOT NULL) WHERE code = ?")
    .bind(code).first<{ rs_rank: number }>().catch(() => null);
  const { results: strat } = await db
    .prepare("SELECT strategy, last_signal, last_signal_date, last_signal_bars, last_signal_score, trade_status, entry, sl, stop_now, filter_signal FROM sats_latest WHERE code = ?")
    .bind(code).all<Record<string, unknown>>();
  const track = await db
    .prepare("SELECT COUNT(*) AS n, SUM(return_pct - 0.4 > 0) AS wins, AVG(return_pct - 0.4) AS avg_net FROM sats_trades WHERE code = ? AND strategy = 'SATS'")
    .bind(code).first<{ n: number; wins: number; avg_net: number }>().catch(() => null);
  const market = await db.prepare("SELECT as_of_date, ihsg_close, ihsg_ma200, above FROM market_status ORDER BY as_of_date DESC LIMIT 1").first<Record<string, unknown>>().catch(() => null);
  const sats = strat.find((s) => s.strategy === "SATS");
  const row = { ...(tech ?? {}), ...(fund ?? {}), fund_stale: fund?.stale ?? null, code, name: stock.name, rs_rank: rs?.rs_rank ?? null,
    sats_signal: sats?.last_signal ?? null, sats_bars: sats?.last_signal_bars ?? null, sats_filter: sats?.filter_signal ?? null } as unknown as ScreenerRow;
  const radar = tech ? radarScore(row) : null;
  const nm = shortName(stock.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const news = await newsFor(new RegExp(`\\b${code}\\b${nm.length >= 4 ? `|${nm}` : ""}`, "i"), 8).catch(() => []);
  const ca = await corporateActions(code);
  const T = (k: string) => r2(tech?.[k]);
  return {
    asOf: (tech?.as_of_date as string) ?? null,
    data: {
      saham: { kode: code, nama: stock.name, harga: T("close"), tanggal_data: tech?.as_of_date ?? null },
      perubahan_pct: { "1_hari": T("chg1"), "5_hari": T("chg5"), "20_hari": T("chg20"), "60_hari": T("chg60"), "6_bulan": T("chg126"), sejak_awal_tahun: T("chg_ytd") },
      tren: {
        jarak_ma20_pct: T("dist_ma20"), jarak_ma50_pct: T("dist_ma50"), jarak_ma200_pct: T("dist_ma200"), ma_berurut_naik: tech?.ma_stack ?? null,
        kemiringan_ma200_1bln_pct: T("ma200_slope22"), golden_cross_hari_lalu: tech?.golden_days ?? null, death_cross_hari_lalu: tech?.death_days ?? null,
        adx14: T("adx14"), rs_rank_0_100: rs?.rs_rank ?? null, jarak_high_52mg_pct: T("dist_high52"), jarak_low_52mg_pct: T("dist_low52"),
        breakout_20hari_hari_lalu: tech?.breakout20_days ?? null,
      },
      momentum: { rsi14: T("rsi14"), macd_hist: T("macd_hist"), stoch_k: T("stoch_k"), naik_beruntun_hari: tech?.up_streak ?? null, divergensi_bullish_rsi_hari_lalu: tech?.rsi_div_days ?? null },
      volume_likuiditas: {
        volume_vs_rata20: T("vol_ratio"), nilai_transaksi_rata20_rp: T("value_20d"), cmf20: T("cmf20"), obv20: T("obv20"), volume_naik_dibagi_turun: T("updown_vol20"),
        pocket_pivot_hari_lalu: tech?.pocket_pivot_days ?? null,
      },
      volatilitas: { atr_pct: T("atr_pct"), lebar_bollinger_pct: T("bb_width"), peringkat_lebar_bb_6bln: T("bb_pctile"), vcp: tech?.vcp ?? null },
      pola: { candle: tech?.candles ?? null, chart: tech?.chart_patterns ?? null },
      sinyal_strategi: strat.map((s) => ({ strategi: s.strategy, sinyal_terakhir: s.last_signal, tanggal: s.last_signal_date, umur_hari: s.last_signal_bars, status_posisi: s.trade_status, entry: r2(s.entry), stop: r2(s.stop_now ?? s.sl), skor_sats: r2(s.last_signal_score) })),
      rekam_jejak_sats_3th: track && track.n ? { jumlah_posisi: track.n, menang_pct: r2((track.wins / track.n) * 100), rata_return_bersih_pct: r2(track.avg_net) } : null,
      radar: radar ? { skor: radar.score, pilar: radar.pillars, penalti: radar.penalty, alasan: radar.reasons.map((x) => `${x.tone === "warn" ? "PERINGATAN: " : ""}${x.text}`) } : null,
      fundamental: fund ? {
        sektor: fund.sector, industri: fund.industry, kapitalisasi_rp: r2(fund.market_cap), per: r2(fund.per), pbv: r2(fund.pbv), roe_pct: r2(fund.roe), der: r2(fund.der),
        pertumbuhan_pendapatan_yoy_pct: r2(fund.rev_growth), pertumbuhan_laba_yoy_pct: r2(fund.eps_growth), dividend_yield_pct: r2(fund.div_yield),
        laba_positif: fund.profitable, ekuitas_positif: fund.equity_positive, laporan_kuartal_terakhir: fund.last_quarter, laporan_lebih_dari_9_bulan: fund.stale,
      } : null,
      pasar: market ? { ihsg: r2(market.ihsg_close), ihsg_di_atas_ma200: market.above, tanggal: market.as_of_date } : null,
      berita_7_hari: news.map((n: { t: string; src: string; at: string; link: string }) => ({ judul: n.t, sumber: n.src, tanggal: String(n.at).slice(0, 10), tautan: n.link })),
      corporate_action: { sumber: ca.ok ? "Yahoo Finance" : "gagal dimuat", dividen_5th: ca.dividends, stock_split_5th: ca.splits, catatan: "Rights issue, RUPS, buyback, dan aksi korporasi lain tidak tersedia dari sumber data ini." },
    },
  };
}

export const SYSTEM = `Kamu analis saham untuk tim internal sebuah perusahaan efek di Indonesia. Tugasmu MENJELASKAN kondisi satu saham BEI berdasarkan DATA JSON yang diberikan, dalam Bahasa Indonesia yang ringkas dan jelas.
Aturan wajib:
1. Hanya pakai fakta dari DATA. Jangan menambah fakta, berita, angka, peristiwa, atau pengetahuan lain tentang perusahaan.
2. Setiap klaim harus menyebut angkanya dari DATA (mis. "RSI 72", "5,3% di bawah high 52 minggu", "volume 1,6× rata-rata").
3. Jangan memberi rekomendasi beli, jual, atau tahan; jangan memberi target harga atau prediksi harga. Boleh menyebut level yang ada di DATA (entry/stop strategi) sebagai informasi.
4. Bila sebuah bagian datanya null atau kosong, tulis "Data tidak tersedia." Jangan menebak.
5. Berita: hanya sebut judul yang ada di DATA beserta sumber dan tanggalnya; jangan menyimpulkan isi artikel di luar judulnya. Bila tidak ada, tulis "Tidak ada berita yang menyebut saham ini dalam 7 hari terakhir."
6. Persen ditulis dengan koma desimal (5,3%). Maksimal ±350 kata.
Format jawaban PERSIS dengan judul-judul ini (Markdown), tiap bagian 1–4 kalimat atau poin "- ":
## Ringkasan
## Tren & momentum
## Volume & likuiditas
## Sinyal strategi
## Fundamental
## Berita & corporate action
## Risiko yang perlu dicek
## Yang perlu dipantau`;

/** Kalimat yang melanggar aturan "tanpa rekomendasi" ditandai supaya pengguna tahu. */
export function flagAdvice(text: string): boolean {
  // "Sinyal SATS BUY" adalah fakta dari data; yang ditandai hanya ajakan bertindak
  return /\b(sebaiknya|disarankan|layak|segera)\s+(dibeli|beli|membeli|dijual|jual|menjual|ditahan|tahan|akumulasi)\b|\btarget\s+harga\b|\bstrong\s+(buy|sell)\b|\brekomendasi\s+(beli|jual|tahan)\b/i.test(text);
}

export async function analystRoute(request: Request, env: AnalystEnv, codeRaw: string, who: string | null): Promise<Response> {
  const db = env.screener_db, code = codeRaw.toUpperCase();
  if (!ready) {
    await db.prepare(DDL).run();
    ready = true;
  }
  const asOfRow = await db.prepare("SELECT as_of_date AS d FROM tech_latest WHERE code = ?").bind(code).first<{ d: string }>();
  if (!asOfRow) return json({ error: "Kode tidak dikenal atau belum ada data teknikal" }, 404);
  const limit = Math.max(1, Number(env.ANALYST_DAILY) || 25), today = wibDate();
  const used = (await db.prepare("SELECT COUNT(*) AS n FROM ai_analysis WHERE substr(created_at, 1, 10) = ?").bind(today).first<{ n: number }>())?.n ?? 0;
  const saved = await db.prepare("SELECT * FROM ai_analysis WHERE code = ? AND as_of = ?").bind(code, asOfRow.d).first<Record<string, unknown>>();
  const prev = saved ? null : await db.prepare("SELECT * FROM ai_analysis WHERE code = ? ORDER BY as_of DESC LIMIT 1").bind(code).first<Record<string, unknown>>();
  const out = (a: Record<string, unknown> | null) => a && { ...a, data: a.data ? JSON.parse(String(a.data)) : null, advice: flagAdvice(String(a.text)) };
  if (request.method === "GET") return json({ asOf: asOfRow.d, analysis: out(saved), previous: out(prev), quota: { used, limit } });
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (saved) return json({ asOf: asOfRow.d, analysis: out(saved), quota: { used, limit } });
  if (used >= limit) return json({ error: `Kuota analisis AI hari ini (${limit}) sudah habis. Analisis yang sudah dibuat tetap bisa dibuka; kuota terisi lagi besok.` }, 429);
  const g = await gatherData(db, code);
  if (!g) return json({ error: "Kode tidak dikenal" }, 404);
  try {
    const { text, model } = await ai(env, SYSTEM, `DATA (JSON):\n${JSON.stringify(g.data)}`, 1400);
    const row = { code, as_of: asOfRow.d, text: text.slice(0, 12000), model, data: JSON.stringify(g.data), created_by: who || "lokal", created_at: new Date(Date.now() + 7 * 3600e3).toISOString().replace("Z", "+07:00") };
    await db.prepare("INSERT OR REPLACE INTO ai_analysis (code, as_of, text, model, data, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(row.code, row.as_of, row.text, row.model, row.data, row.created_by, row.created_at).run();
    return json({ asOf: asOfRow.d, analysis: out(row), quota: { used: used + 1, limit } });
  } catch (e) {
    return json({ error: e instanceof AiError ? e.message : "AI gagal: " + (e instanceof Error ? e.message : String(e)) }, e instanceof AiError ? 503 : 500);
  }
}
