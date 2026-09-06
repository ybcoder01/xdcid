import { notFound } from "next/navigation";
import MainnetV2ActivationClient from "./MainnetV2ActivationClient";

export const dynamic = "force-dynamic";

export default function MainnetV2ActivationPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.ENABLE_MAINNET_PRICING_DEPLOYMENT !== "true"
  ) {
    notFound();
  }
  return <MainnetV2ActivationClient />;
}
