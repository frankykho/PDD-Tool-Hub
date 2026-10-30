# Event & Lead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Tool Hub tool, Event & Lead. Customers register for an event through a public form or QR. Sales confirm them via WhatsApp and update their status. Attendance is recorded with a QR or link, and the counts flow into Content Planner reports.

**Architecture:**
- A new Cloudflare Worker `apps/event-lead` with its own D1 database `event-db`.
- Two kinds of pages:
  - **Internal pages**: a single-page app inside the Tool Hub frame, signed in through the same HUBSSO ticket and cookie pattern as Content Planner.
  - **Public pages** at `/d/<code>` (registration) and `/h/<code>` (attendance): no login, no frame, server-rendered HTML.
- Planner integration goes through a service binding `PLANNER`: two new `/__hub/*` endpoints in Content Planner, plus an `event_id` column that locks Peserta/Leads.
- Tool Hub pushes `{users, branches, org}` to Event & Lead the same way it pushes to Planner.

**Tech Stack:**
- Cloudflare Workers + D1 (free plan).
- Plain JS. No build step and no npm dependencies.
- In the browser:
  - `qrcode-generator@1.4.4`: `https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js`
  - `xlsx@0.18.5`: `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js`
- Tests: Node 22 + `node:sqlite`, following the `apps/content-planner/test.mjs` pattern.

**Spec:** `docs/superpowers/specs/2026-10-30-event-lead-design.md`

## Global Constraints

- **UI language:** All user-facing text is Indonesian. Every new string gets an English entry in `apps/event-lead/i18n.js`, and `node scripts/i18n-check.mjs` must pass.
- **Comments:** short Indonesian comments, matching the repo.
- **Deploy:**
  - Worker name `event` in `wrangler.jsonc`, so the public URL is `https://event.<subdomain>.workers.dev`.
  - Deploy id `event`.
  - Placed in `scripts/deploy.mjs` APPS **after `planner` and before `hub`**.
- **Public links:** all public links are built from `appUrl(env, "event")` (`shared/profile.js`), never hard-coded.
- **No new cron:** the free plan's 5 cron slots are used up.
- **Registration form:** exactly these fields:
  - nama
  - nomor HP (WhatsApp)
  - email
  - sudah nasabah KISI? (ya/tidak)
  - kode nasabah (shown and required only if "ya")
  - consent checkbox (required)
- **Participant statuses** (keys → labels):
  - `terdaftar` → Terdaftar
  - `dikonfirmasi` → Dikonfirmasi
  - `hadir` → Hadir
  - `batal` → Batal
  - `tidak_bisa` → Tidak bisa dihubungi
- **No automatic messages** (email/WA) to customers.
- **Data retention:** personal data (name, phone, email, client code) is deleted **12 months after the event date**. Event counts stay.
- **Deleting participants:** only Admin and Head may delete one at any time.
- **Public attendance page:** never shows a name. A successful check-in shows only "Kehadiran tercatat".
- **Public page logo:** iKISI "Elevate Your Investing", copied from `brand/ikisi-color.png` into `apps/event-lead/assets/brand/ikisi-color.png`. Do not rely on `profile.json` brand fields (they are empty). Light theme only.
- **Online events:** the online link appears on the registration "Terima kasih" page and in the WA template.
- **Planner counts:**
  - `cabang` items: Hadir → `result_num` (Peserta), Pendaftar → `leads`.
  - `edukasi` items: Hadir → `result_num` only.
  - These fields are locked in Planner while `event_id` is set.
- **Planner reports:** keep summing only `selesai` items (no change to report rules).
- **Commits:** messages in Indonesian, each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push; the user approves pushes.
- **Line endings:** `apps/tool-hub/worker.js` uses CRLF. Keep them (no `sed -i` on that file).

## Review Focus

