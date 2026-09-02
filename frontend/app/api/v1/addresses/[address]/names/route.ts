import {
  apiSuccess,
  handleApiError
} from "../../../../../../lib/apiResponse";
import { getOwnedNamesData } from "../../../../../../lib/ownedNames";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ address: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { address } = await context.params;
  const knownNames = new URL(request.url).searchParams
    .getAll("known")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    return apiSuccess(await getOwnedNamesData(address, knownNames));
  } catch (error) {
    return handleApiError(error, "Owned-name lookup failed");
  }
}
