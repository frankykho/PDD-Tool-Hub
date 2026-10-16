/**
 * Seberapa lengkap data fundamental Yahoo untuk saham BEI?
 *
 *   npx tsx src/analysis/yahoo-fundamentals-coverage.ts            # 963 saham (±5–10 menit)
 *   npx tsx src/analysis/yahoo-fundamentals-coverage.ts --limit 50 # coba cepat
 *
 * Output:
 *   - tabel kelengkapan per metrik: semua saham, KOMPAS100, dan LQ45
 *   - contoh nilai untuk beberapa saham besar (cek kewajaran)
 *   - out/fundamentals.csv (semua angka, untuk dicek di Excel)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import universe from "../pipeline/universe.json";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CONCURRENCY = 4;
const args = process.argv.slice(2);
const limit = Number(args[args.indexOf("--limit") + 1] ?? 0) || 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Fund {
  code: string;
  marketCap: number | null;
  per: number | null; // trailing P/E
  pbv: number | null;
  roe: number | null; // %
  der: number | null; // ×  (Yahoo gives %, converted)
  revGrowth: number | null; // % YoY (latest quarter)
  epsGrowth: number | null; // % YoY (latest quarter)
  divYield: number | null; // %
  netIncome: number | null;
  bookValuePerShare: number | null;
  lastQuarter: string | null; // date of the most recent reported quarter
}

const FIELDS: Array<[keyof Fund, string]> = [
  ["marketCap", "Kapitalisasi pasar"],
  ["per", "PER"],
  ["pbv", "PBV"],
  ["roe", "ROE"],
  ["der", "DER"],
  ["revGrowth", "Pertumbuhan pendapatan"],
  ["epsGrowth", "Pertumbuhan laba"],
  ["divYield", "Dividend yield"],
  ["netIncome", "Laba bersih"],
  ["bookValuePerShare", "Nilai buku/saham"],
  ["lastQuarter", "Tanggal kuartal terakhir"],
];

/** Yahoo needs a cookie + crumb for quoteSummary. */
async function session(): Promise<{ cookie: string; crumb: string }> {
  const r1 = await fetch("https://fc.yahoo.com/", { headers: { "user-agent": UA }, redirect: "manual" });
  const raw = r1.headers.getSetCookie?.() ?? [r1.headers.get("set-cookie") ?? ""];
  const cookie = raw.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "user-agent": UA, cookie } });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.includes("<")) throw new Error(`Gagal mendapat crumb Yahoo (HTTP ${r2.status})`);
  return { cookie, crumb };
}

const raw = (o: any, k: string): number | null => {
  const v = o?.[k]?.raw ?? o?.[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

async function fetchFund(code: string, s: { cookie: string; crumb: string }): Promise<Fund> {
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${code}.JK` +
    `?modules=summaryDetail,defaultKeyStatistics,financialData&crumb=${encodeURIComponent(s.crumb)}`;
  for (let a = 0; a < 3; a += 1) {
    const res = await fetch(url, { headers: { "user-agent": UA, cookie: s.cookie }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 404) break;
    if (!res.ok) {
      await sleep(1500 * 2 ** a);
      continue;
    }
    const j: any = await res.json();
    const r = j?.quoteSummary?.result?.[0] ?? {};
    const sd = r.summaryDetail ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const fd = r.financialData ?? {};
    const pct = (v: number | null) => (v == null ? null : v * 100);
    const der = raw(fd, "debtToEquity");
    const lq = raw(ks, "mostRecentQuarter");
    return {
      code,
      marketCap: raw(sd, "marketCap"),
      per: raw(sd, "trailingPE"),
      pbv: raw(ks, "priceToBook"),
      roe: pct(raw(fd, "returnOnEquity")),
      der: der == null ? null : der / 100,
      revGrowth: pct(raw(fd, "revenueGrowth")),
      epsGrowth: pct(raw(fd, "earningsGrowth")),
      divYield: pct(raw(sd, "dividendYield")),
      netIncome: raw(ks, "netIncomeToCommon"),
      bookValuePerShare: raw(ks, "bookValue"),
      lastQuarter: lq == null ? null : new Date(lq * 1000).toISOString().slice(0, 10),
    };
  }
  return { code, marketCap: null, per: null, pbv: null, roe: null, der: null, revGrowth: null, epsGrowth: null, divYield: null, netIncome: null, bookValuePerShare: null, lastQuarter: null };
}

function members(file: string): Set<string> {
  try {
    const t = readFileSync(`src/pipeline/indices/${file}`, "utf8");
    return new Set(
      t
        .split("\n")
        .filter((l) => !l.trim().startsWith("#"))
        .join(" ")
        .split(/[\s,]+/)
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

async function main() {
  let codes = (universe as Array<{ code: string }>).map((u) => u.code);
  if (limit > 0) codes = codes.slice(0, limit);
  const s = await session();
  console.log(`Crumb OK. Mengambil fundamental ${codes.length} saham...`);

  const out: Fund[] = [];
  let cursor = 0;
  const t0 = Date.now();
  async function worker() {
    while (cursor < codes.length) {
      const code = codes[cursor++];
      out.push(await fetchFund(code, s));
      if (out.length % 100 === 0) console.log(`  ${out.length}/${codes.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      await sleep(150);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  out.sort((a, b) => a.code.localeCompare(b.code));

  const k100 = members("KOMPAS100.txt");
  const lq45 = members("LQ45.txt");
  const groups: Array<[string, Fund[]]> = [
    ["Semua", out],
    ["KOMPAS100", out.filter((f) => k100.has(f.code))],
    ["LQ45", out.filter((f) => lq45.has(f.code))],
  ];
  console.log(`\nKelengkapan data (persentase saham yang punya nilai):`);
  console.log(`  ${"Metrik".padEnd(26)}${groups.map(([g, a]) => `${g} (${a.length})`.padStart(16)).join("")}`);
  for (const [k, label] of FIELDS) {
    console.log(
      `  ${label.padEnd(26)}${groups
        .map(([, a]) => `${a.length ? ((a.filter((f) => f[k] != null).length / a.length) * 100).toFixed(0) : "–"}%`.padStart(16))
        .join("")}`,
    );
  }
  const quarters = out.map((f) => f.lastQuarter).filter(Boolean) as string[];
  const recent = quarters.filter((q) => q >= "2026-06-30").length;
  console.log(`\nKuartal terakhir ≥ 30 Jun 2026: ${recent} dari ${quarters.length} saham yang punya tanggal kuartal.`);

  console.log(`\nContoh (cek kewajaran dengan data yang kamu kenal):`);
  for (const c of ["BBCA", "BBRI", "TLKM", "ASII", "UNVR", "ADRO", "ANTM", "GOTO"]) {
    const f = out.find((x) => x.code === c);
    if (!f) continue;
    const r = (v: number | null, d = 1) => (v == null ? "—" : v.toFixed(d));
    console.log(
      `  ${c.padEnd(5)} PER ${r(f.per)}  PBV ${r(f.pbv, 2)}  ROE ${r(f.roe)}%  DER ${r(f.der, 2)}  laba ${r(f.epsGrowth)}%  div ${r(f.divYield)}%  kuartal ${f.lastQuarter ?? "—"}`,
    );
  }

  mkdirSync("out", { recursive: true });
  const head = ["code", ...FIELDS.map(([k]) => k)];
  writeFileSync("out/fundamentals.csv", [head.join(","), ...out.map((f) => head.map((h) => (f as any)[h] ?? "").join(","))].join("\n"));
  console.log(`\nSemua angka: out/fundamentals.csv · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
