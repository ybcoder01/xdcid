"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useConfig } from "wagmi";

const RESTORE_TIMEOUT_MS = 6_000;

export function useRecoverableWalletConnection() {
  const { status } = useAccount();
  const config = useConfig();
  const { openConnectModal } = useConnectModal();
  const [connectionTimedOut, setConnectionTimedOut] = useState(false);
  const [openAfterReset, setOpenAfterReset] = useState(false);

  useEffect(() => {
    if (status !== "connecting" && status !== "reconnecting") {
      setConnectionTimedOut(false);
      return;
    }

    const timeout = window.setTimeout(
      () => setConnectionTimedOut(true),
      RESTORE_TIMEOUT_MS
    );
    return () => window.clearTimeout(timeout);
  }, [status]);

  useEffect(() => {
    if (!openAfterReset || status !== "disconnected") return;
    setOpenAfterReset(false);
    openConnectModal?.();
  }, [openAfterReset, openConnectModal, status]);

  const requestConnection = useCallback(async () => {
    if (status === "connecting" || status === "reconnecting") {
      const { connections, current } = config.state;
      const connector = current ? connections.get(current)?.connector : undefined;
      config.setState((existing) => ({
        ...existing,
        connections: new Map(),
        current: null,
        status: "disconnected"
      }));
      try {
        await config.storage?.removeItem("recentConnectorId");
      } catch {
        // The in-memory reset is sufficient if persistent storage is unavailable.
      }
      void Promise.resolve(connector?.disconnect()).catch(() => undefined);
      setOpenAfterReset(true);
      return;
    }
    openConnectModal?.();
  }, [config, openConnectModal, status]);

  return {
    canRequestConnection: Boolean(openConnectModal),
    requestConnection,
    connectionTimedOut
  };
}
