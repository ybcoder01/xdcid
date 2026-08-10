"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUnits } from "viem";
import { getPaymentNetwork } from "../config/paymentNetworks";

type MonitorStatus =
  | "in-progress"
  | "delayed"
  | "needs-attention"
  | "recovery-expired";

type MonitorReport = {
  generatedAt: string;
  thresholds: {
    delayedMinutes: number;
    needsAttentionMinutes: number;
  };
  counts: Record<MonitorStatus, number>;
  routes: Array<{
    sourceChainId: number;
    destinationChainId: number;
    outstandingCount: number;
    warningCount: number;
  }>;
  records: Array<{
    feeTransactionHash: string;
    sourceChainId: number;
    destinationChainId: number;
    payer: string;
    recipient: string;
    recipientAmount: string;
    convenienceFeeAmount: string;
    createdAt: string;
    expiresAt: string;
    ageMinutes: number;
    status: MonitorStatus;
    recommendation: string;
  }>;
};

function networkName(chainId: number): string {
  return getPaymentNetwork(chainId)?.name || `Chain ${chainId}`;
}

function statusLabel(status: MonitorStatus): string {
  if (status === "in-progress") return "In progress";
  if (status === "needs-attention") return "Needs attention";
  if (status === "recovery-expired") return "Recovery expired";
  return "Delayed";
}

function statusClasses(status: MonitorStatus): string {
  if (status === "in-progress") return "bg-blue-100 text-blue-800";
  if (status === "delayed") return "bg-amber-100 text-amber-900";
  return "bg-red-100 text-red-800";
}

function formatUsdc(value: string): string {
  try {
    return `${formatUnits(BigInt(value), 6)} USDC`;
  } catch {
    return `${value} base units`;
  }
}

export function AdminPaymentMonitor() {
  const [report, setReport] = useState<MonitorReport>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/payments/monitor", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await response.json() as MonitorReport & { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Payment monitoring failed.");
      }
      setReport(body);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Payment monitoring failed.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">
            Payment flow monitor
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Read-only alerts for verified forwarding fees that do not yet have a recorded burn.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
        >
          {loading ? "Checking..." : "Refresh"}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="In progress" value={report?.counts["in-progress"]} />
        <Metric label="Delayed" value={report?.counts.delayed} />
        <Metric label="Needs attention" value={report?.counts["needs-attention"]} />
        <Metric label="Recovery expired" value={report?.counts["recovery-expired"]} />
      </div>

      {report?.routes.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {report.routes.map((route) => (
            <span
              key={`${route.sourceChainId}:${route.destinationChainId}`}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
            >
              {networkName(route.sourceChainId)} → {networkName(route.destinationChainId)}:{" "}
              <strong>{route.warningCount}</strong> warnings /{" "}
              {route.outstandingCount} outstanding
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4">
        {report?.records.map((record) => (
          <article
            key={record.feeTransactionHash}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">
                  {networkName(record.sourceChainId)} →{" "}
                  {networkName(record.destinationChainId)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {formatUsdc(record.recipientAmount)} · {record.ageMinutes} minutes old
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(record.status)}`}>
                {statusLabel(record.status)}
              </span>
            </div>
            <p className="mt-4 break-all font-mono text-xs text-slate-700">
              {record.feeTransactionHash}
            </p>
            <p className="mt-3 text-sm text-slate-700">{record.recommendation}</p>
            <a
              href={`/admin?paymentSearch=${encodeURIComponent(record.feeTransactionHash)}#payment-recovery`}
              className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:text-teal-900"
            >
              Open recovery record
            </a>
          </article>
        ))}
      </div>

      {report && report.records.length === 0 ? (
        <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          No incomplete forwarding flows are currently retained.
        </p>
      ) : null}

      <p className="mt-3 text-xs text-slate-500">
        Delayed means at least {report?.thresholds.delayedMinutes || 15} minutes; needs attention means at least{" "}
        {report?.thresholds.needsAttentionMinutes || 60} minutes. Alerts do not prove funds are lost and never retry or move funds automatically.
        {report?.generatedAt
          ? ` Checked ${new Date(report.generatedAt).toLocaleString()}.`
          : ""}
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">
        {value ?? "—"}
      </p>
    </div>
  );
}
