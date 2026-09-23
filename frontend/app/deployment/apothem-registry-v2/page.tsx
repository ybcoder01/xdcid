import { notFound } from "next/navigation";
import ApothemRegistryV2DeploymentClient from "./ApothemRegistryV2DeploymentClient";

export const dynamic = "force-dynamic";

export default function ApothemRegistryV2DeploymentPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.ENABLE_APOTHEM_REGISTRY_V2_DEPLOYMENT !== "true"
  ) {
    notFound();
  }

  return <ApothemRegistryV2DeploymentClient />;
}
