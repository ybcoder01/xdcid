import {
  createPublicClient,
  defineChain,
  fallback,
  getAddress,
  http,
  isAddress,
  isAddressEqual,
  isHex,
  keccak256,
  toBytes,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
  type PublicClient
} from "viem";
import type {
  RegistrarQuoteData,
  SerializedDiscountAuthorization,
  SerializedRegistrarQuote,
  SerializedSubdomainQuote,
  SubdomainQuoteData
} from "./api.js";

export const XDC_CHAIN_ID = 50;
export const XDCID_SUFFIX = ".xdc";
export const MIN_LABEL_LENGTH = 2;
export const MAX_LABEL_LENGTH = 63;
export const PROFILE_KEYS = ["avatar", "website", "twitter", "telegram", "bio"] as const;
export const MULTICHAIN_RESOLVER_ADDRESS = "0x978d46Ba080Ae71b5cB39691106A1cCf6C6c7240" as const;

export const SUPPORTED_MULTICHAIN_NETWORKS = [
  { key: "xdc", name: "XDC Network", chainId: 50 },
  { key: "ethereum", name: "Ethereum", chainId: 1 },
  { key: "base", name: "Base", chainId: 8453 },
  { key: "arbitrum", name: "Arbitrum One", chainId: 42161 },
  { key: "polygon", name: "Polygon", chainId: 137 }
] as const;

export type SupportedMultichainNetwork = (typeof SUPPORTED_MULTICHAIN_NETWORKS)[number];
export type SupportedMultichainChainId = SupportedMultichainNetwork["chainId"];

export const DEFAULT_RPC_URLS = [
  "https://rpc.xdcrpc.com",
  "https://earpc.xinfin.network",
  "https://rpc.xinfin.network"
] as const;

export type XdcidContracts = {
  registry: Address;
  registrar: Address;
  resolver: Address;
  reverseResolver: Address;
  multichainResolver: Address;
  pricingPolicy: Address;
  discountAuthorization: Address;
  subdomainRegistrar: Address;
};

export const XDCID_CONTRACTS: XdcidContracts = {
  registry: "0x05fa64a05bc205DeDF47e023d2D90c2d119cd097",
  registrar: "0xdEaf1742614908a8d170f4c9520c3cd1e967ef36",
  resolver: "0x52bfa70B30190050F77033Fe427De8B3d4A8F453",
  reverseResolver: "0x8b1a236845b0CC84094578cEd97844b8dC5f139f",
  multichainResolver: MULTICHAIN_RESOLVER_ADDRESS,
  pricingPolicy: "0x8aE4b7E57b6693c70FD40F5De17974CA5AB6DB94",
  discountAuthorization: "0x9EE907230d351264403555fA6967EA44Ba31A5d1",
  subdomainRegistrar: "0x27b6Ef20912B50F7b86f6C0Aed75d0ddFD7DA1C7"
};

export const xdcMainnet = defineChain({
  id: XDC_CHAIN_ID,
  name: "XDC Network",
  nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
  rpcUrls: {
    default: { http: [...DEFAULT_RPC_URLS] }
  },
  blockExplorers: {
    default: { name: "XDCScan", url: "https://xdcscan.com" }
  }
});

export type ProfileKey = (typeof PROFILE_KEYS)[number];

export type ParsedXdcidName = {
  input: string;
  label: string;
  name: string;
  valid: boolean;
  error?: string;
};

export type ResolutionResult = {
  name: string;
  node: Hash;
  registered: boolean;
  expired: boolean;
  owner: Address | null;
  address: Address | null;
  expiry: bigint;
};

export type ReverseResolutionResult = {
  address: Address;
  name: string;
  node: Hash;
  expiry: bigint;
  verified: true;
};

export type MultichainAddressRecordResult = {
  name: string;
  node: Hash;
  chainId: number;
  target: Address | null;
  recordOwner: Address | null;
  active: boolean;
};

export type AvailabilityResult = {
  name: string;
  node: Hash;
  available: boolean;
  expiry: bigint;
  /** @deprecated Current pricing is signed in USD. Use createXdcidApiClient().getPricingQuote(). */
  pricePerYear: null;
  years: number;
  /** @deprecated Current pricing is signed in USD. Use createXdcidApiClient().createRegistrarQuote(). */
  totalPrice: null;
};

