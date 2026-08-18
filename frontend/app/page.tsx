"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatEther } from "viem";
import { SignedRegistrationControls } from "../components/SignedRegistrationControls";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { addresses, contractsConfigured, registrarAbi, signedRegistrarEnabled } from "../config/contracts";
import { saveName } from "../config/localNames";
import { parseXnsName } from "../lib/names";
import { useRegistryStatus } from "../lib/useRegistryStatus";

const networks = [
  {
    name: "XDC",
    logoClass: "bg-[#eef9fa]",
    logo: (
      <img
        alt=""
        aria-hidden="true"
        className="h-6 w-6 object-contain"
        height="24"
        src="https://xinfin.org/assets/images/brand-assets/primary-icon.svg"
        width="24"
      />
    )
  },
  {
    name: "Ethereum",
    logoClass: "bg-[#eef0ff]",
    logo: (
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-6 w-6">
        <path d="M16 2.5 8.2 15.7 16 20.3l7.8-4.6L16 2.5Z" fill="#627eea" />
        <path d="m16 29.5-7.8-11L16 23l7.8-4.5-7.8 11Z" fill="#454a75" />
        <path d="M16 20.3v-8.4l7.8 3.8-7.8 4.6Z" fill="#454a75" opacity=".72" />
      </svg>
    )
  },
  {
    name: "Base",
    logoClass: "bg-[#eef4ff]",
    logo: (
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-6 w-6">
        <circle cx="16" cy="16" r="13" fill="#0052ff" />
        <path d="M15.7 8.3a7.7 7.7 0 1 1-7.4 9.8h10.8v-4.2H8.3a7.7 7.7 0 0 1 7.4-5.6Z" fill="white" />
      </svg>
    )
  },
  {
    name: "Arbitrum",
    logoClass: "bg-[#eef7ff]",
    logo: (
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-6 w-6">
        <path d="m16 2.7 11.5 6.6v13.4L16 29.3 4.5 22.7V9.3L16 2.7Z" fill="#213147" />
        <path d="m13 23.7 2.9 1.7 7.5-12.7-2.9-1.7L13 23.7Z" fill="#28a0f0" />
        <path d="m8.5 21.1 2.9 1.7 7.5-12.7L16 8.4 8.5 21.1Z" fill="#96bedc" />
        <path d="m18.3 23.5 2.8-1.6-3.4-5.8-1.7 2.8 2.3 4.6Z" fill="#fff" />
      </svg>
    )
  },
  {
    name: "Polygon",
    logoClass: "bg-[#f5efff]",
    logo: (
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-6 w-6">
        <path d="M21.6 10.2a3.4 3.4 0 0 1 3.4 0l3.1 1.8a3.4 3.4 0 0 1 0 5.9L25 19.7a3.4 3.4 0 0 1-3.4 0l-3.1-1.8a3.4 3.4 0 0 1-1.7-2.9v-1.2l3 1.7a.6.6 0 0 0 .6 0l2.8-1.6a.6.6 0 0 0 0-1l-1.6-.9a.6.6 0 0 0-.6 0l-2.7 1.6-3-1.7 6.3-3.7Zm-11.2 2.1a3.4 3.4 0 0 1 3.4 0l3.1 1.8a3.4 3.4 0 0 1 1.7 2.9v1.2l-3-1.7a.6.6 0 0 0-.6 0l-2.8 1.6a.6.6 0 0 0 0 1l1.6.9a.6.6 0 0 0 .6 0l2.7-1.6 3 1.7-6.3 3.7a3.4 3.4 0 0 1-3.4 0L7.3 22a3.4 3.4 0 0 1 0-5.9l3.1-1.8Z" fill="#8247e5" />
      </svg>
    )
  }
];

const capabilities = [
  { name: "Profile", symbol: "ID", color: "text-[#0b6670] bg-[#d9f2f0]" },
  { name: "Payments", symbol: "$", color: "text-[#c95742] bg-[#ffe8e1]" },
  { name: "Pay Links", symbol: "↗", color: "text-[#0b6670] bg-[#dff6fb]" },
  { name: "API", symbol: "</>", color: "text-[#c95742] bg-[#fff0ea]" }
];

