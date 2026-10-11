import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useApi } from "../lib/api";

const BOUNCE_MS = 5000;

/**
 * Clerk's browser SSO returns to `mobile://sso-callback`, so this screen is what
 * the user actually sees when the session becomes active. It owns the post-login
 * redirect: once `isSignedIn` flips true (the sign-in screen calls `setActive`)
 * we sync the profile and route on. If the session never activates — for example
 * the redirect URL is not whitelisted in Clerk — we bounce back to sign-in
 * instead of spinning forever.
 */
export default function SSOCallback() {
  const { isLoaded, isSignedIn } = useAuth();
  const { syncUser } = useApi();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      const timer = setTimeout(() => router.replace("/sign-in"), BOUNCE_MS);
      return () => clearTimeout(timer);
    }

    let cancelled = false;
    (async () => {
      try {
        const { user } = await syncUser();
        if (!cancelled) router.replace(user.phoneE164 ? "/home" : "/phone");
      } catch {
        if (!cancelled) router.replace("/phone");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, syncUser]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2E7CF6" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
});
