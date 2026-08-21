import {
  isHex,
  keccak256,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import {
  encodePaymentRequest,
  PAYMENT_REQUEST_CHAIN_ID,
  type PaymentRequest,
} from "./paymentRequests";

export const PAYMENT_CANCELLATION_VERSION = 1 as const;
export const PAYMENT_CANCELLATION_CHAIN_ID = PAYMENT_REQUEST_CHAIN_ID;
export const PAYMENT_CANCELLATION_MAX_AGE_SECONDS = 10 * 60;

export type PaymentRequestCancellation = {
  version: typeof PAYMENT_CANCELLATION_VERSION;
  chainId: typeof PAYMENT_CANCELLATION_CHAIN_ID;
  requestId: Hex;
  name: string;
  nonce: Hex;
  cancelledAt: number;
};

const cancellationTypes = {
  PaymentRequestCancellation: [
    { name: "version", type: "uint16" },
    { name: "chainId", type: "uint256" },
    { name: "requestId", type: "bytes32" },
    { name: "name", type: "string" },
    { name: "nonce", type: "bytes32" },
    { name: "cancelledAt", type: "uint64" },
  ],
} as const;

export function paymentRequestId(request: PaymentRequest): Hex {
  return keccak256(encodePaymentRequest(request));
}

export function createPaymentRequestCancellation(
  request: PaymentRequest,
  cancelledAt = Math.floor(Date.now() / 1000),
): PaymentRequestCancellation {
  return {
    version: PAYMENT_CANCELLATION_VERSION,
    chainId: PAYMENT_CANCELLATION_CHAIN_ID,
    requestId: paymentRequestId(request),
    name: request.name,
    nonce: request.nonce,
    cancelledAt,
  };
}

export function paymentCancellationTypedData(
  cancellation: PaymentRequestCancellation,
) {
  return {
    domain: {
      name: "XDCID Pay Link Cancellation",
      version: String(PAYMENT_CANCELLATION_VERSION),
      chainId: cancellation.chainId,
    },
    types: cancellationTypes,
    primaryType: "PaymentRequestCancellation" as const,
    message: {
      ...cancellation,
      chainId: BigInt(cancellation.chainId),
      cancelledAt: BigInt(cancellation.cancelledAt),
    },
  };
}

export function validatePaymentRequestCancellation(
  cancellation: PaymentRequestCancellation,
  request: PaymentRequest,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | undefined {
  if (cancellation.version !== PAYMENT_CANCELLATION_VERSION) {
    return "Unsupported payment cancellation version.";
  }
  if (
    cancellation.chainId !== PAYMENT_CANCELLATION_CHAIN_ID ||
    cancellation.chainId !== request.chainId
  ) {
    return "Payment cancellation authorization is for the wrong network.";
  }
  if (!isHex(cancellation.requestId, { strict: true }) || cancellation.requestId.length !== 66) {
    return "Payment cancellation request ID is invalid.";
  }
  if (cancellation.requestId !== paymentRequestId(request)) {
    return "Payment cancellation does not match this request.";
  }
  if (cancellation.name !== request.name || cancellation.nonce !== request.nonce) {
    return "Payment cancellation request details do not match.";
  }
  if (!Number.isSafeInteger(cancellation.cancelledAt) || cancellation.cancelledAt <= 0) {
    return "Payment cancellation time is invalid.";
  }
  if (cancellation.cancelledAt > nowSeconds + 300) {
    return "Payment cancellation time is in the future.";
  }
  if (cancellation.cancelledAt < nowSeconds - PAYMENT_CANCELLATION_MAX_AGE_SECONDS) {
    return "Payment cancellation authorization has expired.";
  }
  return undefined;
}

export async function recoverPaymentCancellationSigner(
  cancellation: PaymentRequestCancellation,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    ...paymentCancellationTypedData(cancellation),
    signature,
  });
}
