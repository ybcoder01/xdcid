import { notFound } from "next/navigation";
import ApothemRegistryV2ActivationClient from "./ApothemRegistryV2ActivationClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Activate Apothem Registry V2 | XDCID",
  robots: { index: false, follow: false },
};

export default function ApothemRegistryV2ActivationPage() {
  if (
    (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") ||
    process.env.ENABLE_APOTHEM_REGISTRY_V2_DEPLOYMENT !== "true"
  ) {
    notFound();
  }

  return <ApothemRegistryV2ActivationClient />;
}
