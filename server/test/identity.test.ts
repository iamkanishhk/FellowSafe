import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import { autoLinkContactsForPhone, upsertUserFromClerk } from '../src/repos/users.js';
import type { ClerkUserSnapshot } from '../src/auth/clerkUserSource.js';

const stamp = `test_identity_${process.pid}_${Date.now()}`;
const CC = '91';
const OWNER_PHONE = '+919000000101';
const STRANGER_PHONE = '+919000000102';

function clerkUser(over: Partial<ClerkUserSnapshot> & { id: string }): ClerkUserSnapshot {
  return {
    name: 'Test User',
    email: null,
    primaryPhone: null,
    ...over,
  };
}

const verified = (phoneNumber: string) => ({ id: 'ph_1', phoneNumber, verified: true });
const unverified = (phoneNumber: string) => ({ id: 'ph_1', phoneNumber, verified: false });

describe('identity sync and auto-link', () => {
  const createdUserIds: string[] = [];

  before(async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into users (clerk_user_id, name) values ($1, 'Stranger') returning id`,
      [`${stamp}_stranger`],
    );
    createdUserIds.push(rows[0]!.id);
  });

  after(async () => {
    await pool.query('delete from users where clerk_user_id like $1', [`${stamp}%`]);
    await pool.end();
  });

  it('stores a verified primary phone and stamps phone_verified_at', async () => {
    const user = await upsertUserFromClerk(
      clerkUser({ id: `${stamp}_verified`, name: 'Verified', primaryPhone: verified(OWNER_PHONE) }),
      CC,
    );
    createdUserIds.push(user.id);

    assert.equal(user.phone_e164, OWNER_PHONE);
    assert.ok(user.phone_verified_at, 'phone_verified_at should be set');
  });

  it('refuses to store an unverified phone at all', async () => {
    const user = await upsertUserFromClerk(
      clerkUser({ id: `${stamp}_unverified`, name: 'Unverified', primaryPhone: unverified(OWNER_PHONE) }),
      CC,
    );
    createdUserIds.push(user.id);

    assert.equal(user.phone_e164, null, 'unverified number must not claim the unique index');
    assert.equal(user.phone_verified_at, null, 'unverified number must not pass the gate');
  });

  it('is idempotent across repeated syncs of the same Clerk user', async () => {
    const a = await upsertUserFromClerk(
      clerkUser({ id: `${stamp}_verified`, name: 'Verified', primaryPhone: verified(OWNER_PHONE) }),
      CC,
    );
    const b = await upsertUserFromClerk(
      clerkUser({ id: `${stamp}_verified`, name: 'Verified', primaryPhone: verified(OWNER_PHONE) }),
      CC,
    );
    assert.equal(a.id, b.id, 'same local row, no duplicate identity');
  });

  it('clears the phone when verification is later revoked', async () => {
    const id = `${stamp}_revoked`;
    const before = await upsertUserFromClerk(
      clerkUser({ id, name: 'Revoked', primaryPhone: verified(OWNER_PHONE) }),
      CC,
    );
    assert.equal(before.phone_e164, OWNER_PHONE);

    const after_ = await upsertUserFromClerk(clerkUser({ id, name: 'Revoked' }), CC);
    assert.equal(after_.phone_e164, null, 'losing verification must drop the number');
    assert.equal(after_.phone_verified_at, null, 'and must re-close the phone gate');
  });

  it('links another owner contact whose phone matches, once', async () => {
    const strangerId = createdUserIds[0];

    const match = await pool.query<{ id: string }>(
      `insert into trusted_contacts (user_id, name, phone_e164, status)
       values ($1, 'Match', $2, 'PENDING') returning id`,
      [strangerId, OWNER_PHONE],
    );
    const removed = await pool.query<{ id: string }>(
      `insert into trusted_contacts (user_id, name, phone_e164, status)
       values ($1, 'Removed', $2, 'REMOVED') returning id`,
      [strangerId, OWNER_PHONE],
    );
    const selfContact = await pool.query<{ id: string }>(
      `insert into trusted_contacts (user_id, name, phone_e164, status)
       values ($1, 'Self', $2, 'PENDING') returning id`,
      [strangerId, OWNER_PHONE],
    );

    const owner = await upsertUserFromClerk(
      clerkUser({ id: `${stamp}_linker`, name: 'Linker', primaryPhone: verified(OWNER_PHONE) }),
      CC,
    );

    const linked = await autoLinkContactsForPhone(owner);
    const linkedIds = linked.map((c) => c.id);

    assert.deepEqual(linkedIds, [match.rows[0]!.id], 'only the PENDING match links');
    assert.ok(!linkedIds.includes(removed.rows[0]!.id), 'REMOVED contact must never re-link');
    assert.ok(!linkedIds.includes(selfContact.rows[0]!.id), 'must not treat one phone as two identities twice');

    const again = await autoLinkContactsForPhone(owner);
    assert.equal(again.length, 0, 'auto-link is idempotent by construction');

    const { rows } = await pool.query<{ status: string; linked_user_id: string | null }>(
      `select status, linked_user_id from trusted_contacts where id = $1`,
      [match.rows[0]!.id],
    );
    assert.equal(rows[0]!.status, 'LINKED');
    assert.equal(rows[0]!.linked_user_id, owner.id);
  });

  it('does not auto-link when the incoming user is unverified', async () => {
    const strangerId = createdUserIds[0];
    const pending = await pool.query<{ id: string }>(
      `insert into trusted_contacts (user_id, name, phone_e164, status)
       values ($1, 'Gated', $2, 'PENDING') returning id`,
      [strangerId, STRANGER_PHONE],
    );

    const unverifiedUser = await upsertUserFromClerk(
      clerkUser({ id: `${stamp}_gated`, name: 'Gated', primaryPhone: unverified(STRANGER_PHONE) }),
      CC,
    );

    const linked = await autoLinkContactsForPhone(unverifiedUser);
    assert.equal(linked.length, 0, 'an unverified phone must not claim other owners contacts');

    const { rows } = await pool.query<{ status: string }>(
      'select status from trusted_contacts where id = $1',
      [pending.rows[0]!.id],
    );
    assert.equal(rows[0]!.status, 'PENDING', 'contact must be left untouched');
  });
});
