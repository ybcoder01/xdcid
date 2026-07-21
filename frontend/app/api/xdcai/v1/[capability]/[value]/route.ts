import {
  apiError,
  apiSuccess,
  handleApiError
} from "../../../../../../lib/apiResponse";
import { getOwnedNamesData } from "../../../../../../lib/ownedNames";
import {
  getNameData,
  getReverseData,
  parseYears
} from "../../../../../../lib/xnsApi";

export const dynamic = "force-dynamic";

const GATEWAY_KEY_HEADER = "x-xdcid-gateway-key";

type RouteContext = {
  params: Promise<{ capability: string; value: string }>;
};

async function secretDigest(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const [providedDigest, expectedDigest] = await Promise.all([
    secretDigest(provided),
    secretDigest(expected)
  ]);

  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= providedDigest[index] ^ expectedDigest[index];
  }

  return difference === 0;
}

async function authorizeGateway(request: Request) {
  const expected = process.env.XDCID_GATEWAY_API_KEY?.trim();
  if (!expected) {
    console.error("XDC AI gateway key is not configured");
    return apiError(
      "GATEWAY_UNAVAILABLE",
      "Gateway API is not configured",
      503
    );
  }

  const provided = request.headers.get(GATEWAY_KEY_HEADER)?.trim();
  if (!provided || !(await secretsMatch(provided, expected))) {
    return apiError("UNAUTHORIZED", "Invalid gateway credentials", 401);
  }

  return null;
}

export async function GET(request: Request, context: RouteContext) {
  const authorizationError = await authorizeGateway(request);
  if (authorizationError) return authorizationError;

  const { capability, value } = await context.params;

  try {
    if (capability === "reverse") {
      return apiSuccess(await getReverseData(value));
    }

    if (capability === "owned-names") {
      return apiSuccess(await getOwnedNamesData(value));
    }

    const years =
      capability === "availability"
        ? parseYears(new URL(request.url).searchParams.get("years"))
        : 1;
    const data = await getNameData(value, years);

    if (capability === "resolve") {
      const {
        name,
        label,
        node,
        network,
        registered,
        owner,
        resolvedAddress,
        expiry
      } = data;

      return apiSuccess({
        name,
        label,
        node,
        network,
        registered,
        owner,
        resolvedAddress,
        expiry
      });
    }

    if (capability === "availability") {
      const {
        name,
        label,
        node,
        network,
        available,
        registered,
        expiry,
        pricing
      } = data;

      return apiSuccess({
        name,
        label,
        node,
        network,
        available,
        registered,
        expiry,
        pricing
      });
    }

    if (capability === "profile") {
      const { name, label, node, network, registered, owner, profile } = data;

      return apiSuccess({
        name,
        label,
        node,
        network,
        registered,
        owner,
        profile
      });
    }

    return apiError("NOT_FOUND", "Gateway capability not found", 404);
  } catch (error) {
    return handleApiError(error, "XDC AI gateway lookup failed");
  }
}
