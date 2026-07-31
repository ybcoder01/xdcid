import { defineChain } from "viem";
import { arbitrumSepolia } from "viem/chains";

export { arbitrumSepolia };

export const xdcApothem = defineChain({
  id: 51,
  name: "XDC Apothem",
  nativeCurrency: { name: "Test XDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.apothem.network"] }
  },
  blockExplorers: {
    default: { name: "XDCScan Apothem", url: "https://testnet.xdcscan.com" }
  },
  testnet: true
});
