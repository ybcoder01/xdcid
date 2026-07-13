"use client";

import { useMemo, useState } from "react";
import { isAddress, parseEther, zeroAddress } from "viem";
import { useAccount, useReadContract, useSendTransaction } from "wagmi";
import { addresses, contractsConfigured, registrarAbi, registryAbi, resolverAbi } from "../../config/contracts";

function normalizeName(value: string) {
  const label = value.trim().toLowerCase().replace(/\.xdc$/i, "");
  return { label, name: `${label}.xdc` };
}

export default function SendPage() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const { isConnected } = useAccount();
  const { sendTransaction, isPending, data: hash, error } = useSendTransaction();

  const { label, name } = useMemo(() => normalizeName(recipient), [recipient]);
  const enabled = contractsConfigured && label.length >= 3;

  const value = useMemo(() => {
    try {
      return amount ? parseEther(amount) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  const node = useReadContract({
    address: addresses.registrar,
    abi: registrarAbi,
    functionName: "nodeFor",
    args: [name],
    query: { enabled }
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

  const resolvedAddress = useReadContract({
    address: addresses.resolver,
    abi: resolverAbi,
    functionName: "addresses",
    args: node.data ? [node.data] : undefined,
    query: { enabled: !!node.data }
  });

  const expired = expiry.data ? expiry.data < BigInt(Math.floor(Date.now() / 1000)) : true;
  const hasOwner = !!owner.data && owner.data !== zeroAddress && !expired;
  const paymentAddress =
    resolvedAddress.data && resolvedAddress.data !== zeroAddress && isAddress(resolvedAddress.data)
      ? resolvedAddress.data
      : undefined;
  const canSend = isConnected && hasOwner && !!paymentAddress && value > 0n && !isPending;

  function send() {
    if (!paymentAddress || value <= 0n) return;
    sendTransaction({ to: paymentAddress, value });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">XDCID payments</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 md:text-4xl">Send to a .XDC name</h1>
          <p className="mt-2 text-sm text-neutral-600">Resolve a name to its current payment address and send XDC on mainnet.</p>

          <div className="mt-8 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-slate-950">Recipient</span>
              <div className="flex gap-2 rounded-md border border-black/10 bg-slate-950 p-2">
                <input
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-white px-4 py-4 text-lg"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="name or name.xdc"
                />
                <span className="grid min-w-20 place-items-center rounded-md bg-teal-500 px-4 py-4 text-sm font-semibold text-slate-950">
                  .XDC
                </span>
              </div>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-slate-950">Amount</span>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-4 py-4 text-lg"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                />
                <span className="grid min-w-20 place-items-center rounded-md border border-black/10 bg-neutral-50 px-4 py-4 text-sm font-semibold text-neutral-600">
                  XDC
                </span>
              </div>
            </label>
          </div>
        </div>

        <aside className="rounded-md border border-black/10 bg-white/90 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Resolution</p>
          {label.length > 0 ? (
            <div className="mt-5">
              <p className="text-2xl font-semibold text-slate-950">{name}</p>
              <p className="mt-3 break-all text-sm text-neutral-600">
                {!contractsConfigured
                  ? "Contracts not configured"
                  : label.length < 3
                    ? "Name must be at least 3 characters"
                    : node.isLoading || owner.isLoading || expiry.isLoading || resolvedAddress.isLoading
                      ? "Resolving..."
                      : node.isError || owner.isError || expiry.isError || resolvedAddress.isError
                        ? "Could not resolve name"
                        : !hasOwner
                          ? "Name is unregistered or expired"
                          : paymentAddress
                            ? paymentAddress
                            : "No payment address set"}
              </p>
              {hasOwner && expiry.data ? (
                <p className="mt-2 text-xs text-neutral-500">Expires: {new Date(Number(expiry.data) * 1000).toLocaleDateString()}</p>
              ) : null}
              <button
                className="mt-5 w-full rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                disabled={!canSend}
                onClick={send}
              >
                Send XDC
              </button>
              {hash ? <p className="mt-3 break-all text-xs text-neutral-500">Transaction sent: {hash}</p> : null}
              {error ? <p className="mt-3 text-xs text-red-600">{error.message}</p> : null}
            </div>
          ) : (
            <p className="mt-5 text-sm text-neutral-600">Enter a recipient name to preview its payment address.</p>
          )}
        </aside>
      </section>
    </main>
  );
}
