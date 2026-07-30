"use client";

import { useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, zeroAddress, type Address, type Hex } from "viem";
import {
  useAccount,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract
} from "wagmi";
import {
  addresses,
  multichainResolverAbi,
  supportedMultichainNetworks
} from "../config/contracts";

type MultichainAddressManagerProps = {
  name: string;
  node: Hex;
};

function shortAddress(address: string): string {
  return address.slice(0, 8) + "..." + address.slice(-6);
}

export function MultichainAddressManager({
  name,
  node
}: MultichainAddressManagerProps) {
  const { address: connectedAddress } = useAccount();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [activeChainId, setActiveChainId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const {
    data: transactionHash,
    error: writeError,
    isPending,
    writeContract
  } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: transactionHash });

  const addressReads = useReadContracts({
    contracts: supportedMultichainNetworks.map((network) => ({
      address: addresses.multichainResolver,
      abi: multichainResolverAbi,
      functionName: "addressFor",
      args: [node, BigInt(network.chainId)]
    }))
  });

  const currentAddresses = useMemo(() => {
    return supportedMultichainNetworks.reduce<Record<number, Address | null>>(
      (current, network, index) => {
        const result = addressReads.data?.[index]?.result;
        current[network.chainId] =
          typeof result === "string" && isAddress(result) && result !== zeroAddress
            ? getAddress(result)
            : null;
        return current;
      },
      {}
    );
  }, [addressReads.data]);

  useEffect(() => {
    if (!addressReads.data) return;
    setDrafts(
      supportedMultichainNetworks.reduce<Record<number, string>>(
        (current, network) => {
          current[network.chainId] = currentAddresses[network.chainId] || "";
          return current;
        },
        {}
      )
    );
  }, [addressReads.data, currentAddresses]);

  useEffect(() => {
    if (!receipt.isSuccess) return;
    const network = supportedMultichainNetworks.find(
      (item) => item.chainId === activeChainId
    );
    setStatusMessage(
      (network?.name || "Network") + " address updated on XDC Network."
    );
    setActiveChainId(null);
    void addressReads.refetch();
  }, [receipt.isSuccess, activeChainId]);

  function useConnectedAddressForAll() {
    if (!connectedAddress) return;
    const normalized = getAddress(connectedAddress);
    setDrafts(
      supportedMultichainNetworks.reduce<Record<number, string>>(
        (current, network) => {
          current[network.chainId] = normalized;
          return current;
        },
        {}
      )
    );
    setStatusMessage(
      "The connected address has been filled for every network. Save each network separately."
    );
  }

  function saveAddress(chainId: number) {
    const target = drafts[chainId]?.trim() || "";
    if (!isAddress(target) || target === zeroAddress) {
      setStatusMessage("Enter a valid non-zero EVM address before saving.");
      return;
    }

    setActiveChainId(chainId);
    setStatusMessage("");
    writeContract({
      address: addresses.multichainResolver,
      abi: multichainResolverAbi,
      functionName: "setAddress",
      args: [node, BigInt(chainId), getAddress(target)]
    });
  }

  function clearAddress(chainId: number) {
    setActiveChainId(chainId);
    setStatusMessage("");
    writeContract({
      address: addresses.multichainResolver,
      abi: multichainResolverAbi,
      functionName: "clearAddress",
      args: [node, BigInt(chainId)]
    });
  }

  return (
    <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Owner controls
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Multichain addresses
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">
            Choose where {name} resolves on each supported EVM network. Record
            changes are signed by the name owner and stored on XDC Network.
          </p>
        </div>
        <button
          className="rounded-md border border-teal-700 bg-white px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50"
          disabled={!connectedAddress || isPending || receipt.isLoading}
          onClick={useConnectedAddressForAll}
        >
          Use my wallet for all
        </button>
      </div>

      <div className="mt-5 grid gap-3">
        {supportedMultichainNetworks.map((network) => {
          const currentAddress = currentAddresses[network.chainId];
          const draft = drafts[network.chainId] || "";
          const validDraft = isAddress(draft) && draft !== zeroAddress;
          const unchanged =
            !!currentAddress &&
            validDraft &&
            currentAddress.toLowerCase() === draft.toLowerCase();
          const busy =
            activeChainId === network.chainId &&
            (isPending || receipt.isLoading);

          return (
            <div
              className="rounded-md border border-black/10 bg-neutral-50 p-4"
              key={network.chainId}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-950">{network.name}</p>
                  <p className="text-xs text-neutral-500">
                    Chain ID {network.chainId}
                  </p>
                </div>
                <span
                  className={
                    "rounded-full px-2 py-1 text-xs font-semibold " +
                    (currentAddress
                      ? "bg-teal-100 text-teal-800"
                      : "bg-neutral-200 text-neutral-600")
                  }
                >
                  {currentAddress
                    ? "Configured: " + shortAddress(currentAddress)
                    : "Not set"}
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  aria-label={network.name + " receiving address"}
                  className="min-w-0 flex-1 rounded-md border border-black/15 bg-white px-3 py-2 font-mono text-sm"
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [network.chainId]: event.target.value
                    }))
                  }
                  placeholder="0x receiving address"
                  value={draft}
                />
                <button
                  className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                  disabled={
                    !validDraft || unchanged || isPending || receipt.isLoading
                  }
                  onClick={() => saveAddress(network.chainId)}
                >
                  {busy ? "Confirming..." : currentAddress ? "Update" : "Save"}
                </button>
                <button
                  className="rounded-md border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-neutral-100 disabled:opacity-50"
                  disabled={!currentAddress || isPending || receipt.isLoading}
                  onClick={() => clearAddress(network.chainId)}
                >
                  Clear
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        A standard wallet account normally uses the same address across EVM
        networks. Smart-contract wallets may use a different address or may not
        be deployed on every network. Always verify that you control each
        destination address.
      </div>

      {addressReads.isLoading && (
        <p className="mt-3 text-sm text-neutral-600">Loading address records...</p>
      )}
      {addressReads.error && (
        <p className="mt-3 text-sm text-red-600">
          Unable to load multichain address records.
        </p>
      )}
      {statusMessage && (
        <p className="mt-3 text-sm text-teal-700">{statusMessage}</p>
      )}
      {writeError && (
        <p className="mt-3 break-words text-sm text-red-600">
          {writeError.message}
        </p>
      )}
    </section>
  );
}
