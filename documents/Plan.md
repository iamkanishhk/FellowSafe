# FellowSafe — Backend Implementation Plan

**Scope: `server/` only.** No mobile/native work is specified here. The REST + Socket.IO contract in §7/§8 is the interface the Expo app codes against.

Source: `documents/PRD.md` + product-interview decisions + backend re-audit (Sep 2026). The mobile/native plan was moved verbatim to `documents/Plan.mobile.md` so nothing is lost.

---

## 0. Locked decisions (backend-relevant subset)

| # | Decision | Backend consequence |
|---|----------|---------------------|
| D1 | Contacts sign in too; auto-link by verified phone + name. No invite/accept flow. | `POST /auth/sync` performs the link. Must be phone-verification-gated, scoped, revocable, idempotent. |
| D4 | Google first, then **mandatory** phone + OTP. | The gate is **server-enforced** (`phone_verified_at`), not just in-app. |
| D5 | REST owns CRUD + SOS lifecycle. Socket.IO owns the live stream. FCM only wakes the app. | Location writes arrive on REST; the **server** fans out to the room. |
| D7 | 5s cadence; **purge `sos_locations` on RESOLVED**. | Retention is a transaction on the resolve path, plus a 2h lazy sweep for sessions that never resolve. |
| D8 | Free tiers only (Neon Postgres, Render). | All infra limits below are designed around, not wished away. |
| D10 | Build-ready, clean architecture. | Authz is a single reusable guard; invariants are covered by tests, not comments. |

**Dropped:** D2/D3/D9 are mobile-only and now live in `Plan.mobile.md`.

## 1. Assumptions (flagged)

1. Timeline unknown → backend sized at **~5 working days** (see §5). The earlier plan under-counted backend at ~3; either add the difference or run backend and mobile in parallel across two people.
2. Code quality counts. Non-negotiable outcome: every security claim in §13 has a test.
3. A contact who never installs the app is a supported, non-exceptional case — the owner's UI must be able to say so from server truth.
4. Node host = Render free tier. Railway acceptable alternative (no contract changes).
5. Demo identities: Phone A = user `Priya`, Phone B = contact `Mom` (+91 numbers), provisioned manually in Clerk, then seeded into the DB by script.

## 2. Backend architecture

```
┌──────────────────────┐              ┌──────────────────────┐
│ Phone A — user       │              │ Phone B — contact    │
│ background location  │              │ holds a socket open  │
│ task                 │              │ (the only viewer)    │
│ POST /sos/:id/loc    │              │ WSS join sos:<id>    │
└──────────┬───────────┘              └──────────┬───────────┘
           │ REST (HTTPS)                        │ Socket.IO (WSS)
           ▼                                     ▼
      ┌───────────────────────────────────────────────────────┐
      │  Node 24 · Express 5 · Socket.IO 4        (Render free)│
      │  • clerkMiddleware(jwtKey) — networkless JWT verify   │
      │  • requireSessionAccess — one guard, all session reads │
      │  • REST: contacts · devices · sos lifecycle · location  │
      │  • Socket.IO: rooms per sos_id, snapshot-on-join        │
      │  • FCM sender (data-only) + delivery writeback          │
      │  • /healthz  ·  pino (redacted)  ·  rate limits         │
      └───────┬───────────────────────────────┬───────────────┘
              │ pg.Pool (max 5)               │ firebase-admin
              ▼                               ▼
        ┌──────────────┐              ┌────────────────────┐
        │ Neon Postgres│              │ Firebase Cloud     │
        │ (free tier)  │              │ Messaging (FCM)    │
        └──────────────┘              └────────────────────┘
```

**Rules of the road**
- The client never pushes location over a socket. The location task POSTs to REST; the server broadcasts. Only the viewer holds a socket.
- **Every authorized socket join emits `sos:snapshot` first** (§8). Render free tier closes sockets on instance swap and spins services down (§11) — a resumable stream is a requirement, not a nicety.
- The client is never trusted: `phone_verified_at`, `contact_id`, and session ownership are all derived server-side.
- `contactId` is **never** accepted from the client on `/respond`; it is derived from the SOS owner.

## 3. Repo layout

