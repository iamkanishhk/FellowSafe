import { useCallback } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import notifee from "@notifee/react-native";
import { useApi } from "../lib/api";
import { useSosStream } from "../lib/realtime";
import LiveMap from "../components/LiveMap";

const RED = "#E84444";
const RED_BRIGHT = "#F25555";

export default function IncomingAlert() {
  const { sosId, userName } = useLocalSearchParams<{
    sosId?: string;
    userName?: string;
  }>();
  const name = userName && userName.length > 0 ? userName : "Your contact";
  const { getSos } = useApi();

  const { location, resolved, connected } = useSosStream(
    sosId,
    sosId ? () => getSos(sosId).catch(() => null) : undefined,
  );

  const handleOpenApp = useCallback(() => {
    if (sosId) {
      router.replace({ pathname: "/respond", params: { sosId } });
    } else {
      router.replace("/home");
    }
  }, [sosId]);

  const handleDismiss = useCallback(() => {
    if (sosId) {
      notifee.cancelNotification(sosId).catch(() => {});
    }
    BackHandler.exitApp();
  }, [sosId]);

  const statusLabel = resolved
    ? "Alarm resolved"
    : location
      ? connected
        ? "Live location"
        : "Updating\u2026"
      : "Locating\u2026";

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.hero}>
          <Text style={styles.siren}>🚨</Text>
          <Text style={styles.title}>{name} needs help</Text>
          <View style={styles.statusRow}>
            <View style={styles.dot} />
            <Text style={styles.status}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.mapWrap}>
          <LiveMap location={location} ownerName={name} resolved={resolved} />
        </View>

        <Pressable
          style={styles.primaryBtn}
          accessibilityRole="button"
          accessibilityLabel="Open app to respond"
          onPress={handleOpenApp}
        >
          <Text style={styles.primaryText}>Open App</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryBtn}
          accessibilityRole="button"
          accessibilityLabel="Dismiss alert"
          onPress={handleDismiss}
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
    paddingTop: 28,
    paddingBottom: 22,
  },
  hero: {
    alignItems: "center",
  },
  siren: {
    fontSize: 44,
    textAlign: "center",
    textShadowColor: RED_BRIGHT,
    textShadowRadius: 22,
  },
  title: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  status: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: "#FFD9D9",
    textTransform: "uppercase",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: RED,
  },
  mapWrap: {
    flex: 1,
    marginTop: 16,
    marginBottom: 18,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#1E0D10",
    borderWidth: 1,
    borderColor: "rgba(232,68,68,0.35)",
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
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
