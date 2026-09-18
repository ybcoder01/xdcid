import { notFound } from "next/navigation";
import ApothemPrimaryResolutionDeploymentClient from "./ApothemPrimaryResolutionDeploymentClient";

export const dynamic = "force-dynamic";

export default function ApothemPrimaryResolutionDeploymentPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.ENABLE_APOTHEM_PRIMARY_RESOLUTION_DEPLOYMENT !== "true"
  ) {
    notFound();
  }

  return <ApothemPrimaryResolutionDeploymentClient />;
}
