"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useRecoverableWalletConnection } from "../lib/useRecoverableWalletConnection";
import { NetworkLogo } from "./NetworkLogo";

export const PRIMARY_NAME_CHANGED_EVENT = "xdcid:primary-name-changed";

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { address, status: accountStatus } = useAccount();
  const { disconnect } = useDisconnect();
  const { canRequestConnection, requestConnection, connectionTimedOut } =
    useRecoverableWalletConnection();
  const primaryName = usePrimaryXnsName(address);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [address]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        authenticationStatus,
        openChainModal,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected = ready && accountStatus === "connected" && account && chain && (!authenticationStatus || authenticationStatus === "authenticated");
        const width = compact ? "w-[8.75rem] sm:w-44" : "min-w-[10rem] max-w-[15rem]";

        if (!connected) {
          const waitingForConnection =
            (accountStatus === "connecting" || accountStatus === "reconnecting") &&
            !connectionTimedOut;
          return (
            <button
              type="button"
              className={(compact ? "h-11 rounded-2xl px-3 text-sm " : "h-12 rounded-2xl px-5 text-base ") + width + " whitespace-nowrap bg-slate-950 font-semibold text-white shadow-sm disabled:opacity-50"}
              disabled={!ready || waitingForConnection || !canRequestConnection}
              onClick={requestConnection}
            >
              {accountStatus === "connecting" && !connectionTimedOut
                ? "Connecting wallet…"
                : accountStatus === "reconnecting" && !connectionTimedOut
                  ? "Restoring wallet…"
                  : accountStatus === "connecting" || accountStatus === "reconnecting"
                    ? "Reconnect wallet"
                    : "Connect wallet"}
            </button>
          );
        }

        const displayName = primaryName || account.displayName;
        return (
          <div ref={accountMenuRef} className={width + " relative"}>
            <div className={(compact ? "h-11 rounded-2xl " : "h-12 rounded-2xl ") + "inline-flex w-full flex-nowrap items-center overflow-hidden border border-slate-200 bg-white shadow-sm"}>
              <button
                type="button"
                className={(compact ? "h-11 w-11 " : "h-12 w-12 ") + "grid shrink-0 place-items-center hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-600"}
                onClick={openChainModal}
                aria-label={"Change network from " + chain.name}
              >
                <NetworkLogo chainId={chain.id} size={24} />
              </button>
              <span className="h-5 w-px shrink-0 bg-slate-200" aria-hidden="true" />
              <button
                type="button"
                className={(compact ? "h-11 px-2 text-sm sm:px-3 " : "h-12 px-4 text-base ") + "min-w-0 flex-1 truncate font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-600"}
                onClick={() => setAccountMenuOpen((open) => !open)}
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                title={primaryName ? primaryName + " · " + account.address : account.address}
              >
                {displayName}
              </button>
            </div>
            {accountMenuOpen ? (
              <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-slate-200 bg-white p-2 text-sm shadow-xl" role="menu">
                <div className="border-b border-slate-100 px-3 py-2">
                  <p className="truncate font-semibold text-slate-950">{primaryName || "Connected wallet"}</p>
                  <p className="mt-1 truncate font-mono text-xs text-slate-500">{account.address}</p>
                </div>
                <button
                  type="button"
                  className="mt-1 w-full rounded-xl px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-50"
                  onClick={async () => {
                    await navigator.clipboard.writeText(account.address);
                    setAccountMenuOpen(false);
                  }}
                  role="menuitem"
                >
                  Copy wallet address
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-left font-semibold text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    disconnect();
                  }}
                  role="menuitem"
                >
                  Disconnect wallet
                </button>
              </div>
            ) : null}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

function usePrimaryXnsName(address?: string): string | null {
  const [primaryName, setPrimaryName] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!address) {
      setPrimaryName(null);
      return;
    }
    try {
      const response = await fetch("/api/v1/reverse/" + address, { cache: "no-store", signal });
      const body = await response.json() as { data?: { name?: string | null; verified?: boolean } };
      if (!response.ok || !body.data?.verified || !body.data.name) {
        setPrimaryName(null);
        return;
      }
      setPrimaryName(body.data.name);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setPrimaryName(null);
    }
  }, [address]);

  useEffect(() => {
    const controller = new AbortController();
    setPrimaryName(null);
    void refresh(controller.signal);
    function onPrimaryChanged(event: Event) {
      const detail = (event as CustomEvent<{ address?: string; name?: string }>).detail;
      if (detail?.address?.toLowerCase() === address?.toLowerCase() && detail.name) setPrimaryName(detail.name);
      else void refresh(controller.signal);
    }
    function onFocus() {
      void refresh(controller.signal);
    }
    window.addEventListener(PRIMARY_NAME_CHANGED_EVENT, onPrimaryChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      window.removeEventListener(PRIMARY_NAME_CHANGED_EVENT, onPrimaryChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, [address, refresh]);

  return primaryName;
}
