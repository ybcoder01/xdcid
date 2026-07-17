import { apiSuccess, handleApiError } from "../../../../../lib/apiResponse";
import { getReverseData } from "../../../../../lib/xnsApi";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ address: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { address } = await context.params;
    const data = await getReverseData(address);

    return apiSuccess(data);
  } catch (error) {
    return handleApiError(error, "XNS reverse lookup failed");
  }
}
