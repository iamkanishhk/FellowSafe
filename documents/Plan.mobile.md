# FellowSafe — Implementation Plan

Source: `documents/PRD.md` + product-interview decisions (locked before any design work).

---

## 0. Locked decisions (from interview)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Contact alert delivery | **Same app.** Contacts sign in too; matched to `trusted_contacts` rows by verified phone + name. No invite/accept flow (auto-link). |
| D2 | Demo phones | Both Phone A (user) and Phone B (contact) run **the same React Native app**. |
| D3 | Locked-phone emergency UI | **Native helper via an Expo config plugin** (small Android module: full-screen intent + FCM data-message handling). Not just a tap-to-open notification. |
| D4 | Auth | **Google first, then MANDATORY phone + OTP verification** (not skippable) — same for both roles. |
| D5 | Realtime split | REST owns CRUD + SOS lifecycle. **Socket.IO owns the live stream** (rooms per `sos_id`). FCM is the *wake-the-app* trigger only. |
| D7 | Location cadence / retention | 5s while ACTIVE, battery-aware (deferred distance/time when idle). **Purge `sos_locations` on RESOLVED.** |
| D8 | Hosting | Free tiers only (Neon Postgres, Render/Railway for Node). |
| D9 | Maps | `react-native-maps` (Google provider) on Android. |
| D10 | Quality bar | Build-ready MVP, clean extendable architecture (not throwaway demo code). Scope-cut only if the timeline collapses to a 24h sprint. |

## 1. ASSUMPTIONS (not explicitly confirmed — flagged)

1. **Timeline** unknown → target ~1–2 weeks (build-ready MVP). If it becomes a true 24h sprint, cut to: auth → one-way SOS + notification + web-app emergency screen, defer Socket.IO live stream and native full-screen intent.
2. **Code quality counts** alongside the live demo.
3. All trusted contacts must **install the app** and sign up; contacts who never install simply never receive alerts (handled gracefully, silent skip).
4. Hold-to-SOS defaults: **~1s hold + 3s countdown** (trivial to tune later).
5. `relationship` field on `trusted_contacts` is captured optionally in the add-contact UI.
6. State management on mobile = **Zustand** (lightweight, no boilerplate). Swap freely; not architectural.
7. Node host = **Render free tier** (Web Service); mitigated against the 15-min sleep with a `cron-job.org` ping every 10 min. Railway acceptable alternative.
8. Clerk OTP SMS for the contact role is acceptable even though contacts are "strangers" to Google — phone OTP is the identity anchor.
9. Two demo seeds: Phone A = user `Priya`, Phone B = contact `Mom` (+91 numbers). Pre-provisioned in the Demo Checklist.

## 2. Architecture

```
┌─────────────────────────────┐          ┌─────────────────────────────┐
│  Phone A — User role        │          │  Phone B — Contact role     │
│  Single Expo app (SDK 57)   │          │  Single Expo app (SDK 57)   │
│  Clerk: Google → phone OTP  │          │  Clerk: Google → phone OTP  │
│                             │          │                             │
│  Hold SOS button            │          │  Receives FCM data msg      │
│  Foreground service:        │          │  Native full-screen alert   │
│    expo-location task 5s    │          │  (locked-screen usable)     │
│  POST /sos/:id/location     │          │  Socket.IO room join        │
│  Listens sos:response       │          │  Live map via Socket.IO     │
└──────────────┬──────────────┘          └──────────────┬──────────────┘
               │ REST (HTTPS)                REST │ Socket.IO (WSS)
               ▼                                 ▼
        ┌───────────────────────────────────────────────┐
        │  Node.js (Express)  —  Render free tier         │
        │  • Clerk JWT verification (all routes+sockets)  │
        │  • REST: contacts, sos lifecycle, location      │
        │  • Socket.IO rooms per sos_id (live stream)     │
        │  • FCM sender (data-only messages)              │
        └───────────────┬────────────────────────────────┘
                        │ @neondatabase/serverless
                        ▼
                ┌─────────────────┐     ┌───────────────────┐
                │ Neon Postgres   │     │ Firebase Cloud    │
                │ (free tier)     │     │ Messaging         │
                └─────────────────┘     └───────────────────┘
```

