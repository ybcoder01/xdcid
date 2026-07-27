import {
  hexToString,
  isAddress,
  recoverTypedDataAddress,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { parseXnsName } from "./names";
import { validatePayAmount, type PayToken } from "./paylinks";

export const PAYMENT_REQUEST_VERSION = 1 as const;
export const PAYMENT_REQUEST_CHAIN_ID = 50 as const;
export const MAX_PAYMENT_REFERENCE_LENGTH = 48;
export const MAX_PAYMENT_DESCRIPTION_LENGTH = 120;

export type PaymentRequest = {
  version: typeof PAYMENT_REQUEST_VERSION;
  chainId: typeof PAYMENT_REQUEST_CHAIN_ID;
  name: string;
  amount: string;
  token: PayToken;
  reference: string;
  description: string;
  payer: Address;
  issuedAt: number;
  expires: number;
  nonce: Hex;
};

export const paymentRequestTypes = {
  PaymentRequest: [
    { name: "version", type: "uint16" },
    { name: "chainId", type: "uint256" },
    { name: "name", type: "string" },
    { name: "amount", type: "string" },
    { name: "token", type: "string" },
    { name: "reference", type: "string" },
    { name: "description", type: "string" },
    { name: "payer", type: "address" },
    { name: "issuedAt", type: "uint64" },
    { name: "expires", type: "uint64" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export function paymentRequestTypedData(request: PaymentRequest) {
  return {
    domain: {
      name: "XDCID Pay Links",
      version: String(PAYMENT_REQUEST_VERSION),
      chainId: PAYMENT_REQUEST_CHAIN_ID,
    },
    types: paymentRequestTypes,
    primaryType: "PaymentRequest" as const,
    message: {
      ...request,
      chainId: BigInt(request.chainId),
      issuedAt: BigInt(request.issuedAt),
      expires: BigInt(request.expires),
    },
  };
}

export function validatePaymentRequest(
  request: PaymentRequest,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | undefined {
  if (request.version !== PAYMENT_REQUEST_VERSION) return "Unsupported payment request version.";
  if (request.chainId !== PAYMENT_REQUEST_CHAIN_ID) return "Payment request is for the wrong network.";

  const parsedName = parseXnsName(request.name);
  if (!parsedName.isValid || parsedName.name !== request.name) {
    return "Payment request contains an invalid or non-canonical XNS ID.";
  }

  if (request.token !== "XDC" && request.token !== "USDC") return "Unsupported payment token.";
  const amountError = validatePayAmount(request.amount, request.token);
  if (amountError) return amountError;

  if (!request.reference.trim()) return "Payment reference is required.";
  if (request.reference.length > MAX_PAYMENT_REFERENCE_LENGTH) {
    return "Payment reference must be " + MAX_PAYMENT_REFERENCE_LENGTH + " characters or fewer.";
  }
  if (request.description.length > MAX_PAYMENT_DESCRIPTION_LENGTH) {
    return "Description must be " + MAX_PAYMENT_DESCRIPTION_LENGTH + " characters or fewer.";
  }
  if (!isAddress(request.payer)) return "Designated payer address is invalid.";
  if (!Number.isSafeInteger(request.issuedAt) || request.issuedAt <= 0) {
    return "Payment request issue time is invalid.";
  }
  if (request.issuedAt > nowSeconds + 300) return "Payment request issue time is in the future.";
  if (!Number.isSafeInteger(request.expires) || request.expires < 0) {
    return "Payment request expiry is invalid.";
  }
  if (request.expires !== 0 && request.expires <= nowSeconds) {
    return "This payment request has expired.";
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(request.nonce)) return "Payment request nonce is invalid.";
  return undefined;
}

export function encodePaymentRequest(request: PaymentRequest): Hex {
  const error = validatePaymentRequest(request);
  if (error) throw new Error(error);
  return stringToHex(JSON.stringify(request));
}

export function decodePaymentRequest(encoded: string): PaymentRequest {
  try {
    const request = JSON.parse(hexToString(encoded as Hex)) as PaymentRequest;
    const error = validatePaymentRequest(request);
    if (error) throw new Error(error);
    return request;
  } catch (error) {
    if (error instanceof Error && [
      "Payment request", "This payment", "Unsupported", "Enter", "Amount", "Description", "Designated",
    ].some((prefix) => error.message.startsWith(prefix))) {
      throw error;
    }
    throw new Error("Payment request payload is invalid.");
  }
}

export async function recoverPaymentRequestSigner(
  request: PaymentRequest,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({ ...paymentRequestTypedData(request), signature });
}

export function isDesignatedPayer(request: PaymentRequest, address?: Address): boolean {
  return request.payer === zeroAddress || Boolean(address && address.toLowerCase() === request.payer.toLowerCase());
}

export function buildSignedPaymentLink(
  baseUrl: string,
  request: PaymentRequest,
  signature: Hex,
): string {
  const url = new URL("/pay/" + encodeURIComponent(request.name), baseUrl);
  url.searchParams.set("request", encodePaymentRequest(request));
  url.searchParams.set("signature", signature);
  return url.toString();
}
