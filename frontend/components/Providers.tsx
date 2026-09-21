"use client";

import { Fragment, type ReactNode, useEffect } from "react";
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
import { WagmiProvider, createConfig, http, useAccount, useConfig } from "wagmi";
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
          <WalletAccountSynchronizer />
          <WalletSessionBoundary>{children}</WalletSessionBoundary>
          {PAYMENT_NETWORK_ENV === "testnet" ? <WalletDiagnostics /> : null}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

type AccountAwareProvider = {
  request(args: { method: "eth_accounts" }): Promise<unknown>;
  on?(event: "accountsChanged", listener: (accounts: unknown) => void): void;
  removeListener?(
    event: "accountsChanged",
    listener: (accounts: unknown) => void
  ): void;
};

function WalletAccountSynchronizer() {
  const { connector, status } = useAccount();
  const config = useConfig();

  useEffect(() => {
    if (status !== "connected" || !connector) return;

    const activeConnector = connector;
    let active = true;
    let provider: AccountAwareProvider | undefined;

    function currentConnectorAccounts(): readonly string[] {
      const current = config.state.current;
      if (!current) return [];
      const connection = config.state.connections.get(current);
      return connection?.connector.uid === activeConnector.uid
        ? connection.accounts
        : [];
    }

    async function synchronize(accountsFromEvent?: unknown) {
      try {
        const value = accountsFromEvent ??
          await provider?.request({ method: "eth_accounts" });
        if (!active || !Array.isArray(value)) return;

        const accounts = value.filter(
          (account): account is string => typeof account === "string"
        );
        const currentAccounts = currentConnectorAccounts();
        const unchanged =
          accounts.length === currentAccounts.length &&
          accounts.every(
            (account, index) =>
              account.toLowerCase() === currentAccounts[index]?.toLowerCase()
          );

        if (!unchanged) activeConnector.onAccountsChanged(accounts);
      } catch {
        // The connector remains authoritative when a provider cannot be queried.
      }
    }

    const onAccountsChanged = (accounts: unknown) => {
      void synchronize(accounts);
    };
    const onResume = () => {
      void synchronize();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onResume();
    };

    void activeConnector.getProvider().then((value) => {
      if (!active || !value) return;
      provider = value as AccountAwareProvider;
      provider.on?.("accountsChanged", onAccountsChanged);
      void synchronize();
    });

    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      provider?.removeListener?.("accountsChanged", onAccountsChanged);
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [config, connector, status]);

  return null;
}

function WalletSessionBoundary({ children }: { children: ReactNode }) {
  const { address, status } = useAccount();
  const walletSession =
    status === "connected" && address
      ? `connected:${address.toLowerCase()}`
      : `wallet:${status}`;

  return <Fragment key={walletSession}>{children}</Fragment>;
}
