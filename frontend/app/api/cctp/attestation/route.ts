import {
  buildCctpAttestationUrl,
  type CctpTestnetKey
} from "../../../../../sdk/src/cctp";

export const dynamic = "force-dynamic";

const supportedSources = new Set<CctpTestnetKey>(["arbitrumSepolia", "xdcApothem"]);
const hexBytesPattern = /^0x(?:[0-9a-fA-F]{2})+$/;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const source = requestUrl.searchParams.get("source") as CctpTestnetKey | null;
  const transactionHash = requestUrl.searchParams.get("transactionHash") || "";

  if (!source || !supportedSources.has(source)) {
    return Response.json({ error: "Unsupported CCTP source network" }, { status: 400 });
  }

  let circleUrl: string;
  try {
    circleUrl = buildCctpAttestationUrl(source, transactionHash);
  } catch {
    return Response.json({ error: "Invalid burn transaction hash" }, { status: 400 });
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
      return Response.json({ error: "Circle attestation service is unavailable" }, { status: 502 });
    }

    const payload = (await response.json()) as unknown;
    const messages = isRecord(payload) && Array.isArray(payload.messages) ? payload.messages : [];
    const entry = messages.length > 0 && isRecord(messages[0]) ? messages[0] : null;
    const message = entry && typeof entry.message === "string" ? entry.message : "";
    const attestation = entry && typeof entry.attestation === "string" ? entry.attestation : "";

    if (!hexBytesPattern.test(message) || !hexBytesPattern.test(attestation)) {
      return Response.json({ status: "pending" }, { status: 202 });
    }

    return Response.json(
      { status: "complete", message, attestation },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return Response.json({ error: "Could not contact Circle attestation service" }, { status: 502 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
