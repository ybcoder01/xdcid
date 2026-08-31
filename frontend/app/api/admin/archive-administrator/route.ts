import { isAddress } from "viem";
import { requireAdminSession } from "../../../../lib/adminAuth";
import {
  getArchiveAccessAdministrator,
  setArchiveAccessAdministrator
} from "../../../../lib/archiveAccessAdministrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminSession(request);
  if (!session) return json({ error: "Admin authentication required" }, 401);
  try {
    return json({ administrator: await getArchiveAccessAdministrator() });
  } catch {
    return json({ error: "Archive administrator configuration is unavailable" }, 503);
  }
}

export async function PUT(request: Request) {
  const session = await requireAdminSession(request);
  if (!session) return json({ error: "Admin authentication required" }, 401);
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!isAddress(String(body.wallet || ""))) {
      return json({ error: "A valid archive administrator wallet is required" }, 400);
    }
    const administrator = await setArchiveAccessAdministrator({
      wallet: String(body.wallet),
      updatedBy: session.address
    });
    return json({ administrator });
  } catch (cause) {
    return json({
      error: cause instanceof Error
        ? cause.message
        : "Archive administrator update failed"
    }, 400);
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
