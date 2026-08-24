import { isHex } from "viem";
import {
  isPaymentHistoryConfigured,
  readAuthorizedPaymentHistory
} from "../../../../lib/paymentHistory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isPaymentHistoryConfigured()) {
    return json({ error: "Private payment history is unavailable" }, 503);
  }
  try {
    const body = await request.json() as {
      challengeId?: unknown;
      signature?: unknown;
    };
    if (
      typeof body.challengeId !== "string" ||
      typeof body.signature !== "string" ||
      !isHex(body.signature)
    ) {
      return json({ error: "A valid signed challenge is required" }, 400);
    }
    const records = await readAuthorizedPaymentHistory(
      body.challengeId,
      body.signature
    );
    if (!records) return json({ error: "Payment history access was denied" }, 403);
    return json({ records });
  } catch {
    return json({ error: "Payment history access could not be verified" }, 400);
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive"
    }
  });
}
