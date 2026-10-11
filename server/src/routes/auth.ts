import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';
import { toE164 } from '../lib/e164.js';
import { createClerkUserSource, type ClerkUserSource } from '../auth/clerkUserSource.js';
import { autoLinkContactsForPhone, setUserPhone, upsertUserFromClerk } from '../repos/users.js';
import { requireAuth } from '../auth/middleware.js';

const phoneBodySchema = z.object({
  phoneNumber: z.string().trim().min(1).max(32),
});

function projectUser(user: {
  id: string;
  name: string;
  phone_e164: string | null;
  phone_verified_at: Date | null;
  email: string | null;
}) {
  return {
    id: user.id,
    name: user.name,
    phoneE164: user.phone_e164,
    phoneVerified: user.phone_verified_at !== null,
    email: user.email,
  };
}

export function authRouter(clerkUsers: ClerkUserSource = createClerkUserSource()): Router {
  const router = Router();

  /**
   * Plan §9.2. Called on every authenticated launch and the only writer of
   * `users`. Idempotent, so a retry after a network blip converges rather than
   * duplicating.
   */
  router.post('/auth/sync', requireAuth, async (req, res, next) => {
    const clerkUserId = req.clerkUserId;
    if (!clerkUserId) {
      next(HttpError.unauthorized('UNAUTHENTICATED', 'missing clerk session'));
      return;
    }

    try {
      const clerkUser = await clerkUsers.getUser(clerkUserId);
      if (!clerkUser) {
        next(HttpError.unauthorized('UNKNOWN_CLERK_USER', 'clerk user no longer exists'));
        return;
      }

      const user = await upsertUserFromClerk(clerkUser, env.DEFAULT_CALLING_CODE);
      const linked = user.phone_verified_at ? await autoLinkContactsForPhone(user) : [];

      res.json({
        user: projectUser(user),
        linkedContacts: linked.map((c) => ({ id: c.id, ownerName: c.name })),
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Stores the phone number Google sign-in did not supply. The number is
   * captured, not verified: `phone_verified_at` stays null, so it is stored for
   * the profile but grants nothing until a real verification path runs.
   */
  router.post('/auth/phone', requireAuth, async (req, res, next) => {
    const clerkUserId = req.clerkUserId;
    if (!clerkUserId) {
      next(HttpError.unauthorized('UNAUTHENTICATED', 'missing clerk session'));
      return;
    }

    const parsed = phoneBodySchema.safeParse(req.body);
    if (!parsed.success) {
      next(HttpError.badRequest('INVALID_PHONE', 'a phoneNumber is required'));
      return;
    }

    let phoneE164: string;
    try {
      phoneE164 = toE164(parsed.data.phoneNumber, env.DEFAULT_CALLING_CODE);
    } catch {
      next(HttpError.badRequest('INVALID_PHONE', 'phone number could not be normalised'));
      return;
    }

    try {
      const clerkUser = await clerkUsers.getUser(clerkUserId);
      if (!clerkUser) {
        next(HttpError.unauthorized('UNKNOWN_CLERK_USER', 'clerk user no longer exists'));
        return;
      }

      // Google sign-in carries no phone, so the local row may not exist yet on a
      // client that skipped /auth/sync. Upsert first so the update always lands.
      await upsertUserFromClerk(clerkUser, env.DEFAULT_CALLING_CODE);
      const user = await setUserPhone(clerkUserId, phoneE164);
      if (!user) {
        next(HttpError.notFound('USER_NOT_SYNCED', 'call /auth/sync before saving a phone'));
        return;
      }

      res.json({ user: projectUser(user) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
