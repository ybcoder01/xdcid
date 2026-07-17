import { createPublicClient, fallback, http } from "viem";
import { xdcMainnet } from "../config/contracts";

const DEFAULT_RPC_URLS = [
  "https://rpc.xdcrpc.com",
  "https://earpc.xinfin.network"
] as const;

function boundedInteger(
  value: string | undefined,
  fallbackValue: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallbackValue;
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function configuredRpcUrls(): string[] {
  const list = process.env.XDC_RPC_URLS?.split(",") || [];
  const candidates = [
    ...list,
    process.env.XDC_RPC_URL,
    process.env.XDC_MAINNET_RPC_URL,
    ...DEFAULT_RPC_URLS
  ];

  return Array.from(
    new Set(
      candidates
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value) && isHttpUrl(value))
    )
  );
}

export const xdcRpcTimeoutMs = boundedInteger(
  process.env.XDC_RPC_TIMEOUT_MS,
  3_500,
  1_000,
  10_000
);

export const xdcRpcUrls = configuredRpcUrls();

export const xdcClient = createPublicClient({
  chain: xdcMainnet,
  transport: fallback(
    xdcRpcUrls.map((url) =>
      http(url, {
        retryCount: 0,
        timeout: xdcRpcTimeoutMs
      })
    ),
    {
      rank: false,
      retryCount: 0
    }
  )
});
