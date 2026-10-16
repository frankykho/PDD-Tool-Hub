import { useSyncExternalStore } from "react";

/** Per-account watchlist, kept on the server (/api/watchlist) so it follows the user across devices. */
let codes: string[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function call(body?: { code: string; on: boolean }): Promise<void> {
  const res = await fetch("/api/watchlist", {
    method: body ? "POST" : "GET",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as { codes?: string[]; error?: string };
  if (!res.ok || !j.codes) throw new Error(j.error ?? `HTTP ${res.status}`);
  codes = j.codes;
  loaded = true;
  emit();
}

export const loadWatchlist = () => call().catch(() => undefined);

export async function toggleWatch(code: string): Promise<void> {
  const on = !codes.includes(code);
  codes = on ? [...codes, code] : codes.filter((c) => c !== code); // optimistic
  emit();
  try {
    await call({ code, on });
  } catch (e) {
    await call().catch(() => undefined); // resync
    alert(e instanceof Error ? e.message : "Gagal menyimpan watchlist");
  }
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useWatchlist(): { codes: string[]; loaded: boolean; has: (c: string) => boolean } {
  const list = useSyncExternalStore(subscribe, () => codes);
  return { codes: list, loaded, has: (c) => list.includes(c) };
}
