"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";

const RESTORE_TIMEOUT_MS = 6_000;

export function useRecoverableWalletConnection() {
  const { status } = useAccount();
  const { disconnect } = useDisconnect();
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

  const requestConnection = useCallback(() => {
    if (status === "connecting" || status === "reconnecting") {
      setOpenAfterReset(true);
      disconnect();
      return;
    }
    openConnectModal?.();
  }, [disconnect, openConnectModal, status]);

  return {
    canRequestConnection: Boolean(openConnectModal),
    requestConnection,
    connectionTimedOut
  };
}
