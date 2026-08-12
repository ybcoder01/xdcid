import { notFound } from "next/navigation";
import ApothemPricingTestClient from "./ApothemPricingTestClient";

export const dynamic = "force-dynamic";

export default function ApothemPricingTestPage() {
  if (process.env.ENABLE_APOTHEM_PRICING_TEST !== "true") notFound();
  return <ApothemPricingTestClient />;
}