```
fellasafe/
  server/            # this plan
    src/
      app.ts         # express app factory
      server.ts      # http + socket.io bootstrap, graceful shutdown
      config/env.ts  # zod-validated env, fail fast at boot
      db/            # pg Pool, queries, migrations
      auth/          # clerk middleware, requireSessionAccess, phone gate
      routes/        # auth, devices, contacts, sos
      realtime/      # socket auth, rooms, fan-out
      notify/        # firebase-admin sender, delivery writeback
      lib/           # errors, e164, rate limits
    migrations/
    scripts/         # seed.ts, e2e.sh
    test/            # supertest + vitest
  documents/         # PRD.md, Plan.md (backend), Plan.mobile.md
```

`server/.env.example` is committed; `server/.env` is gitignored. Lint gate: `tsc --noEmit` + `eslint` + `prettier --check`.

## 4. Tech stack

| Layer | Choice | Version / note |
|-------|--------|----------------|
| Runtime | Node | **22 LTS** |
| Framework | Express | `^5.x` (current major) |
| Realtime | `socket.io` | `^4.8.3` (no Redis adapter — single instance) |
| Auth | `@clerk/express` + `@clerk/backend` | **`^2.1.25`+** — see below |
| DB client | **`pg` only** | `Pool`, `max: 5`. `@neondatabase/serverless` is **not** used (§11) |
| Validation | `zod` | request bodies **and** env |
| Rate limit | `express-rate-limit` | on `/sos*`, `/auth/sync`, `/contacts` |
| Logging | `pino` + `pino-http` | redact `authorization`, `fcm_token` |
| FCM | `firebase-admin` | service-account from env, `private_key` newline-repaired |
| Tests | `vitest` + `supertest` | against a Neon dev branch or local Postgres |
| Type | `typescript`, `tsx` | strict |

> **Clerk SDK specifics (verified Sep 2026).** Use `clerkMiddleware({ jwtKey: process.env.CLERK_JWT_KEY })` + `getAuth(req)`. Do **not** use `requireAuth()` — deprecated, and it *redirects*, which is the wrong shape for a JSON API. Pin `^2.1.25` or later: earlier versions trusted a foreign `req.auth` installed by another library, an authentication bypass (fixed Jun 2026). `jwtKey` verifies the JWT **networkless**, so no Clerk round-trip per request — material on a cold-starting free instance. Use `clerkClient.users.getUser()` from `@clerk/backend` only where §9 says to.

## 5. Build order

### Phase B0 — Infra & deploy (0.5 day)
- npm workspace, `server/` scaffold (Express 5 + Socket.IO + `pg.Pool`).
- `src/config/env.ts`: zod-validated env, **fail fast at boot**. Highest-value check is `FIREBASE_SERVICE_ACCOUNT` — its `private_key` arrives with literal `\n` and must be converted to real newlines, or `firebase-admin` init throws on Render while working locally.
- `GET /healthz` (no auth) — the keep-alive target. **Never point the pinger at `/robots.txt`**: Render answers that path itself while spun down, so it will not wake the service.
- Deploy to Render free tier, wire HTTPS/WSS. Clerk instance: Google OAuth + phone (`phone_code`). Neon project + connection string.
- Migrations run as a script, not on boot (single-instance free tier, no migration race).

### Phase B1 — Schema & data access (0.5 day)
- Full DDL from §6 as numbered migrations + a down path.
- `scripts/seed.ts`: inserts the two demo identities into `users` / `trusted_contacts`, parameterized by the real `clerk_user_id`s created in the manual pre-flight. Refuses to run unless `ALLOW_SEED=true` **and** `NODE_ENV !== 'production'`. Never expose seeding as an HTTP route.

### Phase B2 — Identity, gate, contacts (1 day)
- `POST /auth/sync` — the **only** writer of `users` (§9). Writes `phone_e164` + `phone_verified_at`, performs auto-link, returns the caller's linked-owner list.
- Server-side phone gate: `/sos`, `/contacts` writes, and device registration all require `phone_verified_at is not null` → else `403 PHONE_UNVERIFIED`.
- `POST /devices` (upsert on `fcm_token`), `GET|POST|PATCH|DELETE /contacts` (soft delete only), `GET /emergency-contacts` (inverse view).
- Tests: gate enforcement, auto-link scoping + idempotency, soft-delete preserves receipts.

### Phase B3 — SOS lifecycle REST (1 day)
- `POST /sos` (idempotent, one ACTIVE per user), `GET /sos/active`, `GET /sos/:id`, `POST /sos/:id/location` (stale-write guard), `POST /sos/:id/respond` (idempotent upsert), `POST /sos/:id/resolve` (status + purge in one transaction).
- `requireSessionAccess` guard used by every session-touching route; unauthorized access returns **404**, not 403.
- `GET /sos/:id` returns per-contact delivery state so the owner's "not reachable" placeholder is server truth, not a client guess.
- Tests: the 12 invariants in §12.

