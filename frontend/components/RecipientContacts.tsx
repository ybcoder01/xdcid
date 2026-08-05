"use client";

import { useEffect, useMemo, useState } from "react";
import {
  loadRecipientContacts,
  removeRecipientContact,
  renameRecipientContact,
  saveRecipientContacts,
  setRecipientContactFavorite,
  subscribeToRecipientContacts,
  type RecipientContact
} from "../lib/recipientContacts";

type RecipientContactsProps = {
  walletAddress?: string;
  onSelect: (contact: RecipientContact) => void;
};

export function RecipientContacts({
  walletAddress,
  onSelect
}: RecipientContactsProps) {
  const [contacts, setContacts] = useState<RecipientContact[]>([]);
  const [query, setQuery] = useState("");
  const [editingName, setEditingName] = useState("");
  const [draftLabel, setDraftLabel] = useState("");

  useEffect(() => {
    const refresh = () =>
      setContacts(walletAddress ? loadRecipientContacts(walletAddress) : []);
    refresh();
    return subscribeToRecipientContacts(refresh);
  }, [walletAddress]);

  const visibleContacts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((contact) =>
      [contact.label, contact.name, contact.lastResolvedAddress]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [contacts, query]);

  function persist(next: RecipientContact[]) {
    if (!walletAddress) return;
    saveRecipientContacts(walletAddress, next);
    setContacts(next);
  }

  function toggleFavorite(contact: RecipientContact) {
    persist(
      setRecipientContactFavorite(
        contacts,
        contact.name,
        !contact.favorite
      )
    );
  }

  function startEditing(contact: RecipientContact) {
    setEditingName(contact.name);
    setDraftLabel(contact.label);
  }

  function saveLabel(contact: RecipientContact) {
    persist(renameRecipientContact(contacts, contact.name, draftLabel));
    setEditingName("");
    setDraftLabel("");
  }

  function remove(contact: RecipientContact) {
    persist(removeRecipientContact(contacts, contact.name));
  }

  return (
    <section
      className="rounded-md border border-black/10 bg-white/90 p-5 shadow-sm"
      aria-labelledby="recipient-contacts-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
            Private address book
          </p>
          <h2
            id="recipient-contacts-heading"
            className="mt-2 text-xl font-semibold text-slate-950"
          >
            Recent recipients
          </h2>
        </div>
        {contacts.length > 0 ? (
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            {contacts.length} saved
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-xs leading-5 text-neutral-600">
        Saved only in this browser for the connected wallet. XDCID resolves the
        name again before every payment instead of trusting a stored address.
      </p>

      {!walletAddress ? (
        <p className="mt-4 rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">
          Connect your wallet to see its private contact list.
        </p>
      ) : contacts.length === 0 ? (
        <p className="mt-4 rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">
          A recipient appears here after your first confirmed payment.
        </p>
      ) : (
        <>
          <label className="mt-4 grid gap-2 text-sm">
            <span className="font-semibold text-slate-950">Search contacts</span>
            <input
              className="rounded-md border border-black/10 bg-white px-3 py-2"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, label, or address"
            />
          </label>

          <div className="mt-4 grid gap-3">
            {visibleContacts.map((contact) => (
              <article
                key={contact.name}
                className="rounded-md border border-black/10 bg-neutral-50 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {editingName === contact.name ? (
                      <div className="flex flex-wrap gap-2">
                        <input
                          className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2 py-1 text-sm"
                          aria-label={"Label for " + contact.name}
                          value={draftLabel}
                          onChange={(event) => setDraftLabel(event.target.value)}
                          maxLength={40}
                        />
                        <button
                          type="button"
                          className="rounded-md bg-slate-950 px-3 py-1 text-xs font-semibold text-white"
                          onClick={() => saveLabel(contact)}
                        >
                          Save label
                        </button>
                      </div>
                    ) : (
                      <p className="truncate font-semibold text-slate-950">
                        {contact.label}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-teal-800">{contact.name}</p>
                    <p
                      className="mt-1 font-mono text-[11px] text-neutral-500"
                      title={contact.lastResolvedAddress}
                    >
                      {shortAddress(contact.lastResolvedAddress)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-lg text-amber-600 hover:bg-amber-50"
                    aria-label={
                      (contact.favorite ? "Remove favorite " : "Favorite ") +
                      contact.name
                    }
                    onClick={() => toggleFavorite(contact)}
                  >
                    {contact.favorite ? "★" : "☆"}
                  </button>
                </div>

                <p className="mt-3 text-xs text-neutral-500">
                  {contact.transactionCount} confirmed payment
                  {contact.transactionCount === 1 ? "" : "s"} · Last route:{" "}
                  {contact.lastSourceChainId} → {contact.lastDestinationChainId} ·{" "}
                  {contact.lastAsset}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                    onClick={() => onSelect(contact)}
                  >
                    Use contact
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    onClick={() => startEditing(contact)}
                  >
                    Edit label
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700"
                    onClick={() => remove(contact)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}

            {visibleContacts.length === 0 ? (
              <p className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">
                No saved recipient matches that search.
              </p>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function shortAddress(address: string): string {
  return address.slice(0, 8) + "…" + address.slice(-6);
}
