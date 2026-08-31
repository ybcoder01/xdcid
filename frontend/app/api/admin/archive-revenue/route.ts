import { requireAdminPermission } from "../../../../lib/adminAuth";
import { getArchiveRevenueReport } from "../../../../lib/archiveSubscriptionPurchases";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminPermission(request, "revenue:view");
  if (!session) {
    return Response.json(
      { error: "Treasury or platform-owner authentication required" },
      { status: 403, headers: noStoreHeaders() },
    );
  }

  try {
    return Response.json(await getArchiveRevenueReport(), {
      headers: noStoreHeaders(),
    });
  } catch {
    return Response.json(
      { error: "Archive revenue reporting is temporarily unavailable." },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}

function noStoreHeaders() {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive",
  };
}
