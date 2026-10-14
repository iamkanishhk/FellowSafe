# FellowSafe — Live Location Sharing Implementation Plan

**Scope:** while an SOS is **ACTIVE and the victim is online**, stream the victim's
GPS to their trusted contacts in real time, and render it as a **live map on the
contact's lock-screen alert** (the full-screen takeover that appears on the
locked phone).

> Supersedes the previous offline-only plan in this file (`git show HEAD:documents/Plan.md`).
> The offline sender (SMS fallback) is a separate, already-implemented slice and is
> **not** re-opened here — see §10 for the boundary. Product decisions D1–D10 in
> `documents/Plan.mobile.md` and the PRD (`documents/PRD.md` §16–§20) still hold.

---

## 0. What exists today vs. what this adds

The schema was designed for this from the start, but the streaming path was never
built. Concretely, in the current tree:

| Piece | Today | This plan |
|-------|-------|-----------|
| `sos_locations` table | exists — `server/migrations/001_init.sql:62` | used |
| `sos_sessions.last_*` columns | exist — `server/migrations/001_init.sql:51` | kept in sync |
| `POST /sos/:id/location` | **missing** — `server/src/routes/sos.ts` has only `POST /sos`, `GET /sos/active`, `/respond`, `/resolve` | **add** |
| `GET /sos/:id` | **missing** (listed in PRD §17) | **add** (cold start + poll fallback) |
| Socket.IO live stream | **stub** — `server/src/server.ts:11` disconnects every connection | **add** (auth + rooms + broadcast) |
| Mobile location task | **missing** — `expo-location` is installed but nothing posts pings | **add** (§4.1) |
| Map on lock-screen alert | **missing** — `mobile/src/app/incoming-alert.tsx` is text + two buttons | **add** (§4.3) |
| Socket.IO client | **missing** (`socket.io` on the server only) | **add** (§4.2) |
| Map library | not in `mobile/package.json` | **add** `react-native-maps` (D9) |

**No migration is required.** `sos_locations` already has `latitude, longitude,
accuracy, speed, heading, battery_level, recorded_at`, and
`sos_locations_sos_time (sos_id, recorded_at desc)` is the index the "latest
point" read needs. `resolveSosSession` already purges rows
(`server/src/repos/sos.ts:121`) and `sweepStaleLocations` already prunes >2h
(`:133`).

## 1. Locked decisions (this slice)

| # | Decision | Choice |
|---|----------|--------|
| L1 | Transport split | REST **ingests** location (victim), **Socket.IO streams** it (contact), **FCM only wakes** the contact. Matches D5. |
| L2 | Sender cadence | ~**5s** or ≥**5m** moved, whichever is later; accuracy `High`. Battery-aware, stop on resolve (D7). |
| L3 | "Lock-screen" surface | the contact's full-screen takeover `mobile/src/app/incoming-alert.tsx` (call-style, opts in via `plugins/withFullScreenIntent.js`) — **this is the "lockscreen screen" that gets the live map**. Not `alarm.tsx` (victim) or `respond.tsx` (contact detail) |
| L4 | Coords in push | **never** — FCM carries `{ type:'SOS', sosId, userName, startedAt }` only; location is pulled over REST/socket |
| L5 | Wake path | FCM data-only → `background-alerts.ts` full-screen intent → `incoming-alert.tsx` |
| L6 | Offline pings | queue the newest fix and flush on reconnect; never lose the last known point |

## 1.1 Product decisions to reuse (from `Plan.mobile.md`)
- **D5:** REST owns CRUD + SOS lifecycle. Socket.IO owns the live stream (rooms per
  `sos_id`). FCM is the wake-the-app trigger only.
- **D7:** ~5s cadence while ACTIVE, battery-aware; purge `sos_locations` on RESOLVED.
- **D9:** `react-native-maps` (Google provider) on Android.

## 2. Architecture

```
Victim (online, ACTIVE)                     Contact (locked → full-screen takeover)
┌──────────────────────────┐               ┌────────────────────────────────────────┐
│ expo-location task ~5s   │               │ FCM data-only {type:'SOS', sosId}       │
│  POST /sos/:id/location  │──┐            │  → notifee full-screen intent           │
│  (REST; survives bg)     │  │            │  → incoming-alert.tsx                    │
│  offline → queue+flush   │  │            │  socket.emit join room sos:<id>          │
└──────────────────────────┘  │            │  ← sos:location → map marker + accuracy  │
                              ▼            └────────────────────────────────────────┘
                    ┌───────────────────────┐
                    │ Express + Socket.IO   │
                    │  insert sos_locations │
                    │  update last_*        │
                    │  emit to room sos:<id>│
                    └───────────────────────┘
```