export type ProfileResult = {
  name: string;
  node: Hash;
  owner: Address;
  records: Record<ProfileKey, string>;
};

export type XdcidErrorCode =
  | "INVALID_NAME"
  | "INVALID_ADDRESS"
  | "INVALID_CHAIN_ID"
  | "INVALID_YEARS"
  | "WRONG_CHAIN"
  | "INVALID_CONFIG"
  | "RPC_ERROR";

export class XdcidSdkError extends Error {
  readonly code: XdcidErrorCode;

  constructor(code: XdcidErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "XdcidSdkError";
    this.code = code;
  }
}

export type XdcidClientOptions = {
  publicClient?: PublicClient;
  rpcUrls?: readonly string[];
  contracts?: Partial<XdcidContracts>;
};

const registrarAbi = [
  {
    type: "function",
    name: "available",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "bool" }]
  },
] as const;

const registryAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "expiryOf",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "transferName",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "newOwner", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setResolver",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "resolver", type: "address" }
    ],
    outputs: []
  }
] as const;

const resolverAbi = [
  {
    type: "function",
    name: "addresses",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" }
    ],
    outputs: [{ type: "string" }]
  },
  {
    type: "function",
    name: "setAddress",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "addr", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" }
    ],
    outputs: []
  }
] as const;

const reverseResolverAbi = [
  {
    type: "function",
    name: "primaryNames",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "string" }]
  },
  {
    type: "function",
    name: "setPrimaryName",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "node", type: "bytes32" }
    ],
    outputs: []
  }
] as const;

export const multichainResolverAbi = [
  {
    type: "function",
    name: "addressFor",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "chainId", type: "uint256" }
    ],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "addressRecord",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "chainId", type: "uint256" }
    ],
    outputs: [
      { name: "target", type: "address" },
      { name: "recordOwner", type: "address" },
      { name: "active", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "setAddress",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "chainId", type: "uint256" },
      { name: "target", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "clearAddress",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "chainId", type: "uint256" }
    ],
    outputs: []
  }
] as const;

export const xdcidRegistryAbi = registryAbi;
export const xdcidResolverAbi = resolverAbi;
export const xdcidReverseResolverAbi = reverseResolverAbi;

const registrarQuoteComponents = [
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
  { name: "deadline", type: "uint256" }
] as const;

const discountAuthorizationComponents = [
  { name: "node", type: "bytes32" },
  { name: "beneficiary", type: "address" },
  { name: "product", type: "uint8" },
  { name: "termYears", type: "uint256" },
  { name: "discountBps", type: "uint16" },
  { name: "maxUses", type: "uint32" },
  { name: "validAfter", type: "uint64" },
  { name: "deadline", type: "uint64" },
  { name: "nonce", type: "uint256" }
] as const;

