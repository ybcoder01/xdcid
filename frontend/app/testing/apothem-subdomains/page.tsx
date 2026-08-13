import { notFound } from "next/navigation";
import ApothemSubdomainTestingClient from "./ApothemSubdomainTestingClient";

export const dynamic = "force-dynamic";

export default function ApothemSubdomainTestingPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.ENABLE_APOTHEM_SUBDOMAIN_DEPLOYMENT !== "true"
  ) {
    notFound();
  }

  return <ApothemSubdomainTestingClient />;
}
