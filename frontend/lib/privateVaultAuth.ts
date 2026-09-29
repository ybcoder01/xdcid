import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, isAddress, type Address } from "viem";

export const PRIVATE_VAULT_SESSION_COOKIE = process.env.NODE_ENV === "production"
  ? "__Host-xdcid_private_vault"
  : "xdcid_private_vault";
export const PRIVATE_VAULT_CHALLENGE_TTL_MS = 5 * 60 * 1_000;
export const PRIVATE_VAULT_SESSION_TTL_SECONDS = 30 * 60;

type PrivateVaultSession = {
  v: 1;
  address: Address;
  binding: string;
  issuedAt: number;
  expiresAt: number;
  sessionId: string;
};

function secret(): string {
  const value = process.env.PRIVATE_VAULT_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("Private vault authentication is not configured");
  }
  return value;
}

export function isPrivateVaultAuthConfigured(): boolean {
  try {
    secret();
    return Boolean(process.env.DATABASE_URL);
  } catch {
    return false;
  }
}

export function privateVaultClientBinding(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("x-vercel-forwarded-for")?.trim()
    || forwarded
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) || "unknown";
  return createHmac("sha256", secret())
    .update("xdcid:private-vault-client:v1\0")
    .update(ip)
    .update("\0")
    .update(userAgent)
    .digest("hex");
}

export function buildPrivateVaultChallenge(input: {
  origin: string;
  address: Address;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}): string {
  return [
    "Unlock your private XDCID address book",
    "",
    `Address: ${getAddress(input.address)}`,
    "Chain ID: 50",
    `URI: ${input.origin}/address-book`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expiration Time: ${input.expiresAt.toISOString()}`,
    "",
    "This signature is gasless, moves no funds, and creates a 30-minute private-vault session.",
  ].join("\n");
}

export function hashPrivateVaultMessage(message: string): string {
  return createHash("sha256").update(message, "utf8").digest("hex");
}

export function createPrivateVaultSession(address: Address, binding: string) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const payload: PrivateVaultSession = {
    v: 1,
    address: getAddress(address),
    binding,
    issuedAt,
    expiresAt: issuedAt + PRIVATE_VAULT_SESSION_TTL_SECONDS,
    sessionId: randomBytes(16).toString("hex"),
  };
  const segment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(segment);
  return {
    token: `${segment}.${signature}`,
    expiresAt: new Date(payload.expiresAt * 1_000).toISOString(),
  };
}

export function privateVaultSessionCookie(token: string): string {
  return cookie(`${PRIVATE_VAULT_SESSION_COOKIE}=${token}`, PRIVATE_VAULT_SESSION_TTL_SECONDS);
}

export function clearPrivateVaultSessionCookie(): string {
  return cookie(`${PRIVATE_VAULT_SESSION_COOKIE}=`, 0);
}

export function requirePrivateVaultSession(request: Request): PrivateVaultSession | null {
  const token = readCookie(request, PRIVATE_VAULT_SESSION_COOKIE);
  if (!token) return null;
  const [segment, supplied, extra] = token.split(".");
  if (!segment || !supplied || extra) return null;
  try {
    const expectedBytes = Uint8Array.from(Buffer.from(sign(segment), "utf8"));
    const suppliedBytes = Uint8Array.from(Buffer.from(supplied, "utf8"));
    if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return null;
    const payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as PrivateVaultSession;
    if (
      payload.v !== 1
      || !isAddress(payload.address)
      || payload.binding !== privateVaultClientBinding(request)
      || !Number.isSafeInteger(payload.issuedAt)
      || !Number.isSafeInteger(payload.expiresAt)
      || payload.expiresAt <= Math.floor(Date.now() / 1_000)
      || typeof payload.sessionId !== "string"
      || payload.sessionId.length !== 32
    ) return null;
    return { ...payload, address: getAddress(payload.address) };
  } catch {
    return null;
  }
}

function sign(segment: string): string {
  return createHmac("sha256", secret())
    .update("xdcid:private-vault-session:v1\0")
    .update(segment)
    .digest("base64url");
}

function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

function cookie(value: string, maxAge: number): string {
  return [
    value,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    "Priority=High",
    `Max-Age=${maxAge}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ].filter(Boolean).join("; ");
}
