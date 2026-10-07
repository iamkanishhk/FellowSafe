import { pool } from '../db/pool.js';
import { toE164 } from '../lib/e164.js';
import type { ClerkUserSnapshot } from '../auth/clerkUserSource.js';

export interface UserRow {
  id: string;
  clerk_user_id: string;
  name: string;
  phone_e164: string | null;
  phone_verified_at: Date | null;
  email: string | null;
}

export interface LinkedContact {
  id: string;
  user_id: string;
  name: string;
}

/**
 * The only writer of `users`, per Plan §9.2.
 *
 * A Clerk session JWT does not carry phone-verification status, so the caller
 * must have just fetched the live Clerk user. `phone_e164` is written only when
 * the *primary* phone is verified: an unverified number must never be able to
 * claim the `users_phone_e164_key` index, or it would squat the one identifier
 * auto-link matches on.
 */
export async function upsertUserFromClerk(
  clerkUser: ClerkUserSnapshot,
  defaultCallingCode: string,
): Promise<UserRow> {
  const verified = clerkUser.primaryPhone?.verified === true;
  let phoneE164: string | null = null;

  if (verified && clerkUser.primaryPhone) {
    try {
      phoneE164 = toE164(clerkUser.primaryPhone.phoneNumber, defaultCallingCode);
    } catch {
      // Clerk can hold a number that is verified but not normalisable for this
      // region. Losing the phone is recoverable (the user re-verifies); failing
      // the whole sync is not, since identity is already proven by the session.
      phoneE164 = null;
    }
  }

  const { rows } = await pool.query<UserRow>(
    `insert into users (clerk_user_id, name, phone_e164, phone_verified_at, email)
     values ($1, $2, $3, case when $3::text is null then null else now() end, $4)
     on conflict (clerk_user_id) do update
       set name = excluded.name,
           phone_e164 = excluded.phone_e164,
           phone_verified_at = excluded.phone_verified_at,
           email = excluded.email,
           updated_at = now()
     returning *`,
    [clerkUser.id, clerkUser.name, phoneE164, clerkUser.email],
  );

  const user = rows[0];
  if (!user) throw new Error(`users upsert for ${clerkUser.id} returned no row`);
  return user;
}

export async function findUserByClerkId(clerkUserId: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>('select * from users where clerk_user_id = $1', [clerkUserId]);
  return rows[0] ?? null;
}

/**
 * Plan §9.4. Idempotent by construction: the `linked_user_id is null` predicate
 * means a repeat sync links nothing more, and `user_id <> $me` stops a user
 * linking themselves as their own contact. One phone may legitimately link to
 * several distinct owners — that is the whole point of the feature.
 */
export async function autoLinkContactsForPhone(me: UserRow, db = pool): Promise<LinkedContact[]> {
  if (me.phone_e164 === null || me.phone_verified_at === null) return [];

  const { rows } = await db.query<LinkedContact>(
    `update trusted_contacts
        set linked_user_id = $1, status = 'LINKED', updated_at = now()
      where phone_e164 = $2
        and status <> 'REMOVED'
        and linked_user_id is null
        and user_id <> $1
      returning id, user_id, name`,
    [me.id, me.phone_e164],
  );

  return rows;
}
