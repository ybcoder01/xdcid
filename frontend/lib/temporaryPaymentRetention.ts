import { lt } from "drizzle-orm";
import { ensureAdminAuthSchema } from "./adminAuthStore";
import { getDatabase } from "./db/client";
import { adminAuthChallenges } from "./db/schema";
import { removeExpiredForwardingRecoveryData } from "./forwardingRecoveryStore";
import { removeExpiredPaymentData } from "./paymentHistory";

export type TemporaryPaymentCleanupResult = {
  deletedPaymentAccessChallenges: number;
  deletedAdminAccessChallenges: number;
  deletedForwardingRecoveries: number;
  deletedTemporaryBurnMappings: number;
};

export async function removeExpiredTemporaryPaymentData(
  now = new Date()
): Promise<TemporaryPaymentCleanupResult> {
  await ensureAdminAuthSchema();

  const [
    deletedPaymentAccessChallenges,
    deletedAdminRows,
    deletedForwardingRecoveries
  ] = await Promise.all([
    removeExpiredPaymentData(now),
    getDatabase()
      .delete(adminAuthChallenges)
      .where(lt(adminAuthChallenges.expiresAt, now))
      .returning({ id: adminAuthChallenges.id }),
    removeExpiredForwardingRecoveryData(now)
  ]);

  return {
    deletedPaymentAccessChallenges,
    deletedAdminAccessChallenges: deletedAdminRows.length,
    deletedForwardingRecoveries,
    // Burn mappings have ON DELETE CASCADE and are removed with their recovery.
    deletedTemporaryBurnMappings: deletedForwardingRecoveries
  };
}
