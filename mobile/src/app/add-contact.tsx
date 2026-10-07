import { useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";

const BLUE = "#2E7CF6";
const NAVY = "#13203A";
const GREY = "#6B778D";
const FIELD_BORDER = "#E1E8F2";
const GREEN = "#3BB57C";

function MiniFlag() {
  return (
    <View style={styles.miniFlag}>
      <View style={[styles.flagStripe, { backgroundColor: "#FF9933" }]} />
      <View style={[styles.flagStripe, { backgroundColor: "#FFFFFF" }]} />
      <View style={[styles.flagStripe, { backgroundColor: "#138808" }]} />
    </View>
  );
}

function ContactAvatar() {
  return (
    <View style={styles.cardAvatar}>
      <View style={styles.cardAvatarHair} />
      <View style={styles.cardAvatarHead} />
      <View style={styles.cardAvatarBody} />
    </View>
  );
}

function FormState({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("Priya Sharma");
  const [phone, setPhone] = useState("98765 43210");
  const [relation, setRelation] = useState("Sister");
  const [picked, setPicked] = useState(true);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 16 }}
    >
      <Text style={styles.title}>Add Trusted Contact</Text>
      <Text style={styles.subtitle}>
        Choose someone you trust to receive{"\n"}an alert when you activate your
        alarm.
      </Text>

      <Text style={styles.label}>Contact Name</Text>
      <View style={styles.input}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Full name"
          placeholderTextColor="#9AA5B8"
          style={styles.inputText}
        />
      </View>

      <Text style={styles.label}>Phone Number</Text>
      <View style={styles.phoneRow}>
        <View style={[styles.input, styles.prefixBox]}>
          <MiniFlag />
          <Text style={styles.prefixText}>+91</Text>
          <Text style={styles.smallChevron}>﹀</Text>
        </View>
        <View style={[styles.input, { flex: 1 }]}>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="98765 43210"
            placeholderTextColor="#9AA5B8"
            keyboardType="number-pad"
            style={styles.inputText}
          />
        </View>
      </View>

      <Text style={styles.label}>
        Relationship <Text style={styles.optional}>(optional)</Text>
      </Text>
      <View style={styles.input}>
        <TextInput
          value={relation}
          onChangeText={setRelation}
          placeholder="e.g. Sister"
          placeholderTextColor="#9AA5B8"
          style={[styles.inputText, { flex: 1 }]}
        />
        <Text style={styles.smallChevron}>﹀</Text>
      </View>

      <Pressable
        style={styles.outlineBtn}
        onPress={() => {
          setPicked(true);
          setName("Priya Sharma");
          setPhone("98765 43210");
        }}
      >
        <Text style={styles.outlineIcon}>👥</Text>
        <Text style={styles.outlineText}>Choose from contacts</Text>
      </Pressable>

      {picked ? (
        <View style={styles.contactCard}>
          <ContactAvatar />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>Priya Sharma</Text>
            <Text style={styles.cardPhone}>+91 98765 43210</Text>
            <Text style={styles.cardRel}>Sister</Text>
          </View>
          <Pressable
            onPress={() => setPicked(false)}
            hitSlop={10}
            style={styles.cardX}
          >
            <Text style={styles.cardXText}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.ctaRow}>
        <Pressable
          style={styles.cancelBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={styles.addBtn} onPress={onAdded}>
          <Text style={styles.addText}>Add Contact</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function SuccessState({
  onView,
  onAddAnother,
}: {
  onView: () => void;
  onAddAnother: () => void;
}) {
  return (
    <View style={styles.successWrap}>
      <View style={styles.checkWrap}>
        <Text style={styles.sparkle1}>✦</Text>
        <Text style={styles.sparkle2}>✦</Text>
        <Text style={styles.sparkle3}>✦</Text>
        <View style={styles.checkCircle}>
          <Text style={styles.checkGlyph}>✓</Text>
        </View>
      </View>
      <Text style={styles.successTitle}>Trusted contact added.</Text>
      <Text style={styles.successSub}>
        Priya Sharma will be notified when{"\n"}you activate your alarm.
      </Text>
      <Pressable style={styles.primaryBtn} onPress={onView}>
        <Text style={styles.primaryText}>View Trusted Contacts</Text>
      </Pressable>
      <Pressable onPress={onAddAnother} hitSlop={10}>
        <Text style={styles.linkText}>Add another contact</Text>
      </Pressable>
    </View>
  );
}

export default function AddContact() {
  const [done, setDone] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <Pressable
        onPress={() => (done ? setDone(false) : router.back())}
        hitSlop={12}
        style={styles.backBtn}
      >
        <Text style={styles.backArrow}>←</Text>
      </Pressable>
      {done ? (
        <SuccessState
          onView={() => router.push("/home")}
          onAddAnother={() => setDone(false)}
        />
      ) : (
        <FormState onAdded={() => setDone(true)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
  },
  backBtn: {
    width: 30,
    height: 30,
    justifyContent: "center",
    marginBottom: 10,
  },
  backArrow: {
    fontSize: 22,
    color: NAVY,
    fontWeight: "600",
    marginTop: -3,
  },
  title: {
    fontSize: 21,
    fontWeight: "800",
    color: NAVY,
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: GREY,
  },
  label: {
    marginTop: 14,
    fontSize: 12.5,
    fontWeight: "700",
    color: "#2B3852",
    marginBottom: 6,
  },
  optional: {
    fontWeight: "400",
    color: "#8A94A8",
  },
  input: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: FIELD_BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    backgroundColor: "#FFFFFF",
  },
  inputText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "600",
    color: "#2B3852",
  },
  phoneRow: {
    flexDirection: "row",
    gap: 8,
  },
  prefixBox: {
    width: 108,
    gap: 6,
  },
  prefixText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#33415C",
  },
  smallChevron: {
    fontSize: 13,
    color: "#7C8AA0",
    fontWeight: "700",
  },
  miniFlag: {
    width: 20,
    height: 14,
    borderRadius: 2,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "#D5DCE8",
  },
  flagStripe: {
    flex: 1,
  },
  outlineBtn: {
    marginTop: 12,
    height: 46,
    borderWidth: 1.2,
    borderColor: "#C9D9F8",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  outlineIcon: {
    fontSize: 15,
  },
  outlineText: {
    fontSize: 13,
    fontWeight: "700",
    color: BLUE,
  },
  contactCard: {
    marginTop: 12,
    borderWidth: 1.2,
    borderColor: FIELD_BORDER,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E4EBFE",
    overflow: "hidden",
    alignItems: "center",
  },
  cardAvatarHair: {
    position: "absolute",
    top: 2,
    width: 32,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#1E2735",
  },
  cardAvatarHead: {
    marginTop: 9,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#F5C39D",
  },
  cardAvatarBody: {
    marginTop: 2,
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#7C9BF0",
  },
  cardName: {
    fontSize: 14,
    fontWeight: "800",
    color: NAVY,
  },
  cardPhone: {
    fontSize: 12,
    color: "#5B687F",
    marginTop: 1,
  },
  cardRel: {
    fontSize: 12,
    color: "#8A94A8",
    marginTop: 1,
  },
  cardX: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E3E9F2",
    alignItems: "center",
    justifyContent: "center",
  },
  cardXText: {
    fontSize: 11,
    color: "#7C8AA0",
    fontWeight: "700",
  },
  ctaRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: "#C9D9F8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  cancelText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#2B3852",
  },
  addBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: BLUE,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  addText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  successWrap: {
    flex: 1,
    alignItems: "center",
    paddingTop: 60,
  },
  checkWrap: {
    width: 140,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#4CB782",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: GREEN,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  checkGlyph: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "800",
    marginTop: -3,
  },
  sparkle1: {
    position: "absolute",
    top: 6,
    right: 28,
    fontSize: 12,
    color: GREEN,
  },
  sparkle2: {
    position: "absolute",
    top: 44,
    right: 4,
    fontSize: 14,
    color: GREEN,
  },
  sparkle3: {
    position: "absolute",
    bottom: 12,
    left: 14,
    fontSize: 12,
    color: GREEN,
  },
  successTitle: {
    marginTop: 18,
    fontSize: 20,
    fontWeight: "800",
    color: NAVY,
    textAlign: "center",
  },
  successSub: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: GREY,
    textAlign: "center",
  },
  primaryBtn: {
    marginTop: 26,
    width: "100%",
    height: 50,
    borderRadius: 12,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: BLUE,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "700",
  },
  linkText: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: "600",
    color: BLUE,
  },
});
