import { pool } from '../db/pool.js';

export interface DeviceRow {
  id: string;
  user_id: string;
  fcm_token: string;
  platform: string;
  last_seen_at: Date | null;
}

export interface ContactDevice {
  contact_id: string;
  fcm_token: string;
}

/**
 * Plan §7. Idempotent by construction: `fcm_token` is unique, so re-registering
 * the same device (a relaunch, or a token rotation that lands twice) converges
 * on one row instead of erroring.
 */
export async function upsertDevice(
  input: { userId: string; fcmToken: string; platform: string },
  db = pool,
): Promise<DeviceRow> {
  const { rows } = await db.query<DeviceRow>(
    `insert into devices (user_id, fcm_token, platform, last_seen_at)
     values ($1, $2, $3, now())
     on conflict (fcm_token) do update
       set user_id = excluded.user_id,
           platform = excluded.platform,
           last_seen_at = now(),
           updated_at = now()
     returning *`,
    [input.userId, input.fcmToken, input.platform],
  );

  const device = rows[0];
  if (!device) throw new Error(`devices upsert for ${input.userId} returned no row`);
  return device;
}

/**
 * Plan §10 fan-out. Every device token belonging to a contact the owner has
 * `LINKED`. Filtering on `status = 'LINKED'` at send time is what makes
 * revocation immediate: a soft-deleted contact is silently excluded.
 */
export async function listLinkedContactDevices(
  ownerUserId: string,
  db = pool,
): Promise<ContactDevice[]> {
  const { rows } = await db.query<ContactDevice>(
    `select tc.id as contact_id, d.fcm_token
       from trusted_contacts tc
       join devices d on d.user_id = tc.linked_user_id
      where tc.user_id = $1
        and tc.status = 'LINKED'
        and tc.linked_user_id is not null`,
    [ownerUserId],
  );
  return rows;
}

/** Plan §10. Dead tokens are pruned rather than retried forever. */
export async function deleteDevicesByTokens(tokens: string[], db = pool): Promise<void> {
  if (tokens.length === 0) return;
  await db.query('delete from devices where fcm_token = any($1::text[])', [tokens]);
}
