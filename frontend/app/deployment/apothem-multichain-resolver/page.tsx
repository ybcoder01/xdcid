import { notFound } from "next/navigation";
import ApothemMultichainResolverDeploymentClient from "./ApothemMultichainResolverDeploymentClient";

export const dynamic = "force-dynamic";

export default function ApothemMultichainResolverDeploymentPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.ENABLE_APOTHEM_RESOLVER_V2_DEPLOYMENT !== "true"
  ) {
    notFound();
  }

  return <ApothemMultichainResolverDeploymentClient />;
}
