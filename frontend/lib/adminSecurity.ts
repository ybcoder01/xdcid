import { createHmac, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { ensureAdminAuthSchema } from "./adminAuthStore";

export type AdminRateLimitScope =
  | "eligibility"
  | "challenge-ip"
  | "challenge-wallet"
  | "verify-ip"
  | "verify-challenge";

type AdminSecurityOutcome =
  | "allowed"
  | "denied"
  | "failed"
  | "rate-limited"
  | "succeeded";

export type AdminRateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export function isSameOrigin(request: Request): boolean {
  const suppliedOrigin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!suppliedOrigin || (fetchSite && fetchSite !== "same-origin")) return false;
  try {
    return new URL(suppliedOrigin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function securitySecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Admin security is not configured");
  }
  return secret;
}

function fingerprint(value: string): string {
  return createHmac("sha256", securitySecret())
    .update(value, "utf8")
    .digest("hex");
}

export function adminClientBinding(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const address =
    request.headers.get("x-vercel-forwarded-for")?.trim() ||
    forwarded ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) || "unknown";
  return fingerprint(`admin-client:${address}:${userAgent}`);
}

export async function checkAdminRateLimit(input: {
  request: Request;
  scope: AdminRateLimitScope;
  limit: number;
  windowSeconds: number;
  subject?: string;
}): Promise<AdminRateLimitDecision> {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
    throw new Error("A positive admin rate limit is required");
  }
  if (!Number.isSafeInteger(input.windowSeconds) || input.windowSeconds < 1) {
    throw new Error("A positive admin rate-limit window is required");
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Admin security storage is not configured");
  await ensureAdminAuthSchema();
  const client = neon(connectionString);
  const clientHash = adminClientBinding(input.request);
  const identifierHash = input.subject
    ? fingerprint(`${input.scope}:${clientHash}:${input.subject.toLowerCase()}`)
    : fingerprint(`${input.scope}:${clientHash}`);
  const rows = await client`
    INSERT INTO admin_auth_rate_limits (
      scope, identifier_hash, window_started_at, hit_count, updated_at
    ) VALUES (
      ${input.scope}, ${identifierHash}, now(), 1, now()
    )
    ON CONFLICT (scope, identifier_hash) DO UPDATE SET
      window_started_at = CASE
        WHEN admin_auth_rate_limits.window_started_at <= now() - (${input.windowSeconds} * interval '1 second')
          THEN now()
        ELSE admin_auth_rate_limits.window_started_at
      END,
      hit_count = CASE
        WHEN admin_auth_rate_limits.window_started_at <= now() - (${input.windowSeconds} * interval '1 second')
          THEN 1
        ELSE admin_auth_rate_limits.hit_count + 1
      END,
      updated_at = now()
    RETURNING hit_count, window_started_at
  `;
  const hitCount = Number(rows[0]?.hit_count || 0);
  const windowStartedAt = new Date(String(rows[0]?.window_started_at));
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(
      (windowStartedAt.getTime() + input.windowSeconds * 1_000 - Date.now()) /
        1_000,
    ),
  );
  return {
    allowed: hitCount <= input.limit,
    limit: input.limit,
    remaining: Math.max(0, input.limit - hitCount),
    retryAfterSeconds,
  };
}

export function adminRateLimitResponse(
  decision: AdminRateLimitDecision,
): Response {
  return Response.json(
    { error: "Too many administrator authentication attempts. Try again later." },
    {
      status: 429,
      headers: {
        "cache-control": "no-store",
        "retry-after": String(decision.retryAfterSeconds),
        "x-content-type-options": "nosniff",
        "x-ratelimit-limit": String(decision.limit),
        "x-ratelimit-remaining": String(decision.remaining),
      },
    },
  );
}

export async function recordAdminSecurityEvent(input: {
  request: Request;
  eventType: string;
  outcome: AdminSecurityOutcome;
  address?: string;
}): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;
  try {
    await ensureAdminAuthSchema();
    const client = neon(connectionString);
    const addressHash = input.address
      ? fingerprint(`admin-address:${input.address.toLowerCase()}`)
      : null;
    const clientHash = adminClientBinding(input.request);
    await client`
      INSERT INTO admin_security_events (
        id, event_type, outcome, address_fingerprint, client_fingerprint
      ) VALUES (
        ${randomBytes(16).toString("hex")},
        ${input.eventType.slice(0, 48)},
        ${input.outcome},
        ${addressHash},
        ${clientHash}
      )
    `;
  } catch {
    // Authentication must not fail merely because security-event recording failed.
  }
}
