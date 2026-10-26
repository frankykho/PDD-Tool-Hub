/** Small helpers so the dashboard remembers filters + scroll position across detail pages. */

const DASH_HASH_KEY = "sats.dashHash";
const DASH_SCROLL_KEY = "sats.dashScroll";

const ss = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

/** Query part of the dashboard hash, e.g. "#/?side=BUY&age=0" -> URLSearchParams */
export function dashboardParams(): URLSearchParams {
  const h = window.location.hash;
  const i = h.indexOf("?");
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : "");
}

/** Update the dashboard URL without adding a history entry. */
export function replaceDashboardParams(params: Record<string, string>): void {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "")).toString();
  const hash = `#/${q ? `?${q}` : ""}`;
  if (window.location.hash !== hash) history.replaceState(history.state, "", hash);
  ss.set(DASH_HASH_KEY, hash);
}

export const lastDashboardHash = () => ss.get(DASH_HASH_KEY) ?? "#/";
export const saveDashboardScroll = (y: number) => ss.set(DASH_SCROLL_KEY, String(Math.round(y)));
export const savedDashboardScroll = () => Number(ss.get(DASH_SCROLL_KEY) ?? 0);

/**
 * Back from a detail page: to the page the stock was opened from (remembered in the history entry), else the saved
 * dashboard. Never history.back(): inside Tool Hub the iframe shares the session history with the hub, so going back
 * after a detour through the hub undid the hub's own navigation and landed on the workspace.
 */
export function goBack(): void {
  const from = (history.state as { from?: string } | null)?.from;
  const target = from && from.startsWith("#/") && !from.startsWith(window.location.hash) ? from : lastDashboardHash();
  history.replaceState(null, "", target);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/** Open a stock page, remembering where it was opened from (see goBack). */
export function openStock(code: string): void {
  const here = window.location.hash || "#/";
  history.pushState({ inApp: true, from: here }, "", `#/saham/${code}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
