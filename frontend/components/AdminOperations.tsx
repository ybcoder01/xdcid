"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useBlockNumber } from "wagmi";
import {
  CCTP_MESSAGE_TRANSMITTER_V2,
  CCTP_TOKEN_MESSENGER_V2,
  PAYMENT_NETWORKS,
  type PaymentNetwork,
} from "../config/paymentNetworks";
import { getRpcUrls } from "../config/rpcTransports";
import {
  XDCID_CONVENIENCE_FEE_BPS,
  XDCID_FEE_RECIPIENT,
  XDCID_MAX_CONVENIENCE_FEE,
  XDCID_MIN_CONVENIENCE_FEE,
} from "../lib/cctpMainnet";
import { getPaymentRouteCapability } from "../lib/paymentRouteCapabilities";
import { AdminPaymentMonitor } from "./AdminPaymentMonitor";
import { AdminPaymentRecovery } from "./AdminPaymentRecovery";
import { AdminRevenueReport } from "./AdminRevenueReport";

type HealthResponse = {
  checkedAt: string;
  database: {
    configured: boolean;
    healthy: boolean;
    latencyMs: number | null;
  };
};

function StatusBadge({
  healthy,
  children,
}: {
  healthy: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " +
        (healthy
          ? "bg-emerald-100 text-emerald-800"
          : "bg-red-100 text-red-700")
      }
    >
      {children}
    </span>
  );
}

function NetworkHealthCard({ network }: { network: PaymentNetwork }) {
  const block = useBlockNumber({
    chainId: network.chainId,
    query: { refetchInterval: 30_000 },
  });
  const healthy = block.data !== undefined && !block.isError;
  const rpcCount = getRpcUrls(network.chainId).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-950">{network.name}</p>
          <p className="mt-1 text-xs text-slate-500">Chain ID {network.chainId}</p>
        </div>
        <StatusBadge healthy={healthy}>
          {block.isLoading ? "Checking" : healthy ? "RPC online" : "RPC error"}
        </StatusBadge>
      </div>
      <p className="mt-4 text-xs text-slate-600">
        Latest block: {block.data?.toString() || "Unavailable"}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Fallback providers: {rpcCount}
      </p>
      <p className="mt-1 break-all text-xs text-slate-500">
        USDC: {network.usdcAddress}
      </p>
    </div>
  );
}

export function AdminOperations() {
  const [health, setHealth] = useState<HealthResponse>();
  const [healthError, setHealthError] = useState("");
  const [checking, setChecking] = useState(false);

  const refreshHealth = useCallback(async () => {
    setChecking(true);
    setHealthError("");
    try {
      const response = await fetch("/api/admin/health", { cache: "no-store" });
      const body = await response.json() as HealthResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || "Health check failed.");
      setHealth(body);
    } catch (error) {
      setHealthError(
        error instanceof Error ? error.message : "Health check failed.",
      );
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  const routes = PAYMENT_NETWORKS.flatMap((source) =>
    PAYMENT_NETWORKS.map((destination) => ({
      source,
      destination,
      capability: getPaymentRouteCapability(
        source.chainId,
        destination.chainId,
      ),
    })),
  );

  return (
    <div className="mt-8 grid gap-8">
      <AdminPaymentMonitor />

      <AdminRevenueReport />

      <AdminPaymentRecovery />

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">
              System health
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Live RPC and database checks. No secrets or user records are exposed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshHealth()}
            disabled={checking}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
          >
            {checking ? "Checking..." : "Refresh status"}
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PAYMENT_NETWORKS.map((network) => (
            <NetworkHealthCard key={network.chainId} network={network} />
          ))}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">Neon database</p>
                <p className="mt-1 text-xs text-slate-500">
                  Pay Links and forwarding recovery
                </p>
              </div>
              <StatusBadge healthy={Boolean(health?.database.healthy)}>
                {!health
                  ? "Checking"
                  : health.database.healthy
                    ? "Online"
                    : health.database.configured
                      ? "Error"
                      : "Not configured"}
              </StatusBadge>
            </div>
            <p className="mt-4 text-xs text-slate-600">
              Latency: {health?.database.latencyMs ?? "—"} ms
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Last checked:{" "}
              {health?.checkedAt
                ? new Date(health.checkedAt).toLocaleString()
                : "Waiting"}
            </p>
          </div>
        </div>
        {healthError ? (
          <p className="mt-3 text-sm text-red-600">{healthError}</p>
        ) : null}
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-slate-950">
          Payment route configuration
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          This reports deployed application configuration. Live RPC status is shown above.
        </p>
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Standard/direct</th>
                <th className="px-4 py-3">Automatic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {routes.map(({ source, destination, capability }) => (
                <tr key={source.chainId + ":" + destination.chainId}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {source.name}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {destination.name}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge healthy={capability.standardTransfer}>
                      {capability.standardTransfer ? "Configured" : "Unavailable"}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {source.chainId === destination.chainId
                      ? "Not applicable"
                      : capability.automaticForwarding === "mainnet-enabled"
                        ? "Mainnet enabled"
                        : capability.automaticForwarding}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-slate-950">
          Payment configuration
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Convenience fee</p>
            <dl className="mt-3 grid gap-2 text-xs text-slate-600">
              <div><dt>Rate</dt><dd className="font-semibold text-slate-900">{Number(XDCID_CONVENIENCE_FEE_BPS) / 100}%</dd></div>
              <div><dt>Minimum</dt><dd className="font-semibold text-slate-900">{Number(XDCID_MIN_CONVENIENCE_FEE) / 1_000_000} USDC</dd></div>
              <div><dt>Maximum</dt><dd className="font-semibold text-slate-900">{Number(XDCID_MAX_CONVENIENCE_FEE) / 1_000_000} USDC</dd></div>
              <div><dt>Recipient</dt><dd className="break-all font-mono text-slate-900">{XDCID_FEE_RECIPIENT}</dd></div>
            </dl>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Circle CCTP v2</p>
            <dl className="mt-3 grid gap-2 text-xs text-slate-600">
              <div><dt>Token Messenger</dt><dd className="break-all font-mono text-slate-900">{CCTP_TOKEN_MESSENGER_V2}</dd></div>
              <div><dt>Message Transmitter</dt><dd className="break-all font-mono text-slate-900">{CCTP_MESSAGE_TRANSMITTER_V2}</dd></div>
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
