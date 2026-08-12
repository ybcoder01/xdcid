import { createHash } from "node:crypto";
import {
  createPublicClient,
  fallback,
  getAddress,
  http,
  isAddress,
  isHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  apiSuccess,
  handleApiError,
  ApiInputError,
  ApiServiceError,
} from "../../../../../lib/apiResponse";
import { getCoinGeckoXdcPrice } from "../../../../../lib/coingeckoXdcPrice";
import {
  buildRegistrarQuote,
  calculateBufferedXdcWeiForPolicy,
  normalizeSignedQuoteRequest,
  SIGNED_QUOTE_DOMAIN_NAME,
  SIGNED_QUOTE_DOMAIN_VERSION,
  signedQuoteTypes,
} from "../../../../../lib/signedRegistrarQuotes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 8_192;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 12;
const DEFAULT_RPC_TIMEOUT_MS = 3_500;
const DEFAULT_XDC_RPC_URLS = [
  "https://rpc.xdcrpc.com",
  "https://earpc.xinfin.network",
];

type RateLimitEntry = { count: number; resetAt: number };
const rateLimits = new Map<string, RateLimitEntry>();

const registrarAbi = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "payer", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "available",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "registry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "pricingPolicy",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const registryAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const pricingPolicyAbi = [
  {
    type: "function",
    name: "version",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "priceUsdMicros",
    stateMutability: "view",
    inputs: [
      { name: "product", type: "uint8" },
      { name: "labelLength", type: "uint256" },
      { name: "termYears", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isQuoteAuthorizationValid",
    stateMutability: "view",
    inputs: [
      { name: "signer", type: "address" },
      { name: "quoteVersion", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "config",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "threeCharacterAnnualUsdMicros", type: "uint64" },
          { name: "fourCharacterAnnualUsdMicros", type: "uint64" },
          { name: "standardAnnualUsdMicros", type: "uint64" },
          { name: "subdomainAnnualUsdMicros", type: "uint64" },
          { name: "migrationUsdMicros", type: "uint64" },
          { name: "threeYearDiscountBps", type: "uint16" },
          { name: "fiveYearDiscountBps", type: "uint16" },
          { name: "tenYearDiscountBps", type: "uint16" },
          { name: "xdcQuoteBufferBps", type: "uint16" },
          { name: "quoteSigner", type: "address" },
          { name: "usdcToken", type: "address" },
          { name: "treasury", type: "address" },
          { name: "xdcPaymentsEnabled", type: "bool" },
          { name: "usdcPaymentsEnabled", type: "bool" },
        ],
      },
    ],
  },
] as const;

