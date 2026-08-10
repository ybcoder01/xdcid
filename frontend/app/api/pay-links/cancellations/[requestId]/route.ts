import {
  createPublicClient,
  fallback,
  getAddress,
  http,
  isHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  addresses,
  registrarAbi,
  registryAbi,
} from "../../../../../config/contracts";
import {
  verifyPaymentCancellationSignature,
  verifyPaymentRequestSignature,
} from "../../../../../lib/accountSignatures";
import {
  validatePaymentRequestCancellation,
  type PaymentRequestCancellation,
} from "../../../../../lib/paymentCancellation";
import {
  cancelPaymentRequest,
  isPayLinkStoreConfigured,
  isPaymentRequestCancelled,
} from "../../../../../lib/payLinkStore";
import {
  decodePaymentRequest,
  paymentRequestId,
} from "../../../../../lib/paymentRequests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 32_768;

type RouteContext = { params: Promise<{ requestId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  if (!isPayLinkStoreConfigured()) return storageUnavailable();
  const { requestId } = await context.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(requestId)) {
    return json({ error: "Payment request ID is invalid" }, 400);
  }

  try {
    return json({ requestId, cancelled: await isPaymentRequestCancelled(requestId) });
  } catch {
    return storageUnavailable();
  }
}

export async function POST(request: Request, context: RouteContext) {
  if (!isPayLinkStoreConfigured()) return storageUnavailable();
  const { requestId } = await context.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(requestId)) {
    return json({ error: "Payment request ID is invalid" }, 400);
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "Payment cancellation request is too large" }, 413);
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return json({ error: "Payment cancellation request is too large" }, 413);
    }
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Payment cancellation request must be valid JSON" }, 400);
  }
  if (!isRecord(body) || !isRecord(body.cancellation)) {
    return json({ error: "Payment cancellation request is invalid" }, 400);
  }

  const encodedRequest = typeof body.request === "string" ? body.request.trim() : "";
  const requestSignature = typeof body.requestSignature === "string"
    ? body.requestSignature.trim()
    : "";
  const cancellationSignature = typeof body.cancellationSignature === "string"
    ? body.cancellationSignature.trim()
    : "";
  if (
    !isHex(encodedRequest) ||
    !isHex(requestSignature) ||
    !isHex(cancellationSignature)
  ) {
    return json({ error: "Payment cancellation signatures are invalid" }, 400);
  }

  try {
    const paymentRequest = decodePaymentRequest(encodedRequest);
    const expectedRequestId = paymentRequestId(paymentRequest);
    if (expectedRequestId.toLowerCase() !== requestId.toLowerCase()) {
      return json({ error: "Payment cancellation does not match this request" }, 400);
    }

    const cancellation = body.cancellation as PaymentRequestCancellation;
    const validationError = validatePaymentRequestCancellation(
      cancellation,
      paymentRequest,
    );
    if (validationError) return json({ error: validationError }, 400);

    const client = getXdcClient();
    const node = await client.readContract({
      address: addresses.registrar,
      abi: registrarAbi,
      functionName: "nodeFor",
      args: [paymentRequest.name],
    });
    const owner = await client.readContract({
      address: addresses.registry,
      abi: registryAbi,
      functionName: "ownerOf",
      args: [node],
    }) as Address;
    if (owner === zeroAddress) {
      return json({ error: "XNS ID is not currently registered" }, 403);
    }
    const currentOwner = getAddress(owner);

    const originalVerification = await verifyPaymentRequestSignature(
      client,
      paymentRequest,
      requestSignature as Hex,
      currentOwner,
    );
    if (!originalVerification.valid) {
      return json({
        error: originalVerification.error ||
          "Original payment request is no longer authorized",
      }, 403);
    }

    const cancellationVerification = await verifyPaymentCancellationSignature(
      client,
      cancellation,
      cancellationSignature as Hex,
      currentOwner,
    );
    if (!cancellationVerification.valid) {
      return json({
        error: cancellationVerification.error ||
          "Payment cancellation is not authorized",
      }, 403);
    }

    const status = await cancelPaymentRequest({
      requestId: expectedRequestId,
      name: paymentRequest.name,
      nonce: paymentRequest.nonce,
      encodedRequest,
      cancellationSignature,
      cancelledAt: new Date(cancellation.cancelledAt * 1_000),
    });
    return json({ requestId: expectedRequestId, status });
  } catch (cause) {
    const message = cause instanceof Error
      ? cause.message
      : "Payment cancellation failed";
    return json({ error: message }, message.includes("storage") ? 503 : 400);
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
      urls.map((url) => http(url, { timeout, retryCount: 0 })),
    ),
  });
}

function storageUnavailable() {
  return json({ error: "Pay Link cancellation status is temporarily unavailable" }, 503);
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
