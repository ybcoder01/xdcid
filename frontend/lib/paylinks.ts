import { parseUnits } from "viem";

export type PayToken = "XDC" | "USDC";

export const PAY_TOKEN_DECIMALS: Record<PayToken, number> = {
  XDC: 18,
  USDC: 6,
};

export const MAX_PAY_MEMO_LENGTH = 120;

export function normalizePayToken(value: string | null | undefined): PayToken {
  return value?.toUpperCase() === "USDC" ? "USDC" : "XDC";
}

export function validatePayAmount(value: string, token: PayToken): string | undefined {
  const amount = value.trim();
  if (!amount) return "Enter an amount.";
  if (amount.length > 80 || !/^\d+(?:\.\d+)?$/.test(amount)) {
    return "Enter a positive decimal amount without signs or scientific notation.";
  }

  const fraction = amount.split(".")[1] ?? "";
  if (fraction.length > PAY_TOKEN_DECIMALS[token]) {
    return `${token} supports up to ${PAY_TOKEN_DECIMALS[token]} decimal places.`;
  }

  try {
    if (parseUnits(amount, PAY_TOKEN_DECIMALS[token]) <= 0n) {
      return "Amount must be greater than zero.";
    }
  } catch {
    return "Enter a valid amount.";
  }

  return undefined;
}

export function parsePayAmount(value: string, token: PayToken): bigint {
  const error = validatePayAmount(value, token);
  if (error) throw new Error(error);
  return parseUnits(value.trim(), PAY_TOKEN_DECIMALS[token]);
}

export function validatePayMemo(value: string): string | undefined {
  if (value.length > MAX_PAY_MEMO_LENGTH) {
    return `Memo must be ${MAX_PAY_MEMO_LENGTH} characters or fewer.`;
  }
  return undefined;
}

export function validatePayExpiry(
  value: string | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | undefined {
  if (!value) return undefined;
  if (!/^\d+$/.test(value)) return "Payment link expiry is invalid.";

  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    return "Payment link expiry is invalid.";
  }
  if (timestamp <= nowSeconds) return "This payment request has expired.";
  return undefined;
}

export function buildPayLink(
  baseUrl: string,
  request: {
    name: string;
    amount: string;
    token: PayToken;
    memo?: string;
    expires?: string;
  },
): string {
  const url = new URL(`/pay/${encodeURIComponent(request.name)}`, baseUrl);
  url.searchParams.set("amount", request.amount.trim());
  url.searchParams.set("token", request.token);
  if (request.memo) url.searchParams.set("memo", request.memo);
  if (request.expires) url.searchParams.set("expires", request.expires);
  return url.toString();
}
