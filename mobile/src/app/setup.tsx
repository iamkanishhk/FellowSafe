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
const LIGHT_BLUE_BG = "#EAF1FE";

function ProgressHeader({
  step,
  total,
  onBack,
}: {
  step: number;
  total: number;
  onBack: () => void;
}) {
  const pct = step / total;
  return (
    <View style={styles.headerRow}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
        <Text style={styles.backArrow}>←</Text>
      </Pressable>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { flex: pct }]} />
        <View style={{ flex: 1 - pct }} />
      </View>
      <Text style={styles.stepLabel}>
        {step} of {total}
      </Text>
    </View>
  );
}

function LabeledField({
  label,
  value,
  onChange,
  placeholder,
  icon,
  right,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  icon: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.fieldBox}>
      <Text style={styles.fieldIcon}>{icon}</Text>
      <View style={styles.fieldTextWrap}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#9AA5B8"
          style={styles.fieldValue}
        />
      </View>
      {right}
    </View>
  );
}

function ProfileStep({ onNext }: { onNext: () => void }) {
  const [name, setName] = useState("Alex Johnson");
  const [location, setLocation] = useState("Bengaluru, Karnataka");

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        <Text style={styles.title}>Tell us a little about you.</Text>

        <View style={{ height: 18 }} />

        <LabeledField
          label="Full name"
          value={name}
          onChange={setName}
          placeholder="Full name"
          icon="◯"
        />

        <LabeledField
          label="Location"
          value={location}
          onChange={setLocation}
          placeholder="City, State"
          icon="📍"
          right={
            location.length > 0 ? (
              <Pressable onPress={() => setLocation("")} hitSlop={10}>
                <Text style={styles.clearX}>✕</Text>
              </Pressable>
            ) : undefined
          }
        />

        <Pressable
          style={styles.outlineBtn}
          onPress={() => setLocation("Bengaluru, Karnataka")}
        >
          <Text style={styles.outlinePin}>📍</Text>
          <Text style={styles.outlineBtnText}>Use current location</Text>
        </Pressable>

        <Text style={styles.helper}>
          Your location helps us provide better{"\n"}emergency support when you
          need it.
        </Text>
      </ScrollView>

      <Pressable style={styles.primaryBtn} onPress={onNext}>
        <Text style={styles.primaryBtnText}>Continue</Text>
      </Pressable>
    </View>
  );
}

