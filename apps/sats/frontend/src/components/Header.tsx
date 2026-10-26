import { useEffect, useRef, useState } from "react";
import { api, type SearchRow } from "../api";
import { fmtPrice } from "../format";
import { lastDashboardHash, openStock } from "../nav";
import { useStrategy } from "../strategy";
import type { Me } from "../api";

export default function Header({
  active,
  me,
  pendingCount = 0,
}: {
  active: "dashboard" | "today" | "market" | "lab" | "stock" | "track" | "screener" | "patterns" | "owners" | "radar" | "backtest" | "warrant" | "admin";
  me?: Me;
  pendingCount?: number;
}) {
  const strategy = useStrategy();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const adminActive = active === "track" || active === "lab" || active === "admin";

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setRows([]);
      return;
    }
    const t = setTimeout(() => {
      api.search(strategy.id, term).then((r) => {
        setRows(r.rows);
        setCursor(0);
      }).catch(() => setRows([]));
    }, 150);
    return () => clearTimeout(t);
  }, [q, strategy.id]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) moreRef.current.open = false;
    };
    const closeMore = () => {
      if (moreRef.current) moreRef.current.open = false;
    };
    const slash = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", slash);
    window.addEventListener("hashchange", closeMore);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", slash);
      window.removeEventListener("hashchange", closeMore);
    };
  }, []);

  const go = (code: string) => {
    openStock(code);
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <header className="topbar">
      <a className="brand" href="#/hari-ini">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="26" height="26" rx="7" stroke="currentColor" strokeWidth="2" />
          <path d="M6 18l5-5 4 3 7-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>
          SATS Radar <span className="muted">IDX</span>
        </span>
      </a>
      <nav className="nav" aria-label="Navigasi utama">
        <a href="#/hari-ini" aria-current={active === "today" ? "page" : undefined}>
          <svg className="nav-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg>
          <span>Hari Ini</span>
        </a>
        <a href={lastDashboardHash()} aria-current={active === "dashboard" ? "page" : undefined}>
          <svg className="nav-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
          <span>Sinyal</span>
        </a>
        <a href="#/screener" aria-current={active === "screener" ? "page" : undefined}>
          <svg className="nav-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
          <span>Screener</span>
        </a>
        <a href="#/pola" aria-current={active === "patterns" ? "page" : undefined} title="Pemindai pola chart">
          <svg className="nav-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17l5-6 4 4 4-7 5 6" /><path d="M3 21h18" /></svg>
          <span>Pola</span>
        </a>
        <a href="#/pemegang" aria-current={active === "owners" ? "page" : undefined} title="Pemegang saham ≥ 1% dan jaringannya">
          <svg className="nav-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M11 7.2L6.3 15.8M13 7.2l4.7 8.6M7.5 18h9" /></svg>
          <span>Pemegang</span>
        </a>
        <a href="#/radar" aria-current={active === "radar" ? "page" : undefined}>
          <svg className="nav-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 12l6-6" /></svg>
          <span>Radar</span>
        </a>
        <a href="#/backtest" aria-current={active === "backtest" ? "page" : undefined}>
          <svg className="nav-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><path d="M7.5 15h9" /></svg>
          <span>Backtest</span>
        </a>
        <a href="#/waran" aria-current={active === "warrant" ? "page" : undefined} title="Kalkulator waran terstruktur (SW)">
          <svg className="nav-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 19h8" /></svg>
          <span>Waran</span>
        </a>
        <a href="#/pasar" aria-current={active === "market" ? "page" : undefined}>
          <svg className="nav-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
          <span>Pasar</span>
        </a>
        {me?.isAdmin && (
          <details className={`nav-more ${adminActive ? "active" : ""}`} ref={moreRef}>
            <summary aria-current={adminActive ? "page" : undefined}>
              <svg className="nav-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
              <span>Admin</span>
              {pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
            </summary>
            <div className="nav-more-menu">
              <a href="#/track-record" aria-current={active === "track" ? "page" : undefined}>
                Track Record
              </a>
              <a href="#/lab" aria-current={active === "lab" ? "page" : undefined}>
                Lab Uji
              </a>
              {me.method !== "hub" && (
                <a href="#/admin" aria-current={active === "admin" ? "page" : undefined}>
                  Kelola pengguna{pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
                </a>
              )}
            </div>
          </details>
        )}
      </nav>
      <div className="search" ref={boxRef}>
        <label className="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="sr-only">Cari saham</span>
          <input
            ref={inputRef}
            type="search"
            placeholder="Cari kode / nama saham…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, rows.length - 1));
              if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
              if (e.key === "Enter" && rows[cursor]) go(rows[cursor].code);
              if (e.key === "Escape") setOpen(false);
            }}
            role="combobox"
            aria-expanded={open && rows.length > 0}
            aria-controls="search-results"
          />
          <kbd>/</kbd>
        </label>
        {open && rows.length > 0 && (
          <ul className="search-results" id="search-results" role="listbox">
            {rows.map((r, i) => (
              <li key={r.code} role="option" aria-selected={i === cursor}>
                <button type="button" className={i === cursor ? "active" : ""} onMouseDown={() => go(r.code)}>
                  <span className="mono strong">{r.code}</span>
                  <span className="name">{r.name}</span>
                  <span className="mono">{fmtPrice(r.close)}</span>
                  {r.last_signal && (
                    <span className={`pill small ${r.last_signal === "BUY" ? "buy" : "sell"}`}>{r.last_signal}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Lewat Tool Hub, email dan Keluar sudah ada di bilah dashboard */}
      {me?.email && me.method !== "hub" && (
        <div className="user-chip" title={me.email}>
          <span className="user-email">{me.name ?? me.email}</span>
          <a href={me.logoutUrl} className="dim small">
            Keluar
          </a>
        </div>
      )}
    </header>
  );
}