**Rules of the road**
- FCM delivers **data-only** messages → expo-notifications headless background task (via `expo-task-manager`) fires in background/terminated state; JS decides to show the native full-screen alert.
- Location updates NEVER go over Socket.IO from the user's phone (socket dies if the app is backgrounded). The location **task** POSTs to REST; the **server** broadcasts to the room. This uses the messaging channel (reliable in background) and only the viewer (contact) keeps a socket open.
- Emergency screen on the contact side: FCM data message → headless task → native full-screen intent + high-priority notification → deep link (`/sos/[id]`) → contact opens app → socket join → live map.

## 3. Repo layout (monorepo)

```
fellasafe/
  mobile/          # Expo app (TypeScript, Expo Router)
  server/          # Node.js + Express + Socket.IO
  README.md
  documents/       # PRD.md, Plan.md, SCHEMA.md (optional)
```

Tooling: npm workspaces (mobile + server), single `.env` story via `.env.*` per package, `eslint` + `prettier` + `tsc --noEmit` in both.

## 4. Tech stack & versions (verified Sep 2026)

| Layer | Choice | Version |
|-------|--------|---------|
| Mobile framework | Expo (dev build) | **SDK 57** (`expo@^57.0.18`), RN 0.86.x, React 19.2.x |
| Navigation | Expo Router | bundled with SDK 57 template (file-based) |
| Auth | Clerk | `@clerk/expo@^4.6.5` + `@clerk/expo-google-signin` (native Google Sign-In moved to the separate package; add its config plugin) |
| Maps | `react-native-maps` | `^1.29.0` (Fabric/new-arch OK, needs RN ≥0.81.1) |
| Location | `expo-location` | install via `npx expo install` (auto-pinned to SDK 57), config plugin `isAndroidBackgroundLocationEnabled` + `androidForegroundServiceIcon` |
| Background tasks | `expo-task-manager` | auto-pinned to SDK 57 |
| Push | `expo-notifications` (FCM) | auto-pinned to SDK 57; needs dev build, not Expo Go |
| Realtime (client) | `socket.io-client` | `^4.8.3` |
| State (mobile) | `zustand` | latest |
| Server | Express | **^5.x** (current major) |
| Realtime (server) | `socket.io` | `^4.8.3` |
| Auth verify (server) | `@clerk/backend` (or `@clerk/express`) | latest |
| DB client | `@neondatabase/serverless` + `pg` | latest |
| Validation | `zod` | latest |
| Runtime | Node **22 LTS** (`>= 20.19.4` required by RN 0.86) | |

> Pin exact patch versions at `npm install` time via the project's lockfile; Expo pins its own packages. Do **not** hand-pin Expo SDK package versions — runtime `npx expo install` alignment.
>
> Static config plugin additions (all three are typed/stable in SDK 57):
> - `@clerk/expo`, `@clerk/expo-google-signin`
> - `react-native-maps` (`androidGoogleMapsApiKey`)
> - `expo-notifications`
> - `expo-location`
> - **custom** `fellasafe-emergency` plugin (full-screen intent + FCM data handling) — built by us.

## 5. Build order — test the bomb first

Rationale: the two risks that can sink the hackathon demo are (1) the locked-phone full-screen alert and (2) background location. Everything else is commodity CRUD. Do the scary native paths first, while there is time to fall back to the notification-only variant.

### Phase 0 — Bootstrap & infrastructure (0.5 day)
- Scaffold Expo SDK 57 TS app (`npx create-expo-app`), dev build via EAS (`eas build --profile development --platform android`).
- Scaffold `server/` (Express 5 + Socket.IO + Neon), deploy to Render free tier, wire HTTPS/WSS.
- Create Clerk app + instances: enable Google OAuth + phone number (`phone_code`) strategy; set phone verification as an **after-first-sign-in requirement** (gate in-app, see §8).
- Neon project + initial schema (below).

