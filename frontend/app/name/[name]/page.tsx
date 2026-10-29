"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getAddress, isAddress, keccak256, stringToHex, zeroAddress, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { MultichainAddressManager } from "../../../components/MultichainAddressManager";
import { RegistryV2MigrationAction } from "../../../components/RegistryV2MigrationAction";
import { SignedRenewalControls } from "../../../components/SignedRenewalControls";
import { activeRegistrarAddress, activeRegistryAddress, activeResolverSuiteAvailable, activeSubdomainRegistrarAddress, activeXnsChainId, addresses, isTestnetEnvironment, multichainResolverAvailable, registryAbi, resolverAbi, reverseResolverAbi, signedRegistrarEnabled, subdomainRegistrarAbi, unifiedPrimaryNameWriteAbi, unifiedProtocolEnabled, unifiedRegistryReadAbi, unifiedSubdomainRegistryAddress, verifiedResolverAvailable, verifiedReverseResolverAvailable } from "../../../config/contracts";
import { parseResolvableXnsName, parseXnsName } from "../../../lib/names";
import { walletActionErrorMessage } from "../../../lib/walletErrors";

const textKeys = ["avatar", "website", "twitter", "telegram", "bio"] as const;

function recordExpiry(record: unknown): bigint | null {
  if (Array.isArray(record) && typeof record[2] === "bigint") {
    return record[2];
  }
  if (record && typeof record === "object" && "expiry" in record) {
    const expiry = (record as { expiry?: unknown }).expiry;
    return typeof expiry === "bigint" ? expiry : null;
  }
  return null;
}

function shortAddress(value: string) {
  return value.slice(0, 8) + "…" + value.slice(-6);
}

type ResolvedOwner = {
  address: Address;
  identity: string | null;
};

