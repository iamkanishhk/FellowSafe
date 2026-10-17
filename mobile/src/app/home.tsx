import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import Navbar from "../components/Navbar";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import * as Crypto from "expo-crypto";
import { useCurrentUser } from "../lib/user-context";
import { useApi } from "../lib/api";
import { isOnboardingComplete } from "../lib/permissions";
import { isOnline } from "../lib/connectivity";
import { getContactsCache, saveContactsCache } from "../lib/contacts-cache";
import {
  enqueueSos,
  markSosFlushed,
  markSosSmsResult,
} from "../lib/sos-queue";
import {
  buildSosMessage,
  getBestEffortLocation,
  sendOfflineSms,
} from "../lib/offline-sos";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// iOS Apple Human Interface Guidelines Color System
const C = {
  background: "#F2F2F7", // iOS Grouped Background Light
  surface: "#FFFFFF", // iOS Secondary Grouped Background
  surfaceSecondary: "#F9F9FB",
  textPrimary: "#000000",
  textSecondary: "#3C3C4399", // 60% opacity label
  textTertiary: "#3C3C434D", // 30% opacity label
  separator: "#3C3C4329", // 16% opacity rule
  red: "#FF3B30", // System Red
  redDark: "#D70015",
  redLight: "#FF3B301A", // 10% red tint
  redGlow: "rgba(255, 59, 48, 0.25)",
  green: "#34C759", // System Green
  greenTint: "#34C75918",
  ringTrack: "#E5E5EA",
  blue: "#007AFF", // System Blue
};

