import { getAddress } from "viem";

export const APOTHEM_PRICING = {
  chainId: 51,
  registry: getAddress("0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1"),
  legacyRegistry: getAddress("0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0"),
  pricingPolicy: getAddress("0xB082dE6B5E6cAaA4752e36CF173e4325a5AaAF91"),
  registrar: getAddress("0x29cDc15B0Ff1AD8dCBa69E7218810a8868878a8A"),
  usdc: getAddress("0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4"),
  expectedWallet: getAddress("0x9c67d6cfE6A73497e7348b6b852495CA6236C29a"),
  explorerUrl: "https://testnet.xdcscan.com",
  rpcUrl: "https://rpc.apothem.network",
} as const;

export const apothem = {
  id: APOTHEM_PRICING.chainId,
  name: "XDC Apothem",
  nativeCurrency: { name: "Test XDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: { default: { http: [APOTHEM_PRICING.rpcUrl] } },
  blockExplorers: {
    default: { name: "XDCScan Testnet", url: APOTHEM_PRICING.explorerUrl },
  },
} as const;
