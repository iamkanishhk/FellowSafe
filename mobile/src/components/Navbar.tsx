import { Text, View, StyleSheet, Pressable, Platform } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ACCENT_BLUE = "#007AFF";
const TEXT_SECONDARY = "#8E8E93";

type Tab = "home" | "settings";

export default function Navbar({ active }: { active?: Tab }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const current: Tab =
    active ?? (pathname.includes("settings") ? "settings" : "home");

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <View style={styles.row}>
        {/* Main navbar */}
        <View style={styles.navbar}>
          {/* HOME */}
          <Pressable
            onPress={() => router.push("/home")}
            style={({ pressed }) => [
              styles.tab,
              current === "home" && styles.activeTab,
              pressed && styles.pressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{
              selected: current === "home",
            }}
          >
            <Text
              style={[
                styles.icon,
                {
                  color:
                    current === "home"
                      ? ACCENT_BLUE
                      : TEXT_SECONDARY,
                },
              ]}
            >
              ⌂
            </Text>

            <Text
              style={[
                styles.label,
                {
                  color:
                    current === "home"
                      ? ACCENT_BLUE
                      : TEXT_SECONDARY,
                },
              ]}
            >
              Home
            </Text>
          </Pressable>

          {/* SETTINGS */}
          <Pressable
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [
              styles.tab,
              current === "settings" && styles.activeTab,
              pressed && styles.pressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{
              selected: current === "settings",
            }}
          >
            <Text
              style={[
                styles.icon,
                {
                  color:
                    current === "settings"
                      ? ACCENT_BLUE
                      : TEXT_SECONDARY,
                },
              ]}
            >
              ⚙
            </Text>

            <Text
              style={[
                styles.label,
                {
                  color:
                    current === "settings"
                      ? ACCENT_BLUE
                      : TEXT_SECONDARY,
                },
              ]}
            >
              Settings
            </Text>
          </Pressable>
        </View>

        {/* PLUS */}
        <Pressable
          onPress={() => router.push("/add-contact")}
          style={({ pressed }) => [
            styles.plusButton,
            pressed && styles.plusPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add trusted contact"
        >
          <Text style={styles.plus}>＋</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * Fixed bottom container
   */
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,

    paddingHorizontal: 14,

    zIndex: 100,
    elevation: 100,
  },

  /*
   * Keeps navbar + button aligned
   */
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  /*
   * Main glass pill
   */
  navbar: {
    flex: 1,
    height: 72,

    flexDirection: "row",
    alignItems: "center",

    backgroundColor: "rgba(255, 255, 255, 0.72)",

    borderRadius: 36,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.95)",

    paddingHorizontal: 6,

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.10,
        shadowRadius: 20,
        shadowOffset: {
          width: 0,
          height: 8,
        },
      },
      android: {
        elevation: 8,
      },
    }),
  },

  /*
   * Each tab gets equal space
   */
  tab: {
    flex: 1,
    height: 60,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 30,
  },

  /*
   * Floating glass highlight around active tab
   */
  activeTab: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",

    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.95)",

    ...Platform.select({
      ios: {
        shadowColor: "#8A8A8A",
        shadowOpacity: 0.10,
        shadowRadius: 12,
        shadowOffset: {
          width: 0,
          height: 4,
        },
      },
      android: {
        elevation: 3,
      },
    }),
  },

  icon: {
    fontSize: 22,
    lineHeight: 25,
    fontWeight: "600",
  },

  label: {
    marginTop: 2,

    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
  },

  pressed: {
    opacity: 0.6,
  },

  /*
   * Separate circular + button
   */
  plusButton: {
    width: 72,
    height: 72,

    flexShrink: 0,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 36,

    backgroundColor: "rgba(255, 255, 255, 0.72)",

    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.95)",

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.10,
        shadowRadius: 20,
        shadowOffset: {
          width: 0,
          height: 8,
        },
      },
      android: {
        elevation: 8,
      },
    }),
  },

  plusPressed: {
    transform: [{ scale: 0.92 }],
  },

  plus: {
    color: "#1C1C1E",

    fontSize: 32,
    lineHeight: 36,
    fontWeight: "300",

    marginTop: -2,
  },
});
