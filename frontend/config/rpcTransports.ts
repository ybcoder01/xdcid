import { fallback, http, type Transport } from "viem";

export const SUPPORTED_RPC_CHAIN_IDS = [1, 50, 137, 8453, 42161] as const;
export type SupportedRpcChainId = (typeof SUPPORTED_RPC_CHAIN_IDS)[number];

const DEFAULT_RPC_URLS: Record<SupportedRpcChainId, readonly string[]> = {
  1: [
    "https://cloudflare-eth.com",
    "https://eth.llamarpc.com",
  ],
  50: [
    "https://rpc.xdcrpc.com",
    "https://earpc.xinfin.network",
  ],
  137: [
    "https://polygon.drpc.org",
    "https://polygon.publicnode.com",
  ],
  8453: [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
  ],
  42161: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum-one-rpc.publicnode.com",
  ],
};

const CONFIGURED_RPC_URLS: Partial<Record<SupportedRpcChainId, string | undefined>> = {
  1: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URLS,
  50: process.env.NEXT_PUBLIC_XDC_RPC_URLS || process.env.NEXT_PUBLIC_XDC_RPC_URL,
  137: process.env.NEXT_PUBLIC_POLYGON_RPC_URLS,
  8453: process.env.NEXT_PUBLIC_BASE_RPC_URLS,
  42161: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URLS,
};

export function buildRpcUrls(
  configured: string | undefined,
  defaults: readonly string[],
): string[] {
  return [...new Set([
    ...(configured || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^https:\/\//i.test(value)),
    ...defaults,
  ])];
}

export function getRpcUrls(chainId: SupportedRpcChainId): string[] {
  return buildRpcUrls(CONFIGURED_RPC_URLS[chainId], DEFAULT_RPC_URLS[chainId]);
}

export function getRpcTransport(chainId: SupportedRpcChainId): Transport {
  const transports = getRpcUrls(chainId).map((url) =>
    http(url, {
      timeout: 6_000,
      retryCount: 1,
      retryDelay: 250,
    }),
  );

  return fallback(transports, {
    rank: {
      interval: 30_000,
      sampleCount: 5,
      timeout: 1_500,
      weights: {
        latency: 0.3,
        stability: 0.7,
      },
    },
    retryCount: 1,
    retryDelay: 250,
  });
}
