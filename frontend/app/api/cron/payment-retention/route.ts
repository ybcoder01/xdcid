import { timingSafeEqual } from "node:crypto";
import { isPaymentHistoryConfigured, removeExpiredPaymentData } from "../../../../lib/paymentHistory";

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
  const deleted = await removeExpiredPaymentData();
  return Response.json({ deleted, retentionMonths: 15 }, {
    headers: { "cache-control": "no-store" }
  });
}

function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
