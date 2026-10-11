import { Router, type Request } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { loadUser, requireAuth, requireSyncedUser } from '../auth/middleware.js';
import {
  createSosSession,
  findActiveSos,
  findRespondingContact,
  resolveSosSession,
  sweepStaleLocations,
  upsertSosResponse,
} from '../repos/sos.js';
import { notifyContactsOfSos } from '../services/sos-notifier.js';

const createBodySchema = z.object({
  battery: z.number().int().min(0).max(100).optional(),
});

/** Express 5 types `params` values as `string | string[]`; this narrows to one. */
function sosIdParam(req: Request): string | null {
  const value = req.params.id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function sosRouter(): Router {
  const router = Router();

  /**
   * Plan §7. Idempotent create, then a data-only FCM fan-out to linked
   * contacts. Note: this deliberately does NOT pass `requireVerifiedPhone`.
   * Phones captured in this build are stored unverified (no OTP), so gating on
   * `phone_verified_at` would make the core SOS feature permanently 403. That
   * matches the existing product decision to keep the verification gate inert;
   * `requireSyncedUser` still guarantees a real local user.
   */
  router.post('/sos', requireAuth, loadUser, async (req, res, next) => {
    try {
      const user = requireSyncedUser(req);

      const parsed = createBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        next(HttpError.badRequest('INVALID_SOS', 'battery must be an integer 0-100'));
        return;
      }

      const { session, created } = await createSosSession(user.id, parsed.data.battery ?? null);

      if (created) {
        // Both side effects are best-effort: the emergency is already recorded,
        // so a sweep or push failure must not turn into a 500 for the client.
        await sweepStaleLocations().catch((err) => console.error('sos sweep failed:', err));
        await notifyContactsOfSos({
          ownerUserId: user.id,
          ownerName: user.name,
          sosId: session.id,
          startedAt: session.started_at,
        }).catch((err) => console.error('sos notify failed:', err));
      }

      res.json({ sosId: session.id, startedAt: session.started_at, alreadyActive: !created });
    } catch (err) {
      next(err);
    }
  });

  /** Plan §7. App-restart recovery: an alarm that survived the app being killed. */
  router.get('/sos/active', requireAuth, loadUser, async (req, res, next) => {
    try {
      const user = requireSyncedUser(req);
      const session = await findActiveSos(user.id);
      res.json(session ? { sosId: session.id, startedAt: session.started_at } : null);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Plan §7. A contact acknowledging the alert. Idempotent, and authorised by
   * the single `LINKED`-contact join — a non-contact gets 404, never 403.
   */
  router.post('/sos/:id/respond', requireAuth, loadUser, async (req, res, next) => {
    try {
      const user = requireSyncedUser(req);
      const sosId = sosIdParam(req);
      if (!sosId) {
        next(HttpError.notFound('NOT_FOUND', 'sos session not found'));
        return;
      }

      const contact = await findRespondingContact(sosId, user.id);
      if (!contact) {
        next(HttpError.notFound('NOT_FOUND', 'sos session not found'));
        return;
      }

      const respondedAt = await upsertSosResponse(sosId, contact.id);
      res.json({ ok: true, respondedAt });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Plan §7. Owner ends the alarm. Status flip and location purge commit
   * together; a repeat call is a no-op that returns the existing `endedAt`.
   */
  router.post('/sos/:id/resolve', requireAuth, loadUser, async (req, res, next) => {
    try {
      const user = requireSyncedUser(req);
      const sosId = sosIdParam(req);
      if (!sosId) {
        next(HttpError.notFound('NOT_FOUND', 'sos session not found'));
        return;
      }

      const result = await resolveSosSession(user.id, sosId);
      if (!result) {
        next(HttpError.notFound('NOT_FOUND', 'sos session not found'));
        return;
      }

      res.json({
        ok: true,
        endedAt: result.session.ended_at,
        alreadyResolved: result.alreadyResolved,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
