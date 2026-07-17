"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { isAddress, zeroAddress } from "viem";
import { useAccount, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { addresses, registrarAbi, registryAbi, resolverAbi, reverseResolverAbi } from "../../../config/contracts";
import { parseXnsName } from "../../../lib/names";

const textKeys = ["avatar", "website", "twitter", "telegram", "bio"] as const;

export default function NamePage() {
  const params = useParams<{ name: string }>();
  const parsedName = useMemo(() => parseXnsName(decodeURIComponent(params.name)), [params.name]);
  const { name, isValid, error: validationError } = parsedName;
  const { address } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const [addr, setAddr] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [records, setRecords] = useState<Record<string, string>>({});

  const node = useReadContract({
    address: addresses.registrar,
    abi: registrarAbi,
    functionName: "nodeFor",
    args: [name],
    query: { enabled: isValid }
  });

  const owner = useReadContract({
    address: addresses.registry,
    abi: registryAbi,
    functionName: "ownerOf",
    args: node.data ? [node.data] : undefined,
    query: { enabled: isValid && !!node.data }
  });

  const resolvedAddress = useReadContract({
    address: addresses.resolver,
    abi: resolverAbi,
    functionName: "addresses",
    args: node.data ? [node.data] : undefined,
    query: { enabled: isValid && !!node.data }
  });

  const primaryName = useReadContract({
    address: addresses.reverseResolver,
    abi: reverseResolverAbi,
    functionName: "primaryNames",
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

  const textReads = useReadContracts({
    contracts: node.data
      ? textKeys.map((key) => ({
          address: addresses.resolver,
          abi: resolverAbi,
          functionName: "text",
          args: [node.data, key]
        }))
      : [],
    query: { enabled: isValid && !!node.data }
  });

  const isOwner = useMemo(
    () => !!address && !!owner.data && owner.data.toLowerCase() === address.toLowerCase(),
    [address, owner.data]
  );

  function saveAddress() {
    if (!node.data || !isAddress(addr)) return;
    writeContract({
      address: addresses.resolver,
      abi: resolverAbi,
      functionName: "setAddress",
      args: [node.data, addr]
    });
  }

  function saveText(key: string) {
    if (!node.data) return;
    writeContract({
      address: addresses.resolver,
      abi: resolverAbi,
      functionName: "setText",
      args: [node.data, key, records[key] || ""]
    });
  }

  function setPrimaryName() {
    if (!node.data) return;
    writeContract({
      address: addresses.reverseResolver,
      abi: reverseResolverAbi,
      functionName: "setPrimaryName",
      args: [name, node.data]
    });
  }

  function transferName() {
    if (!node.data || !isAddress(newOwner)) return;
    writeContract({
      address: addresses.registry,
      abi: registryAbi,
      functionName: "transferName",
      args: [node.data, newOwner]
    });
  }

  if (!isValid) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-md border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Invalid XDCID name</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">This name cannot be resolved</h1>
          <p className="mt-2 text-sm text-neutral-600">{validationError}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="rounded-md border border-black/10 bg-slate-950 p-6 text-white shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">XDCID profile</p>
        <h1 className="mt-3 text-4xl font-semibold">{name}</h1>
        <p className="mt-4 break-all text-sm text-slate-300">
          Owner: {owner.data && owner.data !== zeroAddress ? owner.data : "Unregistered or expired"}
        </p>
        <p className="mt-1 break-all text-sm text-slate-300">Address: {resolvedAddress.data || "Not set"}</p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {textKeys.map((key, index) => (
          <div className="rounded-md border border-black/10 bg-white p-4 shadow-sm" key={key}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">{key}</p>
            <p className="mt-1 text-sm text-neutral-600">{textReads.data?.[index]?.result || "Not set"}</p>
          </div>
        ))}
      </div>

      {isOwner && (
        <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Edit records</h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 bg-neutral-50 p-3">
            <p className="text-sm text-neutral-600">Primary name: {primaryName.data || "Not set"}</p>
            <button className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={isPending} onClick={setPrimaryName}>
              Set primary
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <input className="min-w-0 flex-1 rounded-md border border-black/10 px-3 py-2" value={addr} onChange={(event) => setAddr(event.target.value)} placeholder="0x address" />
            <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50" disabled={isPending} onClick={saveAddress}>
              Save
            </button>
          </div>
          <div className="mt-4 rounded-md border border-black/10 bg-neutral-50 p-3">
            <p className="text-sm font-semibold text-slate-950">Transfer ownership</p>
            <p className="mt-1 text-xs text-neutral-600">Move this .XDC name to another wallet after an off-chain sale or agreement.</p>
            <div className="mt-3 flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-3 py-2"
                value={newOwner}
                onChange={(event) => setNewOwner(event.target.value)}
                placeholder="New owner 0x address"
              />
              <button
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                disabled={isPending || !isAddress(newOwner)}
                onClick={transferName}
              >
                Transfer
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {textKeys.map((key) => (
              <div className="flex gap-2" key={key}>
                <input
                  className="min-w-0 flex-1 rounded-md border border-black/10 px-3 py-2"
                  value={records[key] || ""}
                  onChange={(event) => setRecords((current) => ({ ...current, [key]: event.target.value }))}
                  placeholder={key}
                />
                <button className="rounded-md border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={isPending} onClick={() => saveText(key)}>
                  Save
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
