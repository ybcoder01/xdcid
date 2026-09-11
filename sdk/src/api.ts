import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";

export const XDCID_API_URL = "https://xdcid.xyz";

export type ApiVersion = "v1";
export type RegistrationTerm = 1 | 3 | 5 | 10;
export type PaymentCurrency = "XDC" | "USDC";
export type RegistrarProduct = "registration" | "renewal";
export type SubdomainAction = "registration" | "renewal";

export type ApiEnvelope<T> = { version: ApiVersion; data: T };
export type ApiErrorEnvelope = {
  version?: string;
  error?: { code?: string; message?: string };
};

export type NameData = {
  name: string;
  label: string;
  node: Hex;
  network: { chainId: number; name: string };
  available: boolean;
  registered: boolean;
  owner: Address | null;
  resolvedAddress: Address | null;
  registry?: {
    state: string;
    registrationAllowed: boolean;
    xdcid: { contract: Address; registered: boolean; owner: Address | null };
    legacy: {
      contract: Address;
      tokenId: string | null;
      registered: boolean;
      owner: Address | null;
    };
  };
  expiry: { timestamp: string | null; iso: string | null };
  pricing: {
    currency: "XDC";
    years: number;
    perYear: { wei: string; xdc: string };
    total: { wei: string; xdc: string };
  } | null;
  profile: Record<"avatar" | "website" | "twitter" | "telegram" | "bio", string | null>;
};

export type ReverseData = {
  address: Address;
  name: string | null;
  verified: boolean;
};

export type OwnedNamesData = {
  address: Address;
  network: { chainId: number; name: string };
  primaryName: string | null;
  names: Array<{
    name: string;
    node: Hex;
    primary: boolean;
    expiry: { timestamp: string; iso: string };
  }>;
};

export type PricingProduct = RegistrarProduct | "subdomain" | "migration";
export type PricingQuoteData = {
  authorizedForPayment: false;
  warning: string;
  policyVersion: number;
  product: PricingProduct;
  name: string | null;
  years: RegistrationTerm | null;
  pricing: {
    currency: "USD";
    annualMicros: string | null;
    grossMicros: string;
    discountBps: string;
    totalMicros: string;
  };
  xdc: {
    wei: string;
    xdc: string;
    bufferBps: string;
    marketPriceUsdMicros: string;
    provider: string;
    coinId: string;
    observedAt: string;
    fetchedAt: string;
  };
};

export type SerializedRegistrarQuote = {
  node: Hex;
  payer: Address;
  nameOwner: Address;
  product: 0 | 1;
  termYears: string;
  paymentToken: Address;
  paymentAmount: string;
  usdMicros: string;
  policyVersion: string;
  nonce: string;
  issuedAt: string;
  deadline: string;
};

export type SerializedDiscountAuthorization = {
  node: Hex;
  beneficiary: Address;
  product: number;
  termYears: string;
  discountBps: number;
  maxUses: number;
  validAfter: string;
  deadline: string;
  nonce: string;
};

export type RegistrarQuoteData = {
  authorizedForPayment: true;
  chainId: number;
  registrar: Address;
  policy: Address;
  product: RegistrarProduct;
  name: string;
  paymentCurrency: PaymentCurrency;
  quote: SerializedRegistrarQuote;
  signature: Hex;
  discount?: {
    authorizationContract: Address;
    authorization: SerializedDiscountAuthorization;
    signature: Hex;
  };
  market?: {
    provider: string;
    coinId: string;
    priceUsdMicros: string;
    observedAt: string;
    fetchedAt: string;
  };
};

export type SerializedSubdomainQuote = {
  node: Hex;
  parentNode: Hex;
  payer: Address;
  subdomainOwner: Address;
  termYears: string;
  paymentToken: Address;
  paymentAmount: string;
  usdMicros: string;
  policyVersion: string;
  nonce: string;
  issuedAt: string;
  deadline: string;
};

export type SubdomainQuoteData = {
  authorizedForPayment: true;
  chainId: number;
  registrar: Address;
  pricingPolicy: Address;
  action: SubdomainAction;
  parentName: string;
  label: string;
  fullName: string;
  paymentCurrency: PaymentCurrency;
  quote: SerializedSubdomainQuote;
  signature: Hex;
  market?: RegistrarQuoteData["market"];
};

export type CreateRegistrarQuoteInput = {
  name: string;
  product: RegistrarProduct;
  termYears: RegistrationTerm;
  paymentCurrency: PaymentCurrency;
  payer: string;
  nameOwner: string;
};

export type CreateSubdomainQuoteInput = {
  parentName: string;
  label: string;
  action: SubdomainAction;
  termYears: RegistrationTerm;
  paymentCurrency: PaymentCurrency;
  payer: string;
  subdomainOwner: string;
};

export type PayLinkRecord = {
  id: string;
  name: string;
  status: "active";
  request: Hex;
  signature: Hex;
  expiresAt: string;
};

export type CreatedPayLink = {
  id: string;
  path: string;
  expiresAt: string;
  revocationToken: string;
};

export type PayLinkStatus = {
  requestId: Hex;
  cancelled: boolean;
  paid: boolean;
  status: "active" | "cancelled" | "paid";
};

export type XdcidApiClientOptions = {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
};

export class XdcidApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "XdcidApiError";
    this.status = status;
    this.code = code;
  }
}

