"use client";

import { useCallback, useEffect, useState } from "react";

type Policy = {
  freeHistoryMonths: number;
  maximumRetentionMonths: number;
  archiveAccessEnabled: boolean;
  archiveGraceDays: number;
  updatedAt: string;
  updatedBy: string | null;
};

export function AdminHistoryAccessPolicy() {
  const [policy, setPolicy] = useState<Policy>();
  const [draft, setDraft] = useState<Policy>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/history-policy", { cache: "no-store" });
      const body = await response.json() as Policy & { error?: string };
      if (!response.ok) throw new Error(body.error || "History policy could not be loaded.");
      setPolicy(body);
      setDraft(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "History policy could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/history-policy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft)
      });
      const body = await response.json() as Policy & { error?: string };
      if (!response.ok) throw new Error(body.error || "History policy update failed.");
      setPolicy(body);
      setDraft(body);
      setMessage("History access policy updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "History policy update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
      <h2 className="text-2xl font-semibold text-slate-950">History access policy</h2>
      <p className="mt-2 text-sm text-slate-600">
        Completed records stay in Neon. This policy controls what the server returns without changing transaction facts.
      </p>
      {loading || !draft ? <p className="mt-5 text-sm text-slate-500">Loading policy...</p> : (
        <>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <NumberField label="Free history (months)" value={draft.freeHistoryMonths}
              min={1} max={120} onChange={(freeHistoryMonths) => setDraft({ ...draft, freeHistoryMonths })} />
            <NumberField label="Maximum retention (months)" value={draft.maximumRetentionMonths}
              min={12} max={120} onChange={(maximumRetentionMonths) => setDraft({ ...draft, maximumRetentionMonths })} />
            <NumberField label="Archive grace period (days)" value={draft.archiveGraceDays}
              min={0} max={90} onChange={(archiveGraceDays) => setDraft({ ...draft, archiveGraceDays })} />
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={draft.archiveAccessEnabled}
                onChange={(event) => setDraft({ ...draft, archiveAccessEnabled: event.target.checked })} />
              Enable paid archive access
            </label>
          </div>
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Archive access should remain disabled until entitlement verification and billing are implemented.
            Maximum retention is recorded for policy purposes only; this PR does not delete completed records.
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => void save()} disabled={saving}
              className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Saving..." : "Save policy"}
            </button>
            <button type="button" onClick={() => setDraft(policy)} disabled={saving}
              className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800">
              Reset changes
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Last updated {policy ? new Date(policy.updatedAt).toLocaleString() : "—"}
            {policy?.updatedBy ? " by " + policy.updatedBy : ""}. Every change is recorded in the admin audit table.
          </p>
        </>
      )}
      {message ? <p className="mt-4 text-sm text-teal-700">{message}</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}

function NumberField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm font-semibold text-slate-800">
      {label}
      <input type="number" value={value} min={min} max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" />
    </label>
  );
}
