/**
 * Shareholders ≥ 1% (BEI/KSEI monthly list): one key per holder so that spelling variants of the same name
 * ("GESIT PERKASA", "GESIT PERKASA, PT") count as one, and a rough category for display.
 */

/** Legal forms and noise words dropped from the key (not from the displayed name). */
const NOISE = /\b(PT|TBK|PERSERO|PERSEROAN|PERUSAHAAN|LTD|LIMITED|PTE|INC|CORP|CORPORATION|PLC|LLC|SA|AG|NV|BV|CO)\b/g;

/** Academic / religious titles written in any order ("IR GAFUR ... MBA" = "GAFUR ...,IR,MBA"). */
const TITLES = new Set(["DRS", "DRA", "DR", "IR", "MBA", "SH", "SE", "MM", "MSC", "MSI", "PHD", "HJ", "SPD", "MKOM", "BSC", "MA", "ST", "SKOM", "MH", "MT"]);

/** Key = words without legal forms and titles, sorted, so word order and titles do not split one holder in two. */
export function holderKey(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[.,()'"]/g, " ")
    .replace(NOISE, " ")
    .replace(/[^A-Z0-9&/ -]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w !== "-" && !TITLES.has(w))
    .sort()
    .join(" ");
}

export type HolderCat = "perorangan" | "korporasi" | "institusi" | "pemerintah" | "kustodian" | "lainnya";

const GOV_TYPES = new Set(["GOVERNMENT", "STATE OWNED ENTERPRISES", "STATE OWNED COMPANY", "SOVEREIGN WEALTH FUND"]);
const INST_TYPES = new Set([
  "MUTUAL FUNDS", "PENSION FUNDS", "INSURANCE", "INVESTMENT MANAGER", "INVESTMENT ADVISORS", "EXCHANGE TRADED FUNDS",
  "HEDGE FUND", "FINANCIAL INSTITUTIONAL", "INVESTMENT FUND SELLING AGENT", "PRIVATE EQUITY", "VENTURE CAPITAL",
]);
const CUSTODY_NAME = /\b(REGISTRAR|NOMINEES?|CLIENTS?|CUSTOD\w*|WEALTH MANAGEMENT|PRIVATE BANKING|WM CLIENT|S\/A|A\/C)\b/;

/**
 * Category from the KSEI investor type and the name. "kustodian" = probably an omnibus / nominee account (foreign private
 * banks and brokers, local securities companies, "REGISTRAR" accounts): the real owner is not visible.
 */
export function holderCat(type: string | null, local: boolean, raw: string): HolderCat {
  const t = (type ?? "").toUpperCase();
  const name = raw.toUpperCase();
  if (CUSTODY_NAME.test(name)) return "kustodian";
  if (t === "SECURITIES COMPANY" || t === "BROKERAGE FIRMS" || t === "TRUSTEE BANK") return "kustodian";
  if (!local && (t === "PRIVATE BANK" || t === "BANK")) return "kustodian";
  if (GOV_TYPES.has(t) || /\b(REPUBLIK INDONESIA|DANANTARA|KEMENTERIAN|PEMERINTAH)\b/.test(name)) return "pemerintah";
  if (INST_TYPES.has(t) || /^REKSA DANA\b/.test(name) || t === "BANK") return "institusi";
  if (t === "INDIVIDUAL") return "perorangan";
  if (t) return "korporasi"; // CORPORATE, FIRM, PARTNERSHIP, CV, FOUNDATION, local "PRIVATE BANK" (mis. Saratoga), ...
  return /\b(PT|TBK|CV|LTD|LIMITED|INC|CORP|FUND|BANK)\b/.test(name) ? "korporasi" : "lainnya";
}
