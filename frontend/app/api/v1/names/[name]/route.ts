import {
  apiError,
  apiSuccess,
  handleApiError
} from "../../../../../lib/apiResponse";
import {
  checkApiRateLimit,
  rateLimitHeaders
} from "../../../../../lib/rateLimit";
import { getNameData, parseYears } from "../../../../../lib/xnsApi";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ name: string }>;
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
    const { name } = await context.params;
    const years = parseYears(new URL(request.url).searchParams.get("years"));
    const data = await getNameData(name, years);

    return apiSuccess(data, headers);
  } catch (error) {
    return handleApiError(error, "XNS name lookup failed", headers);
  }
}
