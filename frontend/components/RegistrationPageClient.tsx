"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatEther, keccak256, stringToHex } from "viem";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { SignedRegistrationControls } from "./SignedRegistrationControls";
import {
  addresses,
  apothemRegistration,
  contractsConfigured as mainnetContractsConfigured,
  pricingPolicyAbi,
  registrarAbi,
  registryAbi,
  signedRegistrarEnabled,
  zeroAddress,
} from "../config/contracts";
import { saveName } from "../config/localNames";
import { parseXnsName } from "../lib/names";
import { xdcidRegistrationFromOwner } from "../lib/registryStatus";
import { useRegistryStatus } from "../lib/useRegistryStatus";

export function RegistrationPageClient({ initialName }: { initialName: string }) {
  const { address, isConnected } = useAccount();
  const connectedChainId = useChainId();
  const { writeContract, isPending, data: hash } = useWriteContract();
  const parsedName = useMemo(() => parseXnsName(initialName), [initialName]);
  const { name, isValid, error: validationError } = parsedName;

  const apothemMode = process.env.NEXT_PUBLIC_PAYMENT_NETWORK_ENV === "testnet";
  const registrationChainId = apothemMode ? apothemRegistration.chainId : 50;
  const registrationRegistrar = apothemMode ? apothemRegistration.registrar : addresses.registrar;
  const registrationRegistry = apothemMode ? apothemRegistration.registry : addresses.registry;
  const registrationPricingPolicy = apothemMode
    ? apothemRegistration.pricingPolicy
    : addresses.pricingPolicy;
  const registrationSignedEnabled = apothemMode || signedRegistrarEnabled;
  const registrationContractsConfigured = apothemMode
    ? registrationRegistrar !== zeroAddress && registrationPricingPolicy !== zeroAddress
    : mainnetContractsConfigured;
  const registrarSupportsName = registrationSignedEnabled || parsedName.label.length >= 3;
  const canReadContracts = isValid && registrationContractsConfigured && registrarSupportsName;
  const node = useMemo(
    () => (canReadContracts ? keccak256(stringToHex(name)) : undefined),
    [canReadContracts, name],
  );
  const availability = useReadContract({
    address: registrationRegistrar,
    chainId: registrationChainId,
    abi: registrarAbi,
    functionName: "available",
    args: [name],
    query: { enabled: canReadContracts },
  });
  const xdcidOwner = useReadContract({
    address: registrationRegistry,
    chainId: registrationChainId,
    abi: registryAbi,
    functionName: "ownerOf",
    args: node ? [node] : undefined,
    query: { enabled: !!node },
  });
  const price = useReadContract({
    address: registrationRegistrar,
    chainId: registrationChainId,
    abi: registrarAbi,
    functionName: "price",
    args: [name],
    query: { enabled: canReadContracts && !registrationSignedEnabled },
  });
  const registry = useRegistryStatus(
    name,
    xdcidRegistrationFromOwner(xdcidOwner.data),
    canReadContracts,
    registrationChainId,
  );
  const registrationAllowed =
    availability.data === true && registry.status?.registrationAllowed === true;
  const checking =
    availability.isLoading ||
    xdcidOwner.isLoading ||
    (!registrationSignedEnabled && price.isLoading) ||
    registry.isChecking;
  const failed =
    availability.isError ||
    xdcidOwner.isError ||
    (!registrationSignedEnabled && price.isError) ||
    registry.isError;

  function claim() {
    if (
      registrationSignedEnabled ||
      !isValid ||
      !registrationContractsConfigured ||
      !address ||
      !price.data ||
      !registrationAllowed
    ) return;
    writeContract(
      {
        address: registrationRegistrar,
        chainId: registrationChainId,
        abi: registrarAbi,
        functionName: "register",
        args: [name, address, 1n],
        value: price.data,
      },
      { onSuccess: () => saveName(address, name) },
    );
  }

  const statusMessage = !isValid
    ? validationError
    : !registrationContractsConfigured
      ? "Registration contracts are not configured"
      : !registrarSupportsName
        ? "This name length is not currently supported"
        : checking
          ? "Confirming availability…"
          : failed
            ? "Could not check registry status"
            : registry.status?.state === "legacy"
              ? "Reserved in XDCDomains; migration is required"
              : registry.status?.state === "collision"
                ? "Registered in both registries; review is required"
                : registry.status?.state === "xdcid"
                  ? "This ID is already registered"
                  : registrationAllowed
                    ? "Available to register"
                    : "This ID is unavailable";

  return (
    <main className="min-h-[calc(100dvh-73px)] bg-[#f5f1e8] px-4 py-8 text-[#151719] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/50 hover:text-[#0d7775]" href="/">
          ← Search another name
        </Link>

        <section className="mt-5 overflow-hidden border-2 border-black bg-white shadow-[10px_10px_0_#071c1b]">
          <header className="flex flex-col justify-between gap-5 border-b-2 border-black bg-[#071c1b] p-6 text-white sm:flex-row sm:items-end sm:p-8">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#70d8ca]">
                {apothemMode ? "XDC Apothem test identity" : "XDC mainnet identity"}
              </p>
              <h1 className="mt-3 break-all text-4xl font-semibold uppercase leading-none tracking-[-0.055em] sm:text-6xl">
                {isValid ? name : initialName}
              </h1>
            </div>
            <span className="w-fit border border-white/20 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/65">
              Registration
            </span>
          </header>

          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/15 pb-5">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-black/40">Registry status</p>
                <p aria-live="polite" className={registrationAllowed ? "mt-2 text-lg font-semibold text-[#0d7775]" : "mt-2 text-lg font-semibold"}>
                  {statusMessage}
                </p>
                {!registrationSignedEnabled && price.data ? (
                  <p className="mt-1 text-sm text-black/50">{formatEther(price.data)} XDC/year</p>
                ) : null}
              </div>
              {isValid && registry.status?.state === "xdcid" ? (
                <Link className="border-2 border-black px-5 py-3 text-sm font-semibold hover:bg-black hover:text-white" href={`/name/${encodeURIComponent(name)}`}>
                  View ID →
                </Link>
              ) : null}
            </div>

            {isValid ? (
              <LivePricingTiers
                chainId={registrationChainId}
                pricingPolicy={registrationPricingPolicy}
                signedEnabled={registrationSignedEnabled}
              />
            ) : null}

            <div className="mt-7 border-t border-black/15 pt-6">
              {isValid && registrationAllowed ? (
                registrationSignedEnabled ? (
                  <SignedRegistrationControls
                    enabled={registrationContractsConfigured && isConnected && connectedChainId === registrationChainId}
                    expectedChainId={registrationChainId}
                    name={name}
                    nativeCurrencyLabel={apothemMode ? "TXDC" : "XDC"}
                    pricingPolicyAddress={registrationPricingPolicy}
                    registrarAddress={registrationRegistrar}
                  />
                ) : (
                  <button className="bg-black px-6 py-3 text-sm font-semibold text-white hover:bg-[#0d7775] disabled:opacity-40" disabled={!registrationContractsConfigured || !isConnected || isPending} onClick={claim} type="button">
                    {isPending ? "Processing…" : "Register ID"}
                  </button>
                )
              ) : (
                <button className="bg-black/20 px-6 py-3 text-sm font-semibold text-black/40" disabled type="button">
                  Registration unavailable
                </button>
              )}
              {registrationAllowed && !isConnected ? (
                <p className="mt-3 text-sm text-black/50">Connect the wallet that should own this ID to continue.</p>
              ) : null}
              {hash ? <p className="mt-3 break-all text-xs text-black/45">Transaction sent: {hash}</p> : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function LivePricingTiers(props: {
  chainId: number;
  pricingPolicy: `0x${string}`;
  signedEnabled: boolean;
}) {
  const enabled = props.signedEnabled && props.pricingPolicy !== zeroAddress;
  const two = useReadContract({ address: props.pricingPolicy, chainId: props.chainId, abi: pricingPolicyAbi, functionName: "priceUsdMicros", args: [0, 2n, 1n], query: { enabled } });
  const three = useReadContract({ address: props.pricingPolicy, chainId: props.chainId, abi: pricingPolicyAbi, functionName: "priceUsdMicros", args: [0, 3n, 1n], query: { enabled } });
  const four = useReadContract({ address: props.pricingPolicy, chainId: props.chainId, abi: pricingPolicyAbi, functionName: "priceUsdMicros", args: [0, 4n, 1n], query: { enabled } });
  const standard = useReadContract({ address: props.pricingPolicy, chainId: props.chainId, abi: pricingPolicyAbi, functionName: "priceUsdMicros", args: [0, 5n, 1n], query: { enabled } });

  if (!props.signedEnabled) {
    return <div className="mt-6 grid gap-3 text-sm text-black/55 sm:grid-cols-3"><PriceCard label="3 chars" price="500 XDC/year" /><PriceCard label="4 chars" price="100 XDC/year" /><PriceCard label="5+ chars" price="10 XDC/year" /></div>;
  }

  return <div className="mt-6 grid gap-3 text-sm text-black/55 sm:grid-cols-4"><PriceCard label="2 chars" price={formatLiveTier(two.data, two.isLoading, two.isError)} /><PriceCard label="3 chars" price={formatLiveTier(three.data, three.isLoading, three.isError)} /><PriceCard label="4 chars" price={formatLiveTier(four.data, four.isLoading, four.isError)} /><PriceCard label="5+ chars" price={formatLiveTier(standard.data, standard.isLoading, standard.isError)} /></div>;
}

function PriceCard({ label, price }: { label: string; price: string }) {
  return <div className="flex items-center justify-between border-b border-black/10 py-2 sm:block sm:border-b-0 sm:border-l sm:py-0 sm:pl-4 first:sm:border-l-0 first:sm:pl-0"><p className="font-semibold text-black">{label}</p><p className="text-xs">{price}</p></div>;
}

function formatLiveTier(value: unknown, loading: boolean, failed: boolean): string {
  if (loading) return "Loading live price…";
  if (failed || typeof value !== "bigint") return "Live price unavailable";
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `$${whole.toString()}${fraction ? `.${fraction}` : ""}/year`;
}
