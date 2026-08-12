import { notFound } from "next/navigation";
import MainnetPricingDeploymentClient from "./MainnetPricingDeploymentClient";

export const dynamic = "force-dynamic";

export default function MainnetPricingDeploymentPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.ENABLE_MAINNET_PRICING_DEPLOYMENT !== "true"
  ) {
    notFound();
  }

  return <MainnetPricingDeploymentClient />;
}
