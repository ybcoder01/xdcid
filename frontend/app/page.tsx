"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatEther } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { addresses, contractsConfigured, registrarAbi } from "../config/contracts";
import { saveName } from "../config/localNames";

export default function Home() {
  const [label, setLabel] = useState("");
  const { address, isConnected } = useAccount();
  const { writeContract, isPending, data: hash } = useWriteContract();

  const name = useMemo(() => `${label.trim().toLowerCase()}.xdc`, [label]);
  const enabled = label.trim().length >= 3;
  const canReadContracts = enabled && contractsConfigured;

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
    query: { enabled: canReadContracts }
  });

  function claim() {
    if (!contractsConfigured || !address || !price.data) return;
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
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">XDC mainnet identity</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight text-slate-950 md:text-5xl">Claim your .XDC name</h1>
            <p className="mt-3 text-base text-neutral-600">
              Search, register, and manage XDCID names with wallet-native ownership and resolver records.
            </p>
          </div>

          <div className="mt-8 flex max-w-2xl gap-2 rounded-md border border-black/10 bg-slate-950 p-2 shadow-sm">
            <input
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-white px-4 py-4 text-lg"
              value={label}
              onChange={(event) => setLabel(event.target.value.replace(/\.xdc$/i, ""))}
              placeholder="yourname"
            />
            <span className="grid min-w-20 place-items-center rounded-md bg-teal-500 px-4 py-4 text-sm font-semibold text-slate-950">
              .XDC
            </span>
          </div>

          <div className="mt-5 grid gap-3 text-sm text-neutral-600 sm:grid-cols-3">
            <div className="rounded-md border border-black/10 bg-neutral-50 p-3">
              <p className="font-semibold text-slate-950">3 chars</p>
              <p>500 XDC/year</p>
            </div>
            <div className="rounded-md border border-black/10 bg-neutral-50 p-3">
              <p className="font-semibold text-slate-950">4 chars</p>
              <p>100 XDC/year</p>
            </div>
            <div className="rounded-md border border-black/10 bg-neutral-50 p-3">
              <p className="font-semibold text-slate-950">5+ chars</p>
              <p>10 XDC/year</p>
            </div>
          </div>

          {enabled && (
            <div className="mt-6 rounded-md border border-black/10 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-950">{name}</p>
                  <p className="text-sm text-neutral-600">
                    {!contractsConfigured
                      ? "Contracts not configured"
                      : availability.isLoading
                        ? "Checking..."
                        : availability.isError || price.isError
                          ? "Could not check availability"
                          : availability.data === true
                            ? "Available to claim"
                            : availability.data === false
                              ? "Already registered"
                              : "Enter a valid name"}
                    {price.data ? ` - ${formatEther(price.data)} XDC/year` : ""}
                  </p>
                </div>
                {availability.data === true ? (
                  <button
                    className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                    disabled={!contractsConfigured || !isConnected || isPending}
                    onClick={claim}
                  >
                    Claim
                  </button>
                ) : availability.data === false ? (
                  <Link className="rounded-md border border-black/10 px-5 py-3 text-sm font-semibold hover:bg-neutral-50" href={`/name/${name}`}>
                    View
                  </Link>
                ) : (
                  <button className="rounded-md border border-black/10 px-5 py-3 text-sm text-neutral-400" disabled>
                    Claim
                  </button>
                )}
              </div>
              {hash && <p className="mt-3 break-all text-xs text-neutral-500">Transaction sent: {hash}</p>}
            </div>
          )}
        </div>

        <aside className="rounded-md border border-black/10 bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Live protocol</p>
          <div className="mt-8 grid gap-5">
            <div>
              <p className="text-3xl font-semibold">.XDC</p>
              <p className="mt-1 text-sm text-slate-300">Readable names for wallets, profiles, and payments.</p>
            </div>
            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-slate-300">Network</span>
                <span>XDC mainnet</span>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-slate-300">Default address</span>
                <span>Owner wallet</span>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-slate-300">Records</span>
                <span>Profile + resolver</span>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
