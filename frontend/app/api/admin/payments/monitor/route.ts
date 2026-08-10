import { requireAdminSession } from "../../../../../lib/adminAuth";
import { getForwardingFailureMonitor } from "../../../../../lib/forwardingFailureMonitor";

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

  try {
    const report = await getForwardingFailureMonitor();
    return Response.json(report, { headers: noStoreHeaders() });
  } catch {
    return Response.json(
      { error: "Payment monitoring is temporarily unavailable." },
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
