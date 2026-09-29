"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnections } from "wagmi";
import { PAYMENT_NETWORK_ENV } from "../config/paymentNetworks";

type WalletEvent = {
  at: string;
  status: string;
  connector: string | null;
  chainId: number | null;
  address: string | null;
};

export function WalletDiagnostics() {
  const account = useAccount();
  const connections = useConnections();
  const [enabled, setEnabled] = useState(false);
  const [events, setEvents] = useState<WalletEvent[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEnabled(
      PAYMENT_NETWORK_ENV === "testnet" && params.get("walletDebug") === "1"
    );
  }, []);

  const current = useMemo<WalletEvent>(() => ({
    at: new Date().toISOString(),
    status: account.status,
    connector: account.connector
      ? `${account.connector.name} (${account.connector.id})`
      : null,
    chainId: account.chainId ?? null,
    address: account.address ?? null
  }), [account.address, account.chainId, account.connector, account.status]);

  useEffect(() => {
    if (!enabled) return;
    setEvents((existing) => [...existing.slice(-7), current]);
  }, [current, enabled]);

  if (!enabled) return null;

  const snapshot = {
    account: current,
    connections: connections.map((connection) => ({
      accounts: connection.accounts,
      chainId: connection.chainId,
      connector: `${connection.connector.name} (${connection.connector.id})`
    })),
    events
  };

  return (
    <aside className="fixed bottom-3 right-3 z-[100] w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-amber-300 bg-slate-950 p-4 text-xs text-white shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Dev wallet diagnostics</p>
        <button
          className="rounded-lg border border-slate-600 px-2 py-1 hover:bg-slate-800"
          onClick={() => void navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2))}
          type="button"
        >
          Copy
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 font-mono">
        <dt className="text-slate-400">Status</dt><dd>{current.status}</dd>
        <dt className="text-slate-400">Connector</dt><dd className="truncate">{current.connector || "none"}</dd>
        <dt className="text-slate-400">Chain</dt><dd>{current.chainId || "none"}</dd>
        <dt className="text-slate-400">Address</dt><dd className="truncate">{current.address || "none"}</dd>
        <dt className="text-slate-400">Events</dt><dd>{events.length}</dd>
      </dl>
    </aside>
  );
}
