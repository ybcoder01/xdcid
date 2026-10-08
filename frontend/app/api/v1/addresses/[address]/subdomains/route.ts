import {
  apiSuccess,
  handleApiError,
} from "../../../../../../lib/apiResponse";
import { getOwnedSubdomainsData } from "../../../../../../lib/ownedSubdomains";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ address: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { address } = await context.params;
  const knownSubdomains = new URL(request.url).searchParams
    .getAll("known")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    return apiSuccess(
      await getOwnedSubdomainsData(address, knownSubdomains),
    );
  } catch (error) {
    return handleApiError(error, "Owned-subdomain lookup failed");
  }
}
