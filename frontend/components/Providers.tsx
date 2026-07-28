"use client";

import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { xdcMainnet } from "../config/contracts";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
const connectors = walletConnectProjectId
  ? [injected(), walletConnect({ projectId: walletConnectProjectId, showQrModal: true })]
  : [injected()];

const config = createConfig({
  chains: [xdcMainnet],
  connectors,
  transports: {
    [xdcMainnet.id]: http(xdcMainnet.rpcUrls.default.http[0])
  }
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
