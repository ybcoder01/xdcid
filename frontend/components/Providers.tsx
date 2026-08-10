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
import { arbitrum, base, mainnet, polygon } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { arbitrumSepolia, xdcApothem } from "../config/cctp";
import { xdcMainnet } from "../config/contracts";
import { getRpcTransport } from "../config/rpcTransports";

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
  chains: [
    xdcMainnet,
    mainnet,
    polygon,
    arbitrum,
    base,
    arbitrumSepolia,
    xdcApothem
  ],
  connectors,
  multiInjectedProviderDiscovery: false,
  transports: {
    [xdcMainnet.id]: getRpcTransport(50),
    [mainnet.id]: getRpcTransport(1),
    [polygon.id]: getRpcTransport(137),
    [arbitrum.id]: getRpcTransport(42161),
    [base.id]: getRpcTransport(8453),
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
