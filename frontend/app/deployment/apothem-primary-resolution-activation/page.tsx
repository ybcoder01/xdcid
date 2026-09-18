import { notFound } from "next/navigation";
import ApothemPrimaryResolutionActivationClient from "./ApothemPrimaryResolutionActivationClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Activate primary resolution | XDCID",
  robots: { index: false, follow: false }
};

export default function ApothemPrimaryResolutionActivationPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.ENABLE_APOTHEM_PRIMARY_RESOLUTION_ACTIVATION !== "true"
  ) {
    notFound();
  }

  return <ApothemPrimaryResolutionActivationClient />;
}
