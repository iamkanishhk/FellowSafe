import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { loadUser, requireAuth, requireSyncedUser } from '../auth/middleware.js';
import { upsertDevice } from '../repos/devices.js';

const deviceBodySchema = z.object({
  fcmToken: z.string().trim().min(1).max(4096),
  platform: z.enum(['android', 'ios']).default('android'),
});

export function devicesRouter(): Router {
  const router = Router();

  /**
   * Plan §7. Registers this device's FCM token against the caller. Upsert on
   * `fcm_token` means a relaunch, or a token rotation that arrives twice, is
   * harmless. `fcm_token` is never echoed back.
   */
  router.post('/devices', requireAuth, loadUser, async (req, res, next) => {
    try {
      const user = requireSyncedUser(req);

      const parsed = deviceBodySchema.safeParse(req.body);
      if (!parsed.success) {
        next(HttpError.badRequest('INVALID_DEVICE', 'an fcmToken is required'));
        return;
      }

      await upsertDevice({
        userId: user.id,
        fcmToken: parsed.data.fcmToken,
        platform: parsed.data.platform,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
