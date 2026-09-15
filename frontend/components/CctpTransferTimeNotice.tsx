import { getPaymentNetwork } from "../config/paymentNetworks";
import { getCctpTimingNotice } from "../lib/cctpTiming";

type CctpTransferTimeNoticeProps = {
  compact?: boolean;
  sourceChainId: number;
};

export function CctpTransferTimeNotice({
  compact = false,
  sourceChainId
}: CctpTransferTimeNoticeProps) {
  const sourceName =
    getPaymentNetwork(sourceChainId)?.name || "the source network";
  const notice = getCctpTimingNotice(sourceChainId, sourceName);

  return (
    <div
      className={
        "border border-sky-200 bg-sky-50 text-sky-950 " +
        (compact
          ? "mt-2 rounded-xl px-3 py-2.5 text-xs leading-5"
          : "mt-3 rounded-md px-4 py-3 text-sm leading-6")
      }
      role="note"
    >
      <p className="font-semibold">Estimated transfer time: {notice.estimate}</p>
      <p className={compact ? "mt-0.5" : "mt-1"}>{notice.detail}</p>
    </div>
  );
}