### Phase 1 — Native spike: locked-phone emergency alert (1–1.5 days) ⚠️
- Custom config plugin `fellasafe-emergency`:
  - AndroidManifest: `USE_FULL_SCREEN_INTENT`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE_LOCATION`, `RECEIVE_BOOT_COMPLETED`.
  - Native module exposing a tiny API: `presentEmergency({sosId, userName, notificationTitle, body})` → builds an **Android full-screen intent** to the full-screen emergency Activity + posts a high-priority notification (sound+vibration) as visible fallback.
  - A `FullScreenIntentActivity` (launches the RN JS via the dev-launcher/managed activity with an `extra.sosId`).
- Verify manually: **send a test FCM data message to Phone B while app is terminated + screen locked** → confetti = alert appears. Try on the actual demo phones (OEM variability). If unusable, **fall back (D3)**: high-priority notification → tap → emergency screen. Record the result in `documents/PLAYBOOK.md`.

### Phase 2 — Auth + users + contacts (1.5 days)
- Clerk sign-in/sign-up flows (custom, not `<ClerkProvider>` default UI): Google OAuth, then mandatory phone verification gate.
- Server: `POST /auth/sync` (upsert local user from Clerk session), `POST /devices` (FCM token register).
- Contacts CRUD (name, phone, relationship) + **auto-link**: on `POST /auth/sync`, if `users.phone` matches a `trusted_contacts.phone` row → link `linked_user_id`, status `LINKED`. Contact side sees "You're an emergency contact for Priya" (opt-out sets `REMOVED`).
- Permissions onboarding flow (location, notifications) on first launch.

### Phase 3 — SOS session + REST + Socket.IO (1.5 days)
- `POST /sos` (create ACTIVE session, remember user + battery), `GET /sos/:id`, `POST /sos/:id/location`, `POST /sos/:id/respond`, `POST /sos/:id/resolve`, `GET /contacts` (existing/added).
- All routes validated with Zod + Clerk JWT middleware; row access confined to owner/authorized contacts.
- Socket.IO: auth via JWT in handshake; rooms keyed by `sos:<id>`; only *linked contacts* + the owner may join. Server → room events: `sos:location`, `sos:status`, `sos:response`, `sos:resolved`.
- **Cron/sweep**: resolve sessions older than N minutes only in v2 (not required for MVP; single-session demo).

### Phase 4 — Location service (1 day)
- `expo-location` foreground service via `TaskManager.defineTask`:
  - start on SOS activation, stop on resolve.
  - accuracy `High` during movement, `Balanced` when stationary (deferred-time also acceptable) to honor battery-aware 5s cadence.
  - Task posts `POST /sos/:id/location` (batch 1-update) with lat/lng/accuracy/ts/battery/speed.
- Android 14+: `FOREGROUND_SERVICE_LOCATION` manifest entry + persistent service notification via config plugin.

### Phase 5 — FCM server-side + alert pipeline (1 day)
- Server FCM sender using `firebase-admin` (service-account key): data-only message to all `devices` rows of linked contacts.
- Client: `expo-notifications` headless background notification task (`TaskManager.defineTask('REMOTE_NOTIFICATION')`) → on SOS data → call native `presentEmergency` + store pending `sosId` → deep link into `/sos/[id]`.
- High-priority notification channel (sound + vibration + black high-priority semantics).

### Phase 6 — Emergency screens + live map (1–1.5 days)
- `app/(app)/sos/[id].tsx`: live map (`react-native-maps` Google provider), name, status, last-update age, battery, moving-state, response chips. Google Maps API key restricted to Android package + demo volume.
- `I'm Responding` → `POST /sos/:id/respond` → server broadcasts `sos:response` → user's app (foreground/headless) shows in-app + FCM "Mom is responding ✓".
- `I'm Safe` → confirm modal (KEEP ACTIVE / YES I'M SAFE) → `POST /sos/:id/resolve` → stop trust service, purge locations, broadcast `sos:resolved`, FCM to contacts.

### Phase 7 — Polish, hardening, demo playbook (0.5–1 day)
- Empty states, error/slow-network toasts, retry-idempotency on location POST (sosId already known).
- Battery + moving-state synthesis on contact screen.
- `documents/PLAYBOOK.md`: exact demo script, pre-flight checklist (two accounts, notifications granted, location granted), failed-path fallbacks.
- End-to-end run-through, at least 2 full SOS cycles on the real phones, locked screen on Phone B.

## 6. Data model (DDL sketch)

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  name text not null,
  phone text not null,
  phone_verified boolean not null default false,
  email text,
  created_at timestamptz not null default now()
);

