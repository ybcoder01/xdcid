import { getProviderData as getVercelProviderData } from "@flags-sdk/vercel";
import {
  createFlagsDiscoveryEndpoint,
  getProviderData as getLocalProviderData,
} from "flags/next";
import {
  featureFlagDefinitions,
  featureFlagsProviderAvailable,
} from "../../../../flags";

export const GET = createFlagsDiscoveryEndpoint(() =>
  featureFlagsProviderAvailable
    ? getVercelProviderData(featureFlagDefinitions)
    : getLocalProviderData(featureFlagDefinitions),
);
