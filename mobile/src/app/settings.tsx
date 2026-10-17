import React, { useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { Image } from "expo-image";
import { useClerk } from "@clerk/expo";
import Navbar from "../components/Navbar";
import { useCurrentUser } from "../lib/user-context";

// Native iOS Color Palette
const COLORS = {
  background: "#F2F2F7", // iOS Grouped Background
  cardBackground: "#FFFFFF",
  textPrimary: "#000000",
  textSecondary: "#8C8C92",
  separator: "#E5E5EA",
  chevron: "#C7C7CC",
  systemBlue: "#007AFF",
  systemRed: "#FF3B30",
};

interface RowProps {
  iconText: string;
  iconBgColor?: string;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
  showDivider?: boolean;
  loading?: boolean;
}

function Row({
  iconText,
  iconBgColor = COLORS.systemBlue,
  label,
  value,
  danger = false,
  onPress,
  showDivider = true,
  loading = false,
}: RowProps) {
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={loading}
        style={({ pressed }) => [
          styles.row,
          pressed && styles.rowPressed,
        ]}
      >
        <View style={[styles.iconContainer, { backgroundColor: danger ? COLORS.systemRed : iconBgColor }]}>
          <Text style={styles.iconSymbol}>{iconText}</Text>
        </View>

        <Text style={[styles.rowLabel, danger && styles.dangerLabel]}>
          {label}
        </Text>

        <View style={styles.spacer} />

        {value ? <Text style={styles.rowValue}>{value}</Text> : null}

        {loading ? (
          <ActivityIndicator size="small" color={COLORS.textSecondary} />
        ) : (
          <Text style={styles.chevron}>›</Text>
        )}
      </Pressable>
      {showDivider && <View style={styles.divider} />}
    </>
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
      router.replace("/sign-in");
    } catch {
      setLoggingOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* iOS Large Title Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* Apple ID Style Profile Section */}
        <View style={styles.group}>
          <Pressable
            onPress={() => router.push("/add-contact")}
            style={({ pressed }) => [
              styles.profileCard,
              pressed && styles.rowPressed,
            ]}
          >
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.avatar}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials ?? "U"}</Text>
              </View>
            )}

            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {fullName || "User Name"}
              </Text>
              <Text style={styles.profileContact} numberOfLines={1}>
                {email || phone || "Apple ID, iCloud, & More"}
              </Text>
            </View>

            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        {/* Safety Section */}
        <Text style={styles.sectionHeader}>SAFETY</Text>
        <View style={styles.group}>
          <Row
            iconText="👥"
            iconBgColor="#007AFF"
            label="Trusted Contacts"
            onPress={() => router.push("/add-contact")}
          />
          <Row
            iconText="⏰"
            iconBgColor="#FF9500"
            label="Alarm Settings"
          />
          <Row
            iconText="📍"
            iconBgColor="#34C759"
            label="Location Sharing"
          />
          <Row
            iconText="🛡️"
            iconBgColor="#AF52DE"
            label="Emergency Preferences"
            showDivider={false}
          />
        </View>

        {/* Account Section */}
        <Text style={styles.sectionHeader}>ACCOUNT</Text>
        <View style={styles.group}>
          <Row
            iconText="👤"
            iconBgColor="#5856D6"
            label="Personal Information"
          />
          <Row
            iconText="🔔"
            iconBgColor="#FF3B30"
            label="Notifications"
          />
          <Row
            iconText="🔒"
            iconBgColor="#8E8E93"
            label="Privacy & Security"
          />
          <Row
            iconText="⏻"
            label={loggingOut ? "Logging out..." : "Log Out"}
            danger
            loading={loggingOut}
            onPress={handleLogout}
            showDivider={false}
          />
        </View>

        {/* Support Section */}
        <Text style={styles.sectionHeader}>SUPPORT</Text>
        <View style={styles.group}>
          <Row
            iconText="ℹ️"
            iconBgColor="#64D2FF"
            label="Help & Support"
            showDivider={false}
          />
        </View>
      </ScrollView>

      <Navbar active="settings" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  header: {
    marginTop: 12,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  group: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    overflow: "hidden",
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "400",
    color: COLORS.textSecondary,
    marginTop: 22,
    marginBottom: 6,
    marginLeft: 12,
    letterSpacing: -0.08,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarFallback: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#E5E5EA",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: "600",
    color: "#8E8E93",
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  profileName: {
    fontSize: 19,
    fontWeight: "600",
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  profileContact: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  rowPressed: {
    backgroundColor: "#E5E5EA",
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconSymbol: {
    fontSize: 14,
  },
  rowLabel: {
    fontSize: 17,
    fontWeight: "400",
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  dangerLabel: {
    color: COLORS.systemRed,
  },
  rowValue: {
    fontSize: 17,
    color: COLORS.textSecondary,
    marginRight: 6,
  },
  chevron: {
    fontSize: 20,
    color: COLORS.chevron,
    fontWeight: "500",
  },
  spacer: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
    marginLeft: 52,
  },
});