1. **The same phone typed differently** (`0812…`, `+62 812…`, `812-…`): must match one participant, both for duplicate registration and for check-in. → Task 3 test `normPhone variants`, Task 5 test `check-in matches 08 form`.
2. **Registering after the quota is full, after registration is closed, or for a cancelled event:** must show a clear message and store nothing. → Task 3 test `quota/closed/batal rejected`.
3. **Check-in outside the event window** (a day early, or the next day): must not mark Hadir. → Task 5 test `window`.
4. **A Sales person opening another branch's event or participant through the API** (guessing an id): must get 403/404. → Task 1 test `canSee`, Task 4 test `foreign event 404`.
5. **Planner item deleted while still linked:** syncing must not crash or recreate the item. The event shows "tidak tersambung". → Task 6 test `gone`.

---

### Task 1: Scaffold, login, schema, access rules

**Files:**
- Create: `apps/event-lead/wrangler.jsonc`, `apps/event-lead/worker.js`, `apps/event-lead/i18n.js`, `apps/event-lead/test.mjs`, `apps/event-lead/assets/brand/ikisi-color.png` (copy of `brand/ikisi-color.png`)
- Modify: `scripts/deploy.mjs` (APPS: `{ id: "event", dir: "apps/event-lead" }` after `planner`, with a one-line comment that it uses Planner via service binding)

**Interfaces:**
- Produces:
  - `export function canSee(me, ev, org)` → `boolean`
  - `export function canManage(me, ev, org)` → `boolean` (same as `canSee` for now; kept separate for clarity)
  - `export function canDelete(me, org)` → `boolean`
  - `me` = session `{e, n, j, c, adm}`
  - `ev` = event row
  - `HUBSSO` copied from `apps/content-planner/worker.js` with `APP = "event"`
  - `ensure(env)` creates the tables below
  - `json(obj, status=200)`

- [ ] **Step 1: Write `wrangler.jsonc`**
  - `name: "event"`, `main: "worker.js"`, `compatibility_date: "2026-09-22"`
  - `assets: { directory: "./assets" }`
  - `d1_databases: [{ binding: "DB", database_name: "event-db", database_id: "auto" }]`
  - `services: [{ binding: "PLANNER", service: "content-planner" }]`
  - Header comment in the style of the Planner config.

- [ ] **Step 2: Write failing tests in `test.mjs`**
  - Harness: copy `d1()` and `cookie()` from the Planner test, with cookie name `hub_event` and `app: "event"`.
  - Org is `DEFAULT_ORG` from `shared/jobs.js`.
  - Tests:

```js
// canSee
const ev = { branch: "Cabang Surabaya", creator_email: "pia@acme.test", creator_team: "pd" };
assert.equal(canSee({ e: "a@x", adm: true }, ev, ORG), true);                        // admin
assert.equal(canSee({ e: "s@x", j: "sales", c: "Cabang Surabaya" }, ev, ORG), true);  // regional, same branch
assert.equal(canSee({ e: "t@x", j: "sales", c: "Cabang Sudirman" }, ev, ORG), false); // regional, other branch
assert.equal(canSee({ e: "r@x", j: "head_rm", c: "Cabang Sudirman" }, ev, ORG), true); // regional Head: all regional events
assert.equal(canSee({ e: "pia@acme.test", j: "partnership" }, ev, ORG), true);        // creator
assert.equal(canSee({ e: "h@x", j: "head_pd" }, ev, ORG), true);                      // head of creator's team
assert.equal(canSee({ e: "c@x", j: "copy" }, ev, ORG), false);
assert.equal(canDelete({ adm: true }, ORG), true);
assert.equal(canDelete({ j: "head_rm" }, ORG), true);
assert.equal(canDelete({ j: "sales" }, ORG), false);
// unauthenticated GET /api/events -> 401 JSON; GET / without cookie -> 303 to hub /sso?app=event
```

- [ ] **Step 3: Run `node apps/event-lead/test.mjs`**
  - Expected: FAIL (module missing).

