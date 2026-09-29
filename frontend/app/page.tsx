"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatEther, keccak256, stringToHex } from "viem";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { HomepageConceptReview } from "../components/HomepageConceptReview";
import { SignedRegistrationControls } from "../components/SignedRegistrationControls";
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

export default function Home() {
  const [input, setInput] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const connectedChainId = useChainId();
  const apothemMode = process.env.NEXT_PUBLIC_PAYMENT_NETWORK_ENV === "testnet";
  const registrationChainId = apothemMode ? apothemRegistration.chainId : 50;
  const registrationRegistrar = apothemMode ? apothemRegistration.registrar : addresses.registrar;
  const registrationRegistry = apothemMode ? apothemRegistration.registry : addresses.registry;
  const registrationPricingPolicy = apothemMode ? apothemRegistration.pricingPolicy : addresses.pricingPolicy;
  const registrationSignedEnabled = apothemMode || signedRegistrarEnabled;
  const registrationContractsConfigured = apothemMode
    ? registrationRegistrar !== zeroAddress && registrationPricingPolicy !== zeroAddress
    : mainnetContractsConfigured;
  const { writeContract, isPending, data: hash } = useWriteContract();

  const parsedName = useMemo(() => parseXnsName(input), [input]);
  const { name, isValid, error: validationError } = parsedName;
  const hasInput = input.trim().length > 0;
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
  const registrationAllowed = availability.data === true && registry.status?.registrationAllowed === true;

  useEffect(() => {
    if (!registrationOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRegistrationOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [registrationOpen]);

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

  return (
    <>
      <HomepageConceptReview
        input={input}
        isValid={isValid}
        name={name}
        onCheckAvailability={() => setRegistrationOpen(true)}
        onInput={setInput}
        validationError={validationError}
      />
      {registrationOpen ? (
        <div
          aria-labelledby="registration-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-[#071c1b]/75 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-black/10 bg-[#f8f5ed] p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#0d7775]">
                  {apothemMode ? "XDC Apothem test identity" : "XDC mainnet identity"}
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]" id="registration-title">Claim {name}</h2>
              </div>
              <button aria-label="Close registration" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-black/15 bg-white text-xl hover:bg-black hover:text-white" onClick={() => setRegistrationOpen(false)} type="button">×</button>
            </div>

            <div className="mt-6 flex gap-2 border-2 border-black bg-white p-2">
              <input aria-invalid={hasInput && !isValid} className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 font-mono text-lg shadow-none focus:shadow-none" onChange={(event) => setInput(event.target.value)} placeholder="yourname" value={input} />
              <span className="grid min-w-20 place-items-center bg-[#0d7775] px-4 font-mono font-semibold text-white">.xdc</span>
            </div>
            <p className={hasInput && !isValid ? "mt-2 text-sm text-red-600" : "mt-2 text-sm text-black/50"}>
              {hasInput && !isValid
                ? validationError
                : registrationSignedEnabled
                  ? "Use 2–63 letters, numbers, or hyphens; a hyphen cannot be first or last."
                  : "Use 3–63 letters, numbers, or hyphens."}
            </p>

            {hasInput ? <LivePricingTiers chainId={registrationChainId} pricingPolicy={registrationPricingPolicy} signedEnabled={registrationSignedEnabled} /> : null}

            {hasInput ? (
              <div className="mt-6 border-t border-black/15 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold">{isValid ? name : input.trim()}</p>
                    <p className="mt-1 text-sm text-black/55">
                      {!isValid
                        ? validationError
                        : !registrationContractsConfigured
                          ? "Contracts not configured"
                          : !registrarSupportsName
                            ? "This name length is not currently supported"
                            : availability.isLoading || xdcidOwner.isLoading || (!registrationSignedEnabled && price.isLoading) || registry.isChecking
                              ? "Checking both registries…"
                              : availability.isError || xdcidOwner.isError || (!registrationSignedEnabled && price.isError) || registry.isError
                                ? "Could not check registry status"
                                : registry.status?.state === "legacy"
                                  ? "Reserved in XDCDomains; migration required"
                                  : registry.status?.state === "collision"
                                    ? "Registered in both registries; review required"
                                    : registrationAllowed
                                      ? "Available to claim"
                                      : registry.status?.state === "xdcid"
                                        ? "Already registered with XDCID"
                                        : "Unavailable"}
                      {!registrationSignedEnabled && price.data ? ` — ${formatEther(price.data)} XDC/year` : ""}
                    </p>
                  </div>
                  {isValid && registrationAllowed ? (
                    registrationSignedEnabled ? (
                      <SignedRegistrationControls enabled={registrationContractsConfigured && isConnected && connectedChainId === registrationChainId} expectedChainId={registrationChainId} name={name} nativeCurrencyLabel={apothemMode ? "TXDC" : "XDC"} pricingPolicyAddress={registrationPricingPolicy} registrarAddress={registrationRegistrar} />
                    ) : (
                      <button className="bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-[#0d7775] disabled:opacity-50" disabled={!registrationContractsConfigured || !isConnected || isPending} onClick={claim} type="button">Claim</button>
                    )
                  ) : isValid && registry.status?.state === "xdcid" ? (
                    <Link className="border border-black/15 px-5 py-3 text-sm font-semibold hover:bg-white" href={`/name/${name}`}>View</Link>
                  ) : (
                    <button className="border border-black/15 px-5 py-3 text-sm text-black/35" disabled type="button">{registry.status?.state === "legacy" ? "Reserved" : registry.status?.state === "collision" ? "Review required" : "Claim"}</button>
                  )}
                </div>
                {hash ? <p className="mt-3 break-all text-xs text-black/45">Transaction sent: {hash}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function LivePricingTiers(props: { chainId: number; pricingPolicy: `0x${string}`; signedEnabled: boolean }) {
  const enabled = props.signedEnabled && props.pricingPolicy !== zeroAddress;
  const two = useReadContract({ address: props.pricingPolicy, chainId: props.chainId, abi: pricingPolicyAbi, functionName: "priceUsdMicros", args: [0, 2n, 1n], query: { enabled } });
  const three = useReadContract({ address: props.pricingPolicy, chainId: props.chainId, abi: pricingPolicyAbi, functionName: "priceUsdMicros", args: [0, 3n, 1n], query: { enabled } });
  const four = useReadContract({ address: props.pricingPolicy, chainId: props.chainId, abi: pricingPolicyAbi, functionName: "priceUsdMicros", args: [0, 4n, 1n], query: { enabled } });
  const standard = useReadContract({ address: props.pricingPolicy, chainId: props.chainId, abi: pricingPolicyAbi, functionName: "priceUsdMicros", args: [0, 5n, 1n], query: { enabled } });

  if (!props.signedEnabled) {
    return <div className="mt-5 grid gap-3 text-sm text-black/55 sm:grid-cols-3"><PriceCard label="3 chars" price="500 XDC/year" /><PriceCard label="4 chars" price="100 XDC/year" /><PriceCard label="5+ chars" price="10 XDC/year" /></div>;
  }

  return <div className="mt-5 grid gap-3 text-sm text-black/55 sm:grid-cols-4"><PriceCard label="2 chars" price={formatLiveTier(two.data, two.isLoading, two.isError)} /><PriceCard label="3 chars" price={formatLiveTier(three.data, three.isLoading, three.isError)} /><PriceCard label="4 chars" price={formatLiveTier(four.data, four.isLoading, four.isError)} /><PriceCard label="5+ chars" price={formatLiveTier(standard.data, standard.isLoading, standard.isError)} /></div>;
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
