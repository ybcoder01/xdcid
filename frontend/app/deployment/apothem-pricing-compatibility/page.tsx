import { notFound } from "next/navigation";
import ApothemRegistryV2DeploymentClient from "../apothem-registry-v2/ApothemRegistryV2DeploymentClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Deploy Apothem Pricing Compatibility Fix | XDCID",
  robots: { index: false, follow: false },
};

export default function ApothemPricingCompatibilityDeploymentPage() {
  if (
    (process.env.VERCEL_ENV !== "preview" &&
      process.env.NODE_ENV !== "development") ||
    process.env.ENABLE_APOTHEM_REGISTRY_V2_DEPLOYMENT !== "true"
  ) {
    notFound();
  }

  return <ApothemRegistryV2DeploymentClient />;
}