export async function POST(request: Request) {
  try {
    enforceRateLimit(request);
    const body = await readBody(request);
    const quoteRequest = normalizeSignedQuoteRequest(body);
    const registrar = requiredAddress(
      "XNS_SIGNED_QUOTE_REGISTRAR",
      process.env.XNS_SIGNED_QUOTE_REGISTRAR,
    );
    const pricingPolicy = requiredAddress(
      "XNS_PRICING_POLICY",
      process.env.XNS_PRICING_POLICY,
    );
    const account = quoteSignerAccount();
    const client = quoteClient();
    const chainId = await client.getChainId();
    const expectedChainId = boundedInteger(
      process.env.XNS_QUOTE_CHAIN_ID,
      50,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    if (chainId !== expectedChainId) {
      throw new ApiServiceError(
        "QUOTE_SIGNING_UNAVAILABLE",
        "Quote RPC is connected to the wrong network",
        503,
      );
    }

    const registrarPolicy = await client.readContract({
      address: registrar,
      abi: registrarAbi,
      functionName: "pricingPolicy",
    });
    if (getAddress(registrarPolicy) !== pricingPolicy) {
      throw new ApiServiceError(
        "QUOTE_SIGNING_UNAVAILABLE",
        "Registrar and pricing policy configuration do not match",
        503,
      );
    }

    const [policyVersion, config, nonce] = await Promise.all([
      client.readContract({
        address: pricingPolicy,
        abi: pricingPolicyAbi,
        functionName: "version",
      }),
      client.readContract({
        address: pricingPolicy,
        abi: pricingPolicyAbi,
        functionName: "config",
      }),
      client.readContract({
        address: registrar,
        abi: registrarAbi,
        functionName: "nonces",
        args: [quoteRequest.payer],
      }),
    ]);

    const signerAuthorized = await client.readContract({
      address: pricingPolicy,
      abi: pricingPolicyAbi,
      functionName: "isQuoteAuthorizationValid",
      args: [account.address, policyVersion],
    });
    if (!signerAuthorized) {
      throw new ApiServiceError(
        "QUOTE_SIGNING_UNAVAILABLE",
        "Quote signer is not authorized by the pricing policy",
        503,
      );
    }

    const node = buildRegistrarQuote({
      request: quoteRequest,
      paymentToken: zeroAddress,
      paymentAmount: 1n,
      usdMicros: 1n,
      policyVersion,
      nonce,
      issuedAt: 0,
    }).node;
    await validateNameState({
      client,
      registrar,
      node,
      request: quoteRequest,
    });

    const usdMicros = await client.readContract({
      address: pricingPolicy,
      abi: pricingPolicyAbi,
      functionName: "priceUsdMicros",
      args: [
        quoteRequest.productId,
        BigInt(quoteRequest.labelLength),
        BigInt(quoteRequest.termYears),
      ],
    });

    let paymentToken: Address;
    let paymentAmount: bigint;
    let market:
      | {
          provider: string;
          coinId: string;
          priceUsdMicros: string;
          observedAt: string;
          fetchedAt: string;
        }
      | undefined;

    if (quoteRequest.paymentCurrency === "XDC") {
      if (!config.xdcPaymentsEnabled) {
        throw new ApiServiceError(
          "QUOTE_SIGNING_UNAVAILABLE",
          "XDC registration payments are paused",
          503,
        );
      }
      const xdc = await getCoinGeckoXdcPrice();
      paymentToken = zeroAddress;
      paymentAmount = calculateBufferedXdcWeiForPolicy(
        usdMicros,
        xdc.priceUsdMicros,
        BigInt(config.xdcQuoteBufferBps),
      );
      market = {
        provider: xdc.provider,
        coinId: xdc.coinId,
        priceUsdMicros: xdc.priceUsdMicros.toString(),
        observedAt: xdc.observedAt,
        fetchedAt: xdc.fetchedAt,
      };
    } else {
      if (!config.usdcPaymentsEnabled) {
        throw new ApiServiceError(
          "QUOTE_SIGNING_UNAVAILABLE",
          "USDC registration payments are paused",
          503,
        );
      }
      paymentToken = getAddress(config.usdcToken);
      paymentAmount = usdMicros;
    }

    const issuedAt = Math.floor(Date.now() / 1_000);
    const quote = buildRegistrarQuote({
      request: quoteRequest,
      paymentToken,
      paymentAmount,
      usdMicros,
      policyVersion,
      nonce,
      issuedAt,
    });
    const signature = await account.signTypedData({
      domain: {
        name: SIGNED_QUOTE_DOMAIN_NAME,
        version: SIGNED_QUOTE_DOMAIN_VERSION,
        chainId,
        verifyingContract: registrar,
      },
      types: signedQuoteTypes,
      primaryType: "Quote",
      message: quote,
    });

    return apiSuccess({
      authorizedForPayment: true,
      chainId,
      registrar,
      policy: pricingPolicy,
      product: quoteRequest.product,
      name: quoteRequest.name,
      paymentCurrency: quoteRequest.paymentCurrency,
      quote: serializeQuote(quote),
      signature,
      market,
    });
  } catch (error) {
    return handleApiError(error, "Signed registrar quote failed");
  }
}

async function validateNameState(input: {
  client: ReturnType<typeof quoteClient>;
  registrar: Address;
  node: Hex;
  request: ReturnType<typeof normalizeSignedQuoteRequest>;
}) {
  if (input.request.product === "registration") {
    const available = await input.client.readContract({
      address: input.registrar,
      abi: registrarAbi,
      functionName: "available",
      args: [input.request.name],
    });
    if (!available) {
      throw new ApiServiceError(
        "NAME_UNAVAILABLE",
        "The requested XDCID name is unavailable",
        409,
      );
    }
    return;
  }

  if (
    input.request.payer !== input.request.nameOwner
  ) {
    throw new ApiInputError(
      "INVALID_REQUEST",
      "Renewal payer and nameOwner must be the same address",
    );
  }
  const registry = await input.client.readContract({
    address: input.registrar,
    abi: registrarAbi,
    functionName: "registry",
  });
  const owner = await input.client.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "ownerOf",
    args: [input.node],
  });
  if (owner === zeroAddress || getAddress(owner) !== input.request.payer) {
    throw new ApiServiceError(
      "NOT_NAME_OWNER",
      "Only the current name owner can request a renewal quote",
      403,
    );
  }
}

