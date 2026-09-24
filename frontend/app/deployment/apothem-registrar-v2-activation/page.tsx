import { redirect } from "next/navigation";

export const metadata = {
  title: "Activate Registrar V2 | XDCID",
  robots: { index: false, follow: false },
};

export default function Page() {
  redirect("/deployment/apothem-registry-v2-activation");
}
