import {
  apiSuccess,
  handleApiError
} from "../../../../../../lib/apiResponse";
import { getOwnedNamesData } from "../../../../../../lib/ownedNames";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ address: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { address } = await context.params;

  try {
    return apiSuccess(await getOwnedNamesData(address));
  } catch (error) {
    return handleApiError(error, "Owned-name lookup failed");
  }
}
