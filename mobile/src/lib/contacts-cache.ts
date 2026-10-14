import * as SecureStore from "expo-secure-store";
import type { TrustedContact } from "./api";

export interface CachedContact {
  name: string;
  phoneE164: string;
}

/**
 * Last-known trusted contacts, persisted so an offline SOS can be addressed
 * without a server round-trip. See Plan §4 (`contacts-cache.ts`).
 */
const KEY = "trusted_contacts_cache_v1";

/** Bounds the SecureStore value and the SMS fan-out of a single SOS. */
const MAX_CONTACTS = 25;

/** Refresh the cache from a fresh `GET /contacts`. Best-effort: never throws. */
export async function saveContactsCache(
  contacts: TrustedContact[],
): Promise<void> {
  const seen = new Set<string>();
  const cached: CachedContact[] = [];

  for (const contact of contacts) {
    if (contact.status === "REMOVED") continue;
    const phoneE164 = contact.phoneE164?.trim();
    if (!phoneE164 || !phoneE164.startsWith("+")) continue;

    const key = phoneE164.replace(/\D/g, "");
    if (!key || seen.has(key)) continue;

    seen.add(key);
    cached.push({
      name: contact.name?.trim() || "Trusted contact",
      phoneE164,
    });
    if (cached.length >= MAX_CONTACTS) break;
  }

  await SecureStore.setItemAsync(KEY, JSON.stringify(cached)).catch(() => {});
}

/** The cached contacts, or an empty list when nothing has been cached yet. */
export async function getContactsCache(): Promise<CachedContact[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const { name, phoneE164 } = item as Record<string, unknown>;
      if (typeof name !== "string" || typeof phoneE164 !== "string") return [];
      return [{ name, phoneE164 }];
    });
  } catch {
    return [];
  }
}
