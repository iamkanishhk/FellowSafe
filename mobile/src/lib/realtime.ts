import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { apiBaseUrl, type SosDetail, type SosLiveLocation } from "./api";
import { getAuthToken } from "./auth-token";

export interface LiveSosState {
  /** Newest fix, seeded from `GET /sos/:id` and updated by `sos:location`. */
  location: SosLiveLocation | null;
  /** True once the owner resolves — the map should stop and say so. */
  resolved: boolean;
  /** Socket handshake + `sos:join` both succeeded. */
  connected: boolean;
}

interface ServerLocationEvent extends SosLiveLocation {
  sosId: string;
}

interface ServerResolvedEvent {
  sosId: string;
  endedAt: string | null;
}

const FALLBACK_DELAY_MS = 6000;
const FALLBACK_INTERVAL_MS = 12000;

function createSocket(): Socket {
  return io(apiBaseUrl, {
    transports: ["websocket"],
    autoConnect: false,
    reconnection: true,
    auth: (cb: (data: Record<string, unknown>) => void) => {
      void getAuthToken().then((token) => cb({ token: token ?? "" }));
    },
  });
}

/**
 * Subscribe to one SOS room (Plan D5/§5.3). Socket.IO is the live channel;
 * when the socket cannot come up within a few seconds we fall back to polling
 * `GET /sos/:id` so a dropped handshake never leaves a contact blind.
 */
export function useSosStream(
  sosId: string | undefined,
  fallback?: () => Promise<SosDetail | null>,
): LiveSosState {
  const [state, setState] = useState<LiveSosState>({
    location: null,
    resolved: false,
    connected: false,
  });

  const connectedRef = useRef(false);
  const fallbackRef = useRef(fallback);

  useEffect(() => {
    fallbackRef.current = fallback;
  }, [fallback]);

  useEffect(() => {
    if (!sosId) return;
    let active = true;
    const socket = createSocket();
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      const detail = await fallbackRef.current?.().catch(() => null);
      if (!active || !detail) return;
      setState((s) => ({
        ...s,
        location: detail.lastLocation ?? s.location,
        resolved: detail.status === "RESOLVED" || s.resolved,
      }));
      if (detail.status === "RESOLVED") stopFallback();
    };

    const startFallback = () => {
      if (pollTimer || !fallbackRef.current) return;
      void poll();
      pollTimer = setInterval(() => void poll(), FALLBACK_INTERVAL_MS);
    };

    const stopFallback = () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (pollTimer) clearInterval(pollTimer);
      fallbackTimer = null;
      pollTimer = null;
    };

    socket.on("connect", () => {
      if (!active) return;
      socket.emit("sos:join", { sosId }, (res: { ok?: boolean }) => {
        if (!active || res?.ok !== true) return;
        connectedRef.current = true;
        stopFallback();
        setState((s) => ({ ...s, connected: true }));
      });
    });

    socket.on("disconnect", () => {
      if (!active) return;
      connectedRef.current = false;
      setState((s) => ({ ...s, connected: false }));
      startFallback();
    });

    socket.on("connect_error", () => {
      if (active) startFallback();
    });

    socket.on("sos:location", (event: ServerLocationEvent) => {
      if (!active || event.sosId !== sosId) return;
      setState((s) => ({
        ...s,
        location: {
          latitude: event.latitude,
          longitude: event.longitude,
          accuracy: event.accuracy,
          speed: event.speed,
          heading: event.heading,
          battery: event.battery,
          recordedAt: event.recordedAt,
        },
      }));
    });

    socket.on("sos:resolved", (event: ServerResolvedEvent) => {
      if (!active || event.sosId !== sosId) return;
      setState((s) => ({ ...s, resolved: true }));
      stopFallback();
    });

    fallbackTimer = setTimeout(() => {
      if (!connectedRef.current) startFallback();
    }, FALLBACK_DELAY_MS);

    socket.connect();

    return () => {
      active = false;
      stopFallback();
      socket.emit("sos:leave", { sosId });
      socket.disconnect();
    };
  }, [sosId]);

  return state;
}