export const signedRegistrarV2Abi = [
  {
    type: "function",
    name: "registerWithQuote",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "quote", type: "tuple", components: registrarQuoteComponents },
      { name: "quoteSignature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "renewWithQuote",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "quote", type: "tuple", components: registrarQuoteComponents },
      { name: "quoteSignature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "registerWithDiscountQuote",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "quote", type: "tuple", components: registrarQuoteComponents },
      { name: "quoteSignature", type: "bytes" },
      { name: "authorization", type: "tuple", components: discountAuthorizationComponents },
      { name: "authorizationSignature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "renewWithDiscountQuote",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "quote", type: "tuple", components: registrarQuoteComponents },
      { name: "quoteSignature", type: "bytes" },
      { name: "authorization", type: "tuple", components: discountAuthorizationComponents },
      { name: "authorizationSignature", type: "bytes" }
    ],
    outputs: []
  }
] as const;

const subdomainQuoteComponents = [
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
  { name: "deadline", type: "uint256" }
] as const;

export const subdomainRegistrarAbi = [
  {
    type: "function",
    name: "registerWithQuote",
    stateMutability: "payable",
    inputs: [
      { name: "parentName", type: "string" },
      { name: "label", type: "string" },
      { name: "quote", type: "tuple", components: subdomainQuoteComponents },
      { name: "quoteSignature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "renewWithQuote",
    stateMutability: "payable",
    inputs: [
      { name: "parentName", type: "string" },
      { name: "label", type: "string" },
      { name: "quote", type: "tuple", components: subdomainQuoteComponents },
      { name: "quoteSignature", type: "bytes" }
    ],
    outputs: []
  }
] as const;

export const erc20ApprovalAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  }
] as const;

type WriteRequest<TAbi extends readonly unknown[], TFunctionName extends string, TArgs extends readonly unknown[]> = {
  chainId: typeof XDC_CHAIN_ID;
  address: Address;
  abi: TAbi;
  functionName: TFunctionName;
  args: TArgs;
  value?: bigint;
};

export type RegistrarPaymentPlan = {
  approval: WriteRequest<typeof erc20ApprovalAbi, "approve", readonly [Address, bigint]> | null;
  transaction: WriteRequest<
    typeof signedRegistrarV2Abi,
    "registerWithQuote" | "renewWithQuote" | "registerWithDiscountQuote" | "renewWithDiscountQuote",
    readonly unknown[]
  >;
};

export type SubdomainPaymentPlan = {
  approval: WriteRequest<typeof erc20ApprovalAbi, "approve", readonly [Address, bigint]> | null;
  transaction: WriteRequest<
    typeof subdomainRegistrarAbi,
    "registerWithQuote" | "renewWithQuote",
    readonly [string, string, ReturnType<typeof deserializeSubdomainQuote>, Hash]
  >;
};

export type SetMultichainAddressRequest = {
  chainId: typeof XDC_CHAIN_ID;
  address: Address;
  abi: typeof multichainResolverAbi;
  functionName: "setAddress";
  args: readonly [Hash, bigint, Address];
};

export type ClearMultichainAddressRequest = {
  chainId: typeof XDC_CHAIN_ID;
  address: Address;
  abi: typeof multichainResolverAbi;
  functionName: "clearAddress";
  args: readonly [Hash, bigint];
};

type ContractRead = {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
};

export function parseXdcidName(value: string): ParsedXdcidName {
  const input = value.trim();
  const lower = input.toLowerCase();
  const label = lower.endsWith(XDCID_SUFFIX)
    ? lower.slice(0, -XDCID_SUFFIX.length)
    : lower;
  const name = label + XDCID_SUFFIX;

  if (label.length < MIN_LABEL_LENGTH) {
    return invalidName(input, label, name, "Name must be at least 2 characters");
  }

  if (label.length > MAX_LABEL_LENGTH) {
    return invalidName(input, label, name, "Name must be at most 63 characters");
  }

  if (!/^[a-z0-9-]+$/.test(label)) {
    return invalidName(input, label, name, "Use only letters, numbers, and hyphens");
  }

  if (label.startsWith("-") || label.endsWith("-")) {
    return invalidName(input, label, name, "Name cannot start or end with a hyphen");
  }

  return { input, label, name, valid: true };
}

export function normalizeName(value: string): string {
  const parsed = parseXdcidName(value);
  if (!parsed.valid) {
    throw new XdcidSdkError("INVALID_NAME", parsed.error || "Invalid XDCID name");
  }
  return parsed.name;
}

export function nodeForName(value: string): Hash {
  return keccak256(toBytes(normalizeName(value)));
}

export function createXdcidPublicClient(
  rpcUrls: readonly string[] = DEFAULT_RPC_URLS
): PublicClient {
  if (rpcUrls.length === 0) {
    throw new XdcidSdkError("INVALID_CONFIG", "At least one XDC RPC URL is required");
  }

  const transports = rpcUrls.map((url) => {
    assertRpcUrl(url);
    return http(url, { timeout: 3_500, retryCount: 1 });
  });

  return createPublicClient({
    chain: xdcMainnet,
    transport: fallback(transports)
  });
}

export function createXdcidClient(options: XdcidClientOptions = {}): XdcidClient {
  if (options.publicClient && options.rpcUrls) {
    throw new XdcidSdkError("INVALID_CONFIG", "Provide publicClient or rpcUrls, not both");
  }

  const publicClient = options.publicClient || createXdcidPublicClient(options.rpcUrls);
  const contracts = normalizeContracts(options.contracts);
  return new XdcidClient(publicClient, contracts);
}

export class XdcidClient {
  readonly contracts: XdcidContracts;
  private readonly publicClient: PublicClient;
  private chainValidation?: Promise<void>;

  constructor(publicClient: PublicClient, contracts: XdcidContracts = XDCID_CONTRACTS) {
    this.publicClient = publicClient;
    this.contracts = normalizeContracts(contracts);
  }

  async resolveName(value: string): Promise<ResolutionResult> {
    const name = normalizeName(value);
    const node = nodeForName(name);
    const [owner, expiry, resolvedAddress] = await Promise.all([
      this.read<Address>({
        address: this.contracts.registry,
        abi: registryAbi,
        functionName: "ownerOf",
        args: [node]
      }),
      this.read<bigint>({
        address: this.contracts.registry,
        abi: registryAbi,
        functionName: "expiryOf",
        args: [node]
      }),
      this.read<Address>({
        address: this.contracts.resolver,
        abi: resolverAbi,
        functionName: "addresses",
        args: [node]
      })
    ]);

    const now = BigInt(Math.floor(Date.now() / 1000));
    const registered = owner !== zeroAddress && expiry >= now;
    const expired = expiry > 0n && expiry < now;

    return {
      name,
      node,
      registered,
      expired,
      owner: registered ? getAddress(owner) : null,
      address: registered && resolvedAddress !== zeroAddress ? getAddress(resolvedAddress) : null,
      expiry
    };
  }

  async resolveAddress(value: string): Promise<Address | null> {
    return (await this.resolveName(value)).address;
  }

  async resolveMultichainAddress(value: string, chainId: number): Promise<Address | null> {
    const name = normalizeName(value);
    const node = nodeForName(name);
    const targetChainId = assertMultichainChainId(chainId);
    const target = await this.read<Address>({
      address: this.contracts.multichainResolver,
      abi: multichainResolverAbi,
      functionName: "addressFor",
      args: [node, BigInt(targetChainId)]
    });
    return target === zeroAddress ? null : getAddress(target);
  }

  async getMultichainAddressRecord(
    value: string,
    chainId: number
  ): Promise<MultichainAddressRecordResult> {
    const name = normalizeName(value);
    const node = nodeForName(name);
    const targetChainId = assertMultichainChainId(chainId);
    const [target, recordOwner, active] = await this.read<readonly [Address, Address, boolean]>({
      address: this.contracts.multichainResolver,
      abi: multichainResolverAbi,
      functionName: "addressRecord",
      args: [node, BigInt(targetChainId)]
    });
    return {
      name,
      node,
      chainId: targetChainId,
      target: target === zeroAddress ? null : getAddress(target),
      recordOwner: recordOwner === zeroAddress ? null : getAddress(recordOwner),
      active
    };
  }

  prepareSetMultichainAddress(
    value: string,
    chainId: number,
    target: string
  ): SetMultichainAddressRequest {
    const name = normalizeName(value);
    const targetChainId = assertMultichainChainId(chainId);
    if (!isAddress(target) || target === zeroAddress) {
      throw new XdcidSdkError("INVALID_ADDRESS", "Target must be a non-zero EVM address");
    }
    return {
      chainId: XDC_CHAIN_ID,
      address: this.contracts.multichainResolver,
      abi: multichainResolverAbi,
      functionName: "setAddress",
      args: [nodeForName(name), BigInt(targetChainId), getAddress(target)]
    };
  }

  prepareClearMultichainAddress(
    value: string,
    chainId: number
  ): ClearMultichainAddressRequest {
    const name = normalizeName(value);
    const targetChainId = assertMultichainChainId(chainId);
    return {
      chainId: XDC_CHAIN_ID,
      address: this.contracts.multichainResolver,
      abi: multichainResolverAbi,
      functionName: "clearAddress",
      args: [nodeForName(name), BigInt(targetChainId)]
    };
  }

  prepareTransferName(value: string, newOwner: string) {
    const owner = assertNonZeroAddress(newOwner, "New owner");
    return {
      chainId: XDC_CHAIN_ID,
      address: this.contracts.registry,
      abi: xdcidRegistryAbi,
      functionName: "transferName" as const,
      args: [nodeForName(value), owner] as const
    };
  }

  prepareSetResolver(value: string, resolver = this.contracts.resolver) {
    const target = assertNonZeroAddress(resolver, "Resolver");
    return {
      chainId: XDC_CHAIN_ID,
      address: this.contracts.registry,
      abi: xdcidRegistryAbi,
      functionName: "setResolver" as const,
      args: [nodeForName(value), target] as const
    };
  }

  prepareSetAddress(value: string, target: string) {
    const address = assertNonZeroAddress(target, "Resolved address");
    return {
      chainId: XDC_CHAIN_ID,
      address: this.contracts.resolver,
      abi: xdcidResolverAbi,
      functionName: "setAddress" as const,
      args: [nodeForName(value), address] as const
    };
  }

  prepareSetText(value: string, key: ProfileKey, text: string) {
    if (!PROFILE_KEYS.includes(key)) {
      throw new XdcidSdkError("INVALID_CONFIG", "Unsupported profile key");
    }
    return {
      chainId: XDC_CHAIN_ID,
      address: this.contracts.resolver,
      abi: xdcidResolverAbi,
      functionName: "setText" as const,
      args: [nodeForName(value), key, text] as const
    };
  }

  prepareSetPrimaryName(value: string) {
    const name = normalizeName(value);
    return {
      chainId: XDC_CHAIN_ID,
      address: this.contracts.reverseResolver,
      abi: xdcidReverseResolverAbi,
      functionName: "setPrimaryName" as const,
      args: [name, nodeForName(name)] as const
    };
  }

  prepareRegistrarPayment(data: RegistrarQuoteData): RegistrarPaymentPlan {
    assertQuoteContext(data.chainId, data.registrar, data.policy, {
      registrar: this.contracts.registrar,
      policy: this.contracts.pricingPolicy
    });
    const name = normalizeName(data.name);
    const quote = deserializeRegistrarQuote(data.quote);
    if (quote.node !== nodeForName(name)) {
      throw new XdcidSdkError("INVALID_CONFIG", "Registrar quote does not match the requested name");
    }
    if (
      quote.product !== (data.product === "registration" ? 0 : 1) ||
      quote.deadline < BigInt(Math.floor(Date.now() / 1_000))
    ) {
      throw new XdcidSdkError("INVALID_CONFIG", "Registrar quote product or deadline is invalid");
    }
    if (!isHex(data.signature, { strict: true })) {
      throw new XdcidSdkError("INVALID_CONFIG", "Registrar quote signature is invalid");
    }
    const baseFunction = data.product === "registration" ? "registerWithQuote" : "renewWithQuote";
    const discountFunction = data.product === "registration"
      ? "registerWithDiscountQuote"
      : "renewWithDiscountQuote";
    let discountAuthorization: ReturnType<typeof deserializeDiscountAuthorization> | undefined;
    if (data.discount) {
      if (
        !isAddressEqual(data.discount.authorizationContract, this.contracts.discountAuthorization) ||
        !isHex(data.discount.signature, { strict: true })
      ) {
        throw new XdcidSdkError("INVALID_CONFIG", "Discount authorization context is invalid");
      }
      discountAuthorization = deserializeDiscountAuthorization(data.discount.authorization);
      if (
        discountAuthorization.node !== quote.node ||
        !isAddressEqual(discountAuthorization.beneficiary, quote.nameOwner) ||
        discountAuthorization.product !== quote.product ||
        discountAuthorization.termYears !== quote.termYears ||
        discountAuthorization.deadline < BigInt(Math.floor(Date.now() / 1_000))
      ) {
        throw new XdcidSdkError("INVALID_CONFIG", "Discount authorization does not match the registrar quote");
      }
    }
    const args = data.discount && discountAuthorization
      ? [
          name,
          quote,
          data.signature,
          discountAuthorization,
          data.discount.signature
        ] as const
      : [name, quote, data.signature] as const;

    return {
      approval: quote.paymentToken === zeroAddress || quote.paymentAmount === 0n
        ? null
        : {
            chainId: XDC_CHAIN_ID,
            address: quote.paymentToken,
            abi: erc20ApprovalAbi,
            functionName: "approve",
            args: [data.registrar, quote.paymentAmount]
          },
      transaction: {
        chainId: XDC_CHAIN_ID,
        address: data.registrar,
        abi: signedRegistrarV2Abi,
        functionName: data.discount ? discountFunction : baseFunction,
        args,
        value: quote.paymentToken === zeroAddress ? quote.paymentAmount : 0n
      }
    };
  }

  prepareSubdomainPayment(data: SubdomainQuoteData): SubdomainPaymentPlan {
    assertQuoteContext(data.chainId, data.registrar, data.pricingPolicy, {
      registrar: this.contracts.subdomainRegistrar,
      policy: this.contracts.pricingPolicy
    });
    const quote = deserializeSubdomainQuote(data.quote);
    const parentName = normalizeName(data.parentName);
    const label = normalizeSubdomainLabel(data.label);
    if (
      quote.node !== keccak256(toBytes(`${label}.${parentName}`)) ||
      quote.parentNode !== nodeForName(parentName) ||
      quote.deadline < BigInt(Math.floor(Date.now() / 1_000)) ||
      !isHex(data.signature, { strict: true })
    ) {
      throw new XdcidSdkError("INVALID_CONFIG", "Subdomain quote does not match the requested name");
    }
    return {
      approval: quote.paymentToken === zeroAddress || quote.paymentAmount === 0n
        ? null
        : {
            chainId: XDC_CHAIN_ID,
            address: quote.paymentToken,
            abi: erc20ApprovalAbi,
            functionName: "approve",
            args: [data.registrar, quote.paymentAmount]
          },
      transaction: {
        chainId: XDC_CHAIN_ID,
        address: data.registrar,
        abi: subdomainRegistrarAbi,
        functionName: data.action === "registration" ? "registerWithQuote" : "renewWithQuote",
        args: [parentName, label, quote, data.signature],
        value: quote.paymentToken === zeroAddress ? quote.paymentAmount : 0n
      }
    };
  }

  async reverseResolve(value: string): Promise<ReverseResolutionResult | null> {
    if (!isAddress(value)) {
      throw new XdcidSdkError("INVALID_ADDRESS", "Address must be a valid EVM address");
    }

    const address = getAddress(value);
    const storedName = await this.read<string>({
      address: this.contracts.reverseResolver,
      abi: reverseResolverAbi,
      functionName: "primaryNames",
      args: [address]
    });

    if (!storedName) return null;

    let name: string;
    try {
      name = normalizeName(storedName);
    } catch {
      return null;
    }

    const node = nodeForName(name);
    const [owner, expiry] = await Promise.all([
      this.read<Address>({
        address: this.contracts.registry,
        abi: registryAbi,
        functionName: "ownerOf",
        args: [node]
      }),
      this.read<bigint>({
        address: this.contracts.registry,
        abi: registryAbi,
        functionName: "expiryOf",
        args: [node]
      })
    ]);

    const now = BigInt(Math.floor(Date.now() / 1000));
    if (owner === zeroAddress || expiry < now || !isAddressEqual(owner, address)) {
      return null;
    }

    return { address, name, node, expiry, verified: true };
  }

  async checkAvailability(value: string, years = 1): Promise<AvailabilityResult> {
    assertYears(years);
    const name = normalizeName(value);
    const node = nodeForName(name);
    const [available, expiry] = await Promise.all([
      this.read<boolean>({
        address: this.contracts.registrar,
        abi: registrarAbi,
        functionName: "available",
        args: [name]
      }),
      this.read<bigint>({
        address: this.contracts.registry,
        abi: registryAbi,
        functionName: "expiryOf",
        args: [node]
      })
    ]);

    return {
      name,
      node,
      available,
      expiry,
      pricePerYear: null,
      years,
      totalPrice: null
    };
  }

  async getProfile(value: string): Promise<ProfileResult | null> {
    const resolution = await this.resolveName(value);
    if (!resolution.registered || !resolution.owner) return null;

    const values = await Promise.all(
      PROFILE_KEYS.map((key) =>
        this.read<string>({
          address: this.contracts.resolver,
          abi: resolverAbi,
          functionName: "text",
          args: [resolution.node, key]
        })
      )
    );

    const records = Object.fromEntries(
      PROFILE_KEYS.map((key, index) => [key, values[index]])
    ) as Record<ProfileKey, string>;

    return {
      name: resolution.name,
      node: resolution.node,
      owner: resolution.owner,
      records
    };
  }

  async verifyForwardReverse(value: string): Promise<boolean> {
    const forward = await this.resolveName(value);
    if (!forward.registered || !forward.owner) return false;
    const reverse = await this.reverseResolve(forward.owner);
    return reverse?.name === forward.name;
  }

  private async ensureXdcMainnet(): Promise<void> {
    if (!this.chainValidation) {
      this.chainValidation = (async () => {
        const configuredId = this.publicClient.chain?.id;
        const chainId = configuredId ?? (await this.publicClient.getChainId());
        if (chainId !== XDC_CHAIN_ID) {
          throw new XdcidSdkError(
            "WRONG_CHAIN",
            "XDCID reads require XDC mainnet chain ID 50; received " + chainId
          );
        }
      })();
    }
    return this.chainValidation;
  }

  private async read<T>(request: ContractRead): Promise<T> {
    await this.ensureXdcMainnet();
    try {
      return (await this.publicClient.readContract(request as never)) as T;
    } catch (cause) {
      if (cause instanceof XdcidSdkError) throw cause;
      throw new XdcidSdkError("RPC_ERROR", "XDC contract read failed", { cause });
    }
  }
}

function invalidName(input: string, label: string, name: string, error: string): ParsedXdcidName {
  return { input, label, name, valid: false, error };
}

function assertMultichainChainId(chainId: number): number {
  if (!Number.isSafeInteger(chainId) || chainId < 1) {
    throw new XdcidSdkError("INVALID_CHAIN_ID", "Chain ID must be a positive safe integer");
  }
  return chainId;
}

function assertYears(years: number): void {
  if (!Number.isInteger(years) || years < 1 || years > 100) {
    throw new XdcidSdkError("INVALID_YEARS", "Years must be an integer between 1 and 100");
  }
}

function assertRpcUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new XdcidSdkError("INVALID_CONFIG", "RPC URL is invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new XdcidSdkError("INVALID_CONFIG", "RPC URL must use HTTP or HTTPS");
  }
}

