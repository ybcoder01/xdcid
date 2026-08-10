import { randomBytes } from "node:crypto";
import { lt } from "drizzle-orm";
import { getAddress, isAddress } from "viem";
import {
  ADMIN_CHALLENGE_TTL_MS,
  buildAdminChallenge,
  currentRegistrarOwner,
  hashAdminMessage,
  isSameOrigin,
} from "../../../../../lib/adminAuth";
import { getDatabase, isDatabaseConfigured } from "../../../../../lib/db/client";
import { adminAuthChallenges } from "../../../../../lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  if (
    !isDatabaseConfigured() ||
    !process.env.ADMIN_SESSION_SECRET ||
    Buffer.byteLength(process.env.ADMIN_SESSION_SECRET, "utf8") < 32
  ) {
    return Response.json(
      { error: "Admin authentication is not configured" },
      { status: 503 },
    );
  }

  let body: { address?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.address !== "string" || !isAddress(body.address)) {
    return Response.json({ error: "A valid wallet address is required" }, { status: 400 });
  }

  try {
    const address = getAddress(body.address);
    const owner = await currentRegistrarOwner();
    if (address !== owner) {
      return Response.json({ error: "Wallet is not the registrar owner" }, { status: 403 });
    }

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ADMIN_CHALLENGE_TTL_MS);
    const id = randomBytes(16).toString("hex");
    const nonce = randomBytes(24).toString("hex");
    const origin = new URL(request.url).origin;
    const message = buildAdminChallenge(origin, address, nonce, issuedAt, expiresAt);
    const database = getDatabase();

    await database.delete(adminAuthChallenges).where(
      lt(adminAuthChallenges.expiresAt, issuedAt),
    );
    await database.insert(adminAuthChallenges).values({
      id,
      address,
      messageHash: hashAdminMessage(message),
      expiresAt,
    });

    return Response.json(
      { challengeId: id, message, expiresAt: expiresAt.toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Unable to create an admin login challenge" },
      { status: 503 },
    );
  }
}
