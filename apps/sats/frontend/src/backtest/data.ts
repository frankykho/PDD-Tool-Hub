/**
 * Strategy Lab: riwayat harian ±6 tahun per saham. Worker meneruskan JSON Yahoo apa adanya (/api/history/:kode);
 * di sini diurai dan dibersihkan dengan fungsi yang sama dengan pipeline EOD (parseYahooChart + cleanBars).
 */
import { cleanBars } from "../../../worker/src/data/clean";
import { parseYahooChart } from "../../../worker/src/data/yahoo";
import type { SatsInputBar } from "../../../worker/src/sats/types";
import { day } from "./engine";

const memo = new Map<string, Promise<SatsInputBar[]>>();

/** Bar bersih satu saham ("IHSG" = indeks). Disimpan selama halaman terbuka. */
export function loadHistory(code: string): Promise<SatsInputBar[]> {
  const k = code.toUpperCase();
  if (!memo.has(k)) {
    const p = fetch(`/api/history/${encodeURIComponent(k)}`, { headers: { accept: "application/json" } })
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
        const bars = cleanBars(parseYahooChart(await r.json(), k).bars).bars;
        // Selama bursa buka, Yahoo mengirim bar hari ini yang belum selesai: dibuang sampai pukul 16.30 WIB
        const now = new Date(Date.now() + 7 * 3600e3), today = now.toISOString().slice(0, 10), last = bars[bars.length - 1];
        if (last && day(last.time) === today && now.getUTCHours() * 60 + now.getUTCMinutes() < 16 * 60 + 30) bars.pop();
        return bars;
      });
    p.catch(() => memo.delete(k)); // gagal tidak diingat, supaya bisa dicoba lagi
    memo.set(k, p);
  }
  return memo.get(k)!;
}

/** Banyak saham sekaligus (4 paralel). Saham yang gagal dilewati dan dilaporkan. */
export async function loadMany(codes: string[], onProgress: (done: number, total: number) => void): Promise<{ data: Map<string, SatsInputBar[]>; failed: string[] }> {
  const data = new Map<string, SatsInputBar[]>(), failed: string[] = [];
  let next = 0, done = 0;
  const worker = async () => {
    while (next < codes.length) {
      const c = codes[next++];
      try {
        const bars = await loadHistory(c);
        if (bars.length > 30) data.set(c, bars);
        else failed.push(c);
      } catch {
        failed.push(c);
      }
      onProgress(++done, codes.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, codes.length) }, worker));
  return { data, failed };
}
