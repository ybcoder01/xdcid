import { getAddress, isAddress, isHex, type Hex } from "viem";
import { checkAdminRateLimit, isSameOrigin } from "../../../../../lib/adminSecurity";
import { verifyAdminWalletSignature } from "../../../../../lib/adminAuth";
import {
  createPrivateVaultSession,
  hashPrivateVaultMessage,
  isPrivateVaultAuthConfigured,
  privateVaultClientBinding,
  privateVaultSessionCookie,
} from "../../../../../lib/privateVaultAuth";
import {
  consumePrivateVaultChallenge,
  getPrivateVaultChallenge,
} from "../../../../../lib/privateVaultStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Invalid request origin" }, 403);
  if (!isPrivateVaultAuthConfigured()) return json({ error: "Private address book is not configured" }, 503);
  let body: { challengeId?: unknown; address?: unknown; message?: unknown; signature?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (
    typeof body.challengeId !== "string" || !/^[a-f0-9]{32}$/.test(body.challengeId)
    || typeof body.address !== "string" || !isAddress(body.address)
    || typeof body.message !== "string" || body.message.length > 2_000
    || typeof body.signature !== "string" || !isHex(body.signature) || body.signature.length > 8_194
  ) return json({ error: "Invalid address-book verification payload" }, 400);
  try {
    const address = getAddress(body.address);
    const [clientLimit, challengeLimit] = await Promise.all([
      checkAdminRateLimit({ request, scope: "vault-verify-ip", limit: 30, windowSeconds: 300 }),
      checkAdminRateLimit({ request, scope: "vault-verify-challenge", limit: 10, windowSeconds: 300, subject: body.challengeId }),
    ]);
    if (!clientLimit.allowed || !challengeLimit.allowed) {
      return json({ error: "Too many verification attempts. Try again later." }, 429);
    }
    const challenge = await getPrivateVaultChallenge(body.challengeId);
    if (
      !challenge || challenge.usedAt || challenge.expiresAt <= new Date()
      || challenge.address !== address
      || challenge.messageHash !== hashPrivateVaultMessage(body.message)
    ) return json({ error: "Unlock challenge is invalid, expired, or already used" }, 401);
    const valid = await verifyAdminWalletSignature(body.message, body.signature as Hex, address);
    if (!valid) return json({ error: "Wallet signature is invalid" }, 401);
    if (!(await consumePrivateVaultChallenge(body.challengeId))) {
      return json({ error: "Unlock challenge was already used" }, 401);
    }
    const session = createPrivateVaultSession(address, privateVaultClientBinding(request));
    return json(
      { authenticated: true, address, expiresAt: session.expiresAt },
      200,
      { "set-cookie": privateVaultSessionCookie(session.token) },
    );
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
