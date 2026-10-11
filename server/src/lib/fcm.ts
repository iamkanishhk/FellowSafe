import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from '../config/env.js';

/**
 * Plan §10. `firebase-admin` is initialised lazily from the env service account
 * (already validated and newline-repaired at boot by `config/env.ts`). Init is
 * deliberately non-fatal: an SOS is a database write, and a broken push
 * credential must degrade to `FAILED` writeback, never to a 500 that hides the
 * fact the emergency was recorded.
 */
let app: App | null = null;
let initFailed = false;

function getFcmApp(): App | null {
  if (app) return app;
  if (initFailed) return null;
  try {
    app =
      getApps()[0] ??
      initializeApp({
        credential: cert(env.FIREBASE_SERVICE_ACCOUNT as unknown as ServiceAccount),
      });
    return app;
  } catch (err) {
    initFailed = true;
    console.error('FCM initialisation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export interface FcmSendResult {
  token: string;
  success: boolean;
  errorCode: string | null;
}

/**
 * Data-only, high-priority send. Data-only is what lets `expo-notifications`'
 * background task run even when the app is terminated (Plan.mobile D3); the
 * payload is therefore all strings and carries no coordinates (Plan §10).
 */
export async function sendDataMessage(
  tokens: string[],
  data: Record<string, string>,
): Promise<FcmSendResult[]> {
  if (tokens.length === 0) return [];

  const fcmApp = getFcmApp();
  if (!fcmApp) {
    return tokens.map((token) => ({ token, success: false, errorCode: 'FCM_UNAVAILABLE' }));
  }

  const response = await getMessaging(fcmApp).sendEachForMulticast({
    tokens,
    data,
    android: { priority: 'high' },
  });

  return response.responses.map((result, index) => ({
    token: tokens[index] ?? '',
    success: result.success,
    errorCode: result.error ? result.error.code : null,
  }));
}
