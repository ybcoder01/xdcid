import { requireAdminSession } from "../../../../lib/adminAuth";
import {
  getHistoryAccessPolicy,
  updateHistoryAccessPolicy
} from "../../../../lib/historyAccessPolicy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminSession(request);
  if (!session) return json({ error: "Admin authentication required" }, 401);
  try {
    return json(await getHistoryAccessPolicy());
  } catch {
    return json({ error: "History access policy is unavailable" }, 503);
  }
}

export async function PUT(request: Request) {
  const session = await requireAdminSession(request);
  if (!session) return json({ error: "Admin authentication required" }, 401);
  try {
    const body = await request.json() as Record<string, unknown>;
    if (
      typeof body.freeHistoryMonths !== "number" ||
      typeof body.maximumRetentionMonths !== "number" ||
      typeof body.archiveAccessEnabled !== "boolean" ||
      typeof body.subscriptionSalesEnabled !== "boolean" ||
      typeof body.archiveGraceDays !== "number" ||
      body.archivePaymentCurrency !== "USDC" ||
      !(
        body.oneYearPriceUsdMicros === null ||
        typeof body.oneYearPriceUsdMicros === "number"
      ) ||
      typeof body.threeYearDiscountBps !== "number" ||
      typeof body.sevenYearDiscountBps !== "number"
    ) {
      return json({ error: "A complete archive subscription policy is required" }, 400);
    }
    return json(await updateHistoryAccessPolicy({
      freeHistoryMonths: body.freeHistoryMonths,
      maximumRetentionMonths: body.maximumRetentionMonths,
      archiveAccessEnabled: body.archiveAccessEnabled,
      subscriptionSalesEnabled: body.subscriptionSalesEnabled,
      archiveGraceDays: body.archiveGraceDays,
      archivePaymentCurrency: body.archivePaymentCurrency,
      oneYearPriceUsdMicros: body.oneYearPriceUsdMicros,
      threeYearDiscountBps: body.threeYearDiscountBps,
      sevenYearDiscountBps: body.sevenYearDiscountBps,
      updatedBy: session.address
    }));
  } catch (cause) {
    return json({
      error: cause instanceof Error ? cause.message : "History policy update failed"
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
