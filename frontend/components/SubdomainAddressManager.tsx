"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  activeSubdomainRegistrarAddress,
  activeRegistryAddress,
  activeXnsChainId,
  isTestnetEnvironment,
  registryAbi,
  subdomainRegistrarAbi,
  supportedMultichainNetworks,
} from "../config/contracts";
import { XDC_WRITE_GAS_LIMITS, xdcWriteOverrides } from "../lib/xdcWriteGas";
import { walletActionErrorMessage } from "../lib/walletErrors";

function shortAddress(value: string) {
  return value.slice(0, 8) + "…" + value.slice(-6);
}

export function SubdomainAddressManager({
  name,
  node,
  parentName,
  label,
}: {
  name: string;
  node: Hex;
  parentName: string;
  label: string;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient({ chainId: activeXnsChainId });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [newOwner, setNewOwner] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const parentNode = useMemo(
    () => keccak256(stringToHex(parentName)),
    [parentName],
  );
  const owner = useReadContract({
    address: activeSubdomainRegistrarAddress,
    chainId: activeXnsChainId,
    abi: subdomainRegistrarAbi,
    functionName: "ownerOf",
    args: [node],
  });
  const addressReads = useReadContracts({
    contracts: supportedMultichainNetworks.map((network) => ({
      address: activeSubdomainRegistrarAddress,
      chainId: activeXnsChainId,
      abi: subdomainRegistrarAbi,
      functionName: "addressOf",
      args: [node, BigInt(network.chainId)],
    })),
  });
  const parentOwner = useReadContract({
    address: activeRegistryAddress,
    chainId: activeXnsChainId,
    abi: registryAbi,
    functionName: "ownerOf",
    args: [parentNode],
  });
  const currentAddresses = useMemo(
    () =>
      supportedMultichainNetworks.reduce<Record<number, Address | null>>(
        (current, network, index) => {
          const result = addressReads.data?.[index]?.result;
          current[network.chainId] =
            typeof result === "string" && isAddress(result) && result !== zeroAddress
              ? getAddress(result)
              : null;
          return current;
        },
        {},
      ),
    [addressReads.data],
  );
  const isSubdomainOwner =
    !!address &&
    typeof owner.data === "string" &&
    owner.data.toLowerCase() === address.toLowerCase();
  const isParentOwner =
    !!address &&
    typeof parentOwner.data === "string" &&
    parentOwner.data.toLowerCase() === address.toLowerCase();
  const canManage = isSubdomainOwner || isParentOwner;

  useEffect(() => {
    if (!addressReads.data) return;
    setDrafts(
      supportedMultichainNetworks.reduce<Record<number, string>>(
        (current, network) => {
          current[network.chainId] = currentAddresses[network.chainId] || "";
          return current;
        },
        {},
      ),
    );
  }, [addressReads.data, currentAddresses]);

  async function prepareWrite() {
    if (!client) throw new Error("XDC Network connection is unavailable");
    if (chainId !== activeXnsChainId) {
      setStatus(
        `Switching to ${isTestnetEnvironment ? "XDC Apothem" : "XDC Network"}…`,
      );
      await switchChainAsync({ chainId: activeXnsChainId });
    }
    return client;
  }

  async function saveAddress(chainIdToSave: number, destination: Address) {
    setBusyKey(String(chainIdToSave));
    setStatus("");
    try {
      const publicClient = await prepareWrite();
      const gas = await xdcWriteOverrides(
        publicClient,
        activeXnsChainId,
        XDC_WRITE_GAS_LIMITS.recordUpdate,
      );
      const hash = await writeContractAsync({
        address: activeSubdomainRegistrarAddress,
        abi: subdomainRegistrarAbi,
        functionName: "setAddress",
        args: [node, BigInt(chainIdToSave), destination],
        ...gas,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Address update failed");
      setStatus("Receiving address updated.");
      await addressReads.refetch();
    } catch (error) {
      setStatus(walletActionErrorMessage(error, "Address update failed"));
    } finally {
      setBusyKey(null);
    }
  }

  async function transfer() {
    if (!isAddress(newOwner) || newOwner === zeroAddress) return;
    setBusyKey("transfer");
    setStatus("");
    try {
      const publicClient = await prepareWrite();
      const gas = await xdcWriteOverrides(
        publicClient,
        activeXnsChainId,
        XDC_WRITE_GAS_LIMITS.recordUpdate,
      );
      const hash = await writeContractAsync({
        address: activeSubdomainRegistrarAddress,
        abi: subdomainRegistrarAbi,
        functionName: "transferSubdomain",
        args: [node, getAddress(newOwner)],
        ...gas,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transfer failed");
      setStatus("Subdomain ownership transferred. Its custom addresses were cleared.");
      setNewOwner("");
      await Promise.all([owner.refetch(), addressReads.refetch()]);
    } catch (error) {
      setStatus(walletActionErrorMessage(error, "Transfer failed"));
    } finally {
      setBusyKey(null);
    }
  }

  async function parentOwnershipAction(action: "reclaim" | "reassign") {
    if (action === "reassign" && (!isAddress(newOwner) || newOwner === zeroAddress)) return;
    setBusyKey(action);
    setStatus("");
    try {
      const publicClient = await prepareWrite();
      const gas = await xdcWriteOverrides(
        publicClient,
        activeXnsChainId,
        XDC_WRITE_GAS_LIMITS.recordUpdate,
      );
      const hash = action === "reclaim"
        ? await writeContractAsync({
            address: activeSubdomainRegistrarAddress,
            abi: subdomainRegistrarAbi,
            functionName: "reclaimSubdomain",
            args: [parentName, label],
            ...gas,
          })
        : await writeContractAsync({
            address: activeSubdomainRegistrarAddress,
            abi: subdomainRegistrarAbi,
            functionName: "assignSubdomain",
            args: [parentName, label, getAddress(newOwner)],
            ...gas,
          });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Ownership update failed");
      setStatus(
        action === "reclaim"
          ? `Subdomain reclaimed to the owner of ${parentName}. Its custom receiving addresses were cleared.`
          : "Subdomain reassigned. Its custom receiving addresses were cleared.",
      );
      setNewOwner("");
      await Promise.all([owner.refetch(), parentOwner.refetch(), addressReads.refetch()]);
    } catch (error) {
      setStatus(walletActionErrorMessage(error, "Ownership update failed"));
    } finally {
      setBusyKey(null);
    }
  }

  if (!address) {
    return (
      <p className="rounded-md border border-black/10 bg-white p-5 text-sm shadow-sm">
        Connect the subdomain or parent owner wallet to manage this identity.
      </p>
    );
  }

  if (!owner.isLoading && !parentOwner.isLoading && !canManage) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 shadow-sm">
        The connected wallet owns neither {name} nor its parent, {parentName}.
      </p>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-black/10 bg-white/90 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          {isParentOwner && !isSubdomainOwner ? "Parent owner controls" : "Owner controls"}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">
          Receiving addresses
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Route {name} to a different EVM address on each supported network.
          Resetting a route makes it resolve to the current subdomain owner.
        </p>
        <div className="mt-5 grid gap-3">
          {supportedMultichainNetworks.map((network) => {
            const draft = drafts[network.chainId] || "";
            const valid = isAddress(draft) && draft !== zeroAddress;
            const current = currentAddresses[network.chainId];
            return (
              <div
                className="rounded-md border border-black/10 bg-neutral-50 p-4"
                key={network.chainId}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-950">{network.name}</p>
                    <p className="text-xs text-neutral-500">Chain ID {network.chainId}</p>
                  </div>
                  <span className="rounded-full bg-teal-100 px-2 py-1 text-xs font-semibold text-teal-800">
                    {current ? shortAddress(current) : "Owner wallet"}
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    aria-label={`${network.name} receiving address`}
                    className="min-w-0 flex-1 rounded-md border border-black/15 bg-white px-3 py-2 font-mono text-sm"
                    onChange={(event) =>
                      setDrafts((value) => ({
                        ...value,
                        [network.chainId]: event.target.value,
                      }))
                    }
                    placeholder="0x receiving address"
                    value={draft}
                  />
                  <button
                    type="button"
                    className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                    disabled={!valid || busyKey !== null}
                    onClick={() => saveAddress(network.chainId, getAddress(draft))}
                  >
                    {busyKey === String(network.chainId) ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
                    disabled={busyKey !== null}
                    onClick={() => saveAddress(network.chainId, zeroAddress)}
                  >
                    Use owner
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-md border border-black/10 bg-white/90 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">
          {isParentOwner ? "Subdomain assignment" : "Transfer subdomain"}
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          {isParentOwner
            ? `As the owner of ${parentName}, you can reclaim this identity or assign it to a replacement wallet. The contract clears all custom receiving addresses whenever ownership changes.`
            : "Transfer ownership to another wallet. All custom receiving addresses are cleared by the contract during transfer."}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="New subdomain owner wallet"
            className="min-w-0 flex-1 rounded-md border border-black/15 bg-white px-3 py-2 font-mono text-sm"
            onChange={(event) => setNewOwner(event.target.value)}
            placeholder="New owner 0x address"
            value={newOwner}
          />
          <button
            type="butt