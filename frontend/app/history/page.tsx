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

export default function PaymentHistoryPage() {
  const { address, isConnected } = useAccount();
  const signer = useSignMessage();
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  async function unlockHistory() {
    if (!address || signer.isPending) return;
    setError("");
    try {
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
      const historyResponse = await fetch("/api/payment-history/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.challengeId, signature })
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

  function downloadReceipt(record: PaymentRecord) {
    const amount = formatAtomic(record.amountAtomic, record.tokenDecimals);
    const lines = [
      "XDCID PAYMENT RECEIPT",
      "",
      "Payment ID: " + record.id,
      "Completed: " + new Date(record.completedAt).toLocaleString(),
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
        Sign a gasless message to view payments where your wallet was the request creator or actual payer.
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
                    {new Date(record.completedAt).toLocaleString()}
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
