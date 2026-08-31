"use client";

import { useCallback, useEffect, useState } from "react";

type ArchiveRevenueReport = {
  generatedAt: string;
  totals: {
    verifiedPurchases: number;
    amountAtomic: string;
  };
  plans: Array<{
    planYears: 1 | 3 | 7;
    verifiedPurchases: number;
    amountAtomic: string;
  }>;
  recentPayments: Array<{
    chainId: number;
    transactionHash: string;
    planYears: 1 | 3 | 7;
    amountAtomic: string;
    createdAt: string;
  }>;
};

export function AdminArchiveRevenue() {
  const [report, setReport] = useState<ArchiveRevenueReport>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/archive-revenue", {
        cache: "no-store",
      });
      const body = await response.json() as ArchiveRevenueReport & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "Archive revenue could not be loaded.");
      }
      setReport(body);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Archive revenue could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Treasury
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            Archive subscription revenue
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Server-verified USDC purchases only. Manual grants and administrator access are excluded.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric
          label="Verified revenue"
          value={report ? `${formatUsdc(report.totals.amountAtomic)} USDC` : "—"}
        />
        <Metric
          label="Verified purchases"
          value={report ? String(report.totals.verifiedPurchases) : "—"}
        />
        {[1, 3, 7].map((years) => {
          const plan = report?.plans.find((item) => item.planYears === years);
          return (
            <Metric
              key={years}
              label={`${years}-year plans`}
              value={plan ? String(plan.verifiedPurchases) : "0"}
            />
          );
        })}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3">Confirmed</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Revenue</th>
              <th className="px-4 py-3">Network</th>
              <th className="px-4 py-3">Transaction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {report?.recentPayments.map((payment) => (
              <tr key={`${payment.chainId}:${payment.transactionHash}`}>
                <td className="px-4 py-3">
                  {new Date(payment.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {payment.planYears} year{payment.planYears === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-3">
                  {formatUsdc(payment.amountAtomic)} USDC
                </td>
                <td className="px-4 py-3">
                  {payment.chainId === 51 ? "XDC Apothem" : `Chain ${payment.chainId}`}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={payment.chainId === 51
                      ? `https://testnet.xdcscan.com/tx/${payment.transactionHash}`
                      : `https://xdcscan.com/tx/${payment.transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-teal-700 underline"
                  >
                    {payment.transactionHash.slice(0, 12)}…
                  </a>
                </td>
              </tr>
            ))}
            {!loading && !report?.recentPayments.length ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-slate-500">
                  No verified archive purchases have been recorded.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div aria-live="polite">
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </div>
      {report?.generatedAt ? (
        <p className="mt-3 text-xs text-slate-500">
          Generated {new Date(report.generatedAt).toLocaleString()}.
        </p>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function formatUsdc(value: string) {
  const atomic = BigInt(value || "0");
  const whole = atomic / 1_000_000n;
  const fraction = (atomic % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
