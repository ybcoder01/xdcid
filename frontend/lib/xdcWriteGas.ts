import type { PublicClient } from "viem";
import { estimateAdaptiveGasFees } from "./gasFeePolicy";

export const XDC_WRITE_GAS_LIMITS = {
  erc20Approval: 150_000n,
  registration: 1_500_000n,
  renewal: 1_000_000n,
  subdomainRegistration: 1_500_000n,
  subdomainRenewal: 1_000_000n,
  recordUpdate: 500_000n,
} as const;

export async function xdcWriteOverrides(
  client: PublicClient,
  chainId: number,
  gas: bigint,
) {
  const fees = await estimateAdaptiveGasFees(client, chainId);
  return { gas, ...fees };
}
