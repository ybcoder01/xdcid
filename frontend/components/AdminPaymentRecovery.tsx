"use client";

import { useState, type FormEvent } from "react";
import { formatUnits } from "viem";
import { getPaymentNetwork } from "../config/paymentNetworks";

type ForwardingResult = {
  feeTransactionHash: string;
  burnTransactionHash: string | null;
  sourceChainId: number;
  destinationChainId: number;
  payer: string;
  recipient: string;
  recipientAmount: string;
  createdAt: string;
  expiresAt: string;
  stage: "awaiting-burn" | "burn-recorded" | "recovery-expired";
  recommendation: string;
};

type PayLinkResult = {
  id: string;
  name: string;
  amount: string;
  token: string;
  payer: string;
  reference: string;
  description: string;
  sourceChainId: number;
  destinationChainId: number;
  transferMode: string;
  status: "active" | "expired" | "revoked";
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  recommendation: string;
};

type SearchResponse =
  | { kind: "forwarding"; results: ForwardingResult[]; error?: string }
  | { kind: "pay-link"; results: PayLinkResult[]; error?: string };

function networkName(chainId: number): string {
  return getPaymentNetwork(chainId)?.name || `Chain ${chainId}`;
}

function usdcAmount(value: string): string {
  try {
    return `${formatUnits(BigInt(value), 6)} USDC`;
  } catch {
    return `${value} base units`;
  }
}

function stageLabel(stage: ForwardingResult["stage"]): string {
  if (stage === "burn-recorded") return "Burn recorded";
  if (stage === "recovery-expired") return "Recovery expired";
  return "Awaiting burn";
}

export function AdminPaymentRecovery() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse>();
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (!value || searching) return;
    setSearching(true);
    setError("");
    setResponse(undefined);

    try {
      const request = await fetch(
        "/api/admin/payments/search?q=" + encodeURIComponent(value),
        { cache: "no-store", credentials: "same-origin" },
      );
      const body = await request.json() as SearchResponse;
      if (!request.ok) {
        throw new Error(body.error || "Payment search failed.");
      }
      setResponse(body);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Payment search failed.",
      );
    } finally {
      setSearching(false);
    }
  }

  const empty = response && response.results.length === 0;

  return (
    <section>
      <h2 className="text-2xl font-semibold text-slate-950">
        Payment and forwarding recovery
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Read-only search of stored Pay Links and automatic-forwarding recovery records.
      </p>

      <form onSubmit={search} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pay Link ID, payer address, fee hash, or burn hash"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
          aria-label="Payment recovery search"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {searching ? "Searching..." : "Search records"}
        </button>
      </form>

      <p className="mt-2 text-xs text-slate-500">
        Wallet searches return up to 25 newest forwarding records. No action is broadcast from this dashboard.
      </p>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {empty ? (
        <p className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No stored record matched this search.
        </p>
      ) : null}

      {response?.kind === "forwarding" ? (
        <div className="mt-5 grid gap-4">
          {response.results.map((result) => (
            <article
              key={result.feeTransactionHash}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">
                    {networkName(result.sourceChainId)} → {networkName(result.destinationChainId)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {usdcAmount(result.recipientAmount)}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {stageLabel(result.stage)}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-xs text-slate-600 md:grid-cols-2">
                <div><dt>Payer</dt><dd className="break-all font-mono text-slate-900">{result.payer}</dd></div>
                <div><dt>Recipient</dt><dd className="break-all font-mono text-slate-900">{result.recipient}</dd></div>
                <div><dt>Fee transaction</dt><dd className="break-all font-mono text-slate-900">{result.feeTransactionHash}</dd></div>
                <div><dt>Burn transaction</dt><dd className="break-all font-mono text-slate-900">{result.burnTransactionHash || "Not recorded"}</dd></div>
                <div><dt>Created</dt><dd className="text-slate-900">{new Date(result.createdAt).toLocaleString()}</dd></div>
                <div><dt>Recovery expiry</dt><dd className="text-slate-900">{new Date(result.expiresAt).toLocaleString()}</dd></div>
              </dl>
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <span className="font-semibold">Recommended next step: </span>
                {result.recommendation}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {response?.kind === "pay-link" ? (
        <div className="mt-5 grid gap-4">
          {response.results.map((result) => (
            <article
              key={result.id}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{result.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {result.amount} {result.token} · {networkName(result.sourceChainId)} → {networkName(result.destinationChainId)}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">
                  {result.status}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-xs text-slate-600 md:grid-cols-2">
                <div><dt>Pay Link ID</dt><dd className="font-mono text-slate-900">{result.id}</dd></div>
                <div><dt>Transfer mode</dt><dd className="capitalize text-slate-900">{result.transferMode}</dd></div>
                <div><dt>Designated payer</dt><dd className="break-all font-mono text-slate-900">{result.payer}</dd></div>
                <div><dt>Reference</dt><dd className="text-slate-900">{result.reference}</dd></div>
                <div><dt>Created</dt><dd className="text-slate-900">{new Date(result.createdAt).toLocaleString()}</dd></div>
                <div><dt>Expires</dt><dd className="text-slate-900">{new Date(result.expiresAt).toLocaleString()}</dd></div>
              </dl>
              {result.description ? (
                <p className="mt-4 text-sm text-slate-700">{result.description}</p>
              ) : null}
              <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
                {result.recommendation}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
