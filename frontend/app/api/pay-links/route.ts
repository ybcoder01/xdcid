import {
  createPublicClient,
  fallback,
  getAddress,
  http,
  isHex,
  zeroAddress,
  type Address,
  type Hex
} from "viem";
import {
  addresses,
  registrarAbi,
  registryAbi
} from "../../../config/contracts";
import { verifyPaymentRequestSignature } from "../../../lib/accountSignatures";
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
    const client = getXdcClient();
    const node = await client.readContract({
      address: addresses.registrar,
      abi: registrarAbi,
      functionName: "nodeFor",
      args: [paymentRequest.name]
    });
    const owner = await client.readContract({
      address: addresses.registry,
      abi: registryAbi,
      functionName: "ownerOf",
      args: [node]
    }) as Address;
    if (owner === zeroAddress) {
      return json({ error: "XNS ID is not currently registered" }, 403);
    }
    const verification = await verifyPaymentRequestSignature(
      client,
      paymentRequest,
      signature as Hex,
      getAddress(owner)
    );
    if (!verification.valid) {
      return json(
        { error: verification.error || "Payment request signature is not authorized" },
        403
      );
    }

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

function getXdcClient() {
  const urls = (
    process.env.XDC_RPC_URLS ||
    process.env.XDC_MAINNET_RPC_URL ||
    "https://rpc.xdcrpc.com,https://earpc.xinfin.network"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const timeout = Number(process.env.XDC_RPC_TIMEOUT_MS || 3_500);
  return createPublicClient({
    transport: fallback(
      urls.map((url) => http(url, { timeout, retryCount: 0 }))
    )
  });
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
