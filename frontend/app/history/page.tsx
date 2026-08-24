"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

type PaymentRecord = {
  id: string;
  name: string;
  creator: string;
  payer: string;
  amountAtomic: string;
  token: string;
  tokenDecimals: number;
  sourceChainId: number;
  destinationChainId: number;
  sourceTransactionHash: string;
  destinationTransactionHash: string | null;
  completedAt: string;
  privateContext?: {
    reference?: string;
    description?: string;
  };
};

type Filters = {
  from: string;
  to: string;
  token: string;
  sourceChainId: string;
  destinationChainId: string;
  name: string;
  counterparty: string;
};

const EMPTY_FILTERS: Filters = {
  from: "",
  to: "",
  token: "",
  sourceChainId: "",
  destinationChainId: "",
  name: "",
  counterparty: ""
};

const NETWORKS = [
  [50, "XDC Network"],
  [1, "Ethereum"],
  [137, "Polygon"],
  [8453, "Base"],
  [42161, "Arbitrum One"],
  [51, "XDC Apothem"],
  [11155111, "Ethereum Sepolia"],
  [80002, "Polygon Amoy"],
  [84532, "Base Sepolia"],
  [421614, "Arbitrum Sepolia"]
] as const;

export default function PaymentHistoryPage() {
  const { address, isConnected } = useAccount();
  const signer = useSignMessage();
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

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
    try {
      const authorization = await signedChallenge();
      const historyResponse = await fetch("/api/payment-history/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(authorization)
      });
      const history = await historyResponse.json() as {
        records?: PaymentRecord[];
        error?: string;
      };
      if (!historyResponse.ok || !history.records) {
        throw new Error(history.error || "Payment history could not be loaded.");
      }
      setRecords(history.records);
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment history could not be loaded.");
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

  function downloadReceipt(record: PaymentRecord) {
    const amount = formatAtomic(record.amountAtomic, record.tokenDecimals);
    const completed = new Date(record.completedAt);
    const lines = [
      "XDCID PAYMENT RECEIPT",
      "",
      "Payment ID: " + record.id,
      "Completed UTC: " + completed.toISOString(),
      "Completed local: " + completed.toLocaleString(),
      "XNS ID: " + record.name,
      "Amount: " + amount + " " + record.token,
      "Payer: " + record.payer,
      "Recipient: " + record.creator,
      "Route: Chain " + record.sourceChainId + " to chain " + record.destinationChainId,
      "Source transaction: " + record.sourceTransactionHash,
      record.destinationTransactionHash
        ? "Destination transaction: " + record.destinationTransactionHash
        : "",
      record.privateContext?.reference
        ? "Reference: " + record.privateContext.reference
        : "",
      record.privateContext?.description
        ? "Description: " + record.privateContext.description
        : "",
      "",
      "This receipt was reconstructed from XDCID's minimal settlement record."
    ].filter(Boolean);
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "xdcid-receipt-" + record.id + ".txt";
    link.click();
    URL.revokeObjectURL(url);
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
          disabled={!isConnected || signer.isPending}
          onClick={unlockHistory}
          className="rounded-xl bg-slate-950 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {!isConnected
            ? "Connect wallet to continue"
            : signer.isPending
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

      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Export transaction history</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Leave filters empty to export every authorized record. The CSV includes separate UTC and browser-local time columns.
            </p>
          </div>
          <button
            type="button"
            disabled={!isConnected || signer.isPending || exporting}
            onClick={exportCsv}
            className="rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? "Preparing CSV..." : "Download CSV"}
          </button>
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
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">
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
        <section className="mt-8 space-y-4">
          {records.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
              No completed payments were found for this wallet.
            </div>
          ) : records.map((record) => (
            <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">{record.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Local: {new Date(record.completedAt).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    UTC: {new Date(record.completedAt).toISOString()}
                  </p>
                </div>
                <strong className="text-lg text-slate-950">
                  {formatAtomic(record.amountAtomic, record.tokenDecimals)} {record.token}
                </strong>
              </div>
              <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                <div><dt className="text-slate-500">From</dt><dd className="break-all">{record.payer}</dd></div>
                <div><dt className="text-slate-500">To</dt><dd className="break-all">{record.creator}</dd></div>
                <div><dt className="text-slate-500">Route</dt><dd>Chain {record.sourceChainId} → chain {record.destinationChainId}</dd></div>
                <div><dt className="text-slate-500">Reference</dt><dd>{record.privateContext?.reference || "—"}</dd></div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-3">
                <a className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-800" href={explorerLink(record.sourceChainId, record.sourceTransactionHash)} target="_blank" rel="noreferrer">
                  Source transaction
                </a>
                {record.destinationTransactionHash ? (
                  <a className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-800" href={explorerLink(record.destinationChainId, record.destinationTransactionHash)} target="_blank" rel="noreferrer">
                    Destination transaction
                  </a>
                ) : null}
                <button type="button" onClick={() => downloadReceipt(record)} className="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white">
                  Download private receipt
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
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
    counterparty: filters.counterparty.trim() || undefined
  };
}

function exportFilename(filters: Filters): string {
  const range = filters.from || filters.to
    ? "-" + (filters.from || "start") + "-to-" + (filters.to || "now")
    : "-all";
  return "xdcid-payment-history" + range + ".csv";
}

function formatAtomic(value: string, decimals: number): string {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, "") : "";
  return (negative ? "-" : "") + whole + (fraction ? "." + fraction : "");
}

function explorerLink(chainId: number, hash: string): string {
  const bases: Record<number, string> = {
    1: "https://etherscan.io/tx/",
    50: "https://xdcscan.com/tx/",
    51: "https://testnet.xdcscan.com/tx/",
    137: "https://polygonscan.com/tx/",
    8453: "https://basescan.org/tx/",
    42161: "https://arbiscan.io/tx/",
    11155111: "https://sepolia.etherscan.io/tx/",
    80002: "https://amoy.polygonscan.com/tx/",
    84532: "https://sepolia.basescan.org/tx/",
    421614: "https://sepolia.arbiscan.io/tx/"
  };
  return (bases[chainId] || "https://xdcscan.com/tx/") + hash;
}
