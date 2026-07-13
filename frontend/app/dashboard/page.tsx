"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { addresses, registrarAbi, registryAbi } from "../../config/contracts";
import { loadNames } from "../../config/localNames";

function NameRow({ name }: { name: string }) {
  const { address } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  const node = useReadContract({
    address: addresses.registrar,
    abi: registrarAbi,
    functionName: "nodeFor",
    args: [name]
  });

  const owner = useReadContract({
    address: addresses.registry,
    abi: registryAbi,
    functionName: "ownerOf",
    args: node.data ? [node.data] : undefined,
    query: { enabled: !!node.data }
  });

  const expiry = useReadContract({
    address: addresses.registry,
    abi: registryAbi,
    functionName: "expiryOf",
    args: node.data ? [node.data] : undefined,
    query: { enabled: !!node.data }
  });

  const price = useReadContract({
    address: addresses.registrar,
    abi: registrarAbi,
    functionName: "price",
    args: [name]
  });

  const owned = !!address && !!owner.data && owner.data.toLowerCase() === address.toLowerCase();
  if (!owned) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 bg-white p-4 shadow-sm">
      <div>
        <Link className="text-lg font-semibold text-slate-950 hover:text-teal-700" href={`/name/${name}`}>
          {name}
        </Link>
        <p className="text-sm text-neutral-600">
          Expires: {expiry.data ? new Date(Number(expiry.data) * 1000).toLocaleDateString() : "Loading"}
          {price.data ? ` - renew ${formatEther(price.data)} XDC/year` : ""}
        </p>
      </div>
      <button
        className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        disabled={!price.data || isPending}
        onClick={() =>
          price.data &&
          writeContract({
            address: addresses.registrar,
            abi: registrarAbi,
            functionName: "renew",
            args: [name, 1n],
            value: price.data
          })
        }
      >
        Renew
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    setNames(loadNames(address));
  }, [address]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Wallet inventory</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Dashboard</h1>
        <p className="mt-2 text-sm text-neutral-600">Names claimed from this browser and verified against your wallet.</p>
      </section>
      <div className="mt-6 grid gap-3">
        {!isConnected && <p className="rounded-md border border-black/10 bg-white p-5 text-sm shadow-sm">Connect your wallet.</p>}
        {isConnected && names.length === 0 && <p className="rounded-md border border-black/10 bg-white p-5 text-sm shadow-sm">No local names yet.</p>}
        {names.map((name) => (
          <NameRow key={name} name={name} />
        ))}
      </div>
    </main>
  );
}
