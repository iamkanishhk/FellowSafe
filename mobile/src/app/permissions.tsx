import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import {
  getPermissionSnapshot,
  isFullyGranted,
  isOnboardingComplete,
  markOnboardingComplete,
  requestPermission,
  requiredKinds,
  type PermissionKind,
  type PermissionSnapshot,
} from "../lib/permissions";
import {
  hasAskedFullScreen,
  markFullScreenAsked,
  openFullScreenIntentSettings,
  supportsFullScreenIntent,
} from "../lib/full-screen-permission";

const BLUE = "#2E7CF6";
const NAVY = "#13203A";
const GREY = "#6B778D";
const GREEN = "#1FA85B";
const ROW_BG = "#FFFFFF";
const ROW_BORDER = "#E6ECF5";

const REQUIRED: PermissionKind[] = requiredKinds();

const ROWS: {
  key: PermissionKind;
  icon: string;
  title: string;
  desc: string;
  androidOnly?: boolean;
}[] = [
  {
    key: "location",
    icon: "📍",
    title: "Location",
    desc: "Share where you are when you raise an alarm.",
  },
  {
    key: "contacts",
    icon: "👥",
    title: "Contacts",
    desc: "See which trusted people already use FellowSafe.",
  },
  {
    key: "notifications",
    icon: "🔔",
    title: "Notifications",
    desc: "Know the moment a loved one needs help.",
  },
  {
    key: "sms",
    icon: "✉️",
    title: "Emergency SMS",
    desc: "Text your trusted contacts automatically when you have no internet.",
    androidOnly: true,
  },
];

function StatusChip({ granted }: { granted: boolean }) {
  return (
    <View style={[styles.chip, granted ? styles.chipOn : styles.chipOff]}>
      <Text style={[styles.chipText, granted ? styles.chipTextOn : styles.chipTextOff]}>
        {granted ? "On" : "Allow"}
      </Text>
    </View>
  );
}

function Row({
  icon,
  title,
  desc,
  granted,
  onPress,
  disabled,
}: {
  icon: string;
  title: string;
  desc: string;
  granted: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || granted}
      accessibilityRole="button"
      accessibilityState={{ selected: granted, disabled: !!disabled || granted }}
      style={({ pressed }) => [
        styles.row,
        granted && styles.rowGranted,
        pressed && !granted && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.rowIcon, granted && styles.rowIconGranted]}>
        <Text style={styles.rowIconGlyph}>{granted ? "✓" : icon}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <StatusChip granted={granted} />
    </Pressable>
  );
}