- [ ] **Step 4: Implement the access rules and the schema**
  - **Access rules** (use `roleIn`, `teamIn`, `isRegional` from `shared/jobs.js`):
    - `canSee` is true when any of these holds:
      - admin
      - regional Head, and `ev.branch` is set
      - regional non-head, and `ev.branch === me.c`
      - `ev.creator_email === me.e`
      - Head of `ev.creator_team`
    - `canDelete` = admin or `roleIn(org, me.j)?.head`.
  - **Schema in `ensure(env)`**: `CREATE TABLE IF NOT EXISTS` for each table below.
    - `events`:
      - `id TEXT PK, code TEXT UNIQUE, acode TEXT UNIQUE`
      - `title, mode` (`'tatap'|'online'`), `date, time_start, time_end, place, online_url`
      - `branch, region, descr, quota INTEGER, open INTEGER DEFAULT 1, wa_tpl`
      - `item_id, item_kind, item_gone INTEGER DEFAULT 0`
      - `status` (`'aktif'|'batal'`)
      - `creator_email, creator_name, creator_job, creator_team, created_at, updated_at`
      - `purged INTEGER DEFAULT 0, n_reg INTEGER DEFAULT 0, n_conf INTEGER DEFAULT 0, n_hadir INTEGER DEFAULT 0, n_walkin INTEGER DEFAULT 0`
    - `people`:
      - `id TEXT PK, event_id, name, phone, email, is_client INTEGER, client_code`
      - `status, walkin INTEGER DEFAULT 0, src` (`'form'|'manual'|'absen'`)
      - `consent_at, consent_ver, created_at, updated_at, updated_by`
      - `UNIQUE(event_id, phone)`
    - `history`: `id INTEGER PK AUTOINCREMENT, person_id, at, by_name, from_status, to_status`
    - `hits`: `ip TEXT, hour TEXT, n INTEGER, PRIMARY KEY(ip, hour)`
    - `cfg`: `k TEXT PK, v TEXT`
  - **Routing**:
    - `/api/*` without a session → `json({error:"Sesi habis. Muat ulang halaman."}, 401)`.
    - `/` without a session → `HUBSSO.login`.
    - `hub_t` → `HUBSSO.ticket`.

- [ ] **Step 5: Run tests**
  - Expected: PASS.

- [ ] **Step 6: Commit**
  - `git add apps/event-lead scripts/deploy.mjs`
  - Message: `Event & Lead: kerangka tool, login lewat Tool Hub, skema D1, aturan akses`.

### Task 2: Tool Hub registration and org/branch sync

**Files:**
- Modify: `apps/tool-hub/worker.js`
  - APPS entry after `planner`
  - `syncPlanner`: also post to `env.EVENT`
- Modify: `apps/tool-hub/wrangler.jsonc` (services: `{ binding: "EVENT", service: "event" }`)
- Modify: `apps/tool-hub/shell.html` (new icon `ticket` in `IC`)
- Modify: `apps/tool-hub/i18n.js` (EN for the new APPS name, desc, blurb, features)
- Modify: `apps/event-lead/worker.js` (`POST /__hub/users`)
- Test: `apps/tool-hub/test.mjs`, `apps/event-lead/test.mjs`

**Interfaces:**
- Produces in Event & Lead:
  - `POST /__hub/users` (guarded by `hubPushAllowed`): body `{users, branches, org}`.
  - Stores into `cfg`:
    - `org` → `cleanOrg(org)`
    - `branches` → array `[{r, c, t}]`
    - `users` → array `[{email, name, job, branch}]`
  - `getOrg(env)`, `getBranches(env)` helpers.
- Consumes: `syncPlanner` body shape (`apps/tool-hub/worker.js`, around line 396).

