import { hexToString, type Hex } from "viem";
import { requireAdminSession } from "../../../../../lib/adminAuth";
import {
  searchForwardingRecoveries,
} from "../../../../../lib/forwardingRecoveryStore";
import {
  getStoredPayLink,
  isShortPayLinkId,
} from "../../../../../lib/payLinkStore";
import {
  paymentRequestRoute,
  type PaymentRequest,
} from "../../../../../lib/paymentRequests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function GET(request: Request) {
  const session = await requireAdminSession(request);
  if (!session) return response({ error: "Admin authentication required" }, 401);

  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (
    !isShortPayLinkId(query) &&
    !/^0x[0-9a-fA-F]{40}$/.test(query) &&
    !/^0x[0-9a-fA-F]{64}$/.test(query)
  ) {
    return response(
      { error: "Enter a Pay Link ID, wallet address, or transaction hash." },
      400,
    );
  }

  try {
    if (isShortPayLinkId(query)) {
      const stored = await getStoredPayLink(query);
      if (!stored) return response({ kind: "pay-link", results: [] });
      const paymentRequest = JSON.parse(
        hexToString(stored.encodedRequest as Hex),
      ) as PaymentRequest;
      const route = paymentRequestRoute(paymentRequest);

      return response({
        kind: "pay-link",
        results: [{
          id: stored.id,
          name: stored.name,
          amount: paymentRequest.amount,
          token: paymentRequest.token,
          payer: paymentRequest.payer,
          reference: paymentRequest.reference,
          description: paymentRequest.description,
          sourceChainId: route.sourceChainId,
          destinationChainId: route.destinationChainId,
          transferMode: route.transferMode,
          status: stored.status,
          createdAt: stored.createdAt,
          expiresAt: stored.expiresAt,
          revokedAt: stored.revokedAt,
          recommendation:
            stored.status === "active"
              ? "The request is active. This record does not prove that payment has been completed."
              : stored.status === "revoked"
                ? "The request was cancelled and should not be paid."
                : "The request has expired and should not be paid.",
        }],
      });
    }

    const results = await searchForwardingRecoveries(query);
    return response({ kind: "forwarding", results });
  } catch {
    return response({ error: "Unable to search payment recovery records." }, 503);
  }
}
