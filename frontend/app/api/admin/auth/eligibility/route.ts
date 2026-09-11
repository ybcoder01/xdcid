import { getAddress, isAddress } from "viem";
import { resolveAdminAuthorization } from "../../../../../lib/adminAuth";
import {
  adminRateLimitResponse,
  checkAdminRateLimit,
} from "../../../../../lib/adminSecurity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const rateLimit = await checkAdminRateLimit({
      request,
      scope: "eligibility",
      limit: 60,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) return adminRateLimitResponse(rateLimit);
  } catch {
    return Response.json(
      { eligible: false },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const address = new URL(request.url).searchParams.get("address") || "";
  if (!isAddress(address)) {
    return Response.json(
      { eligible: false },
      {
        status: 400,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  try {
    const authorization = await resolveAdminAuthorization(getAddress(address));
    return Response.json(
      { eligible: authorization.permissions.length > 0 },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { eligible: false },
      {
        status: 503,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}
