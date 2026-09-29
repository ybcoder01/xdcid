import { randomBytes } from "node:crypto";
import { getAddress, isAddress } from "viem";
import { checkAdminRateLimit, isSameOrigin } from "../../../../../lib/adminSecurity";
import {
  buildPrivateVaultChallenge,
  hashPrivateVaultMessage,
  isPrivateVaultAuthConfigured,
  PRIVATE_VAULT_CHALLENGE_TTL_MS,
} from "../../../../../lib/privateVaultAuth";
import { createPrivateVaultChallengeRecord } from "../../../../../lib/privateVaultStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Invalid request origin" }, 403);
  if (!isPrivateVaultAuthConfigured()) return json({ error: "Private address book is not configured" }, 503);
  let body: { address?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (typeof body.address !== "string" || !isAddress(body.address)) {
    return json({ error: "A valid connected wallet is required" }, 400);
  }
  try {
    const address = getAddress(body.address);
    const [clientLimit, walletLimit] = await Promise.all([
      checkAdminRateLimit({ request, scope: "vault-challenge-ip", limit: 15, windowSeconds: 300 }),
      checkAdminRateLimit({ request, scope: "vault-challenge-wallet", limit: 6, windowSeconds: 300, subject: address }),
    ]);
    if (!clientLimit.allowed || !walletLimit.allowed) {
      return json({ error: "Too many address-book unlock attempts. Try again later." }, 429, {
        "retry-after": String(Math.max(clientLimit.retryAfterSeconds, walletLimit.retryAfterSeconds)),
      });
    }
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + PRIVATE_VAULT_CHALLENGE_TTL_MS);
    const challengeId = randomBytes(16).toString("hex");
    const message = buildPrivateVaultChallenge({
      origin: new URL(request.url).origin,
      address,
      nonce: randomBytes(24).toString("hex"),
      issuedAt,
      expiresAt,
    });
    await createPrivateVaultChallengeRecord({
      id: challengeId,
      address,
      messageHash: hashPrivateVaultMessage(message),
      expiresAt,
    });
    return json({ challengeId, message, expiresAt: expiresAt.toISOString() });
  } catch {
    return json({ error: "Private address-book authentication is temporarily unavailable" }, 503);
  }
}

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow, noarchive", ...extraHeaders },
  });
}