function assertNonZeroAddress(value: string, label: string): Address {
  if (!isAddress(value) || value === zeroAddress) {
    throw new XdcidSdkError("INVALID_ADDRESS", `${label} must be a non-zero EVM address`);
  }
  return getAddress(value);
}

function assertQuoteContext(
  chainId: number,
  registrar: string,
  policy: string,
  expected: { registrar: Address; policy: Address }
) {
  if (chainId !== XDC_CHAIN_ID) {
    throw new XdcidSdkError("WRONG_CHAIN", "Quote must target XDC mainnet chain ID 50");
  }
  if (
    !isAddress(registrar) ||
    !isAddress(policy) ||
    !isAddressEqual(registrar, expected.registrar) ||
    !isAddressEqual(policy, expected.policy)
  ) {
    throw new XdcidSdkError("INVALID_CONFIG", "Quote contract addresses do not match the SDK configuration");
  }
}

function deserializeRegistrarQuote(value: SerializedRegistrarQuote) {
  assertSerializedQuoteIdentity(value.node, value.payer, value.nameOwner);
  if (value.product !== 0 && value.product !== 1) {
    throw new XdcidSdkError("INVALID_CONFIG", "Registrar quote product is invalid");
  }
  return {
    node: value.node,
    payer: getAddress(value.payer),
    nameOwner: getAddress(value.nameOwner),
    product: value.product,
    termYears: parseUnsignedBigInt(value.termYears, "termYears"),
    paymentToken: getAddress(value.paymentToken),
    paymentAmount: parseUnsignedBigInt(value.paymentAmount, "paymentAmount"),
    usdMicros: parseUnsignedBigInt(value.usdMicros, "usdMicros"),
    policyVersion: parseUnsignedBigInt(value.policyVersion, "policyVersion"),
    nonce: parseUnsignedBigInt(value.nonce, "nonce"),
    issuedAt: parseUnsignedBigInt(value.issuedAt, "issuedAt"),
    deadline: parseUnsignedBigInt(value.deadline, "deadline")
  };
}

