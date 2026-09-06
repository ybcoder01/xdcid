"use client";

import { useCallback, useEffect, useState } from "react";

type Destination = {
  id: "registration" | "archive" | "forwarding";
  label: string;
  address: string | null;
  scope: string;
  status: "matched" | "mismatched" | "missing";
};

type DestinationReport = {
  designatedTreasury: string | null;
  aligned: boolean;
  destinations: Destination[];
};

export function AdminTreasuryDestinations() {
  const [report, setReport] = useState<DestinationReport>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/treasury-destinations", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = (await response.json()) as DestinationReport & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "Treasury destinations could not be loaded.");
      }
      setReport(body);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Treasury destinations could not be loaded.",
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Treasury controls
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            Revenue destinations
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            The on-chain registration treasury is the designated platform
            treasury. No funds can be moved from this panel.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {report ? (
        <div
          className={`mt-5 rounded-xl border p-4 text-sm ${
            report.aligned
              ? "border-teal-200 bg-teal-50 text-teal-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <p className="font-semibold">
            {report.aligned
              ? "All revenue destinations match the designated treasury."
              : "One or more revenue destinations need attention."}
          </p>
          <p className="mt-1 break-all font-mono text-xs">
            Designated: {report.designatedTreasury || "Not configured"}
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {report?.destinations.map((destination) => (
          <article
            key={destination.id}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-950">{destination.label}</h3>
              <Status status={destination.status} />
            </div>
            <p className="mt-2 text-xs text-slate-500">{destination.scope}</p>
            <p className="mt-3 break-all font-mono text-xs text-slate-700">
              {destination.address || "Not configured"}
            </p>
          </article>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Matching addresses on different networks still hold separate balances
        on those networks. Configuration changes remain independent so a
        single payment system can be migrated safely.
      </p>
    </section>
  );
}

function Status({ status }: { status: Destination["status"] }) {
  const styles = {
    matched: "bg-teal-100 text-teal-800",
    mismatched: "bg-amber-100 text-amber-900",
    missing: "bg-red-100 text-red-800",
  }[status];
  return (
    <span
      className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${styles}`}
    >
      {status}
    </span>
  );
}
