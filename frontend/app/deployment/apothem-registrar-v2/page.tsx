import { notFound } from "next/navigation";
import ApothemRegistrarV2DeploymentClient from "./ApothemRegistrarV2DeploymentClient";

export const dynamic = "force-dynamic";

export default function ApothemRegistrarV2DeploymentPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.ENABLE_APOTHEM_REGISTRAR_V2_DEPLOYMENT !== "true"
  ) {
    notFound();
  }

  return <ApothemRegistrarV2DeploymentClient />;
}
