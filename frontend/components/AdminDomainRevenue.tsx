"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";

type Category =
  | "registration"
  | "renewal"
  | "subdomain-registration"
  | "subdomain-renewal"
  | "migration";
type Interval = "day" | "week" | "month";

type DomainRevenueReport = {
  generatedAt: string;
  trendDays: number;
  trendInterval: Interval;
  totals: { eventCount: number; netUsdMicros: string };
  assets: Array<{
    symbol: "XDC" | "USDC";
    tokenAddress: string;
    decimals: number;
    eventCount: number;
    paymentAmount: string;
    netUsdMicros: string;
  }>;
  categories: Array<{
    category: Category;
    eventCount: number;
    netUsdMicros: string;
  }>;
  trend: Array<{
    period: string;
    eventCount: number;
    netUsdMicros: string;
  }>;
  recentEvents: Array<{
    eventId: string;
    category: Category;
    symbol: "XDC" | "USDC";
    decimals: number;
    paymentAmount: string;
    netUsdMicros: string;
    transactionHash: string;
    occurredAt: string;
  }>;
  index: {
    complete: boolean;
    indexedThroughBlock: string;
    finalizedBlock: string;
  };
};

const categories: Category[] = [
  "registration",
  "renewal",
  "subdomain-registration",
  "subdomain-renewal",
  "migration",
];

export function AdminDomainRevenue() {
  const [days, setDays] = useState(30);
  const [interval, setInterval] = useState<Interval>("day");
  const [report, setReport] = useState<DomainRevenueReport>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        days: String(days),
        interval,
      });
      const response = await fetch(`/api/admin/domain-revenue?${query}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await response.json() as DomainRevenueReport & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "Domain revenue could not be loaded.");
      }
      setReport(body);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Domain revenue could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [days, interval]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const assets = useMemo(
    () => Object.fromEntries(report?.assets.map((asset) => [asset.symbol, asset]) || []),
    [report],
  );

  return (
    <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Treasury
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            Domain revenue
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Finalized Registrar V2 registrations, renewals, and subdomain payments. Wallets and names are not stored.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Coverage begins with the Registrar V2 activation; legacy registrar balances are outside this report.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Revenue reporting window"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
          </select>
          <select
            aria-label="Revenue trend interval"
            value={interval}
            onChange={(event) => setInterval(event.target.value as Interval)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
          >
            {loading ? "Indexing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {report && !report.index.complete ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Historical indexing is still in progress through block {report.index.indexedThroughBlock}. Refresh to continue.
        </p>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Quoted USD revenue"
          value={report ? `$${formatMicros(report.totals.netUsdMicros)}` : "—"}
        />
        <Metric
          label="XDC collected"
          value={assets.XDC ? `${formatAtomic(assets.XDC.paymentAmount, 18)} XDC` : "0 XDC"}
        />
        <Metric
          label="USDC collected"
          value={assets.USDC ? `${formatAtomic(assets.USDC.paymentAmount, 6)} USDC` : "0 USDC"}
        />
        <Metric
          label="Revenue events"
          value={report ? String(report.totals.eventCount) : "—"}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <ReportTable
          title="Revenue by activity"
          headings={["Activity", "Transactions", "Quoted USD"]}
          rows={categories.map((category) => {
            const row = report?.categories.find((item) => item.category === category);
            return [
              categoryLabel(category),
              String(row?.eventCount || 0),
              `$${formatMicros(row?.netUsdMicros || "0")}`,
            ];
          })}
        />
        <ReportTable
          title={`${intervalLabel(interval)} trend`}
          headings={["Period", "Transactions", "Quoted USD"]}
          empty="No finalized domain revenue in this period."
          rows={report?.trend.map((row) => [
            row.period,
            String(row.eventCount),
            `$${formatMicros(row.netUsdMicros)}`,
          ]) || []}
        />
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-950">
          Recent finalized revenue events
        </div>
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Confirmed</th>
              <th className="px-4 py-3">Activity</th>
              <th className="px-4 py-3">Collected</th>
              <th className="px-4 py-3">Quoted USD</th>
              <th className="px-4 py-3">Transaction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report?.recentEvents.length ? report.recentEvents.map((event) => (
              <tr key={event.eventId}>
                <td className="px-4 py-3">{new Date(event.occurredAt).toLocaleString()}</td>
                <td className="px-4 py-3">{categoryLabel(event.category)}</td>
                <td className="px-4 py-3">
                  {formatAtomic(event.paymentAmount, event.decimals)} {event.symbol}
                </td>
                <td className="px-4 py-3">${formatMicros(event.netUsdMicros)}</td>
                <td className="px-4 py-3">
                  <a
                    href={`https://${process.env.NEXT_PUBLIC_PAYMENT_NETWORK_ENV === "testnet" ? "testnet." : ""}xdcscan.com/tx/${event.transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-teal-700 underline"
                  >
                    {event.transactionHash.slice(0, 12)}…
                  </a>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No finalized domain revenue indexed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Quoted USD is the signed price accepted by the contract. XDC and USDC totals show the actual assets collected. Twelve confirmation blocks are required.
        {report?.generatedAt ? ` Updated ${new Date(report.generatedAt).toLocaleString()}.` : ""}
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ReportTable({
  title,
  headings,
  rows,
  empty,
}: {
  title: string;
  headings: string[];
  rows: string[][];
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-950">{title}</div>
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>{headings.map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length ? rows.map((row) => (
            <tr key={row.join(":")}>
              {row.map((value, index) => <td key={`${index}:${value}`} className="px-4 py-3">{value}</td>)}
            </tr>
          )) : (
            <tr><td colSpan={headings.length} className="px-4 py-6 text-center text-slate-500">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function categoryLabel(category: Category) {
  return {
    registration: "Registration",
    renewal: "Renewal",
    "subdomain-registration": "Subdomain registration",
    "subdomain-renewal": "Subdomain renewal",
    migration: "Migration (not active)",
  }[category];
}

function intervalLabel(interval: Interval) {
  return interval === "day" ? "Daily" : interval === "week" ? "Weekly" : "Monthly";
}

function formatMicros(value: string) {
  return formatAtomic(value, 6);
}

function formatAtomic(value: string, decimals: number) {
  try {
    const formatted = formatUnits(BigInt(value), decimals);
    const [whole, fraction] = formatted.split(".");
    if (!fraction) return whole;
    const trimmed = fraction.slice(0, 6).replace(/0+$/, "");
    return trimmed ? `${whole}.${trimmed}` : whole;
  } catch {
    return "0";
  }
}
