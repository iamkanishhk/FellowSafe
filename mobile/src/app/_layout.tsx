import { AppState } from "react-native";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Stack, router, usePathname } from "expo-router";
import { useEffect } from "react";
import { UserProvider } from "../lib/user-context";

// Side-effect import: registers the headless FCM task + notifee tap handlers at
// module scope so a data-only push is turned into an alert in every app state.
import {
  getDisplayedAlert,
  registerBackgroundAlerts,
} from "../lib/background-alerts";
import { useApi } from "../lib/api";
import { isOnline, subscribeToConnectivity } from "../lib/connectivity";
import { flushPendingSos } from "../lib/sos-queue";
import {
  flushPendingLocation,
  isSharingLocation,
  startLocationSharing,
  stopLocationSharing,
} from "../lib/location-stream";

registerBackgroundAlerts();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error(
    "Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to the .env file (Clerk Dashboard → API keys).",
  );
}

/**
 * When a full-screen alert brings an already-running app to the foreground, route
 * to the dedicated alert screen rather than leaving the user on whatever screen
 * they were on. Cold starts are handled in `index.tsx`.
 */
function IncomingAlertWatcher() {
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    const check = async () => {
      console.log("[IA] watcher check, pathname=", pathname);
      const alert = await getDisplayedAlert();
      console.log("[IA] watcher getDisplayedAlert ->", JSON.stringify(alert));
      if (!active || !alert) return;
      if (pathname === "/incoming-alert") return;
      router.replace({
        pathname: "/incoming-alert",
        params: { sosId: alert.sosId, userName: alert.userName },
      });
    };
    console.log("[IA] watcher mounted, initial check");
    void check();
    const sub = AppState.addEventListener("change", (state) => {
      console.log("[IA] AppState ->", state);
      if (state === "active") void check();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, [pathname]);

  return null;
}

/**
 * Reconciles any SOS captured while offline with the server as soon as the
 * network returns, and once at launch. Idempotent server-side, so repeat runs
 * are safe. Failures stay queued for the next reconnect. See Plan §6.2.1.
 */
function SosQueueFlusher() {
  const { isSignedIn } = useAuth();
  const { createSos } = useApi();

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;

    const run = async () => {
      if (!(await isOnline())) return;
      await flushPendingSos(createSos).catch(() => {});
    };

    void run();
    const unsubscribe = subscribeToConnectivity((online) => {
      if (online && active) void run();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [createSos, isSignedIn]);

  return null;
}

/**
 * Keeps the victim's device streaming while an SOS is ACTIVE: resumes the
 * location task on launch/reconnect and stops it once the session is no longer
 * active (Plan L2). Also flushes the newest queued fix (Plan L6).
 */
function LocationShareSync() {
  const { isSignedIn } = useAuth();
  const { getActiveSos } = useApi();

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;

    const run = async () => {
      if (!(await isOnline())) return;
      await flushPendingLocation().catch(() => {});
      const sos = await getActiveSos().catch(() => null);
      if (!active) return;
      if (sos) {
        await startLocationSharing(sos.sosId, sos.startedAt);
      } else if (await isSharingLocation()) {
        await stopLocationSharing();
      }
    };

    void run();
    const unsubscribe = subscribeToConnectivity((online) => {
      if (online && active) void run();
    });
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active" && active) void run();
    });

    return () => {
      active = false;
      unsubscribe();
      appStateSub.remove();
    };
  }, [getActiveSos, isSignedIn]);

  return null;
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <UserProvider>
        <IncomingAlertWatcher />
        <SosQueueFlusher />
        <LocationShareSync />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#FFFFFF" },
          }}
        />
      </UserProvider>
    </ClerkProvider>
  );
}
