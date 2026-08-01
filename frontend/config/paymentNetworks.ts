export const USDC_DECIMALS = 6;

export const CCTP_TOKEN_MESSENGER_V2 =
  "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" as const;

export const CCTP_MESSAGE_TRANSMITTER_V2 =
  "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64" as const;

export const PAYMENT_NETWORKS = [
  {
    key: "ethereum",
    name: "Ethereum",
    chainId: 1,
    circleDomain: 0,
    nativeSymbol: "ETH",
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
  },
  {
    key: "xdc",
    name: "XDC Network",
    chainId: 50,
    circleDomain: 18,
    nativeSymbol: "XDC",
    usdcAddress: "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1"
  },
  {
    key: "polygon",
    name: "Polygon",
    chainId: 137,
    circleDomain: 7,
    nativeSymbol: "POL",
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
  },
  {
    key: "base",
    name: "Base",
    chainId: 8453,
    circleDomain: 6,
    nativeSymbol: "ETH",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  },
  {
    key: "arbitrum",
    name: "Arbitrum One",
    chainId: 42161,
    circleDomain: 3,
    nativeSymbol: "ETH",
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
  }
] as const;

export type PaymentNetwork = (typeof PAYMENT_NETWORKS)[number];
export type PaymentChainId = PaymentNetwork["chainId"];

export function getPaymentNetwork(chainId: number): PaymentNetwork | undefined {
  return PAYMENT_NETWORKS.find((network) => network.chainId === chainId);
}
