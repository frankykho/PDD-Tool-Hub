export type Side = "BUY" | "SELL";

export interface LatestRow {
  strategy: string;
  code: string;
  name: string;
  as_of_date: string | null;
  close: number | null;
  prev_close: number | null;
  change_pct: number | null;
  volume: number | null;
  trend: "BULLISH" | "BEARISH" | null;
  signal_today: "BUY" | "SELL" | "NONE" | null;
  last_signal: Side | null;
  last_signal_date: string | null;
  last_signal_bars: number | null;
  last_signal_score: number | null;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  tp1_hit: number | null;
  tp2_hit: number | null;
  tp3_hit: number | null;
  stop_now: number | null;
  trade_status: "ACTIVE" | "TP3" | "SL" | "TIMEOUT" | "SELL" | null;
  trade_exit_date: string | null;
  event_today: string | null;
  value_20d: number | null;
  filter_signal: number | null;
  filter_now: number | null;
  candles: string | null;
  chart_patterns: string | null;
  dist_high52?: number | null;
  dist_ma200?: number | null;
  rs_rank?: number | null;
  f_profitable: number | null;
  f_equity_positive: number | null;
  f_der: number | null;
  f_stale: number | null;
  f_per: number | null;
  f_roe: number | null;
}

export interface Fundamentals {
  code: string;
  as_of: string;
  currency: string | null;
  last_quarter: string | null;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  per: number | null;
  pbv: number | null;
  roe: number | null;
  der: number | null;
  rev_growth: number | null;
  eps_growth: number | null;
  div_yield: number | null;
  net_income: number | null;
  profitable: number | null;
  equity_positive: number | null;
  stale: number | null;
}

export interface SignalRow {
  signal_date: string;
  signal: Side;
  close: number;
  score: number | null;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  tp1_hit: number | null;
  tp2_hit: number | null;
  tp3_hit: number | null;
  outcome: "ACTIVE" | "TP3" | "SL" | "TIMEOUT" | "REPLACED" | null;
  exit_date: string | null;
  realized_r: number | null;
}

export interface MarketStatus {
  as_of_date: string;
  ihsg_close: number;
  ihsg_ma200: number;
  above: number;
}

export interface Summary {
  asOf: string;
  market: MarketStatus | null;
  buy_today: number;
  sell_today: number;
  buy_active: number;
  in_buy_phase: number;
  in_sell_phase: number;
  tp_today: number;
  sl_today: number;
  stocks: number;
}

export interface SignalsResponse {
  asOf: string;
  count: number;
  rows: LatestRow[];
}

export interface StockResponse {
  asOf: string;
  strategy: string;
  stock: LatestRow & { stale: boolean };
  trades: TrackTrade[];
  others: Array<{
    strategy: string;
    last_signal: Side | null;
    last_signal_date: string | null;
    last_signal_bars: number | null;
    trade_status: string | null;
    entry: number | null;
    stop_now: number | null;
    sl: number | null;
  }>;
  patterns: { candles: string | null; chart_patterns: string | null; as_of_date: string } | null;
  fundamentals: Fundamentals | null;
}

export interface IndexRow {
  index_code: string;
  name: string;
  effective: string | null;
  member_count: number;
}

export interface TrackAgg {
  n: number;
  avg_net: number | null;
  win_rate: number | null;
  avg_win: number | null;
  avg_loss: number | null;
  avg_bars: number | null;
  tp1_rate: number | null;
  tp2_rate: number | null;
  tp3_rate: number | null;
  exit_sl: number | null;
  exit_tp3: number | null;
  exit_sell: number | null;
  exit_timeout: number | null;
}

export interface TrackTrade {
  code: string;
  entry_date: string;
  entry: number;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  score: number | null;
  exit_date: string;
  exit_reason: "TP3" | "SL" | "SELL" | "TIMEOUT";
  exit_price: number;
  return_pct: number;
  net_pct: number;
  net_scaled: number;
  bars_held: number;
  tp1_hit: number | null;
  tp2_hit: number | null;
  tp3_hit: number | null;
}

export interface TrackResponse {
  asOf: string;
  since: string;
  years: number;
  minScore: number;
  feePct: number;
  minValue: number;
  minPrice: number;
  strategy: string;
  period: string;
  until: string;
  overall: TrackAgg & { median: number | null; avg_ex_top1: number | null; profit_factor: number | null };
  histogram: Array<{ bin: number; n: number }>;
  buckets: Array<TrackAgg & { bucket: string }>;
  byYear: Array<TrackAgg & { year: string }>;
  stocks: Array<TrackAgg & { code: string; name: string }>;
  trades: TrackTrade[];
}

