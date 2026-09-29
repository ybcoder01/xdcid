import { redirect } from "next/navigation";

export const metadata = {
  title: "Activate primary resolution | XDCID",
  robots: { index: false, follow: false }
};

export default function ApothemPrimaryResolutionActivationPage() {
  redirect("/deployment/apothem-registry-v2-activation");
}
