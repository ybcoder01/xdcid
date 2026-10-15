import type { Metadata } from "next";
import Link from "next/link";
import { SubdomainRegistration } from "../../components/SubdomainRegistration";

export const metadata: Metadata = {
  title: "Create a subdomain | XDCID",
  description: "Create a wallet-owned identity beneath one of your active XDCID names.",
};

type SubdomainsPageProps = {
  searchParams: Promise<{ parent?: string; label?: string }>;
};

export default async function SubdomainsPage({ searchParams }: SubdomainsPageProps) {
  const { parent = "", label = "" } = await searchParams;
  return (
    <main className="xdc-product-page mx-auto max-w-5xl px-4 py-10">
      <section className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
        <Link className="text-sm font-semibold text-teal-700 hover:text-teal-900" href="/dashboard">
          ← Back to dashboard
        </Link>
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
            Parent-name control
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">
            Create a subdomain
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
            Create an identity beneath an active XDCID you control and assign it
            to a wallet. Its expiry cannot extend beyond the parent name.
          </p>
        </div>
      </section>
      <div className="mt-8">
        <SubdomainRegistration
          allowRenewalsWhenDisabled
          initialLabel={label}
          initialParentName={parent}
        />
      </div>
    </main>
  );
}
