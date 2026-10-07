import { createClerkClient } from '@clerk/backend';
import { env } from '../config/env.js';

export interface ClerkPhoneSnapshot {
  id: string;
  phoneNumber: string;
  verified: boolean;
}

export interface ClerkUserSnapshot {
  id: string;
  name: string;
  email: string | null;
  primaryPhone: ClerkPhoneSnapshot | null;
}

/**
 * The single seam that needs Clerk to be reachable. Everything downstream —
 * the users upsert, the phone gate, auto-link — depends only on this shape, so
 * the interesting logic is testable without a Clerk round-trip.
 */
export interface ClerkUserSource {
  getUser(clerkUserId: string): Promise<ClerkUserSnapshot | null>;
}

type RawClerkUser = Awaited<
  ReturnType<ReturnType<typeof createClerkClient>['users']['getUser']>
>;

export function createClerkUserSource(): ClerkUserSource {
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

  return {
    async getUser(clerkUserId) {
      const user = (await clerk.users.getUser(clerkUserId)) as RawClerkUser;

      const primary = user.phoneNumbers?.find((p) => p.id === user.primaryPhoneNumberId);
      const email = user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId);

      return {
        id: user.id,
        name: user.firstName || user.username || user.id,
        email: email?.emailAddress ?? null,
        primaryPhone: primary
          ? {
              id: primary.id,
              phoneNumber: primary.phoneNumber,
              verified: primary.verification?.status === 'verified',
            }
          : null,
      };
    },
  };
}
