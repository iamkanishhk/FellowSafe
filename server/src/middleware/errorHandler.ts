import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../lib/errors.js';
import { env } from '../config/env.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  // Postgres constraint violations are programming errors if they reach here,
  // so surface them rather than translating them into a friendly 500.
  const code = (err as { code?: string }).code;
  if (code === '23505' || code === '23514' || code === '23503') {
    console.error('db constraint violation', code, (err as Error).message);
    res.status(409).json({ error: { code: 'CONFLICT', message: 'request conflicts with current state' } });
    return;
  }

  console.error('unhandled error', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'internal error',
      ...(env.NODE_ENV === 'development' && err instanceof Error ? { detail: err.message } : {}),
    },
  });
};
