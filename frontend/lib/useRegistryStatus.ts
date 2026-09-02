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
  enabled = true,
  chainId = XDC_CHAIN_ID
) {
  const checkLegacyRegistry = chainId === XDC_CHAIN_ID;
  const legacyTokenId = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: legacyXdcDomainsAddress,
    abi: legacyXdcDomainsAbi,
    functionName: "_tokenIdMaps",
    args: name ? [name] : undefined,
    query: { enabled: enabled && checkLegacyRegistry && !!name }
  });

  const legacy = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: legacyXdcDomainsAddress,
    abi: legacyXdcDomainsAbi,
    functionName: "exists",
    args:
      legacyTokenId.data !== undefined ? [legacyTokenId.data] : undefined,
    query: {
      enabled:
        enabled && checkLegacyRegistry && legacyTokenId.data !== undefined
    }
  });

  const status = useMemo(() => {
    if (xdcidRegistered === undefined) {
      return undefined;
    }
    if (!checkLegacyRegistry) {
      return classifyRegistryStatus({
        xdcidRegistered,
        legacyRegistered: false
      });
    }
    if (legacy.data === undefined) {
      return undefined;
    }
    return classifyRegistryStatus({
      xdcidRegistered,
      legacyRegistered: legacy.data
    });
  }, [checkLegacyRegistry, legacy.data, xdcidRegistered]);

  return {
    status,
    legacyTokenId: checkLegacyRegistry ? legacyTokenId.data : undefined,
    isChecking:
      enabled &&
      (xdcidRegistered === undefined ||
        (checkLegacyRegistry &&
          (legacyTokenId.isLoading || legacy.isLoading || status === undefined))),
    isError:
      checkLegacyRegistry && (legacyTokenId.isError || legacy.isError)
  };
}
