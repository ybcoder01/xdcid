import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SubdomainRegistration } from "../../../components/SubdomainRegistration";
import { requireAdminSession } from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Subdomain launch test",
  robots: { index: false, follow: false },
};

export default async function AdminSubdomainSmokeTestPage() {
  const incomingHeaders = await headers();
  const request = new Request("https://xdcid.xyz/admin/subdomains", {
    headers: new Headers(incomingHeaders),
  });
  const session = await requireAdminSession(request);

  if (!session) redirect("/admin");

  return (
    <main className="xdc-product-page mx-auto max-w-5xl px-4 py-10">
      <section className="rounded-[2rem] border border-teal-200 bg-white p-7 shadow-sm md:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0b6670]">
          Mainnet launch test
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
          Register and renew a subdomain
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">
          This administrator-only surface uses the production quote service and
          active XDC Network contracts while public subdomain registration
          remains disabled. Use a low-value wallet and an active parent XDCID.
        </p>
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          Complete one XDC registration, one USDC registration, and a renewal
          before enabling the public product.
        </div>
        <Link
          className="mt-6 inline-flex rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          href="/admin"
        >
          Back to admin dashboard
        </Link>
      </section>

      <div className="mt-8">
        <SubdomainRegistration allowDisabledEnvironment />
      </div>
    </main>
  );
}
