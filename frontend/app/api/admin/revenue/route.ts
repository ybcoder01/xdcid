import { requireAdminSession } from "../../../../lib/adminAuth";
import { getForwardingRevenueReport } from "../../../../lib/forwardingRecoveryStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminSession(request);
  if (!session) {
    return Response.json(
      { error: "Admin authentication required" },
      { status: 401, headers: noStoreHeaders() },
    );
  }

  const requestedDays = Number(
    new URL(request.url).searchParams.get("days") || "30",
  );
  if (!Number.isSafeInteger(requestedDays) || requestedDays < 7 || requestedDays > 90) {
    return Response.json(
      { error: "Reporting window must be between 7 and 90 days." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const report = await getForwardingRevenueReport(requestedDays);
    return Response.json(report, { headers: noStoreHeaders() });
  } catch {
    return Response.json(
      { error: "Revenue reporting is temporarily unavailable." },
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
