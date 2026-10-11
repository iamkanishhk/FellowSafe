import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import notifee, {
  AndroidCategory,
  AndroidVisibility,
  EventType,
} from "@notifee/react-native";
import { router, type Href } from "expo-router";

export const ALERT_TASK = "fellowsafe-sos-alerts";
export const ALERT_CHANNEL_ID = "fellowsafe-sos-alerts";

export type AlertKind = "SOS" | "SOS_RESOLVED" | "RESPONSE";

export interface AlertMessage {
  kind: AlertKind;
  sosId: string;
  userName: string;
  startedAt: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Pulls an alert out of a background-task payload.
 *
 * We send data-only FCM, so on Android the payload is the raw
 * `RemoteMessage` bundle with our keys flat on `payload.data`. A tap on an
 * expo-notifications notification instead arrives as a `NotificationResponse`
 * (which has `actionIdentifier`) and carries no alert here — notifee owns taps.
 */
export function readAlert(payload: unknown): AlertMessage | null {
  const outer = asRecord(payload);
  if (!outer || "actionIdentifier" in outer) return null;

  const data = asRecord(outer.data);
  if (!data) return null;

  const kind = asString(data.type);
  const sosId = asString(data.sosId);
  if (kind !== "SOS" && kind !== "SOS_RESOLVED" && kind !== "RESPONSE") {
    return null;
  }
  if (!sosId) return null;

  return {
    kind,
    sosId,
    userName: asString(data.userName) ?? "A trusted contact",
    startedAt: asString(data.startedAt),
  };
}

/**
 * The channel must exist before the Android 13+ permission prompt, and its
 * importance is what lets the alert interrupt. Created via expo-notifications
 * so the same id is used for the push token; notifee then renders into it.
 */
export async function ensureAlertChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
    name: "Emergency alerts",
    importance: Notifications.AndroidImportance.MAX,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: [300, 500, 300, 500],
    lightColor: "#FF3B30",
    bypassDnd: true,
  });
}

/** Renders an incoming alert. `SOS` escalates to a call-style full-screen takeover. */
export async function displayAlert(alert: AlertMessage): Promise<void> {
  await ensureAlertChannel().catch(() => {});

  const isSos = alert.kind === "SOS";
  const title = isSos
    ? `🚨 ${alert.userName} needs help`
    : alert.kind === "RESPONSE"
      ? `${alert.userName} is responding`
      : "Alarm cancelled";
  const body = isSos
    ? "Emergency alarm activated. Tap to respond."
    : alert.kind === "RESPONSE"
      ? "A trusted contact acknowledged the alarm."
      : "The alarm has been resolved.";

  await notifee.displayNotification({
    id: alert.sosId,
    title,
    body,
    data: { sosId: alert.sosId, kind: alert.kind, userName: alert.userName },
    android: {
      channelId: ALERT_CHANNEL_ID,
      category: isSos ? AndroidCategory.CALL : AndroidCategory.ALARM,
      visibility: AndroidVisibility.PUBLIC,
      color: "#FF3B30",
      ongoing: isSos,
      autoCancel: !isSos,
      showTimestamp: true,
      pressAction: { id: "default", launchActivity: "default" },
      ...(isSos ? { fullScreenAction: { id: "default" } } : {}),
    },
  });
}

function openAlert(sosId: unknown): void {
  if (typeof sosId !== "string" || sosId.length === 0) return;
  router.push({
    pathname: "/respond",
    params: { sosId },
  } as Href);
}

/**
 * Registers the headless handler that turns a data-only push into a visible
 * alert, in every app state. Safe to call more than once.
 */
export function registerBackgroundAlerts(): void {
  if (!TaskManager.isTaskDefined(ALERT_TASK)) {
    TaskManager.defineTask<Notifications.NotificationTaskPayload>(
      ALERT_TASK,
      async ({ data, error }) => {
        if (error) return Notifications.BackgroundNotificationTaskResult.NoData;
        const alert = readAlert(data);
        if (alert) await displayAlert(alert).catch(() => {});
        return Notifications.BackgroundNotificationTaskResult.NoData;
      },
    );
  }

  void Notifications.registerTaskAsync(ALERT_TASK).catch(() => {});

  // Tap handling. Foreground is reliable; the background hook only runs when
  // registered from the JS entry, so this is best-effort in the bundled app.
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
      openAlert(detail.notification?.data?.sosId);
    }
  });

  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
      openAlert(detail.notification?.data?.sosId);
    }
  });
}