export interface CompareRow extends TrackAgg {
  strategy: string;
  name: string;
  median: number | null;
  avg_ex_top1: number | null;
  profit_factor: number | null;
}

export interface CompareResponse {
  asOf: string;
  period: string;
  since: string;
  until: string;
  feePct: number;
  rows: CompareRow[];
}

export interface ScreenerRow {
  code: string;
  name: string;
  as_of_date: string;
  close: number;
  chg1: number | null;
  chg5: number | null;
  chg20: number | null;
  chg60: number | null;
  chg_ytd: number | null;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  dist_ma20: number | null;
  dist_ma50: number | null;
  dist_ma200: number | null;
  ma_stack: number | null;
  golden_days: number | null;
  death_days: number | null;
  rsi14: number | null;
  macd_hist: number | null;
  macd_up_days: number | null;
  vol_ratio: number | null;
  value_20d: number | null;
  high52: number | null;
  low52: number | null;
  dist_high52: number | null;
  dist_low52: number | null;
  breakout20_days: number | null;
  atr_pct: number | null;
  bb_width: number | null;
  bb_pctile: number | null;
  cmf20: number | null;
  obv20: number | null;
  updown_vol20: number | null;
  ma150: number | null;
  dist_ma150: number | null;
  ma150_slope20: number | null;
  ma200_slope22: number | null;
  chg126: number | null;
  chg_12_1: number | null;
  adx14: number | null;
  pdi14: number | null;
  mdi14: number | null;
  stoch_k: number | null;
  stoch_d: number | null;
  stoch_up_days: number | null;
  pocket_pivot_days: number | null;
  vcp: number | null;
  nr7: number | null;
  inside_day: number | null;
  gap_pct: number | null;
  body_pct: number | null;
  ichi_above: number | null;
  ichi_tk: number | null;
  ichi_green: number | null;
  rsi_div_days: number | null;
  up_streak: number | null;
  candles: string | null;
  chart_patterns: string | null;
  market_cap: number | null;
  per: number | null;
  pbv: number | null;
  roe: number | null;
  der: number | null;
  rev_growth: number | null;
  eps_growth: number | null;
  div_yield: number | null;
  profitable: number | null;
  equity_positive: number | null;
  fund_stale: number | null;
  sector: string | null;
  industry: string | null;
  last_quarter: string | null;
  /** computed in the browser: 1 = profitable, positive equity, DER ≤ 2 (or bank), recent report */
  fund_ok?: number | null;
  /** computed in the browser: percentile of the 6-month return among liquid stocks (0–100) */
  rs_rank?: number | null;
  sats_signal: Side | null;
  sats_bars: number | null;
  sats_filter: number | null;
  filter_now: number | null;
  sats_trend: string | null;
  indexes: string | null;
}

export interface SearchRow {
  code: string;
  name: string;
  close: number | null;
  last_signal: Side | null;
  last_signal_bars: number | null;
}

export interface Me {
  email: string | null;
  name: string | null;
  status: "none" | "pending" | "approved" | "rejected" | "revoked";
  isAdmin: boolean;
  logoutUrl: string;
  method?: "access" | "google" | "password" | "hub" | "none";
  hub?: string;
  authDisabled?: boolean;
}

/** SATS hanya dipakai di dalam dashboard Tool Hub. Dibuka langsung di alamatnya sendiri -> pindah ke tab SATS di dashboard. */
const outsideDashboard = () => window.top === window.self;
function toDashboard(hub: string): Promise<never> {
  window.location.replace(`${hub}/#sats`);
  return new Promise<never>(() => undefined);
}

/** Login diurus Tool Hub: ke sana dulu, lalu kembali ke halaman ini membawa tiket. Tidak pernah selesai (halaman berpindah). */
function toHub(hub: string): Promise<never> {
  if (outsideDashboard()) return toDashboard(hub);
  const back = `${window.location.origin}/api/auth/hub?to=${encodeURIComponent(window.location.pathname + window.location.hash)}`;
  window.location.replace(`${hub}/sso?app=sats&back=${encodeURIComponent(back)}`);
  return new Promise<never>(() => undefined);
}