Flow: victim posts → server persists + updates `sos_sessions.last_*` → broadcasts
`{ lat, lng, accuracy, speed, heading, battery, recordedAt }` to room `sos:<id>` →
contact's `incoming-alert.tsx` marker moves. Socket.IO **owns** the live stream;
the REST send is what makes it survive backgrounding.

## 3. Server changes

### 3.1 `server/src/routes/sos.ts`
- **`POST /sos/:id/location`** — owner-only; body validated with Zod:
  `{ latitude, longitude, accuracy?, speed?, heading?, battery?, recordedAt? }`.
  Looks up the session; rejects if not owner or not `ACTIVE`; calls
  `recordLocation`; then `io.to('sos:' + id).emit('sos:location', point)`.
  Returns `{ ok: true }`.
- **`GET /sos/:id`** — owner OR `LINKED` contact; returns
  `{ sosId, status, startedAt, lastLatitude, lastLongitude, lastAccuracy, lastSpeed, lastLocationAt, batteryLevel }`.
  Used for cold start and as the poll fallback when the socket is down. `404` if
  the caller is neither owner nor a linked contact.

### 3.2 `server/src/repos/sos.ts`
- `recordLocation(sosId, point)` — insert into `sos_locations` and
  `UPDATE sos_sessions SET last_latitude, last_longitude, last_accuracy, last_speed,
  last_location_at = now()` (single round trip; use `speed`→`last_speed`).
- Keep existing purge (`:121`) and sweep (`:133`) as-is.

### 3.2 Socket.IO (`server/src/server.ts` → real module)
Replace the stub (`io.on('connection', socket => socket.disconnect(true))`):
- **Handshake auth:** verify the Clerk session token; attach `userId` to
  `socket.data`. Reject unauthenticated connections.
- **`join`** handler: client sends `sosId`; server verifies requester is owner or a
  `LINKED` contact of the owner; joins `socket` to room `sos:<id>`; else
  `err`/disconnect.
- Room `sos:<id>` is the only broadcast target for `sos:location`.
- Emit `sos:resolved` when a session resolves so contacts stop the live view.

### 3.2.5 Repo/route helpers
- `resolveSosSession` already purges `sos_locations`; keep. Add a
  `latestLocation(sosId)` read used by `GET /sos/:id`.

## 4. Mobile changes

### 4.1 Victim sender — `mobile/src/lib/location-stream.ts` (new)
- `startLocationSharing(sosId)` / `stopLocationSharing()` using
  `expo-location` `startLocationUpdatesAsync` + `TaskManager.defineTask`; accuracy
  High, interval ~5s, distance filter ~5m, `foregroundService` notification
  (Android).
- Task bodies POST each fix to `POST /sos/:id/location` via `useApi()`. Store the
  active `sosId` in SecureStore so the task knows its target and survives a
  process restart.
- Offline: queue the newest point and flush on reconnect (reuse
  `connectivity.ts` + `sos-queue.ts` pattern). Never lose the last known point
  across a tunnel.
- `alarm.tsx`: `startLocationSharing(sosId)` on mount/activation,
  `stopLocationSharing()` on cancel/unmount; show a "Sharing live location" pill.

### 4.2 Contact viewer — `mobile/src/lib/realtime.ts` (new)
- `socket.io-client` pointed at the API origin, authenticated with the Clerk token
  on the handshake.
- `useSosStream(sosId)`: connect, `emit('join', sosId)`, listen for
  `sos:location` / `sos:resolved`. On mount also `GET /sos/:id` to seed the last
  known point (cold start when the intent launched the app).
- Fallback: if the socket cannot connect (offline / Render cold), poll
  `GET /sos/:id` every 5s.
- Cleanup: leave the room / disconnect on unmount or when the session resolves.

### 4.3 Lockscreen map — `mobile/src/app/incoming-alert.tsx` (+ `components/LiveMap.tsx`)
- `LiveMap.tsx`: `MapView` (Google provider) with a victim marker, accuracy
  circle, and an "updated Ns ago" stamp; centered once, then follows.
- `incoming-alert.tsx`: replace the static body with `<LiveMap />` fed by
  `useSosStream(sosId)`. Keep the call-style accept/dismiss frame and full-screen
  takeover behavior intact (it already launches via the notifee full-screen
  intent and `plugins/withFullScreenIntent.js` grants `showWhenLocked` +
  `turnScreenOn`).
- `respond.tsx`: optional "view live location" using the same `LiveMap`.

### 4.4 `mobile/src/lib/api.ts`
- Add `postLocation(sosId, point)` and `getSos(sosId)` to `useApi`, mirroring the
  existing authed-fetch/`parseJson` conventions.

