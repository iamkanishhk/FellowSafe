import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth, useUser } from "@clerk/expo";
import { useApi } from "./api";
import { getDevicePushInfo } from "./push";

export interface CurrentUser {
  /** False until Clerk has resolved the session and the profile is usable. */
  ready: boolean;
  fullName: string;
  firstName: string;
  email: string | null;
  /** E.164 phone captured in-app, formatted for display, or null. */
  phone: string | null;
  imageUrl: string | null;
  initials: string;
}

interface UserContextValue extends CurrentUser {
  /** Optimistically reflect a phone the user just saved. */
  updatePhone: (phoneE164: string | null) => void;
}

const UserContext = createContext<UserContextValue | null>(null);

/** `+919876543210` → `+91 98765 43210`; anything else is passed through. */
export function formatPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const match = /^\+91(\d{10})$/.exec(e164.replace(/[^\d+]/g, ""));
  if (match) return `+91 ${match[1].slice(0, 5)} ${match[1].slice(5)}`;
  return e164;
}

function initialsFrom(first: string, last: string, fallback: string): string {
  const letters = `${first[0] ?? ""}${last[0] ?? ""}`.trim();
  if (letters) return letters.toUpperCase();
  const source = first || last || fallback;
  return source ? source[0]!.toUpperCase() : "?";
}

export function UserProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { syncUser, registerDevice } = useApi();
  const [phoneE164, setPhoneE164] = useState<string | null>(null);

  const userId = user?.id;

  const updatePhone = useCallback((next: string | null) => {
    setPhoneE164(next);
  }, []);

  // Pull the server-side profile (which owns the phone) whenever the signed-in
  // identity changes. State is set from the promise callback, not the effect
  // body, so React doesn't cascade an extra render.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    syncUser()
      .then(({ user: synced }) => {
        if (!cancelled) setPhoneE164(synced.phoneE164);
      })
      .catch(() => {
        // Offline or server down: keep whatever Clerk already told us about.
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, syncUser]);

  // Register this device for push so linked contacts can reach it. Fails
  // softly: a declined permission or missing session just skips registration.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    getDevicePushInfo()
      .then((info) => {
        if (!info || cancelled) return;
        return registerDevice(info.fcmToken, info.platform);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, registerDevice]);

  const value = useMemo<UserContextValue>(() => {
    const first = user?.firstName?.trim() ?? "";
    const last = user?.lastName?.trim() ?? "";
    const fullName =
      (user?.fullName ?? `${first} ${last}`).trim() || "Fellow Safe user";
    const email = user?.primaryEmailAddress?.emailAddress ?? null;
    const imageUrl = user?.imageUrl ?? null;
    const initials = initialsFrom(first, last, email ?? fullName);

    return {
      ready: isLoaded && !!isSignedIn,
      fullName,
      firstName: first || fullName.split(" ")[0] || "",
      email,
      phone: isSignedIn ? formatPhone(phoneE164) : null,
      imageUrl,
      initials,
      updatePhone,
    };
  }, [user, phoneE164, isLoaded, isSignedIn, updatePhone]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useCurrentUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useCurrentUser must be used within a UserProvider");
  }
  return ctx;
}
