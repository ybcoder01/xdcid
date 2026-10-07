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
  const identity = useWalletXnsIdentity(address);
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

        const displayName = identity.name || account.displayName;
        return (
          <div ref={accountMenuRef} className={width + " relative"}>
            <div className={(compact ? "h-11 rounded-2xl " : "h-12 rounded-2xl ") + "xdc-wallet-control inline-flex w-full flex-nowrap items-center overflow-hidden border shadow-sm"}>
              <button
                type="button"
                className={(compact ? "h-11 w-11 " : "h-12 w-12 ") + "xdc-wallet-network grid shrink-0 place-items-center focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-600"}
                onClick={openChainModal}
                aria-label={"Change network from " + chain.name}
              >
                <NetworkLogo chainId={chain.id} size={24} />
              </button>
              <span className="xdc-wallet-divider h-5 w-px shrink-0" aria-hidden="true" />
              <button
                type="button"
                className={(compact ? "h-11 px-2 text-sm sm:px-3 " : "h-12 px-4 text-base ") + "xdc-wallet-account min-w-0 flex-1 truncate font-semibold focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-600"}
                onClick={() => setAccountMenuOpen((open) => !open)}
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                title={identity.name ? identity.name + " · " + account.address : account.address}
              >
                {displayName}
              </button>
            </div>
            {accountMenuOpen ? (
              <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-slate-200 bg-white p-2 text-sm shadow-xl" role="menu">
                <div className="border-b border-slate-100 px-3 py-2">
                  <p className="truncate font-semibold text-slate-950">{identity.name || "Connected wallet"}</p>
                  {identity.name && !identity.isPrimary ? (
                    <p className="mt-1 text-xs text-slate-500">Owned subdomain</p>
                  ) : null}
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

type WalletXnsIdentity = {
  name: string | null;
  isPrimary: boolean;
};

const EMPTY_IDENTITY: WalletXnsIdentity = { name: null, isPrimary: false };

function useWalletXnsIdentity(address?: string): WalletXnsIdentity {
  const [identity, setIdentity] = useState<WalletXnsIdentity>(EMPTY_IDENTITY);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!address) {
      setIdentity(EMPTY_IDENTITY);
      return;
    }
    try {
      const response = await fetch("/api/v1/reverse/" + address, { cache: "no-store", signal });
      const body = await response.json() as { data?: { name?: string | null; verified?: boolean } };
      if (response.ok && body.data?.verified && body.data.name) {
        setIdentity({ name: body.data.name, isPrimary: true });
        return;
      }

      const ownedResponse = await fetch(`/api/v1/addresses/${address}/subdomains`, {
        cache: "no-store",
        signal,
      });
      const ownedBody = await ownedResponse.json() as {
        data?: { subdomains?: Array<{ name?: string }> };
      };
      const names = ownedBody.data?.subdomains
        ?.map((record) => record.name)
        .filter((name): name is string => Boolean(name)) || [];
      setIdentity(
        ownedResponse.ok && names.length === 1
          ? { name: names[0], isPrimary: false }
          : EMPTY_IDENTITY,
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setIdentity(EMPTY_IDENTITY);
      }
    }
  }, [address]);

  useEffect(() => {
    const controller = new AbortController();
    setIdentity(EMPTY_IDENTITY);
    void refresh(controller.signal);
    function onPrimaryChanged(event: Event) {
      const detail = (event as CustomEvent<{ address?: string; name?: string }>).detail;
      if (detail?.address?.toLowerCase() === address?.toLowerCase() && detail.name) {
        setIdentity({ name: detail.name, isPrimary: true });
      }
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

  return identity;
}