function deserializeDiscountAuthorization(value: SerializedDiscountAuthorization) {
  assertSerializedQuoteIdentity(value.node, value.beneficiary, value.beneficiary);
  if (
    !Number.isSafeInteger(value.product) ||
    !Number.isSafeInteger(value.discountBps) ||
    value.discountBps < 0 ||
    value.discountBps > 10_000 ||
    !Number.isSafeInteger(value.maxUses) ||
    value.maxUses < 1
  ) {
    throw new XdcidSdkError("INVALID_CONFIG", "Discount authorization values are invalid");
  }
  return {
    node: value.node,
    beneficiary: getAddress(value.beneficiary),
    product: value.product,
    termYears: parseUnsignedBigInt(value.termYears, "discount termYears"),
    discountBps: value.discountBps,
    maxUses: value.maxUses,
    validAfter: parseUnsignedBigInt(value.validAfter, "discount validAfter"),
    deadline: parseUnsignedBigInt(value.deadline, "discount deadline"),
    nonce: parseUnsignedBigInt(value.nonce, "discount nonce")
  };
}

function deserializeSubdomainQuote(value: SerializedSubdomainQuote) {
  if (!isHex(value.parentNode, { strict: true }) || value.parentNode.length !== 66) {
    throw new XdcidSdkError("INVALID_CONFIG", "Subdomain quote parent node is invalid");
  }
  assertSerializedQuoteIdentity(value.node, value.payer, value.subdomainOwner);
  return {
    node: value.node,
    parentNode: value.parentNode,
    payer: getAddress(value.payer),
    subdomainOwner: getAddress(value.subdomainOwner),
    termYears: parseUnsignedBigInt(value.termYears, "termYears"),
    paymentToken: getAddress(value.paymentToken),
    paymentAmount: parseUnsignedBigInt(value.paymentAmount, "paymentAmount"),
    usdMicros: parseUnsignedBigInt(value.usdMicros, "usdMicros"),
    policyVersion: parseUnsignedBigInt(value.policyVersion, "policyVersion"),
    nonce: parseUnsignedBigInt(value.nonce, "nonce"),
    issuedAt: parseUnsignedBigInt(value.issuedAt, "issuedAt"),
    deadline: parseUnsignedBigInt(value.deadline, "deadline")
  };
}