create table trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  phone text not null,
  relationship text,
  status text not null default 'PENDING',  -- PENDING | LINKED | REMOVED
  linked_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, phone)
);

create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  fcm_token text not null unique,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);

create table sos_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'ACTIVE',      -- ACTIVE | RESOLVED
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_latitude float8,
  last_longitude float8,
  last_location_at timestamptz,
  battery_level int
);

create table sos_locations (
  id bigserial primary key,
  sos_id uuid not null references sos_sessions(id) on delete cascade,
  latitude float8 not null,
  longitude float8 not null,
  accuracy float8,
  recorded_at timestamptz not null default now()
);
create index on sos_locations (sos_id, recorded_at);

create table sos_responses (
  id uuid primary key default gen_random_uuid(),
  sos_id uuid not null references sos_sessions(id) on delete cascade,
  contact_id uuid not null references trusted_contacts(id) on delete cascade,
  status text not null default 'RESPONDING',
  responded_at timestamptz not null default now(),
  unique (sos_id, contact_id)
);
```

**Retention:** on `RESOLVED` → `delete from sos_locations where sos_id = :id`. Sessions keep only `last_location` (a few coordinates) — incidental, never a history trail. Matches PRD §17 security ("Don't permanently retain detailed location history").

## 7. API & socket contract

### REST
```
POST   /auth/sync                     upsert local user from Clerk session
GET    /contacts
POST   /contacts                      { name, phone, relationship? }
PATCH  /contacts/:id
DELETE /contacts/:id
POST   /devices                       { fcm_token, platform }

