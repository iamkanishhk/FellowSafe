import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { ensureAlertChannel } from "./background-alerts";

export interface PushDeviceInfo {
  fcmToken: string;
  platform: "android" | "ios";
}

/**
 * Asks permission (Android 13+), then grabs the native FCM token the server
 * stores against this user. Returns null if the user declined.
 */
export async function getDevicePushInfo(): Promise<PushDeviceInfo | null> {
  try {
    await ensureAlertChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return null;

    const token = await Notifications.getDevicePushTokenAsync();
    if (typeof token.data !== "string" || token.data.length === 0) return null;

    return {
      fcmToken: token.data,
      platform: Platform.OS === "ios" ? "ios" : "android",
    };
  } catch {
    return null;
  }
}