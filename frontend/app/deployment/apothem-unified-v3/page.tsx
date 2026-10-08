import { notFound } from "next/navigation";
import ApothemUnifiedDeploymentClient from "./ApothemUnifiedDeploymentClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Deploy Unified XDCID V3 on Apothem",
  robots: { index: false, follow: false },
};

export default function ApothemUnifiedDeploymentPage() {
  if (
    (process.env.VERCEL_ENV !== "preview" &&
      process.env.NODE_ENV !== "development") ||
    process.env.ENABLE_APOTHEM_UNIFIED_V3_DEPLOYMENT !== "true"
  ) {
    notFound();
  }

  return <ApothemUnifiedDeploymentClient />;
}
