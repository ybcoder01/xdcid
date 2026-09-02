import {
  createPaymentAccessChallenge,
  createPaymentHistoryChallenge,
  isPaymentHistoryConfigured
} from "../../../../lib/paymentHistory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isPaymentHistoryConfigured()) return json({ error: "Private receipt access is unavailable" }, 503);
  try {
    const body = await request.json() as { recordId?: unknown; address?: unknown };
    if (typeof body.address !== "string") {
      return json({ error: "Wallet is required" }, 400);
    }
    const challenge = typeof body.recordId === "string"
      ? await createPaymentAccessChallenge(body.recordId, body.address)
      : await createPaymentHistoryChallenge(body.address);
    if (!challenge) return json({ error: "No authorized payment history was found" }, 404);
    return json(challenge);
  } catch {
    return json({ error: "Receipt challenge could not be created" }, 400);
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow, noarchive" } });
}
