import { isHex } from "viem";
import {
  createStoredPayLink,
  isPayLinkStoreConfigured
} from "../../../lib/payLinkStore";
import { decodePaymentRequest } from "../../../lib/paymentRequests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 16_384;
const MAX_ENCODED_REQUEST_LENGTH = 8_192;
const MAX_SIGNATURE_LENGTH = 2_048;

export async function POST(request: Request) {
  if (!isPayLinkStoreConfigured()) return storageUnavailable();

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "Pay Link request is too large" }, 413);
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return json({ error: "Pay Link request is too large" }, 413);
    }
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Pay Link request must be valid JSON" }, 400);
  }

  if (!isRecord(body)) {
    return json({ error: "Pay Link request must be an object" }, 400);
  }
  const encodedRequest =
    typeof body.request === "string" ? body.request.trim() : "";
  const signature =
    typeof body.signature === "string" ? body.signature.trim() : "";
  if (
    !encodedRequest ||
    encodedRequest.length > MAX_ENCODED_REQUEST_LENGTH ||
    !isHex(encodedRequest)
  ) {
    return json({ error: "Signed payment request is invalid" }, 400);
  }
  if (
    !signature ||
    signature.length > MAX_SIGNATURE_LENGTH ||
    !isHex(signature)
  ) {
    return json({ error: "Payment request signature is invalid" }, 400);
  }

  try {
    const paymentRequest = decodePaymentRequest(encodedRequest);
    const { record, revocationToken } = await createStoredPayLink({
      name: paymentRequest.name,
      encodedRequest,
      signature,
      requestExpires: paymentRequest.expires
    });
    return json(
      {
        id: record.id,
        path:
          "/pay/" +
          encodeURIComponent(record.name) +
          "?id=" +
          encodeURIComponent(record.id),
        expiresAt: record.expiresAt,
        revocationToken
      },
      201
    );
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Pay Link creation failed";
    const status = message.includes("storage") ? 503 : 400;
    return json({ error: message }, status);
  }
}

function storageUnavailable() {
  return json({ error: "Short Pay Links are temporarily unavailable" }, 503);
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: responseHeaders() });
}

function responseHeaders() {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive"
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
