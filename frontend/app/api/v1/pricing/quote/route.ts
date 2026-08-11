import { formatEther } from "viem";
import { apiSuccess, handleApiError, ApiInputError } from "../../../../../lib/apiResponse";
import { getCoinGeckoXdcPrice } from "../../../../../lib/coingeckoXdcPrice";
import { parseXnsName } from "../../../../../lib/names";
import {
  calculateBufferedXdcWei,
  calculateUsdPrice,
  isRegistrationTerm,
  type PricingProduct,
} from "../../../../../lib/pricingPolicy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const products = new Set<PricingProduct>([
  "registration",
  "renewal",
  "subdomain",
  "migration",
]);

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const product = params.get("product") as PricingProduct | null;
    if (!product || !products.has(product)) {
      throw new ApiInputError(
        "INVALID_PRODUCT",
        "product must be registration, renewal, subdomain, or migration",
      );
    }

    const years = product === "migration"
      ? undefined
      : Number(params.get("years") || "1");
    if (years !== undefined && !isRegistrationTerm(years)) {
      throw new ApiInputError(
        "INVALID_YEARS",
        "years must be one of 1, 3, 5, or 10",
      );
    }

    let labelLength: number | undefined;
    let name: string | null = null;
    if (product === "registration" || product === "renewal") {
      const parsed = parseXnsName(params.get("name") || "");
      if (!parsed.isValid) {
        throw new ApiInputError(
          "INVALID_NAME",
          parsed.error || "Invalid XDCID name",
        );
      }
      name = parsed.name;
      labelLength = parsed.label.length;
    }

    const usd = calculateUsdPrice({ product, years, labelLength });
    const xdc = await getCoinGeckoXdcPrice();
    const xdcWei = calculateBufferedXdcWei(
      usd.totalUsdMicros,
      xdc.priceUsdMicros,
    );

    return apiSuccess({
      authorizedForPayment: false,
      warning:
        "Informational quote only. A later signed-quote contract is required before this value can authorize payment.",
      policyVersion: usd.policyVersion,
      product,
      name,
      years: usd.years,
      pricing: {
        currency: "USD",
        annualMicros: usd.annualUsdMicros?.toString() ?? null,
        grossMicros: usd.grossUsdMicros.toString(),
        discountBps: usd.discountBps.toString(),
        totalMicros: usd.totalUsdMicros.toString(),
      },
      xdc: {
        wei: xdcWei.toString(),
        xdc: formatEther(xdcWei),
        bufferBps: "200",
        marketPriceUsdMicros: xdc.priceUsdMicros.toString(),
        provider: xdc.provider,
        coinId: xdc.coinId,
        observedAt: xdc.observedAt,
        fetchedAt: xdc.fetchedAt,
      },
    });
  } catch (error) {
    return handleApiError(error, "Pricing quote failed");
  }
}
