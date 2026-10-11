import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useSSO } from "@clerk/expo";
import { useApi } from "../lib/api";

const NAVY = "#13203A";
const GREY = "#6B778D";
const DANGER = "#E5484D";

function GoogleMark() {
  return (
    <View style={styles.googleMark}>
      <Text style={styles.googleMarkText}>G</Text>
    </View>
  );
}

export default function SignIn() {
  const { startSSOFlow } = useSSO();
  const { syncUser } = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { createdSessionId, setActive, signUp } = await startSSOFlow({
        strategy: "oauth_google",
      });

      if (!createdSessionId || !setActive) {
        // Distinguish "needs more info" from a plain cancel.
        if (signUp?.status === "missing_requirements") {
          setError("Google didn't share everything we need. Please try again.");
        }
        router.replace("/sign-in");
        return;
      }

      await setActive({ session: createdSessionId });
      try {
        const { user } = await syncUser();
        router.replace(user.phoneE164 ? "/home" : "/phone");
      } catch {
        // Profile sync failed (e.g. API unreachable); still leave the callback
        // screen so the user can retry rather than watching a spinner.
        router.replace("/phone");
      }
    } catch {
      setError("Couldn't sign in with Google. Check your connection and retry.");
      router.replace("/sign-in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="dark" />

      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityRole="button"
        style={styles.backBtn}
      >
        <Text style={styles.backArrow}>←</Text>
      </Pressable>

      <View style={styles.copyWrap}>
        <Text style={styles.title}>Create your{"\n"}Fellow Safe account.</Text>
        <Text style={styles.subtitle}>
          Continue with Google to set up your account and start adding the people
          you trust.
        </Text>
      </View>

      <View style={{ flex: 1 }} />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={[styles.googleBtn, busy && styles.btnDisabled]}
        accessibilityRole="button"
        disabled={busy}
        onPress={onGoogle}
      >
        {busy ? (
          <ActivityIndicator color={NAVY} />
        ) : (
          <>
            <GoogleMark />
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </>
        )}
      </Pressable>

      <Text style={styles.legal}>
        By continuing you agree to Fellow Safe’s Terms and Privacy Policy.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    marginLeft: -6,
    marginBottom: 14,
  },
  backArrow: {
    fontSize: 26,
    color: NAVY,
    fontWeight: "600",
    marginTop: -4,
  },
  copyWrap: {
    marginTop: 24,
  },
  title: {
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "800",
    color: NAVY,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14.5,
    lineHeight: 21,
    color: GREY,
    fontWeight: "400",
    maxWidth: 310,
  },
  googleBtn: {
    height: 54,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#DDE4EF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowColor: "#B9C4D6",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  googleMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  googleMarkText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#4285F4",
  },
  googleBtnText: {
    color: NAVY,
    fontSize: 16,
    fontWeight: "700",
  },
  errorText: {
    marginBottom: 12,
    fontSize: 13,
    color: DANGER,
    fontWeight: "600",
    textAlign: "center",
  },
  legal: {
    marginTop: 16,
    marginBottom: 6,
    fontSize: 11.5,
    lineHeight: 16,
    color: "#8A94A8",
    textAlign: "center",
    fontWeight: "500",
  },
});
