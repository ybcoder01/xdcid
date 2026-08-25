"use client";

import { useCallback, useEffect, useState } from "react";

type Entitlement = {
  id: string;
  walletFingerprint: string;
  startsAt: string;
  expiresAt: string;
  status: "active" | "revoked";
  source: "admin" | "purchase";
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
      const response = await fetch("/api/admin/archive-entitlements", { cache: "no-store" });
      const body = await response.json() as { entitlements?: Entitlement[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Entitlements could not be loaded.");
      setItems(body.entitlements || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Entitlements could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function grant() {
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/archive-entitlements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, expiresAt })
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Entitlement grant failed.");
      setWallet("");
      setExpiresAt("");
      setMessage("Archive entitlement granted.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Entitlement grant failed.");
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
        body: JSON.stringify({ id })
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Entitlement revocation failed.");
      setMessage("Archive entitlement revoked.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Entitlement revocation failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
      <h2 className="text-2xl font-semibold text-slate-950">Archive entitlements</h2>
      <p className="mt-2 text-sm text-slate-600">
        Grant temporary archive access for testing. Wallet addresses are converted to keyed fingerprints before storage.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-800">
          Wallet address
          <input value={wallet} onChange={(event) => setWallet(event.target.value)}
            placeholder="0x…" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono font-normal" />
        </label>
        <label className="text-sm font-semibold text-slate-800">
          Access expires
          <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" />
        </label>
      </div>
      <button type="button" onClick={() => void grant()} disabled={pending || !wallet || !expiresAt}
        className="mt-5 rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Saving…" : "Grant archive access"}
      </button>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr className="border-b border-slate-200 text-slate-500">
            <th className="py-3 pr-4">Wallet fingerprint</th><th className="py-3 pr-4">Expiry</th>
            <th className="py-3 pr-4">Status</th><th className="py-3">Action</th>
          </tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 pr-4 font-mono text-xs">{item.walletFingerprint.slice(0, 16)}…</td>
                <td className="py-3 pr-4">{new Date(item.expiresAt).toLocaleString()}</td>
                <td className="py-3 pr-4">{item.status}</td>
                <td className="py-3">
                  <button type="button" disabled={pending || item.status !== "active"}
                    onClick={() => void revoke(item.id)}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40">
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr><td colSpan={4} className="py-5 text-slate-500">No archive entitlements have been granted.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {loading ? <p className="mt-4 text-sm text-slate-500">Loading entitlements…</p> : null}
      {message ? <p className="mt-4 text-sm text-teal-700">{message}</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