const HOLD_DURATION = 1000;
const RING_SIZE = 240;
const BUTTON_RADIUS = 102;
const CIRCUMFERENCE = 2 * Math.PI * BUTTON_RADIUS;

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  const [holding, setHolding] = useState(false);
  const [starting, setStarting] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const holdCompleted = useRef(false);

  const { fullName, firstName, email, phone } = useCurrentUser();
  const { createSos, listContacts } = useApi();

  // Subtle ambient pulse animation for the SOS button when idle
  useEffect(() => {
    let animation: Animated.CompositeAnimation;
    if (!holding && !starting) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => animation?.stop();
  }, [holding, starting, pulseAnim]);

  useEffect(() => {
    let active = true;
    void isOnboardingComplete().then((done) => {
      if (active && !done) router.replace("/permissions");
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!(await isOnline())) return;
      const contacts = await listContacts();
      if (active) {
        await saveContactsCache(contacts);
      }
    })().catch(() => {});

    return () => {
      active = false;
    };
  }, [listContacts]);

  const handleActivate = useCallback(() => {
    if (starting || holdCompleted.current) return;

    holdCompleted.current = true;
    setStarting(true);

    const run = async () => {
      const createdAt = new Date();
      const clientRef = Crypto.randomUUID();

      const [contacts, coords] = await Promise.all([
        getContactsCache(),
        getBestEffortLocation(),
      ]);

      await enqueueSos({
        clientRef,
        createdAt: createdAt.toISOString(),
        coords,
        contacts,
        smsDispatchedAt: null,
        status: "QUEUED",
      });

      if (await isOnline()) {
        const sos = await createSos({
          clientRef,
          createdOfflineAt: createdAt.toISOString(),
          lastLocation: coords,
        });

        await markSosFlushed(clientRef);

        router.push({
          pathname: "/alarm",
          params: {
            sosId: sos.sosId,
            startedAt: sos.startedAt,
          },
        });
        return;
      }

      const message = buildSosMessage(fullName, coords, createdAt);
      const dispatch = await sendOfflineSms(contacts, message);

      await markSosSmsResult(
        clientRef,
        dispatch.ok ? "SMS_SENT" : "SMS_FAILED",
        new Date().toISOString()
      );

      router.push({
        pathname: "/alarm",
        params: {
          offline: "1",
          startedAt: createdAt.toISOString(),
          smsMode: dispatch.mode,
          smsSent: String(dispatch.sent),
          smsTotal: String(dispatch.total),
        },
      });
    };

    run()
      .catch(() => {
        Alert.alert(
          "Couldn't Activate SOS",
          "Your emergency alert could not be completed. Please verify your connection and try again.",
          [{ text: "OK", style: "default" }]
        );
      })
      .finally(() => {
        setStarting(false);
        setHolding(false);
        holdCompleted.current = false;

        progressAnim.setValue(0);
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 15,
          stiffness: 300,
          mass: 0.8,
          useNativeDriver: true,
        }).start();
      });
  }, [starting, fullName, createSos, progressAnim, scaleAnim]);

  const handlePressIn = () => {
    if (starting || holdCompleted.current) return;

    setHolding(true);
    progressAnim.stopAnimation();
    scaleAnim.stopAnimation();
    progressAnim.setValue(0);

    // Native iOS fluid tactile scale response
    Animated.spring(scaleAnim, {
      toValue: 0.94,
      damping: 20,
      stiffness: 380,
      mass: 0.5,
      useNativeDriver: true,
    }).start();

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: HOLD_DURATION,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    setHolding(false);
    progressAnim.stopAnimation();
    scaleAnim.stopAnimation();

    if (!holdCompleted.current) {
      Animated.parallel([
        Animated.timing(progressAnim, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 14,
          stiffness: 280,
          mass: 0.7,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  const secondary = email ?? phone ?? null;
  const displayName = firstName || fullName?.split(" ")[0] || "User";
  const userInitial = displayName.charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <StatusBar style="dark" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* iOS Navigation Bar / Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>f</Text>
            </View>
            <View>
              <Text style={styles.brandName}>Fellow Safe</Text>
            </View>
          </View>

       
        </View>

        {/* iOS Large Title & Greeting Banner */}
        <View style={styles.greetingSection}>
          <Text style={styles.largeTitle}>
            {greetingForHour(new Date().getHours())},
          </Text>
          <Text style={[styles.largeTitle, styles.nameHighlight]}>
            {displayName}.
          </Text>

        </View>

        {/* Emergency SOS Main Activation Center */}
        <View style={styles.emergencySection}>
          <View style={styles.sosWrapper}>
            {/* Ambient Pulse Ring Background */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.outerAura,
                {
                  transform: [
                    { scale: Animated.multiply(scaleAnim, pulseAnim) },
                  ],
                },
              ]}
            />

            {/* Circular Progress Ring Canvas */}
            <View style={styles.ringLayer}>
              <Svg
                width={RING_SIZE}
                height={RING_SIZE}
                viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
              >
                <Defs>
                  <LinearGradient id="sosGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0%" stopColor="#FF453A" />
                    <Stop offset="100%" stopColor="#D70015" />
                  </LinearGradient>
                </Defs>

                {/* Outer Track Ring */}
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={BUTTON_RADIUS}
                  stroke={C.ringTrack}
                  strokeWidth={5}
                  fill="none"
                />

                {/* Animated Fill Ring */}
                <AnimatedCircle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={BUTTON_RADIUS}
                  stroke="url(#sosGrad)"
                  strokeWidth={6}
                  fill="none"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  rotation={-90}
                  originX={RING_SIZE / 2}
                  originY={RING_SIZE / 2}
                />
              </Svg>
            </View>

            {/* Tactile SOS Trigger Button */}
            <Animated.View
              style={[
                styles.buttonScaleContainer,
                { transform: [{ scale: scaleAnim }] },
              ]}
            >
              <Pressable
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onLongPress={handleActivate}
                delayLongPress={HOLD_DURATION}
                disabled={starting}
                accessibilityRole="button"
                accessibilityLabel="Activate SOS Emergency Alert"
                accessibilityHint="Press and hold for 1 second to send emergency location and alert contacts."
                style={({ pressed }) => [
                  styles.sosButton,
                  pressed && styles.sosButtonPressed,
                  starting && styles.sosButtonDisabled,
                ]}
              >
                <View style={styles.sosBadge}>
                  <Text style={styles.sosBadgeText}>SOS</Text>
                </View>

                <Text style={styles.sosTitleText}>
                  {starting
                    ? "DISPATCHING"
                    : holding
                    ? "HOLD TIGHT"
                    : "PRESS & HOLD"}
                </Text>

                <Text style={styles.sosSubtext}>
                  {starting ? "Sending Alert..." : "1 Sec Activation"}
                </Text>
              </Pressable>
            </Animated.View>
          </View>

          {/* Action Instruction Bar */}
          <View style={styles.instructionCard}>
            <View style={styles.instructionIconBg}>
              <Text style={styles.instructionIcon}>⚡</Text>
            </View>

            <View style={styles.instructionTextStack}>
              <Text style={styles.instructionTitle}>
                {holding ? "Hold to dispatch alert" : "Emergency Activation"}
              </Text>
      
            </View>

            <View style={styles.durationBadge}>
              <Text style={styles.durationBadgeText}>1.0s</Text>
            </View>
          </View>
        </View>

        {/* iOS Inset Grouped Section */}
        <View style={styles.groupedSection}>
          <Text style={styles.sectionHeader}>SAFETY NETWORK</Text>

          <View style={styles.insetCard}>
            <View style={styles.cardRow}>
              <View style={[styles.cardIconBox, { backgroundColor: C.greenTint }]}>
                <Text style={[styles.cardIcon, { color: C.green }]}>🛡️</Text>
              </View>

              <View style={styles.cardContentStack}>
                <Text style={styles.cardTitle}>Trusted Contacts</Text>
          
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage trusted contacts"
                onPress={() => router.push("/contacts")}
                style={({ pressed }) => [
                  styles.chevronCircle,
                  pressed && styles.chevronPressed,
                ]}
              >
                <Text style={styles.chevronIcon}>›</Text>
              </Pressable>
            </View>

            <View style={styles.cardDivider} />

            <View style={styles.cardRow}>
              <View style={[styles.cardIconBox, { backgroundColor: C.redLight }]}>
                <Text style={[styles.cardIcon, { color: C.red }]}>📍</Text>
              </View>

              <View style={styles.cardContentStack}>
                <Text style={styles.cardTitle}>Location Transmission</Text>
              </View>

              <View style={styles.activePill}>
                <Text style={styles.activePillText}>Active</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Footnote Reassurance */}
        <View style={styles.footnoteRow}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.footnoteText}>
            End-to-end encrypted emergency dispatches.
          </Text>
        </View>
      </ScrollView>

      {/* Floating Bottom Navigation Container */}
      <View style={styles.navContainer}>
        <Navbar active="home" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },

  // iOS Header Bar
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 16,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 10, // iOS squircle shape
    backgroundColor: C.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    marginTop: -2,
  },
  brandName: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.41,
    color: C.textPrimary,
  },
  brandCaption: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: C.textSecondary,
    marginTop: 1,
  },
  profileAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#E5E5EA",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  profilePressed: {
    opacity: 0.75,
  },
  profileInitial: {
    fontSize: 16,
    fontWeight: "600",
    color: C.textPrimary,
  },

  // iOS Large Title Header Section
  greetingSection: {
    marginTop: 4,
    marginBottom: 20,
  },
  largeTitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: C.textPrimary,
  },
  nameHighlight: {
    color: C.red,
  },
  statusPillRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: C.greenTint,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.green,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: C.green,
  },
  accountSubtext: {
    fontSize: 12,
    color: C.textSecondary,
  },

  // Emergency SOS Ring & Trigger Center
  emergencySection: {
    alignItems: "center",
    marginVertical: 10,
  },
  sosWrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  outerAura: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: C.redGlow,
  },
  ringLayer: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonScaleContainer: {
    width: 196,
    height: 196,
    borderRadius: 98,
  },
  sosButton: {
    flex: 1,
    borderRadius: 98,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.red,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: C.redDark,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 18,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  sosButtonPressed: {
    backgroundColor: C.redDark,
  },
  sosButtonDisabled: {
    opacity: 0.85,
  },
  sosBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    marginBottom: 8,
  },
  sosBadgeText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 1.2,
  },
  sosTitleText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  sosSubtext: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.85)",
  },

  // Instruction Banner Card
  instructionCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: C.surface,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  instructionIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.redLight,
    alignItems: "center",
    justifyContent: "center",
  },
  instructionIcon: {
    fontSize: 16,
  },
  instructionTextStack: {
    flex: 1,
  },
  instructionTitle: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: C.textPrimary,
  },
  instructionSubtitle: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 1,
  },
  durationBadge: {
    backgroundColor: C.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  durationBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textSecondary,
  },

  // iOS Inset Grouped Card Section
  groupedSection: {
    marginTop: 24,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: -0.1,
    color: C.textSecondary,
    marginBottom: 8,
    marginLeft: 12,
  },
  insetCard: {
    backgroundColor: C.surface,
    borderRadius: 18,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardIcon: {
    fontSize: 18,
  },
  cardContentStack: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.24,
    color: C.textPrimary,
  },
  cardSubtext: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 2,
  },
  chevronCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronPressed: {
    backgroundColor: "#E5E5EA",
  },
  chevronIcon: {
    fontSize: 20,
    color: C.textSecondary,
    marginTop: -2,
    marginLeft: 1,
  },
  activePill: {
    backgroundColor: C.greenTint,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.green,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.separator,
    marginLeft: 48,
  },

  // Footnote
  footnoteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 22,
  },
  lockIcon: {
    fontSize: 11,
  },
  footnoteText: {
    fontSize: 12,
    color: C.textSecondary,
    textAlign: "center",
  },

  navContainer: {
    backgroundColor: C.background,
  },
});