import {
  currentRegistrationTreasury,
  requireAdminPermission,
} from "../../../../lib/adminAuth";
import { XDCID_FEE_RECIPIENT } from "../../../../lib/cctpMainnet";
import { buildTreasuryDestinationReport } from "../../../../lib/treasuryDestinations";

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
    const registrationTreasury = await currentRegistrationTreasury();
    const report = buildTreasuryDestinationReport({
      registrationTreasury,
      archiveTreasury: process.env.ARCHIVE_SUBSCRIPTION_TREASURY_ADDRESS,
      forwardingFeeRecipient: XDCID_FEE_RECIPIENT,
    });
    return Response.json(report, { headers: noStoreHeaders() });
  } catch (error) {
    console.error("[admin/treasury-destinations] report failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Treasury destinations are temporarily unavailable." },
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
