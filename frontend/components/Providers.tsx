"use client";

import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { connectorsForWallets, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  phantomWallet,
  rabbyWallet,
  safeWallet,
  walletConnectWallet
} from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arbitrumSepolia, xdcApothem } from "../config/cctp";
import { xdcMainnet } from "../config/contracts";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

const connectors = walletConnectProjectId
  ? connectorsForWallets(
      [
        {
          groupName: "Wallets",
          wallets: [
            safeWallet,
            metaMaskWallet,
            rabbyWallet,
            phantomWallet,
            walletConnectWallet,
            injectedWallet
          ]
        }
      ],
      {
        appName: "XDCID",
        projectId: walletConnectProjectId
      }
    )
  : [injected()];

const config = createConfig({
  chains: [xdcMainnet, arbitrumSepolia, xdcApothem],
  connectors,
  multiInjectedProviderDiscovery: false,
  transports: {
    [xdcMainnet.id]: http(xdcMainnet.rpcUrls.default.http[0]),
    [arbitrumSepolia.id]: http(arbitrumSepolia.rpcUrls.default.http[0]),
    [xdcApothem.id]: http(xdcApothem.rpcUrls.default.http[0])
  },
  ssr: true
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
