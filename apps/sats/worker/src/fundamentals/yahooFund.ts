/** Yahoo Finance fundamentals (quoteSummary) for IDX stocks, with currency correction. */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface YahooSession {
  cookie: string;
  crumb: string;
}

export async function yahooSession(): Promise<YahooSession> {
  const r1 = await fetch("https://fc.yahoo.com/", { headers: { "user-agent": UA }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  const raw = r1.headers.getSetCookie?.() ?? [r1.headers.get("set-cookie") ?? ""];
  const cookie = raw.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "user-agent": UA, cookie },
    signal: AbortSignal.timeout(20_000),
  });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.includes("<")) throw new Error(`Yahoo crumb gagal (HTTP ${r2.status})`);
  return { cookie, crumb };
}

/** USD/IDR (and other currencies when needed) from Yahoo chart, last close. */
export async function fxToIdr(currency: string): Promise<number> {
  if (currency === "IDR") return 1;
  const sym = currency === "USD" ? "IDR=X" : `${currency}IDR=X`;
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Kurs ${sym} HTTP ${res.status}`);
  const j: any = await res.json();
  const closes: number[] = (j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((x: unknown) => typeof x === "number");
  const v = closes.at(-1) ?? j?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!v || !Number.isFinite(v)) throw new Error(`Kurs ${sym} kosong`);
  return v;
}

export interface RawFund {
  code: string;
  ok: boolean;
  currency: string | null;
  lastQuarter: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  trailingPE: number | null;
  priceToBook: number | null;
  roe: number | null; // fraction
  debtToEquity: number | null; // percent
  revenueGrowth: number | null; // fraction
  earningsGrowth: number | null; // fraction
  dividendYield: number | null; // fraction
  netIncome: number | null; // reporting currency
  bookValue: number | null; // per share, reporting currency
}

const num = (o: any, k: string): number | null => {
  const v = o?.[k]?.raw ?? o?.[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

export async function fetchFund(code: string, s: YahooSession): Promise<RawFund> {
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${code}.JK` +
    `?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile&crumb=${encodeURIComponent(s.crumb)}`;
  const empty: RawFund = {
    code, ok: false, currency: null, lastQuarter: null, sector: null, industry: null, marketCap: null, trailingPE: null,
    priceToBook: null, roe: null, debtToEquity: null, revenueGrowth: null, earningsGrowth: null, dividendYield: null, netIncome: null, bookValue: null,
  };
  for (let a = 0; a < 3; a += 1) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, cookie: s.cookie }, signal: AbortSignal.timeout(20_000) });
      if (res.status === 404) return empty;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j: any = await res.json();
      const r = j?.quoteSummary?.result?.[0];
      if (!r) return empty;
      const sd = r.summaryDetail ?? {};
      const ks = r.defaultKeyStatistics ?? {};
      const fd = r.financialData ?? {};
      const ap = r.assetProfile ?? {};
      const lq = num(ks, "mostRecentQuarter");
      return {
        code,
        ok: true,
        currency: typeof fd.financialCurrency === "string" ? fd.financialCurrency : null,
        lastQuarter: lq == null ? null : new Date(lq * 1000).toISOString().slice(0, 10),
        sector: typeof ap.sector === "string" ? ap.sector : null,
        industry: typeof ap.industry === "string" ? ap.industry : null,
        marketCap: num(sd, "marketCap"),
        trailingPE: num(sd, "trailingPE"),
        priceToBook: num(ks, "priceToBook"),
        roe: num(fd, "returnOnEquity"),
        debtToEquity: num(fd, "debtToEquity"),
        revenueGrowth: num(fd, "revenueGrowth"),
        earningsGrowth: num(fd, "earningsGrowth"),
        dividendYield: num(sd, "dividendYield"),
        netIncome: num(ks, "netIncomeToCommon"),
        bookValue: num(ks, "bookValue"),
      };
    } catch {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** a));
    }
  }
  return empty;
}

export interface FundRow {
  code: string;
  currency: string | null;
  last_quarter: string | null;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  per: number | null;
  pbv: number | null;
  roe: number | null;
  der: number | null;
  rev_growth: number | null;
  eps_growth: number | null;
  div_yield: number | null;
  net_income: number | null;
  profitable: number | null;
  equity_positive: number | null;
  stale: number | null;
}

const r2 = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
/** Values beyond these are artefacts of a tiny denominator; stored as null. */
const capAbs = (v: number | null, max: number) => (v == null || Math.abs(v) > max ? null : v);

/** Normalise: convert reporting currency to IDR, recompute PER/PBV consistently, drop absurd values. */
export function normalise(f: RawFund, fx: Record<string, number>, today: string): FundRow {
  const cur = f.currency ?? "IDR";
  const rate = fx[cur] ?? null;
  const netIncomeIdr = f.netIncome != null && rate ? f.netIncome * rate : null;
  // PER: Yahoo's trailingPE is already currency-consistent; fall back to market cap / net income
  let per = f.trailingPE;
  if (per == null && netIncomeIdr != null && netIncomeIdr > 0 && f.marketCap) per = f.marketCap / netIncomeIdr;
  if (netIncomeIdr != null && netIncomeIdr <= 0) per = null;
  // PBV: Yahoo divides an IDR price by a book value in the reporting currency → divide by the FX rate
  let pbv = f.priceToBook;
  if (pbv != null && cur !== "IDR") pbv = rate ? pbv / rate : null;
  const staleCut = new Date(Date.parse(today) - 270 * 86400_000).toISOString().slice(0, 10);
  return {
    code: f.code,
    currency: f.currency,
    last_quarter: f.lastQuarter,
    sector: f.sector,
    industry: f.industry,
    market_cap: f.marketCap,
    per: r2(capAbs(per, 1000)),
    pbv: r2(capAbs(pbv, 200)),
    roe: r2(capAbs(f.roe == null ? null : f.roe * 100, 500)),
    der: r2(capAbs(f.debtToEquity == null ? null : f.debtToEquity / 100, 50)),
    rev_growth: r2(capAbs(f.revenueGrowth == null ? null : f.revenueGrowth * 100, 1000)),
    eps_growth: r2(capAbs(f.earningsGrowth == null ? null : f.earningsGrowth * 100, 1000)),
    div_yield: r2(capAbs(f.dividendYield == null ? null : f.dividendYield * 100, 50)),
    net_income: netIncomeIdr == null ? null : Math.round(netIncomeIdr),
    profitable: f.netIncome == null ? null : f.netIncome > 0 ? 1 : 0,
    equity_positive: f.bookValue == null ? null : f.bookValue > 0 ? 1 : 0,
    stale: f.lastQuarter == null ? null : f.lastQuarter < staleCut ? 1 : 0,
  };
}
