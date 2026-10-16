import { useState } from "react";
import { api, type AdminUser } from "../api";
import { ErrorBox, Loading } from "../components/Bits";
import { fmtDate } from "../format";
import { useAsync } from "../useAsync";

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  revoked: "Dicabut",
};

/** ISO (UTC) -> "5 Okt 2026 09:24" in WIB */
const when = (iso: string | null) => {
  if (!iso) return "—";
  const w = new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString();
  return `${fmtDate(w.slice(0, 10), true)} ${w.slice(11, 16)}`;
};

export default function Admin({ selfEmail, onChange }: { selfEmail: string; onChange?: () => void }) {
  const [tick, setTick] = useState(0);
  const res = useAsync(() => api.adminUsers(), [tick]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");

  const act = async (email: string, action: Parameters<typeof api.adminAction>[1]) => {
    setBusy(email + action);
    setErr(null);
    try {
      await api.adminAction(email, action);
      setTick((t) => t + 1);
      onChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(null);
    }
  };

  const rows = res.data?.rows ?? [];
  const groups: Array<[string, AdminUser[]]> = [
    ["Menunggu persetujuan", rows.filter((r) => r.status === "pending")],
    ["Disetujui", rows.filter((r) => r.status === "approved")],
    ["Ditolak / dicabut", rows.filter((r) => r.status === "rejected" || r.status === "revoked")],
  ];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Admin · Akses pengguna</h1>
          <p className="muted">
            Pengguna mendaftar sendiri lalu menunggu persetujuan di sini. Admin utama (dari pengaturan ADMIN_EMAILS):{" "}
            {(res.data?.admins ?? []).join(", ") || "—"}
          </p>
        </div>
      </div>

      <section className="card pad">
        <h2>Tambahkan langsung</h2>
        <p className="dim small">Setujui email tertentu lebih dulu; orangnya cukup Daftar dengan email itu dan langsung bisa masuk.</p>
        <div className="admin-add">
          <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="nama@email.com" />
          <button
            type="button"
            className="btn primary"
            disabled={!/^\S+@\S+\.\S+$/.test(newEmail) || busy != null}
            onClick={() => {
              act(newEmail.trim().toLowerCase(), "approve");
              setNewEmail("");
            }}
          >
            Setujui email
          </button>
        </div>
      </section>

      {err && <ErrorBox error={err} />}
      {res.error ? (
        <ErrorBox error={res.error} />
      ) : !res.data ? (
        <Loading what="pengguna" />
      ) : (
        groups.map(([title, list]) => (
          <section key={title} className="card">
            <div className="card-head">
              <h2>
                {title} <span className="muted small">{list.length}</span>
              </h2>
            </div>
            {list.length === 0 ? (
              <div className="state">Tidak ada.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Nama</th>
                      <th>Keperluan</th>
                      <th>Status</th>
                      <th>Diajukan</th>
                      <th>Terakhir aktif</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((u) => (
                      <tr key={u.email}>
                        <td className="mono small">
                          {u.email}
                          {u.role === "admin" && <span className="pattern-badge bull"> admin</span>}
                        </td>
                        <td>{u.name ?? "—"}</td>
                        <td className="small dim">{u.reason || "—"}</td>
                        <td>
                          <span className={`status ${u.status === "approved" ? "tp" : u.status === "pending" ? "run" : "sl"}`}>
                            {STATUS_LABEL[u.status] ?? u.status}
                          </span>
                          {u.decided_by && <div className="dim small">oleh {u.decided_by}</div>}
                        </td>
                        <td className="small">{when(u.requested_at)}</td>
                        <td className="small">{when(u.last_seen)}</td>
                        <td>
                          <div className="admin-actions">
                            {u.email === selfEmail ? (
                              <span className="dim small">akun kamu</span>
                            ) : (
                              <>
                                {u.status !== "approved" && (
                                  <button type="button" className="btn primary" disabled={busy != null} onClick={() => act(u.email, "approve")}>
                                    Setujui
                                  </button>
                                )}
                                {u.status === "pending" && (
                                  <button type="button" className="btn" disabled={busy != null} onClick={() => act(u.email, "reject")}>
                                    Tolak
                                  </button>
                                )}
                                {u.status === "approved" && (
                                  <button type="button" className="btn" disabled={busy != null} onClick={() => act(u.email, "revoke")}>
                                    Cabut akses
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={busy != null}
                                  title="Hapus password; pengguna daftar ulang dengan email yang sama untuk membuat password baru (status akses tetap)"
                                  onClick={() => {
                                    if (window.confirm(`Reset password ${u.email}?`)) act(u.email, "reset_password");
                                  }}
                                >
                                  Reset password
                                </button>
                                {u.status === "approved" && (
                                  <button
                                    type="button"
                                    className="btn"
                                    disabled={busy != null}
                                    onClick={() => act(u.email, u.role === "admin" ? "remove_admin" : "make_admin")}
                                  >
                                    {u.role === "admin" ? "Hapus admin" : "Jadikan admin"}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}
    </main>
  );
}
