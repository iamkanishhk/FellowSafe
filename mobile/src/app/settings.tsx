import { useState } from "react";
import { Text, View, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { Image } from "expo-image";
import { useClerk } from "@clerk/expo";
import Navbar from "../components/Navbar";
import { useCurrentUser } from "../lib/user-context";

const NAVY = "#13203A";
const GREY = "#6B778D";
const BLUE = "#2E7CF6";
const DANGER = "#E5484D";
const FIELD_BORDER = "#E1E8F2";
const HIGHLIGHT_BG = "#EAF1FE";

function Row({
  icon,
  label,
  highlighted = false,
  danger = false,
  onPress,
}: {
  icon: string;
  label: string;
  highlighted?: boolean;
  danger?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, highlighted && styles.rowHighlighted]}
    >
      <Text
        style={[
          styles.rowIcon,
          highlighted && { color: BLUE },
          danger && { color: DANGER },
        ]}
      >
        {icon}
      </Text>
      <Text
        style={[
          styles.rowLabel,
          highlighted && { color: BLUE },
          danger && { color: DANGER },
        ]}
      >
        {label}
      </Text>
      <View style={{ flex: 1 }} />
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );
}

export default function Settings() {
  const { fullName, email, phone, imageUrl, initials } = useCurrentUser();
  const { signOut } = useClerk();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut();
    } finally {
      router.replace("/sign-in");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130 }}
      >

        <Text style={styles.title}>Settings</Text>

        <View style={styles.profileCard}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName} numberOfLines={1}>
              {fullName}
            </Text>
            {email ? (
              <Text style={styles.profileContact} numberOfLines={1}>
                {email}
              </Text>
            ) : null}
            <Text style={styles.profileContact}>
              {phone ?? "Add phone number"}
            </Text>
          </View>
          <Text style={styles.rowChevron}>›</Text>
        </View>

        <Text style={styles.sectionLabel}>Safety</Text>
        <View style={styles.group}>
          <Row
            icon="◯"
            label="Trusted Contacts"
            highlighted
            onPress={() => router.push("/add-contact")}
          />
          <View style={styles.divider} />
          <Row icon="🔔" label="Alarm Settings" />
          <View style={styles.divider} />
          <Row icon="📍" label="Location Sharing" />
          <View style={styles.divider} />
          <Row icon="🛡" label="Emergency Preferences" />
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.group}>
          <Row icon="◯" label="Personal Information" />
          <View style={styles.divider} />
          <Row icon="🔔" label="Notifications" />
          <View style={styles.divider} />
          <Row icon="🛡" label="Privacy & Security" />
          <View style={styles.divider} />
          <Row
            icon="⏻"
            label={loggingOut ? "Logging out…" : "Log out"}
            danger
            onPress={handleLogout}
          />
        </View>

        <Text style={styles.sectionLabel}>Support</Text>
        <View style={styles.group}>
          <Row icon="ⓘ" label="Help & Support" />
        </View>
      </ScrollView>

      <Navbar active="settings" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: NAVY,
    letterSpacing: -0.2,
  },
  profileCard: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.2,
    borderColor: FIELD_BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E4EBFE",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 17,
    fontWeight: "800",
    color: "#2C4A73",
  },
  profileName: {
    fontSize: 15,
    fontWeight: "800",
    color: NAVY,
  },
  profileContact: {
    fontSize: 12.5,
    color: GREY,
    marginTop: 1,
  },
  sectionLabel: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: "800",
    color: NAVY,
    marginBottom: 8,
  },
  group: {
    borderWidth: 1.2,
    borderColor: FIELD_BORDER,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowHighlighted: {
    backgroundColor: HIGHLIGHT_BG,
  },
  rowIcon: {
    fontSize: 17,
    color: "#2C4A73",
    width: 22,
    textAlign: "center",
  },
  rowLabel: {
    fontSize: 13.5,
    fontWeight: "500",
    color: "#2B3852",
  },
  rowChevron: {
    fontSize: 20,
    color: "#9AA5B8",
    fontWeight: "400",
  },
  divider: {
    height: 1,
    backgroundColor: "#EDF1F7",
    marginLeft: 46,
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderWidth: 1.2,
    borderColor: FIELD_BORDER,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 10,
    marginTop: 8,
    shadowColor: "#B9C4D6",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  tabItem: {
    alignItems: "center",
    minWidth: 64,
  },
  tabIcon: {
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 28,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 1,
  },
  tabFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#2C4A73",
    alignItems: "center",
    justifyContent: "center",
  },
  tabPlus: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "400",
    marginTop: -2,
  },
});
