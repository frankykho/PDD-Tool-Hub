/**
 * Pemegang saham ≥ 1% (tabel own_holdings, ditulis bulanan oleh pipeline/run-ownership.ts).
 *
 *   GET /api/owners/summary                 bulan tersedia, pemegang dengan saham terbanyak, perubahan terbesar vs bulan lalu
 *   GET /api/owners/search?q=               cari nama pemegang (dan kode saham)
 *   GET /api/owners/holder?key=             saham milik satu pemegang (+ bulan lalu, nilai = lembar × harga terakhir)
 *   GET /api/owners/stock?code=             pemegang ≥ 1% satu saham (+ bulan lalu)
 *   GET /api/owners/network?key=            saham satu pemegang + pemegang lain di saham-saham itu (untuk grafik jaringan)
 */
type Json = (data: unknown, status?: number, maxAge?: number) => Response;

interface Months { asOf: string | null; prev: string | null; months: string[] }

async function months(db: D1Database): Promise<Months> {
  const { results } = await db
    .prepare("SELECT as_of FROM own_releases ORDER BY as_of DESC")
    .all<{ as_of: string }>()
    .catch(() => ({ results: [] as Array<{ as_of: string }> })); // tabel muncul setelah impor pertama
  const list = results.map((r) => r.as_of);
  return { asOf: list[0] ?? null, prev: list[1] ?? null, months: list };
}

const CODE = /^[A-Z0-9]{2,6}$/;

export interface Change { code: string; hkey: string; name: string; cat: string; pct: number; before: number; delta: number }

/**
 * Drops what only looks like a change: a holder that disappears from a stock while another name appears in the same
 * stock with (almost) the same stake is a rename / typo fix / move to a registrar account ("MD PICTURES" -> "MD
 * ENTERTAINMENT", "DANA PENSUN" -> "DANA PENSIUN"). Custodian accounts are left out of the result.
 */
export function realChanges(rows: Change[]): Change[] {
  const gone = rows.filter((r) => r.pct === 0);
  const fresh = rows.filter((r) => r.before === 0);
  const drop = new Set<Change>();
  for (const g of gone) {
    const twin = fresh.find((f) => !drop.has(f) && f.code === g.code && Math.abs(f.pct - g.before) <= Math.max(0.1, g.before * 0.01));
    if (twin) {
      drop.add(g);
      drop.add(twin);
    }
  }
  return rows.filter((r) => !drop.has(r) && r.cat !== "kustodian");
}

