import * as SecureStore from "expo-secure-store";
import type { CachedContact } from "./contacts-cache";

export interface SosCoords {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

export type PendingSosStatus = "QUEUED" | "SMS_SENT" | "SMS_FAILED" | "FLUSHED";

/**
 * A locally captured SOS. Written to disk BEFORE any send so a kill mid-send
 * still leaves evidence, and flushed to the server exactly once when the
 * network returns. See Plan §3 and §6.2.
 */
export interface PendingSos {
  clientRef: string;
  createdAt: string;
  coords: SosCoords | null;
  contacts: CachedContact[];
  smsDispatchedAt: string | null;
  status: PendingSosStatus;
}

export type SosPoster = (input: {
  clientRef: string;
  createdOfflineAt: string;
  lastLocation: SosCoords | null;
}) => Promise<{ sosId: string; startedAt: string; alreadyActive: boolean }>;

const KEY = "pending_sos_v1";

/** Flushed records are only kept briefly as a local audit trail. */
const FLUSHED_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 50;

// SecureStore is async and has no compare-and-swap, so serialize every
// read-modify-write through one promise chain to avoid lost updates.
let chain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

async function readAll(): Promise<PendingSos[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingSos[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(entries: PendingSos[]): Promise<void> {
  const pruned = entries
    .filter(
      (entry) =>
        entry.status !== "FLUSHED" ||
        Date.now() - Date.parse(entry.createdAt) < FLUSHED_RETENTION_MS,
    )
    .slice(-MAX_ENTRIES);
  await SecureStore.setItemAsync(KEY, JSON.stringify(pruned)).catch(() => {});
}

export async function listPendingSos(): Promise<PendingSos[]> {
  return readAll();
}

/** Persist a freshly captured SOS. Safe to call before the app knows the network state. */
export async function enqueueSos(entry: PendingSos): Promise<void> {
  await withLock(async () => {
    const entries = await readAll();
    if (entries.some((e) => e.clientRef === entry.clientRef)) return;
    await writeAll([...entries, entry]);
  });
}

export async function markSosSmsResult(
  clientRef: string,
  status: Extract<PendingSosStatus, "SMS_SENT" | "SMS_FAILED">,
  dispatchedAt: string,
): Promise<void> {
  await withLock(async () => {
    const entries = await readAll();
    await writeAll(
      entries.map((e) =>
        e.clientRef === clientRef
          ? { ...e, status, smsDispatchedAt: dispatchedAt }
          : e,
      ),
    );
  });
}

export async function markSosFlushed(clientRef: string): Promise<void> {
  await withLock(async () => {
    const entries = await readAll();
    await writeAll(
      entries.map((e) =>
        e.clientRef === clientRef
          ? { ...e, status: "FLUSHED" as const, smsDispatchedAt: e.smsDispatchedAt }
          : e,
      ),
    );
  });
}

/**
 * Reconcile every not-yet-flushed SOS with the server. Idempotent server-side
 * (one ACTIVE session per user), so a retry after a partial run is safe.
 * Failures stay queued for the next reconnect. Returns how many flushed.
 */
export async function flushPendingSos(post: SosPoster): Promise<number> {
  const entries = await listPendingSos();
  let flushed = 0;

  for (const entry of entries) {
    if (entry.status === "FLUSHED") continue;
    try {
      await post({
        clientRef: entry.clientRef,
        createdOfflineAt: entry.createdAt,
        lastLocation: entry.coords,
      });
      await markSosFlushed(entry.clientRef);
      flushed += 1;
    } catch {
      // Leave it queued; a later reconnect retries.
    }
  }

  return flushed;
}
