import { notFound } from "next/navigation";
import ActivateMainnetRegistrarClient from "./ActivateMainnetRegistrarClient";

export const dynamic = "force-dynamic";

export default function ActivateMainnetRegistrarPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "temporary/activate-mainnet-registrar"
  ) {
    notFound();
  }

  return <ActivateMainnetRegistrarClient />;
}