- [ ] **Step 1: Write failing tests**
  - `tool-hub/test.mjs`:
    - The APPS catalog contains `event`.
    - With a fake `EVENT` binding that records requests, saving `/admin/role` (existing role-form helper) posts once to `https://event/__hub/users` with `x-hub-key`.
  - `event-lead/test.mjs`:
    - `/__hub/users` without the key → 403.
    - With the key → `cfg` row `org` exists, and `getBranches` returns the posted list.

- [ ] **Step 2: Run both tests**
  - Expected: FAIL.

- [ ] **Step 3: Implement**
  - APPS entry: `{ id: 'event', name: 'Event & Lead', desc: 'Pendaftaran, konfirmasi & absen peserta event', cat: 'campaign', icon: 'ticket', blurb, features }`.
    - Blurb and features describe: link & QR daftar, konfirmasi WhatsApp, absen QR/link, angka ke Content Planner.
    - No `levels`, so access is a simple yes/no.
  - In `syncPlanner`, after the Planner post, send the same `body` to `env.EVENT`:
    - `fetch('https://event/__hub/users')`, 6000 ms timeout, errors only logged.
    - Users filtered to those with access `event` (instead of `planner`), plus main admins.
  - `ticket` icon: an SVG path in the same stroke style as `calendar`.

- [ ] **Step 4: Run tests**
  - Run `node apps/tool-hub/test.mjs && node apps/event-lead/test.mjs`.
  - Expected: both print `semua cek lolos`.

- [ ] **Step 5: Commit**
  - Message: `Tool Hub: daftarkan Event & Lead, kirim tim/role & cabang ke Event & Lead`.

### Task 3: Public registration page

**Files:**
- Modify: `apps/event-lead/worker.js`
  - `GET /d/<code>`, `POST /d/<code>`
  - `GET /brand/*` is served by assets
- Test: `apps/event-lead/test.mjs`

**Interfaces:**
- Produces:
  - `export function normPhone(s)` → `"62…"` or `""`
  - `export function cleanReg(b, ev)` → `{name, phone, email, is_client, client_code}` or `{error}`
  - `regPage(env, ev, state)`: server-rendered HTML.
  - `formStamp(env)` / `stampOk(env, s)`: HMAC-signed render time, using `SSO_SECRET`.

- [ ] **Step 1: Write failing tests**

```js
assert.equal(normPhone("0812-3456-789"), "628123456789");
assert.equal(normPhone("+62 812 3456 789"), "628123456789");
assert.equal(normPhone("8123456789"), "628123456789");
assert.equal(normPhone("12345"), "");
// cleanReg: missing consent -> error "Persetujuan data pribadi wajib dicentang."; is_client=1 without client_code -> error "Kode nasabah belum diisi."
// POST /d/<code>: honeypot "website" filled -> 200 thank-you page but no row stored
// POST within 3 s of the stamp -> 400 "Coba kirim lagi."
// second POST with same phone in 0812 form -> one row, name updated
// quota 1 + 1 registered -> page shows "Kuota pendaftaran sudah penuh." and no row stored
// open=0 -> "Pendaftaran sudah ditutup."; status batal -> "Acara ini dibatalkan."
// 11th POST from same cf-connecting-ip within the hour -> 429 "Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti."
// online event thank-you page contains online_url; GET /d/<code> of an online event does NOT contain online_url (shown only after registering)
// unknown code -> 404 page "Acara tidak ditemukan."
```

- [ ] **Step 2: Run tests**
  - Expected: FAIL.

