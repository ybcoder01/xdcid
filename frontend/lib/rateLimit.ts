export type ApiRateLimit = {
  enforced: boolean;
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
};

type UpstashResponse = {
  result?: unknown;
  error?: string;
};

const RATE_LIMIT_SCRIPT =
  'local count = redis.call("INCR", KEYS[1]); if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]); end; local ttl = redis.call("TTL", KEYS[1]); return {count, ttl};';

function boundedInteger(
  value: string | undefined,
  fallbackValue: number,
  minimum: number,
  maximum: number
): number {
  if (!value?.trim()) return fallbackValue;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallbackValue;
}

const requestLimit = boundedInteger(
  process.env.API_RATE_LIMIT_MAX_REQUESTS,
  60,
  1,
  10_000
);
const windowSeconds = boundedInteger(
  process.env.API_RATE_LIMIT_WINDOW_SECONDS,
  60,
  1,
  3_600
);
const redisTimeoutMs = boundedInteger(
  process.env.API_RATE_LIMIT_REDIS_TIMEOUT_MS,
  2_000,
  500,
  5_000
);

function redisRestUrl(): string | null {
  const value = process.env.UPSTASH_REDIS_REST_URL?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function clientAddress(request: Request): string {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";

  return forwarded.split(",")[0]?.trim() || "unknown";
}

async function hashedIdentity(request: Request, salt: string): Promise<string> {
  const source = new TextEncoder().encode(salt + ":" + clientAddress(request));
  const digest = await crypto.subtle.digest("SHA-256", source);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function unenforcedResult(): ApiRateLimit {
  const now = Math.ceil(Date.now() / 1_000);
  return {
    enforced: false,
    allowed: true,
    limit: requestLimit,
    remaining: requestLimit,
    resetAt: now + windowSeconds,
    retryAfter: windowSeconds
  };
}

async function incrementCounter(
  url: string,
  token: string,
  key: string
): Promise<{ count: number; ttl: number }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      "EVAL",
      RATE_LIMIT_SCRIPT,
      "1",
      key,
      String(windowSeconds)
    ]),
    cache: "no-store",
    signal: AbortSignal.timeout(redisTimeoutMs)
  });

  if (!response.ok) throw new Error("Redis rate-limit request failed");

  const payload = (await response.json()) as UpstashResponse;
  if (payload.error || !Array.isArray(payload.result)) {
    throw new Error("Redis rate-limit response was invalid");
  }

  const count = Number(payload.result[0]);
  const ttl = Number(payload.result[1]);
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(ttl)) {
    throw new Error("Redis rate-limit values were invalid");
  }

  return { count, ttl: ttl > 0 ? ttl : windowSeconds };
}

export async function checkApiRateLimit(request: Request): Promise<ApiRateLimit> {
  const url = redisRestUrl();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const salt = process.env.API_RATE_LIMIT_HASH_SALT?.trim();

  if (!url || !token || !salt) return unenforcedResult();

  try {
    const identity = await hashedIdentity(request, salt);
    const { count, ttl } = await incrementCounter(
      url,
      token,
      "xdcid:api:v1:rate:" + identity
    );
    const now = Math.ceil(Date.now() / 1_000);

    return {
      enforced: true,
      allowed: count <= requestLimit,
      limit: requestLimit,
      remaining: Math.max(0, requestLimit - count),
      resetAt: now + ttl,
      retryAfter: ttl
    };
  } catch {
    console.error("API rate limiter unavailable; request allowed");
    return unenforcedResult();
  }
}

export function rateLimitHeaders(result: ApiRateLimit): HeadersInit {
  if (!result.enforced) return {};

  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
    ...(result.allowed ? {} : { "Retry-After": String(result.retryAfter) })
  };
}
