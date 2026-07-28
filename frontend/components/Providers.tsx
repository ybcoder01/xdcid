"use client";

import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { xdcMainnet } from "../config/contracts";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
const transport = http(xdcMainnet.rpcUrls.default.http[0]);

const config = walletConnectProjectId
  ? getDefaultConfig({
      appName: "XDCID",
      projectId: walletConnectProjectId,
      chains: [xdcMainnet],
      transports: {
        [xdcMainnet.id]: transport
      },
      ssr: true
    })
  : createConfig({
      chains: [xdcMainnet],
      connectors: [injected()],
      transports: {
        [xdcMainnet.id]: transport
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
