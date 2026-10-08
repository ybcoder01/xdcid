"use client";

import { useMemo, useState } from "react";
import { keccak256, stringToHex } from "viem";
import { useReadContract } from "wagmi";
import {
  HomepageConceptReview,
  type HomepageAvailabilityState,
} from "../components/HomepageConceptReview";
import {
  addresses,
  apothemContractsConfigured,
  apothemRegistration,
  contractsConfigured as mainnetContractsConfigured,
  registrarAbi,
  registryAbi,
  signedRegistrarEnabled,
} from "../config/contracts";
import { parseXnsName } from "../lib/names";
import { xdcidRegistrationFromOwner } from "../lib/registryStatus";
import { useRegistryStatus } from "../lib/useRegistryStatus";

export default function Home() {
  const [input, setInput] = useState("");
  const apothemMode = process.env.NEXT_PUBLIC_PAYMENT_NETWORK_ENV === "testnet";
  const registrationChainId = apothemMode ? apothemRegistration.chainId : 50;
  const registrationRegistrar = apothemMode ? apothemRegistration.registrar : addresses.registrar;
  const registrationRegistry = apothemMode ? apothemRegistration.registry : addresses.registry;
  const registrationSignedEnabled = apothemMode || signedRegistrarEnabled;
  const registrationContractsConfigured = apothemMode
    ? apothemContractsConfigured
    : mainnetContractsConfigured;

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
  const registry = useRegistryStatus(
    name,
    xdcidRegistrationFromOwner(xdcidOwner.data),
    canReadContracts,
    registrationChainId,
  );

  const availabilityState = resolveAvailabilityState({
    availability: availability.data,
    canReadContracts,
    contractsConfigured: registrationContractsConfigured,
    hasInput,
    isError: availability.isError || xdcidOwner.isError || registry.isError,
    isLoading: availability.isLoading || xdcidOwner.isLoading || registry.isChecking,
    isValid,
    registrarSupportsName,
    registryState: registry.status?.state,
    registrationAllowed: registry.status?.registrationAllowed,
  });

  return (
    <HomepageConceptReview
      availabilityState={availabilityState}
      input={input}
      isValid={isValid}
      name={name}
      onInput={setInput}
      pricingPolicyAddress={apothemMode ? apothemRegistration.pricingPolicy : addresses.pricingPolicy}
      registrationChainId={registrationChainId}
      validationError={validationError}
    />
  );
}

function resolveAvailabilityState(input: {
  availability: unknown;
  canReadContracts: boolean;
  contractsConfigured: boolean;
  hasInput: boolean;
  isError: boolean;
  isLoading: boolean;
  isValid: boolean;
  registrarSupportsName: boolean;
  registryState?: "unregistered" | "legacy" | "xdcid" | "collision";
  registrationAllowed?: boolean;
}): HomepageAvailabilityState {
  if (!input.hasInput) return "idle";
  if (!input.isValid) return "invalid";
  if (!input.contractsConfigured) return "unconfigured";
  if (!input.registrarSupportsName) return "unsupported";
  if (!input.canReadContracts || input.isLoading) return "checking";
  if (input.isError) return "error";
  if (input.registryState === "legacy") return "reserved";
  if (input.registryState === "collision") return "review";
  if (input.registryState === "xdcid") return "registered";
  if (input.availability === true && input.registrationAllowed === true) return "available";
  return "unavailable";
}