function assertSerializedQuoteIdentity(node: string, firstAddress: string, secondAddress: string) {
  if (
    !isHex(node, { strict: true }) ||
    node.length !== 66 ||
    !isAddress(firstAddress) ||
    !isAddress(secondAddress)
  ) {
    throw new XdcidSdkError("INVALID_CONFIG", "Quote identity fields are invalid");
  }
}

function parseUnsignedBigInt(value: string, field: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new XdcidSdkError("INVALID_CONFIG", `${field} must be an unsigned integer string`);
  }
  return BigInt(value);
}

function normalizeSubdomainLabel(value: string): string {
  const label = value.trim().toLowerCase();
  if (
    label.length < 1 ||
    label.length > 63 ||
    !/^[a-z0-9-]+$/.test(label) ||
    label.startsWith("-") ||
    label.endsWith("-")
  ) {
    throw new XdcidSdkError("INVALID_NAME", "Subdomain label is invalid");
  }
  return label;
}

function normalizeContracts(overrides?: Partial<XdcidContracts>): XdcidContracts {
  const contracts = { ...XDCID_CONTRACTS, ...overrides };
  for (const [name, address] of Object.entries(contracts)) {
    if (!isAddress(address) || address === zeroAddress) {
      throw new XdcidSdkError("INVALID_CONFIG", "Invalid " + name + " contract address");
    }
  }
  return {
    registry: getAddress(contracts.registry),
    registrar: getAddress(contracts.registrar),
    resolver: getAddress(contracts.resolver),
    reverseResolver: getAddress(contracts.reverseResolver),
    multichainResolver: getAddress(contracts.multichainResolver),
    pricingPolicy: getAddress(contracts.pricingPolicy),
    discountAuthorization: getAddress(contracts.discountAuthorization),
    subdomainRegistrar: getAddress(contracts.subdomainRegistrar)
  };
}
