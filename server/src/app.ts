import express from 'express';
import { clerkMiddleware } from '@clerk/express';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  // Unauthenticated liveness probe: must stay reachable without a session.
  app.use(healthRouter);

  // Networkless JWT verification. `publishableKey` is what lets Clerk resolve
  // this instance's frontend API, which is where the authorised parties that
  // `jwtKey` is checked against come from — without it every request 500s.
  app.use(
    clerkMiddleware({
      jwtKey: env.CLERK_JWT_KEY,
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
    }),
  );

  app.use(authRouter());

  app.use(errorHandler);
  return app;
}