export function createXdcidApiClient(options: XdcidApiClientOptions = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || XDCID_API_URL);
  const fetcher = options.fetch || globalThis.fetch;
  if (typeof fetcher !== "function") {
    throw new XdcidApiError(0, "INVALID_CONFIG", "A Fetch API implementation is required");
  }

  async function request<T>(path: string, init?: RequestInit, enveloped = true): Promise<T> {
    let response: Response;
    try {
      const headers = new Headers(init?.headers);
      if (!headers.has("Accept")) headers.set("Accept", "application/json");
      if (init?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      response = await fetcher(new URL(path, baseUrl), {
        ...init,
        headers
      });
    } catch (cause) {
      throw new XdcidApiError(0, "NETWORK_ERROR", "Unable to reach the XDCID API", { cause });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new XdcidApiError(response.status, "INVALID_RESPONSE", "XDCID returned invalid JSON", { cause });
    }

    if (!response.ok) {
      const error = isRecord(payload) && isRecord(payload.error)
        ? payload.error
        : payload;
      const message = isRecord(error) && typeof error.message === "string"
        ? error.message
        : isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `XDCID request failed with status ${response.status}`;
      const code = isRecord(error) && typeof error.code === "string"
        ? error.code
        : `HTTP_${response.status}`;
      throw new XdcidApiError(response.status, code, message);
    }

    if (!enveloped) return payload as T;
    if (!isRecord(payload) || payload.version !== "v1" || !("data" in payload)) {
      throw new XdcidApiError(response.status, "INVALID_RESPONSE", "XDCID returned an invalid API envelope");
    }
    return payload.data as T;
  }

  return {
    getName(name: string, years = 1) {
      assertInteger(years, 1, 100, "years");
      return request<NameData>(`/api/v1/names/${encodeURIComponent(name)}?years=${years}`);
    },
    reverseResolve(address: string) {
      return request<ReverseData>(`/api/v1/reverse/${encodeURIComponent(assertAddress(address, "address"))}`);
    },
    getOwnedNames(address: string, knownNames: readonly string[] = []) {
      const params = new URLSearchParams();
      for (const name of knownNames) params.append("known", name);
      const query = params.size ? `?${params}` : "";
      return request<OwnedNamesData>(
        `/api/v1/addresses/${encodeURIComponent(assertAddress(address, "address"))}/names${query}`
      );
    },
    getPricingQuote(input: {
      product: PricingProduct;
      name?: string;
      years?: RegistrationTerm;
    }) {
      const params = new URLSearchParams({ product: input.product });
      if (input.name) params.set("name", input.name);
      if (input.years) params.set("years", String(input.years));
      return request<PricingQuoteData>(`/api/v1/pricing/quote?${params}`);
    },
    createRegistrarQuote(input: CreateRegistrarQuoteInput) {
      return request<RegistrarQuoteData>("/api/v1/registrar/quote", {
        method: "POST",
        body: JSON.stringify({
          ...input,
          payer: assertAddress(input.payer, "payer"),
          nameOwner: assertAddress(input.nameOwner, "nameOwner")
        })
      });
    },
    createSubdomainQuote(input: CreateSubdomainQuoteInput) {
      return request<SubdomainQuoteData>("/api/v1/subdomain/quote", {
        method: "POST",
        body: JSON.stringify({
          ...input,
          payer: assertAddress(input.payer, "payer"),
          subdomainOwner: assertAddress(input.subdomainOwner, "subdomainOwner")
        })
      });
    },
    createPayLink(input: { request: Hex; signature: Hex }) {
      assertHex(input.request, "request");
      assertHex(input.signature, "signature");
      return request<CreatedPayLink>("/api/pay-links", {
        method: "POST",
        body: JSON.stringify(input)
      }, false);
    },
    getPayLink(id: string) {
      return request<PayLinkRecord>(`/api/pay-links/${encodeURIComponent(id)}`, undefined, false);
    },
    getPayLinkStatus(requestId: Hex) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(requestId)) {
        throw new XdcidApiError(0, "INVALID_REQUEST_ID", "requestId must be a 32-byte hex value");
      }
      return request<PayLinkStatus>(
        `/api/pay-links/cancellations/${encodeURIComponent(requestId)}`,
        undefined,
        false
      );
    },
    revokePayLink(id: string, revocationToken: string) {
      if (!revocationToken.trim()) {
        throw new XdcidApiError(0, "INVALID_REVOCATION_TOKEN", "A revocation token is required");
      }
      return request<{ status: "revoked" }>(`/api/pay-links/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${revocationToken}` }
      }, false);
    }
  };
}

export type XdcidApiClient = ReturnType<typeof createXdcidApiClient>;

function normalizeBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new XdcidApiError(0, "INVALID_CONFIG", "baseUrl must be an absolute HTTP or HTTPS URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new XdcidApiError(0, "INVALID_CONFIG", "baseUrl must use HTTP or HTTPS");
  }
  return new URL(url.pathname.endsWith("/") ? url : `${url.toString()}/`);
}

function assertAddress(value: string, field: string): Address {
  if (!isAddress(value)) {
    throw new XdcidApiError(0, "INVALID_ADDRESS", `${field} must be a valid EVM address`);
  }
  return getAddress(value);
}

function assertHex(value: string, field: string): asserts value is Hex {
  if (!isHex(value)) {
    throw new XdcidApiError(0, "INVALID_HEX", `${field} must be a hex value`);
  }
}

function assertInteger(value: number, minimum: number, maximum: number, field: string) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new XdcidApiError(0, "INVALID_NUMBER", `${field} must be an integer from ${minimum} through ${maximum}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
