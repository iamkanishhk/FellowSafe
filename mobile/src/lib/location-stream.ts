import { AppState, Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import { apiBaseUrl, type SosLocationPoint } from "./api";
import { getAuthToken } from "./auth-token";

export const LOCATION_TASK = "fellowsafe-sos-location";
const ACTIVE_SOS_KEY = "sos_location_active_v1";
const PENDING_FIX_KEY = "sos_location_pending_v1";
const CADENCE_MS = 5000;

interface ActiveSos {
  sosId: string;
  startedAt: string;
}

interface LocationTaskPayload {
  data?: { locations?: Location.LocationObject[] };
  error?: { message: string } | null;
}

function toPoint(loc: Location.LocationObject): SosLocationPoint {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracy: loc.coords.accuracy,
    speed: loc.coords.speed,
    heading: loc.coords.heading,
    battery: null,
    recordedAt: new Date(loc.timestamp).toISOString(),
  };
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch {
    // best effort — a failed cache write must not break the alarm
  }
}

export async function postLocation(
  sosId: string,
  point: SosLocationPoint,
): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) {
    console.log("[sos-loc] post skipped — no auth token");
    return false;
  }
  const url = `${apiBaseUrl}/sos/${encodeURIComponent(sosId)}/location`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(point),
    });
    if (!res.ok) console.log("[sos-loc] post rejected", res.status, url);
    return res.ok;
  } catch (err) {
    console.log("[sos-loc] post failed", String(err), url);
    return false;
  }
}

async function queueFix(sosId: string, point: SosLocationPoint): Promise<void> {
  await writeJson(PENDING_FIX_KEY, { sosId, point });
}

/** Flush the newest queued fix exactly once, then clear it. */
export async function flushPendingLocation(): Promise<void> {
  const pending = await readJson<{ sosId: string; point: SosLocationPoint }>(
    PENDING_FIX_KEY,
  );
  if (!pending) return;
  const ok = await postLocation(pending.sosId, pending.point);
  if (ok) {
    try {
      await SecureStore.deleteItemAsync(PENDING_FIX_KEY);
    } catch {
      // ignore
    }
  }
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: LocationTaskPayload) => {
  if (error) {
    console.log("[sos-loc] task error", error.message);
    return;
  }
  const active = await readJson<ActiveSos>(ACTIVE_SOS_KEY);
  if (!active) return;
  const latest = data?.locations?.[data.locations.length - 1];
  if (!latest) return;
  const point = toPoint(latest);
  const ok = await postLocation(active.sosId, point);
  console.log("[sos-loc] fix", active.sosId, ok ? "sent" : "queued");
  if (!ok) await queueFix(active.sosId, point);
});

async function postCurrentFix(sosId: string): Promise<void> {
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    const point = toPoint(pos);
    const ok = await postLocation(sosId, point);
    console.log("[sos-loc] initial fix", sosId, ok ? "sent" : "queued");
    if (!ok) await queueFix(sosId, point);
  } catch (err) {
    console.log("[sos-loc] initial fix failed", String(err));
  }
}

export async function startLocationSharing(
  sosId: string,
  startedAt: string,
): Promise<boolean> {
  await writeJson(ACTIVE_SOS_KEY, { sosId, startedAt } satisfies ActiveSos);

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") return false;

  const already = await Location.hasStartedLocationUpdatesAsync(
    LOCATION_TASK,
  ).catch(() => false);
  if (already) return true;

  if (AppState.currentState !== "active") {
    console.log("[sos-loc] deferred start — app not in foreground");
    return false;
  }

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: CADENCE_MS,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService:
        Platform.OS === "android"
          ? {
              notificationTitle: "Fellow Safe is sharing your location",
              notificationBody:
                "Your trusted contacts can see where you are.",
              notificationColor: "#E84444",
            }
          : undefined,
    });
  } catch (err) {
    console.log("[sos-loc] start failed", String(err));
    return false;
  }

  void postCurrentFix(sosId);
  console.log("[sos-loc] sharing started");
  return true;
}

export async function stopLocationSharing(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ACTIVE_SOS_KEY);
  } catch {
    // ignore
  }
  try {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    // task was not running — fine
  }
}

export async function isSharingLocation(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}
