import { useEffect, useState } from "react";
import { api } from "./api";

/** Kode saham -> indeks syariah yang memuatnya (ISSI, JII70, JII). Dari /api/sharia (shared/sharia.js, TradingView, cache 12 jam). */
export type ShariaCodes = Record<string, string[]>;
export const SHARIA_INDEXES: Array<[string, string]> = [
  ["ISSI", "ISSI · semua saham syariah"],
  ["JII70", "JII70 · 70 saham syariah"],
  ["JII", "JII · 30 saham syariah"],
];
export const isShariaIndex = (idx: string) => SHARIA_INDEXES.some(([k]) => k === idx);

let cache: Promise<ShariaCodes> | null = null;
export function loadSharia(): Promise<ShariaCodes> {
  cache ??= api
    .sharia()
    .then((r) => r.codes ?? {})
    .catch(() => {
      cache = null; // coba lagi di pemakaian berikutnya
      return {};
    });
  return cache;
}
/** Daftar saham syariah (kosong selama dimuat atau bila sumber tidak terjangkau). */
export function useSharia(): ShariaCodes {
  const [codes, setCodes] = useState<ShariaCodes>({});
  useEffect(() => {
    let on = true;
    loadSharia().then((v) => on && setCodes(v));
    return () => {
      on = false;
    };
  }, []);
  return codes;
}
/** Indeks tersempit yang memuat saham ini (JII > JII70 > ISSI), atau "" bila bukan saham syariah. */
export const shariaLabel = (tags?: string[]) => (!tags?.length ? "" : tags.includes("JII") ? "JII" : tags.includes("JII70") ? "JII70" : "ISSI");

/**
 * Indikasi rasio keuangan syariah dari data yang tersedia (Yahoo: DER = total utang ÷ ekuitas).
 * Kriteria OJK/DSN-MUI: utang berbasis bunga ÷ total aset ≤ 45% dan pendapatan non-halal ÷ total pendapatan ≤ 10%.
 * Total aset ≥ ekuitas + utang, jadi utang ÷ aset ≤ DER ÷ (1 + DER): bila batas atas itu ≤ 45%, kriteria utang pasti terpenuhi.
 * Pendapatan bunga/non-halal tidak tersedia dari sumber gratis; status resmi tetap dari Daftar Efek Syariah (ISSI).
 */
export function shariaRatio(der: number | null, industry: string | null): { debt: "ok" | "unknown" | "na"; debtMax: number | null; interestBiz: boolean } {
  const interestBiz = /\bbank|insurance|credit services|capital markets|mortgage|consumer lending/i.test(industry ?? "") && !/syariah|sharia|islam/i.test(industry ?? "");
  if (der == null) return { debt: "na", debtMax: null, interestBiz };
  const debtMax = (der / (1 + der)) * 100;
  return { debt: debtMax <= 45 ? "ok" : "unknown", debtMax, interestBiz };
}
