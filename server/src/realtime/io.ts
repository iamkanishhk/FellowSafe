import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { verifyToken } from '@clerk/backend';
import { env } from '../config/env.js';
import { findUserByClerkId } from '../repos/users.js';
import { findSosForViewer } from '../repos/sos.js';

declare module 'socket.io' {
  interface SocketData {
    clerkUserId?: string;
    /** Local `users.id`; null until the client has called `/auth/sync`. */
    fellowSafeUserId?: string | null;
  }
}

/** Plan §5.3 payload. Coordinates only — never a display name or contact list. */
export interface SosLocationEvent {
  sosId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  recordedAt: string;
}

let io: Server | null = null;

/** The one room a live SOS stream is broadcast to, per Plan D5. */
export function sosRoom(sosId: string): string {
  return `sos:${sosId}`;
}

/**
 * Plan §3.1. Fan-out point for `POST /sos/:id/location`. Fire-and-forget: a
 * broadcast failure must never fail the persistence that already committed, so
 * a missing server (tests, HTTP-only boot) is simply a no-op.
 */
export function emitSosLocation(payload: {
  sosId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  recordedAt: string;
}): void {
  io?.to(sosRoom(payload.sosId)).emit('sos:location', payload);
}

/** Plan §6. Tells every viewer to stop the live map when the owner resolves. */
export function emitSosResolved(sosId: string, endedAt: string | null): void {
  io?.to(sosRoom(sosId)).emit('sos:resolved', { sosId, endedAt });
}

function authToken(socket: Socket): string | null {
  const token = socket.handshake.auth?.token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

/**
 * Plan §3.3. Replaces the disconnect-everything stub. The handshake verifies the
 * Clerk JWT networklessly against `CLERK_JWT_KEY` (same key `clerkMiddleware`
 * uses) and resolves the local user, so a socket has the same identity a REST
 * request would. `join` then re-checks authorisation per session — holding a
 * valid session is not the same as being the owner or a `LINKED` contact.
 */
export function attachRealtime(httpServer: HttpServer): Server {
  const server = new Server(httpServer, { cors: { origin: false } });

  server.use(async (socket, next) => {
    const token = authToken(socket);
    if (!token) {
      next(new Error('UNAUTHENTICATED'));
      return;
    }
    try {
      const { sub } = await verifyToken(token, { jwtKey: env.CLERK_JWT_KEY });
      const user = await findUserByClerkId(sub);
      socket.data.clerkUserId = sub;
      socket.data.fellowSafeUserId = user?.id ?? null;
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  server.on('connection', (socket) => {
    socket.on('sos:join', async (payload: unknown, ack?: (result: unknown) => void) => {
      const sosId =
        typeof payload === 'object' && payload !== null
          ? (payload as { sosId?: unknown }).sosId
          : undefined;
      const userId = socket.data.fellowSafeUserId;

      if (typeof sosId !== 'string' || sosId.length === 0 || !userId) {
        ack?.({ ok: false, error: 'NOT_FOUND' });
        return;
      }

      try {
        const view = await findSosForViewer(sosId, userId);
        if (!view) {
          ack?.({ ok: false, error: 'NOT_FOUND' });
          return;
        }
        await socket.join(sosRoom(sosId));
        ack?.({ ok: true, status: view.status });
      } catch (err) {
        console.error('sos:join failed:', err);
        ack?.({ ok: false, error: 'ERROR' });
      }
    });

    socket.on('sos:leave', async (payload: unknown) => {
      const sosId =
        typeof payload === 'object' && payload !== null
          ? (payload as { sosId?: unknown }).sosId
          : undefined;
      if (typeof sosId === 'string' && sosId.length > 0) {
        await socket.leave(sosRoom(sosId));
      }
    });
  });

  return server;
}
