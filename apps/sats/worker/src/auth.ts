/**
 * Login = Cloudflare Access (email + one-time PIN). Authorization = our `users` table (admin approves requests).
 *
 * The Access JWT (header `Cf-Access-Jwt-Assertion`, or cookie `CF_Authorization`) is verified here:
 * RS256 signature against the team's public keys, audience (AUD tag), issuer and expiry.
 */

export interface AuthEnv {
  screener_db: D1Database;
  /** Google login (no credit card needed): OAuth client ID (var) */
  GOOGLE_CLIENT_ID?: string;
  /** Google OAuth client secret (secret) */
  GOOGLE_CLIENT_SECRET?: string;
  /** random string used to sign the session cookie (secret). Optional: generated and kept in D1 when absent. */
  SESSION_SECRET?: string;
  /** "password" = built-in email + password login. "hub" = login & hak akses diurus Tool Hub (akun tidak disimpan di sini). */
  LOGIN?: string;
  /** LOGIN=hub: secret yang sama dengan SSO_SECRET di Tool Hub */
  SSO_SECRET?: string;
  /** LOGIN=hub: alamat Tool Hub (diisi scripts/deploy.mjs dari profil) */
  HUB_URL?: string;
  /** Zero Trust team name, e.g. "myteam" for myteam.cloudflareaccess.com */
  ACCESS_TEAM?: string;
  /** Application Audience (AUD) tag of the Access application */
  ACCESS_AUD?: string;
  /** comma-separated admin emails (always approved); diisi scripts/deploy.mjs dari profil (admins) */
  ADMIN_EMAILS?: string;
}

export type UserStatus = "none" | "pending" | "approved" | "rejected" | "revoked";

export interface Me {
  email: string;
  name: string | null;
  status: UserStatus;
  isAdmin: boolean;
  logoutUrl: string;
  method: "access" | "google" | "password" | "hub" | "none";
  /** LOGIN=hub: alamat Tool Hub, dipakai frontend untuk kembali ke dashboard */
  hub?: string;
}

const b64urlToBytes = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

let certCache: { at: number; keys: Array<JsonWebKey & { kid?: string }> } | null = null;

