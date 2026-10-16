import { useEffect, useRef, useState } from "react";

/** Chart height follows the window: tall on desktop, still usable on phones. */
function chartHeight(fullscreen: boolean): number {
  const h = window.innerHeight;
  if (fullscreen) return h - 8;
  return Math.max(420, Math.min(820, h - 190));
}

/**
 * TradingView Advanced Chart widget (free embed). Pine indicators such as SATS cannot be
 * added to widgets, so SATS levels are shown next to the chart instead.
 *
 * Fixed pixel height (autosize off): with autosize the widget collapses when the
 * container height is not resolved yet, which made the chart tiny.
 */
/** Built-in TradingView indicators that the free widget can load on start. */
export const STUDY_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "MAExp@tv-basicstudies", label: "EMA" },
  { id: "MASimple@tv-basicstudies", label: "SMA" },
  { id: "BB@tv-basicstudies", label: "Bollinger Bands" },
  { id: "VWAP@tv-basicstudies", label: "VWAP" },
  { id: "RSI@tv-basicstudies", label: "RSI" },
  { id: "MACD@tv-basicstudies", label: "MACD" },
  { id: "StochasticRSI@tv-basicstudies", label: "Stoch RSI" },
];

export default function TradingViewChart({ code, studies = [] }: { code: string; studies?: string[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [height, setHeight] = useState(() => chartHeight(false));

  useEffect(() => {
    const onResize = () => setHeight(chartHeight(document.fullscreenElement != null));
    const onFs = () => {
      const fs = document.fullscreenElement != null;
      setFullscreen(fs);
      setHeight(chartHeight(fs));
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: false,
      width: "100%",
      height,
      symbol: `IDX:${code}`,
      interval: "D",
      range: "12M",
      timezone: "Asia/Jakarta",
      theme: "dark",
      style: "1",
      locale: "id",
      backgroundColor: "#131722",
      gridColor: "rgba(42, 49, 59, 0.6)",
      allow_symbol_change: false,
      hide_volume: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
      studies,
    });
    host.appendChild(script);
    return () => {
      host.innerHTML = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, height, studies.join(",")]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen();
  };

  return (
    <div className={`tv-wrap ${fullscreen ? "is-fullscreen" : ""}`} ref={wrapRef}>
      <button type="button" className="tv-fullscreen" onClick={toggleFullscreen} aria-label={fullscreen ? "Keluar layar penuh" : "Layar penuh"}>
        {fullscreen ? "✕ Tutup" : "⤢ Layar penuh"}
      </button>
      <div className="tradingview-widget-container tv-chart" ref={hostRef} style={{ height }} />
    </div>
  );
}