- [ ] **Step 3: Implement**
  - **Page layout**:
    - Logo `/brand/ikisi-color.png`.
    - Title, date (`Senin, 3 November 2026`), time `09.00–11.00 WIB`, place or "Online", description.
    - Form fields in the order given in Global Constraints.
    - The client-code field toggles with a few lines of inline JS and is also validated on the server.
    - Hidden fields `website` (honeypot) and `ts` (from `formStamp`).
  - **Consent text**: `cfg` key `consent` (`{text, ver}`). Default `ver: 1`, text:
    > "Saya setuju nama, nomor HP, email, dan kode nasabah saya dipakai penyelenggara untuk menghubungi saya terkait acara ini. Data disimpan paling lama 12 bulan setelah acara."
  - **Saving**:
    - Upsert on `(event_id, phone)`; status `terdaftar` for new rows only; store `consent_at` and `consent_ver`.
    - Rate limit via `hits`: 10 per IP per UTC hour.
    - Recalculate counts and push them to Planner (Task 6 `syncCounts`; until Task 6 exists, a no-op stub with the same name).
  - **Headers**: no `frame-ancestors` restriction, `cache-control: no-store`.

- [ ] **Step 4: Run tests**
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Message: `Event & Lead: halaman pendaftaran publik (form, persetujuan data, penahan spam, kuota)`.

### Task 4: Events and participants API

**Files:**
- Modify: `apps/event-lead/worker.js`
- Test: `apps/event-lead/test.mjs`

**Interfaces:**
- Produces:
  - `GET /api/events` → `[event + counts]` that pass `canSee`, newest first.
  - `POST /api/events` → `{id, code, acode}` or `{error}`.
    - Body: `{id?, title, mode, date, time_start, time_end, place, online_url, branch, descr, quota, open, wa_tpl, status, link:{item_id}|{create:true}}`
  - `GET /api/people?event=<id>` → `{event, people:[...], waDefault}`.
  - `POST /api/people`:
    - `{event_id, id?, name, phone, email, is_client, client_code}` → manual add or edit (`src='manual'`).
    - `{id, status}` → status change, writes `history`.
  - `POST /api/people/delete` `{id}` → requires `canDelete`.
  - `export function waText(tpl, ev, person)` → string. Placeholders: `{nama} {acara} {tanggal} {jam} {tempat} {link}`.
  - `export const WA_DEFAULT` =
    > "Halo {nama}, terima kasih sudah mendaftar {acara} pada {tanggal} pukul {jam} di {tempat}. Mohon balas YA untuk konfirmasi kehadiran. Terima kasih."
    - For online events `{tempat}` = "online" and `{link}` = `online_url`.
  - `GET /api/settings`, `POST /api/settings` `{consent}`: admin only; saving bumps `ver`.
- Consumes: `canSee`, `canDelete`, `getBranches`, `normPhone`, `cleanReg` (manual add skips the consent check and sets `consent_ver = 0`).

- [ ] **Step 1: Write failing tests**
  - Regional Sales creates an event for their own branch → 200.
  - Sales creates an event for another branch → 400 "Cabang ini bukan cabangmu."
  - Non-regional creator: `branch` must be empty. `creator_team` = `teamIn(org, j)?.id || ""`.
  - Codes are 10 characters `[a-z0-9]` and differ between `code` and `acode`.
  - **Foreign event 404**: Sales from another branch calls `GET /api/people?event=<id>` → 404.
  - Status change `terdaftar`→`dikonfirmasi` adds one `history` row with `by_name`.
  - Status value not in the five keys → 400.
  - Delete as Sales → 403. Delete as Head → 200, and counts drop.
  - `waText(WA_DEFAULT, ev, {name:"Budi"})` contains `"Halo Budi"` and the formatted date.
  - Validation: missing `time_end`, or `time_end <= time_start` → 400 "Jam selesai harus setelah jam mulai."
  - Online event without `online_url` → 400 "Link acara online belum diisi."

- [ ] **Step 2: Run tests**
  - Expected: FAIL.

- [ ] **Step 3: Implement**
  - Codes come from `crypto.getRandomValues`, mapped to the alphabet `abcdefghijkmnpqrstuvwxyz23456789`.
  - Counts are recomputed with one aggregate query after every write. Store them on the event (`n_reg` = all rows except `batal`), then call `syncCounts`.
  - Mutating POSTs require `HUBSSO.sameOrigin`.
  - `region` is filled from `getBranches` for the chosen branch.

