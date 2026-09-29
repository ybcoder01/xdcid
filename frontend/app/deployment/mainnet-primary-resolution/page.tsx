import { notFound } from "next/navigation";
import MainnetPrimaryResolutionDeploymentClient from "./MainnetPrimaryResolutionDeploymentClient";

export const dynamic = "force-dynamic";

export default function MainnetPrimaryResolutionDeploymentPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.ENABLE_MAINNET_PRIMARY_RESOLUTION_DEPLOYMENT !== "true"
  ) {
    notFound();
  }

  return <MainnetPrimaryResolutionDeploymentClient />;
}
