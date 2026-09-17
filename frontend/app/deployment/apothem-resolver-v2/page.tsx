import { notFound } from "next/navigation";
import ApothemResolverV2DeploymentClient from "./ApothemResolverV2DeploymentClient";

export const dynamic = "force-dynamic";

export default function ApothemResolverV2DeploymentPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.ENABLE_APOTHEM_RESOLVER_V2_DEPLOYMENT !== "true"
  ) {
    notFound();
  }

  return <ApothemResolverV2DeploymentClient />;
}
