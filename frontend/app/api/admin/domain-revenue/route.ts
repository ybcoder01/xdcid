import { requireAdminPermission } from "../../../../lib/adminAuth";
import {
  getDomainRevenueReport,
  type DomainRevenueTrendInterval,
} from "../../../../lib/domainRevenue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const session = await requireAdminPermission(request, "revenue:view");
  if (!session) {
    return Response.json(
      { error: "Treasury or platform-owner authentication required" },
      { status: 403, headers: noStoreHeaders() },
    );
  }

  const parameters = new URL(request.url).searchParams;
  const days = Number(parameters.get("days") || "30");
  const interval = parameters.get("interval") || "day";
  if (!Number.isSafeInteger(days) || days < 7 || days > 365) {
    return Response.json(
      { error: "Reporting window must be between 7 and 365 days." },
      { status: 400, headers: noStoreHeaders() },
    );
  }
  if (interval !== "day" && interval !== "week" && interval !== "month") {
    return Response.json(
      { error: "Trend interval must be day, week, or month." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const report = await getDomainRevenueReport(
      days,
      interval as DomainRevenueTrendInterval,
    );
    return Response.json(report, { headers: noStoreHeaders() });
  } catch (error) {
    console.error("[admin/domain-revenue] report failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Domain revenue reporting is temporarily unavailable." },
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