export default function Permissions() {
  const supportsFullScreen = supportsFullScreenIntent();
  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null);
  const [fullScreenReady, setFullScreenReady] = useState(!supportsFullScreen);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    void getPermissionSnapshot().then((next) => {
      if (active) setSnapshot(next);
    });

    if (supportsFullScreen) {
      void hasAskedFullScreen().then((asked) => {
        if (active) setFullScreenReady(asked);
      });
    }

    // Re-read once the user comes back from a settings screen so a permission
    // granted outside the app is reflected immediately.
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void getPermissionSnapshot().then((next) => {
        if (active) setSnapshot(next);
      });
    });

    return () => {
      active = false;
      sub.remove();
    };
  }, [supportsFullScreen]);

  // Bounced here only when onboarding is genuinely incomplete; if it is done,
  // never strand the user.
  useEffect(() => {
    let active = true;
    void isOnboardingComplete().then((done) => {
      if (active && done) router.replace("/home");
    });
    return () => {
      active = false;
    };
  }, []);

  const requestOne = useCallback(
    async (kind: PermissionKind) => {
      if (!snapshot) return;
      if (!snapshot[kind].granted && !snapshot[kind].canAskAgain) {
        await Linking.openSettings();
        return;
      }
      const next = await requestPermission(kind);
      setSnapshot((s) => (s ? { ...s, [kind]: next } : s));
    },
    [snapshot],
  );

  const enableFullScreen = useCallback(async () => {
    await openFullScreenIntentSettings();
    await markFullScreenAsked();
    setFullScreenReady(true);
  }, []);

  const allGranted = snapshot ? isFullyGranted(snapshot) : false;

  const finish = useCallback(async () => {
    await markOnboardingComplete();
    router.replace("/home");
  }, []);

  const handlePrimary = async () => {
    if (!snapshot || busy) return;

    if (!allRequired(snapshot, fullScreenReady)) {
      setBusy(true);
      let blocked = false;
      for (const kind of REQUIRED) {
        if (snapshot[kind].granted) continue;
        if (snapshot[kind].canAskAgain) {
          await requestPermission(kind);
        } else {
          blocked = true;
        }
      }
      const next = await getPermissionSnapshot();
      setSnapshot(next);

      if (!isFullyGranted(next)) {
        if (blocked) await Linking.openSettings();
        setBusy(false);
        return;
      }
      if (!fullScreenReady && supportsFullScreen) {
        await openFullScreenIntentSettings();
        await markFullScreenAsked();
        setFullScreenReady(true);
        setBusy(false);
        return;
      }
      setBusy(false);
      await finish();
      return;
    }

    await finish();
  };

  const grantedCount = snapshot
    ? REQUIRED.filter((k) => snapshot[k].granted).length
    : 0;
  const primaryLabel = !allGranted
    ? "Allow & Continue"
    : fullScreenReady
      ? "Continue"
      : "Enable full-screen alerts";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="dark" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Before you start</Text>
          <Text style={styles.subtitle}>
            FellowSafe needs a few permissions so it can reach you and your trusted
            contacts in an emergency.
          </Text>
        </View>

        <View style={styles.progressRow}>
          <Text style={styles.progressText}>
            {snapshot ? `${grantedCount} of ${REQUIRED.length} enabled` : "Checking…"}
          </Text>
          <Text style={styles.progressHint}>Required</Text>
        </View>

        <View style={styles.rows}>
          {ROWS.filter((row) => !row.androidOnly || Platform.OS === "android").map(
            (row) => {
              const state = snapshot?.[row.key];
              return (
                <Row
                  key={row.key}
                  icon={row.icon}
                  title={row.title}
                  desc={row.desc}
                  granted={!!state?.granted}
                  onPress={() => void requestOne(row.key)}
                />
              );
            },
          )}

          {supportsFullScreen ? (
            <Row
              icon="🚨"
              title="Full-screen alerts"
              desc="Show emergency alerts over the lock screen."
              granted={fullScreenReady}
              onPress={() => void enableFullScreen()}
            />
          ) : null}
        </View>
      </ScrollView>

      <Text style={styles.footnote}>
        You can change these anytime in your device settings.
      </Text>

      <Pressable
        onPress={() => void handlePrimary()}
        disabled={busy}
        accessibilityRole="button"
        style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

function allRequired(
  snapshot: PermissionSnapshot | null,
  fullScreenReady: boolean,
): boolean {
  return (
    !!snapshot && isFullyGranted(snapshot) && fullScreenReady
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F8FD",
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  header: {
    marginTop: 12,
  },
  title: {
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "800",
    color: NAVY,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: GREY,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 22,
    marginBottom: 10,
  },
  progressText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#33415C",
  },
  progressHint: {
    fontSize: 11.5,
    fontWeight: "700",
    color: BLUE,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  rows: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: ROW_BG,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: ROW_BORDER,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowGranted: {
    borderColor: "#CDEBD9",
    backgroundColor: "#F4FBF6",
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EEF3FC",
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconGranted: {
    backgroundColor: "#E1F5E9",
  },
  rowIconGlyph: {
    fontSize: 19,
    color: NAVY,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15.5,
    fontWeight: "700",
    color: NAVY,
    letterSpacing: -0.2,
  },
  rowDesc: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 17,
    color: GREY,
  },
  chip: {
    minWidth: 62,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  chipOn: {
    backgroundColor: "#E1F5E9",
  },
  chipOff: {
    backgroundColor: BLUE,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  chipTextOn: {
    color: GREEN,
  },
  chipTextOff: {
    color: "#FFFFFF",
  },
  footnote: {
    fontSize: 12,
    color: "#8A94A8",
    textAlign: "center",
    marginBottom: 12,
  },
  primaryBtn: {
    height: 54,
    borderRadius: 14,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    shadowColor: BLUE,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
});
