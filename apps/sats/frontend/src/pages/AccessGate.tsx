import { useState } from "react";
import { api, type Me } from "../api";


/** Shown to logged-in users who are not (yet) approved by an admin. */
export default function AccessGate({ me, onChange }: { me: Me; onChange: (m: Me) => void }) {
  const [name, setName] = useState(me.name ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      onChange(await api.requestAccess(name, reason));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal mengirim");
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    setBusy(true);
    try {
      onChange(await api.me());
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page gate">
      <section className="card pad gate-card">
        <div className="brand-mark" aria-hidden="true">
          ↗
        </div>
        <h1>SATS Radar IDX</h1>
        <p className="muted">
          Masuk sebagai <strong>{me.email}</strong>
        </p>

        {me.status === "pending" ? (
          <>
            <div className="gate-status pending">
              <strong>Menunggu persetujuan admin</strong>
              <span>Pengajuan kamu sudah diterima. Halaman ini akan terbuka setelah admin menyetujui.</span>
            </div>
            <button type="button" className="btn" onClick={refresh} disabled={busy}>
              {busy ? "Memeriksa…" : "Cek lagi"}
            </button>
          </>
        ) : (
          <>
            {(me.status === "rejected" || me.status === "revoked") && (
              <div className="gate-status rejected">
                <strong>{me.status === "rejected" ? "Pengajuan sebelumnya ditolak" : "Akses kamu telah dicabut"}</strong>
                <span>Kamu bisa mengajukan ulang dengan keterangan tambahan.</span>
              </div>
            )}
            <p>Dashboard ini hanya untuk pengguna yang disetujui. Ajukan akses dengan mengisi data berikut:</p>
            <label className="gate-field">
              <span>Nama</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nama lengkap" />
            </label>
            <label className="gate-field">
              <span>Keperluan (opsional)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} placeholder="mis. rekan tim, untuk riset saham" />
            </label>
            {err && <div className="state error">{err}</div>}
            <button type="button" className="btn primary" onClick={submit} disabled={busy || name.trim().length < 2}>
              {busy ? "Mengirim…" : "Ajukan akses"}
            </button>
          </>
        )}
        <a className="dim small" href={me.logoutUrl}>
          Keluar / ganti email
        </a>
      </section>
    </main>
  );
}

/** Shown when nobody is logged in yet. */
export function LoginPage({ methods, onLoggedIn }: { methods: string[]; onLoggedIn: () => void }) {
  const password = methods.includes("password");
  const google = methods.includes("google");
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (tab === "login") await api.login(email, pw);
      else await api.register(email, pw, name, reason);
      onLoggedIn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page gate">
      <section className="card pad gate-card">
        <div className="brand-mark" aria-hidden="true">
          ↗
        </div>
        <h1>SATS Radar IDX</h1>
        <p className="muted">Dashboard sinyal &amp; screener saham BEI.</p>

        {password && (
          <>
            <div className="segmented gate-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "login"} aria-pressed={tab === "login"} onClick={() => setTab("login")}>
                Masuk
              </button>
              <button type="button" role="tab" aria-selected={tab === "register"} aria-pressed={tab === "register"} onClick={() => setTab("register")}>
                Daftar
              </button>
            </div>
            <form
              className="gate-form"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <label className="gate-field">
                <span>Email</span>
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label className="gate-field">
                <span>Password{tab === "register" && " (min. 8 karakter)"}</span>
                <input
                  type="password"
                  autoComplete={tab === "login" ? "current-password" : "new-password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  minLength={tab === "register" ? 8 : undefined}
                  required
                />
              </label>
              {tab === "register" && (
                <>
                  <label className="gate-field">
                    <span>Nama</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
                  </label>
                  <label className="gate-field">
                    <span>Keperluan (opsional)</span>
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} placeholder="mis. rekan tim, untuk riset saham" />
                  </label>
                </>
              )}
              {err && <div className="state error">{err}</div>}
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? "Memproses…" : tab === "login" ? "Masuk" : "Daftar & ajukan akses"}
              </button>
              <p className="dim small">
                {tab === "login"
                  ? "Belum punya akun? Pilih Daftar. Lupa password? Minta admin mereset, lalu daftar ulang dengan email yang sama."
                  : "Setelah daftar, akses aktif setelah disetujui admin."}
              </p>
            </form>
          </>
        )}

        {google && (
          <a className="btn google-btn" href="/api/auth/login">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
            </svg>
            Masuk dengan Google
          </a>
        )}
      </section>
    </main>
  );
}
