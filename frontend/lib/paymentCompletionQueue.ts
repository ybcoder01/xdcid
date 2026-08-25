import type { Hash } from "viem";

const STORAGE_KEY = "xdcid.pending-payment-completions.v1";
const RETRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING_COMPLETIONS = 50;

export type PaymentCompletionPayload = {
  name: string;
  sourceChainId: number;
  destinationChainId: number;
  token: "NATIVE" | "USDC";
  amountAtomic: string;
  recipient: string;
  sourceTransactionHash: Hash;
  destinationTransactionHash?: Hash;
  reference?: string;
  description?: string;
  paymentChannel: "send" | "pay_link";
  completionMethod?: "direct" | "standard" | "automatic" | "recovered";
  xdcidFeeAtomic?: string;
  circleFeeAtomic?: string;
};

type QueuedCompletion = {
  key: string;
  queuedAt: number;
  payload: Omit<PaymentCompletionPayload, "reference" | "description">;
};

export async function submitPaymentCompletion(
  payload: PaymentCompletionPayload
): Promise<void> {
  const key = completionKey(payload);
  rememberCompletion(payload);
  const response = await postCompletion(payload);
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Payment history could not be recorded");
  }
  forgetCompletion(key);
}

export async function retryPendingPaymentCompletions(): Promise<number> {
  const pending = readQueue();
  let completed = 0;
  for (const item of pending) {
    try {
      const response = await postCompletion(item.payload);
      if (!response.ok) continue;
      forgetCompletion(item.key);
      completed += 1;
    } catch {
      // A later page load or online event will retry the verified transaction.
    }
  }
  return completed;
}

export function installPaymentCompletionRetry(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const retry = () => {
    void retryPendingPaymentCompletions();
  };
  retry();
  window.addEventListener("online", retry);
  return () => window.removeEventListener("online", retry);
}

async function postCompletion(
  payload: Omit<PaymentCompletionPayload, never>
): Promise<Response> {
  return fetch("/api/payment-history/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function rememberCompletion(payload: PaymentCompletionPayload): void {
  if (typeof window === "undefined") return;
  const key = completionKey(payload);
  const safePayload = {
    name: payload.name,
    sourceChainId: payload.sourceChainId,
    destinationChainId: payload.destinationChainId,
    token: payload.token,
    amountAtomic: payload.amountAtomic,
    recipient: payload.recipient,
    sourceTransactionHash: payload.sourceTransactionHash,
    destinationTransactionHash: payload.destinationTransactionHash,
    paymentChannel: payload.paymentChannel,
    completionMethod: payload.completionMethod,
    xdcidFeeAtomic: payload.xdcidFeeAtomic,
    circleFeeAtomic: payload.circleFeeAtomic
  };
  const next = readQueue().filter((item) => item.key !== key);
  next.push({ key, queuedAt: Date.now(), payload: safePayload });
  writeQueue(next.slice(-MAX_PENDING_COMPLETIONS));
}

function forgetCompletion(key: string): void {
  if (typeof window === "undefined") return;
  writeQueue(readQueue().filter((item) => item.key !== key));
}

function readQueue(): QueuedCompletion[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - RETRY_TTL_MS;
    return parsed.filter(isQueuedCompletion).filter((item) => item.queuedAt >= cutoff);
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedCompletion[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // History recording still proceeds even when browser storage is unavailable.
  }
}

function isQueuedCompletion(value: unknown): value is QueuedCompletion {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<QueuedCompletion>;
  return (
    typeof item.key === "string" &&
    typeof item.queuedAt === "number" &&
    Boolean(item.payload) &&
    typeof item.payload?.sourceTransactionHash === "string"
  );
}

function completionKey(
  payload: Pick<PaymentCompletionPayload, "sourceChainId" | "sourceTransactionHash">
): string {
  return payload.sourceChainId + ":" + payload.sourceTransactionHash.toLowerCase();
}
