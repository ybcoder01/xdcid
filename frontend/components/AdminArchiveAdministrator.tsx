"use client";

import { useCallback, useEffect, useState } from "react";
import { isAddress } from "viem";

type Administrator = {
  wallet: string;
  updatedBy: string | null;
  updatedAt: string;
};

export function AdminArchiveAdministrator() {
  const [administrator, setAdministrator] = useState<Administrator | null>(null);
  const [wallet, setWallet] = useState("");
  const [repeatWallet, setRepeatWallet] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/archive-administrator", {
        cache: "no-store",
        credentials: "same-origin"
      });
      const body = await response.json() as {
        administrator?: Administrator | null;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Archive administrator could not be loaded.");
      setAdministrator(body.administrator || null);
      setWallet(body.administrator?.wallet || "");
      setRepeatWallet("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Archive administrator could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function save() {
    if (
      saving ||
      !isAddress(wallet) ||
      wallet.toLowerCase() !== repeatWallet.toLowerCase()
    ) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/archive-administrator", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet })
      });
      const body = await response.json() as {
        administrator?: Administrator;
        error?: string;
      };
      if (!response.ok || !body.administrator) {
        throw new Error(body.error || "Archive administrator update failed.");
      }
      setAdministrator(body.administrator);
      setWallet(body.administrator.wallet);
      setRepeatWallet("");
      setMessage("Archive administrative access transferred.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Archive administrator update failed.");
    } finally {
      setSaving(false);
    }
  }

  const matches = !!repeatWallet && wallet.toLowerCase() === repeatWallet.toLowerCase();

  return (
    <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
      <h2 className="text-2xl font-semibold text-slate-950">Archive administrator</h2>
      <p className="mt-2 text-sm text-slate-600">
        This wallet has non-expiring access to retained cross-chain history. It is separate from
        the subscription treasury and can be transferred without changing payment collection.
      </p>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Changing this role immediately removes the previous wallet&apos;s administrative bypass.
        Purchased or manually granted entitlements are not changed.
      </div>
      {loading ? <p className="mt-5 text-sm text-slate-500">Loading administrator…</p> : (
        <>
          <p className="mt-5 break-all text-sm text-slate-700">
            <strong>Current administrator:</strong> {administrator?.wallet || "Not configured"}
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-800">
              New administrator wallet
              <input
                value={wallet}
                onChange={(event) => setWallet(event.target.value)}
                placeholder="0x…"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono font-normal"
              />
            </label>
            <label className="text-sm font-semibold text-slate-800">
              Repeat new administrator wallet
              <input
                value={repeatWallet}
                onChange={(event) => setRepeatWallet(event.target.value)}
                placeholder="Repeat 0x…"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono font-normal"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !isAddress(wallet) || !matches}
            className="mt-5 rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Transfer archive access"}
          </button>
          {administrator?.updatedAt ? (
            <p className="mt-3 text-xs text-slate-500">
              Last updated {new Date(administrator.updatedAt).toLocaleString()}
              {administrator.updatedBy ? ` by ${administrator.updatedBy}` : " from initial configuration"}.
            </p>
          ) : null}
        </>
      )}
      {message ? <p className="mt-4 text-sm text-teal-700">{message}</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
