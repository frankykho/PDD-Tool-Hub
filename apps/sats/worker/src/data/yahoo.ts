import type { SatsInputBar } from "../sats/types";

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketTime?: number;
        regularMarketPrice?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    };
  };
}

export async function fetchYahooDaily(
  symbol: string,
  period1: number,
  period2: number,
): Promise<SatsInputBar[]> {
  return (await fetchYahooDailyWithMeta(symbol, period1, period2)).bars;
}

/** Same as fetchYahooDaily, plus Yahoo's last trade time (unix seconds) for intraday runs. */
export async function fetchYahooDailyWithMeta(
  symbol: string,
  period1: number,
  period2: number,
): Promise<{ bars: SatsInputBar[]; marketTime: number | null }> {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    `${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}` +
    "&interval=1d&events=history&includeAdjustedClose=true";

  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000), // never let one hung request stall the whole EOD run
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Yahoo Finance HTTP ${response.status} for ${symbol}`,
    );
  }

  const data =
    (await response.json()) as YahooChartResponse;

  if (data.chart?.error) {
    throw new Error(
      `Yahoo Finance error for ${symbol}: ` +
        `${data.chart.error.description ?? "Unknown error"}`,
    );
  }

  const result =
    data.chart?.result?.[0];

  if (!result?.timestamp) {
    throw new Error(
      `Yahoo Finance returned no timestamps for ${symbol}`,
    );
  }

  const quote =
    result.indicators?.quote?.[0];

  if (!quote) {
    throw new Error(
      `Yahoo Finance returned no quote data for ${symbol}`,
    );
  }

  const bars: SatsInputBar[] = [];

  for (
    let i = 0;
    i < result.timestamp.length;
    i += 1
  ) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    let close = quote.close?.[i];
    const volume = quote.volume?.[i];
    // Yahoo kadang mengirim bar terakhir dengan close null (open/high/low/volume ada), mis. BBCA 12 Okt 2026.
    // Harga penutupannya ada di meta.regularMarketPrice; dipakai hanya kalau waktu transaksi terakhir jatuh di hari bar itu.
    const mt = result.meta?.regularMarketTime, mp = result.meta?.regularMarketPrice;
    if (close == null && i === result.timestamp.length - 1 && mp != null && mt != null && mt >= result.timestamp[i] && mt < result.timestamp[i] + 86400) {
      close = mp;
    }

    if (
      open == null ||
      high == null ||
      low == null ||
      close == null
    ) {
      continue;
    }

    bars.push({
      time: result.timestamp[i],
      open,
      high,
      low,
      close,
      volume:
        volume == null
          ? null
          : volume,
    });
  }

  return {
    bars: removeNonTradingBars(bars),
    marketTime: result.meta?.regularMarketTime ?? null,
  };
}

/**
 * Yahoo inserts flat, zero-volume bars on IDX holidays (e.g. 2026-05-14/15, 05-27/28).
 * TradingView / IDX have no bar on those days. Keeping them shifts every N-bar window
 * (ER, ATR, pivots, RSI) and breaks parity with SATS on TradingView.
 * Verified on BBCA 10 Jun 2026: raw -> SL 5417.9 (wrong), cleaned -> SL 5369.4 (TV 5375).
 *
 * Rule: drop bars with volume 0. If a series has no volume at all (e.g. an index),
 * keep everything.
 */
export function removeNonTradingBars(bars: SatsInputBar[]): SatsInputBar[] {
  const hasAnyVolume = bars.some((bar) => (bar.volume ?? 0) > 0);
  if (!hasAnyVolume) {
    return bars;
  }
  return bars.filter((bar) => (bar.volume ?? 0) > 0);
}