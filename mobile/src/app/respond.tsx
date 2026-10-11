import { useState, useCallback } from "react";
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { useApi } from "../lib/api";

const RED = "#E84444";
const RED_BRIGHT = "#F25555";

export default function Respond() {
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { sosId } = useLocalSearchParams<{ sosId?: string }>();
  const { respondToSos } = useApi();

  const handleRespond = useCallback(() => {
    if (sending || !sosId) return;
    setSending(true);
    setError(null);
    respondToSos(sosId)
      .then(() => setDone(true))
      .catch(() => setError("Couldn't send your response. Try again."))
      .finally(() => setSending(false));
  }, [sending, sosId, respondToSos]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.hero}>
          <Text style={styles.siren}>🚨</Text>
          <Text style={styles.title}>
            {done ? "Response Sent" : "SOS Alert"}
          </Text>
          <Text style={styles.subtitle}>
            {done
              ? "Your trusted contact has been notified that you’re on the way."
              : "A trusted contact activated an emergency alarm. Let them know you're responding."}
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        {error != null ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}

        {done ? (
          <Pressable
            style={styles.primaryBtn}
            accessibilityRole="button"
            onPress={() => router.replace("/home")}
          >
            <Text style={styles.primaryText}>Done</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.primaryBtn}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Send response to alert"
            onPress={handleRespond}
          >
            {sending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.primaryText}>I’m On My Way</Text>
            )}
          </Pressable>
        )}

        <Pressable
          style={styles.secondaryBtn}
          accessibilityRole="button"
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryText}>Dismiss</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#160A0C",
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 22,
  },
  hero: {
    alignItems: "center",
    marginTop: 24,
  },
  siren: {
    fontSize: 64,
    textAlign: "center",
    textShadowColor: RED_BRIGHT,
    textShadowRadius: 22,
  },
  title: {
    marginTop: 14,
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: "#C9B6B8",
    textAlign: "center",
    paddingHorizontal: 12,
  },
  error: {
    color: RED_BRIGHT,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "600",
  },
  primaryBtn: {
    height: 54,
    borderRadius: 14,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: RED,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  secondaryBtn: {
    marginTop: 12,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});