async function readBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    throw new ApiInputError("INVALID_REQUEST", "Request body is too large");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    throw new ApiInputError("INVALID_REQUEST", "Request body is too large");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiInputError("INVALID_REQUEST", "Request body must be valid JSON");
  }
}

function quoteSignerAccount() {
  const key = process.env.XNS_QUOTE_SIGNER_PRIVATE_KEY?.trim();
  if (!key || !isHex(key) || key.length !== 66) {
    throw new ApiServiceError(
      "QUOTE_SIGNING_UNAVAILABLE",
      "Quote signing is not configured",
      503,
    );
  }
  return privateKeyToAccount(key as Hex);
}

function quoteClient() {
  const urls = (
    process.env.XNS_QUOTE_RPC_URLS ||
    process.env.XDC_RPC_URLS ||
    DEFAULT_XDC_RPC_URLS.join(",")
  )
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^https?:\/\//.test(value));
  if (urls.length === 0) {
    throw new ApiServiceError(
      "QUOTE_SIGNING_UNAVAILABLE",
      "Quote RPC is not configured",
      503,
    );
  }
  const timeout = boundedInteger(
    process.env.XNS_QUOTE_RPC_TIMEOUT_MS,
    DEFAULT_RPC_TIMEOUT_MS,
    1_000,
    10_000,
  );
  return createPublicClient({
    transport: fallback(
      urls.map((url) => http(url, { timeout, retryCount: 0 })),
      { rank: false, retryCount: 0 },
    ),
  });
}

function requiredAddress(name: string, value: string | undefined): Address {
  if (!value || !isAddress(value)) {
    throw new ApiServiceError(
      "QUOTE_SIGNING_UNAVAILABLE",
      name + " is not configured",
      503,
    );
  }
  return getAddress(value);
}

function serializeQuote(quote: ReturnType<typeof buildRegistrarQuote>) {
  return {
    node: quote.node,
    payer: quote.payer,
    nameOwner: quote.nameOwner,
    product: quote.product,
    termYears: quote.termYears.toString(),
    paymentToken: quote.paymentToken,
    paymentAmount: quote.paymentAmount.toString(),
    usdMicros: quote.usdMicros.toString(),
    policyVersion: quote.policyVersion.toString(),
    nonce: quote.nonce.toString(),
    issuedAt: quote.issuedAt.toString(),
    deadline: quote.deadline.toString(),
  };
}

function enforceRateLimit(request: Request) {
  const now = Date.now();
  const source =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const key = createHash("sha256").update(source).digest("hex");
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    pruneRateLimits(now);
    return;
  }
  if (current.count >= RATE_LIMIT_REQUESTS) {
    throw new ApiServiceError(
      "RATE_LIMITED",
      "Too many quote requests; try again shortly",
      429,
    );
  }
  current.count += 1;
}

function pruneRateLimits(now: number) {
  if (rateLimits.size < 1_000) return;
  for (const [key, entry] of rateLimits) {
    if (entry.resetAt <= now) rateLimits.delete(key);
  }
}

function boundedInteger(
  value: string | undefined,
  fallbackValue: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallbackValue;
}
