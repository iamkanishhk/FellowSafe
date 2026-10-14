import { Router, type Request } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { loadUser, requireAuth, requireSyncedUser } from '../auth/middleware.js';
import {
  createSosSession,
  findActiveSos,
  findRespondingContact,
  findSosForViewer,
  latestLocation,
  recordLocation,
  resolveSosSession,
  sweepStaleLocations,
  upsertSosResponse,
} from '../repos/sos.js';
import { emitSosLocation, emitSosResolved } from '../realtime/io.js';
import { notifyContactsOfSos } from '../services/sos-notifier.js';

const createBodySchema = z.object({
  battery: z.number().int().min(0).max(100).optional(),
});

const locationBodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  // The location task reports unavailable sensors (heading/speed/accuracy) and a
  // not-yet-read battery as `null`, and `LocationInput` stores `number | null`,
  // so these must accept null as well as an omitted key.
  accuracy: z.number().nonnegative().nullish(),
  speed: z.number().nullish(),
  heading: z.number().min(0).max(360).nullish(),
  battery: z.number().int().min(0).max(100).nullish(),
  recordedAt: z.string().min(1).nullish(),
});

/** Device clocks lie; a bad timestamp falls back to server time rather than 500. */
function coerceRecordedAt(raw: string | undefined): Date {
  if (!raw) return new Date();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

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

      emitSosResolved(sosId, result.session.ended_at?.toISOString() ?? null);

      res.json({
        ok: true,
        endedAt: result.session.ended_at,
        alreadyResolved: result.alreadyResolved,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Plan §5.2. Viewer read for the live map. The owner and `LINKED` contacts see
   * the session; a stranger gets 404 so existence is not leaked. This is the
   * cold-start backfill (the full-screen intent launched the app with only a
   * `sosId`) and the poll fallback when the socket cannot connect.
   */
  router.get('/sos/:id', requireAuth, loadUser, async (req, res, next) => {
    try {
      const user = requireSyncedUser(req);
      const sosId = sosIdParam(req);
      if (!sosId) {
        next(HttpError.notFound('NOT_FOUND', 'sos session not found'));
        return;
      }

      const view = await findSosForViewer(sosId, user.id);
      if (!view) {
        next(HttpError.notFound('NOT_FOUND', 'sos session not found'));
        return;
      }

      const latest = await latestLocation(sosId);
      res.json({
        sosId: view.id,
        status: view.status,
        startedAt: view.started_at,
        endedAt: view.ended_at,
        ownerName: view.owner_name,
        lastLocation: latest
          ? {
              latitude: latest.latitude,
              longitude: latest.longitude,
              accuracy: latest.accuracy,
              speed: latest.speed,
              heading: latest.heading,
              battery: latest.battery_level,
              recordedAt: latest.recorded_at,
            }
          : null,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Plan §5.1. Owner-only live-fix ingest. The phone posts over REST (not the
   * socket) because a socket dies when Android backgrounds the app; the server
   * fans the point out to the session's room instead. A non-owner or a resolved
   * session is a 404, never a 403.
   */
  router.post('/sos/:id/location', requireAuth, loadUser, async (req, res, next) => {
    try {
      const user = requireSyncedUser(req);
      const sosId = sosIdParam(req);
      if (!sosId) {
        next(HttpError.notFound('NOT_FOUND', 'sos session not found'));
        return;
      }

      const parsed = locationBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        next(HttpError.badRequest('INVALID_LOCATION', 'invalid location payload'));
        return;
      }

      const point = {
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        accuracy: parsed.data.accuracy ?? null,
        speed: parsed.data.speed ?? null,
        heading: parsed.data.heading ?? null,
        battery: parsed.data.battery ?? null,
        recordedAt: coerceRecordedAt(parsed.data.recordedAt ?? undefined),
      };

      const session = await recordLocation(user.id, sosId, point);
      if (!session) {
        next(HttpError.notFound('NOT_FOUND', 'sos session not found'));
        return;
      }

      emitSosLocation({
        sosId,
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy,
        speed: point.speed,
        heading: point.heading,
        battery: point.battery,
        recordedAt: point.recordedAt.toISOString(),
      });

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
