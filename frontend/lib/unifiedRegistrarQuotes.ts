import { zeroHash, type Address, type Hex } from "viem";
import type {
  NormalizedSignedQuoteRequest,
  RegistrarQuote,
} from "./signedRegistrarQuotes";
import type {
  NormalizedSubdomainQuoteRequest,
  SubdomainQuote,
} from "./subdomainQuotes";

export const UNIFIED_QUOTE_DOMAIN_NAME = "XDCID Unified Registrar";
export const UNIFIED_QUOTE_DOMAIN_VERSION = "1";

export const unifiedQuoteTypes = {
  Quote: [
    { name: "node", type: "bytes32" },
    { name: "parentNode", type: "bytes32" },
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

export type UnifiedRegistrarQuote = {
  node: Hex;
  parentNode: Hex;
  payer: Address;
  nameOwner: Address;
  product: 0 | 1 | 2 | 3;
  termYears: bigint;
  paymentToken: Address;
  paymentAmount: bigint;
  usdMicros: bigint;
  policyVersion: bigint;
  nonce: bigint;
  issuedAt: bigint;
  deadline: bigint;
};

export function unifiedTopLevelQuote(
  quote: RegistrarQuote,
): UnifiedRegistrarQuote {
  return { ...quote, parentNode: zeroHash };
}

export function unifiedSubdomainQuote(
  quote: SubdomainQuote,
  request: NormalizedSubdomainQuoteRequest,
): UnifiedRegistrarQuote {
  return {
    node: quote.node,
    parentNode: quote.parentNode,
    payer: quote.payer,
    nameOwner: quote.subdomainOwner,
    product: request.action === "registration" ? 2 : 3,
    termYears: quote.termYears,
    paymentToken: quote.paymentToken,
    paymentAmount: quote.paymentAmount,
    usdMicros: quote.usdMicros,
    policyVersion: quote.policyVersion,
    nonce: quote.nonce,
    issuedAt: quote.issuedAt,
    deadline: quote.deadline,
  };
}

export function unifiedProtocolRequested() {
  return process.env.NEXT_PUBLIC_XNS_PROTOCOL_GENERATION === "unified-v3";
}

export function unifiedProductForTopLevel(
  request: NormalizedSignedQuoteRequest,
): 0 | 1 {
  return request.productId;
}
