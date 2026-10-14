import { getClerkInstance } from "@clerk/expo";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Read the current Clerk session token outside of React (socket auth, background
 * location task). Returns null when Clerk is not initialised yet or has no
 * active session, so callers can retry rather than throwing.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const clerk = getClerkInstance(
      publishableKey ? { publishableKey } : undefined,
    );
    return (await clerk.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}
