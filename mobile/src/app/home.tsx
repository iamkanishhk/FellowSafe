import React, { useState, useRef } from "react";
import { Text, View, StyleSheet, Pressable, Animated, Easing, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import Navbar from "../components/Navbar";
import Svg, { Circle } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Colors
const BG_COLOR = "#F8F9FA";
const CARD_BG = "#FFFFFF";
const TEXT_PRIMARY = "#1C1C1E";
const TEXT_SECONDARY = "#8E8E93";
const SOS_RED = "#FF3B30";
const SOS_RED_DARK = "#D70015";
const MINT_BG = "rgba(52, 199, 89, 0.1)";

const HOLD_DURATION = 1000; // 1 second match for delayLongPress
const BUTTON_RADIUS = 110;
const CIRCUMFERENCE = 2 * Math.PI * BUTTON_RADIUS;

export default function Home() {
  const [holding, setHolding] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    setHolding(true);
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: HOLD_DURATION,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    setHolding(false);
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  // Interpolations for Progress & Pulse Effect
  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  const pulseScale = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.25],
  });

  const pulseOpacity = progressAnim.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0.3, 0.6, 0.15],
  });

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.greeting}>Good evening, Alex</Text>
          <View style={styles.locRow}>
            <Text style={styles.locPin}>📍</Text>
            <Text style={styles.locText}>Bengaluru, Karnataka</Text>
          </View>
        </View>
      </View>

      {/* Main SOS Section with Pulse & Circular Progress */}
      <View style={styles.sosContainer}>
        <View style={styles.sosWrapper}>
          {/* Animated Pulse Aura */}
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />

          {/* SVG Progress Ring */}
          <View style={styles.svgContainer}>
            <Svg width="240" height="240" viewBox="0 0 240 240">
              {/* Background Ring Track */}
              <Circle
                cx="120"
                cy="120"
                r={BUTTON_RADIUS}
                stroke="rgba(255, 59, 48, 0.15)"
                strokeWidth="6"
                fill="none"
              />
              {/* Animated Progress Ring */}
              <AnimatedCircle
                cx="120"
                cy="120"
                r={BUTTON_RADIUS}
                stroke={SOS_RED}
                strokeWidth="6"
                fill="none"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 120 120)"
              />
            </Svg>
          </View>

          {/* SOS Touch Button */}
          <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onLongPress={() => {
              setHolding(false);
              router.push("/alarm");
            }}
            delayLongPress={HOLD_DURATION}
            accessibilityRole="button"
            accessibilityLabel="Activate alarm. Press and hold for 1 second to activate."
            style={({ pressed }) => [
              styles.sosButton,
              (holding || pressed) && styles.sosPressedState,
            ]}
          >
            <View style={styles.sosMiddleRing}>
              <View style={styles.sosInnerButton}>
                <Text style={styles.siren}>🔔</Text>
                <Text style={styles.sosText}>ACTIVATE{"\n"}ALARM</Text>
              </View>
            </View>
          </Pressable>
        </View>

        <Text style={styles.hint}>
          {holding ? "Keep holding..." : "Press and hold to activate"}
        </Text>
      </View>

      {/* Status Card */}
      <View style={styles.statusCard}>
        <View style={styles.shieldCircle}>
          <Text style={styles.shieldGlyph}>🛡</Text>
        </View>
        <View style={styles.statusContent}>
          <Text style={styles.statusTitle}>You’re protected</Text>
          <Text style={styles.statusSub}>Trusted contacts are set up</Text>
        </View>
      </View>

      <View style={styles.spacer} />

      <Navbar active="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_COLOR,
    paddingHorizontal: 20,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  greeting: {
    fontSize: 24,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    letterSpacing: -0.5,
  },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  locPin: {
    fontSize: 13,
  },
  locText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    fontWeight: "500",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E5E5EA",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarGlyph: {
    fontSize: 20,
  },

  // SOS Wrapper & Ring Animations
  sosContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 24,
  },
  sosWrapper: {
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: SOS_RED,
  },
  svgContainer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  sosButton: {
    width: 204,
    height: 204,
    borderRadius: 102,
    alignItems: "center",
    justifyContent: "center",
  },
  sosPressedState: {
    transform: [{ scale: 0.96 }],
  },
  sosMiddleRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255, 59, 48, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  sosInnerButton: {
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: SOS_RED,
    borderWidth: 1,
    borderColor: SOS_RED_DARK,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: SOS_RED,
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
      android: {
        elevation: 6,
      },
    }),
  },
  siren: {
    fontSize: 40,
  },
  sosText: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 0.6,
  },
  hint: {
    marginTop: 18,
    fontSize: 14,
    color: TEXT_SECONDARY,
    fontWeight: "500",
    letterSpacing: -0.2,
  },

  // Status Card
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 16,
    gap: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 2,
      },
    }),
  },
  shieldCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MINT_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  shieldGlyph: {
    fontSize: 22,
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    letterSpacing: -0.3,
  },
  statusSub: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },

  spacer: {
    flex: 1,
  },

  pressedOpacity: {
    opacity: 0.6,
  },
});