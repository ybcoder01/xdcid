"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress, type Address } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { MAINNET_PAYMENT_NETWORKS } from "../../config/paymentNetworks";
import {
  EXCHANGE_ADDRESS_BOOK_ASSETS,
  assetMatchesNetwork,
  type ExchangeAddressBookAsset,
  type ExchangeAddressBookEntry,
  type ExchangeAddressBookStatus,
} from "../../lib/exchangeAddressBook";

type Draft = {
  exchange: string;
  label: string;
  asset: ExchangeAddressBookAsset;
  chainId: number;
  address: string;
  memo: string;
  notes: string;
  status: ExchangeAddressBookStatus;
};

const EMPTY_DRAFT: Draft = {
  exchange: "",
  label: "",
  asset: "USDC",
  chainId: 50,
  address: "",
  memo: "",
  notes: "",
  status: "active",
};

export default function AddressBookPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const [sessionAddress, setSessionAddress] = useState<Address>();
  const [expiresAt, setExpiresAt] = useState("");
  const [entries, setEntries] = useState<ExchangeAddressBookEntry[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string>();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const unlocked = !!address && !!sessionAddress && getAddress(address) === sessionAddress;

  const loadEntries = useCallback(async () => {
    const response = await fetch("/api/address-book", { cache: "no-store" });
    const body = await response.json() as { entries?: ExchangeAddressBookEntry[]; error?: string };
    if (!response.ok) throw new Error(body.error || "Address book could not be loaded");
    setEntries(body.entries || []);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/private-vault/auth/session", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() as { authenticated?: boolean; address?: Address; expiresAt?: string } }))
      .then(({ response, body }) => {
        if (!active || !response.ok || !body.authenticated || !body.address) return;
        setSessionAddress(getAddress(body.address));
        setExpiresAt(body.expiresAt || "");
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!unlocked) {
      setEntries([]);
      return;
    }
    void loadEntries().catch((cause) => setError(cause instanceof Error ? cause.message : "Address book could not be loaded"));
  }, [loadEntries, unlocked]);

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => [entry.label, entry.exchange, entry.asset, entry.address, entry.memo || ""]
      .some((value) => value.toLowerCase().includes(needle)));
  }, [entries, query]);

  async function unlock() {
    if (!address) return;
    setBusy(true);
    setError("");
    setStatus("Preparing a gasless wallet verification…");
    try {
      const challengeResponse = await fetch("/api/private-vault/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const challenge = await challengeResponse.json() as { challengeId?: string; message?: string; error?: string };
      if (!challengeResponse.ok || !challenge.challengeId || !challenge.message) {
        throw new Error(challenge.error || "Address-book unlock could not start");
      }
      const signature = await signMessageAsync({ message: challenge.message });
      const verifyResponse = await fetch("/api/private-vault/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.challengeId, address, message: challenge.message, signature }),
      });
      const verified = await verifyResponse.json() as { authenticated?: boolean; address?: Address; expiresAt?: string; error?: string };
      if (!verifyResponse.ok || !verified.authenticated || !verified.address) {
        throw new Error(verified.error || "Wallet verification failed");
      }
      setSessionAddress(getAddress(verified.address));
      setExpiresAt(verified.expiresAt || "");
      setStatus("Private address book unlocked.");
    } catch (cause) {
      setStatus("");
      setError(cause instanceof Error ? cause.message : "Address book could not be unlocked");
    } finally {
      setBusy(false);
    }
  }

  async function saveEntry() {
    setBusy(true);
    setError("");
    setStatus("Saving encrypted destination…");
    try {
      const response = await fetch(editingId ? `/api/address-book/${editingId}` : "/api/address-book", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await response.json() as { entry?: ExchangeAddressBookEntry; error?: string };
      if (!response.ok || !body.entry) throw new Error(body.error || "Destination could not be saved");
      setDraft(EMPTY_DRAFT);
      setEditingId(undefined);
      setStatus(editingId ? "Destination updated." : "Destination added to your encrypted address book.");
      await loadEntries();
    } catch (cause) {
      setStatus("");
      setError(cause instanceof Error ? cause.message : "Destination could not be saved");
    } finally {
      setBusy(false);
    }
  }

  async function lockVault() {
    setBusy(true);
    setError("");
    try {
      await fetch("/api/private-vault/auth/logout", { method: "POST" });
    } finally {
      setSessionAddress(undefined);
      setExpiresAt("");
      setEntries([]);
      setDraft(EMPTY_DRAFT);
      setEditingId(undefined);
      setStatus("Private address book locked.");
      setBusy(false);
    }
  }

  async function removeEntry(entry: ExchangeAddressBookEntry) {
    if (!window.confirm(`Remove ${entry.label} from your private address book?`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/address-book/${entry.id}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Destination could not be removed");
      setEntries((current) => current.filter((candidate) => candidate.id !== entry.id));
      setStatus("Destination removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Destination could not be removed");
    } finally {
      setBusy(false);
    }
  }

  function editEntry(entry: ExchangeAddressBookEntry) {
    setEditingId(entry.id);
    setDraft({
      exchange: entry.exchange,
      label: entry.label,
      asset: entry.asset,
      chainId: entry.chainId,
      address: entry.address,
      memo: entry.memo || "",
      notes: entry.notes || "",
      status: entry.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="rounded-3xl border border-teal-100 bg-gradient-to-br from-white via-white to-teal-50 p-6 shadow-sm md:p-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Send · Private destination vault</p>
          <a className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-50" href="/send">Back to Send</a>
        </div>
        <div className="mt-3 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-950 md:text-5xl">Exchange Address Book</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600 md:text-base">
              Save the exchange, asset, network, deposit address and memo together. Entries are encrypted and visible only after this wallet unlocks the vault.
            </p>
          </div>
          {unlocked ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">Vault unlocked</p>
              <p className="mt-1 text-xs">Until {expiresAt ? new Date(expiresAt).toLocaleTimeString() : "session expiry"}</p>
              <button className="mt-2 text-xs font-semibold underline underline-offset-2 disabled:opacity-50" disabled={busy} onClick={lockVault}>Lock now</button>
            </div>
          ) : null}
        </div>
      </section>

      {!isConnected ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h2 className="text-xl font-semibold">Connect your wallet first</h2>
          <p className="mt-2 text-sm">The connected wallet determines which encrypted address book can be opened.</p>
        </section>
      ) : !unlocked ? (
        <section className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-2xl font-semibold text-slate-950">Unlock your private address book</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
            Sign one gasless message to create a 30-minute session. This does not submit a transaction or authorize movement of funds.
          </p>
          <button className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || signing} onClick={unlock}>
            {busy || signing ? "Confirm in wallet…" : "Verify wallet and unlock"}
          </button>
        </section>
      ) : (
        <>
          <section className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
            <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm md:p-6">
              <h2 className="text-xl font-semibold text-slate-950">{editingId ? "Edit destination" : "Add a destination"}</h2>
              <p className="mt-2 text-xs leading-5 text-neutral-500">Copy these values from the exchange deposit screen and confirm the network carefully.</p>
              <div className="mt-5 grid gap-4">
                <Field label="Exchange" value={draft.exchange} placeholder="Binance, OKX, Coinbase…" onChange={(exchange) => setDraft({ ...draft, exchange })} />
                <Field label="Your label" value={draft.label} placeholder="My Binance USDC" onChange={(label) => setDraft({ ...draft, label })} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm"><span className="font-semibold">Asset</span><select className="rounded-xl border border-slate-200 bg-white px-3 py-3" value={draft.asset} onChange={(event) => setDraft({ ...draft, asset: event.target.value as ExchangeAddressBookAsset })}>{EXCHANGE_ADDRESS_BOOK_ASSETS.map((asset) => <option key={asset}>{asset}</option>)}</select></label>
                  <label className="grid gap-2 text-sm"><span className="font-semibold">Deposit network</span><select className="rounded-xl border border-slate-200 bg-white px-3 py-3" value={draft.chainId} onChange={(event) => setDraft({ ...draft, chainId: Number(event.target.value) })}>{MAINNET_PAYMENT_NETWORKS.map((network) => <option key={network.chainId} value={network.chainId}>{network.name}</option>)}</select></label>
                </div>
                {!assetMatchesNetwork(draft.asset, draft.chainId) ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{draft.asset} is not the native asset of this network. Save it only if the exchange explicitly supports this asset/network combination; XDCID Send will not treat it as a native transfer.</p> : null}
                <Field label="Deposit address" value={draft.address} placeholder="0x…" mono onChange={(addressValue) => setDraft({ ...draft, address: addressValue })} />
                <Field label="Memo / tag (if required)" value={draft.memo} placeholder="Leave blank only when the exchange says none is needed" onChange={(memo) => setDraft({ ...draft, memo })} />
                <Field label="Private notes (optional)" value={draft.notes} placeholder="Account or operational note" onChange={(notes) => setDraft({ ...draft, notes })} />
                <div className="flex gap-3">
                  <button className="flex-1 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={saveEntry}>{busy ? "Saving…" : editingId ? "Save changes" : "Add securely"}</button>
                  {editingId ? <button className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold" onClick={() => { setEditingId(undefined); setDraft(EMPTY_DRAFT); }}>Cancel</button> : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-xl font-semibold text-slate-950">Saved destinations</h2><p className="mt-1 text-xs text-neutral-500">{entries.length} encrypted {entries.length === 1 ? "entry" : "entries"}</p></div>
                <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exchange or label" aria-label="Search saved destinations" />
              </div>
              <div className="mt-5 grid gap-4">
                {filteredEntries.map((entry) => <DestinationCard key={entry.id} entry={entry} busy={busy} onEdit={() => editEntry(entry)} onRemove={() => removeEntry(entry)} />)}
                {filteredEntries.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-neutral-500">{entries.length ? "No destinations match your search." : "No saved destinations yet."}</div> : null}
              </div>
            </div>
          </section>
        </>
      )}
      {status ? <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{status}</p> : null}
      {error ? <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
    </main>
  );
}

function DestinationCard(props: { entry: ExchangeAddressBookEntry; busy: boolean; onEdit: () => void; onRemove: () => void }) {
  const network = MAINNET_PAYMENT_NETWORKS.find((candidate) => candidate.chainId === props.entry.chainId);
  async function copy(value: string) { await navigator.clipboard.writeText(value); }
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0"><p className="font-semibold text-slate-950">{props.entry.label}</p><p className="mt-1 text-xs text-neutral-500">{props.entry.exchange} · {props.entry.asset} · {network?.name || `Chain ${props.entry.chainId}`}</p></div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${props.entry.status === "active" ? "bg-emerald-100 text-emerald-800" : props.entry.status === "reconfirm" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-600"}`}>{props.entry.status}</span>
      </div>
      <button className="mt-4 block w-full break-all rounded-xl border border-slate-200 bg-white p-3 text-left font-mono text-xs hover:border-teal-300" onClick={() => copy(props.entry.address)} title="Copy deposit address">{props.entry.address}</button>
      {props.entry.memo ? <button className="mt-2 block w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-950" onClick={() => copy(props.entry.memo || "")}><span className="font-semibold">Memo/tag:</span> {props.entry.memo}</button> : null}
      {props.entry.notes ? <p className="mt-3 text-xs leading-5 text-neutral-600">{props.entry.notes}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={`/send?destination=${props.entry.id}`} className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white">Use in Send</a>
        <button disabled={props.busy} onClick={props.onEdit} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Edit</button>
        <button disabled={props.busy} onClick={props.onRemove} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700">Remove</button>
      </div>
      <p className="mt-3 text-[11px] text-neutral-400">Confirmed {new Date(props.entry.confirmedAt).toLocaleDateString()}</p>
    </article>
  );
}

function Field(props: { label: string; value: string; placeholder: string; onChange: (value: string) => void; mono?: boolean }) {
  return <label className="grid gap-2 text-sm"><span className="font-semibold">{props.label}</span><input className={`rounded-xl border border-slate-200 bg-white px-3 py-3 ${props.mono ? "font-mono text-sm" : ""}`} value={props.value} placeholder={props.placeholder} onChange={(event) => props.onChange(event.target.value)} /></label>;
}
