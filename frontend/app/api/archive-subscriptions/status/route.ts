import { isHex } from "viem";
import {
  authorizeArchiveEntitlementChallenge,
  createArchiveEntitlementChallenge,
  isPaymentHistoryConfigured
} from "../../../../lib/paymentHistory";
import { getActiveArchiveSubscription } from "../../../../lib/archiveSubscriptionPurchases";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isPaymentHistoryConfigured()) {
    return json({ error: "Archive access verification is unavailable" }, 503);
  }
  try {
    const body = await request.json() as {
      address?: unknown;
      challengeId?: unknown;
      signature?: unknown;
    };

    if (typeof body.address === "string") {
      const challenge = await createArchiveEntitlementChallenge(body.address);
      return json(challenge, 201);
    }

    if (
      typeof body.challengeId !== "string" ||
      typeof body.signature !== "string" ||
      !isHex(body.signature)
    ) {
      return json({ error: "A valid signed archive challenge is required" }, 400);
    }

    const wallet = await authorizeArchiveEntitlementChallenge(
      body.challengeId,
      body.signature
    );
    if (!wallet) return json({ error: "Archive access verification was denied" }, 403);

    const entitlement = await getActiveArchiveSubscription(wallet);
    return json({ entitlement });
  } catch {
    return json({ error: "Archive access could not be verified" }, 400);
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
