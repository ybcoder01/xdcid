"use client";

import { Fragment, type ReactNode } from "react";
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
import { WagmiProvider, createConfig, http, useAccount } from "wagmi";
import {
  arbitrum,
  base,
  baseSepolia,
  mainnet,
  polygon,
  polygonAmoy,
  sepolia
} from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { arbitrumSepolia, xdcApothem } from "../config/cctp";
import { xdcMainnet } from "../config/contracts";
import { getRpcTransport } from "../config/rpcTransports";
import { PAYMENT_NETWORK_ENV } from "../config/paymentNetworks";
import { BASE_NETWORK_ICON_URL } from "./BaseNetworkLogo";
import { WalletDiagnostics } from "./WalletDiagnostics";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
const defaultWalletChain =
  PAYMENT_NETWORK_ENV === "testnet" ? xdcApothem : xdcMainnet;

const baseMainnet = {
  ...base,
  iconUrl: BASE_NETWORK_ICON_URL,
  iconBackground: "#FFFFFF"
} as const;

const baseTestnet = {
  ...baseSepolia,
  iconUrl: BASE_NETWORK_ICON_URL,
  iconBackground: "#FFFFFF"
} as const;

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

const walletChains = PAYMENT_NETWORK_ENV === "testnet"
  ? [xdcApothem, sepolia, polygonAmoy, arbitrumSepolia, baseTestnet] as const
  : [xdcMainnet, mainnet, polygon, arbitrum, baseMainnet] as const;

const config = createConfig({
  chains: walletChains,
  connectors,
  multiInjectedProviderDiscovery: false,
  transports: {
    [xdcMainnet.id]: getRpcTransport(50),
    [mainnet.id]: getRpcTransport(1),
    [polygon.id]: getRpcTransport(137),
    [arbitrum.id]: getRpcTransport(42161),
    [base.id]: getRpcTransport(8453),
    [sepolia.id]: http(sepolia.rpcUrls.default.http[0]),
    [polygonAmoy.id]: http(polygonAmoy.rpcUrls.default.http[0]),
    [baseSepolia.id]: http(baseSepolia.rpcUrls.default.http[0]),
    [arbitrumSepolia.id]: http(arbitrumSepolia.rpcUrls.default.http[0]),
    [xdcApothem.id]: http(xdcApothem.rpcUrls.default.http[0])
  },
  ssr: true
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={defaultWalletChain}>
          <WalletSessionBoundary>{children}</WalletSessionBoundary>
          {PAYMENT_NETWORK_ENV === "testnet" ? <WalletDiagnostics /> : null}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function WalletSessionBoundary({ children }: { children: ReactNode }) {
  const { address, status } = useAccount();
  const walletSession =
    status === "connected" && address
      ? `connected:${address.toLowerCase()}`
      : `wallet:${status}`;

  return <Fragment key={walletSession}>{children}</Fragment>;
}