### Phase B4 — Socket.IO (1 day)
- Handshake auth from `auth.token` (never a query param — leaks into logs and proxies).
- `sos:join` → authorize via the same `requireSessionAccess` logic → join room → emit `sos:snapshot` to that socket only.
- Fan-out on every REST write, so REST and the stream cannot diverge.
- Revocation: on contact removal, `socketsLeave` the affected rooms.
- Graceful shutdown: `io.close()` + `server.close()` inside Render's SIGTERM window.

### Phase B5 — FCM (0.5 day)
- Data-only send to every `devices` row of `LINKED` contacts; write `last_notified_at` + `last_notify_result` back to the contact row.
- `UNREGISTERED` / `INVALID_ARGUMENT` on send → delete that device row, so dead tokens stop costing every SOS.
- Notifications on respond (owner) and resolve (contacts). Payload carries `sosId`, `userName`, `startedAt` — **never coordinates**.

### Phase B6 — Hardening & ops (0.5 day)
- Rate limits, one error envelope, pino redaction, CORS allow-list, `GET /healthz` + cold-start pre-flight step in the playbook.

### Phase B7 — Vertical slice (0.5 day)
- `scripts/e2e.sh`: full lifecycle over curl with no phone — create → location → socket join (snapshot) → respond → resolve → assert `sos_locations` is empty. This is the backend's own proof of correctness and the thing to run first on demo morning.

**Backend total ≈ 5 days.**

## 6. Data model

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  name text not null,
  phone_e164 text,
  phone_verified_at timestamptz,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_phone_e164_key on users (phone_e164) where phone_e164 is not null;

create table trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  phone_e164 text not null,
  relationship text,
  status text not null default 'PENDING' check (status in ('PENDING','LINKED','REMOVED')),
  linked_user_id uuid references users(id) on delete set null,
  last_notified_at timestamptz,
  last_notify_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, phone_e164)
);
create index trusted_contacts_link_lookup on trusted_contacts (phone_e164) where status <> 'REMOVED';
create index trusted_contacts_linked_user on trusted_contacts (linked_user_id) where status = 'LINKED';

create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  fcm_token text not null unique,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table sos_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RESOLVED')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_latitude float8,
  last_longitude float8,
  last_accuracy float8,
  last_speed float8,
  last_location_at timestamptz,
  battery_level int,
  check (ended_at is null or ended_at >= started_at)
);
create unique index sos_one_active_per_user on sos_sessions (user_id) where status = 'ACTIVE';
create index sos_sessions_user_recent on sos_sessions (user_id, started_at desc);

create table sos_locations (
  id bigserial primary key,
  sos_id uuid not null references sos_sessions(id) on delete cascade,
  latitude float8 not null check (latitude between -90 and 90),
  longitude float8 not null check (longitude between -180 and 180),
  accuracy float8,
  speed float8,
  heading float8,
  battery_level int,
  recorded_at timestamptz not null
);
create index sos_locations_sos_time on sos_locations (sos_id, recorded_at desc);
create index sos_locations_recorded_at on sos_locations (recorded_at);

