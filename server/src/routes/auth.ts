import { Router } from 'express';
import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';
import { createClerkUserSource, type ClerkUserSource } from '../auth/clerkUserSource.js';
import { autoLinkContactsForPhone, upsertUserFromClerk } from '../repos/users.js';
import { requireAuth } from '../auth/middleware.js';

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
        user: {
          id: user.id,
          name: user.name,
          phoneE164: user.phone_e164,
          phoneVerified: user.phone_verified_at !== null,
          email: user.email,
        },
        linkedContacts: linked.map((c) => ({ id: c.id, ownerName: c.name })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
