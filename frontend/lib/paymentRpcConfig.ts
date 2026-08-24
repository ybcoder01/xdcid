export type PaymentRpcConfig = {
  readonly environment: string;
  readonly fallbackUrls: string;
};

export const PAYMENT_RPC_CONFIG: Readonly<Record<number, PaymentRpcConfig>> = {
  1: {
    environment: "ETHEREUM_RPC_URLS",
    fallbackUrls: "https://ethereum-rpc.publicnode.com"
  },
  50: {
    environment: "XDC_RPC_URLS",
    fallbackUrls: "https://rpc.xdcrpc.com,https://earpc.xinfin.network"
  },
  137: {
    environment: "POLYGON_RPC_URLS",
    fallbackUrls: "https://polygon-bor-rpc.publicnode.com"
  },
  8453: {
    environment: "BASE_RPC_URLS",
    fallbackUrls: "https://base-rpc.publicnode.com"
  },
  42161: {
    environment: "ARBITRUM_RPC_URLS",
    fallbackUrls: "https://arbitrum-one-rpc.publicnode.com"
  },
  11155111: {
    environment: "ETHEREUM_SEPOLIA_RPC_URLS",
    fallbackUrls: "https://ethereum-sepolia-rpc.publicnode.com,https://rpc.sepolia.org"
  },
  51: {
    environment: "XDC_APOTHEM_RPC_URLS",
    fallbackUrls: "https://rpc.apothem.network,https://erpc.apothem.network"
  },
  80002: {
    environment: "POLYGON_AMOY_RPC_URLS",
    fallbackUrls: "https://polygon-amoy-bor-rpc.publicnode.com"
  },
  84532: {
    environment: "BASE_SEPOLIA_RPC_URLS",
    fallbackUrls: "https://base-sepolia-rpc.publicnode.com"
  },
  421614: {
    environment: "ARBITRUM_SEPOLIA_RPC_URLS",
    fallbackUrls: "https://arbitrum-sepolia-rpc.publicnode.com"
  }
};

export function getPaymentRpcUrls(
  chainId: number,
  environment: Record<string, string | undefined> = process.env
): string[] {
  const config = PAYMENT_RPC_CONFIG[chainId];
  if (!config) return [];
  return (environment[config.environment] || config.fallbackUrls)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
