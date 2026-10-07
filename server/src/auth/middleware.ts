import type { NextFunction, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { HttpError } from '../lib/errors.js';
import { findUserByClerkId, type UserRow } from '../repos/users.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      clerkUserId?: string;
      fellowSafeUser?: UserRow;
    }
  }
}

/**
 * Plan §9. Networkless JWT verification happens in `clerkMiddleware`; this only
 * enforces that a session actually resolved to a Clerk user.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const { userId } = getAuth(req);
  if (!userId) {
    next(HttpError.unauthorized('UNAUTHENTICATED', 'missing or invalid session'));
    return;
  }
  req.clerkUserId = userId;
  next();
}

/**
 * Plan §9.3. The server-side phone gate: every identity-dependent write passes
 * through here, so a client that skips its own gate gets nothing.
 */
export function requireVerifiedPhone(req: Request, _res: Response, next: NextFunction) {
  const user = req.fellowSafeUser;
  if (!user) {
    next(HttpError.unauthorized('UNAUTHENTICATED', 'no resolved user on request'));
    return;
  }
  if (user.phone_verified_at === null) {
    next(
      HttpError.forbidden(
        'PHONE_UNVERIFIED',
        'verify your phone number before using this feature',
      ),
    );
    return;
  }
  next();
}

/**
 * Resolves the Clerk session to a local `users` row. Absence is not an error
 * state for identity — it means the client has not synced yet, and
 * `POST /auth/sync` is the fix.
 */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const clerkUserId = req.clerkUserId;
  if (!clerkUserId) {
    next(HttpError.unauthorized('UNAUTHENTICATED', 'missing clerk session'));
    return;
  }
  try {
    const user = await findUserByClerkId(clerkUserId);
    if (user) req.fellowSafeUser = user;
    next();
  } catch (err) {
    next(err);
  }
}
