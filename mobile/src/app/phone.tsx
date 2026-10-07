import { useState } from "react";
import { Text, View, StyleSheet, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";

const BLUE = "#2E7CF6";
const NAVY = "#13203A";
const GREY = "#6B778D";
const FIELD_BORDER = "#E1E8F2";
const KEYPAD_BG = "#EDF1F7";

function IndiaFlag() {
  return (
    <View style={styles.flag}>
      <View style={[styles.flagStripe, { backgroundColor: "#FF9933" }]} />
      <View
        style={[
          styles.flagStripe,
          { backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
        ]}
      >
        <View style={styles.flagChakra} />
      </View>
      <View style={[styles.flagStripe, { backgroundColor: "#138808" }]} />
    </View>
  );
}

function Key({
  main,
  sub,
  onPress,
  dark = false,
}: {
  main: string;
  sub?: string;
  onPress: () => void;
  dark?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.key, pressed && { opacity: 0.6 }]}
    >
      <Text style={[styles.keyMain, dark && { fontSize: 20 }]}>{main}</Text>
      {sub ? <Text style={styles.keySub}>{sub}</Text> : null}
    </Pressable>
  );
}

function formatIndian(num: string) {
  const d = num.replace(/\D/g, "").slice(0, 10);
  if (d.length > 5) return `${d.slice(0, 5)} ${d.slice(5)}`;
  return d;
}

export default function PhoneSetup() {
  const [phone, setPhone] = useState("9876543210");

  const pushDigit = (d: string) =>
    setPhone((p) => (p.replace(/\D/g, "").length >= 10 ? p : p + d));
  const backspace = () => setPhone((p) => p.slice(0, -1));

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

      <Text style={styles.title}>Let’s get you set up.</Text>
      <Text style={styles.subtitle}>
        Enter your phone number to create{"\n"}your Fellow Safe account.
      </Text>

      {/* country selector */}
      <Pressable style={styles.field} accessibilityRole="button">
        <IndiaFlag />
        <Text style={styles.prefix}>+91</Text>
        <View style={styles.divider} />
        <Text style={styles.country}>India</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.chevron}>﹀</Text>
      </Pressable>

      {/* phone input */}
      <View style={styles.field}>
        <Text style={styles.phoneIcon}>◜📞</Text>
        <TextInput
          value={formatIndian(phone)}
          onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
          keyboardType="number-pad"
          placeholder="98765 43210"
          placeholderTextColor="#9AA5B8"
          style={styles.phoneInput}
          maxLength={11}
        />
      </View>

      <Pressable
        style={styles.primaryBtn}
        accessibilityRole="button"
        onPress={() => router.push("/setup")}
      >
        <Text style={styles.primaryBtnText}>Continue</Text>
      </Pressable>

      <View style={styles.secureRow}>
        <View style={styles.lockIcon}>
          <Text style={styles.lockGlyph}>🔒</Text>
        </View>
        <Text style={styles.secureText}>
          Your information is securely protected.
        </Text>
      </View>

      <View style={{ flex: 1 }} />

      {/* custom keypad */}
      <View style={styles.keypad}>
        <View style={styles.keyRow}>
          <Key main="1" onPress={() => pushDigit("1")} />
          <Key main="2" sub="ABC" onPress={() => pushDigit("2")} />
          <Key main="3" sub="DEF" onPress={() => pushDigit("3")} />
        </View>
        <View style={styles.keyRow}>
          <Key main="4" sub="GHI" onPress={() => pushDigit("4")} />
          <Key main="5" sub="JKL" onPress={() => pushDigit("5")} />
          <Key main="6" sub="MNO" onPress={() => pushDigit("6")} />
        </View>
        <View style={styles.keyRow}>
          <Key main="7" sub="PQRS" onPress={() => pushDigit("7")} />
          <Key main="8" sub="TUV" onPress={() => pushDigit("8")} />
          <Key main="9" sub="WXYZ" onPress={() => pushDigit("9")} />
        </View>
        <View style={styles.keyRow}>
          <View style={styles.keyPlain}>
            <Text style={styles.specialChars}>+  *  #</Text>
          </View>
          <Key main="0" onPress={() => pushDigit("0")} />
          <View style={styles.keyPlain}>
            <Pressable
              onPress={backspace}
              style={({ pressed }) => [
                styles.deleteKey,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.deleteGlyph}>⌫</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
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
  title: {
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "800",
    color: NAVY,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: GREY,
    fontWeight: "400",
  },
  field: {
    marginTop: 14,
    height: 52,
    borderWidth: 1.5,
    borderColor: FIELD_BORDER,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  flag: {
    width: 30,
    height: 22,
    borderRadius: 3,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "#D5DCE8",
  },
  flagStripe: {
    flex: 1,
  },
  flagChakra: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#000080",
  },
  prefix: {
    marginLeft: 10,
    fontSize: 15,
    fontWeight: "700",
    color: "#33415C",
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: "#D9E1EE",
    marginHorizontal: 10,
  },
  country: {
    fontSize: 14.5,
    color: "#5B687F",
    fontWeight: "500",
  },
  chevron: {
    fontSize: 16,
    color: "#33415C",
    fontWeight: "700",
  },
  phoneIcon: {
    fontSize: 18,
    color: "#33415C",
    transform: [{ rotate: "-10deg" }],
  },
  phoneInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15.5,
    fontWeight: "600",
    color: "#33415C",
    letterSpacing: 0.4,
  },
  primaryBtn: {
    marginTop: 16,
    height: 52,
    borderRadius: 13,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: BLUE,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secureRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  lockIcon: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  lockGlyph: {
    fontSize: 12,
  },
  secureText: {
    fontSize: 12,
    color: "#8A94A8",
    fontWeight: "500",
  },
  keypad: {
    marginHorizontal: -20,
    backgroundColor: KEYPAD_BG,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 8,
  },
  keyRow: {
    flexDirection: "row",
    gap: 8,
  },
  key: {
    flex: 1,
    height: 46,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#B9C4D6",
    shadowOpacity: 0.35,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  keyMain: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1F2B45",
    lineHeight: 22,
  },
  keySub: {
    fontSize: 8.5,
    fontWeight: "700",
    color: "#8A94A8",
    letterSpacing: 1.2,
    marginTop: 1,
  },
  keyPlain: {
    flex: 1,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  specialChars: {
    fontSize: 13,
    color: "#8A94A8",
    fontWeight: "600",
    letterSpacing: 2,
  },
  deleteKey: {
    width: 44,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteGlyph: {
    fontSize: 22,
    color: "#5B687F",
  },
});
