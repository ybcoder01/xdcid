"use client";

import { useCallback, useEffect, useState } from "react";

type Policy = {
  freeHistoryMonths: number;
  maximumRetentionMonths: number;
  archiveAccessEnabled: boolean;
  subscriptionSalesEnabled: boolean;
  archiveGraceDays: number;
  archivePaymentCurrency: "USDC";
  oneYearPriceUsdMicros: number | null;
  threeYearDiscountBps: number;
  sevenYearDiscountBps: number;
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
      setMessage("Archive subscription policy updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "History policy update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
      <h2 className="text-2xl font-semibold text-slate-950">Cross-chain archive policy</h2>
      <p className="mt-2 text-sm text-slate-600">
        Configure the one-time trial, archive plans and future paywall without changing or copying transaction records.
        Same-chain history is not restricted by this policy.
      </p>
      {loading || !draft ? <p className="mt-5 text-sm text-slate-500">Loading policy...</p> : (
        <>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <NumberField label="One-time free trial (months)" value={draft.freeHistoryMonths}
              min={1} max={120} onChange={(freeHistoryMonths) => setDraft({ ...draft, freeHistoryMonths })} />
            <NumberField label="Maximum retention (months)" value={draft.maximumRetentionMonths}
              min={12} max={120} onChange={(maximumRetentionMonths) => setDraft({ ...draft, maximumRetentionMonths })} />
            <NumberField label="Subscription grace period (days)" value={draft.archiveGraceDays}
              min={0} max={90} onChange={(archiveGraceDays) => setDraft({ ...draft, archiveGraceDays })} />
            <label className="text-sm font-semibold text-slate-800">
              Payment currency
              <input value={draft.archivePaymentCurrency} readOnly
                className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 font-normal text-slate-600" />
            </label>
            <MoneyField label="One-year price (USDC)" valueMicros={draft.oneYearPriceUsdMicros}
              onChange={(oneYearPriceUsdMicros) => setDraft({ ...draft, oneYearPriceUsdMicros })} />
            <PercentField label="Three-year discount" valueBps={draft.threeYearDiscountBps}
              onChange={(threeYearDiscountBps) => setDraft({ ...draft, threeYearDiscountBps })} />
            <PercentField label="Seven-year discount" valueBps={draft.sevenYearDiscountBps}
              onChange={(sevenYearDiscountBps) => setDraft({ ...draft, sevenYearDiscountBps })} />
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <PlanPreview years={1} annualMicros={draft.oneYearPriceUsdMicros} discountBps={0} />
            <PlanPreview years={3} annualMicros={draft.oneYearPriceUsdMicros}
              discountBps={draft.threeYearDiscountBps} />
            <PlanPreview years={7} annualMicros={draft.oneYearPriceUsdMicros}
              discountBps={draft.sevenYearDiscountBps} />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Toggle label="Enable subscription sales" checked={draft.subscriptionSalesEnabled}
              onChange={(subscriptionSalesEnabled) => setDraft({ ...draft, subscriptionSalesEnabled })} />
            <Toggle label="Enforce the cross-chain archive paywall" checked={draft.archiveAccessEnabled}
              onChange={(archiveAccessEnabled) => setDraft({ ...draft, archiveAccessEnabled })} />
          </div>

          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Both switches default to off. Setting prices does not charge users or hide history. Sales and paywall
            enforcement should remain disabled until purchase verification and the one-time wallet trial are tested.
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => void save()} disabled={saving}
              className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Saving..." : "Save archive policy"}
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

function MoneyField({ label, valueMicros, onChange }: {
  label: string; valueMicros: number | null; onChange: (value: number | null) => void;
}) {
  return (
    <label className="text-sm font-semibold text-slate-800">
      {label}
      <input type="number" min="0.000001" step="0.01"
        value={valueMicros === null ? "" : valueMicros / 1_000_000}
        placeholder="Not set"
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === "" ? null : Math.round(Number(raw) * 1_000_000));
        }}
        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" />
    </label>
  );
}

function PercentField({ label, valueBps, onChange }: {
  label: string; valueBps: number; onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm font-semibold text-slate-800">
      {label}
      <input type="number" min="0" max="90" step="0.01" value={valueBps / 100}
        onChange={(event) => onChange(Math.round(Number(event.target.value) * 100))}
        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" />
    </label>
  );
}

function Toggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-semibold text-slate-800">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function PlanPreview({ years, annualMicros, discountBps }: {
  years: 1 | 3 | 7; annualMicros: number | null; discountBps: number;
}) {
  const regular = annualMicros === null ? null : annualMicros * years;
  const payable = regular === null ? null : Math.ceil(regular * (10_000 - discountBps) / 10_000);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="font-semibold text-slate-950">{years}-year plan</p>
      <p className="mt-2 text-sm text-slate-600">
        {regular === null ? "Price not set" : formatUsdMicros(payable!)}
      </p>
      <p className="mt-1 text-xs text-slate-500">{(discountBps / 100).toFixed(2)}% discount</p>
    </div>
  );
}

function formatUsdMicros(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6
  }).format(value / 1_000_000);
}
