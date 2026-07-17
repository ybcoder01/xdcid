import { apiSuccess, handleApiError } from "../../../../../lib/apiResponse";
import { getNameData, parseYears } from "../../../../../lib/xnsApi";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ name: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { name } = await context.params;
    const years = parseYears(new URL(request.url).searchParams.get("years"));
    const data = await getNameData(name, years);

    return apiSuccess(data);
  } catch (error) {
    return handleApiError(error, "XNS name lookup failed");
  }
}
