import { useCallback } from "react";
import { useAuth } from "@clerk/expo";

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

export interface SyncedUser {
  id: string;
  name: string;
  phoneE164: string | null;
  phoneVerified: boolean;
  email: string | null;
}

export interface SyncUserResult {
  user: SyncedUser;
  linkedContacts: { id: string; ownerName: string }[];
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
      return fetch(`${baseURL}${path}`, { ...init, headers });
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
    async (battery?: number): Promise<{
      sosId: string;
      startedAt: string;
      alreadyActive: boolean;
    }> =>
      parseJson(
        await authedFetch("/sos", {
          method: "POST",
          body: JSON.stringify(battery === undefined ? {} : { battery }),
        }),
      ),
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

  return {
    authedFetch,
    syncUser,
    savePhone,
    listContacts,
    matchContacts,
    addContact,
    registerDevice,
    createSos,
    getActiveSos,
    respondToSos,
    resolveSos,
  };
}
