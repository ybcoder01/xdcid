"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { getPaymentNetwork } from "../config/paymentNetworks";

type RevenueReport = {
  generatedAt: string;
  trendDays: number;
  totals: {
    verifiedFeeCount: number;
    convenienceFeeAmount: string;
    recipientVolume: string;
    burnRecordedCount: number;
  };
  routes: Array<{
    sourceChainId: number;
    destinationChainId: number;
    verifiedFeeCount: number;
    convenienceFeeAmount: string;
    recipientVolume: string;
    burnRecordedCount: number;
  }>;
  daily: Array<{
    date: string;
    verifiedFeeCount: number;
    convenienceFeeAmount: string;
    recipientVolume: string;
    burnRecordedCount: number;
  }>;
};

function formatUsdc(value: string): string {
  try {
    const formatted = formatUnits(BigInt(value), 6);
    return formatted.includes(".")
      ? formatted.replace(/0+$/, "").replace(/\.$/, "")
      : formatted;
  } catch {
    return "0";
  }
}

function networkName(chainId: number): string {
  return getPaymentNetwork(chainId)?.name || `Chain ${chainId}`;
}

export function AdminRevenueReport() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<RevenueReport>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/revenue?days=${days}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await response.json() as RevenueReport & { error?: string };
      if (!response.ok) throw new Error(body.error || "Revenue report failed.");
      setReport(body);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Revenue report failed.",
      );
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const maximumDailyFee = useMemo(
    () =>
      report?.daily.reduce(
        (maximum, row) => {
          const value = BigInt(row.convenienceFeeAmount);
          return value > maximum ? value : maximum;
        },
        0n,
      ) || 0n,
    [report],
  );

  const completionRate =
    report && report.totals.verifiedFeeCount > 0
      ? Math.round(
          (report.totals.burnRecordedCount /
            report.totals.verifiedFeeCount) *
            100,
        )
      : 0;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">
            Forwarding revenue
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Verified XDCID convenience fees. Circle forwarding fees are excluded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">
            Trend
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadReport()}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Verified revenue"
          value={report ? `${formatUsdc(report.totals.convenienceFeeAmount)} USDC` : "—"}
        />
        <MetricCard
          label="Forwarding volume"
          value={report ? `${formatUsdc(report.totals.recipientVolume)} USDC` : "—"}
        />
        <MetricCard
          label="Verified fees"
          value={report ? String(report.totals.verifiedFeeCount) : "—"}
        />
        <MetricCard
          label="Burn recorded"
          value={report ? `${completionRate}%` : "—"}
          detail={
            report
              ? `${report.totals.burnRecordedCount} of ${report.totals.verifiedFeeCount}`
              : undefined
          }
        />
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-950">
            Daily convenience fees
          </h3>
          <p className="text-xs text-slate-500">
            Last {report?.trendDays || days} days
          </p>
        </div>
        {report?.daily.length ? (
          <div className="mt-5 flex h-44 items-end gap-2 overflow-x-auto border-b border-slate-200 pb-2">
            {report.daily.map((row) => {
              const value = BigInt(row.convenienceFeeAmount);
              const height =
                maximumDailyFee > 0n
                  ? Math.max(6, Number((value * 100n) / maximumDailyFee))
                  : 6;
              return (
                <div
                  key={row.date}
                  className="group flex min-w-8 flex-1 flex-col items-center justify-end"
                  title={`${row.date}: ${formatUsdc(row.convenienceFeeAmount)} USDC`}
                >
                  <div
                    className="w-full rounded-t bg-teal-600 group-hover:bg-teal-700"
                    style={{ height: `${height}%` }}
                  />
                  <span className="mt-2 text-[10px] text-slate-500">
                    {row.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 text-sm text-slate-500">
            No verified forwarding fees were recorded in this period.
          </p>
        )}
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Route</th>
              <th className="px-4 py-3">Verified revenue</th>
              <th className="px-4 py-3">Volume</th>
              <th className="px-4 py-3">Fees</th>
              <th className="px-4 py-3">Burn recorded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {report?.routes.length ? (
              report.routes.map((route) => (
                <tr key={`${route.sourceChainId}:${route.destinationChainId}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {networkName(route.sourceChainId)} → {networkName(route.destinationChainId)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatUsdc(route.convenienceFeeAmount)} USDC
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatUsdc(route.recipientVolume)} USDC
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {route.verifiedFeeCount}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {route.burnRecordedCount}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No verified forwarding revenue recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Revenue is recorded only after the source-chain USDC fee transfer is verified. Burn-recorded status does not prove destination mint completion.
        {report?.generatedAt
          ? ` Generated ${new Date(report.generatedAt).toLocaleString()}.`
          : ""}
      </p>
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}
