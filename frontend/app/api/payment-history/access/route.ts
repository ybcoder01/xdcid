import { isHex } from "viem";
import { isPaymentHistoryConfigured, readAuthorizedPayment } from "../../../../lib/paymentHistory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isPaymentHistoryConfigured()) return json({ error: "Private receipt access is unavailable" }, 503);
  try {
    const body = await request.json() as { recordId?: unknown; challengeId?: unknown; signature?: unknown };
    if (
      typeof body.recordId !== "string" ||
      typeof body.challengeId !== "string" ||
      typeof body.signature !== "string" ||
      !isHex(body.signature)
    ) return json({ error: "A valid signed challenge is required" }, 400);

    const record = await readAuthorizedPayment(body.recordId, body.challengeId, body.signature);
    if (!record) return json({ error: "Receipt access was denied" }, 403);
    return json({ record });
  } catch {
    return json({ error: "Receipt access could not be verified" }, 400);
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow, noarchive" } });
}
