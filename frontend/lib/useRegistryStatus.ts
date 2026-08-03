"use client";

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import {
  legacyXdcDomainsAbi,
  legacyXdcDomainsAddress
} from "../config/legacyDomains";
import { classifyRegistryStatus } from "./registryStatus";

const XDC_CHAIN_ID = 50;

export function useRegistryStatus(
  name: string | undefined,
  xdcidRegistered: boolean | undefined,
  enabled = true
) {
  const legacyTokenId = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: legacyXdcDomainsAddress,
    abi: legacyXdcDomainsAbi,
    functionName: "_tokenIdMaps",
    args: name ? [name] : undefined,
    query: { enabled: enabled && !!name }
  });

  const legacy = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: legacyXdcDomainsAddress,
    abi: legacyXdcDomainsAbi,
    functionName: "exists",
    args:
      legacyTokenId.data !== undefined ? [legacyTokenId.data] : undefined,
    query: { enabled: enabled && legacyTokenId.data !== undefined }
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
    legacyTokenId: legacyTokenId.data,
    isChecking:
      enabled &&
      (legacyTokenId.isLoading || legacy.isLoading || status === undefined),
    isError: legacyTokenId.isError || legacy.isError
  };
}
