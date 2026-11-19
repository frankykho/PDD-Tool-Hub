/**
 * Dividen: riwayat (Yahoo, 10 th) + perkiraan dividen berikutnya dari laporan keuangan terakhir.
 * Rumus: docs/superpowers/specs/2026-11-19-sats-dividen-design.md. Tes: src/test-dividends.ts.
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type Payment = { date: string; amount: number }; // YYYY-MM-DD, rupiah per lembar
export type Confidence = "tinggi" | "sedang" | "rendah";
export interface DivYear { fy: number; dps: number; eps: number | null; payout: number | null }
export interface DivSummary {
  last_date: string;
  last_amount: number;
  fy_last: number; // tahun buku terakhir yang dianggap lengkap
  dps_last: number;
  payout: number | null; // % acuan (median 3 TB, 0–100)
  eps_ttm: number | null; // rupiah, 12 bulan terakhir
  est_dps: number | null;
  est_paid: number; // dividen tahun buku berjalan yang sudah dibayar (interim)
  streak: number;
  dps_cagr3: number | null; // %
  confidence: Confidence | null;
  history: { years: DivYear[]; payments: Payment[] };
}

/**
 * Okt–Des = interim tahun itu; Jan–Sep = final (atau interim Januari) tahun sebelumnya.
 * shortcut: menganggap tahun buku berakhir Desember (hampir semua emiten BEI); emiten tahun buku Juni/Maret bisa bergeser satu TB.
 */
export const fiscalYear = (date: string) => {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 10 ? y : y - 1;
};
/** Tahun buku yang dividennya mungkin belum lengkap dibayar. */
export const targetFy = (today: string) => new Date(Date.parse(today) - 270 * 86400_000).getUTCFullYear();

const r2 = (v: number) => Math.round(v * 100) / 100;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export function summarize(input: { payments: Payment[]; annualEps: Record<number, number>; epsTtm: number | null; today: string }): DivSummary | null {
  const payments = input.payments.filter((p) => p.amount > 0).sort((a, b) => b.date.localeCompare(a.date));
  if (!payments.length) return null;
  // TB yang final-nya sudah ex-date (Jan–Sep tahun berikutnya) dianggap lengkap, perkiraan pindah ke TB sesudahnya
  const t0 = targetFy(input.today);
  const tfy = payments.some((p) => fiscalYear(p.date) === t0 && p.date.startsWith(String(t0 + 1))) ? t0 + 1 : t0;
  const fyLast = tfy - 1;
  const dps = new Map<number, number>();
  for (const p of payments) dps.set(fiscalYear(p.date), (dps.get(fiscalYear(p.date)) ?? 0) + p.amount);
  const d = (fy: number) => r2(dps.get(fy) ?? 0);

  const first = Math.min(...dps.keys());
  const years: DivYear[] = [];
  for (let fy = Math.max(...dps.keys(), fyLast); fy >= first; fy -= 1) {
    const eps = input.annualEps[fy] ?? null;
    years.push({ fy, dps: d(fy), eps, payout: eps != null && eps > 0 ? r2((d(fy) / eps) * 100) : null });
  }
  const recentYears = years.filter((y) => y.fy <= fyLast && y.payout != null).slice(0, 3);
  const recent = recentYears.map((y) => y.payout as number);
  // ≥ 3 ex-date dalam satu TB: interim pertengahan tahun mungkin masuk TB yang salah, payout kurang bisa dipercaya
  const crowded = recentYears.some((y) => payments.filter((p) => fiscalYear(p.date) === y.fy).length >= 3);
  const payout = recent.length ? Math.min(100, Math.max(0, median(recent))) : null;

  let streak = 0;
  while (streak < 10 && d(fyLast - streak) > 0) streak += 1;
  const eps = input.epsTtm;
  const paysLately = d(fyLast) > 0 || d(fyLast - 1) > 0;
  const est = eps != null && eps > 0 && payout != null && paysLately ? r2((payout / 100) * eps) : null;
  const confidence: Confidence | null =
    est == null ? null : crowded ? "rendah" : streak >= 3 && recent.length >= 3 && Math.max(...recent) - Math.min(...recent) <= 30 ? "tinggi" : streak >= 2 ? "sedang" : "rendah";
  const base = d(fyLast - 3);

  return {
    last_date: payments[0].date,
    last_amount: r2(payments[0].amount),
    fy_last: fyLast,
    dps_last: d(fyLast),
    payout: payout == null ? null : r2(payout),
    eps_ttm: eps == null ? null : r2(eps),
    est_dps: est,
    est_paid: d(tfy),
    streak,
    dps_cagr3: base > 0 && d(fyLast) > 0 ? r2(((d(fyLast) / base) ** (1 / 3) - 1) * 100) : null,
    confidence,
    history: { years, payments: payments.map((p) => ({ date: p.date, amount: r2(p.amount) })) },
  };
}

