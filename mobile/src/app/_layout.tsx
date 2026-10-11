import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Stack } from "expo-router";
import { UserProvider } from "../lib/user-context";

// Side-effect import: registers the headless FCM task + notifee tap handlers at
// module scope so a data-only push is turned into an alert in every app state.
import { registerBackgroundAlerts } from "../lib/background-alerts";

registerBackgroundAlerts();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error(
    "Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to the .env file (Clerk Dashboard → API keys).",
  );
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <UserProvider>
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
