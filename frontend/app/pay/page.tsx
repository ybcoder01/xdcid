"use client";

import { useEffect, useMemo, useState } from "react";
import { parseXnsName } from "../../lib/names";
import {
  buildPayLink,
  MAX_PAY_MEMO_LENGTH,
  normalizePayToken,
  validatePayAmount,
  validatePayExpiry,
  validatePayMemo,
  type PayToken,
} from "../../lib/paylinks";

export default function PayLinksPage() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<PayToken>("XDC");
  const [memo, setMemo] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const parsedName = useMemo(() => parseXnsName(recipient), [recipient]);
  const expiry = useMemo(() => {
    if (!expiresAt) return undefined;
    const milliseconds = new Date(expiresAt).getTime();
    return Number.isFinite(milliseconds)
      ? String(Math.floor(milliseconds / 1000))
      : "invalid";
  }, [expiresAt]);

  const nameError = recipient && !parsedName.isValid ? parsedName.error : undefined;
  const amountError = amount ? validatePayAmount(amount, token) : undefined;
  const memoError = validatePayMemo(memo);
  const expiryError = validatePayExpiry(expiry);
  const canCreate = Boolean(
    origin && recipient && parsedName.isValid && amount && !amountError && !memoError && !expiryError,
  );

  const payLink = useMemo(() => {
    if (!canCreate) return "";
    return buildPayLink(origin, {
      name: parsedName.name,
      amount,
      token: normalizePayToken(token),
      memo: memo || undefined,
      expires,
    });
  }, [amount, canCreate, expiry, memo, origin, parsedName.name, token]);

  async function copyLink() {
    if (!payLink) return;
    await navigator.clipboard.writeText(payLink);
    setCopied(true);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-700">XDCID Pay Links</p>
      <h1 className="mt-4 text-5xl font-bold tracking-tight text-slate-950">Request payment to an XNS ID</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Create a shareable request for XDC or USDC. XDCID never holds funds or signs a transaction.
      </p>

      <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="grid gap-6 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">Receive with XNS ID</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="alice.xdc"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
            {nameError && <span className="mt-2 block text-sm text-red-600">{nameError}</span>}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Amount</span>
            <input
              inputMode="decimal"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="25.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            {amountError && <span className="mt-2 block text-sm text-red-600">{amountError}</span>}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Token</span>
            <select
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              value={token}
              onChange={(event) => setToken(normalizePayToken(event.target.value))}
            >
              <option value="XDC">XDC</option>
              <option value="USDC">USDC on XDC</option>
            </select>
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">Memo (optional)</span>
            <input
              maxLength={MAX_PAY_MEMO_LENGTH}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Invoice 104"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
            <span className="mt-2 block text-xs text-slate-500">
              The memo is visible to anyone with the link. Do not include sensitive information.
            </span>
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">Request expires (optional)</span>
            <input
              type="datetime-local"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
            {expiryError && <span className="mt-2 block text-sm text-red-600">{expiryError}</span>}
          </label>
        </div>

        <div className="mt-8 rounded-2xl bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-700">Shareable payment request</p>
          <p className="mt-2 break-all text-sm text-slate-600">
            {payLink || "Enter a valid XNS ID and amount to create the link."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!payLink}
              onClick={copyLink}
              className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copied ? "Copied" : "Copy pay link"}
            </button>
            {payLink && (
              <a className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800" href={payLink}>
                Preview request
              </a>
            )}
          </div>
        </div>
      </section>

      <p className="mt-6 text-sm text-slate-500">
        The link contains the XNS ID, amount, token, memo, and optional expiry. It does not reserve funds or guarantee payment.
      </p>
    </main>
  );
}