### 4.5 Dependencies / config
- Add **`react-native-maps`** (D9). Add **`socket.io-client`** if the dep tree
  doesn't already expose one.
- `app.json` `expo-location` plugin: add `isAndroidBackgroundLocationEnabled` if
  we want updates while backgrounded; keep `locationWhenInUsePermission` copy.
  Google Maps key via the maps plugin / `android.config.googleMaps`. Requires a
  dev-client rebuild (`npx expo run:android --no-bundler`).
- `plugins/withFullScreenIntent.js`: unchanged — the takeover already works.

## 5. Permissions / policy
- **Location:** `ACCESS_FINE_LOCATION` already declared; `ACCESS_BACKGROUND_LOCATION`
  only if we enable background updates (a new permission screen row + rationale).
- **Maps:** Google Maps Android key must be restricted to the app's package +
  release SHA-1; do not ship an unrestricted key.
- **Privacy:** coordinates are never sent in the FCM payload, only fetched by
  authenticated owner/LINKED requests; rooms are authorized server-side.

## 6. Retention (already implemented — verify only)
- `resolveSosSession` purges `sos_locations` on RESOLVED (`server/src/repos/sos.ts:121`).
- `sweepStaleLocations` prunes >2h (`:133`).
- On `RESOLVED`, emit `sos:resolved` so contacts tear down the live view.

## 7. Phases & gates

- **P1 — Server ingest + read (foundation).** `POST /sos/:id/location`,
  `GET /sos/:id`, repo `recordLocation`/`latestLocation`, Zod schemas, auth
  (owner vs LINKED). Gate: `npx tsc --noEmit` + `npm test`; manual POST from a
  script moves `last_*`.
- **P2 — Socket.IO live stream.** Replace the stub: JWT handshake, `join` room
  authorization, broadcast on ingest, `sos:resolved` on resolve. Gate: two test
  clients — owner posts, linked contact receives within ~1s, non-linked refused.
- **P3 — Victim sender.** `location-stream.ts` + TaskManager registration + wire
  `alarm.tsx` + offline queue/flush. Gate: on `emulator-5554`, activate SOS with
  the app backgrounded and confirm `sos_locations` rows keep arriving.
- **P4 — Lockscreen map.** Add `react-native-maps` (+ key) → rebuild dev client;
  `LiveMap.tsx`; wire `incoming-alert.tsx` (+ optional `respond.tsx`); poll
  fallback. Gate: contact device `ZA222QRRSZ` locked, full-screen takeover shows
  a moving marker as the victim walks.
- **P5 — End-to-end + retention.** Confirm purge on resolve, stale sweep, and the
  resolved teardown. Gate: walkthrough 1 end-to-end run across both devices.

## 8. Invariants / test matrix

| Invariant | Check |
|-----------|-------|
| Only the owner can POST a location | non-owner → 403/404 |
| Only owner or LINKED contact can GET /sos/:id | stranger → 404 |
| Only owner or LINKED contact can join `sos:<id>` | non-linked → `err`/disconnect |
| One `sos_sessions.last_*` row reflects the newest fix | assert after each POST |
| Coords never appear in an FCM payload | inspect `sos-notifier.ts` body |
| `sos_locations` purged on RESOLVED | count == 0 after resolve |
| Contact sees marker move ≤ ~6s | P4 gate, both devices |
| Offline victim still flushes queued fix on reconnect | toggle airplane mode mid-SOS |

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Background location killed on OEM (e.g. moto) | foreground service notification + optional background permission; test on device `ZA222QRRSZ` |
| Battery drain from 5s High accuracy | battery-aware cadence (D7), stop hard on resolve |
| Render free-tier cold start delays socket | poll fallback via `GET /sos/:id` |
| Socket auth bypass | authorize owner/LINKED on handshake **and** on `join` |
| Maps key leakage / wrong SHA-1 | restrict key to package + release SHA-1; rebuild dev client |
| Clock skew in `recordedAt` | server stamps authoritative `last_location_at`; keep device ts informational |

## 10. Out of scope here (separate slices)
- **Offline sender** (silent SMS + static maps-link) — already implemented; not
  reopened. This plan is the **online** path only.
- iOS map parity / Apple Maps provider.
- Route history UI, geofencing, ETA, multi-victim dashboards.
- Server §5 migration deltas (`clientRef`/`source`/`created_offline_at`),
  foreground receiver hardening (§7.1), ACK/retry — still deferred.

## 11. Next action
Start **P1**: add `POST /sos/:id/location` + `GET /sos/:id` and the
`recordLocation` / `latestLocation` repo functions, then gate on `tsc` + tests
before touching Socket.IO.
