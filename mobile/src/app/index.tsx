import { useEffect } from "react";
import { ActivityIndicator, Text, View, StyleSheet, Pressable,Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useApi } from "../lib/api";
import { isOnboardingComplete } from "../lib/permissions";

export default function Onboarding() {
  const { isLoaded, isSignedIn } = useAuth();
  const { syncUser } = useApi();

  // A returning, already-signed-in user should skip onboarding. Sync first so
  // we know whether their phone was captured and permissions granted.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const { user } = await syncUser();
        const complete = await isOnboardingComplete();
        if (cancelled) return;
        if (!user.phoneE164) router.replace("/phone");
        else if (!complete) router.replace("/permissions");
        else router.replace("/home");
      } catch {
        if (!cancelled) router.replace("/home");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, syncUser]);

  if (isLoaded && isSignedIn) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        <View style={styles.restoring}>
          <ActivityIndicator color={BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <Image source={require("../public/1.png")} style={styles.illusWrap} />

      <View style={styles.copyWrap}>
        <Text style={styles.title}>Feel safer,{"\n"}wherever you go.</Text>
        <Text style={styles.subtitle}>
          Fellow Safe helps you quickly alert the people you trust when you need
          help.
        </Text>
      </View>

      <View style={styles.dotsRow}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>

      <View style={styles.footer}>
        <Pressable
          style={styles.primaryBtn}
          accessibilityRole="button"
          onPress={() => router.push("/sign-in")}
        >
          <Text style={styles.primaryBtnText}>Get Started</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          hitSlop={12}
          onPress={() => router.push("/sign-in")}
        >
          <Text style={styles.linkText}>I already have an account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const BLUE = "#2E7CF6";
const NAVY = "#13203A";
const GREY = "#6B778D";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
  },
  restoring: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  illusWrap: {
    height: 352,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
  },
  blobLarge: {
    position: "absolute",
    top: 18,
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: "#F0F4FF",
  },
  blobLeft: {
    position: "absolute",
    left: 6,
    top: 110,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#F3F6FF",
  },
  blobRight: {
    position: "absolute",
    right: 2,
    top: 96,
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "#EFF3FF",
  },
  blobSmallLeft: {
    position: "absolute",
    left: 28,
    top: 168,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F2F5FF",
  },
  blobSmallRight: {
    position: "absolute",
    right: 64,
    top: 46,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F2F5FF",
  },
  pathDot1: {
    position: "absolute",
    left: 78,
    top: 88,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#E3EAFB",
  },
  pathDot2: {
    position: "absolute",
    left: 98,
    top: 72,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#E3EAFB",
  },
  pathDot3: {
    position: "absolute",
    right: 96,
    top: 140,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#E3EAFB",
  },
  shieldOuter: {
    position: "absolute",
    top: 22,
    width: 118,
    height: 134,
    backgroundColor: "#6E9AFF",
    borderRadius: 22,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    alignItems: "center",
    paddingTop: 12,
    // simulate shield taper via overflow child
    overflow: "hidden",
  },
  shieldInner: {
    width: 84,
    height: 96,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 6,
    borderColor: "#B9CFFF",
    borderRadius: 16,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  shieldHeart: {
    color: "#FFFFFF",
    fontSize: 28,
    marginTop: -4,
    fontWeight: "900",
  },
  miniAvatarOuter: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E4EBFE",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    overflow: "hidden",
    alignItems: "center",
    shadowColor: "#9DB4E8",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },
  miniAvatarHead: {
    marginTop: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#F5C39D",
  },
  miniAvatarHair: {
    position: "absolute",
    top: 4,
    width: 28,
    height: 20,
    borderRadius: 14,
    backgroundColor: "#1E2735",
  },
  miniAvatarBody: {
    marginTop: 2,
    width: 36,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#4E85F5",
  },
  avatarLeft: { left: 4, top: 98 },
  avatarTopRight: { right: 8, top: 54 },
  avatarRight: { right: 0, top: 128 },
  pinWrap: {
    position: "absolute",
    right: 72,
    top: 164,
    alignItems: "center",
    width: 36,
    height: 56,
  },
  pinCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#6E9AFF",
    alignItems: "center",
    justifyContent: "center",
  },
  pinHole: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
  },
  pinTail: {
    marginTop: -6,
    width: 16,
    height: 16,
    backgroundColor: "#6E9AFF",
    transform: [{ rotate: "45deg" }],
    borderBottomRightRadius: 4,
  },
  womanWrap: {
    width: 200,
    height: 260,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  hairBack: {
    position: "absolute",
    bottom: 88,
    width: 148,
    height: 168,
    borderRadius: 74,
    backgroundColor: "#1D2838",
  },
  hairBackLeft: {
    position: "absolute",
    left: 18,
    bottom: 98,
    width: 48,
    height: 110,
    borderRadius: 24,
    backgroundColor: "#1D2838",
    transform: [{ rotate: "-12deg" }],
  },
  hairBackRight: {
    position: "absolute",
    right: 18,
    bottom: 98,
    width: 48,
    height: 118,
    borderRadius: 24,
    backgroundColor: "#1D2838",
    transform: [{ rotate: "10deg" }],
  },
  neck: {
    position: "absolute",
    bottom: 108,
    width: 28,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#EAB18A",
  },
  hoodie: {
    position: "absolute",
    bottom: 0,
    width: 172,
    height: 124,
    backgroundColor: "#5F92FF",
    borderTopLeftRadius: 62,
    borderTopRightRadius: 62,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    alignItems: "center",
    shadowColor: "#5F92FF",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 3,
  },
  hoodieCollarLeft: {
    position: "absolute",
    top: 6,
    left: 58,
    width: 24,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#4A7DEF",
  },
  hoodieCollarRight: {
    position: "absolute",
    top: 6,
    right: 58,
    width: 24,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#4A7DEF",
  },
  stringLeft: {
    position: "absolute",
    top: 34,
    left: 78,
    width: 3,
    height: 32,
    borderRadius: 1.5,
    backgroundColor: "#DCE7FF",
  },
  stringRight: {
    position: "absolute",
    top: 34,
    right: 78,
    width: 3,
    height: 32,
    borderRadius: 1.5,
    backgroundColor: "#DCE7FF",
  },
  strapLeft: {
    position: "absolute",
    bottom: 18,
    left: 48,
    width: 20,
    height: 88,
    borderRadius: 10,
    backgroundColor: "#2E3848",
  },
  strapRight: {
    position: "absolute",
    bottom: 18,
    right: 48,
    width: 20,
    height: 88,
    borderRadius: 10,
    backgroundColor: "#2E3848",
  },
  strapBuckleLeft: {
    position: "absolute",
    bottom: 58,
    left: 46,
    width: 24,
    height: 18,
    borderRadius: 4,
    backgroundColor: "#1A2230",
  },
  face: {
    position: "absolute",
    bottom: 132,
    width: 74,
    height: 84,
    borderRadius: 37,
    backgroundColor: "#F9C49E",
    alignItems: "center",
    overflow: "hidden",
  },
  eyeLeft: {
    position: "absolute",
    top: 38,
    left: 18,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#1E2735",
  },
  eyeRight: {
    position: "absolute",
    top: 38,
    right: 18,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#1E2735",
  },
  blush: {
    position: "absolute",
    top: 48,
    right: 14,
    width: 10,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F0A284",
    opacity: 0.7,
  },
  mouth: {
    position: "absolute",
    bottom: 18,
    width: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#C97B62",
  },
  hairTop: {
    position: "absolute",
    bottom: 190,
    width: 88,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1D2838",
  },
  hairFrontLeft: {
    position: "absolute",
    bottom: 138,
    left: 58,
    width: 22,
    height: 72,
    borderRadius: 11,
    backgroundColor: "#1D2838",
    transform: [{ rotate: "8deg" }],
  },
  hairFrontRight: {
    position: "absolute",
    bottom: 138,
    right: 58,
    width: 22,
    height: 72,
    borderRadius: 11,
    backgroundColor: "#1D2838",
    transform: [{ rotate: "-8deg" }],
  },
  copyWrap: {
    marginTop: 6,
  },
  title: {
    fontSize: 31,
    lineHeight: 37,
    fontWeight: "800",
    color: NAVY,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14.5,
    lineHeight: 21,
    color: GREY,
    fontWeight: "400",
    maxWidth: 310,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 28,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#DDE6F5",
  },
  dotActive: {
    backgroundColor: BLUE,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footer: {
    marginTop: 22,
    paddingBottom: 10,
  },
  primaryBtn: {
    height: 54,
    borderRadius: 14,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: BLUE,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  linkText: {
    marginTop: 16,
    textAlign: "center",
    color: BLUE,
    fontSize: 13.5,
    fontWeight: "600",
  },
});
