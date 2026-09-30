import { pool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';
import { toE164 } from '../src/lib/e164.js';

if (env.NODE_ENV === 'production' || process.env.ALLOW_SEED !== 'true') {
  console.error('refusing to seed: set ALLOW_SEED=true and NODE_ENV must not be "production"');
  process.exit(1);
}

const userClerkId = process.env.DEMO_USER_CLERK_ID;
const userName = process.env.DEMO_USER_NAME;
const userPhone = process.env.DEMO_USER_PHONE;
const contactName = process.env.DEMO_CONTACT_NAME;
const contactPhone = process.env.DEMO_CONTACT_PHONE;

const missing = Object.entries({ DEMO_USER_CLERK_ID: userClerkId, DEMO_USER_NAME: userName, DEMO_USER_PHONE: userPhone, DEMO_CONTACT_NAME: contactName, DEMO_CONTACT_PHONE: contactPhone })
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  console.error(`missing required env: ${missing.join(', ')}`);
  process.exit(1);
}

const ownerPhone = toE164(userPhone as string);
const contactPhoneE164 = toE164(contactPhone as string);

const user = await pool.query(
  `insert into users (clerk_user_id, name, phone_e164)
   values ($1, $2, $3)
   on conflict (clerk_user_id) do update
     set name = excluded.name, phone_e164 = excluded.phone_e164, updated_at = now()
   returning id, name, phone_e164, phone_verified_at`,
  [userClerkId, userName, ownerPhone],
);

const contact = await pool.query(
  `insert into trusted_contacts (user_id, name, phone_e164, relationship)
   values ($1, $2, $3, $4)
   on conflict (user_id, phone_e164) do update
     set name = excluded.name, relationship = excluded.relationship, updated_at = now()
   returning id, name, phone_e164, status, linked_user_id`,
  [user.rows[0].id, contactName, contactPhoneE164, process.env.DEMO_CONTACT_RELATIONSHIP ?? 'Family'],
);

console.log('user   ', user.rows[0]);
console.log('contact', contact.rows[0]);
if (!user.rows[0].phone_verified_at) {
  console.log('note: phone_verified_at is null — Phone A must complete Clerk phone verification and hit POST /auth/sync before SOS is allowed');
}

await pool.end();
