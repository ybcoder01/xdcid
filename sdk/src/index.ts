import {
  createPublicClient,
  defineChain,
  fallback,
  getAddress,
  http,
  isAddress,
  isAddressEqual,
  keccak256,
  toBytes,
  zeroAddress,
  type Address,
  type Hash,
  type PublicClient
} from "viem";

export const XDC_CHAIN_ID = 50;
export const XDCID_SUFFIX = ".xdc";
export const MIN_LABEL_LENGTH = 3;
export const MAX_LABEL_LENGTH = 63;
export const PROFILE_KEYS = ["avatar", "website", "twitter", "telegram", "bio"] as const;

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
};

export const XDCID_CONTRACTS: XdcidContracts = {
  registry: "0x05fa64a05bc205DeDF47e023d2D90c2d119cd097",
  registrar: "0x6955Be33d0B414784F9d3a6E71BAc1bb9B376cD7",
  resolver: "0x52bfa70B30190050F77033Fe427De8B3d4A8F453",
  reverseResolver: "0x8b1a236845b0CC84094578cEd97844b8dC5f139f"
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

export type AvailabilityResult = {
  name: string;
  node: Hash;
  available: boolean;
  expiry: bigint;
  pricePerYear: bigint;
  years: number;
  totalPrice: bigint;
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
  {
    type: "function",
    name: "price",
    stateMutability: "pure",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "uint256" }]
  }
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
  }
] as const;

const reverseResolverAbi = [
  {
    type: "function",
    name: "primaryNames",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "string" }]
  }
] as const;

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
    return invalidName(input, label, name, "Name must be at least 3 characters");
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

export function createXdcidPublicClient(rpcUrls: readonly string[] = DEFAULT_RPC_URLS) {
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
    const [available, expiry, pricePerYear] = await Promise.all([
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
      }),
      this.read<bigint>({
        address: this.contracts.registrar,
        abi: registrarAbi,
        functionName: "price",
        args: [name]
      })
    ]);

    return {
      name,
      node,
      available,
      expiry,
      pricePerYear,
      years,
      totalPrice: pricePerYear * BigInt(years)
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
    reverseResolver: getAddress(contracts.reverseResolver)
  };
}
