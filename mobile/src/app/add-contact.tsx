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
import { formatPhone } from "../lib/user-context";

const BLUE = "#2E7CF6";
const NAVY = "#13203A";
const GREY = "#6B778D";
const GREEN = "#3BB57C";
const GREEN_TINT = "#E7F6EF";
const FIELD_BORDER = "#E1E8F2";

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
  onPress,
}: {
  contact: DeviceContact;
  matched: boolean;
  added: boolean;
  adding: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.row, added && styles.rowTrusted]}
      onPress={onPress}
      disabled={adding || added}
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
      {adding ? (
        <ActivityIndicator color={BLUE} />
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
        <Text style={styles.rowAdd}>Add</Text>
      )}
    </Pressable>
  );
}

export default function AddContact() {
  const { listContacts, matchContacts, addContact } = useApi();

  const [permission, setPermission] = useState<PermissionState>("loading");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [matchedPhones, setMatchedPhones] = useState<Record<string, string>>({});
  const [trusted, setTrusted] = useState<TrustedContact[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const loadTrusted = useCallback(async () => {
    try {
      setTrusted(await listContacts());
    } catch {
      // The trusted list is additive; keep the device list usable if it fails.
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

  const trustedPhones = useMemo(
    () => new Set(trusted.map((c) => c.phoneE164)),
    [trusted],
  );

  const trustedRows = useMemo<DeviceContact[]>(
    () =>
      trusted.map((c) => ({
        id: `trusted:${c.id}`,
        name: c.name,
        phoneE164: c.phoneE164,
        phoneRaw: formatPhone(c.phoneE164) ?? c.phoneE164,
      })),
    [trusted],
  );

  const listHeader = useMemo(
    () => (
      <View>
        <View style={styles.header}>
          <Text style={styles.title}>Add Trusted Contact</Text>
          <Text style={styles.subtitle}>
            Pick someone on Fellow Safe to receive an alert when you activate your
            alarm.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Trusted contacts</Text>
        {trustedRows.length === 0 ? (
          <Text style={styles.sectionEmpty}>
            No trusted contacts yet — add one from the list below.
          </Text>
        ) : (
          trustedRows.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              matched={false}
              added
              adding={false}
              onPress={() => {}}
            />
          ))
        )}

        <Text style={styles.sectionTitle}>All contacts</Text>
      </View>
    ),
    [trustedRows],
  );

  if (permission === "loading") {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        <View style={styles.centered}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (permission !== "granted") {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.gate}>
          <View style={styles.gateIcon}>
            <Text style={styles.gateGlyph}>👥</Text>
          </View>
          <Text style={styles.gateTitle}>Find your trusted contacts</Text>
          <Text style={styles.gateSub}>
            Allow access to your contacts so we can show who is already on Fellow
            Safe. Your contacts stay on your device.
          </Text>
          {permission === "denied" && !canAskAgain ? (
            <Pressable style={styles.primaryBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.primaryText}>Open Settings</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.primaryBtn} onPress={requestAccess}>
              <Text style={styles.primaryText}>Allow access</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
        <Text style={styles.backArrow}>←</Text>
      </Pressable>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={BLUE} size="large" />
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
                <Text style={styles.emptyTitle}>No contacts with phone numbers</Text>
                <Text style={styles.emptySub}>
                  Add a number to a device contact, then try again.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <ContactRow
                contact={item}
                matched={item.phoneE164 in matchedPhones}
                added={trustedPhones.has(item.phoneE164)}
                adding={addingId === item.id}
                onPress={() => onPick(item)}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
          <View style={styles.footer}>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => setSheetOpen(true)}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>+ Add more contacts</Text>
            </Pressable>
          </View>
        </>
      )}

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
              <Text style={styles.sheetTitle}>All contacts</Text>
              <Pressable onPress={() => setSheetOpen(false)} hitSlop={10}>
                <Text style={styles.sheetClose}>✕</Text>
              </Pressable>
            </View>
            <FlatList
              data={contacts}
              keyExtractor={(item) => `sheet:${item.id}`}
              renderItem={({ item }) => (
                <ContactRow
                  contact={item}
                  matched={item.phoneE164 in matchedPhones}
                  added={trustedPhones.has(item.phoneE164)}
                  adding={addingId === item.id}
                  onPress={() => onPick(item)}
                />
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              contentContainerStyle={styles.sheetListContent}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
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
  header: {
    marginBottom: 4,
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
  sectionTitle: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 12.5,
    fontWeight: "800",
    color: GREY,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  sectionEmpty: {
    fontSize: 13,
    color: GREY,
    paddingVertical: 4,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 60,
  },
  loadingText: {
    fontSize: 13,
    color: GREY,
  },
  emptyWrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: NAVY,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    color: GREY,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  listContent: {
    paddingBottom: 8,
  },
  separator: {
    height: 1,
    backgroundColor: FIELD_BORDER,
    marginLeft: 60,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginHorizontal: -10,
    borderRadius: 12,
    gap: 12,
  },
  rowTrusted: {
    backgroundColor: GREEN_TINT,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E4EBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTrusted: {
    backgroundColor: "#CDEBDC",
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "800",
    color: BLUE,
  },
  avatarTextTrusted: {
    color: GREEN,
  },
  rowBody: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: "700",
    color: NAVY,
  },
  rowPhone: {
    fontSize: 12.5,
    color: GREY,
    marginTop: 2,
  },
  rowAdd: {
    fontSize: 13.5,
    fontWeight: "700",
    color: BLUE,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: GREEN_TINT,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GREEN,
  },
  badgeText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: GREEN,
  },
  checkBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadgeGlyph: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    marginTop: -1,
  },
  gate: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
    gap: 12,
  },
  gateIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#E4EBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  gateGlyph: {
    fontSize: 34,
  },
  gateTitle: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: "800",
    color: NAVY,
    textAlign: "center",
  },
  gateSub: {
    fontSize: 13,
    lineHeight: 19,
    color: GREY,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  footer: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  primaryBtn: {
    marginTop: 6,
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
    backgroundColor: "rgba(16, 24, 40, 0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: "82%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D8DFEA",
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: NAVY,
  },
  sheetClose: {
    fontSize: 18,
    color: GREY,
    fontWeight: "700",
  },
  sheetListContent: {
    paddingBottom: 12,
  },
});
