import { Suspense, lazy, useEffect, useState } from "react";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import StockDetail from "./pages/StockDetail";
import TrackRecord from "./pages/TrackRecord";
import StaleBanner from "./components/StaleBanner";
import Screener from "./pages/Screener";
import Radar from "./pages/Radar";
import Patterns from "./pages/Patterns";
import Warrant from "./pages/Warrant";
// Strategy Lab memuat mesin SATS & backtest: diunduh terpisah saat menu Backtest dibuka
const StrategyLab = lazy(() => import("./pages/StrategyLab"));
import Today from "./pages/Today";
import Market from "./pages/Market";
import Lab from "./pages/Lab";
import AccessGate, { LoginPage } from "./pages/AccessGate";
import Admin from "./pages/Admin";
import { Loading, ErrorBox } from "./components/Bits";
import { api, fetchMe, type Me } from "./api";
import { loadWatchlist } from "./watchlist";

/** Hash routes: #/  and  #/saham/BBCA  (works on any static host, no server rewrites). */
type Route = { page: "dashboard" } | { page: "today" } | { page: "market" } | { page: "lab" } | { page: "track" } | { page: "screener" } | { page: "patterns" } | { page: "radar" } | { page: "backtest" } | { page: "warrant" } | { page: "admin" } | { page: "stock"; code: string };

function parseRoute(hash: string): Route {
  const m = hash.match(/^#\/saham\/([A-Za-z0-9]{2,6})/);
  if (m) return { page: "stock", code: m[1].toUpperCase() };
  if (hash === "" || hash === "#" || hash.startsWith("#/hari-ini")) return { page: "today" };
  if (hash.startsWith("#/pasar")) return { page: "market" };
  if (hash.startsWith("#/lab")) return { page: "lab" };
  if (hash.startsWith("#/track-record")) return { page: "track" };
  if (hash.startsWith("#/screener")) return { page: "screener" };
  if (hash.startsWith("#/pola")) return { page: "patterns" };
  if (hash.startsWith("#/radar")) return { page: "radar" };
  if (hash.startsWith("#/backtest")) return { page: "backtest" };
  if (hash.startsWith("#/waran")) return { page: "warrant" };
  if (hash.startsWith("#/admin")) return { page: "admin" };
  return { page: "dashboard" };
}

export default function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      const next = parseRoute(window.location.hash);
      setRoute(next);
      // Detail pages start at the top; the dashboard restores its own scroll position.
      if (next.page !== "dashboard") window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Who is logged in (Cloudflare Access) and are they approved?
  const [me, setMe] = useState<Me | null>(null);
  const [meErr, setMeErr] = useState<string | null>(null);
  const [loginMethods, setLoginMethods] = useState<string[] | null>(null);
  const [pending, setPending] = useState(0);
  const loadPending = () =>
    api
      .adminUsers()
      .then((r) => setPending(r.rows.filter((u) => u.status === "pending").length))
      .catch(() => undefined);
  const loadMe = () =>
    fetchMe()
      .then((r) => {
        if ("me" in r) {
          setLoginMethods(null);
          setMe(r.me);
          if (r.me.isAdmin && r.me.method !== "hub") loadPending(); // di Tool Hub, pengguna dikelola di hub
          if (r.me.status === "approved" && !r.me.authDisabled) loadWatchlist();
        } else setLoginMethods(r.loginMethods);
      })
      .catch((e) => setMeErr(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    loadMe();
  }, []);

  if (!me && loginMethods) {
    return (
      <div className="app">
        <LoginPage methods={loginMethods} onLoggedIn={loadMe} />
      </div>
    );
  }
  if (!me) {
    return (
      <div className="app">
        <main className="page">
          {meErr ? (
            <ErrorBox error={meErr} />
          ) : (
            <Loading what="akun" />
          )}
        </main>
      </div>
    );
  }
  if (me.status !== "approved") {
    return (
      <div className="app">
        <AccessGate me={me} onChange={setMe} />
      </div>
    );
  }

  const page =
    route.page === "stock" ? (
      <StockDetail code={route.code} />
    ) : route.page === "today" ? (
      <Today />
    ) : route.page === "market" ? (
      <Market />
    ) : route.page === "lab" && me.isAdmin ? (
      <Lab />
    ) : route.page === "track" && me.isAdmin ? (
      <TrackRecord />
    ) : route.page === "screener" ? (
      <Screener />
    ) : route.page === "patterns" ? (
      <Patterns />
    ) : route.page === "radar" ? (
      <Radar />
    ) : route.page === "warrant" ? (
      <Warrant />
    ) : route.page === "backtest" ? (
      <Suspense fallback={<main className="page"><Loading what="Strategy Lab" /></main>}>
        <StrategyLab />
      </Suspense>
    ) : route.page === "admin" && me.isAdmin && me.email && me.method !== "hub" ? (
      <Admin selfEmail={me.email} onChange={loadPending} />
    ) : (
      <Dashboard />
    );

  return (
    <div className="app">
      <Header active={route.page} me={me} pendingCount={pending} />
      <StaleBanner />
      {page}
      <footer className="footer">
        Alat bantu analisis teknikal pribadi berbasis indikator SATS v1.9.0 (WillyAlgoTrader). Bukan ajakan membeli atau
        menjual efek; keputusan investasi sepenuhnya tanggung jawab pengguna. Data EOD dari Yahoo Finance, dapat tertunda
        atau berbeda dengan data bursa.
      </footer>
    </div>
  );
}