- [ ] **Step 4: Run tests**
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Message: `Event & Lead: API event & peserta (status, riwayat, tambah manual, hapus, template WhatsApp)`.

### Task 5: Attendance (public) and manual check-in

**Files:**
- Modify: `apps/event-lead/worker.js` (`GET/POST /h/<acode>`)
- Test: `apps/event-lead/test.mjs`

**Interfaces:**
- Produces:
  - `export function inWindow(ev, nowMs)` → `boolean`.
    - The window runs from `date+time_start` minus 1 hour to `date+time_end` plus 2 hours.
    - Times are WIB (UTC+7).
  - The attendance page has a single phone field.
    - If the phone is found, the status becomes `hadir`, `history` is written (`by_name` = "Absen mandiri"), and the page shows "Kehadiran tercatat". No name is shown.
    - If the phone is not found, the page shows the registration fields (same as Task 3, prefilled phone). Submitting stores `status='hadir', walkin=1, src='absen'`, then shows "Kehadiran tercatat".
- Consumes: `normPhone`, `cleanReg`, `formStamp`/`stampOk`, rate limit from Task 3.

- [ ] **Step 1: Write failing tests**
  - **window**: `inWindow` for an event on `2026-11-03` from `09:00` to `11:00` WIB:
    - true at `2026-11-03T01:00Z` (08:00 WIB)
    - false at `2026-11-02T23:59Z` (06:59 WIB)
    - false at `2026-11-03T06:01Z` (13:01 WIB)
  - POST outside the window → page "Absen belum dibuka." or "Absen sudah ditutup.", and no change.
  - **check-in matches 08 form**: registered as `+62812…`; check-in with `0812…` → the same row becomes `hadir`.
  - The response HTML does not contain the participant's name.
  - An unknown phone with full fields → new row with `walkin = 1`.
  - Event `batal` → "Acara ini dibatalkan."

- [ ] **Step 2: Run tests**
  - Expected: FAIL.

- [ ] **Step 3: Implement**
  - Pass the current time into `inWindow` so tests can fix it.
  - Read the clock from `env.NOW_MS` if set (tests only), else `Date.now()`.

- [ ] **Step 4: Run tests**
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Message: `Event & Lead: absen publik (QR / link online), walk-in, jendela waktu absen`.

### Task 6: Content Planner link (both sides)

**Files:**
- Modify: `apps/content-planner/worker.js`
  - `COLS.event_id: "TEXT"`
  - add `"event_id"` to `SERVER_COLS`
  - `saveItem` lock
  - two endpoints
- Modify: `apps/content-planner/page.html`
  - when `it.event_id` is set, disable `#iRes` and `#iLeads`, and show the hint "Diisi otomatis dari Event & Lead"
- Modify: `apps/content-planner/i18n.js` (EN for the hint)
- Modify: `apps/event-lead/worker.js`
  - `syncCounts(env, ev)`
  - `linkItem(env, me, ev, link)`
  - `GET /api/planner-items`
- Test: `apps/content-planner/test.mjs`, `apps/event-lead/test.mjs`

**Interfaces:**
- Planner produces:
  - `GET /__hub/event-items?email=<e>&branch=<c>&kind=cabang|edukasi` (`hubFeedAllowed`)
    - Returns `[{id, kind, title, date, time, place, branch, status}]`.
    - Filter: status not in `selesai`/`batal`, and `date >= today - 30 days`.
    - `cabang`: `branch = <c>`.
    - `edukasi`: `owner_email = <e> OR created_email = <e>`.
    - Excludes items whose `event_id` is already set.
  - `POST /__hub/event-sync` (`hubPushAllowed`)
    - Body: `{item_id, event_id, set?:{title, date, time, place, branch, status}, counts?:{reg, hadir}}`.
    - Unknown `item_id` → `{gone:true}`. Otherwise a direct `UPDATE` → `{ok:true}`.
    - Sets `event_id`. Applies `set` fields that are present.
    - `counts`:
      - `cabang`: `result_num = hadir`, `leads = reg`.
      - `edukasi`: `result_num = hadir`.
