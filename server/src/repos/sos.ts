import { pool } from '../db/pool.js';

export type SosStatus = 'ACTIVE' | 'RESOLVED';

export interface SosSessionRow {
  id: string;
  user_id: string;
  status: SosStatus;
  started_at: Date;
  ended_at: Date | null;
  last_latitude: number | null;
  last_longitude: number | null;
  last_accuracy: number | null;
  last_speed: number | null;
  last_location_at: Date | null;
  battery_level: number | null;
}

export async function findActiveSos(userId: string, db = pool): Promise<SosSessionRow | null> {
  const { rows } = await db.query<SosSessionRow>(
    `select * from sos_sessions where user_id = $1 and status = 'ACTIVE'`,
    [userId],
  );
  return rows[0] ?? null;
}

export interface CreateSosResult {
  session: SosSessionRow;
  created: boolean;
}

/**
 * Plan §7. Idempotent create: `on conflict … do nothing` targets the partial
 * `sos_one_active_per_user` index, so a double-tap or a retry after a slow
 * network converges on the existing session instead of producing a second one
 * and a duplicate FCM blast. A no-op insert means a session already exists, so
 * we read it back.
 */
export async function createSosSession(
  userId: string,
  batteryLevel: number | null,
): Promise<CreateSosResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');

    const inserted = await client.query<SosSessionRow>(
      `insert into sos_sessions (user_id, battery_level)
       values ($1, $2)
       on conflict (user_id) where status = 'ACTIVE' do nothing
       returning *`,
      [userId, batteryLevel],
    );

    const created = inserted.rows[0];
    if (created) {
      await client.query('commit');
      return { session: created, created: true };
    }

    const existing = await client.query<SosSessionRow>(
      `select * from sos_sessions where user_id = $1 and status = 'ACTIVE'`,
      [userId],
    );
    await client.query('commit');

    const session = existing.rows[0];
    if (!session) throw new Error(`active sos for ${userId} vanished during create`);
    return { session, created: false };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export interface ResolveSosResult {
  session: SosSessionRow;
  alreadyResolved: boolean;
}

/**
 * Plan §7. Owner-only, and one transaction: status flip and location purge
 * commit together, so there is no window where a resolved session still has a
 * trail. A zero-row update means the session is already resolved (or was never
 * the caller's) — the follow-up select distinguishes the two.
 */
export async function resolveSosSession(
  userId: string,
  sosId: string,
): Promise<ResolveSosResult | null> {
  const client = await pool.connect();
  try {
    await client.query('begin');

    const updated = await client.query<SosSessionRow>(
      `update sos_sessions
          set status = 'RESOLVED', ended_at = now()
        where id = $1 and user_id = $2 and status = 'ACTIVE'
        returning *`,
      [sosId, userId],
    );

    let session = updated.rows[0];
    let alreadyResolved = false;

    if (!session) {
      const existing = await client.query<SosSessionRow>(
        `select * from sos_sessions where id = $1 and user_id = $2`,
        [sosId, userId],
      );
      session = existing.rows[0];
      if (!session) {
        await client.query('rollback');
        return null;
      }
      alreadyResolved = true;
    }

    await client.query('delete from sos_locations where sos_id = $1', [sosId]);
    await client.query('commit');
    return { session, alreadyResolved };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

/** Plan §7 retention. Bounded lazy sweep; no cron required. */
export async function sweepStaleLocations(db = pool): Promise<void> {
  await db.query(`delete from sos_locations where recorded_at < now() - interval '2 hours'`);
}

export interface RespondingContact {
  id: string;
  user_id: string;
}

/**
 * Plan §7. Resolves the caller's `trusted_contacts` row for this session's
 * owner. Only a `LINKED` contact of that owner has one, which is the whole
 * authorisation check for `respond`.
 */
export async function findRespondingContact(
  sosId: string,
  callerUserId: string,
  db = pool,
): Promise<RespondingContact | null> {
  const { rows } = await db.query<RespondingContact>(
    `select tc.id, tc.user_id
       from trusted_contacts tc
       join sos_sessions s on s.user_id = tc.user_id
      where s.id = $1
        and tc.linked_user_id = $2
        and tc.status = 'LINKED'`,
    [sosId, callerUserId],
  );
  return rows[0] ?? null;
}

/** Plan §7. Idempotent upsert — a contact tapping "I'm on my way" twice is one receipt. */
export async function upsertSosResponse(
  sosId: string,
  contactId: string,
  db = pool,
): Promise<Date> {
  const { rows } = await db.query<{ responded_at: Date }>(
    `insert into sos_responses (sos_id, contact_id)
     values ($1, $2)
     on conflict (sos_id, contact_id) do update set responded_at = now()
     returning responded_at`,
    [sosId, contactId],
  );
  const receipt = rows[0];
  if (!receipt) throw new Error(`sos response upsert for ${sosId} returned no row`);
  return receipt.responded_at;
}