export default function Home() {
  const [input, setInput] = useState("");
  const { address, isConnected } = useAccount();
  const { writeContract, isPending, data: hash } = useWriteContract();

  const parsedName = useMemo(() => parseXnsName(input), [input]);
  const { name, isValid, error: validationError } = parsedName;
  const hasInput = input.trim().length > 0;
  const canReadContracts = isValid && contractsConfigured;
  const availability = useReadContract({
    address: addresses.registrar,
    abi: registrarAbi,
    functionName: "available",
    args: [name],
    query: { enabled: canReadContracts }
  });

  const price = useReadContract({
    address: addresses.registrar,
    abi: registrarAbi,
    functionName: "price",
    args: [name],
    query: { enabled: canReadContracts && !signedRegistrarEnabled }
  });

  const registry = useRegistryStatus(
    name,
    typeof availability.data === "boolean" ? !availability.data : undefined,
    canReadContracts
  );
  const registrationAllowed =
    availability.data === true && registry.status?.registrationAllowed === true;

  function claim() {
    if (signedRegistrarEnabled || !isValid || !contractsConfigured || !address || !price.data || !registrationAllowed) return;
    writeContract(
      {
        address: addresses.registrar,
        abi: registrarAbi,
        functionName: "register",
        args: [name, address, 1n],
        value: price.data
      },
      {
        onSuccess: () => saveName(address, name)
      }
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 md:py-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[#f8fbfc] px-6 py-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)] md:px-10 md:py-14">
        <div aria-hidden="true" className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[#9ff3ff]/35 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-[#ffbfab]/25 blur-3xl" />

        <div className="relative grid items-center gap-12 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#0b6670]">One name. Many connections.</p>
            <h1 className="mt-5 text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-[#131619] sm:text-6xl lg:text-7xl">
              Your identity across every network
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">
              One XDCID connects your profile, payments, applications, and receiving addresses across the networks you use.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a className="rounded-xl bg-[#0b6670] px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#084f57]" href="#register">
                Claim your name
              </a>
              <Link className="rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 hover:border-slate-400 hover:bg-slate-50" href="/dashboard">
                Go to dashboard
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-600">
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#0b6670]" />User owned</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#ff735d]" />Secure by design</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#65d4e1]" />Developer friendly</span>
            </div>
          </div>

          <div className="relative rounded-[1.75rem] border border-slate-200/80 bg-white/75 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.09)] backdrop-blur md:p-7">
            <div className="grid gap-5 md:grid-cols-[1fr_0.95fr]">
              <div className="relative flex min-h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div aria-hidden="true" className="absolute right-[-1.3rem] top-1/2 hidden h-px w-6 bg-[#65d4e1] md:block" />
                <div className="text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#0b6670] to-[#19a6a6] text-2xl font-semibold text-white shadow-lg shadow-teal-900/15">
                    ID
                  </div>
                  <p className="mt-5 text-3xl font-semibold tracking-tight text-[#131619]">alice.xdc</p>
                  <span className="mt-3 inline-flex rounded-full bg-[#dff6fb] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#0b6670]">
                    XDCID
                  </span>
                </div>
              </div>

              <div className="grid gap-2.5">
                {networks.map((network) => (
                  <div key={network.name} className="relative flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <span aria-hidden="true" className="absolute -left-5 top-1/2 hidden h-px w-5 bg-[#65d4e1] md:block" />
                    <span className={"grid h-9 w-9 shrink-0 place-items-center rounded-full " + network.logoClass}>{network.logo}</span>
                    <span className="font-medium text-slate-800">{network.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {capabilities.map((capability) => (
                <div key={capability.name} className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                  <span className={"mx-auto grid h-9 w-9 place-items-center rounded-lg text-xs font-bold " + capability.color}>{capability.symbol}</span>
                  <p className="mt-2 text-xs font-semibold text-slate-700">{capability.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_340px]" id="register">
        <div className="rounded-2xl border border-black/10 bg-white/95 p-6 shadow-sm md:p-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0b6670]">XDC mainnet identity</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-slate-950 md:text-4xl">Claim your .XDC name</h2>
            <p className="mt-3 text-base text-neutral-600">
              Search, register, and manage XDCID names with wallet-native ownership and resolver records.
            </p>
          </div>

          <div className="mt-8 flex max-w-2xl gap-2 rounded-xl border border-black/10 bg-slate-950 p-2 shadow-sm">
            <input
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white px-4 py-4 text-lg"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="yourname"
              aria-invalid={hasInput && !isValid}
            />
            <span className="grid min-w-20 place-items-center rounded-lg bg-[#65d4e1] px-4 py-4 text-sm font-semibold text-slate-950">
              .XDC
            </span>
          </div>

          <p className={"mt-2 text-sm " + (hasInput && !isValid ? "text-red-600" : "text-neutral-500")}>
            {hasInput && !isValid
              ? validationError
              : "Use 3-63 letters, numbers, or hyphens; a hyphen cannot be first or last."}
          </p>

          <div className="mt-5 grid gap-3 text-sm text-neutral-600 sm:grid-cols-3">
            <div className="rounded-xl border border-black/10 bg-neutral-50 p-3"><p className="font-semibold text-slate-950">3 chars</p><p>{signedRegistrarEnabled ? "$20/year" : "500 XDC/year"}</p></div>
            <div className="rounded-xl border border-black/10 bg-neutral-50 p-3"><p className="font-semibold text-slate-950">4 chars</p><p>{signedRegistrarEnabled ? "$10/year" : "100 XDC/year"}</p></div>
            <div className="rounded-xl border border-black/10 bg-neutral-50 p-3"><p className="font-semibold text-slate-950">5+ chars</p><p>{signedRegistrarEnabled ? "$5/year" : "10 XDC/year"}</p></div>
          </div>

          {hasInput && (
            <div className="mt-6 rounded-xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-950">{isValid ? name : input.trim()}</p>
                  <p className="text-sm text-neutral-600">
                    {!isValid
                      ? validationError
                      : !contractsConfigured
                        ? "Contracts not configured"
                        : availability.isLoading || (!signedRegistrarEnabled && price.isLoading) || registry.isChecking
                          ? "Checking both registries..."
                          : availability.isError || (!signedRegistrarEnabled && price.isError) || registry.isError
                            ? "Could not check registry status"
                            : registry.status?.state === "legacy"
                              ? "Reserved in XDCDomains; migration required"
                              : registry.status?.state === "collision"
                                ? "Registered in both registries; review required"
                                : registrationAllowed
                                  ? "Available to claim"
                                  : registry.status?.state === "xdcid"
                                    ? "Already registered with XDCID"
                                    : "Unavailable"}
                    {!signedRegistrarEnabled && price.data ? " - " + formatEther(price.data) + " XDC/year" : ""}
                  </p>
                </div>
                {isValid && registrationAllowed ? (
                  signedRegistrarEnabled ? (
                    <SignedRegistrationControls name={name} enabled={contractsConfigured && isConnected} />
                  ) : (
                    <button
                      className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-[#0b6670] disabled:opacity-50"
                      disabled={!contractsConfigured || !isConnected || isPending}
                      onClick={claim}
                    >
                      Claim
                    </button>
                  )
                ) : isValid && registry.status?.state === "xdcid" ? (
                  <Link className="rounded-xl border border-black/10 px-5 py-3 text-sm font-semibold hover:bg-neutral-50" href={"/name/" + name}>View</Link>
                ) : (
                  <button className="rounded-xl border border-black/10 px-5 py-3 text-sm text-neutral-400" disabled>
                    {registry.status?.state === "legacy" ? "Reserved" : registry.status?.state === "collision" ? "Review required" : "Claim"}
                  </button>
                )}
              </div>
              {hash && <p className="mt-3 break-all text-xs text-neutral-500">Transaction sent: {hash}</p>}
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-black/10 bg-[#131619] p-6 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9ff3ff]">Connected identity</p>
          <div className="mt-8 grid gap-5">
            <div>
              <p className="text-3xl font-semibold">One .XDC</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">A readable identity for wallets, profiles, payments, applications, and multichain records.</p>
            </div>
            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between border-t border-white/10 pt-3"><span className="text-slate-400">Ownership</span><span>Your wallet</span></div>
              <div className="flex items-center justify-between border-t border-white/10 pt-3"><span className="text-slate-400">Home network</span><span>XDC mainnet</span></div>
              <div className="flex items-center justify-between border-t border-white/10 pt-3"><span className="text-slate-400">Connections</span><span>5 EVM networks</span></div>
              <div className="flex items-center justify-between border-t border-white/10 pt-3"><span className="text-slate-400">Utilities</span><span>Profile + payments</span></div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
