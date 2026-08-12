import { notFound } from "next/navigation";
import ApothemDeploymentClient from "./ApothemDeploymentClient";

export const dynamic = "force-dynamic";

export default function ApothemDeploymentPage() {
  if (process.env.ENABLE_APOTHEM_DEPLOYMENT !== "true") {
    notFound();
  }
  return <ApothemDeploymentClient />;
}