export default function NamePage() {
  const params = useParams<{ name: string }>();
  const parsedName = useMemo(() => parseXnsName(decodeURIComponent(params.name)), [params.name]);
  const { name, isValid, error: validationError } = parsedName;
  const { address } = useAccount();
  const client = usePublicClient({ chainId: activeXnsChainId });
  const { writeContract, writeContractAsync, isPending } = useWriteContract();
  const [addr, setAddr] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [resolvedNewOwner, setResolvedNewOwner] = useState<ResolvedOwner | null>(null);
  const [ownerResolution, setOwnerResolution] = useState("");
  const [ownerResolutionPending, setOwnerResolutionPending] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferStatus, setTransferStatus] = useState("");
  const [records, setRecords] = useState<Record<string, string>>({});

  const node = useMemo(
    () => (isValid ? keccak256(stringToHex(name)) : undefined),
    [isValid, name]
  );

  const owner = useReadContract({
    chainId: activeXnsChainId,
    address: activeRegistryAddress,
    abi: registryAbi,
    functionName: "ownerOf",
    args: node ? [node] : undefined,
    query: { enabled: isValid && !!node }
  });

  const expiry = useReadContract({
    chainId: activeXnsChainId,
    address: activeRegistryAddress,
    abi: registryAbi,
    functionName: "expiryOf",
    args: node ? [node] : undefined,
    query: { enabled: isValid && !!node }
  });

  const ownershipGeneration = useReadContract({
    chainId: activeXnsChainId,
    address: activeRegistryAddress,
    abi: registryAbi,
    functionName: "ownershipGenerations",
    args: node ? [node] : undefined,
    query: { enabled: isValid && !!node }
  });

  const resolvedAddress = useReadContract({
    address: addresses.verifiedResolver,
    abi: resolverAbi,
    functionName: "addresses",
    args: node ? [node] : undefined,
    query: { enabled: isValid && !!node && verifiedResolverAvailable }
  });

  const primaryName = useReadContract({
    address: addresses.verifiedReverseResolver,
    abi: reverseResolverAbi,
    functionName: "primaryNames",
    args: address ? [address] : undefined,
    query: { enabled: !!address && verifiedReverseResolverAvailable }
  });

  const textReads = useReadContracts({
    contracts: node && verifiedResolverAvailable
      ? textKeys.map((key) => ({
          address: addresses.verifiedResolver,
          abi: resolverAbi,
          functionName: "text",
          args: [node, key]
        }))
      : [],
    query: { enabled: isValid && !!node && verifiedResolverAvailable }
  });

  const isOwner = useMemo(
    () => !!address && !!owner.data && owner.data.toLowerCase() === address.toLowerCase(),
    [address, owner.data]
  );
  const migrationRequired = isOwner && ownershipGeneration.data === 0n;
  const ownerRecordsEnabled =
    isOwner && !migrationRequired && !ownershipGeneration.isLoading;

  const resolveOwnerInput = useCallback(async (value: string): Promise<ResolvedOwner> => {
    const input = value.trim();
    if (isAddress(input)) {
      const destination = getAddress(input);
      if (destination === zeroAddress) throw new Error("Enter a non-zero wallet address");
      return { address: destination, identity: null };
    }
    if (!client) throw new Error("XDC Network connection is unavailable");

    const parsed = parseResolvableXnsName(input);
    if (!parsed.isValid) {
      throw new Error(parsed.error || "Enter a valid wallet address or XDCID");
    }

    const identityNode = keccak256(stringToHex(parsed.name));
    let identityOwner: unknown;
    let identityExpiry: bigint | null = null;

    if (parsed.kind === "subdomain") {
      if (unifiedProtocolEnabled) {
        const [currentOwner, record] = await Promise.all([
          client.readContract({
            address: unifiedSubdomainRegistryAddress,
            abi: unifiedRegistryReadAbi,
            functionName: "ownerOf",
            args: [identityNode],
          }),
          client.readContract({
            address: unifiedSubdomainRegistryAddress,
            abi: unifiedRegistryReadAbi,
            functionName: "records",
            args: [identityNode],
          }),
        ]);
        identityOwner = currentOwner;
        identityExpiry = recordExpiry(record);
      } else {
        const record = await client.readContract({
          address: activeSubdomainRegistrarAddress,
          abi: subdomainRegistrarAbi,
          functionName: "records",
          args: [identityNode],
        });
        identityOwner = Array.isArray(record) ? record[0] : undefined;
        identityExpiry = recordExpiry(record);
      }
    } else {
      [identityOwner, identityExpiry] = await Promise.all([
        client.readContract({
          address: activeRegistryAddress,
          abi: registryAbi,
          functionName: "ownerOf",
          args: [identityNode],
        }),
        client.readContract({
          address: activeRegistryAddress,
          abi: registryAbi,
          functionName: "expiryOf",
          args: [identityNode],
        }),
      ]);
    }

    if (
      typeof identityOwner !== "string" ||
      !isAddress(identityOwner) ||
      identityOwner === zeroAddress ||
      identityExpiry === null ||
      identityExpiry <= BigInt(Math.floor(Date.now() / 1_000))
    ) {
      throw new Error(`${parsed.name} is unregistered or expired`);
    }

    return { address: getAddress(identityOwner), identity: parsed.name };
  }, [client]);

  useEffect(() => {
    const input = newOwner.trim();
    setResolvedNewOwner(null);
    if (!input) {
      setOwnerResolution("");
      setOwnerResolutionPending(false);
      return;
    }

    let cancelled = false;
    setOwnerResolutionPending(true);
    setOwnerResolution(isAddress(input) ? "Checking wallet address…" : "Resolving XDCID owner…");
    const timeout = window.setTimeout(() => {
      void resolveOwnerInput(input)
        .then((resolved) => {
          if (cancelled) return;
          setResolvedNewOwner(resolved);
          setOwnerResolution(
            resolved.identity
              ? `${resolved.identity} currently belongs to ${shortAddress(resolved.address)}`
              : `Wallet ${shortAddress(resolved.address)} is ready`,
          );
        })
        .catch((error) => {
          if (cancelled) return;
          setOwnerResolution(error instanceof Error ? error.message : "Unable to resolve owner");
        })
        .finally(() => {
          if (!cancelled) setOwnerResolutionPending(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [newOwner, resolveOwnerInput]);

  function saveAddress() {
    if (!node || !isAddress(addr)) return;
    writeContract({
      address: addresses.verifiedResolver,
      abi: resolverAbi,
      functionName: "setAddress",
      args: [node, addr]
    });
  }

  function saveText(key: string) {
    if (!node) return;
    writeContract({
      address: addresses.verifiedResolver,
      abi: resolverAbi,
      functionName: "setText",
      args: [node, key, records[key] || ""]
    });
  }

  function setPrimaryName() {
    if (!node) return;
    if (unifiedProtocolEnabled) {
      writeContract({
        address: addresses.verifiedReverseResolver,
        abi: unifiedPrimaryNameWriteAbi,
        functionName: "setPrimaryName",
        args: [name]
      });
      return;
    }
    writeContract({
      address: addresses.verifiedReverseResolver,
      abi: reverseResolverAbi,
      functionName: "setPrimaryName",
      args: [name, node]
    });
  }

  async function transferName() {
    if (!node || !resolvedNewOwner || !client) return;
    setTransferBusy(true);
    setTransferStatus("");
    try {
      const latest = await resolveOwnerInput(newOwner);
      if (
        resolvedNewOwner.identity &&
        latest.address.toLowerCase() !== resolvedNewOwner.address.toLowerCase()
      ) {
        setResolvedNewOwner(latest);
        setOwnerResolution(
          `${latest.identity} changed owners and now belongs to ${shortAddress(latest.address)}. Review it and try again.`,
        );
        throw new Error("XDCID ownership changed before submission");
      }
      const hash = await writeContractAsync({
        chainId: activeXnsChainId,
        address: activeRegistryAddress,
        abi: registryAbi,
        functionName: "transferName",
        args: [node, latest.address]
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Ownership transfer failed");
      setTransferStatus(`Ownership transferred to ${latest.address}.`);
      setNewOwner("");
      setResolvedNewOwner(null);
      setOwnerResolution("");
      await owner.refetch();
    } catch (error) {
      setTransferStatus(walletActionErrorMessage(error, "Ownership transfer failed"));
    } finally {
      setTransferBusy(false);
    }
  }

  if (!isValid) {
    return (
      <main className="xdc-product-page mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-md border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Invalid XDCID name</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">This name cannot be resolved</h1>
          <p className="mt-2 text-sm text-neutral-600">{validationError}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="xdc-product-page mx-auto max-w-5xl px-4 py-10">
      <div className="rounded-md border border-black/10 bg-slate-950 p-6 text-white shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">XDCID profile</p>
        <h1 className="mt-3 text-4xl font-semibold">{name}</h1>
        <p className="mt-4 break-all text-sm text-slate-300">
          Owner: {owner.data && owner.data !== zeroAddress ? owner.data : "Unregistered or expired"}
        </p>
        <p className="mt-1 break-all text-sm text-slate-300">Address: {resolvedAddress.data || owner.data || "Not set"}</p>
        {typeof expiry.data === "bigint" && expiry.data > 0n ? (
          <p className="mt-1 text-sm text-slate-300">
            Expires: {new Date(Number(expiry.data) * 1000).toLocaleDateString()}
          </p>
        ) : null}
      </div>

      {isOwner && (isTestnetEnvironment || signedRegistrarEnabled) ? (
        <section className="mt-6 rounded-md border border-black/10 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Renew this XDCID</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Extend the current expiration date by 1, 3, 5, or 10 years.
          </p>
          <SignedRenewalControls
            expectedChainId={activeXnsChainId}
            name={name}
            nativeCurrencyLabel={isTestnetEnvironment ? "TXDC" : "XDC"}
            onRenewed={async () => {
              await expiry.refetch();
            }}
            registrarAddress={activeRegistrarAddress}
          />
        </section>
      ) : null}

      {isOwner && node && (migrationRequired || ownershipGeneration.isLoading) ? (
        <section className="mt-6">
          <RegistryV2MigrationAction
            migrationRequired={migrationRequired}
            name={name}
            node={node}
            onMigrated={async () => {
              await ownershipGeneration.refetch();
            }}
          />
          {ownershipGeneration.isLoading ? (
            <p className="rounded-md border border-black/10 bg-white p-4 text-sm text-neutral-600 shadow-sm">
              Checking Registry V2 activation status…
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {textKeys.map((key, index) => (
          <div className="rounded-md border border-black/10 bg-white p-4 shadow-sm" key={key}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">{key}</p>
            <p className="mt-1 text-sm text-neutral-600">{textReads.data?.[index]?.result || "Not set"}</p>
          </div>
        ))}
      </div>

      {ownerRecordsEnabled && node && multichainResolverAvailable && (
        <MultichainAddressManager name={name} node={node} />
      )}

      {ownerRecordsEnabled && node && !multichainResolverAvailable && (
        <section className="mt-8 rounded-md border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
            Five-network records
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Multichain destinations are not active on this network yet
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-950">
            Default address, profile, primary display name and ownership
            controls are available below. Five-network destination records will
            appear here after the Apothem multichain resolver is configured.
          </p>
        </section>
      )}

      {ownerRecordsEnabled && activeResolverSuiteAvailable && (
        <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Edit records</h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 bg-neutral-50 p-3">
            <p className="text-sm text-neutral-600">
              Primary display name: {verifiedReverseResolverAvailable ? primaryName.data || "Not set" : "Available after Resolver V2 activation"}
            </p>
            <button className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={isPending || !verifiedReverseResolverAvailable} onClick={setPrimaryName}>
              Set as display name
            </button>
          </div>
          {verifiedResolverAvailable && <div className="mt-4 flex gap-2">
            <input className="min-w-0 flex-1 rounded-md border border-black/10 px-3 py-2" value={addr} onChange={(event) => setAddr(event.target.value)} placeholder="0x address" />
            <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50" disabled={isPending} onClick={saveAddress}>
              Save
            </button>
          </div>}
          <div className="mt-4 rounded-md border border-black/10 bg-neutral-50 p-3">
            <p className="text-sm font-semibold text-slate-950">Transfer ownership</p>
            <p className="mt-1 text-xs text-neutral-600">Move this .XDC name to another wallet after an off-chain sale or agreement.</p>
            <div className="mt-3 flex gap-2">
              <input
                aria-label="New owner wallet or XDCID"
                className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-3 py-2"
                value={newOwner}
                onChange={(event) => {
                  setNewOwner(event.target.value);
                  setTransferStatus("");
                }}
                placeholder="Wallet address or XDCID"
              />
              <button
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                disabled={isPending || transferBusy || ownerResolutionPending || !resolvedNewOwner}
                onClick={transferName}
              >
                Transfer
              </button>
            </div>
            {ownerResolution ? (
              <p
                className={`mt-2 text-xs ${resolvedNewOwner ? "text-teal-700" : "text-amber-800"}`}
                role="status"
              >
                {ownerResolution}
              </p>
            ) : null}
            {transferStatus ? (
              <p className="mt-2 text-xs text-neutral-700" role="status">
                {transferStatus}
              </p>
            ) : null}
          </div>
          {verifiedResolverAvailable && <div className="mt-4 grid gap-3">
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
          </div>}
        </section>
      )}
    </main>
  );
}
