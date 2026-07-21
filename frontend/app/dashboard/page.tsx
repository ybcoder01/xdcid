"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatEther, type Hex } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract
} from "wagmi";
import {
  addresses,
  registrarAbi,
  reverseResolverAbi
} from "../../config/contracts";

type OwnedName = {
  name: string;
  node: Hex;
  primary: boolean;
  expiry: {
    timestamp: string;
    iso: string;
  };
};

type OwnedNamesResponse = {
  data?: {
    primaryName: string | null;
    names: OwnedName[];
  };
  error?: {
    message?: string;
  };
};

function NameRow({ record }: { record: OwnedName }) {
  const { writeContract, isPending } = useWriteContract();
  const price = useReadContract({
    address: addresses.registrar,
    abi: registrarAbi,
    functionName: "price",
    args: [record.name]
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 bg-white p-4 shadow-sm">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="text-lg font-semibold text-slate-950 hover:text-teal-700"
            href={"/name/" + record.name}
          >
            {record.name}
          </Link>
          {record.primary && (
            <span className="rounded-full bg-teal-100 px-2 py-1 text-xs font-semibold text-teal-800">
              Primary ID
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-600">
          Expires: {new Date(record.expiry.iso).toLocaleDateString()}
          {price.data
            ? " - renew " + formatEther(price.data) + " XDC/year"
            : ""}
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
            args: [record.name, 1n],
            value: price.data
          })
        }
      >
        {isPending ? "Confirm in wallet" : "Renew"}
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const [names, setNames] = useState<OwnedName[]>([]);
  const [primaryName, setPrimaryName] = useState<string | null>(null);
  const [selectedPrimary, setSelectedPrimary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const {
    data: primaryHash,
    error: primaryWriteError,
    isPending: isPrimaryPending,
    writeContract
  } = useWriteContract();
  const primaryReceipt = useWaitForTransactionReceipt({ hash: primaryHash });

  const loadOwnedNames = useCallback(async () => {
    if (!address) {
      setNames([]);
      setPrimaryName(null);
      setSelectedPrimary("");
      return;
    }

    setIsLoading(true);
    setLookupError("");

    try {
      const response = await fetch(
        "/api/v1/addresses/" + address + "/names",
        { cache: "no-store" }
      );
      const body = (await response.json()) as OwnedNamesResponse;
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message || "Unable to load wallet names");
      }

      setNames(body.data.names);
      setPrimaryName(body.data.primaryName);
      setSelectedPrimary(
        body.data.primaryName || body.data.names[0]?.name || ""
      );
    } catch (error) {
      setLookupError(
        error instanceof Error ? error.message : "Unable to load wallet names"
      );
      setNames([]);
      setPrimaryName(null);
      setSelectedPrimary("");
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void loadOwnedNames();
  }, [loadOwnedNames]);

  useEffect(() => {
    if (!primaryReceipt.isSuccess || !selectedPrimary) return;

    setPrimaryName(selectedPrimary);
    setNames((current) =>
      current.map((record) => ({
        ...record,
        primary: record.name === selectedPrimary
      }))
    );
  }, [primaryReceipt.isSuccess, selectedPrimary]);

  const selectedRecord = names.find(
    (record) => record.name === selectedPrimary
  );

  function savePrimary() {
    if (!selectedRecord) return;

    writeContract({
      address: addresses.reverseResolver,
      abi: reverseResolverAbi,
      functionName: "setPrimaryName",
      args: [selectedRecord.name, selectedRecord.node]
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
          Wallet inventory
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Dashboard
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Names are indexed from XDCScan and ownership is verified directly
          against the XDCID registry.
        </p>
      </section>

      {isConnected && names.length > 0 && (
        <section className="mt-6 rounded-md border border-black/10 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">
            Primary XDCID
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Wallets and apps can use your verified primary ID for reverse
            resolution. Current: {primaryName || "not selected"}.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <select
              className="min-w-64 rounded-md border border-black/20 bg-white px-4 py-3 text-sm"
              value={selectedPrimary}
              onChange={(event) => setSelectedPrimary(event.target.value)}
            >
              {names.map((record) => (
                <option key={record.node} value={record.name}>
                  {record.name}
                </option>
              ))}
            </select>
            <button
              className="rounded-md bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              disabled={
                !selectedRecord ||
                selectedPrimary === primaryName ||
                isPrimaryPending ||
                primaryReceipt.isLoading
              }
              onClick={savePrimary}
            >
              {isPrimaryPending
                ? "Confirm in wallet"
                : primaryReceipt.isLoading
                  ? "Saving..."
                  : "Set primary ID"}
            </button>
          </div>
          {primaryReceipt.isSuccess && (
            <p className="mt-3 text-sm text-teal-700">
              Primary ID updated on XDC Network.
            </p>
          )}
          {primaryWriteError && (
            <p className="mt-3 text-sm text-red-600">
              {primaryWriteError.message}
            </p>
          )}
        </section>
      )}

      <div className="mt-6 grid gap-3">
        {!isConnected && (
          <p className="rounded-md border border-black/10 bg-white p-5 text-sm shadow-sm">
            Connect your wallet.
          </p>
        )}
        {isConnected && isLoading && (
          <p className="rounded-md border border-black/10 bg-white p-5 text-sm shadow-sm">
            Loading your verified names...
          </p>
        )}
        {isConnected && !isLoading && lookupError && (
          <p className="rounded-md border border-red-200 bg-white p-5 text-sm text-red-600 shadow-sm">
            {lookupError}
          </p>
        )}
        {isConnected && !isLoading && !lookupError && names.length === 0 && (
          <p className="rounded-md border border-black/10 bg-white p-5 text-sm shadow-sm">
            No active XDCID names are owned by this wallet.
          </p>
        )}
        {names.map((record) => (
          <NameRow key={record.node} record={record} />
        ))}
      </div>
    </main>
  );
}
