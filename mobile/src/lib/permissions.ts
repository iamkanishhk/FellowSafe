import * as Contacts from "expo-contacts";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

export type PermissionKind = "location" | "contacts" | "notifications";

export interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
}

export type PermissionSnapshot = Record<PermissionKind, PermissionState>;

export const REQUIRED_PERMISSIONS: PermissionKind[] = [
  "location",
  "contacts",
  "notifications",
];

/**
 * Set only once every required permission is granted. Once set, the gate is
 * skipped on every later launch — a revoked permission is handled by the
 * feature that needs it, not by re-blocking the whole app.
 */
const COMPLETED_KEY = "onboarding_permissions_v1";

/** Reads the current grant state without prompting the user. */
export async function getPermissionState(
  kind: PermissionKind,
): Promise<PermissionState> {
  try {
    switch (kind) {
      case "location": {
        const { granted, canAskAgain } =
          await Location.getForegroundPermissionsAsync();
        return { granted, canAskAgain };
      }
      case "contacts": {
        const { granted, canAskAgain } = await Contacts.getPermissionsAsync();
        return { granted, canAskAgain };
      }
      case "notifications": {
        const { granted, canAskAgain } =
          await Notifications.getPermissionsAsync();
        return { granted, canAskAgain };
      }
    }
  } catch {
    return { granted: false, canAskAgain: true };
  }
}

export async function getPermissionSnapshot(): Promise<PermissionSnapshot> {
  const [location, contacts, notifications] = await Promise.all([
    getPermissionState("location"),
    getPermissionState("contacts"),
    getPermissionState("notifications"),
  ]);
  return { location, contacts, notifications };
}

/** Shows the OS prompt for one permission (or reports the current state). */
export async function requestPermission(
  kind: PermissionKind,
): Promise<PermissionState> {
  try {
    switch (kind) {
      case "location": {
        const { granted, canAskAgain } =
          await Location.requestForegroundPermissionsAsync();
        return { granted, canAskAgain };
      }
      case "contacts": {
        const { granted, canAskAgain } = await Contacts.requestPermissionsAsync();
        return { granted, canAskAgain };
      }
      case "notifications": {
        const { granted, canAskAgain } =
          await Notifications.requestPermissionsAsync();
        return { granted, canAskAgain };
      }
    }
  } catch {
    return { granted: false, canAskAgain: true };
  }
}

export function isFullyGranted(snapshot: PermissionSnapshot): boolean {
  return (
    snapshot.location.granted &&
    snapshot.contacts.granted &&
    snapshot.notifications.granted
  );
}

export async function isOnboardingComplete(): Promise<boolean> {
  const flag = await SecureStore.getItemAsync(COMPLETED_KEY).catch(() => null);
  return flag === "1";
}

export async function markOnboardingComplete(): Promise<void> {
  await SecureStore.setItemAsync(COMPLETED_KEY, "1").catch(() => {});
}

export async function resetOnboarding(): Promise<void> {
  await SecureStore.deleteItemAsync(COMPLETED_KEY).catch(() => {});
}
