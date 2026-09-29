type WalletErrorLike = {
  cause?: unknown;
  code?: unknown;
  message?: unknown;
  name?: unknown;
  shortMessage?: unknown;
};

export function walletActionErrorMessage(
  error: unknown,
  fallback: string,
): string {
  let current: unknown = error;

  for (let depth = 0; current && depth < 8; depth += 1) {
    if (typeof current !== "object") break;
    const candidate = current as WalletErrorLike;
    const message =
      typeof candidate.shortMessage === "string"
        ? candidate.shortMessage
        : typeof candidate.message === "string"
          ? candidate.message
          : "";
    const normalized = message.toLowerCase();

    if (
      candidate.code === 4001 ||
      candidate.code === "ACTION_REJECTED" ||
      candidate.name === "UserRejectedRequestError" ||
      normalized.includes("user rejected") ||
      normalized.includes("user denied") ||
      normalized.includes("denied transaction signature")
    ) {
      return "Transaction cancelled. No changes were saved.";
    }

    current = candidate.cause;
  }

  if (error instanceof Error) {
    return error.message.split("\n")[0]?.trim() || fallback;
  }
  return fallback;
}