- Event & Lead produces:
  - `syncCounts(env, ev)`: posts counts. On `{gone:true}` it sets `item_gone = 1`.
  - `linkItem(env, me, ev, link)`:
    - With `{create:true}`, it calls the existing `POST /__hub/item` with `by:{email,name,job}` and item:
      - `cabang` for regional creators, otherwise `edukasi` with `channel:"Webinar"` when `mode=online` and `"Seminar"` when `mode=tatap`.
      - The item gets title, date, time, place, branch, status `rencana`, and owner = creator.
    - Then it calls `event-sync` to set `event_id`.
  - Editing an event re-sends `set`. Setting the event to `batal` sends `status:"batal"`.
  - `GET /api/planner-items` proxies `/__hub/event-items` for the signed-in user's email and branch, choosing the kind the same way.

- [ ] **Step 1: Write failing tests**
  - Planner `test.mjs`:
    - `event-sync` with counts on a `cabang` item → the row has `result_num = hadir` and `leads = reg`.
    - A later normal `POST /api/items` save with `result_num: 999, leads: 999` keeps the synced values.
    - **gone**: an unknown `item_id` → `{gone:true}`.
    - `event-items` excludes an item that already has `event_id`.
  - Event & Lead `test.mjs`, with a fake `PLANNER` binding that dispatches to the real Planner worker (import `apps/content-planner/worker.js`, separate in-memory D1):
    - Creating an event with `link:{create:true}` creates a Planner `cabang` item.
    - Registering two people and checking in one gives Planner `leads=2, result_num=1`.
    - Deleting the Planner item, then registering again, sets `item_gone=1` on the event and does not throw.

- [ ] **Step 2: Run both tests**
  - Expected: FAIL.

- [ ] **Step 3: Implement**
  - In `saveItem`, when `prev.event_id` is set:
    - keep `it.result_num` (and, for `cabang`, `it.leads`) from `prev`;
    - set `srv.event_id = prev.event_id`.
  - New items keep `event_id` as `null`.
  - Planner calls from Event & Lead go through `env.PLANNER.fetch` with `x-hub-key: env.SSO_SECRET`.
  - On `ctx.waitUntil` failures, log only. A Planner outage never blocks registration.

- [ ] **Step 4: Run tests**
  - Run `node apps/content-planner/test.mjs && node apps/event-lead/test.mjs`.
  - Expected: both PASS.

- [ ] **Step 5: Commit**
  - Message: `Event & Lead ↔ Content Planner: pilih/buat kegiatan, sinkron perubahan, angka Peserta & Leads otomatis (dikunci)`.

### Task 7: Internal app UI

**Files:**
- Create: `apps/event-lead/page.html`, served at `/` with `themeHead("", EN)`, `profileScript(env)` and `HUBSSO.onlyInHub(env)`, the same pattern as Planner around line 1023.
- Modify: `apps/event-lead/i18n.js`
- Test: `apps/event-lead/test.mjs` (smoke test only: `GET /` with a cookie returns 200 HTML containing `id="evList"`)

