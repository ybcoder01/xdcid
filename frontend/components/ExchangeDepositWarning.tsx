type ExchangeDepositWarningProps = {
  compact?: boolean;
};

export function ExchangeDepositWarning({
  compact = false
}: ExchangeDepositWarningProps) {
  return (
    <div
      className={
        "border border-amber-300 bg-amber-50 text-amber-950 " +
        (compact
          ? "mt-3 rounded-xl px-3 py-2.5 text-xs leading-5"
          : "mt-5 rounded-md px-4 py-3 text-sm leading-6")
      }
      role="note"
    >
      <p className="font-semibold">Exchange deposit warning</p>
      <p className={compact ? "mt-0.5" : "mt-1"}>
        Do not send cross-chain USDC directly to a centralized exchange deposit
        address. Some exchanges may not credit funds delivered through smart
        contracts. Send to a self-custody wallet first.
      </p>
    </div>
  );
}
