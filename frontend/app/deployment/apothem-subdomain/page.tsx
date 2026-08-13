import { notFound } from "next/navigation";
import ApothemSubdomainDeploymentClient from "./ApothemSubdomainDeploymentClient";

export const dynamic = "force-dynamic";

export default function ApothemSubdomainDeploymentPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.ENABLE_APOTHEM_SUBDOMAIN_DEPLOYMENT !== "true"
  ) {
    notFound();
  }

  return <ApothemSubdomainDeploymentClient />;
}
