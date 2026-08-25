import { timingSafeEqual } from "node:crypto";
import { isPaymentHistoryConfigured } from "../../../../lib/paymentHistory";
import { deleteApprovedPaymentRetentionCandidates } from "../../../../lib/paymentRetentionReview";
import { removeExpiredTemporaryPaymentData } from "../../../../lib/temporaryPaymentRetention";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPaymentHistoryConfigured()) {
    return Response.json({ error: "Payment history is not configured" }, { status: 503 });
  }
  const [cleanup, completedRetention] = await Promise.all([
    removeExpiredTemporaryPaymentData(),
    deleteApprovedPaymentRetentionCandidates()
  ]);
  return Response.json({
    cleanup,
    completedRetention,
    temporaryRetentionDays: 7,
    includedHistoryMonths: 15,
    completedHistoryRetentionMonths: 84,
    completedPaymentsDeleted: completedRetention.deleted,
    aggregateFeeEventsDeleted: 0
  }, {
    headers: { "cache-control": "no-store" }
  });
}

function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Uint8Array.from(Buffer.from(header.slice(7)));
  const expected = Uint8Array.from(Buffer.from(secret));
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