async function accessKeys(team: string, fetcher: typeof fetch = fetch) {
  if (certCache && Date.now() - certCache.at < 60 * 60 * 1000) return certCache.keys;
  const res = await fetcher(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs HTTP ${res.status}`);
  const j = (await res.json()) as { keys: Array<JsonWebKey & { kid?: string }> };
  certCache = { at: Date.now(), keys: j.keys };
  return j.keys;
}

/** Test hook */
export const _resetCertCache = () => {
  certCache = null;
};

function tokenOf(req: Request): string | null {
  const h = req.headers.get("cf-access-jwt-assertion");
  if (h) return h;
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? m[1] : null;
}

/** Returns the verified email, or null when the token is missing/invalid. */
export async function verifyAccessEmail(req: Request, env: AuthEnv, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) return null;
  const token = tokenOf(req);
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = b64urlJson(parts[0]) as { kid?: string; alg?: string };
    const payload = b64urlJson(parts[1]) as { aud?: string | string[]; exp?: number; iss?: string; email?: string };
    if (header.alg !== "RS256") return null;
    const keys = await accessKeys(env.ACCESS_TEAM, fetcher);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    if (payload.iss !== `https://${env.ACCESS_TEAM}.cloudflareaccess.com`) return null;
    return payload.email ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

const adminList = (env: AuthEnv) =>
  (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export async function loadMe(email: string, env: AuthEnv, fallbackName: string | null = null, hubAdmin?: boolean): Promise<Me> {
  // Tool Hub: disetujui & tingkat aksesnya sudah diputuskan hub; tabel users di sini tidak dipakai lagi
  if (hubEnabled(env)) return { email, name: fallbackName, status: "approved", isAdmin: Boolean(hubAdmin), logoutUrl: "/api/auth/logout", method: "hub", hub: hubUrl(env) };
  const row = await env.screener_db
    .prepare("SELECT name, status, role FROM users WHERE email = ?")
    .bind(email)
    .first<{ name: string | null; status: UserStatus; role: string }>()
    .catch(() => null);
  const isAdmin = adminList(env).includes(email) || row?.role === "admin";
  const status: UserStatus = isAdmin ? "approved" : (row?.status ?? "none");
  return {
    email,
    name: row?.name ?? fallbackName,
    status,
    isAdmin,
    logoutUrl: logoutUrl(env),
    method: accessEnabled(env) ? "access" : googleEnabled(env) ? "google" : passwordEnabled(env) ? "password" : "none",
  };
}

// ───────────────────────────── Google login + signed session cookie

const SESSION_COOKIE = "sats_session";
const STATE_COOKIE = "sats_oauth_state";
const SESSION_DAYS = 30;

export const googleEnabled = (env: AuthEnv) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const accessEnabled = (env: AuthEnv) => Boolean(env.ACCESS_TEAM && env.ACCESS_AUD);
export const passwordEnabled = (env: AuthEnv) => env.LOGIN === "password";
export const hubEnabled = (env: AuthEnv) => env.LOGIN === "hub";
export const hubUrl = (env: AuthEnv) => (env.HUB_URL || "").replace(/\/+$/, "");
/** Auth is enforced only once a login method is configured (so deploying this never locks you out). */
export const authEnabled = (env: AuthEnv) => accessEnabled(env) || googleEnabled(env) || passwordEnabled(env) || hubEnabled(env);
export const logoutUrl = (env: AuthEnv) => (accessEnabled(env) ? "/cdn-cgi/access/logout" : "/api/auth/logout");

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

/** Constant-time string comparison. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i += 1) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ───────────────────────────── schema (self-healing) + session secret

let schemaReady = false;
/** Creates/extends the auth tables on first use, so no manual SQL is needed. */
export async function ensureAuthSchema(env: AuthEnv): Promise<void> {
  if (schemaReady) return;
  const db = env.screener_db;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, reason TEXT, status TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user', requested_at TEXT, decided_at TEXT, decided_by TEXT, last_seen TEXT)`,
    )
    .run();
  for (const col of ["password_hash TEXT", "password_salt TEXT", "failed_logins INTEGER DEFAULT 0", "locked_until TEXT"]) {
    await db.prepare(`ALTER TABLE users ADD COLUMN ${col}`).run().catch(() => undefined); // already there
  }
  await db.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)").run();
  schemaReady = true;
}

let secretCache: string | null = null;
async function sessionSecret(env: AuthEnv): Promise<string> {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (secretCache) return secretCache;
  await ensureAuthSchema(env);
  const row = await env.screener_db.prepare("SELECT value FROM app_settings WHERE key = 'session_secret'").first<{ value: string }>();
  if (row?.value) return (secretCache = row.value);
  const fresh = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.screener_db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('session_secret', ?)").bind(fresh).run();
  const again = await env.screener_db.prepare("SELECT value FROM app_settings WHERE key = 'session_secret'").first<{ value: string }>();
  return (secretCache = again?.value ?? fresh);
}

export async function makeSession(env: AuthEnv, email: string, name: string | null, hub?: { admin: boolean; hours: number }): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ email, name, exp: Date.now() + (hub ? hub.hours * 3600_000 : SESSION_DAYS * 86400_000), ...(hub ? { hub: 1, adm: hub.admin } : {}) })));
  return `${body}.${await hmac(await sessionSecret(env), body)}`;
}

export async function readSession(env: AuthEnv, req: Request): Promise<{ email: string; name: string | null; hub?: boolean; admin?: boolean } | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig || !same(sig, await hmac(await sessionSecret(env), body))) return null;
  try {
    const p = b64urlJson(body) as { email?: string; name?: string | null; exp?: number; hub?: number; adm?: boolean };
    if (!p.email || !p.exp || p.exp < Date.now()) return null;
    return { email: p.email.toLowerCase(), name: p.name ?? null, hub: Boolean(p.hub), admin: Boolean(p.adm) };
  } catch {
    return null;
  }
}

