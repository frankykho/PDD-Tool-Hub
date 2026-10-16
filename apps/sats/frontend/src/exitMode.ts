import { useSyncExternalStore } from "react";

/** How a closed trade is valued: held whole to the exit, or 1/3 sold at TP1, TP2, TP3. */
export type ExitMode = "whole" | "scaled";

const KEY = "sats.exitMode";
const listeners = new Set<() => void>();
let current: ExitMode = (() => {
  try {
    return localStorage.getItem(KEY) === "scaled" ? "scaled" : "whole";
  } catch {
    return "whole";
  }
})();

export function setExitMode(m: ExitMode): void {
  current = m;
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useExitMode(): ExitMode {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
