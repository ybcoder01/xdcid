"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Entitlement = {
  entitlementId: string;
  walletFingerprint: string;
  startsAt: string;
  expiresAt: string;
  state: "active" | "expired" | "revoked";
  source: "admin" | "purchase";
  planYears: 1 | 3 | 7 | null;
  chainId: number | null;
  transactionHash: string | null;
  createdAt: string;
};

export function AdminArchiveEntitlements() {
  const [wallet, setWallet] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [items, setItems] = useState<Entitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/archive-entitlements", {
        cache: "no-store",
      });
      const body = await response.json() as {
        entitlements?: Entitlement[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "Archive subscriptions could not be loaded.");
      }
      setItems(body.entitlements || []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Archive subscriptions could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = useMemo(
    () =>
      items.reduce(
        (result, item) => {
          result[item.state] += 1;
          if (item.source === "purchase") result.purchased += 1;
          return result;
        },
        { active: 0, expired: 0, revoked: 0, purchased: 0 },
      ),
    [items],
  );

  async function grant() {
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/archive-entitlements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, expiresAt }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Entitlement grant failed.");
      }
      setWallet("");
      setExpiresAt("");
      setMessage("Archive entitlement granted.");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Entitlement grant failed.",
      );
    } finally {
      setPending(false);
    }
  }

  async function revoke(id: string) {
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/archive-entitlements", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Entitlement revocation failed.");
      }
      setMessage("Archive entitlement revoked.");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Entitlement revocation failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Archive operations
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            Subscription access
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Review purchased and manually granted access. Subscriber wallets remain represented by keyed fingerprints.
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

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Active access" value={summary.active} />
        <Metric label="Purchased plans" value={summary.purchased} />
        <Metric label="Expired" value={summary.expired} />
        <Metric label="Revoked" value={summary.revoked} />
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h3 className="font-semibold text-slate-950">Grant special access</h3>
        <p className="mt-1 text-xs text-slate-600">
          Use this for a deliberate complimentary or discounted-access decision. It does not create revenue.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-800">
            Wallet address
            <input
              value={wallet}
              onChange={(event) => setWallet(event.target.value)}
              placeholder="0x…"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono font-normal"
            />
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Access expires
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void grant()}
          disabled={pending || !wallet || !expiresAt}
          className="mt-5 rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Grant archive access"}
        </button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3">Wallet fingerprint</th>
              <th className="px-4 py-3">Access</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Expiry</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Proof</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {items.map((item) => (
              <tr key={item.entitlementId}>
                <td className="px-4 py-3 font-mono text-xs">
                  {item.walletFingerprint.slice(0, 16)}…
                </td>
                <td className="px-4 py-3 capitalize">{item.source}</td>
                <td className="px-4 py-3">
                  {item.planYears ? `${item.planYears} year${item.planYears === 1 ? "" : "s"}` : "Custom"}
                </td>
                <td className="px-4 py-3">
                  {new Date(item.expiresAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 capitalize">{item.state}</td>
                <td className="px-4 py-3">
                  {item.transactionHash ? (
                    <a
                      href={explorerUrl(item.chainId, item.transactionHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-teal-700 underline"
                    >
                      {item.transactionHash.slice(0, 10)}…
                    </a>
                  ) : (
                    "Manual grant"
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={pending || item.state !== "active"}
                    onClick={() => void revoke(item.entitlementId)}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-slate-500">
                  No archive subscriptions or grants have been recorded.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div aria-live="polite">
        {message ? <p className="mt-4 text-sm text-teal-700">{message}</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function explorerUrl(chainId: number | null, hash: string) {
  return chainId === 51
    ? `https://testnet.xdcscan.com/tx/${hash}`
    : `https://xdcscan.com/tx/${hash}`;
}
