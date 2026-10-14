import { Router, type Request } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';
import { toE164 } from '../lib/e164.js';
import { loadUser, requireAuth } from '../auth/middleware.js';
import type { UserRow } from '../repos/users.js';
import {
  addTrustedContact,
  findUsersByPhones,
  listTrustedContacts,
  removeTrustedContact,
  type TrustedContactRow,
} from '../repos/contacts.js';

const MAX_MATCH_PHONES = 5000;

const matchBodySchema = z.object({
  phones: z.array(z.string().trim().min(1).max(32)).max(MAX_MATCH_PHONES),
});

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(32),
  relationship: z.string().trim().min(1).max(60).optional(),
});

/** Express 5 types `params` values as `string | string[]`; this narrows to one. */
function contactIdParam(req: Request): string | null {
  const value = req.params.id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The local `users` row is written by `/auth/sync`; contact writes depend on it. */
function requireSyncedUser(req: Request): UserRow {
  const user = req.fellowSafeUser;
  if (!user) {
    throw HttpError.unauthorized('USER_NOT_SYNCED', 'call /auth/sync before managing contacts');
  }
  return user;
}

function projectContact(row: TrustedContactRow) {
  return {
    id: row.id,
    name: row.name,
    phoneE164: row.phone_e164,
    relationship: row.relationship,
    status: row.status,
    linkedUserId: row.linked_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function contactsRouter(): Router {
  const router = Router();

  /** Plan §7. Own contacts, newest first. */
  router.get('/contacts', requireAuth, loadUser, async (req, res, next) => {
    try {
      const user = requireSyncedUser(req);
      const contacts = await listTrustedContacts(user.id);
      res.json({ contacts: contacts.map(projectContact) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Batch "who's already on Fellow Safe" lookup for the address-book badge.
   * Unparseable numbers are skipped rather than failing the whole batch, and the
   * caller's own number is excluded so the client cannot badge itself.
   */
  router.post('/contacts/match', requireAuth, loadUser, async (req, res, next) => {
    try {
      const user = requireSyncedUser(req);

      const parsed = matchBodySchema.safeParse(req.body);
      if (!parsed.success) {
        next(HttpError.badRequest('INVALID_PHONES', 'phones must be an array of strings'));
        return;
      }

      const normalised = new Set<string>();
      for (const raw of parsed.data.phones) {
        try {
          normalised.add(toE164(raw, env.DEFAULT_CALLING_CODE));
        } catch {
          // A number we cannot normalise cannot match any user; skip it.
        }
      }
      if (user.phone_e164) normalised.delete(user.phone_e164);

      const matches = await findUsersByPhones([...normalised]);
      res.json({
        matches: matches.map((u) => ({ phoneE164: u.phone_e164, userId: u.id, name: u.name })),
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Plan §7. Adds a trusted contact, but only when that number belongs to an
   * existing Fellow Safe user — a trusted contact with no app cannot receive an
   * alert, so the client shows an install prompt instead.
   */
  router.post('/contacts', requireAuth, loadUser, async (req, res, next) => {
    try {
      const user = requireSyncedUser(req);

      const parsed = createBodySchema.safeParse(req.body);
      if (!parsed.success) {
        next(HttpError.badRequest('INVALID_CONTACT', 'name and phone are required'));
        return;
      }

      let phoneE164: string;
      try {
        phoneE164 = toE164(parsed.data.phone, env.DEFAULT_CALLING_CODE);
      } catch {
        next(HttpError.badRequest('INVALID_PHONE', 'phone number could not be normalised'));
        return;
      }

      if (phoneE164 === user.phone_e164) {
        next(HttpError.badRequest('CANNOT_ADD_SELF', 'you cannot add your own number as a contact'));
        return;
      }

      const [match] = await findUsersByPhones([phoneE164]);
      if (!match || match.id === user.id) {
        next(
          HttpError.notFound(
            'CONTACT_NOT_ON_APP',
            'this contact needs to install Fellow Safe before they can be added',
          ),
        );
        return;
      }

      const contact = await addTrustedContact({
        userId: user.id,
        name: parsed.data.name,
        phoneE164,
        relationship: parsed.data.relationship ?? null,
        linkedUserId: match.id,
      });

      res.status(201).json({ contact: projectContact(contact) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Plan §7. Removes a trusted contact the user owns. Soft delete: the row is
   * kept as a tombstone so a later auto-link cannot re-add it. Idempotent in the
   * sense that a second removal just reports the contact is gone.
   */
  router.delete('/contacts/:id', requireAuth, loadUser, async (req, res, next) => {
    try {
      const user = requireSyncedUser(req);
      const contactId = contactIdParam(req);
      if (!contactId) {
        next(HttpError.badRequest('CONTACT_ID_REQUIRED', 'a contact id is required'));
        return;
      }
      const removed = await removeTrustedContact(user.id, contactId);
      if (!removed) {
        next(HttpError.notFound('CONTACT_NOT_FOUND', 'no such trusted contact'));
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
