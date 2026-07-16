"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import { formatEther, isAddress } from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract
} from "wagmi";
import { addresses, registrarAbi } from "../../config/contracts";

export default function AdminPage() {
  const { address: account, isConnected } = useAccount();
  const [recipient, setRecipient] = useState("");

  const owner = useReadContract({
    address: addresses.registrar,
    abi: registrarAbi,
    functionName: "owner"
  });
  const balance = useBalance({ address: addresses.registrar });
  const withdrawal = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: withdrawal.data });

  const ownerAddress = owner.data || "";
  const contractBalance = balance.data?.value;
  const isOwner = useMemo(
    () =>
      !!account &&
      !!ownerAddress &&
      ownerAddress.toLowerCase() === account.toLowerCase(),
    [account, ownerAddress]
  );
  const canWithdraw =
    isOwner &&
    isAddress(recipient) &&
    !!contractBalance &&
    contractBalance > 0n &&
    !withdrawal.isPending &&
    !receipt.isLoading;
  const loading = owner.isLoading || balance.isLoading;
  const error =
    owner.error?.message ||
    balance.error?.message ||
    withdrawal.error?.message ||
    receipt.error?.message ||
    "";

  useEffect(() => {
    setRecipient(account || "");
  }, [account]);

  useEffect(() => {
    if (receipt.isSuccess) void balance.refetch();
  }, [balance, receipt.isSuccess]);

  function withdraw() {
    if (!canWithdraw) return;

    withdrawal.writeContract({
      address: addresses.registrar,
      abi: registrarAbi,
      functionName: "withdraw",
      args: [recipient as `0x${string}`]
    });
  }

  if (!isOwner) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Owner only</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 md:text-4xl">Owner access required</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {!isConnected
              ? "Connect the registrar owner wallet to view withdrawal controls."
              : loading
                ? "Checking registrar ownership..."
                : "The connected wallet is not the registrar owner."}
          </p>

          <div className="mt-8">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
          </div>

          {isConnected &&
          account &&
          ownerAddress &&
          account.toLowerCase() !== ownerAddress.toLowerCase() ? (
            <p className="mt-4 text-xs text-red-600">Connected wallet is not the registrar owner.</p>
          ) : null}
          {error ? <p className="mt-4 break-words text-xs text-red-600">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Owner controls</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 md:text-4xl">Admin dashboard</h1>
          <p className="mt-2 text-sm text-neutral-600">Withdraw XDC registration and renewal revenue held by the registrar contract.</p>

          <div className="mt-8 grid gap-4">
            <div className="rounded-md border border-black/10 bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Registrar balance</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {contractBalance !== undefined
                  ? `${formatEther(contractBalance)} XDC`
                  : loading
                    ? "Loading..."
                    : "Unavailable"}
              </p>
              <p className="mt-2 break-all text-xs text-neutral-500">{addresses.registrar}</p>
            </div>

            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-slate-950">Withdraw to</span>
              <input
                className="rounded-md border border-black/10 bg-white px-3 py-3"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="0x recipient address"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
              <button
                className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                disabled={!canWithdraw}
                onClick={withdraw}
              >
                {withdrawal.isPending
                  ? "Confirm in wallet..."
                  : receipt.isLoading
                    ? "Withdrawing..."
                    : "Withdraw all funds"}
              </button>
            </div>

            {withdrawal.data ? (
              <p className="break-all text-xs text-neutral-500">Transaction sent: {withdrawal.data}</p>
            ) : null}
            {receipt.isSuccess ? <p className="text-xs text-teal-700">Withdrawal confirmed.</p> : null}
            {error ? <p className="break-words text-xs text-red-600">{error}</p> : null}
          </div>
        </div>

        <aside className="rounded-md border border-black/10 bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Access check</p>
          <div className="mt-6 grid gap-4 text-sm">
            <div>
              <p className="text-slate-300">Connected wallet</p>
              <p className="mt-1 break-all">{account || "Not connected"}</p>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-slate-300">Registrar owner</p>
              <p className="mt-1 break-all">{ownerAddress || (loading ? "Loading..." : "Unavailable")}</p>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-slate-300">Status</p>
              <p className="mt-1">Owner wallet connected</p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
