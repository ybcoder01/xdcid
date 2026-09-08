"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { TokenLogo, nativeTokenForChain } from "./TokenLogo";

export function WalletButton({ compact = false }: { compact?: boolean }) {
  if (compact) return <CompactWalletButton />;
  return <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />;
}

function CompactWalletButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        authenticationStatus,
        openAccountModal,
        openChainModal,
        openConnectModal,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        if (!connected) {
          return (
            <button
              type="button"
              className="h-11 w-[8.75rem] whitespace-nowrap rounded-2xl bg-slate-950 px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50 sm:w-44"
              disabled={!ready}
              onClick={openConnectModal}
            >
              Connect wallet
            </button>
          );
        }

        const iconUrl = typeof chain.iconUrl === "string" ? chain.iconUrl : undefined;
        return (
          <div className="inline-flex h-11 w-[8.75rem] flex-nowrap items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:w-44">
            <button
              type="button"
              className="grid h-11 w-11 shrink-0 place-items-center hover:bg-slate-50"
              onClick={openChainModal}
              aria-label={"Change network from " + chain.name}
            >
              {iconUrl ? (
                <span
                  aria-hidden="true"
                  className="block h-6 w-6 rounded-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${iconUrl})` }}
                />
              ) : (
                <TokenLogo symbol={nativeTokenForChain(chain.id)} size={24} />
              )}
            </button>
            <span className="h-5 w-px shrink-0 bg-slate-200" aria-hidden="true" />
            <button
              type="button"
              className="h-11 min-w-0 flex-1 truncate px-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 sm:px-3"
              onClick={openAccountModal}
              title={account.address}
            >
              {account.displayName}
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
