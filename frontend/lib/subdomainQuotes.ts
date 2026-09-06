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

export const SUBDOMAIN_QUOTE_DOMAIN_NAME = "XDCID Subdomain Registrar";
export const SUBDOMAIN_QUOTE_DOMAIN_VERSION = "1";
export const SUBDOMAIN_QUOTE_LIFETIME_SECONDS = 10 * 60;

export const subdomainQuoteTypes = {
  SubdomainQuote: [
    { name: "node", type: "bytes32" },
    { name: "parentNode", type: "bytes32" },
    { name: "payer", type: "address" },
    { name: "subdomainOwner", type: "address" },
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

export type SubdomainQuoteAction = "registration" | "renewal";
export type SubdomainQuoteCurrency = "XDC" | "USDC";

export type NormalizedSubdomainQuoteRequest = {
  parentName: string;
  label: string;
  fullName: string;
  action: SubdomainQuoteAction;
  termYears: 1 | 3 | 5 | 10;
  paymentCurrency: SubdomainQuoteCurrency;
  payer: Address;
  subdomainOwner: Address;
};

export type SubdomainQuote = {
  node: Hex;
  parentNode: Hex;
  payer: Address;
  subdomainOwner: Address;
  termYears: bigint;
  paymentToken: Address;
  paymentAmount: bigint;
  usdMicros: bigint;
  policyVersion: bigint;
  nonce: bigint;
  issuedAt: bigint;
  deadline: bigint;
};

export function normalizeSubdomainQuoteRequest(
  value: unknown,
): NormalizedSubdomainQuoteRequest {
  if (!isRecord(value)) {
    throw new ApiInputError("INVALID_REQUEST", "Request body must be an object");
  }

  const parent = parseXnsName(
    typeof value.parentName === "string" ? value.parentName : "",
  );
  if (!parent.isValid) {
    throw new ApiInputError(
      "INVALID_PARENT",
      parent.error || "Enter a valid parent XDCID",
    );
  }

  const label = typeof value.label === "string"
    ? value.label.trim().toLowerCase()
    : "";
  if (
    label.length < 1 ||
    label.length > 63 ||
    !/^[a-z0-9-]+$/.test(label) ||
    label.startsWith("-") ||
    label.endsWith("-")
  ) {
    throw new ApiInputError(
      "INVALID_LABEL",
      "Subdomain labels must use 1-63 letters, numbers, or hyphens and cannot begin or end with a hyphen",
    );
  }

  if (value.action !== "registration" && value.action !== "renewal") {
    throw new ApiInputError(
      "INVALID_ACTION",
      "action must be registration or renewal",
    );
  }

  const termYears = Number(value.termYears);
  if (!isRegistrationTerm(termYears)) {
    throw new ApiInputError(
      "INVALID_YEARS",
      "termYears must be one of 1, 3, 5, or 10",
    );
  }

  const paymentCurrency = typeof value.paymentCurrency === "string"
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
  if (
    typeof value.subdomainOwner !== "string" ||
    !isAddress(value.subdomainOwner)
  ) {
    throw new ApiInputError(
      "INVALID_ADDRESS",
      "subdomainOwner must be a valid address",
    );
  }

  return {
    parentName: parent.name,
    label,
    fullName: `${label}.${parent.name}`,
    action: value.action,
    termYears,
    paymentCurrency,
    payer: getAddress(value.payer),
    subdomainOwner: getAddress(value.subdomainOwner),
  };
}

export function buildSubdomainQuote(input: {
  request: NormalizedSubdomainQuoteRequest;
  paymentToken: Address;
  paymentAmount: bigint;
  usdMicros: bigint;
  policyVersion: bigint;
  nonce: bigint;
  issuedAt: number;
}): SubdomainQuote {
  return {
    node: keccak256(toBytes(input.request.fullName)),
    parentNode: keccak256(toBytes(input.request.parentName)),
    payer: input.request.payer,
    subdomainOwner: input.request.subdomainOwner,
    termYears: BigInt(input.request.termYears),
    paymentToken: input.paymentToken,
    paymentAmount: input.paymentAmount,
    usdMicros: input.usdMicros,
    policyVersion: input.policyVersion,
    nonce: input.nonce,
    issuedAt: BigInt(input.issuedAt),
    deadline: BigInt(input.issuedAt + SUBDOMAIN_QUOTE_LIFETIME_SECONDS),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
