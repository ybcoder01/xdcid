import { isAddress } from "viem";
import { requireAdminSession } from "../../../../lib/adminAuth";
import {
  grantWalletArchiveEntitlement,
  listArchiveEntitlements,
  revokeArchiveEntitlement
} from "../../../../lib/archiveEntitlements";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminSession(request);
  if (!session) return json({ error: "Admin authentication required" }, 401);
  try {
    return json({ entitlements: await listArchiveEntitlements() });
  } catch {
    return json({ error: "Archive entitlements are unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession(request);
  if (!session) return json({ error: "Admin authentication required" }, 401);
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!isAddress(String(body.wallet || ""))) {
      return json({ error: "A valid wallet address is required" }, 400);
    }
    const expiresAt = new Date(String(body.expiresAt || ""));
    if (Number.isNaN(expiresAt.getTime())) {
      return json({ error: "A valid entitlement expiry is required" }, 400);
    }
    const entitlement = await grantWalletArchiveEntitlement({
      wallet: String(body.wallet),
      expiresAt,
      createdBy: session.address,
      source: "admin"
    });
    return json({ entitlement }, 201);
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "Entitlement grant failed" }, 400);
  }
}

export async function DELETE(request: Request) {
  const session = await requireAdminSession(request);
  if (!session) return json({ error: "Admin authentication required" }, 401);
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.id !== "string" || !body.id) {
      return json({ error: "Entitlement ID is required" }, 400);
    }
    await revokeArchiveEntitlement({ id: body.id, revokedBy: session.address });
    return json({ revoked: true });
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "Entitlement revocation failed" }, 400);
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive"
    }
  });
}
