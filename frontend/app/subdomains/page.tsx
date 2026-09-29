import type { Metadata } from "next";
import Link from "next/link";
import { SubdomainRegistration } from "../../components/SubdomainRegistration";

export const metadata: Metadata = {
  title: "XDCID Subdomains",
  description: "Create wallet-owned identities beneath an active XDCID name.",
};

const capabilities = [
  "Create identities beneath a parent .xdc name",
  "Assign each subdomain to its own wallet",
  "Delegate management to approved operators",
  "Keep subdomain expiry within the parent term",
];

export default function SubdomainsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="overflow-hidden rounded-[2rem] border border-teal-200 bg-white shadow-sm">
        <div className="border-b border-teal-200 bg-teal-50 px-7 py-3 text-xs font-bold uppercase tracking-[0.2em] text-teal-900">
          Active product · XDC Network
        </div>
        <div className="grid gap-8 p-7 md:grid-cols-[1.15fr_0.85fr] md:p-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0b6670]">
              XDCID subdomains
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              Identity infrastructure for teams
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
              Create paid, wallet-owned identities beneath an active XDCID. The parent owner or an approved operator controls registration, while each subdomain can belong to a different wallet.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-[#0b6670]" href="/">
                Manage parent names
              </Link>
              <Link className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50" href="/developers">
                Read integration docs
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Built-in safeguards</p>
            <ul className="mt-4 space-y-4">
              {capabilities.map((capability) => (
                <li className="flex gap-3 text-sm leading-6 text-slate-700" key={capability}>
                  <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#0b6670]" />
                  {capability}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <div className="mt-8">
        <SubdomainRegistration />
      </div>
    </main>
  );
}
