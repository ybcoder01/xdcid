import { buildMainnetAttestationUrl } from "../../../../lib/cctpMainnet";

export const dynamic = "force-dynamic";

const hexBytesPattern = /^0x(?:[0-9a-fA-F]{2})+$/;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const sourceChainId = Number(requestUrl.searchParams.get("sourceChainId"));
  const transactionHash = requestUrl.searchParams.get("transactionHash") || "";
  const forwarded = requestUrl.searchParams.get("forwarded") === "true";

  let circleUrl: string;
  try {
    circleUrl = buildMainnetAttestationUrl(sourceChainId, transactionHash);
  } catch {
    return Response.json(
      { error: "Invalid source network or burn transaction hash" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(circleUrl, {
      cache: "no-store",
      headers: { accept: "application/json" }
    });

    if (response.status === 404) {
      return Response.json({ status: "pending" }, { status: 202 });
    }
    if (!response.ok) {
      return Response.json(
        { error: "Circle attestation service is unavailable" },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as unknown;
    const messages =
      isRecord(payload) && Array.isArray(payload.messages)
        ? payload.messages
        : [];
    const entry =
      messages.length > 0 && isRecord(messages[0]) ? messages[0] : null;
    const status =
      entry && typeof entry.status === "string" ? entry.status : "pending";
    const message =
      entry && typeof entry.message === "string" ? entry.message : "";
    const attestation =
      entry && typeof entry.attestation === "string" ? entry.attestation : "";
    const forwardTxHash =
      entry && typeof entry.forwardTxHash === "string"
        ? entry.forwardTxHash
        : "";

    if (forwarded) {
      if (status !== "complete" || !/^0x[0-9a-fA-F]{64}$/.test(forwardTxHash)) {
        return Response.json({ status: "pending" }, { status: 202 });
      }
      return Response.json(
        { status: "complete", forwardTxHash },
        { headers: { "cache-control": "no-store" } }
      );
    }

    if (
      status !== "complete" ||
      !hexBytesPattern.test(message) ||
      !hexBytesPattern.test(attestation)
    ) {
      return Response.json({ status: "pending" }, { status: 202 });
    }

    return Response.json(
      { status: "complete", message, attestation },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return Response.json(
      { error: "Could not contact Circle attestation service" },
      { status: 502 }
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
