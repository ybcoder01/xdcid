"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther, isAddress } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract
} from "wagmi";
import {
  addresses,
  organizationAbi,
  organizationConfigured,
  zeroAddress
} from "../../config/contracts";
import { parseXnsName } from "../../lib/names";

type SubnameRow = {
  id: number;
  label: string;
  target: string;
};

function validLabel(label: string) {
  return (
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-z0-9-]+$/.test(label) &&
    !label.startsWith("-") &&
    !label.endsWith("-")
  );
}

export default function BusinessNamespacesPage() {
  const { address, isConnected } = useAccount();
  const [parentInput, setParentInput] = useState("");
  const [years, setYears] = useState(1);
  const [rows, setRows] = useState<SubnameRow[]>([
    { id: 1, label: "", target: "" }
  ]);
  const [nextRowId, setNextRowId] = useState(2);
  const [manager, setManager] = useState("");
  const [revokeLabel, setRevokeLabel] = useState("");
  const [resolveLabel, setResolveLabel] = useState("");

  const parent = useMemo(() => parseXnsName(parentInput), [parentInput]);
  const canRead = organizationConfigured && parent.isValid;

  const annualFee = useReadContract({
    address: addresses.organization,
    abi: organizationAbi,
    functionName: "annualFee",
    query: { enabled: organizationConfigured }
  });

  const status = useReadContract({
    address: addresses.organization,
    abi: organizationAbi,
    functionName: "organizationStatus",
    args: canRead ? [parent.name] : undefined,
    query: { enabled: canRead }
  });

  const resolved = useReadContract({
    address: addresses.organization,
    abi: organizationAbi,
    functionName: "resolve",
    args:
      canRead && validLabel(resolveLabel.trim().toLowerCase())
        ? [resolveLabel.trim().toLowerCase(), parent.name]
        : undefined,
    query: {
      enabled: canRead && validLabel(resolveLabel.trim().toLowerCase())
    }
  });

  const {
    data: transactionHash,
    error: transactionError,
    isPending,
    writeContract
  } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: transactionHash });

  useEffect(() => {
    if (receipt.isSuccess) void status.refetch();
  }, [receipt.isSuccess, status.refetch]);

  const parentOwner = status.data?.[1];
  const paidUntil = status.data?.[2];
  const active = status.data?.[3] || false;
  const isParentOwner =
    !!address &&
    !!parentOwner &&
    parentOwner !== zeroAddress &&
    parentOwner.toLowerCase() === address.toLowerCase();
  const subscriptionCost = annualFee.data
    ? annualFee.data * BigInt(years)
    : undefined;
  const normalizedRows = rows.map((row) => ({
    ...row,
    label: row.label.trim().toLowerCase(),
    target: row.target.trim()
  }));
  const canBulkIssue =
    organizationConfigured &&
    isConnected &&
    parent.isValid &&
    active &&
    normalizedRows.length > 0 &&
    normalizedRows.every(
      (row) => validLabel(row.label) && isAddress(row.target)
    );

  function subscribe() {
    if (!parent.isValid || !subscriptionCost) return;
    writeContract({
      address: addresses.organization,
      abi: organizationAbi,
      functionName: "subscribe",
      args: [parent.name, BigInt(years)],
      value: subscriptionCost
    });
  }

  function issueRows() {
    if (!canBulkIssue) return;
    writeContract({
      address: addresses.organization,
      abi: organizationAbi,
      functionName: "bulkIssue",
      args: [
        normalizedRows.map((row) => row.label),
        parent.name,
        normalizedRows.map((row) => row.target as `0x${string}`)
      ]
    });
  }

  function updateRow(id: number, field: "label" | "target", value: string) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  }

  function addRow() {
    if (rows.length >= 10) return;
    setRows((current) => [
      ...current,
      { id: nextRowId, label: "", target: "" }
    ]);
    setNextRowId((current) => current + 1);
  }

  function removeRow(id: number) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  function updateManager(approved: boolean) {
    if (!parent.isValid || !isAddress(manager)) return;
    writeContract({
      address: addresses.organization,
      abi: organizationAbi,
      functionName: "setManager",
      args: [parent.name, manager, approved]
    });
  }

  function revokeSubname() {
    const label = revokeLabel.trim().toLowerCase();
    if (!parent.isValid || !validLabel(label)) return;
    writeContract({
      address: addresses.organization,
      abi: organizationAbi,
      functionName: "revokeSubname",
      args: [label, parent.name]
    });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
            Business namespaces
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">
            Turn one .XDC name into an organization directory
          </h1>
          <p className="mt-3 max-w-3xl text-neutral-600">
            Issue controlled names for people, teams, treasuries, invoices, and
            tokenized assets. The parent .XDC owner remains in control and can
            delegate day-to-day administration without transferring the parent name.
          </p>

          {!organizationConfigured && (
            <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              Pilot contract deployment is pending. This preview accepts no payment
              and sends no transaction until a reviewed contract address is configured.
            </div>
          )}

          <div className="mt-7">
            <label className="text-sm font-semibold text-slate-950" htmlFor="parent-name">
              Organization parent name
            </label>
            <input
              id="parent-name"
              className="mt-2 w-full rounded-md border border-black/15 bg-white px-4 py-3"
              value={parentInput}
              onChange={(event) => setParentInput(event.target.value)}
              placeholder="company.xdc"
            />
            {parentInput && !parent.isValid && (
              <p className="mt-2 text-sm text-red-600">{parent.error}</p>
            )}
          </div>

          {parent.isValid && organizationConfigured && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-black/10 bg-neutral-50 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Parent owner</p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-950">
                  {parentOwner && parentOwner !== zeroAddress ? parentOwner : "Not registered"}
                </p>
              </div>
              <div className="rounded-md border border-black/10 bg-neutral-50 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Workspace</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {active ? "Active" : "Inactive"}
                </p>
              </div>
              <div className="rounded-md border border-black/10 bg-neutral-50 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Paid through</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {paidUntil && paidUntil > 0n
                    ? new Date(Number(paidUntil) * 1000).toLocaleDateString()
                    : "Not subscribed"}
                </p>
              </div>
            </div>
          )}
        </div>

        <aside className="rounded-md border border-black/10 bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
            Recurring protocol revenue
          </p>
          <p className="mt-5 text-3xl font-semibold">
            {annualFee.data ? formatEther(annualFee.data) + " XDC" : "Configurable"}
          </p>
          <p className="mt-1 text-sm text-slate-300">per organization, per year</p>
          <div className="mt-7 grid gap-3 text-sm text-slate-300">
            <p>Unlimited renewals while the parent name remains active.</p>
            <p>Up to 50 subnames in one on-chain issuance transaction.</p>
            <p>Manager permissions automatically expire when the parent transfers.</p>
          </div>
        </aside>
      </section>

      <section className="mt-6 rounded-md border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Activate or renew workspace</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Only the current owner of the parent .XDC name can pay for a workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-md border border-black/15 bg-white px-4 py-3 text-sm"
              value={years}
              onChange={(event) => setYears(Number(event.target.value))}
            >
              <option value={1}>1 year</option>
              <option value={3}>3 years</option>
              <option value={5}>5 years</option>
            </select>
            <button
              className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              disabled={
                !organizationConfigured ||
                !isParentOwner ||
                !subscriptionCost ||
                isPending ||
                receipt.isLoading
              }
              onClick={subscribe}
            >
              {isPending
                ? "Confirm in wallet"
                : subscriptionCost
                  ? "Pay " + formatEther(subscriptionCost) + " XDC"
                  : "Activate"}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-black/10 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">Bulk issue subnames</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Examples: alice.company.xdc, treasury.company.xdc, or invoice-104.company.xdc.
        </p>
        <div className="mt-5 grid gap-3">
          {rows.map((row) => (
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]" key={row.id}>
              <input
                className="rounded-md border border-black/15 px-3 py-2"
                value={row.label}
                onChange={(event) => updateRow(row.id, "label", event.target.value)}
                placeholder="label"
              />
              <input
                className="rounded-md border border-black/15 px-3 py-2"
                value={row.target}
                onChange={(event) => updateRow(row.id, "target", event.target.value)}
                placeholder="0x recipient address"
              />
              <button
                className="rounded-md border border-black/10 px-4 py-2 text-sm disabled:opacity-40"
                disabled={rows.length === 1}
                onClick={() => removeRow(row.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-md border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={rows.length >= 10}
            onClick={addRow}
          >
            Add row
          </button>
          <button
            className="rounded-md bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            disabled={!canBulkIssue || isPending || receipt.isLoading}
            onClick={issueRows}
          >
            Issue {rows.length} subname{rows.length === 1 ? "" : "s"}
          </button>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Delegate a manager</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Managers can issue and revoke subnames but cannot renew the workspace or transfer the parent.
          </p>
          <input
            className="mt-4 w-full rounded-md border border-black/15 px-3 py-2"
            value={manager}
            onChange={(event) => setManager(event.target.value)}
            placeholder="Manager 0x address"
          />
          <div className="mt-3 flex gap-2">
            <button
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={!isParentOwner || !isAddress(manager) || isPending}
              onClick={() => updateManager(true)}
            >
              Approve manager
            </button>
            <button
              className="rounded-md border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={!isParentOwner || !isAddress(manager) || isPending}
              onClick={() => updateManager(false)}
            >
              Revoke manager
            </button>
          </div>
        </div>

        <div className="rounded-md border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Revoke a subname</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Revocation immediately makes the organization record resolve to no address.
          </p>
          <input
            className="mt-4 w-full rounded-md border border-black/15 px-3 py-2"
            value={revokeLabel}
            onChange={(event) => setRevokeLabel(event.target.value)}
            placeholder="Subname label"
          />
          <button
            className="mt-3 rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
            disabled={!active || !validLabel(revokeLabel.trim().toLowerCase()) || isPending}
            onClick={revokeSubname}
          >
            Revoke subname
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-black/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Resolve an organization subname</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr]">
          <input
            className="rounded-md border border-black/15 px-3 py-2"
            value={resolveLabel}
            onChange={(event) => setResolveLabel(event.target.value)}
            placeholder="alice"
          />
          <div className="rounded-md border border-black/10 bg-neutral-50 px-4 py-3 text-sm">
            {resolved.isLoading
              ? "Resolving..."
              : resolved.data && resolved.data !== zeroAddress
                ? resolved.data
                : "No active organization record"}
          </div>
        </div>
      </section>

      {receipt.isSuccess && (
        <p className="mt-5 rounded-md border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800">
          Organization transaction confirmed on XDC Network.
        </p>
      )}
      {transactionError && (
        <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {transactionError.message}
        </p>
      )}
    </main>
  );
}
