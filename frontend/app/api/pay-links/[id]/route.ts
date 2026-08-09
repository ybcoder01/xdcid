import {
  getStoredPayLink,
  isPayLinkStoreConfigured,
  revokeStoredPayLink
} from "../../../../lib/payLinkStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  if (!isPayLinkStoreConfigured()) return storageUnavailable();
  const { id } = await context.params;

  try {
    const record = await getStoredPayLink(id);
    if (!record) return json({ error: "Pay Link was not found" }, 404);
    if (record.status === "revoked") {
      return json({ error: "This Pay Link has been revoked" }, 410);
    }
    if (record.status === "expired") {
      return json({ error: "This Pay Link has expired" }, 410);
    }
    return json({
      id: record.id,
      name: record.name,
      request: record.encodedRequest,
      signature: record.signature,
      expiresAt: record.expiresAt
    });
  } catch {
    return storageUnavailable();
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isPayLinkStoreConfigured()) return storageUnavailable();
  const { id } = await context.params;
  const authorization = request.headers.get("authorization") || "";
  const revocationToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!revocationToken) {
    return json({ error: "A revocation token is required" }, 401);
  }

  try {
    const result = await revokeStoredPayLink(id, revocationToken);
    if (result === "not-found") {
      return json({ error: "Pay Link was not found" }, 404);
    }
    if (result === "unauthorized") {
      return json({ error: "Revocation token is invalid" }, 403);
    }
    return json({ status: "revoked" });
  } catch {
    return storageUnavailable();
  }
}

function storageUnavailable() {
  return json({ error: "Short Pay Links are temporarily unavailable" }, 503);
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: responseHeaders() });
}

function responseHeaders() {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive"
  };
}