export async function ownersRoute(db: D1Database, path: string, url: URL, json: Json): Promise<Response | null> {
  if (!path.startsWith("/api/owners/")) return null;
  const m = await months(db);
  if (!m.asOf) return json({ ...m, empty: true });
  const prev = m.prev ?? "";

  if (path === "/api/owners/summary") {
    const counts = await db
      .prepare("SELECT COUNT(*) AS rows, COUNT(DISTINCT hkey) AS holders, COUNT(DISTINCT code) AS stocks FROM own_holdings WHERE as_of = ?")
      .bind(m.asOf)
      .first();
    const top = await db
      .prepare(
        `SELECT hkey, MAX(name) AS name, MAX(cat) AS cat, MIN(local) AS local, COUNT(*) AS n, ROUND(SUM(pct), 2) AS pct_sum,
                GROUP_CONCAT(code, ',') AS codes
         FROM (SELECT * FROM own_holdings WHERE as_of = ? AND cat <> 'kustodian' ORDER BY pct DESC)
         GROUP BY hkey ORDER BY n DESC, pct_sum DESC LIMIT 20`,
      )
      .bind(m.asOf)
      .all();
    // changes vs the previous month (same holder key, same stock)
    const raw = m.prev
      ? (
          await db
            .prepare(
              `SELECT * FROM (SELECT a.code, a.hkey, a.name, a.cat, a.pct AS pct, COALESCE(b.pct, 0) AS before, ROUND(a.pct - COALESCE(b.pct, 0), 2) AS delta
               FROM own_holdings a LEFT JOIN own_holdings b ON b.as_of = ?2 AND b.code = a.code AND b.hkey = a.hkey
               WHERE a.as_of = ?1 AND ABS(a.pct - COALESCE(b.pct, 0)) >= 0.5
                 AND a.code IN (SELECT code FROM own_holdings WHERE as_of = ?2)
               UNION ALL
               SELECT b.code, b.hkey, b.name, b.cat, 0 AS pct, b.pct AS before, -b.pct AS delta
               FROM own_holdings b LEFT JOIN own_holdings a ON a.as_of = ?1 AND a.code = b.code AND a.hkey = b.hkey
               WHERE b.as_of = ?2 AND a.code IS NULL AND b.pct >= 1
                 AND b.code IN (SELECT code FROM own_holdings WHERE as_of = ?1))
               ORDER BY ABS(delta) DESC LIMIT 400`,
            )
            .bind(m.asOf, prev)
            .all<Change>()
        ).results
      : [];
    return json({ ...m, counts, top: top.results, changes: realChanges(raw).slice(0, 60) }, 200, 600);
  }

  if (path === "/api/owners/search") {
    const raw = (url.searchParams.get("q") ?? "").trim().toUpperCase().slice(0, 60);
    if (raw.length < 2) return json({ ...m, holders: [], stocks: [] });
    const like = `%${raw.replace(/[%_]/g, "")}%`;
    const holders = await db
      .prepare(
        `SELECT hkey, MAX(name) AS name, MAX(cat) AS cat, COUNT(*) AS n FROM own_holdings
         WHERE as_of = ? AND (hkey LIKE ? OR UPPER(name) LIKE ?) GROUP BY hkey ORDER BY n DESC, name LIMIT 20`,
      )
      .bind(m.asOf, like, like)
      .all();
    const stocks = await db
      .prepare(
        `SELECT s.code, s.name FROM stocks s WHERE s.code IN (SELECT DISTINCT code FROM own_holdings WHERE as_of = ?)
           AND (s.code LIKE ? OR UPPER(s.name) LIKE ?) ORDER BY (s.code = ?) DESC, s.code LIMIT 8`,
      )
      .bind(m.asOf, `${raw}%`, like, raw)
      .all();
    return json({ ...m, holders: holders.results, stocks: stocks.results }, 200, 600);
  }

  if (path === "/api/owners/holder") {
    const key = (url.searchParams.get("key") ?? "").slice(0, 200);
    const { results } = await db
      .prepare(
        `SELECT a.code, s.name AS stock_name, a.name, a.cat, a.type, a.local, a.domicile, a.shares, a.pct, b.pct AS before,
                t.close, a.shares * t.close AS value
         FROM own_holdings a
         LEFT JOIN own_holdings b ON b.as_of = ? AND b.code = a.code AND b.hkey = a.hkey
         LEFT JOIN stocks s ON s.code = a.code
         LEFT JOIN tech_latest t ON t.code = a.code
         WHERE a.as_of = ? AND a.hkey = ? ORDER BY a.pct DESC`,
      )
      .bind(prev, m.asOf, key)
      .all();
    // positions that existed last month but are gone now
    const exited = m.prev
      ? await db
          .prepare(
            `SELECT b.code, b.pct AS before FROM own_holdings b
             WHERE b.as_of = ? AND b.hkey = ? AND NOT EXISTS (SELECT 1 FROM own_holdings a WHERE a.as_of = ? AND a.code = b.code AND a.hkey = b.hkey)`,
          )
          .bind(prev, key, m.asOf)
          .all()
      : { results: [] };
    return json({ ...m, key, rows: results, exited: exited.results }, 200, 600);
  }

  if (path === "/api/owners/stock") {
    const code = (url.searchParams.get("code") ?? "").toUpperCase();
    if (!CODE.test(code)) return json({ error: "kode tidak valid" }, 400, 0);
    const { results } = await db
      .prepare(
        `SELECT a.hkey, a.name, a.cat, a.type, a.local, a.domicile, a.shares, a.pct, b.pct AS before,
                (SELECT COUNT(*) FROM own_holdings c WHERE c.as_of = a.as_of AND c.hkey = a.hkey) AS n_stocks
         FROM own_holdings a LEFT JOIN own_holdings b ON b.as_of = ? AND b.code = a.code AND b.hkey = a.hkey
         WHERE a.as_of = ? AND a.code = ? ORDER BY a.pct DESC`,
      )
      .bind(prev, m.asOf, code)
      .all();
    const exited = m.prev
      ? await db
          .prepare(
            `SELECT b.hkey, b.name, b.cat, b.pct AS before FROM own_holdings b
             WHERE b.as_of = ? AND b.code = ? AND NOT EXISTS (SELECT 1 FROM own_holdings a WHERE a.as_of = ? AND a.code = b.code AND a.hkey = b.hkey)`,
          )
          .bind(prev, code, m.asOf)
          .all()
      : { results: [] };
    const stock = await db.prepare("SELECT code, name FROM stocks WHERE code = ?").bind(code).first();
    return json({ ...m, code, stock, rows: results, exited: exited.results }, 200, 600);
  }

  if (path === "/api/owners/network") {
    const key = (url.searchParams.get("key") ?? "").slice(0, 200);
    const { results } = await db
      .prepare(
        `SELECT h.code, h.hkey, h.name, h.cat, h.pct,
                (SELECT COUNT(*) FROM own_holdings c WHERE c.as_of = h.as_of AND c.hkey = h.hkey) AS n_stocks
         FROM own_holdings h
         WHERE h.as_of = ?1 AND h.code IN (SELECT code FROM own_holdings WHERE as_of = ?1 AND hkey = ?2)
         ORDER BY h.code, h.pct DESC`,
      )
      .bind(m.asOf, key)
      .all();
    return json({ ...m, key, rows: results }, 200, 600);
  }

  return json({ error: "not found" }, 404, 0);
}
