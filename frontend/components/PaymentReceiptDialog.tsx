"use client";

import { useEffect } from "react";
import {
  completionLabel,
  displayRoute,
  downloadPaymentReceiptPdf,
  explorerLink,
  formatAtomic,
  formatFee,
  networkName,
  paymentKind,
  shortAddress,
  type PaymentReceiptRecord
} from "../lib/paymentReceipt";

export function PaymentReceiptDialog({
  record,
  onClose
}: {
  record: PaymentReceiptRecord | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!record) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, record]);

  if (!record) return null;
  const amount = formatAtomic(record.amountAtomic, record.tokenDecimals);
  const date = new Date(record.completedAt);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        aria-labelledby="payment-receipt-title"
        aria-modal="true"
        className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/20 bg-slate-950 text-white shadow-2xl"
        role="dialog"
      >
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-teal-400 via-cyan-300 to-orange-300" />
        <button
          autoFocus
          type="button"
          aria-label="Close receipt"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-teal-300"
          onClick={onClose}
        >
          ×
        </button>
        <div className="px-6 pb-6 pt-9 sm:px-8">
          <div className="text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border-4 border-teal-300/20 bg-teal-400 text-2xl font-bold text-slate-950 shadow-lg">✓</span>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.25em] text-teal-300">Payment completed</p>
            <h2 id="payment-receipt-title" className="mt-2 text-4xl font-bold tracking-tight tabular-nums">
              {amount} <span className="text-xl font-medium text-slate-400">{record.token}</span>
            </h2>
            <p className="mt-2 text-sm text-slate-400">{paymentKind(record)} · {displayRoute(record)}</p>
          </div>

          <dl className="mt-6 divide-y divide-white/10 border-y border-white/10 text-sm">
            <ReceiptLine label="Date" value={date.toLocaleString()} />
            <ReceiptLine label="Direction" value={record.direction === "incoming" ? "Incoming" : "Outgoing"} />
            <ReceiptLine label="From" value={shortAddress(record.payer)} title={record.payer} mono />
            <ReceiptLine label="To" value={shortAddress(record.creator)} title={record.creator} mono />
            <ReceiptLine label="Route" value={networkName(record.sourceChainId) + " → " + networkName(record.destinationChainId)} />
            <ReceiptLine label="Method" value={completionLabel(record.completionMethod)} />
            {record.privateContext?.reference ? <ReceiptLine label="Reference" value={record.privateContext.reference} /> : null}
            {record.privateContext?.description ? <ReceiptLine label="Note" value={record.privateContext.description} /> : null}
            <ReceiptLine label="XDCID fee" value={formatFee(record.xdcidFeeAtomic)} />
            <ReceiptLine label="Circle fee" value={formatFee(record.circleFeeAtomic)} />
          </dl>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <a className="rounded-xl border border-white/20 px-4 py-3 text-center text-sm font-semibold hover:bg-white/10" href={explorerLink(record.sourceChainId, record.sourceTransactionHash)} target="_blank" rel="noreferrer">
              View transaction
            </a>
            <button type="button" onClick={() => downloadPaymentReceiptPdf(record)} className="rounded-xl bg-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-teal-300">
              Download PDF receipt
            </button>
          </div>
          <p className="mt-4 text-center text-[11px] leading-5 text-slate-500">
            Wallet-authorized private record · Receipt ID {record.id}
          </p>
        </div>
      </section>
    </div>
  );
}

function ReceiptLine({ label, value, title, mono = false }: { label: string; value: string; title?: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-5 py-2.5">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={(mono ? "font-mono " : "") + "min-w-0 break-words text-right font-medium text-slate-100"} title={title}>{value}</dd>
    </div>
  );
}
