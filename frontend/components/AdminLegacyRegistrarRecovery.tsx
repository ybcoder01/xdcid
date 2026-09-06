"use client";

import { useEffect, useState } from "react";
import { formatEther, isAddress } from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  addresses,
  legacyRegistrarAddress,
  registrarAbi,
  zeroAddress,
} from "../config/contracts";

export function AdminLegacyRegistrarRecovery() {
  const { address: account } = useAccount();
  const [recipient, setRecipient] = useState("");
  const configured =
    isAddress(legacyRegistrarAddress) &&
    legacyRegistrarAddress !== zeroAddress &&
    legacyRegistrarAddress.toLowerCase() !== addresses.registrar.toLowerCase();

  const owner = useReadContract({
    address: legacyRegistrarAddress,
    abi: registrarAbi,
    functionName: "owner",
    query: { enabled: configured },
  });
  const balance = useBalance({
    address: legacyRegistrarAddress,
    query: { enabled: configured },
  });
  const refetchBalance = balance.refetch;
  const withdrawal = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: withdrawal.data });

  const contractBalance = balance.data?.value;
  const isLegacyOwner =
    !!account &&
    !!owner.data &&
    owner.data.toLowerCase() === account.toLowerCase();
  const canWithdraw =
    isLegacyOwner &&
    isAddress(recipient) &&
    !!contractBalance &&
    contractBalance > 0n &&
    !withdrawal.isPending &&
    !receipt.isLoading;

  useEffect(() => {
    setRecipient(account || "");
  }, [account]);

  useEffect(() => {
    if (receipt.isSuccess) void refetchBalance();
  }, [receipt.isSuccess, refetchBalance]);

  if (
    !configured ||
    owner.isLoading ||
    balance.isLoading ||
    owner.error ||
    balance.error ||
    !isLegacyOwner ||
    !contractBalance ||
    contractBalance === 0n
  ) {
    return null;
  }

  function withdrawLegacyBalance() {
    if (!canWithdraw) return;
    withdrawal.writeContract({
      address: legacyRegistrarAddress,
      abi: registrarAbi,
      functionName: "withdraw",
      args: [recipient as `0x${string}`],
    });
  }

  const error = withdrawal.error?.message || receipt.error?.message || "";

  return (
    <section className="mt-8 rounded-md border border-amber-300 bg-amber-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
        Legacy registrar recovery
      </p>
      <p className="mt-2 text-sm text-amber-950">
        This is a historical contract balance. Current registration and platform
        revenue already goes directly to the treasury wallet.
      </p>
      <p className="mt-4 text-3xl font-semibold text-slate-950">
        {formatEther(contractBalance)} XDC
      </p>
      <p className="mt-2 break-all text-xs text-neutral-600">
        {legacyRegistrarAddress}
      </p>

      <label className="mt-5 grid gap-2 text-sm">
        <span className="font-semibold text-slate-950">Recovery recipient</span>
        <input
          className="rounded-md border border-black/10 bg-white px-3 py-3"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="0x recipient address"
        />
      </label>

      <button
        type="button"
        className="mt-4 rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        disabled={!canWithdraw}
        onClick={withdrawLegacyBalance}
      >
        {withdrawal.isPending
          ? "Confirm in wallet…"
          : receipt.isLoading
            ? "Recovering…"
            : "Recover legacy balance"}
      </button>

      {withdrawal.data ? (
        <p className="mt-3 break-all text-xs text-neutral-600">
          Transaction sent: {withdrawal.data}
        </p>
      ) : null}
      {receipt.isSuccess ? (
        <p className="mt-3 text-xs text-teal-700">Recovery confirmed.</p>
      ) : null}
      {error ? (
        <p className="mt-3 break-words text-xs text-red-600">{error}</p>
      ) : null}
    </section>
  );
}