const cookieOf = (req: Request, name: string) =>
  (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null;

const setCookie = (name: string, value: string, maxAgeSec: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;

/** /api/auth/login, /api/auth/callback, /api/auth/logout — returns null for other paths. */
export async function handleGoogleAuth(url: URL, req: Request, env: AuthEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const path = url.pathname.replace(/\/+$/, "");
  const redirectUri = `${url.origin}/api/auth/callback`;

  if (path === "/api/auth/logout") {
    return new Response(null, { status: 302, headers: { location: "/", "set-cookie": setCookie(SESSION_COOKIE, "", 0) } });
  }
  if (!googleEnabled(env)) return path.startsWith("/api/auth/") ? new Response("Google login belum dikonfigurasi", { status: 404 }) : null;

  if (path === "/api/auth/login") {
    const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID as string,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    return new Response(null, {
      status: 302,
      headers: { location: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, "set-cookie": setCookie(STATE_COOKIE, state, 600) },
    });
  }

  if (path === "/api/auth/callback") {
    const fail = (msg: string) =>
      new Response(`Login gagal: ${msg}. Kembali ke halaman utama dan coba lagi.`, {
        status: 400,
        headers: { "content-type": "text/plain; charset=utf-8", "set-cookie": setCookie(STATE_COOKIE, "", 0) },
      });
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expected = cookieOf(req, STATE_COOKIE);
    if (!code || !state || !expected || !same(state, expected)) return fail("sesi login tidak valid");
    const res = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID as string,
        client_secret: env.GOOGLE_CLIENT_SECRET as string,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) return fail(`Google menolak (${res.status})`);
    const tok = (await res.json()) as { id_token?: string };
    if (!tok.id_token) return fail("token Google tidak ada");
    // The ID token came straight from Google's token endpoint over TLS (OIDC code flow), so its claims can be trusted;
    // we still check audience, issuer, expiry and that the email is verified.
    const claims = b64urlJson(tok.id_token.split(".")[1]) as {
      aud?: string; iss?: string; exp?: number; email?: string; email_verified?: boolean; name?: string;
    };
    if (claims.aud !== env.GOOGLE_CLIENT_ID) return fail("aud tidak cocok");
    if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") return fail("issuer tidak dikenal");
    if (!claims.exp || claims.exp * 1000 < Date.now()) return fail("token kedaluwarsa");
    if (!claims.email || !claims.email_verified) return fail("email Google belum terverifikasi");
    const session = await makeSession(env, claims.email.toLowerCase(), claims.name ?? null);
    const headers = new Headers({ location: "/" });
    headers.append("set-cookie", setCookie(SESSION_COOKIE, session, SESSION_DAYS * 86400));
    headers.append("set-cookie", setCookie(STATE_COOKIE, "", 0));
    return new Response(null, { status: 302, headers });
  }
  return null;
}

/** Who is calling: Cloudflare Access (if configured) or the Google session cookie. */
const HUB_APP = "sats";
const HUB_SESSION_HOURS = 2; // ponytail: akses dicabut di hub terasa paling lambat 2 jam; perpendek bila perlu instan

/**
 * LOGIN=hub. /api/auth/hub?hub_t=<tiket>&to=<path> menukar tiket Tool Hub dengan cookie sesi; /api/auth/logout keluar lewat hub.
 * Tiket = isi b64url + "." + HMAC-SHA256(SSO_SECRET), berlaku 60 detik, hanya untuk app "sats".
 */
export async function handleHubAuth(url: URL, req: Request, env: AuthEnv): Promise<Response | null> {
  if (!hubEnabled(env)) return null;
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/api/auth/logout") {
    return new Response(null, { status: 302, headers: { location: `${hubUrl(env)}/logout`, "set-cookie": setCookie(SESSION_COOKIE, "", 0) } });
  }
  if (path !== "/api/auth/hub") return null;
  const fail = (msg: string) => new Response(`Login lewat Tool Hub gagal: ${msg}. Buka ulang dari Tool Hub.`, { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  if (!env.SSO_SECRET || env.SSO_SECRET.length < 32) return fail("SSO_SECRET belum dipasang di worker ini");
  const [body, sig] = (url.searchParams.get("hub_t") ?? "").split(".");
  if (!body || !sig || !same(sig, await hmac(env.SSO_SECRET, body))) return fail("tiket tidak sah");
  let p: { app?: string; e?: string; n?: string; a?: unknown; adm?: boolean; x?: number };
  try {
    p = b64urlJson(body);
  } catch {
    return fail("tiket rusak");
  }
  if (p.app !== HUB_APP || !p.e || !p.x || p.x < Date.now()) return fail("tiket kedaluwarsa atau bukan untuk tool ini");
  const to = url.searchParams.get("to") ?? "/";
  const session = await makeSession(env, p.e.toLowerCase(), p.n || null, { admin: p.a === "admin" || p.adm === true, hours: HUB_SESSION_HOURS });
  return new Response(null, {
    status: 302,
    headers: { location: /^\/(?!\/)/.test(to) ? to : "/", "set-cookie": setCookie(SESSION_COOKIE, session, HUB_SESSION_HOURS * 3600) },
  });
}

export async function identify(req: Request, env: AuthEnv): Promise<{ email: string; name: string | null; hub?: boolean; admin?: boolean } | null> {
  if (hubEnabled(env)) {
    const s = await readSession(env, req);
    return s?.hub ? s : null; // sesi lama (login password) tidak berlaku lagi
  }
  if (accessEnabled(env)) {
    const email = await verifyAccessEmail(req, env);
    if (email) return { email, name: null };
  }
  if (googleEnabled(env) || passwordEnabled(env)) return readSession(env, req);
  return null;
}

// ───────────────────────────── built-in email + password

const PBKDF2_ITERATIONS = 20_000; // keeps CPU per login small on the Workers free plan; lockout limits guessing
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return b64url(new Uint8Array(bits));
}

const jsonRes = (data: unknown, status = 200, cookie?: string) => {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(data), { status, headers });
};

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

