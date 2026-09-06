import {
  getAddress,
  isAddress,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { ApiInputError } from "./apiResponse";
import { isRegistrationTerm } from "./pricingPolicy";
import { parseXnsName } from "./names";

export const SIGNED_QUOTE_DOMAIN_NAME = "XDCID Registrar V2";
export const SIGNED_QUOTE_DOMAIN_VERSION = "1";
export const LEGACY_SIGNED_QUOTE_DOMAIN_NAME = "XDCID Signed Quote Registrar";
export const SIGNED_QUOTE_LIFETIME_SECONDS = 10 * 60;
export const QUOTE_BLOCK_TIME_SAFETY_SECONDS = 30;

export const signedQuoteTypes = {
  Quote: [
    { name: "node", type: "bytes32" },
    { name: "payer", type: "address" },
    { name: "nameOwner", type: "address" },
    { name: "product", type: "uint8" },
    { name: "termYears", type: "uint256" },
    { name: "paymentToken", type: "address" },
    { name: "paymentAmount", type: "uint256" },
    { name: "usdMicros", type: "uint256" },
    { name: "policyVersion", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "issuedAt", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type SignedQuoteProduct = "registration" | "renewal";
export type SignedQuoteCurrency = "XDC" | "USDC";

export type NormalizedSignedQuoteRequest = {
  name: string;
  labelLength: number;
  product: SignedQuoteProduct;
  productId: 0 | 1;
  termYears: 1 | 3 | 5 | 10;
  paymentCurrency: SignedQuoteCurrency;
  payer: Address;
  nameOwner: Address;
};

export type RegistrarQuote = {
  node: Hex;
  payer: Address;
  nameOwner: Address;
  product: 0 | 1;
  termYears: bigint;
  paymentToken: Address;
  paymentAmount: bigint;
  usdMicros: bigint;
  policyVersion: bigint;
  nonce: bigint;
  issuedAt: bigint;
  deadline: bigint;
};

export function normalizeSignedQuoteRequest(
  value: unknown,
): NormalizedSignedQuoteRequest {
  if (!isRecord(value)) {
    throw new ApiInputError("INVALID_REQUEST", "Request body must be an object");
  }

  const parsed = parseXnsName(
    typeof value.name === "string" ? value.name : "",
  );
  if (!parsed.isValid) {
    throw new ApiInputError(
      "INVALID_NAME",
      parsed.error || "Invalid XDCID name",
    );
  }

  if (value.product !== "registration" && value.product !== "renewal") {
    throw new ApiInputError(
      "INVALID_PRODUCT",
      "product must be registration or renewal",
    );
  }

  const termYears = Number(value.termYears);
  if (!isRegistrationTerm(termYears)) {
    throw new ApiInputError(
      "INVALID_YEARS",
      "termYears must be one of 1, 3, 5, or 10",
    );
  }

  const paymentCurrency =
    typeof value.paymentCurrency === "string"
      ? value.paymentCurrency.toUpperCase()
      : "";
  if (paymentCurrency !== "XDC" && paymentCurrency !== "USDC") {
    throw new ApiInputError(
      "INVALID_PAYMENT_CURRENCY",
      "paymentCurrency must be XDC or USDC",
    );
  }

  if (typeof value.payer !== "string" || !isAddress(value.payer)) {
    throw new ApiInputError("INVALID_ADDRESS", "payer must be a valid address");
  }
  if (typeof value.nameOwner !== "string" || !isAddress(value.nameOwner)) {
    throw new ApiInputError(
      "INVALID_ADDRESS",
      "nameOwner must be a valid address",
    );
  }

  return {
    name: parsed.name,
    labelLength: parsed.label.length,
    product: value.product,
    productId: value.product === "registration" ? 0 : 1,
    termYears,
    paymentCurrency,
    payer: getAddress(value.payer),
    nameOwner: getAddress(value.nameOwner),
  };
}

export function buildRegistrarQuote(input: {
  request: NormalizedSignedQuoteRequest;
  paymentToken: Address;
  paymentAmount: bigint;
  usdMicros: bigint;
  policyVersion: bigint;
  nonce: bigint;
  issuedAt: number;
}): RegistrarQuote {
  return {
    node: keccak256(toBytes(input.request.name)),
    payer: input.request.payer,
    nameOwner: input.request.nameOwner,
    product: input.request.productId,
    termYears: BigInt(input.request.termYears),
    paymentToken: input.paymentToken,
    paymentAmount: input.paymentAmount,
    usdMicros: input.usdMicros,
    policyVersion: input.policyVersion,
    nonce: input.nonce,
    issuedAt: BigInt(input.issuedAt),
    deadline: BigInt(input.issuedAt + SIGNED_QUOTE_LIFETIME_SECONDS),
  };
}

export function calculateBufferedXdcWeiForPolicy(
  totalUsdMicros: bigint,
  xdcUsdMicros: bigint,
  bufferBps: bigint,
): bigint {
  if (totalUsdMicros <= 0n || xdcUsdMicros <= 0n) {
    throw new Error("Price inputs must be positive");
  }
  if (bufferBps < 0n || bufferBps > 2_000n) {
    throw new Error("XDC quote buffer is outside the policy limit");
  }

  const basisPoints = 10_000n;
  return divideRoundingUp(
    totalUsdMicros * 10n ** 18n * (basisPoints + bufferBps),
    xdcUsdMicros * basisPoints,
  );
}

export function safeQuoteIssuedAt(input: {
  serverNowSeconds: number;
  latestBlockTimestamp: bigint;
}) {
  const chainNowSeconds = Number(input.latestBlockTimestamp);
  if (
    !Number.isSafeInteger(input.serverNowSeconds) ||
    input.serverNowSeconds < 0 ||
    !Number.isSafeInteger(chainNowSeconds) ||
    chainNowSeconds < 0
  ) {
    throw new Error("Quote timestamp inputs must be non-negative safe integers");
  }

  return Math.max(
    0,
    Math.min(input.serverNowSeconds, chainNowSeconds) -
      QUOTE_BLOCK_TIME_SAFETY_SECONDS,
  );
}

function divideRoundingUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
