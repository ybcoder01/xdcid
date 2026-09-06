import {
  getAddress,
  isAddress,
  isHex,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { parseXnsName } from "./names";

export const DOMAIN_DISCOUNT_DOMAIN_NAME = "XDCID Discount Authorization";
export const DOMAIN_DISCOUNT_DOMAIN_VERSION = "1";

export const domainDiscountTypes = {
  DiscountAuthorization: [
    { name: "node", type: "bytes32" },
    { name: "beneficiary", type: "address" },
    { name: "product", type: "uint8" },
    { name: "termYears", type: "uint256" },
    { name: "discountBps", type: "uint16" },
    { name: "maxUses", type: "uint32" },
    { name: "validAfter", type: "uint64" },
    { name: "deadline", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const registrarDiscountContextAbi = [
  {
    type: "function",
    name: "discountAuthorization",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const domainDiscountAuthorizationAbi = [
  {
    type: "function",
    name: "authorizationSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "consumer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "hashAuthorization",
    stateMutability: "pure",
    inputs: [discountAuthorizationInput()],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "isUsable",
    stateMutability: "view",
    inputs: [
      discountAuthorizationInput(),
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export type DomainDiscountAuthorization = {
  node: Hex;
  beneficiary: Address;
  product: 0 | 1;
  termYears: bigint;
  discountBps: number;
  maxUses: number;
  validAfter: bigint;
  deadline: bigint;
  nonce: bigint;
};

export type SerializedDomainDiscountAuthorization = Omit<
  DomainDiscountAuthorization,
  "termYears" | "validAfter" | "deadline" | "nonce"
> & {
  termYears: string;
  validAfter: string;
  deadline: string;
  nonce: string;
};

export function domainDiscountTypedData(input: {
  chainId: number;
  authorizationContract: Address;
  authorization: DomainDiscountAuthorization;
}) {
  return {
    domain: {
      name: DOMAIN_DISCOUNT_DOMAIN_NAME,
      version: DOMAIN_DISCOUNT_DOMAIN_VERSION,
      chainId: input.chainId,
      verifyingContract: input.authorizationContract,
    },
    types: domainDiscountTypes,
    primaryType: "DiscountAuthorization" as const,
    message: input.authorization,
  };
}

export function buildDomainDiscountAuthorization(input: {
  name: string;
  beneficiary: string;
  product?: 0 | 1;
  termYears: number;
  discountBps: number;
  maxUses: number;
  validAfter: number;
  deadline: number;
  nonce: bigint;
}): { name: string; authorization: DomainDiscountAuthorization } {
  const parsed = parseXnsName(input.name);
  if (!parsed.isValid) throw new Error(parsed.error || "Invalid XDCID name");
  if (!isAddress(input.beneficiary)) {
    throw new Error("Enter a valid beneficiary wallet address");
  }
  if (![1, 3, 5, 10].includes(input.termYears)) {
    throw new Error("Term must be 1, 3, 5, or 10 years");
  }
  if (!Number.isInteger(input.discountBps) || input.discountBps < 1 || input.discountBps > 10_000) {
    throw new Error("Discount must be between 0.01% and 100%");
  }
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 10) {
    throw new Error("Maximum uses must be between 1 and 10");
  }
  if (!Number.isSafeInteger(input.validAfter) || !Number.isSafeInteger(input.deadline)) {
    throw new Error("Grant validity is invalid");
  }
  if (input.deadline <= input.validAfter) {
    throw new Error("Grant expiry must be after its start");
  }
  if (input.nonce < 0n) throw new Error("Grant nonce is invalid");

  return {
    name: parsed.name,
    authorization: {
      node: keccak256(toBytes(parsed.name)),
      beneficiary: getAddress(input.beneficiary),
      product: input.product ?? 0,
      termYears: BigInt(input.termYears),
      discountBps: input.discountBps,
      maxUses: input.maxUses,
      validAfter: BigInt(input.validAfter),
      deadline: BigInt(input.deadline),
      nonce: input.nonce,
    },
  };
}

export function serializeDomainDiscountAuthorization(
  value: DomainDiscountAuthorization,
): SerializedDomainDiscountAuthorization {
  return {
    ...value,
    termYears: value.termYears.toString(),
    validAfter: value.validAfter.toString(),
    deadline: value.deadline.toString(),
    nonce: value.nonce.toString(),
  };
}

export function deserializeDomainDiscountAuthorization(
  value: unknown,
): DomainDiscountAuthorization {
  if (!isRecord(value)) throw new Error("Discount authorization is invalid");
  if (
    typeof value.node !== "string" ||
    !isHex(value.node, { strict: true }) ||
    value.node.length !== 66 ||
    typeof value.beneficiary !== "string" ||
    !isAddress(value.beneficiary)
  ) {
    throw new Error("Discount authorization identity is invalid");
  }
  const product = Number(value.product);
  const discountBps = Number(value.discountBps);
  const maxUses = Number(value.maxUses);
  if ((product !== 0 && product !== 1) || !Number.isInteger(discountBps) || !Number.isInteger(maxUses)) {
    throw new Error("Discount authorization values are invalid");
  }
  return {
    node: value.node as Hex,
    beneficiary: getAddress(value.beneficiary),
    product,
    termYears: parseBigInt(value.termYears, "termYears"),
    discountBps,
    maxUses,
    validAfter: parseBigInt(value.validAfter, "validAfter"),
    deadline: parseBigInt(value.deadline, "deadline"),
    nonce: parseBigInt(value.nonce, "nonce"),
  };
}

export function applyDomainDiscount(grossUsdMicros: bigint, discountBps: number): bigint {
  if (!Number.isInteger(discountBps) || discountBps < 0 || discountBps > 10_000) {
    throw new Error("Discount basis points are invalid");
  }
  if (discountBps === 10_000) return 0n;
  const basisPoints = 10_000n;
  const numerator = grossUsdMicros * (basisPoints - BigInt(discountBps));
  return (numerator + basisPoints - 1n) / basisPoints;
}

function discountAuthorizationInput() {
  return {
    name: "authorization",
    type: "tuple",
    components: domainDiscountTypes.DiscountAuthorization,
  } as const;
}

function parseBigInt(value: unknown, field: string): bigint {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    throw new Error(`Discount authorization ${field} is invalid`);
  }
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error(`Discount authorization ${field} is invalid`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
