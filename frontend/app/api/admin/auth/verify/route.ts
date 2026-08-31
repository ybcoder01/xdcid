import { and, eq, gt, isNull } from "drizzle-orm";
import { getAddress, isAddress, isHex, type Hex } from "viem";
import {
  adminSessionCookie,
  createAdminSession,
  isAuthorizedAdmin,
  hashAdminMessage,
  isSameOrigin,
  verifyAdminWalletSignature,
} from "../../../../../lib/adminAuth";
import { getDatabase, isDatabaseConfigured } from "../../../../../lib/db/client";
import { adminAuthChallenges } from "../../../../../lib/db/schema";
import { ensureAdminAuthSchema } from "../../../../../lib/adminAuthStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "Admin authentication is not configured" },
      { status: 503 },
    );
  }

  let body: {
    challengeId?: unknown;
    address?: unknown;
    message?: unknown;
    signature?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body.challengeId !== "string" ||
    !/^[a-f0-9]{32}$/.test(body.challengeId) ||
    typeof body.address !== "string" ||
    !isAddress(body.address) ||
    typeof body.message !== "string" ||
    body.message.length > 2_000 ||
    typeof body.signature !== "string" ||
    body.signature.length > 8_194 ||
    !isHex(body.signature)
  ) {
    return Response.json({ error: "Invalid login verification payload" }, { status: 400 });
  }

  try {
    const now = new Date();
    const address = getAddress(body.address);
    await ensureAdminAuthSchema();
    const database = getDatabase();
    const [challenge] = await database
      .select()
      .from(adminAuthChallenges)
      .where(eq(adminAuthChallenges.id, body.challengeId))
      .limit(1);

    if (
      !challenge ||
      challenge.usedAt ||
      challenge.expiresAt <= now ||
      getAddress(challenge.address) !== address ||
      challenge.messageHash !== hashAdminMessage(body.message)
    ) {
      return Response.json(
        { error: "Login challenge is invalid, expired, or already used" },
        { status: 401 },
      );
    }

    if (!(await isAuthorizedAdmin(address))) {
      return Response.json(
        { error: "Wallet does not have an authorized XDCID administrator role" },
        { status: 403 },
      );
    }

    const valid = await verifyAdminWalletSignature(
      body.message,
      body.signature as Hex,
      address,
    );
    if (!valid) {
      return Response.json({ error: "Wallet signature is invalid" }, { status: 401 });
    }

    const consumed = await database
      .update(adminAuthChallenges)
      .set({ usedAt: now })
      .where(
        and(
          eq(adminAuthChallenges.id, body.challengeId),
          isNull(adminAuthChallenges.usedAt),
          gt(adminAuthChallenges.expiresAt, now),
        ),
      )
      .returning({ id: adminAuthChallenges.id });

    if (consumed.length !== 1) {
      return Response.json({ error: "Login challenge was already used" }, { status: 401 });
    }

    const session = createAdminSession(address);
    return Response.json(
      {
        authenticated: true,
        address,
        expiresAt: session.expiresAt,
      },
      {
        headers: {
          "cache-control": "no-store",
          "set-cookie": adminSessionCookie(session.token),
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Unable to verify admin login" },
      { status: 503 },
    );
  }
}
