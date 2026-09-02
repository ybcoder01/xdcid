export const USDC_DECIMALS = 6;

export type PaymentNetworkEnvironment = "mainnet" | "testnet";

export type PaymentNetwork = {
  readonly key: string;
  readonly name: string;
  readonly chainId: number;
  readonly circleDomain: number;
  readonly nativeSymbol: string;
  readonly usdcAddress: `0x${string}`;
  readonly explorerUrl: string;
};

export const MAINNET_PAYMENT_NETWORKS = [
  {
    key: "ethereum",
    name: "Ethereum",
    chainId: 1,
    circleDomain: 0,
    nativeSymbol: "ETH",
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    explorerUrl: "https://etherscan.io"
  },
  {
    key: "xdc",
    name: "XDC Network",
    chainId: 50,
    circleDomain: 18,
    nativeSymbol: "XDC",
    usdcAddress: "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1",
    explorerUrl: "https://xdcscan.com"
  },
  {
    key: "polygon",
    name: "Polygon",
    chainId: 137,
    circleDomain: 7,
    nativeSymbol: "POL",
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    explorerUrl: "https://polygonscan.com"
  },
  {
    key: "base",
    name: "Base",
    chainId: 8453,
    circleDomain: 6,
    nativeSymbol: "ETH",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    explorerUrl: "https://basescan.org"
  },
  {
    key: "arbitrum",
    name: "Arbitrum One",
    chainId: 42161,
    circleDomain: 3,
    nativeSymbol: "ETH",
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    explorerUrl: "https://arbiscan.io"
  }
] as const satisfies readonly PaymentNetwork[];

export const TESTNET_PAYMENT_NETWORKS = [
  {
    key: "ethereum-sepolia",
    name: "Ethereum Sepolia",
    chainId: 11155111,
    circleDomain: 0,
    nativeSymbol: "ETH",
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    explorerUrl: "https://sepolia.etherscan.io"
  },
  {
    key: "xdc-apothem",
    name: "XDC Apothem",
    chainId: 51,
    circleDomain: 18,
    nativeSymbol: "TXDC",
    usdcAddress: "0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4",
    explorerUrl: "https://testnet.xdcscan.com"
  },
  {
    key: "polygon-amoy",
    name: "Polygon Amoy",
    chainId: 80002,
    circleDomain: 7,
    nativeSymbol: "POL",
    usdcAddress: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    explorerUrl: "https://amoy.polygonscan.com"
  },
  {
    key: "base-sepolia",
    name: "Base Sepolia",
    chainId: 84532,
    circleDomain: 6,
    nativeSymbol: "ETH",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    explorerUrl: "https://sepolia.basescan.org"
  },
  {
    key: "arbitrum-sepolia",
    name: "Arbitrum Sepolia",
    chainId: 421614,
    circleDomain: 3,
    nativeSymbol: "ETH",
    usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    explorerUrl: "https://sepolia.arbiscan.io"
  }
] as const satisfies readonly PaymentNetwork[];

export const PAYMENT_NETWORK_ENV: PaymentNetworkEnvironment =
  process.env.NEXT_PUBLIC_PAYMENT_NETWORK_ENV === "testnet"
    ? "testnet"
    : "mainnet";

export const PAYMENT_NETWORKS: readonly PaymentNetwork[] =
  PAYMENT_NETWORK_ENV === "testnet"
    ? TESTNET_PAYMENT_NETWORKS
    : MAINNET_PAYMENT_NETWORKS;

export const CCTP_TOKEN_MESSENGER_V2 =
  PAYMENT_NETWORK_ENV === "testnet"
    ? ("0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as const)
    : ("0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" as const);

export const CCTP_MESSAGE_TRANSMITTER_V2 =
  PAYMENT_NETWORK_ENV === "testnet"
    ? ("0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const)
    : ("0x81D40F21F12A8F0E3252Bccb954D722d4c464B64" as const);

export const CCTP_IRIS_API =
  PAYMENT_NETWORK_ENV === "testnet"
    ? "https://iris-api-sandbox.circle.com"
    : "https://iris-api.circle.com";

export function getPaymentNetwork(chainId: number): PaymentNetwork | undefined {
  return PAYMENT_NETWORKS.find((network) => network.chainId === chainId);
}
