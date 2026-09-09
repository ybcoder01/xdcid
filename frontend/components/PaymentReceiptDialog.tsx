"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  completionLabel,
  destinationReceiptName,
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
  const [resolvedNames, setResolvedNames] = useState<{
    payerName?: string;
    destinationName?: string;
  }>({});
  const [namesLoading, setNamesLoading] = useState(false);

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

  useEffect(() => {
    if (!record) {
      setResolvedNames({});
      setNamesLoading(false);
      return;
    }
    const controller = new AbortController();
    const recordedDestinationName = destinationReceiptName(record);
    setResolvedNames({
      ...(record.payerName ? { payerName: record.payerName } : {}),
      ...(recordedDestinationName ? { destinationName: recordedDestinationName } : {})
    });
    setNamesLoading(true);
    Promise.all([
      record.payerName
        ? Promise.resolve(record.payerName)
        : fetchVerifiedPrimaryName(record.payer, controller.signal),
      recordedDestinationName
        ? Promise.resolve(recordedDestinationName)
        : fetchVerifiedPrimaryName(record.creator, controller.signal)
    ]).then(([payerName, destinationName]) => {
      setResolvedNames({
        ...(payerName ? { payerName } : {}),
        ...(destinationName ? { destinationName } : {})
      });
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setResolvedNames({
          ...(record.payerName ? { payerName: record.payerName } : {}),
          ...(recordedDestinationName ? { destinationName: recordedDestinationName } : {})
        });
      }
    }).finally(() => {
      if (!controller.signal.aborted) setNamesLoading(false);
    });
    return () => controller.abort();
  }, [record]);

  if (!record) return null;
  const receiptRecord = {
    ...record,
    payerName: resolvedNames.payerName ?? null,
    destinationName: resolvedNames.destinationName ?? null
  };
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
        className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-teal-100 bg-white text-slate-950 shadow-2xl shadow-teal-950/20"
        role="dialog"
      >
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#0b6670] via-[#19a6a6] to-[#65d4e1]" />
        <button
          autoFocus
          type="button"
          aria-label="Close receipt"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-lg text-slate-600 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
          onClick={onClose}
        >
          ×
        </button>
        <div className="px-6 pb-6 pt-8 sm:px-8">
          <div aria-label="XDCID" className="flex justify-center">
            <span aria-hidden="true" className="relative block h-9 w-32 overflow-hidden">
              <Image
                alt=""
                className="absolute left-[-26px] top-[-29px] h-[95px] w-[178px] max-w-none"
                height={914}
                priority
                src="/XDCID.png"
                width={1714}
              />
            </span>
          </div>
          <div className="text-center">
            <span className="mx-auto mt-5 grid h-14 w-14 place-items-center rounded-full border-4 border-teal-100 bg-teal-700 text-2xl font-bold text-white shadow-lg shadow-teal-900/15">✓</span>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.25em] text-teal-700">Payment completed</p>
            <h2 id="payment-receipt-title" className="mt-2 text-4xl font-bold tracking-tight tabular-nums">
              {amount} <span className="text-xl font-medium text-slate-500">{record.token}</span>
            </h2>
            <p className="mt-2 text-sm text-slate-500">{paymentKind(record)} · {displayRoute(record)}</p>
          </div>

          <dl className="mt-6 divide-y divide-slate-200 border-y border-slate-200 text-sm">
            <ReceiptLine label="Date" value={date.toLocaleString()} />
            <ReceiptLine label="Direction" value={record.direction === "incoming" ? "Incoming" : "Outgoing"} />
            <ReceiptLine label="From" value={shortAddress(record.payer)} title={record.payer} mono />
            {resolvedNames.payerName ? <ReceiptLine label="Payer ID" value={resolvedNames.payerName} /> : null}
            <ReceiptLine label="To" value={shortAddress(record.creator)} title={record.creator} mono />
            {resolvedNames.destinationName ? <ReceiptLine label="Destination ID" value={resolvedNames.destinationName} /> : null}
            <ReceiptLine label="Route" value={networkName(record.sourceChainId) + " → " + networkName(record.destinationChainId)} />
            <ReceiptLine label="Method" value={completionLabel(record.completionMethod)} />
            {record.privateContext?.reference ? <ReceiptLine label="Reference" value={record.privateContext.reference} /> : null}
            {record.privateContext?.description ? <ReceiptLine label="Note" value={record.privateContext.description} /> : null}
            <ReceiptLine label="XDCID fee" value={formatFee(record.xdcidFeeAtomic)} />
            <ReceiptLine label="Circle fee" value={formatFee(record.circleFeeAtomic)} />
          </dl>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <a className="rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800" href={explorerLink(record.sourceChainId, record.sourceTransactionHash)} target="_blank" rel="noreferrer">
              View transaction
            </a>
            <button type="button" disabled={namesLoading} onClick={() => downloadPaymentReceiptPdf(receiptRecord)} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60">
              {namesLoading ? "Preparing receipt..." : "Download PDF receipt"}
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

async function fetchVerifiedPrimaryName(address: string, signal: AbortSignal): Promise<string | undefined> {
  const response = await fetch("/api/v1/reverse/" + encodeURIComponent(address), {
    cache: "no-store",
    signal
  });
  if (!response.ok) return undefined;
  const body = await response.json() as {
    data?: { name?: string | null; verified?: boolean };
  };
  return body.data?.verified && body.data.name ? body.data.name : undefined;
}

function ReceiptLine({ label, value, title, mono = false }: { label: string; value: string; title?: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-5 py-2.5">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={(mono ? "font-mono " : "") + "min-w-0 break-words text-right font-medium text-slate-900"} title={title}>{value}</dd>
    </div>
  );
}
