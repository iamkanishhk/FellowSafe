import { pool } from '../db/pool.js';

export type TrustedContactStatus = 'PENDING' | 'LINKED' | 'REMOVED';

export interface TrustedContactRow {
  id: string;
  user_id: string;
  name: string;
  phone_e164: string;
  relationship: string | null;
  status: TrustedContactStatus;
  linked_user_id: string | null;
  last_notified_at: Date | null;
  last_notify_result: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MatchedUser {
  id: string;
  name: string;
  phone_e164: string;
}

/**
 * Plan §7. A user's own trusted contacts, newest first. `REMOVED` rows are the
 * soft-delete tombstone, so they never surface here — but they stay behind so a
 * later `/auth/sync` auto-link cannot resurrect a contact the user dropped.
 */
export async function listTrustedContacts(userId: string, db = pool): Promise<TrustedContactRow[]> {
  const { rows } = await db.query<TrustedContactRow>(
    `select *
       from trusted_contacts
      where user_id = $1
        and status <> 'REMOVED'
      order by created_at desc`,
    [userId],
  );
  return rows;
}

/**
 * Plan §10. The contacts eligible to receive an SOS alert: `LINKED` only, since
 * a `PENDING` contact has no app user to route a push to.
 */
export async function listLinkedContacts(
  userId: string,
  db = pool,
): Promise<TrustedContactRow[]> {
  const { rows } = await db.query<TrustedContactRow>(
    `select *
       from trusted_contacts
      where user_id = $1
        and status = 'LINKED'
      order by created_at desc`,
    [userId],
  );
  return rows;
}

/**
 * Plan §10 delivery writeback. Stored per contact, not per device, so the
 * owner's "not reachable" placeholder reflects the contact, not a token.
 */
export async function markContactNotified(
  contactId: string,
  result: 'DELIVERED' | 'NO_DEVICE' | 'FAILED',
  db = pool,
): Promise<void> {
  await db.query(
    `update trusted_contacts
        set last_notified_at = now(),
            last_notify_result = $2,
            updated_at = now()
      where id = $1`,
    [contactId, result],
  );
}

/**
 * Resolves a batch of address-book numbers to the Fellow Safe users who own
 * them, for the "already on the app" badge. Deliberately matches on
 * `phone_e164` regardless of `phone_verified_at`: a number captured in-app is
 * unverified but still identifies its owner, and gating the badge on verification
 * would hide every contact added after Google sign-in.
 */
export async function findUsersByPhones(phones: string[], db = pool): Promise<MatchedUser[]> {
  if (phones.length === 0) return [];
  const { rows } = await db.query<MatchedUser>(
    `select id, name, phone_e164
       from users
      where phone_e164 = any($1::text[])`,
    [phones],
  );
  return rows;
}

export interface AddTrustedContactInput {
  userId: string;
  name: string;
  phoneE164: string;
  relationship: string | null;
  linkedUserId: string;
}

/**
 * Adds (or re-adds) a trusted contact that is already a Fellow Safe user. The
 * `(user_id, phone_e164)` unique index makes this idempotent: tapping the same
 * contact twice converges on one row rather than duplicating, and a previously
 * `REMOVED` contact is revived with its link restored.
 */
export async function addTrustedContact(
  input: AddTrustedContactInput,
  db = pool,
): Promise<TrustedContactRow> {
  const { rows } = await db.query<TrustedContactRow>(
    `insert into trusted_contacts (user_id, name, phone_e164, relationship, status, linked_user_id)
     values ($1, $2, $3, $4, 'LINKED', $5)
     on conflict (user_id, phone_e164) do update
       set name = excluded.name,
           relationship = excluded.relationship,
           status = 'LINKED',
           linked_user_id = excluded.linked_user_id,
           updated_at = now()
     returning *`,
    [input.userId, input.name, input.phoneE164, input.relationship, input.linkedUserId],
  );

  const contact = rows[0];
  if (!contact) throw new Error(`trusted_contacts add for ${input.userId} returned no row`);
  return contact;
}

/**
 * Plan §7. Removes a trusted contact by soft-deleting it to `REMOVED`, so the
 * tombstone survives and a later `/auth/sync` auto-link cannot silently revive a
 * contact the user chose to drop. Scoped to the owner, so one user can never
 * remove another user's contact. Returns false when there was nothing to remove.
 */
export async function removeTrustedContact(
  userId: string,
  contactId: string,
  db = pool,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `update trusted_contacts
        set status = 'REMOVED',
            linked_user_id = null,
            updated_at = now()
      where id = $1
        and user_id = $2
        and status <> 'REMOVED'`,
    [contactId, userId],
  );
  return (rowCount ?? 0) > 0;
}