/** /api/me that also reports which login methods are available when not logged in. */
export async function fetchMe(): Promise<{ me: Me } | { loginMethods: string[] }> {
  const res = await fetch("/api/me", { headers: { accept: "application/json" } });
  const body = (await res.json().catch(() => ({}))) as Me & { error?: string; methods?: string[]; hub?: string };
  if (res.status === 401 && body.hub) return toHub(body.hub);
  if (res.status === 401) return { loginMethods: body.methods ?? [] };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  if (body.method === "hub" && body.hub && outsideDashboard()) return toDashboard(body.hub);
  return { me: body };
}

export interface AdminUser {
  email: string;
  name: string | null;
  reason: string | null;
  status: Me["status"];
  role: "user" | "admin";
  requested_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  last_seen: string | null;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; hub?: string };
    if (res.status === 401 && body.hub) return toHub(body.hub); // sesi 2 jam habis: perbarui diam-diam lewat hub
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const qs = (params: Record<string, string | number | undefined | null>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

export interface TrackParams {
  s: string;
  period: string;
  mode?: "whole" | "scaled";
  minScore?: number;
  minValue?: number;
  minPrice?: number;
  index?: string;
  code?: string;
}

export interface BreadthRow {
  date: string;
  n: number; // liquid stocks counted that day
  above200: number;
  above50: number;
  up: number;
  down: number;
  hi52: number;
  lo52: number;
  ihsg: number | null;
}

type LabSlot = "5" | "10" | "20" | "60" | "S"; // S = max 60 days with stop loss −8% or close < MA50
export type LabRow = {
  id: string; // "preset:minervini" | "candle:hammer" | "chart:double_bottom" | "sats:high52" | "baseline"
  kind: "preset" | "candle" | "chart" | "combo" | "sats" | "baseline";
  name: string;
  expect: "up" | "down";
  verdict: "teruji" | "netral" | "berlawanan" | "data_kurang";
  y1: number | null; y2: number | null; y3: number | null;
  period_from: string | null;
  updated_at: string;
} & { [K in `${"n" | "win" | "avg" | "med" | "ex" | "tr"}${LabSlot}`]: number | null };

export const api = {
  lab: () => get<{ rows: LabRow[] }>("/api/lab"),
  breadth: () => get<{ rows: BreadthRow[] }>("/api/breadth"),
  indices: () => get<{ rows: IndexRow[] }>("/api/indices"),
  me: () => get<Me>("/api/me"),
  requestAccess: (name: string, reason: string) => post<Me>("/api/access/request", { name, reason }),
  adminUsers: () => get<{ rows: AdminUser[]; admins: string[] }>("/api/admin/users"),
  login: (email: string, password: string) => post<{ ok: true }>("/api/auth/login", { email, password }),
  register: (email: string, password: string, name: string, reason: string) =>
    post<{ ok: true }>("/api/auth/register", { email, password, name, reason }),
  adminAction: (email: string, action: "approve" | "reject" | "revoke" | "make_admin" | "remove_admin" | "reset_password") =>
    post<{ ok: true }>("/api/admin/users", { email, action }),
  meta: () =>
    get<{ lastRun: { as_of_date: string | null; finished_at: string | null; ok_count: number; fail_count: number } | null; universe: number }>(
      "/api/meta",
    ),
  /** latest trading date present in the database */
  asOf: () => get<{ asOf: string }>("/api/summary?s=SATS"),
  screener: () => get<{ asOf: string; count: number; rows: ScreenerRow[] }>("/api/screener"),
  summary: (s: string, index = "") => get<Summary>(`/api/summary?${qs({ s, index })}`),
  signals: (s: string, side: "ALL" | Side, maxAge: number, index = "") =>
    get<SignalsResponse>(`/api/signals?${qs({ s, side, maxAge, limit: 1000, index })}`),
  events: (s: string, index = "") => get<SignalsResponse>(`/api/level-hits?${qs({ s, index })}`),
  stock: (s: string, code: string) => get<StockResponse>(`/api/stocks/${encodeURIComponent(code)}?${qs({ s })}`),
  search: (s: string, q: string) => get<{ rows: SearchRow[] }>(`/api/search?${qs({ s, q })}`),
  track: (p: TrackParams) => get<TrackResponse>(`/api/track?${qs({ ...p })}`),
  compare: (p: Omit<TrackParams, "s" | "code" | "minScore">) => get<CompareResponse>(`/api/track/compare?${qs({ ...p })}`),
};