create table sos_responses (
  id uuid primary key default gen_random_uuid(),
  sos_id uuid not null references sos_sessions(id) on delete cascade,
  contact_id uuid not null references trusted_contacts(id) on delete no action,
  status text not null default 'RESPONDING' check (status in ('RESPONDING','ARRIVED')),
  responded_at timestamptz not null default now(),
  unique (sos_id, contact_id)
);
```

**Deltas from the first draft, and why**
- `phone_e164` nullable + partial unique. A user exists from Google sign-in, before a phone exists — `phone not null` contradicted the auth flow. E.164 is the only form the auto-link match will ever succeed on (`+91 98765 43210` vs `919876543210`).
- `phone_verified_at` replaces `phone_verified boolean`. The old column defaulted false and nothing in the plan ever wrote it. The timestamp makes "verified at" auditable and un-writable by the client.
- `trusted_contacts_link_lookup` serves the actual hot query — "all rows across all owners matching *my* phone". `unique (user_id, phone_e164)` does not help it.
- `trusted_contacts` is **soft-deleted only**, enforced by `sos_responses.contact_id on delete no action`: a hard delete would erase the "Mom is responding" receipt from the user's own live SOS screen. `NO ACTION`, not `RESTRICT` — `RESTRICT` additionally fires on any `UPDATE` of the referenced row, which would block the soft-delete itself (`status='REMOVED'`, `linked_user_id=null`). Verified against a live database.
- `sos_one_active_per_user` makes duplicate ACTIVE sessions impossible at the database level. A double-tap or a retry after a slow network would otherwise produce two FCM blasts and an orphaned session whose locations are never purged.
- `recorded_at` is the **client-supplied** `ts`, not `now()`, so ordering is real data. `sos_locations` gained `speed`/`heading`/`battery_level` because the socket contract broadcasts them; previously they were accepted and discarded.
- `last_notified_at` / `last_notify_result` are the backing store for the "contact not reachable" placeholder.

**Retention.** On `RESOLVED`, `sos_locations` for that session is deleted inside the resolve transaction. Sessions retain only `last_*` (a few coordinates) — incidental, never a trail. A crashed SOS that never resolves would keep its trail forever, so each `POST /sos` also runs a bounded lazy sweep: `delete from sos_locations where recorded_at < now() - interval '2 hours'`. No cron required; index-backed; makes the "no permanent location history" claim true even in the failure case. Matches PRD §20.

## 7. REST contract

Error envelope for every non-2xx: `{ "error": { "code": "...", "message": "..." } }`.
Codes: `UNAUTHENTICATED`, `PHONE_UNVERIFIED`, `NOT_FOUND`, `SOS_NOT_ACTIVE`, `STALE_LOCATION`, `RATE_LIMITED`, `INTERNAL`.

```
GET    /healthz                        no auth — liveness + keep-alive target

POST   /auth/sync                      → { user, phoneVerified, linkedAs: [{ ownerName, ownerPhone, relationship }] }
POST   /devices                        { fcmToken, platform }   → { ok }   (upsert)

GET    /contacts                       → own contacts, newest first
POST   /contacts                       { name, phone, relationship? }
PATCH  /contacts/:id                   { name?, phone?, relationship? }  (phone change clears + re-evaluates the link)
DELETE /contacts/:id                   → soft: status=REMOVED, linked_user_id=null, sockets kicked
GET    /emergency-contacts             → [{ ownerName, ownerPhone, relationship, since, activeSosId }]

POST   /sos                            { battery? } → { sosId, startedAt, alreadyActive }
GET    /sos/active                     → { sosId, startedAt } | null      (app-restart recovery)
GET    /sos/:id                        → session + last location + battery + responses
                                        + contacts[{ name, phone, linked, deviceCount, lastNotifiedAt, lastNotifyResult }]
POST   /sos/:id/location               { lat, lng, accuracy?, speed?, heading?, battery?, ts }
                                        → { ok, lastLocationAt, stale? }
POST   /sos/:id/respond                (contact) → { ok, respondedAt }  (idempotent)
POST   /sos/:id/resolve                (owner)   → { ok, endedAt, alreadyResolved? }
```

**`POST /sos` — idempotent create**
```
require phone_verified_at
begin;
  select id, started_at from sos_sessions where user_id = $me and status = 'ACTIVE';
  -- found: commit; return { sosId, startedAt, alreadyActive: true }; do NOT re-send FCM
  -- else:  insert; commit; return { sosId, startedAt, alreadyActive: false }; run retention sweep; send FCM
```
The partial unique index is the backstop for the race between the select and the insert.

**`POST /sos/:id/location` — stale-write guard**
```
owner only; 404 unless the session is ACTIVE
if (ts <= last_location_at) return 200 { ok, lastLocationAt, stale: true }   -- no write, no broadcast
begin;
  insert into sos_locations (..., recorded_at = ts);
  update sos_sessions set last_* where id = :id and (last_location_at is null or last_location_at < ts);
commit;
io.to('sos:'+id).emit('sos:location', {...});
```
At a 5s cadence plus client retries, an unguarded write can overwrite a fresher point and visibly drag the marker backwards mid-demo. The client also drops any `sos:location` with `ts <= lastRenderedTs`.

**`POST /sos/:id/resolve` — one transaction**
```
owner only
begin;
  update sos_sessions set status='RESOLVED', ended_at=now() where id=:id and status='ACTIVE' returning *;
  -- 0 rows → already resolved: return 200 { alreadyResolved: true } with the existing endedAt
  delete from sos_locations where sos_id = :id;
