"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { PaymentReceiptDialog } from "../../components/PaymentReceiptDialog";
import {
  NETWORKS,
  displayRoute,
  formatAtomic,
  networkName,
  paymentKind,
  shortAddress,
  type PaymentReceiptRecord
} from "../../lib/paymentReceipt";

type ArchiveAccess = {
  crossChainHistoryAllowed: boolean;
  mode: "enforcement_disabled" | "trial_not_started" | "trial" | "subscription" | "subscription_required";
  trialStartedAt: string | null;
  trialEndsAt: string | null;
};

type Filters = {
  from: string;
  to: string;
  token: string;
  sourceChainId: string;
  destinationChainId: string;
  name: string;
  counterparty: string;
  direction: string;
  transactionType: string;
  completionMethod: string;
};

const EMPTY_FILTERS: Filters = {
  from: "",
  to: "",
  token: "",
  sourceChainId: "",
  destinationChainId: "",
  name: "",
  counterparty: "",
  direction: "",
  transactionType: "",
  completionMethod: ""
};

export default function PaymentHistoryPage() {
  const { address, isConnected } = useAccount();
  const signer = useSignMessage();
  const [records, setRecords] = useState<PaymentReceiptRecord[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentReceiptRecord | null>(null);
  const [archiveAccess, setArchiveAccess] = useState<ArchiveAccess>();
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRecords([]);
    setArchiveAccess(undefined);
    setSelectedReceipt(null);
    setLoaded(false);
    setError("");
  }, [address]);

  async function signedChallenge() {
    if (!address) throw new Error("Connect your wallet to continue.");
    const challengeResponse = await fetch("/api/payment-history/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address })
    });
    const challenge = await challengeResponse.json() as {
      challengeId?: string;
      message?: string;
      error?: string;
    };
    if (!challengeResponse.ok || !challenge.challengeId || !challenge.message) {
      throw new Error(challenge.error || "Payment history could not be unlocked.");
    }
    const signature = await signer.signMessageAsync({ message: challenge.message });
    return { challengeId: challenge.challengeId, signature };
  }

  async function unlockHistory() {
    if (!address || signer.isPending) return;
    setError("");
    setLoading(true);
    try {
      if (filters.from && filters.to && filters.from > filters.to) {
        throw new Error("The start date must be before the end date.");
      }
      const authorization = await signedChallenge();
      const historyResponse = await fetch("/api/payment-history/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...authorization, filters: filterPayload(filters) })
      });
      const history = await historyResponse.json() as {
        records?: PaymentReceiptRecord[];
        archiveAccess?: ArchiveAccess;
        error?: string;
      };
      if (!historyResponse.ok || !history.records) {
        throw new Error(history.error || "Payment history could not be loaded.");
      }
      setRecords(history.records);
      setArchiveAccess(history.archiveAccess);
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function exportCsv() {
    if (!address || signer.isPending || exporting) return;
    setError("");
    setExporting(true);
    try {
      if (filters.from && filters.to && filters.from > filters.to) {
        throw new Error("The start date must be before the end date.");
      }
      const authorization = await signedChallenge();
      const response = await fetch("/api/payment-history/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...authorization,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          filters: filterPayload(filters)
        })
      });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error || "Payment history export failed.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFilename(filters);
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment history export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-700">
        Private payment records
      </p>
      <h1 className="mt-4 text-5xl font-bold tracking-tight text-slate-950">
        Payment history
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Sign a gasless message to view or export payments where your wallet was the request creator or actual payer.
      </p>

      <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <button
          type="button"
          disabled={!isConnected || signer.isPending || loading}
          onClick={unlockHistory}
          className="rounded-xl bg-slate-950 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {!isConnected
            ? "Connect wallet to continue"
            : signer.isPending || loading
              ? "Waiting for signature..."
              : loaded
                ? "Refresh private history"
                : "Unlock private history"}
        </button>
        <p className="mt-3 text-sm text-slate-500">
          The signature does not authorize a transaction and expires after five minutes.
        </p>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </section>

      {loaded && archiveAccess ? <ArchiveAccessNotice access={archiveAccess} /> : null}

      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Filter and export transaction history</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Apply filters to the on-screen history or CSV. The export includes separate UTC and browser-local time columns.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!isConnected || signer.isPending || loading}
            onClick={unlockHistory}
            className="rounded-xl border border-teal-700 px-6 py-3 font-semibold text-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Loading..." : "Apply to history"}
          </button>
          <button
            type="button"
            disabled={!isConnected || signer.isPending || exporting}
            onClick={exportCsv}
            className="rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? "Preparing CSV..." : "Download CSV"}
          </button>
          </div>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            From date
            <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            To date
            <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Asset
            <select value={filters.token} onChange={(event) => setFilters({ ...filters, token: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal">
              <option value="">All assets</option>
              <option value="USDC">USDC</option>
              <option value="XDC">XDC</option>
              <option value="TXDC">TXDC</option>
              <option value="ETH">ETH</option>
              <option value="POL">POL</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            XNS ID
            <input value={filters.name} onChange={(event) => setFilters({ ...filters, name: event.target.value })} placeholder="alice.xdc" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" />
          </label>
          <NetworkSelect label="Source network" value={filters.sourceChainId} onChange={(sourceChainId) => setFilters({ ...filters, sourceChainId })} />
          <NetworkSelect label="Destination network" value={filters.destinationChainId} onChange={(destinationChainId) => setFilters({ ...filters, destinationChainId })} />
          <label className="text-sm font-semibold text-slate-700">
            Direction
            <select value={filters.direction} onChange={(event) => setFilters({ ...filters, direction: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal">
              <option value="">Incoming and outgoing</option>
              <option value="incoming">Incoming</option>
              <option value="outgoing">Outgoing</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Transaction type
            <select value={filters.transactionType} onChange={(event) => setFilters({ ...filters, transactionType: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal">
              <option value="">All transaction types</option>
              <option value="native">Native transfer</option>
              <option value="same_chain_usdc">Same-chain USDC</option>
              <option value="cross_chain_usdc">Cross-chain USDC</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Completion method
            <select value={filters.completionMethod} onChange={(event) => setFilters({ ...filters, completionMethod: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal">
              <option value="">All completion methods</option>
              <option value="direct">Direct</option>
              <option value="standard">Standard</option>
              <option value="automatic">Automatic forwarding</option>
              <option value="recovered">Recovered</option>
              <option value="wallet">Wallet</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Counterparty wallet
            <input value={filters.counterparty} onChange={(event) => setFilters({ ...filters, counterparty: event.target.value })} placeholder="0x..." className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" />
          </label>
        </div>
        <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="mt-5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          Clear filters
        </button>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          CSV exports exclude raw RPC responses, CCTP attestations, approval hashes, recovery payloads and internal error details.
        </p>
      </section>

      {loaded ? (
        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Unlocked private history</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950">Your payments</h2>
            </div>
            <p className="text-sm text-slate-500">Select a payment to view or download its receipt.</p>
          </div>
          {records.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
              No completed payments were found for this wallet.
            </div>
          ) : <PaymentRecords records={records} onSelect={setSelectedReceipt} />}
        </section>
      ) : null}
      <PaymentReceiptDialog record={selectedReceipt} onClose={() => setSelectedReceipt(null)} />
    </main>
  );
}

function PaymentRecords({ records, onSelect }: { records: PaymentReceiptRecord[]; onSelect: (record: PaymentReceiptRecord) => void }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-4">Payment</th>
                <th className="px-5 py-4">Counterparty</th>
                <th className="px-5 py-4">Route</th>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4 text-right">Amount</th>
                <th className="px-5 py-4"><span className="sr-only">Receipt</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((record) => {
                const counterparty = record.direction === "incoming" ? record.payer : record.creator;
                return (
                  <tr key={record.id} className="group cursor-pointer transition hover:bg-teal-50/60 focus-within:bg-teal-50/60" onClick={() => onSelect(record)}>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">{displayRoute(record)}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <span className={"rounded-full px-2 py-0.5 font-semibold " + (record.direction === "incoming" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800")}>{record.direction === "incoming" ? "Incoming" : "Outgoing"}</span>
                        <span>{paymentKind(record)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-slate-600" title={counterparty}>{shortAddress(counterparty)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{networkName(record.sourceChainId)} → {networkName(record.destinationChainId)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{new Date(record.completedAt).toLocaleDateString()}<span className="block text-xs text-slate-400">{new Date(record.completedAt).toLocaleTimeString()}</span></td>
                    <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate-950 tabular-nums">{formatAtomic(record.amountAtomic, record.tokenDecimals)} {record.token}<span className="mt-1 block text-xs font-medium text-emerald-700">Completed</span></td>
                    <td className="px-5 py-4 text-right">
                      <button type="button" className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition group-hover:border-teal-300 group-hover:bg-white group-hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600" onClick={(event) => { event.stopPropagation(); onSelect(record); }} aria-label={"Open receipt for " + displayRoute(record)}>Receipt</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {records.map((record) => {
          const counterparty = record.direction === "incoming" ? record.payer : record.creator;
          return (
            <button key={record.id} type="button" onClick={() => onSelect(record)} className="w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-teal-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-600">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">{displayRoute(record)}</p>
                  <p className="mt-1 text-sm text-slate-500">{paymentKind(record)} · {record.direction === "incoming" ? "Incoming" : "Outgoing"}</p>
                </div>
                <p className="shrink-0 text-right font-semibold text-slate-950 tabular-nums">{formatAtomic(record.amountAtomic, record.tokenDecimals)}<span className="ml-1 text-sm text-slate-500">{record.token}</span></p>
              </div>
              <div className="mt-4 flex items-end justify-between gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <div><p>{networkName(record.sourceChainId)} → {networkName(record.destinationChainId)}</p><p className="mt-1 font-mono" title={counterparty}>{shortAddress(counterparty)}</p></div>
                <div className="text-right"><p>{new Date(record.completedAt).toLocaleDateString()}</p><p className="mt-1 font-semibold text-teal-700">View receipt →</p></div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function ArchiveAccessNotice({ access }: { access: ArchiveAccess }) {
  if (access.mode === "enforcement_disabled") return null;
  const content = {
    trial_not_started: {
      title: "Your cross-chain history trial has not started",
      body: "Your one-time free trial begins when your first XDCID cross-chain payment completes."
    },
    trial: {
      title: "Cross-chain history trial active",
      body: access.trialEndsAt
        ? "Cross-chain history is included until " + new Date(access.trialEndsAt).toLocaleString() + "."
        : "Cross-chain history is currently included."
    },
    subscription: {
      title: "Cross-chain archive access active",
      body: "Your archive entitlement currently includes retained cross-chain history and exports."
    },
    subscription_required: {
      title: "Cross-chain archive subscription required",
      body: "Your one-time trial has ended. Same-chain history remains visible, while cross-chain records, exports and receipts require archive access."
    }
  }[access.mode];
  return (
    <section className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950">
      <h2 className="font-semibold">{content.title}</h2>
      <p className="mt-2 text-sm leading-6">{content.body}</p>
    </section>
  );
}

function NetworkSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal">
        <option value="">All networks</option>
        {NETWORKS.map(([chainId, name]) => <option key={chainId} value={chainId}>{name}</option>)}
      </select>
    </label>
  );
}

function filterPayload(filters: Filters) {
  return {
    from: filters.from ? new Date(filters.from + "T00:00:00").toISOString() : undefined,
    to: filters.to ? new Date(filters.to + "T23:59:59.999").toISOString() : undefined,
    token: filters.token || undefined,
    sourceChainId: filters.sourceChainId ? Number(filters.sourceChainId) : undefined,
    destinationChainId: filters.destinationChainId ? Number(filters.destinationChainId) : undefined,
    name: filters.name.trim() || undefined,
    counterparty: filters.counterparty.trim() || undefined,
    direction: filters.direction || undefined,
    transactionType: filters.transactionType || undefined,
    completionMethod: filters.completionMethod || undefined
  };
}

function exportFilename(filters: Filters): string {
  const range = filters.from || filters.to
    ? "-" + (filters.from || "start") + "-to-" + (filters.to || "now")
    : "-all";
  return "xdcid-payment-history" + range + ".csv";
}
