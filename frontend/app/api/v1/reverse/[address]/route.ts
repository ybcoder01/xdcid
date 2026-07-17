import {
  apiError,
  apiSuccess,
  handleApiError
} from "../../../../../lib/apiResponse";
import {
  checkApiRateLimit,
  rateLimitHeaders
} from "../../../../../lib/rateLimit";
import { getReverseData } from "../../../../../lib/xnsApi";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ address: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const rateLimit = await checkApiRateLimit(request);
  const headers = rateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return apiError(
      "RATE_LIMITED",
      "Too many requests. Try again later.",
      429,
      headers
    );
  }

  try {
    const { address } = await context.params;
    const data = await getReverseData(address);

    return apiSuccess(data, headers);
  } catch (error) {
    return handleApiError(error, "XNS reverse lookup failed", headers);
  }
}
