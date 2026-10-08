"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { keccak256, stringToHex } from "viem";
import { SubdomainAddressManager } from "../../../components/SubdomainAddressManager";
import { parseXnsName } from "../../../lib/names";

function ManageSubdomainContent() {
  const searchParams = useSearchParams();
  const parent = useMemo(
    () => parseXnsName(searchParams.get("parent") || ""),
    [searchParams],
  );
  const label = (searchParams.get("label") || "").trim().toLowerCase();
  const labelValid =
    /^[a-z0-9-]+$/.test(label) &&
    !label.startsWith("-") &&
    !label.endsWith("-");
  const name = parent.isValid && labelValid ? `${label}.${parent.name}` : "";
  const node = name ? keccak256(stringToHex(name)) : undefined;

  if (!node) {
    return (
      <main className="xdc-product-page mx-auto max-w-4xl px-4 py-10">
        <section className="rounded-md border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">
            Invalid subdomain
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Open this page from a subdomain listed in your dashboard.
          </p>
          <Link className="mt-4 inline-block font-semibold text-teal-700" href="/dashboard">
            Return to dashboard
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="xdc-product-page mx-auto max-w-5xl px-4 py-10">
      <section className="mb-6 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
          Subdomain
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">{name}</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Manage receiving addresses and ownership for this child identity.
        </p>
        <Link className="mt-4 inline-block font-semibold text-teal-700" href="/dashboard">
          Back to dashboard
        </Link>
      </section>
      <SubdomainAddressManager
        label={label}
        name={name}
        node={node}
        parentName={parent.name}
      />
    </main>
  );
}

export default function ManageSubdomainPage() {
  return (
    <Suspense fallback={<main className="p-8">Loading subdomain controls…</main>}>
      <ManageSubdomainContent />
    </Suspense>
  );
}
