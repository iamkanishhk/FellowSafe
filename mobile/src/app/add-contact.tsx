import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import {
  Contact,
  ContactField,
  getPermissionsAsync,
  requestPermissionsAsync,
} from "expo-contacts";
import {
  ApiError,
  useApi,
  type ContactMatch,
  type TrustedContact,
} from "../lib/api";
import { toE164 } from "../lib/phone";
import { saveContactsCache } from "../lib/contacts-cache";
import { formatPhone } from "../lib/user-context";

// Native iOS Color Palette
const COLORS = {
  background: "#F2F2F7", // iOS Grouped Background
  cardBackground: "#FFFFFF",
  textPrimary: "#000000",
  textSecondary: "#8C8C92",
  separator: "#E5E5EA",
  systemBlue: "#007AFF",
  systemGreen: "#34C759",
  systemRed: "#FF3B30",
  greenTint: "#EAF9EE",
  avatarFallback: "#E5E5EA",
};

const MATCH_BATCH_SIZE = 500;

type PermissionState = "loading" | "granted" | "undetermined" | "denied";

interface DeviceContact {
  id: string;
  name: string;
  phoneE164: string;
  phoneRaw: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function ContactRow({
  contact,
  matched,
  added,
  adding,
  removing,
  onPress,
  onRemove,
  showDivider = true,
}: {
  contact: DeviceContact;
  matched: boolean;
  added: boolean;
  adding: boolean;
  removing?: boolean;
  onPress: () => void;
  onRemove?: () => void;
  showDivider?: boolean;
}) {
  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.row,
          pressed && styles.rowPressed,
        ]}
        onPress={onPress}
        disabled={adding || removing || (added && !onRemove)}
        accessibilityRole="button"
      >
        <View style={[styles.avatar, added && styles.avatarTrusted]}>
          <Text style={[styles.avatarText, added && styles.avatarTextTrusted]}>
            {initialsOf(contact.name)}
          </Text>
        </View>

        <View style={styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={1}>
            {contact.name}
          </Text>
          <Text style={styles.rowPhone} numberOfLines={1}>
            {contact.phoneRaw}
          </Text>
        </View>

        {adding || removing ? (
          <ActivityIndicator color={COLORS.systemBlue} size="small" />
        ) : added && onRemove ? (
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${contact.name} from trusted contacts`}
            style={({ pressed }) => [styles.removeBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        ) : added ? (
          <View style={styles.checkBadge}>
            <Text style={styles.checkBadgeGlyph}>✓</Text>
          </View>
        ) : matched ? (
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>On app</Text>
          </View>
        ) : (
          <View style={styles.addBtn}>
            <Text style={styles.rowAdd}>Add</Text>
          </View>
        )}
      </Pressable>
      {showDivider && <View style={styles.divider} />}
    </>
  );
}

export default function AddContact() {
  const { listContacts, matchContacts, addContact, removeContact } = useApi();

  const [permission, setPermission] = useState<PermissionState>("loading");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [matchedPhones, setMatchedPhones] = useState<Record<string, string>>({});
  const [trusted, setTrusted] = useState<TrustedContact[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const loadTrusted = useCallback(async () => {
    try {
      setTrusted(await listContacts());
    } catch {
      // Best-effort
    }
  }, [listContacts]);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const details = await Contact.getAllDetails([
        ContactField.GIVEN_NAME,
        ContactField.FAMILY_NAME,
        ContactField.PHONES,
      ]);

      const seen = new Set<string>();
      const list: DeviceContact[] = [];
      for (const detail of details) {
        const raw = detail.phones
          .map((p) => p.number)
          .find((n): n is string => typeof n === "string" && toE164(n) !== null);
        if (!raw) continue;
        const phoneE164 = toE164(raw);
        if (!phoneE164) continue;

        const name =
          [detail.givenName, detail.familyName].filter(Boolean).join(" ").trim() ||
          "Unknown contact";
        const key = `${phoneE164}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ id: key, name, phoneE164, phoneRaw: raw });
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      setContacts(list);

      const phones = [...new Set(list.map((c) => c.phoneE164))];
      const found: ContactMatch[] = [];
      for (const batch of chunk(phones, MATCH_BATCH_SIZE)) {
        found.push(...(await matchContacts(batch)));
      }
      const map: Record<string, string> = {};
      for (const m of found) map[m.phoneE164] = m.name;
      setMatchedPhones(map);
    } catch (err) {
      Alert.alert(
        "Couldn't read contacts",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [matchContacts]);

  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void (async () => {
      await loadTrusted();
      try {
        const res = await getPermissionsAsync();
        setCanAskAgain(res.canAskAgain);
        if (res.status === "granted") {
          setPermission("granted");
          await loadContacts();
        } else {
          setPermission(res.status === "denied" ? "denied" : "undetermined");
        }
      } catch {
        setPermission("undetermined");
      }
    })();
  }, [loadContacts, loadTrusted]);

  const requestAccess = useCallback(async () => {
    try {
      const res = await requestPermissionsAsync();
      setCanAskAgain(res.canAskAgain);
      if (res.status === "granted") {
        setPermission("granted");
        await loadContacts();
      } else {
        setPermission("denied");
      }
    } catch {
      Alert.alert("Couldn't request access", "Please try again.");
    }
  }, [loadContacts]);

  const onPick = useCallback(
    async (contact: DeviceContact) => {
      if (addingId) return;
      setAddingId(contact.id);
      try {
        const contactRow = await addContact({
          name: contact.name,
          phone: contact.phoneE164,
        });
        setTrusted((prev) => [
          contactRow,
          ...prev.filter((c) => c.phoneE164 !== contactRow.phoneE164),
        ]);
        setSheetOpen(false);
      } catch (err) {
        if (err instanceof ApiError && err.code === "CONTACT_NOT_ON_APP") {
          Alert.alert(
            "Not on Fellow Safe yet",
            `${contact.name} needs to install the Fellow Safe app before they can be added as a trusted contact.`,
          );
        } else if (err instanceof ApiError && err.code === "CANNOT_ADD_SELF") {
          Alert.alert("That's your number", "You can't add yourself as a trusted contact.");
        } else {
          Alert.alert(
            "Couldn't add contact",
            err instanceof Error ? err.message : "Please try again.",
          );
        }
      } finally {
        setAddingId(null);
      }
    },
    [addContact, addingId],
  );

  const doRemove = useCallback(
    async (contact: TrustedContact) => {
      setRemovingId(contact.id);
      try {
        await removeContact(contact.id);
        setTrusted((prev) => prev.filter((c) => c.id !== contact.id));
        try {
          await saveContactsCache(await listContacts());
        } catch {
          // Best-effort
        }
      } catch (err) {
        Alert.alert(
          "Couldn't remove contact",
          err instanceof Error ? err.message : "Please try again.",
        );
      } finally {
        setRemovingId(null);
      }
    },
    [listContacts, removeContact],
  );

  const onRemove = useCallback(
    (contact: TrustedContact) => {
      Alert.alert(
        "Remove trusted contact",
        `${contact.name} will no longer be alerted when you activate your alarm.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => void doRemove(contact),
          },
        ],
      );
    },
    [doRemove],
  );

  const trustedPhones = useMemo(
    () => new Set(trusted.map((c) => c.phoneE164)),
    [trusted],
  );

  const listHeader = useMemo(
    () => (
      <View>
        <View style={styles.header}>
          <Text style={styles.title}>Add Trusted Contact</Text>
          <Text style={styles.subtitle}>
            Pick someone on Fellow Safe to receive an alert when you activate your alarm.
          </Text>
        </View>

        <Text style={styles.sectionHeader}>TRUSTED CONTACTS</Text>
        <View style={styles.group}>
          {trusted.length === 0 ? (
            <Text style={styles.sectionEmpty}>
              No trusted contacts yet — pick someone from your contacts below.
            </Text>
          ) : (
            trusted.map((c, index) => (
              <ContactRow
                key={c.id}
                contact={{
                  id: `trusted:${c.id}`,
                  name: c.name,
                  phoneE164: c.phoneE164,
                  phoneRaw: formatPhone(c.phoneE164) ?? c.phoneE164,
                }}
                matched={false}
                added
                adding={false}
                removing={removingId === c.id}
                onPress={() => {}}
                onRemove={() => onRemove(c)}
                showDivider={index < trusted.length - 1}
              />
            ))
          )}
        </View>

        <Text style={styles.sectionHeader}>ALL CONTACTS</Text>
      </View>
    ),
    [onRemove, removingId, trusted],
  );

  if (permission === "loading") {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StatusBar style="dark" />
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.systemBlue} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (permission !== "granted") {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StatusBar style="dark" />
        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.gate}>
          <View style={styles.gateIcon}>
            <Text style={styles.gateGlyph}>👥</Text>
          </View>
          <Text style={styles.gateTitle}>Find Your Trusted Contacts</Text>
          <Text style={styles.gateSub}>
            Allow access to your contacts so we can show who is already on Fellow Safe. Your contacts stay on your device.
          </Text>
          {permission === "denied" && !canAskAgain ? (
            <Pressable style={styles.primaryBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.primaryText}>Open Settings</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.primaryBtn} onPress={requestAccess}>
              <Text style={styles.primaryText}>Allow Access</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="dark" />
      
      {/* iOS Top Navigation Bar */}
      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>Settings</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.systemBlue} size="large" />
          <Text style={styles.loadingText}>Reading your contacts…</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={contacts}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No contacts found</Text>
                <Text style={styles.emptySub}>
                  Add a phone number to a device contact, then try again.
                </Text>
              </View>
            }
            renderItem={({ item, index }) => (
              <View style={index === 0 ? styles.groupTop : index === contacts.length - 1 ? styles.groupBottom : styles.groupMiddle}>
                <ContactRow
                  contact={item}
                  matched={item.phoneE164 in matchedPhones}
                  added={trustedPhones.has(item.phoneE164)}
                  adding={addingId === item.id}
                  onPress={() => onPick(item)}
                  showDivider={index < contacts.length - 1}
                />
              </View>
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />

          <View style={styles.footer}>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
              onPress={() => setSheetOpen(true)}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>Browse All Contacts</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* iOS Sheet Modal */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <View style={styles.sheetWrap}>
          <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Contact</Text>
              <Pressable onPress={() => setSheetOpen(false)} hitSlop={10} style={styles.sheetCloseBtn}>
                <Text style={styles.sheetClose}>✕</Text>
              </Pressable>
            </View>
            
            <View style={styles.sheetGroup}>
              <FlatList
                data={contacts}
                keyExtractor={(item) => `sheet:${item.id}`}
                renderItem={({ item, index }) => (
                  <ContactRow
                    contact={item}
                    matched={item.phoneE164 in matchedPhones}
                    added={trustedPhones.has(item.phoneE164)}
                    adding={addingId === item.id}
                    onPress={() => onPick(item)}
                    showDivider={index < contacts.length - 1}
                  />
                )}
                contentContainerStyle={styles.sheetListContent}
                showsVerticalScrollIndicator={false}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  navBar: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  backArrow: {
    fontSize: 28,
    color: COLORS.systemBlue,
    fontWeight: "300",
    marginTop: -2,
  },
  backLabel: {
    fontSize: 17,
    color: COLORS.systemBlue,
    marginLeft: 2,
    letterSpacing: -0.4,
  },
  header: {
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 19,
    color: COLORS.textSecondary,
    letterSpacing: -0.1,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "400",
    color: COLORS.textSecondary,
    marginTop: 18,
    marginBottom: 6,
    marginLeft: 16,
    letterSpacing: -0.08,
  },
  group: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  groupTop: {
    backgroundColor: COLORS.cardBackground,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  groupMiddle: {
    backgroundColor: COLORS.cardBackground,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  groupBottom: {
    backgroundColor: COLORS.cardBackground,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  sectionEmpty: {
    fontSize: 14,
    color: COLORS.textSecondary,
    padding: 16,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  emptyWrap: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 32,
    marginHorizontal: 16,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  listContent: {
    paddingBottom: 24,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
    marginLeft: 62,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 52,
    backgroundColor: COLORS.cardBackground,
  },
  rowPressed: {
    backgroundColor: "#E5E5EA",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.avatarFallback,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTrusted: {
    backgroundColor: COLORS.greenTint,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  avatarTextTrusted: {
    color: COLORS.systemGreen,
  },
  rowBody: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  rowName: {
    fontSize: 17,
    fontWeight: "400",
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  rowPhone: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: "#EBF3FF",
  },
  rowAdd: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.systemBlue,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.greenTint,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.systemGreen,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.systemGreen,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.systemGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadgeGlyph: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
  },
  removeText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.systemRed,
  },
  gate: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  gateIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#EBF3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  gateGlyph: {
    fontSize: 36,
  },
  gateTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.textPrimary,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  gateSub: {
    fontSize: 15,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
  },
  primaryBtn: {
    width: "100%",
    height: 50,
    borderRadius: 12,
    backgroundColor: COLORS.systemBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPressed: {
    opacity: 0.8,
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: "85%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#C7C7CC",
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  sheetCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E5E5EA",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetClose: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "700",
  },
  sheetGroup: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  sheetListContent: {
    paddingBottom: 16,
  },
});