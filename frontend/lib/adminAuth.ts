import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  getAddress,
  hashMessage,
  isAddress,
  recoverMessageAddress,
  type Address,
  type Hex,
} from "viem";
import { addresses, registrarAbi } from "../config/contracts";
import {
  ERC1271_MAGIC_VALUE,
  erc1271Abi,
} from "./accountSignatures";
import { xdcClient } from "./xdcClient";

export const ADMIN_SESSION_COOKIE = "xdcid_admin_session";
export const ADMIN_CHALLENGE_TTL_MS = 5 * 60 * 1_000;
export const ADMIN_SESSION_TTL_SECONDS = 15 * 60;

type AdminSessionPayload = {
  v: 1;
  address: Address;
  issuedAt: number;
  expiresAt: number;
  sessionId: string;
};

function sessionSecret(): string {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("Admin authentication is not configured");
  }
  return value;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signSegment(segment: string): string {
  return createHmac("sha256", sessionSecret()).update(segment).digest("base64url");
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

export function hashAdminMessage(message: string): string {
  return createHash("sha256").update(message, "utf8").digest("hex");
}

export function buildAdminChallenge(
  origin: string,
  address: Address,
  nonce: string,
  issuedAt: Date,
  expiresAt: Date,
): string {
  return [
    "Sign in to XDCID Admin",
    "",
    `Address: ${address}`,
    "Chain ID: 50",
    `URI: ${origin}/admin`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${expiresAt.toISOString()}`,
    "",
    "This request will not trigger a blockchain transaction or cost gas.",
  ].join("\n");
}

export function createAdminSession(address: Address): {
  token: string;
  expiresAt: string;
} {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const payload: AdminSessionPayload = {
    v: 1,
    address: getAddress(address),
    issuedAt,
    expiresAt: issuedAt + ADMIN_SESSION_TTL_SECONDS,
    sessionId: randomBytes(16).toString("hex"),
  };
  const segment = encode(JSON.stringify(payload));
  return {
    token: `${segment}.${signSegment(segment)}`,
    expiresAt: new Date(payload.expiresAt * 1_000).toISOString(),
  };
}

export function adminSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return [
    `${ADMIN_SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    `Max-Age=${ADMIN_SESSION_TTL_SECONDS}`,
    secure.slice(2),
  ].filter(Boolean).join("; ");
}

export function clearAdminSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return [
    `${ADMIN_SESSION_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    "Max-Age=0",
    secure.slice(2),
  ].filter(Boolean).join("; ");
}

export function parseAdminSession(token: string | undefined): AdminSessionPayload | null {
  if (!token) return null;
  const [segment, signature, extra] = token.split(".");
  if (!segment || !signature || extra) return null;

  try {
    const expected = Buffer.from(signSegment(segment), "utf8");
    const supplied = Buffer.from(signature, "utf8");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(segment, "base64url").toString("utf8"),
    ) as AdminSessionPayload;
    if (
      payload.v !== 1 ||
      !isAddress(payload.address) ||
      !Number.isSafeInteger(payload.issuedAt) ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= Math.floor(Date.now() / 1_000) ||
      typeof payload.sessionId !== "string" ||
      payload.sessionId.length !== 32
    ) {
      return null;
    }
    return { ...payload, address: getAddress(payload.address) };
  } catch {
    return null;
  }
}

export async function currentRegistrarOwner(): Promise<Address> {
  return getAddress(
    await xdcClient.readContract({
      address: addresses.registrar,
      abi: registrarAbi,
      functionName: "owner",
    }),
  );
}

export async function verifyAdminWalletSignature(
  message: string,
  signature: Hex,
  expectedSigner: Address,
): Promise<boolean> {
  const signer = getAddress(expectedSigner);
  const bytecode = await xdcClient.getBytecode({ address: signer });

  if (!bytecode || bytecode === "0x") {
    const recovered = await recoverMessageAddress({ message, signature });
    return getAddress(recovered) === signer;
  }

  const result = await xdcClient.readContract({
    address: signer,
    abi: erc1271Abi,
    functionName: "isValidSignature",
    args: [hashMessage(message), signature],
  });
  return result.toLowerCase() === ERC1271_MAGIC_VALUE;
}

export function isSameOrigin(request: Request): boolean {
  const suppliedOrigin = request.headers.get("origin");
  return !suppliedOrigin || suppliedOrigin === new URL(request.url).origin;
}

export async function requireAdminSession(
  request: Request,
): Promise<AdminSessionPayload | null> {
  const session = parseAdminSession(cookieValue(request, ADMIN_SESSION_COOKIE));
  if (!session) return null;

  try {
    const owner = await currentRegistrarOwner();
    return owner === session.address ? session : null;
  } catch {
    return null;
  }
}