POST   /sos                           → { sosId }
GET    /sos/:id                       → session + latest location + battery
POST   /sos/:id/location              { lat, lng, accuracy?, battery?, speed?, ts }
POST   /sos/:id/respond               (contact) → marks response
POST   /sos/:id/resolve               (owner)   → RESOLVED + cleanup
```

### Socket.IO (WSS, JWT in handshake)
- `socket.join('sos:' + sosId)` — server authorizes: owner, or linked contact of owner.
- Server → clients (room scoped):
  - `sos:location  { lat, lng, accuracy, battery, speed, moved, ts }`
  - `sos:status    { status: 'ACTIVE' | 'RESOLVED' }`
  - `sos:response  { contactName, action: 'RESPONDING' }`
  - `sos:resolved  { sosId, endedAt }`

**Idempotency/retry:** location POST is keyed by `sos_id` only; client simply re-sends latest point every 5s (server overwrites `last_location`). No ordering complexity at MVP scale.

## 8. Auth flow detail (both roles identical)

1. **Google OAuth** → creates Clerk user.
2. **Gate:** app blocks home until phone verified.
   - Verify phone: Clerk `phone_code` strategy (OTP to device) — `user.phoneVerified` must be `true` before proceeding. **Hard requirement, no skip.**
3. `POST /auth/sync` on every authenticated launch (refresh local user + upsert safe fields).
4. Auto-link (D1): if the new verified phone matches a `trusted_contacts.phone`, link and notify "You're an emergency contact for <name>".
5. `POST /devices` to register FCM token; refresh after reinstall.

## 9. Notifications & full-screen intent pipeline (Phone B)

1. User presses SOS → server `POST /sos` → server fetches linked-contact `devices.fcm_token` rows → sends **data-only** FCM message (`{sosId, userName, type:'SOS', priority:'high'}`).
2. FCM delivers even when app is **terminated** (Android data-only messages → onMessage/Headless task) — the headless `TaskManager` notification task runs JS.
3. Headless task → `presentEmergency(...)` (native helper) → **full-screen Activity** + high-priority notification with sound/vibration.
4. Accept deliberate trade-off: if `USE_FULL_SCREEN_INTENT` is denied by the user at OS level (Android 14+ allows limiting full-screen intents), the high-priority notification remains the path. OS may also throttle force-stopped-app data delivery; fallback UX is the notification itself. **This fallback is documented, not a bug.**

## 10. Testing & definition of done (v1)

- **DoD:** a full two-phone SOS cycle works twice in a row with Phone B **locked and app terminated**, and locations keep updating while Phone A is backgrounded/locked.
- Manual test matrix (scripted, in `documents/PLAYBOOK.md`):
  1. Hold SOS → countdown → ACTIVE.
  2. Phone B locked → full-screen alert (or documented fallback).
  3. Live map move ~10m → marker updates ≤ 5–6s.
  4. "I'm Responding" → Phone A sees "Mom is responding ✓".
  5. "I'm Safe" → confirm → Phone B gets RESOLVED; locations purged.
  6. Negative: contact not signed up → owner gets "contact not reachable" placeholder, app stays stable.
  7. Auth: Google-only signup without phone → gated at home screen.
- `tsc --noEmit` and `eslint` green in `mobile/` and `server/`.
- No location rows remain after resolve (verify via `psql` on Neon).

## 11. Security checklist (from PRD §20)

- Clerk JWT middleware on **every** REST route and Socket.IO handshake.
- Row-level: owner can only read own contacts/sessions; contacts only read SOS they're linked to; locations only in the session they were alerted for.
- Never expose public location queries. Emergency data always gated.
- HTTPS/WSS enforced by Render fronting; strong CORS origin allow-list.
- FCM tokens as secrets-in-DB (never exposed to other users) + `firebase-admin` key in server env only.
- Data-only FCM carries just `sosId` + name — no coordinates in the push (privacy).
- `.env` files never committed; `.easignore` mirrors `.gitignore` but **keeps** `.env` so EAS can inject secrets.

## 12. Open risks (acknowledged, tracked)

1. **Full-screen intent on locked phones varies by OEM** — de-risk in Phase 1, on the real demo devices, before anything else.
2. **FCM data delivery when force-stopped/Android 13+** — not fully solvable; planned graceful degradation (notification + tap-through).
3. **Background location on locked screen + battery** — handled via expo-location foreground service; must run on real device before demo; battery-aware cadence.
4. **Clerk OTP SMS free-tier quota** during dev — throttle OTP resends; use dev-instance settings.
5. **Neon free-tier storage** — neutralized by location purge + low row counts.
6. **Render free tier sleep** — 10-min cron ping; restart doc in playbook (worst case ~50s cold start).
7. **Network at demo venue** — both phones must reach the WSS endpoint; test hotspot/venue Wi-Fi during pre-flight.
8. **Clerk/Google on second phone** — ensure Phone B uses a DIFFERENT clerk account than Phone A (auto-link correctness).

## 13. Explicitly out of v1 (do not touch)

Telephony infra, nearby-stranger responder network, AI threat detection, social network, iOS, police/emergency integration, wearables, Safe Trip. V2 watch-list (design so nothing now blocks them): contact-level privacy approval, SMS fallback, multi-session guard, session verifiable receipts, battery-only shares.

---

**Next action:** Phase 0 + Phase 1 spike (native full-screen intent verification on the two target phones) before any feature scaffolding past auth.