commit;
emit sos:resolved; FCM SOS_RESOLVED to notified contacts
```

**`POST /sos/:id/respond` — derived, idempotent**
```
find the caller's trusted_contacts row owned by the SOS owner:
  join sos_sessions s on s.user_id = tc.user_id
  where s.id = :id and tc.linked_user_id = $me and tc.status = 'LINKED'
insert into sos_responses (sos_id, contact_id) values (...)
  on conflict (sos_id, contact_id) do update set responded_at = now();
emit sos:response; FCM to the owner's devices
```

## 8. Socket.IO contract

Handshake: `auth: { token: <clerk session jwt> }`. Verified with `jwtKey`; failure closes the socket. The handshake resolves `clerkUserId → userId` once, so per-event authz is a DB lookup, not a token re-verify.

Client → server
- `sos:join { sosId }` — authorize, join `sos:<id>`, emit snapshot to that socket. The client re-emits this on **every** `connect`; the server treats every join as a cold start.

Server → client (room-scoped deltas)
- `sos:snapshot { id, status, startedAt, endedAt, lastLocation: { lat, lng, accuracy, speed, ts } | null, batteryLevel, responses }` — **always first, on every join**
- `sos:location { lat, lng, accuracy, speed, heading, battery, ts }`
- `sos:status { status }`
- `sos:response { contactName, action, respondedAt }`
- `sos:resolved { sosId, endedAt }`

The server forwards `speed`/`heading` and never fabricates a `moved` flag — moving-state is derived client-side from the last two points, so the server cannot be wrong about it.

**Why snapshot-on-join is mandatory.** Render's free tier closes WebSocket connections during routine instance replacement and platform maintenance, not only on deploy, and imposes no connection duration cap. Without a snapshot, any blip leaves the map blank until the next 5s write — or permanently if the stream is dead. The snapshot makes the stream stateless on the client and turns reconnect from a bug into a non-event. Socket.IO's default heartbeat also counts as inbound WebSocket traffic, which keeps a connected contact from tripping the 15-minute idle spin-down.

## 9. AuthN / AuthZ

1. **Google OAuth** → Clerk user exists. No local row yet.
2. **`POST /auth/sync`** — called on every authenticated launch, and the *only* writer of `users`:
   ```
   clerkUser = await clerkClient.users.getUser(clerkUserId)
   primary   = clerkUser.phoneNumbers.find(p => p.id === clerkUser.primaryPhoneNumberId)
   verified  = primary?.verification?.status === 'verified'
   e164      = verified ? toE164(primary.phoneNumber, defaultCountry) : null
   upsert users set name, email, phone_e164 = e164, phone_verified_at = verified ? now() : null
   if verified → run auto-link
   ```
   Clerk session JWTs do not carry phone-verification status, so this Backend API call is how the server learns it. (Alternative, if the per-launch call is unacceptable: a Clerk custom claim and re-check per request. Verify at implementation; the column is the cache either way.)

   **`toE164` is a normaliser, not a numbering-plan validator.** It strips formatting, understands `+`, `00`, and a national trunk prefix, and rejects anything outside a 10–15 digit E.164 length envelope. It does **not** know whether `+1 987 654 321` is a real NANP number, and full validation would mean taking on `libphonenumber` plus per-country metadata. That is deliberately out of scope, because the two call sites have different assurance:
   - **Phone A (the user's own number)** never trusts the normaliser for correctness — it comes from Clerk as an already-verified number, and `phone_verified_at` is the gate. Normalisation only has to be *consistent*, so the auto-link match is exact.
   - **Contact numbers** are best-effort. A typo'd contact number that passes the length check is a real residual risk: that contact silently never receives an SOS alert. Mitigated by the send-time result capture on `trusted_contacts.last_notify_result`, so a permanently failing number is visible rather than invisible. If the product later needs hard validation at entry, `libphonenumber-js` is the drop-in.
3. **Server-side gate.** Every identity-dependent write requires `phone_verified_at is not null` → `403 PHONE_UNVERIFIED`. The in-app gate from the mobile plan is a UX affordance; this is the enforcement. A client that skips the gate gets nothing.
4. **Auto-link** (only when the incoming phone is verified, and the matching owner row is itself verified):
   ```sql
   update trusted_contacts
      set linked_user_id = $me, status = 'LINKED', updated_at = now()
    where phone_e164 = $myE164
      and status <> 'REMOVED'
      and linked_user_id is null
      and user_id <> $me
    returning *;
   ```
   Idempotent by construction (the `linked_user_id is null` predicate). One phone may legitimately link to several owners. If a sync fails, the client keeps its last known state; SOS stays gated until a sync succeeds.
5. **`requireSessionAccess(userId, sosId)`** — one guard, used by `GET /sos/:id`, `/location`, `/respond`, `/resolve`, and `sos:join`:
   owner of the session, **or** `trusted_contacts.linked_user_id = caller AND status = 'LINKED' AND tc.user_id = session.user_id`. Anything else → `404`, never `403` (403 confirms the session exists).
6. **Revocation is immediate.** `DELETE /contacts/:id` soft-deletes, nulls the link, and `socketsLeave` the removed contact's sockets. The FCM fan-out query filters on `status = 'LINKED'` at send time, so a revoked contact never receives the next alert.
7. **Consent posture.** Auto-link is a consent bypass by design (D1). The server compensates: verification-gated on both sides, scoped to the specific owner, instantly revocable, and `/auth/sync` is rate-limited so it cannot serve as a phone-enumeration oracle. Real contact-level approval is a v2 item (§15).

## 10. FCM pipeline

- `firebase-admin` initialised from `FIREBASE_SERVICE_ACCOUNT` with the `private_key` newline repair (§5 B0).
- Fan-out: `select d.fcm_token, d.id from devices d join trusted_contacts tc on tc.linked_user_id = d.user_id where tc.user_id = $owner and tc.status = 'LINKED'`.
- Data-only payload: `{ sosId, userName, startedAt, type: 'SOS' | 'SOS_RESOLVED' | 'RESPONSE' }`. **No coordinates in the push** — the contact's device fetches those over the authenticated socket.
- Writeback per contact: `last_notified_at = now()`, `last_notify_result = 'DELIVERED' | 'NO_DEVICE' | 'FAILED'`. A contact with no device rows is `NO_DEVICE`, which is what makes the owner's "not reachable" placeholder honest.
- Prune dead tokens on `UNREGISTERED` / `INVALID_ARGUMENT`.
- `startedAt` rides along so a client that wakes from a delayed push can discard a stale alert instead of opening a resolved session.

## 11. Infra & operations

**Render free tier (verified Sep 2026).** Spins down after 15 minutes without inbound traffic — inbound **HTTP requests and WebSocket messages both count**. Spin-up takes about a minute, and clients connecting during it can fail rather than wait. 750 instance-hours are granted per workspace per month; an always-on free service consumes essentially all of them. Instances are swapped on deploy *and* during routine platform maintenance, with a SIGTERM shutdown window (30s, configurable to 300s).

Consequences, all designed for above:
- `GET /healthz` exists and is the only ping target. A `cron-job.org` job every 10 min keeps it warm; **disable it after the demo** or it eats the monthly pool.
- Location POSTs every 5s during a live SOS already prevent spin-down, so cold start only threatens the *first* request. Pre-flight: `curl /healthz` ~60s before presenting.
- Sockets are assumed to die. Snapshot-on-join (§8) is the mitigation; `io.close()` inside the shutdown window makes it a clean close rather than a silent drop.
- `socket.io` with a single instance needs no adapter. Keep it that way until there is a second instance.

**Neon free tier.** `pg.Pool` with `max: 5` against the pooled connection string. `@neondatabase/serverless` is deliberately dropped: Neon speaks the standard Postgres wire protocol, so one client stack is enough, and the resolve path (status + purge) wants a real transaction. Compute auto-suspend is covered by the same traffic that covers Render.

**Configuration.** All secrets in Render env vars, never in the repo: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_JWT_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `DEFAULT_CALLING_CODE`, `NODE_ENV`. Zod-validated at boot so a missing value fails at deploy, not mid-demo.

> **`CLERK_PUBLISHABLE_KEY` is required, not optional.** It is not a secret — it ships in client code by design — but the server still needs it. `clerkMiddleware` uses it to resolve this instance's frontend API, which is the origin of the authorised parties that `CLERK_JWT_KEY` is validated against. Omitting it does **not** degrade to a rejected token: Clerk throws while constructing the middleware, so every authenticated route answers `500` with `Publishable key is missing`. Keeping it in the Zod schema turns that into a boot-time failure with a named field, which is the entire point of validating config at startup. Found the hard way — verified by starting the server and probing the route.

## 12. Testing

**Invariants (supertest, against a Neon dev branch or local Postgres).** Each maps to a security claim in §13:

1. Google-only user (`phone_verified_at` null) → `POST /sos` = `403 PHONE_UNVERIFIED`.
2. Contact cannot `GET` a session they are not linked to → `404`.
3. Contact linked to owner B cannot read or join owner A's session → `404` / socket rejected.
4. Non-owner cannot resolve → `404`.
5. Resolve leaves zero rows in `sos_locations` for that session.
6. A location with `ts` older than `last_location_at` does not overwrite it and returns `stale: true`.
7. Two `POST /sos` calls return the same `sosId`, the second with `alreadyActive: true`, and FCM fires exactly once.
8. Double `POST /respond` is idempotent and returns one receipt.
9. Re-registering an existing `fcm_token` does not error.
10. `DELETE /contacts/:id` soft-deletes and leaves the `sos_responses` receipt intact.
11. An authorized `sos:join` emits `sos:snapshot` with the last location before any delta.
12. Auto-link only fires for verified phones, never self-links, and re-syncing does not duplicate the link.

Plus: rate limits return `429 RATE_LIMITED`; error envelope shape holds on every failure path.

**Vertical slice.** `scripts/e2e.sh` drives create → location → join → respond → resolve over curl with no phone, and asserts the purge. Run it first on demo morning.

**Definition of done (backend).** All 12 invariants green · `tsc --noEmit`, `eslint`, `prettier --check` clean · e2e script passes against the deployed Render instance · no `sos_locations` rows older than 2h on Neon.

## 13. Security checklist

- `clerkMiddleware({ jwtKey })` on every route except `/healthz`; networkless verification.
- `requireSessionAccess` is the single path to session data — no route reads a session without it.
- Unauthorized session access returns `404`, not `403`.
- `contactId` is never client-supplied; derived from the session owner.
- `phone_verified_at` gate on every identity-dependent write; only `/auth/sync` may write it.
- Rate limits on `/sos*`, `/auth/sync`, `/contacts` write.
- Parameterized queries only; no string interpolation into SQL.
- FCM payload carries `sosId`, name, `startedAt` — never coordinates.
- `fcm_token` is never returned by any endpoint; pino redacts it and `authorization`.
- HTTPS/WSS via Render. CORS allow-list is set — noted as **not** an authz control (React Native's `fetch` is not CORS-constrained; the allow-list exists for a future web target).
- Secrets in env only, zod-validated at boot, `.env` gitignored and never committed.

## 14. Open risks

1. **Render spin-down / cold start** — ~1 min spin-up, clients can fail rather than wait. Mitigated by `/healthz` + cron ping + a pre-flight warm-up; accept the residual risk in the playbook.
2. **Instance swap drops sockets mid-demo** — mitigated by snapshot-on-join and graceful shutdown. Residual: a visible reconnect, not a broken map.
3. **`/auth/sync` depends on the Clerk Backend API** — a Clerk outage blocks identity sync and therefore SOS creation. Cache last-known state on the client; retry; do not cache the JWT.
4. **Clerk OTP SMS free-tier quota** during dev — throttle resends, use dev-instance settings.
5. **FCM data delivery when the app is force-stopped (Android 13+)** — not fully solvable; notification tap-through is the documented graceful degradation.
6. **Neon free-tier storage** — neutralized by resolve-purge plus the 2h lazy sweep.
7. **Auto-link is a consent bypass** — scoped, revocable, rate-limited, but a contact learns they are someone's emergency contact without asking. Real consent is v2.
8. **Demo data is real PII** — the seed script writes the two demo identities only, and is refused outside non-production.

## 15. Out of scope (backend)

Telephony, AI threat detection, nearby-responder network, iOS, police integration, wearables. Also excluded: multi-session guard, contact-level consent UI, SMS fallback, verifiable receipts, Redis adapter / horizontal scaling, per-tenant sharding, PITR beyond Neon's free tier. Design note: nothing in §6 blocks contact-level privacy approval later — it is a status field plus a gate on the auto-link query.

---

**Next action:** Phase B0 + B1 — server scaffold, env validation, `/healthz`, Render deploy, then the §6 migrations. B7 (`e2e.sh`) is the backend's own go/no-go before any mobile work starts.
