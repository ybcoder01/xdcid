import { lt } from "drizzle-orm";
import { ensureAdminAuthSchema } from "./adminAuthStore";
import { getDatabase } from "./db/client";
import {
  adminAuthChallenges,
  adminAuthRateLimits,
  adminSecurityEvents
} from "./db/schema";
import { removeExpiredForwardingRecoveryData } from "./forwardingRecoveryStore";
import { removeExpiredPaymentData } from "./paymentHistory";

export type TemporaryPaymentCleanupResult = {
  deletedPaymentAccessChallenges: number;
  deletedAdminAccessChallenges: number;
  deletedAdminRateLimits: number;
  deletedAdminSecurityEvents: number;
  deletedForwardingRecoveries: number;
};

export async function removeExpiredTemporaryPaymentData(
  now = new Date()
): Promise<TemporaryPaymentCleanupResult> {
  await ensureAdminAuthSchema();

  const [
    deletedPaymentAccessChallenges,
    deletedAdminRows,
    deletedAdminRateLimitRows,
    deletedAdminSecurityEventRows,
    deletedForwardingRecoveries
  ] = await Promise.all([
    removeExpiredPaymentData(now),
    getDatabase()
      .delete(adminAuthChallenges)
      .where(lt(adminAuthChallenges.expiresAt, now))
      .returning({ id: adminAuthChallenges.id }),
    getDatabase()
      .delete(adminAuthRateLimits)
      .where(lt(adminAuthRateLimits.updatedAt, new Date(now.getTime() - 24 * 60 * 60 * 1_000)))
      .returning({ identifierHash: adminAuthRateLimits.identifierHash }),
    getDatabase()
      .delete(adminSecurityEvents)
      .where(lt(adminSecurityEvents.createdAt, new Date(now.getTime() - 180 * 24 * 60 * 60 * 1_000)))
      .returning({ id: adminSecurityEvents.id }),
    removeExpiredForwardingRecoveryData(now)
  ]);

  return {
    deletedPaymentAccessChallenges,
    deletedAdminAccessChallenges: deletedAdminRows.length,
    deletedAdminRateLimits: deletedAdminRateLimitRows.length,
    deletedAdminSecurityEvents: deletedAdminSecurityEventRows.length,
    deletedForwardingRecoveries
  };
}
