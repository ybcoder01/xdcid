import { requireAdminSession } from "../../../../lib/adminAuth";
import {
  getPaymentRetentionManifest,
  getPaymentRetentionPreview,
  setPaymentRetentionControl
} from "../../../../lib/paymentRetentionReview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminSession(request);
  if (!session) return json({ error: "Admin authentication required" }, 401);
  try {
    if (new URL(request.url).searchParams.get("format") === "csv") {
      const rows = await getPaymentRetentionManifest();
      const header = [
        "Payment ID", "Completed UTC", "Source chain ID",
        "Destination chain ID", "Source transaction hash",
        "Destination transaction hash"
      ];
      const csv = [header, ...rows.map((row) => [
        row.paymentId,
        row.completedAt,
        String(row.sourceChainId),
        String(row.destinationChainId),
        row.sourceTransactionHash,
        row.destinationTransactionHash
      ])].map((row) => row.map(csvCell).join(",")).join("\r\n");
      return new Response("\uFEFF" + csv, {
        headers: {
          ...noStoreHeaders(),
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="xdcid-retention-manifest.csv"'
        }
      });
    }
    return json(await getPaymentRetentionPreview());
  } catch {
    return json({ error: "Retention review is temporarily unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession(request);
  if (!session) return json({ error: "Admin authentication required" }, 401);
  try {
    const body = await request.json() as {
      action?: unknown;
      manifestHash?: unknown;
    };
    if (
      (body.action !== "held" && body.action !== "approved") ||
      typeof body.manifestHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(body.manifestHash)
    ) {
      return json({ error: "A valid retention review action is required" }, 400);
    }
    return json(await setPaymentRetentionControl({
      action: body.action,
      manifestHash: body.manifestHash,
      reviewedBy: session.address
    }));
  } catch (cause) {
    return json({
      error: cause instanceof Error ? cause.message : "Retention review failed"
    }, 409);
  }
}

function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: noStoreHeaders() });
}

function noStoreHeaders() {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive"
  };
}
