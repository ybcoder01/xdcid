import { ApiServiceError } from "./apiResponse";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price" +
  "?ids=xdce-crowd-sale&vs_currencies=usd&include_last_updated_at=true";
const DEFAULT_CACHE_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 3_500;
const MAX_PRICE_AGE_SECONDS = 5 * 60;

type CachedPrice = {
  priceUsdMicros: bigint;
  observedAt: number;
  fetchedAt: number;
};

let cachedPrice: CachedPrice | undefined;
let pendingPrice: Promise<CachedPrice> | undefined;

export type CoinGeckoXdcPrice = {
  provider: "coingecko";
  coinId: "xdce-crowd-sale";
  priceUsdMicros: bigint;
  observedAt: string;
  fetchedAt: string;
};

export async function getCoinGeckoXdcPrice(): Promise<CoinGeckoXdcPrice> {
  const now = Date.now();
  if (cachedPrice && now - cachedPrice.fetchedAt < cacheDurationMs()) {
    return serialize(cachedPrice);
  }

  if (!pendingPrice) {
    pendingPrice = fetchPrice().finally(() => {
      pendingPrice = undefined;
    });
  }

  cachedPrice = await pendingPrice;
  return serialize(cachedPrice);
}

async function fetchPrice(): Promise<CachedPrice> {
  const apiKey = process.env.COINGECKO_DEMO_API_KEY?.trim();
  if (!apiKey) {
    throw new ApiServiceError(
      "PRICE_QUOTE_UNAVAILABLE",
      "XDC price quotes are not configured",
      503,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const response = await fetch(COINGECKO_URL, {
      headers: {
        accept: "application/json",
        "x-cg-demo-api-key": apiKey,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`CoinGecko returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      "xdce-crowd-sale"?: {
        usd?: number;
        last_updated_at?: number;
      };
    };
    const quote = body["xdce-crowd-sale"];
    const price = quote?.usd;
    const observedAt = quote?.last_updated_at;

    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price <= 0 ||
      typeof observedAt !== "number" ||
      !Number.isSafeInteger(observedAt)
    ) {
      throw new Error("CoinGecko returned an invalid XDC quote");
    }

    const nowSeconds = Math.floor(Date.now() / 1_000);
    if (
      observedAt > nowSeconds + 30 ||
      nowSeconds - observedAt > MAX_PRICE_AGE_SECONDS
    ) {
      throw new Error("CoinGecko returned a stale XDC quote");
    }

    const priceUsdMicros = BigInt(Math.round(price * 1_000_000));
    if (priceUsdMicros <= 0n) {
      throw new Error("CoinGecko XDC quote is below supported precision");
    }

    return {
      priceUsdMicros,
      observedAt: observedAt * 1_000,
      fetchedAt: Date.now(),
    };
  } catch (cause) {
    console.error("CoinGecko XDC quote failed", cause);
    throw new ApiServiceError(
      "PRICE_QUOTE_UNAVAILABLE",
      "Unable to quote XDC pricing",
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function serialize(price: CachedPrice): CoinGeckoXdcPrice {
  return {
    provider: "coingecko",
    coinId: "xdce-crowd-sale",
    priceUsdMicros: price.priceUsdMicros,
    observedAt: new Date(price.observedAt).toISOString(),
    fetchedAt: new Date(price.fetchedAt).toISOString(),
  };
}

function cacheDurationMs(): number {
  return boundedEnvironmentNumber(
    "COINGECKO_PRICE_CACHE_MS",
    DEFAULT_CACHE_MS,
    15_000,
    300_000,
  );
}

function timeoutMs(): number {
  return boundedEnvironmentNumber(
    "COINGECKO_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
    1_000,
    10_000,
  );
}

function boundedEnvironmentNumber(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}
