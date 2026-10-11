import { useCallback } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import notifee from "@notifee/react-native";

const RED = "#E84444";
const RED_BRIGHT = "#F25555";

export default function IncomingAlert() {
  const { sosId, userName } = useLocalSearchParams<{
    sosId?: string;
    userName?: string;
  }>();
  const name = userName && userName.length > 0 ? userName : "Your contact";

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

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.hero}>
          <Text style={styles.siren}>🚨</Text>
          <Text style={styles.title}>{name} needs help</Text>
          <Text style={styles.subtitle}>
            An emergency alarm was activated. Open Fellow Safe to respond.
          </Text>
        </View>

        <View style={{ flex: 1 }} />

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
    textAlign: "center",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: "#C9B6B8",
    textAlign: "center",
    paddingHorizontal: 12,
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
