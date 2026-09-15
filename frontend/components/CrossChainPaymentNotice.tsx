import { getPaymentNetwork } from "../config/paymentNetworks";
import { getCctpTimingNotice } from "../lib/cctpTiming";

type CrossChainPaymentNoticeProps = {
  compact?: boolean;
  sourceChainId: number;
};

export function CrossChainPaymentNotice({
  compact = false,
  sourceChainId
}: CrossChainPaymentNoticeProps) {
  const sourceName =
    getPaymentNetwork(sourceChainId)?.name || "the source network";
  const timing = getCctpTimingNotice(sourceChainId, sourceName);

  return (
    <section
      aria-label="Before you send"
      className={
        "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm " +
        (compact ? "mt-3" : "mt-5")
      }
      role="note"
    >
      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Before you send
        </p>
      </div>

      <div
        className={
          "divide-y divide-slate-200 " +
          (compact
            ? ""
            : "md:grid md:grid-cols-2 md:divide-x md:divide-y-0")
        }
      >
        <div className={compact ? "flex gap-3 p-3" : "flex gap-3 p-4"}>
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-100 text-sm font-bold text-amber-800"
          >
            !
          </span>
          <div className={compact ? "text-xs leading-5" : "text-sm leading-6"}>
            <p className="font-semibold text-amber-950">Exchange deposits</p>
            <p className="mt-0.5 text-slate-600">
              Do not send directly to a centralized exchange. Smart-contract
              transfers may not be credited. Send to a self-custody wallet first.
            </p>
          </div>
        </div>

        <div className={compact ? "flex gap-3 p-3" : "flex gap-3 p-4"}>
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-full bg-sky-100 text-sm text-sky-800"
          >
            ◷
          </span>
          <div className={compact ? "text-xs leading-5" : "text-sm leading-6"}>
            <p className="font-semibold text-sky-950">
              Estimated time · {timing.estimate}
            </p>
            <p className="mt-0.5 text-slate-600">{timing.detail}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
