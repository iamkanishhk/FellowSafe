import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Stack, router, usePathname } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import { UserProvider } from "../lib/user-context";

// Side-effect import: registers the headless FCM task + notifee tap handlers at
// module scope so a data-only push is turned into an alert in every app state.
import {
  getDisplayedAlert,
  registerBackgroundAlerts,
} from "../lib/background-alerts";

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

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <UserProvider>
        <IncomingAlertWatcher />
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
