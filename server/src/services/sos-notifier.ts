import { sendDataMessage } from '../lib/fcm.js';
import { deleteDevicesByTokens, listLinkedContactDevices } from '../repos/devices.js';
import { listLinkedContacts, markContactNotified } from '../repos/contacts.js';

/**
 * FCM error codes for a token that will never succeed again, per Plan §10
 * ("prune dead tokens on UNREGISTERED / INVALID_ARGUMENT").
 */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export interface SosAlert {
  ownerUserId: string;
  ownerName: string;
  sosId: string;
  startedAt: Date;
}

/**
 * Plan §10. Fans a data-only SOS alert out to every device of every `LINKED`
 * contact, then writes the per-contact delivery result back so the owner's
 * screen can be honest about who was reachable.
 *
 * A contact with no token is `NO_DEVICE` rather than omitted — that distinction
 * is what makes "not reachable" server truth instead of a client guess.
 */
export async function notifyContactsOfSos(alert: SosAlert): Promise<void> {
  const [contacts, devices] = await Promise.all([
    listLinkedContacts(alert.ownerUserId),
    listLinkedContactDevices(alert.ownerUserId),
  ]);

  const tokensByContact = new Map<string, string[]>();
  for (const device of devices) {
    const existing = tokensByContact.get(device.contact_id);
    if (existing) existing.push(device.fcm_token);
    else tokensByContact.set(device.contact_id, [device.fcm_token]);
  }

  const data: Record<string, string> = {
    type: 'SOS',
    sosId: alert.sosId,
    userName: alert.ownerName,
    startedAt: alert.startedAt.toISOString(),
  };

  await Promise.all(
    contacts.map(async (contact) => {
      const tokens = tokensByContact.get(contact.id) ?? [];

      if (tokens.length === 0) {
        await markContactNotified(contact.id, 'NO_DEVICE');
        return;
      }

      const results = await sendDataMessage(tokens, data);

      const dead = results
        .filter((result) => !result.success && result.errorCode !== null)
        .filter((result) => DEAD_TOKEN_CODES.has(result.errorCode as string))
        .map((result) => result.token);
      if (dead.length > 0) await deleteDevicesByTokens(dead);

      await markContactNotified(contact.id, results.some((r) => r.success) ? 'DELIVERED' : 'FAILED');
    }),
  );
}
