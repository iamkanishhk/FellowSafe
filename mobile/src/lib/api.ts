import { useCallback } from "react";
import { useAuth } from "@clerk/expo";

export const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

export interface SyncedUser {
  id: string;
  name: string;
  phoneE164: string | null;
  phoneVerified: boolean;
  email: string | null;
}

export interface SyncUserResult {
  user: SyncedUser;
  linkedContacts: { id: string; name: string }[];
}

export interface TrustedContact {
  id: string;
  name: string;
  phoneE164: string;
  relationship: string | null;
  status: "PENDING" | "LINKED" | "REMOVED";
  linkedUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactMatch {
  phoneE164: string;
  userId: string;
  name: string;
}

export interface SosLocationInput {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

export interface CreateSosInput {
  battery?: number;
  /** Client-generated idempotency key; lets an offline flush reconcile exactly once. */
  clientRef?: string;
  /** ISO timestamp of when the alarm actually started on the device. */
  createdOfflineAt?: string;
  lastLocation?: SosLocationInput | null;
}

/** One live fix POSTed by the victim's location task. Mirrors `POST /sos/:id/location`. */
export interface SosLocationPoint {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  battery?: number | null;
  recordedAt?: string;
}

/** The newest fix as the server reports it through `GET /sos/:id` or `sos:location`. */
export interface SosLiveLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  recordedAt: string;
}

export interface SosDetail {
  sosId: string;
  status: "ACTIVE" | "RESOLVED";
  startedAt: string;
  endedAt: string | null;
  ownerName: string;
  lastLocation: SosLiveLocation | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const code = body?.error?.code ?? "REQUEST_FAILED";
    const message = body?.error?.message ?? `request failed (${res.status})`;
    throw new ApiError(res.status, code, message);
  }
  return body as T;
}

/**
 * Clerk owns the session, so every authenticated call carries a freshly minted
 * Clerk session token as a bearer credential. `getToken` caches internally and
 * refreshes as needed, so calling it per request is the intended pattern.
 */
export function useApi() {
  const { getToken } = useAuth();

  const authedFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const token = await getToken();
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      return fetch(`${apiBaseUrl}${path}`, { ...init, headers });
    },
    [getToken],
  );

  const syncUser = useCallback(
    async (): Promise<SyncUserResult> =>
      parseJson<SyncUserResult>(await authedFetch("/auth/sync", { method: "POST" })),
    [authedFetch],
  );

  const savePhone = useCallback(
    async (phoneNumber: string): Promise<SyncedUser> => {
      const { user } = await parseJson<{ user: SyncedUser }>(
        await authedFetch("/auth/phone", {
          method: "POST",
          body: JSON.stringify({ phoneNumber }),
        }),
      );
      return user;
    },
    [authedFetch],
  );

  const listContacts = useCallback(async (): Promise<TrustedContact[]> => {
    const { contacts } = await parseJson<{ contacts: TrustedContact[] }>(
      await authedFetch("/contacts"),
    );
    return contacts;
  }, [authedFetch]);

  const matchContacts = useCallback(
    async (phones: string[]): Promise<ContactMatch[]> => {
      const { matches } = await parseJson<{ matches: ContactMatch[] }>(
        await authedFetch("/contacts/match", {
          method: "POST",
          body: JSON.stringify({ phones }),
        }),
      );
      return matches;
    },
    [authedFetch],
  );

  const addContact = useCallback(
    async (input: {
      name: string;
      phone: string;
      relationship?: string;
    }): Promise<TrustedContact> => {
      const { contact } = await parseJson<{ contact: TrustedContact }>(
        await authedFetch("/contacts", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      );
      return contact;
    },
    [authedFetch],
  );

  const removeContact = useCallback(
    async (id: string): Promise<void> => {
      await parseJson<{ ok: boolean }>(
        await authedFetch(`/contacts/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
      );
    },
    [authedFetch],
  );

  const registerDevice = useCallback(
    async (fcmToken: string, platform: "android" | "ios"): Promise<void> => {
      await parseJson<{ ok: boolean }>(
        await authedFetch("/devices", {
          method: "POST",
          body: JSON.stringify({ fcmToken, platform }),
        }),
      );
    },
    [authedFetch],
  );

  const createSos = useCallback(
    async (
      input: CreateSosInput = {},
    ): Promise<{
      sosId: string;
      startedAt: string;
      alreadyActive: boolean;
    }> => {
      const body: Record<string, unknown> = {};
      if (input.battery !== undefined) body.battery = input.battery;
      if (input.clientRef) body.clientRef = input.clientRef;
      if (input.createdOfflineAt) body.createdOfflineAt = input.createdOfflineAt;
      if (input.lastLocation) body.lastLocation = input.lastLocation;

      return parseJson(
        await authedFetch("/sos", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    },
    [authedFetch],
  );

  const getActiveSos = useCallback(
    async (): Promise<{ sosId: string; startedAt: string } | null> =>
      parseJson(await authedFetch("/sos/active")),
    [authedFetch],
  );

  const respondToSos = useCallback(
    async (sosId: string): Promise<{ ok: boolean; respondedAt: string }> =>
      parseJson(
        await authedFetch(`/sos/${encodeURIComponent(sosId)}/respond`, {
          method: "POST",
        }),
      ),
    [authedFetch],
  );

  const resolveSos = useCallback(
    async (sosId: string): Promise<{
      ok: boolean;
      endedAt: string | null;
      alreadyResolved: boolean;
    }> =>
      parseJson(
        await authedFetch(`/sos/${encodeURIComponent(sosId)}/resolve`, {
          method: "POST",
        }),
      ),
    [authedFetch],
  );

  const getSos = useCallback(
    async (sosId: string): Promise<SosDetail> =>
      parseJson<SosDetail>(
        await authedFetch(`/sos/${encodeURIComponent(sosId)}`),
      ),
    [authedFetch],
  );

  const postLocation = useCallback(
    async (sosId: string, point: SosLocationPoint): Promise<void> => {
      const res = await authedFetch(
        `/sos/${encodeURIComponent(sosId)}/location`,
        { method: "POST", body: JSON.stringify(point) },
      );
      if (!res.ok) throw new Error(`location post failed (${res.status})`);
    },
    [authedFetch],
  );

  return {
    authedFetch,
    syncUser,
    savePhone,
    listContacts,
    matchContacts,
    addContact,
    removeContact,
    registerDevice,
    createSos,
    getActiveSos,
    respondToSos,
    resolveSos,
    getSos,
    postLocation,
  };
}
