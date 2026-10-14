import { Linking, PermissionsAndroid, Platform } from "react-native";
import * as Location from "expo-location";
import * as SMS from "expo-sms";
import SmsSender from "../../modules/sms-sender";
import type { CachedContact } from "./contacts-cache";
import type { SosCoords } from "./sos-queue";

/** A fresh fix can hang with no data, so it races a short timeout. */
const FIX_TIMEOUT_MS = 4000;

/** How an offline SOS reached (or was handed to) the SMS layer. */
export interface SmsDispatch {
  /** "silent" = sent by the app; "composer" = handed to the system SMS app. */
  mode: "silent" | "composer";
  /** Recipients the message was addressed to. */
  total: number;
  /** Recipients confirmed dispatched (always 0 in composer mode until sent). */
  sent: number;
  /** True when at least one recipient was reached. */
  ok: boolean;
}

function toCoords(position: Location.LocationObject): SosCoords {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]).catch(() => null);
}

/**
 * Best-effort coordinates with no network: a GPS fix (bounded), else the last
 * known position, else null. GPS is receive-only, so this works offline. §O4.
 */
export async function getBestEffortLocation(): Promise<SosCoords | null> {
  const current = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    FIX_TIMEOUT_MS,
  );
  if (current) return toCoords(current);

  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return toCoords(last);
  } catch {
    // Fall through to null.
  }
  return null;
}

export function buildMapsUrl(coords: SosCoords): string {
  return `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`;
}

/** The SMS body. Carrier-safe ASCII, one maps link, always labelled. §6.3. */
export function buildSosMessage(
  name: string,
  coords: SosCoords | null,
  at: Date,
): string {
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(
    at.getMinutes(),
  ).padStart(2, "0")}`;
  const location = coords ? buildMapsUrl(coords) : "Location unavailable.";
  return `🚨 EMERGENCY: ${name} needs help.\n${location}\nSent by FellowSafe at ${time}.`;
}

function fallbackUrl(addresses: string[], message: string): string {
  const body = encodeURIComponent(message);
  const separator = Platform.OS === "ios" ? "&" : "?";
  return `sms:${addresses.join(",")}${separator}body=${body}`;
}

/** Whether the app can send SMS by itself instead of opening the composer. */
export function canSendSilently(): boolean {
  return Platform.OS === "android" && !!SmsSender && SmsSender.isSmsCapable();
}

/** Prompt for SEND_SMS if needed; resolves whether it is granted. */
export async function ensureSmsPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const permission = PermissionsAndroid.PERMISSIONS.SEND_SMS;
  try {
    if (await PermissionsAndroid.check(permission)) return true;
    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Send to everyone in one shot, with no user interaction — the whole point of
 * the offline path. Returns null when a silent send is not possible, so the
 * caller can fall back to the composer.
 */
async function trySilentSend(
  addresses: string[],
  message: string,
): Promise<SmsDispatch | null> {
  if (!canSendSilently()) return null;
  const sender = SmsSender;
  if (!sender) return null;
  if (!(await ensureSmsPermission())) return null;

  try {
    const results = await sender.send(addresses, message);
    const sent = results.filter((r) => r.ok).length;
    return { mode: "silent", total: addresses.length, sent, ok: sent > 0 };
  } catch {
    return null;
  }
}

/** Trade-off path (§10): hand a pre-addressed message to the system SMS app. */
async function composerFallback(
  addresses: string[],
  message: string,
): Promise<SmsDispatch> {
  try {
    if (await SMS.isAvailableAsync()) {
      const { result } = await SMS.sendSMSAsync(addresses, message);
      const ok = result !== "cancelled";
      return {
        mode: "composer",
        total: addresses.length,
        sent: ok ? addresses.length : 0,
        ok,
      };
    }
  } catch {
    // Fall through to the sms: intent.
  }

  try {
    await Linking.openURL(fallbackUrl(addresses, message));
    return {
      mode: "composer",
      total: addresses.length,
      sent: addresses.length,
      ok: true,
    };
  } catch {
    return { mode: "composer", total: addresses.length, sent: 0, ok: false };
  }
}

/**
 * Deliver the offline SOS to every trusted contact. Prefers a silent,
 * simultaneous send (Android); otherwise opens the SMS composer, which needs a
 * manual tap. §O2.
 */
export async function sendOfflineSms(
  contacts: CachedContact[],
  message: string,
): Promise<SmsDispatch> {
  const addresses = contacts.map((c) => c.phoneE164).filter(Boolean);
  if (addresses.length === 0) {
    return { mode: "composer", total: 0, sent: 0, ok: false };
  }

  const silent = await trySilentSend(addresses, message);
  if (silent) return silent;

  return composerFallback(addresses, message);
}