**Interfaces:**
- Consumes: all `/api/*` routes from Tasks 4–6.
- Produces three views in one page, switched with `location.hash`:
  - **`#/` list** (`id="evList"`):
    - Cards show title, date, branch/Online, and the counts `Pendaftar · Dikonfirmasi · Hadir`.
    - Filter: Mendatang / Selesai / Semua.
    - Button "Buat event".
  - **`#/new`, `#/edit/<id>` form**:
    - Fields from the Task 4 body.
    - "Sambungkan ke kegiatan Content Planner": a select filled from `/api/planner-items`, plus the option "Buat kegiatan baru di Content Planner" (default).
    - Branch select: for regional users, locked to their own branch; for others, hidden.
  - **`#/e/<id>` detail**:
    - **Two share blocks** (Daftar, Absen). Each has the link, buttons "Salin link" and "Unduh QR", and a QR drawn with qrcode-generator. The PNG is 1024 px, white margin, with the event title under the QR.
    - **Planner link status**: "Tersambung ke Content Planner", or "Tidak tersambung" when `item_gone`.
    - **Participant table**:
      - columns: Nama, HP, Email, Nasabah (kode), Status (select), Walk-in, Terdaftar.
      - search box and status filter chips.
      - "WhatsApp" button opens `https://wa.me/<phone>?text=<waText>` in a new tab.
      - "Tambah peserta" (manual).
      - "Hapus" only when `me.canDelete`.
    - **WA template editor** with the placeholder help text.
    - **"Ekspor Excel"**: xlsx, file name `Peserta - <judul> - <tanggal>.xlsx`.
  - **Admin-only settings panel** for the consent text.
- Mobile first: tables become cards under 640 px, and touch targets are at least 44 px (same rules as the Tool Hub UI pass in commit `bead09b`).

- [ ] **Step 1: Write the smoke test**
  - Assertion: `GET /` returns 200 and contains `id="evList"`.
  - Run it: expected FAIL.

- [ ] **Step 2: Implement `page.html`**
  - Follow the Planner page conventions: `$` helper, `api()` fetch wrapper that shows `error` from JSON, escape all user text.

- [ ] **Step 3: Run the tests and the i18n check**
  - Run `node apps/event-lead/test.mjs && node scripts/i18n-check.mjs`.
  - Expected: PASS.

- [ ] **Step 4: Check in a browser by hand**
  - Run the worker locally with a node harness, like `apps/content-planner` (see `cp_harness.mjs` pattern: in-memory D1, signed cookie).
  - Steps: create an event, open `/d/<code>` and register, open `/h/<acode>` and check in, then confirm the counts and the WA link.
  - Expected: no console errors; QR downloads; Excel opens.

- [ ] **Step 5: Commit**
  - Message: `Event & Lead: halaman tim (daftar event, form, link & QR, peserta, WhatsApp, ekspor Excel)`.

### Task 8: Retention purge, docs, release check

**Files:**
- Modify: `apps/event-lead/worker.js` (`purgeOld(env, nowMs)`, called through `ctx.waitUntil` on `GET /api/events`, at most once per 6 hours via `cfg` key `purged_at`)
- Modify: `README.md` (tool list line for Event & Lead)
- Test: `apps/event-lead/test.mjs`

**Interfaces:**
- Produces: `export async function purgeOld(env, nowMs)` → `{events, people}` (number purged).
  - It finds events with `date < (now − 12 months)` and `purged = 0`.
  - It deletes their `people` and `history` rows and sets `purged = 1`.
  - It keeps the `n_*` counts on the event.

- [ ] **Step 1: Write the failing test**
  - An event dated `2025-10-01` with 2 people, `nowMs` = `2026-10-30`: `purgeOld` returns `{events:1, people:2}`.
  - Afterwards the event row still has `n_reg = 2`.
  - An event dated `2026-01-01` is untouched.

- [ ] **Step 2: Run the test**
  - Expected: FAIL.

- [ ] **Step 3: Implement**
  - Detail view of a purged event: "Data peserta sudah dihapus (lebih dari 12 bulan)." with counts only.

- [ ] **Step 4: Run all checks**
  - Run `node apps/event-lead/test.mjs && node apps/content-planner/test.mjs && node apps/tool-hub/test.mjs && node scripts/i18n-check.mjs && node scripts/deploy.mjs --dry-run`.
  - Expected: all pass; the dry run bundles `event`.

- [ ] **Step 5: Commit**
  - Message: `Event & Lead: hapus data peserta otomatis 12 bulan setelah acara; README`.
