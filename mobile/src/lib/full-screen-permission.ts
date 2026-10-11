import { Platform } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const ASKED_KEY = "full_screen_intent_asked_v1";
const FALLBACK_PACKAGE = "com.iam.kanishk.mobile";

/**
 * Android 14+ only lets calling/alarm apps take over the screen by default, so
 * `USE_FULL_SCREEN_INTENT` must be granted by the user for everyone else.
 * Below API 34 the permission is granted at install, so there is nothing to ask.
 */
export function supportsFullScreenIntent(): boolean {
  return Platform.OS === "android" && Number(Platform.Version) >= 34;
}

function packageName(): string {
  return Constants.expoConfig?.android?.package ?? FALLBACK_PACKAGE;
}

/** True once this user has been sent to the full-screen intent setting. */
export async function hasAskedFullScreen(): Promise<boolean> {
  const asked = await SecureStore.getItemAsync(ASKED_KEY).catch(() => null);
  return asked === "1";
}

export async function markFullScreenAsked(): Promise<void> {
  await SecureStore.setItemAsync(ASKED_KEY, "1").catch(() => {});
}

/** Opens the system screen where full-screen notifications can be allowed. */
export async function openFullScreenIntentSettings(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.MANAGE_APP_USE_FULL_SCREEN_INTENT,
      { data: `package:${packageName()}` },
    );
  } catch {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
      { extra: { "android.provider.extra.APP_PACKAGE": packageName() } },
    ).catch(() => {});
  }
}
