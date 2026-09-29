"use client";

import { useEffect, useRef } from "react";
import type { Hex } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import {
  activeRegistryAddress,
  activeXnsChainId,
  registryAbi
} from "../config/contracts";
import { walletActionErrorMessage } from "../lib/walletErrors";

type RegistryV2MigrationActionProps = {
  migrationRequired: boolean;
  name: string;
  node: Hex;
  onMigrated?: () => void | Promise<void>;
};

export function RegistryV2MigrationAction({
  migrationRequired,
  name,
  node,
  onMigrated
}: RegistryV2MigrationActionProps) {
  const handledHash = useRef<Hex | undefined>(undefined);
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({
    chainId: activeXnsChainId,
    hash: write.data
  });

  useEffect(() => {
    if (!receipt.isSuccess || !write.data || handledHash.current === write.data) {
      return;
    }

    handledHash.current = write.data;
    void onMigrated?.();
  }, [onMigrated, receipt.isSuccess, write.data]);

  if (!migrationRequired) return null;

  const error = write.error || receipt.error;
  const busy = write.isPending || receipt.isLoading;

  return (
    <div className="w-full rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <p className="text-sm font-semibold">Activate {name} on Registry V2</p>
      <p className="mt-1 text-xs leading-5">
        This existing ID needs a one-time ownership migration before primary,
        profile, and multichain records can be changed. Only network gas is
        required; ownership and expiration do not change.
      </p>
      <button
        className="mt-3 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={busy}
        onClick={() => {
          write.reset();
          write.writeContract({
            chainId: activeXnsChainId,
            address: activeRegistryAddress,
            abi: registryAbi,
            functionName: "migrateName",
            args: [node]
          });
        }}
        type="button"
      >
        {write.isPending
          ? "Confirm in wallet"
          : receipt.isLoading
            ? "Activating…"
            : "Activate on Registry V2"}
      </button>
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {walletActionErrorMessage(error, "Unable to activate this XDCID.")}
        </p>
      ) : null}
    </div>
  );
}