/** POST /api/auth/register and POST /api/auth/login — returns null for other paths. */
export async function handlePasswordAuth(url: URL, req: Request, env: AuthEnv): Promise<Response | null> {
  if (!passwordEnabled(env)) return null;
  const path = url.pathname.replace(/\/+$/, "");
  if (path !== "/api/auth/register" && path !== "/api/auth/login") return null;
  if (req.method !== "POST") return jsonRes({ error: "method not allowed" }, 405);
  await ensureAuthSchema(env);
  const db = env.screener_db;
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string; name?: string; reason?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!validEmail(email)) return jsonRes({ error: "Email tidak valid" }, 400);
  const now = new Date().toISOString();
  const row = await db
    .prepare("SELECT email, name, status, password_hash, password_salt, failed_logins, locked_until FROM users WHERE email = ?")
    .bind(email)
    .first<{ name: string | null; status: string; password_hash: string | null; password_salt: string | null; failed_logins: number | null; locked_until: string | null }>();

  if (path === "/api/auth/register") {
    if (password.length < 8) return jsonRes({ error: "Password minimal 8 karakter" }, 400);
    const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const reason = String(body.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (name.length < 2) return jsonRes({ error: "Nama wajib diisi" }, 400);
    if (row?.password_hash) return jsonRes({ error: "Email sudah terdaftar. Silakan masuk." }, 409);
    const salt = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await hashPassword(password, salt);
    if (row) {
      // pre-approved by the admin ("Tambahkan langsung") or a password reset: keep the current status
      await db
        .prepare("UPDATE users SET name = COALESCE(?, name), password_hash = ?, password_salt = ?, failed_logins = 0, locked_until = NULL WHERE email = ?")
        .bind(name, hash, salt, email)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO users (email, name, reason, status, role, requested_at, password_hash, password_salt, failed_logins)
           VALUES (?, ?, ?, 'pending', 'user', ?, ?, ?, 0)`,
        )
        .bind(email, name, reason, now, hash, salt)
        .run();
    }
    return jsonRes({ ok: true }, 200, setCookie(SESSION_COOKIE, await makeSession(env, email, name), SESSION_DAYS * 86400));
  }

  // ---- login
  if (!row?.password_hash || !row.password_salt) return jsonRes({ error: "Email atau password salah" }, 401);
  if (row.locked_until && row.locked_until > now) {
    return jsonRes({ error: `Terlalu banyak percobaan. Coba lagi setelah ${LOCK_MINUTES} menit.` }, 429);
  }
  const ok = same(await hashPassword(password, row.password_salt), row.password_hash);
  if (!ok) {
    const failed = (row.failed_logins ?? 0) + 1;
    const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    await db
      .prepare("UPDATE users SET failed_logins = ?, locked_until = ? WHERE email = ?")
      .bind(lock ? 0 : failed, lock, email)
      .run();
    return jsonRes({ error: lock ? `Terlalu banyak percobaan. Akun dikunci ${LOCK_MINUTES} menit.` : "Email atau password salah" }, 401);
  }
  await db.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE email = ?").bind(email).run();
  return jsonRes({ ok: true }, 200, setCookie(SESSION_COOKIE, await makeSession(env, email, row.name), SESSION_DAYS * 86400));
}
