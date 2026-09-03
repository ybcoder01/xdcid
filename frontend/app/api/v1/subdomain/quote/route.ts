import { createHash } from "node:crypto";
import {
  createPublicClient,
  fallback,
  getAddress,
  http,
  isAddress,
  isHex,
  parseAbi,
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
import { calculateBufferedXdcWeiForPolicy } from "../../../../../lib/signedRegistrarQuotes";
import {
  buildSubdomainQuote,
  normalizeSubdomainQuoteRequest,
  SUBDOMAIN_QUOTE_DOMAIN_NAME,
  SUBDOMAIN_QUOTE_DOMAIN_VERSION,
  subdomainQuoteTypes,
} from "../../../../../lib/subdomainQuotes";

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
const YEAR_SECONDS = 365n * 24n * 60n * 60n;
const rateLimits = new Map<string, { count: number; resetAt: number }>();

const subdomainRegistrarAbi = parseAbi([
  "function pricingPolicy() view returns (address)",
  "function registry() view returns (address)",
  "function nonces(address payer) view returns (uint256)",
  "function available(string parentName,string label) view returns (bool)",
  "function ownerOf(bytes32 node) view returns (address)",
  "function records(bytes32 node) view returns (address owner,bytes32 parentNode,uint256 expiry)",
  "function parentOperators(bytes32 parentNode,address parentOwner,address operator) view returns (bool)",
]);

const registryAbi = parseAbi([
  "function ownerOf(bytes32 node) view returns (address)",
  "function expiryOf(bytes32 node) view returns (uint256)",
]);

const policyAbi = parseAbi([
  "function version() view returns (uint256)",
  "function priceUsdMicros(uint8 product,uint256 labelLength,uint256 termYears) view returns (uint256)",
  "function isQuoteAuthorizationValid(address signer,uint256 quoteVersion) view returns (bool)",
  "function config() view returns ((uint64 twoCharacterAnnualUsdMicros,uint64 threeCharacterAnnualUsdMicros,uint64 fourCharacterAnnualUsdMicros,uint64 standardAnnualUsdMicros,uint64 subdomainAnnualUsdMicros,uint64 premiumSubdomainAnnualUsdMicros,uint64 migrationUsdMicros,uint16 threeYearDiscountBps,uint16 fiveYearDiscountBps,uint16 tenYearDiscountBps,uint16 xdcQuoteBufferBps,address quoteSigner,address usdcToken,address treasury,bool xdcPaymentsEnabled,bool usdcPaymentsEnabled))",
]);

export async function POST(request: Request) {
  try {
    enforceRateLimit(request);
    const input = normalizeSubdomainQuoteRequest(await readBody(request));
    const registrar = requiredAddress(
      "XNS_SUBDOMAIN_REGISTRAR",
      process.env.XNS_SUBDOMAIN_REGISTRAR,
    );
    const pricingPolicy = requiredAddress(
      "XNS_PRICING_POLICY",
      process.env.XNS_PRICING_POLICY,
    );
    const account = quoteSignerAccount();
    const client = quoteClient();
    const expectedChainId = boundedInteger(
      process.env.XNS_QUOTE_CHAIN_ID,
      50,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    const chainId = await client.getChainId();
    if (chainId !== expectedChainId) {
      throw unavailable("Quote RPC is connected to the wrong network");
    }

    const [registrarPolicy, registry, policyVersion, config, nonce] =
      await Promise.all([
        client.readContract({
          address: registrar,
          abi: subdomainRegistrarAbi,
          functionName: "pricingPolicy",
        }),
        client.readContract({
          address: registrar,
          abi: subdomainRegistrarAbi,
          functionName: "registry",
        }),
        client.readContract({
          address: pricingPolicy,
          abi: policyAbi,
          functionName: "version",
        }),
        client.readContract({
          address: pricingPolicy,
          abi: policyAbi,
          functionName: "config",
        }),
        client.readContract({
          address: registrar,
          abi: subdomainRegistrarAbi,
          functionName: "nonces",
          args: [input.payer],
        }),
      ]);

    if (getAddress(registrarPolicy) !== pricingPolicy) {
      throw unavailable("Subdomain registrar and pricing policy do not match");
    }
    const signerAuthorized = await client.readContract({
      address: pricingPolicy,
      abi: policyAbi,
      functionName: "isQuoteAuthorizationValid",
      args: [account.address, policyVersion],
    });
    if (!signerAuthorized) {
      throw unavailable("Quote signer is not authorized by the pricing policy");
    }

    const provisional = buildSubdomainQuote({
      request: input,
      paymentToken: zeroAddress,
      paymentAmount: 1n,
      usdMicros: 1n,
      policyVersion,
      nonce,
      issuedAt: 0,
    });
    const [parentOwner, parentExpiry] = await Promise.all([
      client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "ownerOf",
        args: [provisional.parentNode],
      }),
      client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "expiryOf",
        args: [provisional.parentNode],
      }),
    ]);
    if (parentOwner === zeroAddress) {
      throw new ApiServiceError(
        "PARENT_UNAVAILABLE",
        "The parent XDCID is not active",
        409,
      );
    }
    const payerIsParentOwner = getAddress(parentOwner) === input.payer;
    let payerIsOperator = false;
    if (!payerIsParentOwner) {
      payerIsOperator = await client.readContract({
        address: registrar,
        abi: subdomainRegistrarAbi,
        functionName: "parentOperators",
        args: [provisional.parentNode, getAddress(parentOwner), input.payer],
      });
    }

    const now = BigInt(Math.floor(Date.now() / 1_000));
    if (input.action === "registration") {
      if (!payerIsParentOwner && !payerIsOperator) {
        throw new ApiServiceError(
          "NOT_PARENT_CONTROLLER",
          "Only the parent owner or an authorized operator can register this subdomain",
          403,
        );
      }
      const available = await client.readContract({
        address: registrar,
        abi: subdomainRegistrarAbi,
        functionName: "available",
        args: [input.parentName, input.label],
      });
      if (!available) {
        throw new ApiServiceError(
          "SUBDOMAIN_UNAVAILABLE",
          "The requested subdomain is unavailable",
          409,
        );
      }
      if (now + BigInt(input.termYears) * YEAR_SECONDS > parentExpiry) {
        throw new ApiServiceError(
          "TERM_EXCEEDS_PARENT",
          "The subdomain term cannot extend beyond the parent name expiry",
          409,
        );
      }
    } else {
      const [currentOwner, record] = await Promise.all([
        client.readContract({
          address: registrar,
          abi: subdomainRegistrarAbi,
          functionName: "ownerOf",
          args: [provisional.node],
        }),
        client.readContract({
          address: registrar,
          abi: subdomainRegistrarAbi,
          functionName: "records",
          args: [provisional.node],
        }),
      ]);
      if (
        currentOwner === zeroAddress ||
        getAddress(currentOwner) !== input.subdomainOwner
      ) {
        throw new ApiServiceError(
          "NOT_SUBDOMAIN_OWNER",
          "The selected owner does not own this active subdomain",
          403,
        );
      }
      if (
        input.payer !== input.subdomainOwner &&
        !payerIsParentOwner &&
        !payerIsOperator
      ) {
        throw new ApiServiceError(
          "NOT_SUBDOMAIN_CONTROLLER",
          "Only the subdomain owner or a parent controller can renew it",
          403,
        );
      }
      if (record[2] + BigInt(input.termYears) * YEAR_SECONDS > parentExpiry) {
        throw new ApiServiceError(
          "TERM_EXCEEDS_PARENT",
          "The renewal cannot extend beyond the parent name expiry",
          409,
        );
      }
    }

    const usdMicros = await client.readContract({
      address: pricingPolicy,
      abi: policyAbi,
      functionName: "priceUsdMicros",
      args: [2, 1n, BigInt(input.termYears)],
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

    if (input.paymentCurrency === "XDC") {
      if (!config.xdcPaymentsEnabled) {
        throw unavailable("XDC subdomain payments are paused");
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
        throw unavailable("USDC subdomain payments are paused");
      }
      paymentToken = getAddress(config.usdcToken);
      paymentAmount = usdMicros;
    }

    const issuedAt = Math.floor(Date.now() / 1_000);
    const quote = buildSubdomainQuote({
      request: input,
      paymentToken,
      paymentAmount,
      usdMicros,
      policyVersion,
      nonce,
      issuedAt,
    });
    const signature = await account.signTypedData({
      domain: {
        name: SUBDOMAIN_QUOTE_DOMAIN_NAME,
        version: SUBDOMAIN_QUOTE_DOMAIN_VERSION,
        chainId,
        verifyingContract: registrar,
      },
      types: subdomainQuoteTypes,
      primaryType: "SubdomainQuote",
      message: quote,
    });

    return apiSuccess({
      authorizedForPayment: true,
      chainId,
      registrar,
      pricingPolicy,
      action: input.action,
      parentName: input.parentName,
      label: input.label,
      fullName: input.fullName,
      paymentCurrency: input.paymentCurrency,
      quote: serializeQuote(quote),
      signature,
      market,
    });
  } catch (error) {
    return handleApiError(error, "Subdomain quote failed");
  }
}

function unavailable(message: string) {
  return new ApiServiceError("QUOTE_SIGNING_UNAVAILABLE", message, 503);
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
  const configuredKey = process.env.XNS_QUOTE_SIGNER_PRIVATE_KEY?.trim();
  const key = configuredKey && /^[0-9a-fA-F]{64}$/.test(configuredKey)
    ? `0x${configuredKey}`
    : configuredKey;
  if (!key || !isHex(key) || key.length !== 66) {
    throw unavailable("Quote signer private key is missing or malformed");
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
  if (urls.length === 0) throw unavailable("Quote RPC is not configured");
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
    throw unavailable(`${name} is not configured`);
  }
  return getAddress(value);
}

function serializeQuote(quote: ReturnType<typeof buildSubdomainQuote>) {
  return {
    node: quote.node,
    parentNode: quote.parentNode,
    payer: quote.payer,
    subdomainOwner: quote.subdomainOwner,
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
