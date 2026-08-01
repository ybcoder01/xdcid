"use client";

import { useMemo } from "react";
import type { Hex } from "viem";
import { useReadContract } from "wagmi";
import {
  legacyXdcDomainsAbi,
  legacyXdcDomainsAddress
} from "../config/legacyDomains";
import { classifyRegistryStatus } from "./registryStatus";

export function useRegistryStatus(
  node: Hex | undefined,
  xdcidRegistered: boolean | undefined,
  enabled = true
) {
  const legacy = useReadContract({
    address: legacyXdcDomainsAddress,
    abi: legacyXdcDomainsAbi,
    functionName: "exists",
    args: node ? [BigInt(node)] : undefined,
    query: { enabled: enabled && !!node }
  });

  const status = useMemo(() => {
    if (xdcidRegistered === undefined || legacy.data === undefined) {
      return undefined;
    }

    return classifyRegistryStatus({
      xdcidRegistered,
      legacyRegistered: legacy.data
    });
  }, [legacy.data, xdcidRegistered]);

  return {
    status,
    isChecking: enabled && (legacy.isLoading || status === undefined),
    isError: legacy.isError
  };
}