export const DIV_COLUMNS: Array<[keyof DivSummary | "code" | "as_of", "TEXT" | "REAL" | "INTEGER"]> = [
  ["code", "TEXT"],
  ["as_of", "TEXT"],
  ["last_date", "TEXT"],
  ["last_amount", "REAL"],
  ["fy_last", "INTEGER"],
  ["dps_last", "REAL"],
  ["payout", "REAL"],
  ["eps_ttm", "REAL"],
  ["est_dps", "REAL"],
  ["est_paid", "REAL"],
  ["streak", "INTEGER"],
  ["dps_cagr3", "REAL"],
  ["confidence", "TEXT"],
  ["history", "TEXT"], // JSON {years, payments}
];
export const DIV_DDL =
  `CREATE TABLE IF NOT EXISTS div_latest (` +
  DIV_COLUMNS.map(([c, t]) => (c === "code" ? `${c} TEXT PRIMARY KEY` : `${c} ${t}`)).join(", ") +
  `)`;

/** EPS laporan -> rupiah. Kurs tidak ada -> kosong (jangan pakai EPS USD mentah). */
export function epsToIdr(eps: { currency: string | null; annual: Record<number, number>; ttm: number | null } | null, rate: number | null) {
  if (!eps || rate == null) return { annual: {} as Record<number, number>, ttm: null };
  return { annual: Object.fromEntries(Object.entries(eps.annual).map(([y, v]) => [y, r2(v * rate)])) as Record<number, number>, ttm: eps.ttm == null ? null : r2(eps.ttm * rate) };
}

/** EPS 12 bulan terbaru; titik yang loncat > 5× dari titik sebelumnya DAN EPS tahunan terakhir dianggap salah data (BJTM 2026-09: 7.332 vs ±104). */
export function pickTtm(points: Array<[string, number]>, annualLatest: number | null): number | null {
  const p = [...points].sort((a, b) => a[0].localeCompare(b[0]));
  const last = p.at(-1)?.[1] ?? null;
  const ref = Math.max(p.at(-2)?.[1] ?? -Infinity, annualLatest ?? -Infinity);
  return last != null && p.length > 1 && ref > 0 && last > 5 * ref ? p[p.length - 2][1] : last;
}

const get = async (url: string) => {
  for (let a = 0; a < 3; a += 1) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
      if (r.status === 404) return null;
      if (r.ok) return (await r.json()) as any;
    } catch {
      /* coba lagi */
    }
    await new Promise((res) => setTimeout(res, 1500 * 2 ** a));
  }
  return undefined; // gagal
};

/** Riwayat dividen 10 th (sudah disesuaikan stock split). null = gagal dimuat; [] = tidak pernah bagi dividen. */
export async function fetchPayments(code: string): Promise<Payment[] | null> {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${code}.JK?range=10y&interval=1mo&events=div`);
  if (j === undefined) return null;
  const ev = j?.chart?.result?.[0]?.events?.dividends ?? {};
  return Object.values(ev as Record<string, { date: number; amount: number }>)
    .filter((x) => Number.isFinite(x.amount))
    .map((x) => ({ date: new Date((x.date + 7 * 3600) * 1000).toISOString().slice(0, 10), amount: x.amount }));
}

/** EPS tahunan per tahun buku + EPS 12 bulan terakhir, dalam mata uang laporan. */
export async function fetchEps(code: string): Promise<{ currency: string | null; annual: Record<number, number>; ttm: number | null } | null> {
  const p2 = Math.floor(Date.now() / 1000);
  const j = await get(
    `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${code}.JK` +
      `?type=annualDilutedEPS,trailingDilutedEPS&period1=${p2 - 11 * 365 * 86400}&period2=${p2}`,
  );
  if (!j) return null;
  let currency: string | null = null;
  const annual: Record<number, number> = {};
  let ttmPts: Array<[string, number]> = [];
  for (const t of j?.timeseries?.result ?? []) {
    const k = t?.meta?.type?.[0];
    const vals = ((t?.[k] ?? []) as any[]).filter((v) => v && Number.isFinite(v.reportedValue?.raw));
    for (const v of vals) currency ??= v.currencyCode ?? null;
    if (k === "annualDilutedEPS") for (const v of vals) annual[Number(String(v.asOfDate).slice(0, 4))] = v.reportedValue.raw;
    if (k === "trailingDilutedEPS") ttmPts = vals.map((v) => [String(v.asOfDate), v.reportedValue.raw]);
  }
  const lastFy = Math.max(...Object.keys(annual).map(Number));
  return { currency, annual, ttm: pickTtm(ttmPts, annual[lastFy] ?? null) };
}
