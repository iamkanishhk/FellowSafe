import { useEffect, useState } from "react";
import { Text, View, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";

const RED = "#E84444";
const RED_BRIGHT = "#F25555";

function formatTime(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function AlarmActivated() {
  const [remaining, setRemaining] = useState(45);

  useEffect(() => {
    const id = setInterval(
      () => setRemaining((r) => (r > 0 ? r - 1 : 0)),
      1000
    );
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.closeBtn}
        >
          <Text style={styles.closeX}>✕</Text>
        </Pressable>

        <View style={styles.hero}>
          <Text style={styles.siren}>🚨</Text>
          <Text style={styles.title}>Alarm Activated</Text>
          <Text style={styles.subtitle}>
            Your trusted contacts have been notified{"\n"}and your location is
            being shared.
          </Text>
        </View>

        <View style={styles.timerWrap}>
          <View style={styles.timerOuter}>
            <View style={styles.timerTrack} />
            <View style={styles.timerProgress} />
            <View style={styles.timerInner}>
              <Text style={styles.timerText}>{formatTime(remaining)}</Text>
              <Text style={styles.timerLabel}>Remaining</Text>
            </View>
          </View>
        </View>

        <View style={{ flex: 1 }} />

        <Pressable
          style={styles.cancelBtn}
          onPress={() => router.push("/home")}
          accessibilityRole="button"
        >
          <View style={styles.cancelIcon}>
            <Text style={styles.cancelGlyph}>✕</Text>
          </View>
          <Text style={styles.cancelText}>Cancel Alarm</Text>
        </Pressable>

        <Pressable
          style={styles.emergencyBtn}
          accessibilityRole="button"
          onPress={() => router.push("/home")}
        >
          <Text style={styles.phoneIcon}>📞</Text>
          <Text style={styles.emergencyText}>Call Emergency Services</Text>
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
    paddingTop: 6,
    paddingBottom: 22,
  },
  closeBtn: {
    width: 32,
    height: 32,
    justifyContent: "center",
  },
  closeX: {
    fontSize: 20,
    color: "#FFFFFF",
    fontWeight: "400",
  },
  hero: {
    alignItems: "center",
    marginTop: 6,
  },
  siren: {
    fontSize: 52,
    textAlign: "center",
    textShadowColor: RED_BRIGHT,
    textShadowRadius: 18,
  },
  title: {
    marginTop: 10,
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: "#C9B6B8",
    textAlign: "center",
  },
  timerWrap: {
    alignItems: "center",
    marginTop: 26,
  },
  timerOuter: {
    width: 208,
    height: 208,
    borderRadius: 104,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#241014",
    shadowColor: RED,
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  timerTrack: {
    position: "absolute",
    width: 192,
    height: 192,
    borderRadius: 96,
    borderWidth: 6,
    borderColor: "rgba(232,68,68,0.22)",
  },
  timerProgress: {
    position: "absolute",
    width: 192,
    height: 192,
    borderRadius: 96,
    borderWidth: 6,
    borderColor: "transparent",
    borderTopColor: RED,
    borderRightColor: RED,
    transform: [{ rotate: "45deg" }],
  },
  timerInner: {
    width: 164,
    height: 164,
    borderRadius: 82,
    backgroundColor: "#1E0D10",
    borderWidth: 1,
    borderColor: "rgba(232,68,68,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  timerText: {
    fontSize: 34,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
    fontVariant: ["tabular-nums"],
  },
  timerLabel: {
    marginTop: 2,
    fontSize: 12.5,
    color: "#C9B6B8",
    fontWeight: "500",
  },
  cancelBtn: {
    height: 52,
    borderRadius: 13,
    backgroundColor: RED,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: RED,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  cancelIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelGlyph: {
    fontSize: 12,
    color: RED,
    fontWeight: "800",
  },
  cancelText: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  emergencyBtn: {
    marginTop: 12,
    height: 52,
    borderRadius: 13,
    backgroundColor: "#F2F4F7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  phoneIcon: {
    fontSize: 16,
  },
  emergencyText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#1F2B45",
  },
});
