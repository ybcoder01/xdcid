import { notFound } from "next/navigation";
import MainnetPrimaryResolutionActivationClient from "./MainnetPrimaryResolutionActivationClient";

export const dynamic = "force-dynamic";

export default function MainnetPrimaryResolutionActivationPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.ENABLE_MAINNET_PRIMARY_RESOLUTION_ACTIVATION !== "true"
  ) {
    notFound();
  }

  return <MainnetPrimaryResolutionActivationClient />;
}