function ContactStep({ onBackTo }: { onBackTo: () => void }) {
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [picked, setPicked] = useState(true);

  void onBackTo;

  const pickContact = () => {
    setPicked(true);
    setContactName("Priya Sharma");
    setContactPhone("98765 43210");
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 12 }}
      >
        <Text style={styles.title}>Who should we alert?</Text>
        <Text style={styles.subtitle}>
          Add a trusted person who can be notified when you activate an
          emergency alarm.
        </Text>

        <View style={styles.photoWrap}>
          <View style={styles.photoCircle}>
            <Text style={styles.cameraIcon}>📷</Text>
          </View>
          <Pressable hitSlop={8}>
            <Text style={styles.addPhoto}>Add photo</Text>
          </Pressable>
        </View>

        <Text style={styles.inputLabel}>Contact name</Text>
        <View style={styles.simpleField}>
          <Text style={styles.simpleIcon}>◯</Text>
          <TextInput
            value={contactName}
            onChangeText={setContactName}
            placeholder="e.g. Priya Sharma"
            placeholderTextColor="#9AA5B8"
            style={styles.simpleInput}
          />
        </View>

        <Text style={styles.inputLabel}>Phone number</Text>
        <View style={styles.simpleField}>
          <Text style={styles.simpleIcon}>▢</Text>
          <Text style={styles.prefixInline}>+91</Text>
          <TextInput
            value={contactPhone}
            onChangeText={setContactPhone}
            placeholder="98765 43210"
            placeholderTextColor="#9AA5B8"
            keyboardType="number-pad"
            style={styles.simpleInput}
          />
        </View>

        <Pressable style={styles.outlineBtn} onPress={pickContact}>
          <Text style={styles.outlinePin}>👥</Text>
          <Text style={styles.outlineBtnText}>Pick from contacts</Text>
        </Pressable>

        {picked ? (
          <View style={styles.contactCard}>
            <View style={styles.cardAvatar}>
              <View style={styles.cardAvatarHead} />
              <View style={styles.cardAvatarHair} />
              <View style={styles.cardAvatarBody} />
            </View>
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
      </ScrollView>

      <View style={styles.bottomRow}>
        <Pressable hitSlop={12} onPress={() => router.push("/permissions")}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
        <Pressable
          style={styles.fab}
          accessibilityRole="button"
          onPress={() => router.push("/permissions")}
        >
          <Text style={styles.fabArrow}>→</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function Setup() {
  const [step, setStep] = useState<2 | 3>(2);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <ProgressHeader
        step={step}
        total={4}
        onBack={() => (step === 3 ? setStep(2) : router.back())}
      />
      {step === 2 ? (
        <ProfileStep onNext={() => setStep(3)} />
      ) : (
        <ContactStep onBackTo={() => setStep(2)} />
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  backBtn: {
    width: 28,
    height: 28,
    justifyContent: "center",
  },
  backArrow: {
    fontSize: 22,
    color: NAVY,
    fontWeight: "600",
    marginTop: -3,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E8EDF5",
    flexDirection: "row",
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: BLUE,
    borderRadius: 3,
  },
  stepLabel: {
    fontSize: 12.5,
    color: "#8A94A8",
    fontWeight: "500",
    minWidth: 34,
    textAlign: "right",
  },
  title: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "800",
    color: NAVY,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13.5,
    lineHeight: 19,
    color: GREY,
  },
  fieldBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: FIELD_BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    backgroundColor: "#FFFFFF",
  },
  fieldIcon: {
    fontSize: 20,
    color: "#7C8AA0",
    width: 26,
    textAlign: "center",
  },
  fieldTextWrap: {
    flex: 1,
    marginLeft: 8,
  },
  fieldLabel: {
    fontSize: 11.5,
    color: "#8A94A8",
    fontWeight: "500",
  },
  fieldValue: {
    fontSize: 14.5,
    fontWeight: "600",
    color: "#2B3852",
    paddingVertical: 1,
  },
  clearX: {
    fontSize: 14,
    color: "#9AA5B8",
    paddingHorizontal: 4,
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
    backgroundColor: "#FFFFFF",
  },
  outlinePin: {
    fontSize: 15,
    color: BLUE,
  },
  outlineBtnText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: BLUE,
  },
  helper: {
    marginTop: 14,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#8A94A8",
  },
  primaryBtn: {
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
  photoWrap: {
    alignItems: "center",
    marginTop: 16,
    marginBottom: 6,
  },
  photoCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: LIGHT_BLUE_BG,
    borderWidth: 1.5,
    borderColor: "#D3E1FA",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraIcon: {
    fontSize: 26,
  },
  addPhoto: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: BLUE,
  },
  inputLabel: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "700",
    color: "#2B3852",
    marginBottom: 6,
  },
  simpleField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: FIELD_BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: "#FFFFFF",
  },
  simpleIcon: {
    fontSize: 15,
    color: "#8A94A8",
  },
  prefixInline: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "700",
    color: "#5B687F",
  },
  simpleInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
    color: "#2B3852",
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
    backgroundColor: "#FFFFFF",
  },
  cardAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E4EBFE",
    overflow: "hidden",
    alignItems: "center",
  },
  cardAvatarHair: {
    position: "absolute",
    top: 2,
    width: 34,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#1E2735",
  },
  cardAvatarHead: {
    marginTop: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F5C39D",
  },
  cardAvatarBody: {
    marginTop: 2,
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#BFD0F5",
  },
  cardName: {
    fontSize: 14.5,
    fontWeight: "800",
    color: NAVY,
  },
  cardPhone: {
    fontSize: 12.5,
    color: "#5B687F",
    marginTop: 1,
  },
  cardRel: {
    fontSize: 12.5,
    color: "#8A94A8",
    marginTop: 1,
  },
  cardX: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#E3E9F2",
    alignItems: "center",
    justifyContent: "center",
  },
  cardXText: {
    fontSize: 12,
    color: "#7C8AA0",
    fontWeight: "700",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  skipText: {
    fontSize: 14,
    color: "#8A94A8",
    fontWeight: "500",
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: BLUE,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  fabArrow: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "600",
    marginTop: -2,
  },
});
