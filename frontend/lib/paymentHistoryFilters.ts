import { getAddress, isAddress } from "viem";
import type { PaymentHistoryFilters } from "./paymentHistory";
import type {
  PaymentCompletionMethod,
  PaymentDirection,
  PaymentTransactionType
} from "./repositories/paymentHistoryRepository";

const DIRECTIONS = new Set<PaymentDirection>(["incoming", "outgoing"]);
const TRANSACTION_TYPES = new Set<PaymentTransactionType>([
  "native",
  "same_chain_usdc",
  "cross_chain_usdc",
  "legacy"
]);
const COMPLETION_METHODS = new Set<PaymentCompletionMethod>([
  "direct",
  "standard",
  "automatic",
  "recovered",
  "wallet"
]);

export function parsePaymentHistoryFilters(value: unknown): PaymentHistoryFilters {
  const filters: PaymentHistoryFilters = {};
  if (!value || typeof value !== "object") return filters;
  const input = value as Record<string, unknown>;

  if (typeof input.from === "string" && input.from) {
    const from = new Date(input.from);
    if (!Number.isNaN(from.valueOf())) filters.from = from;
  }
  if (typeof input.to === "string" && input.to) {
    const to = new Date(input.to);
    if (!Number.isNaN(to.valueOf())) filters.to = to;
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    throw new Error("Invalid date range");
  }
  if (typeof input.token === "string" && /^[A-Za-z0-9]{1,32}$/.test(input.token)) {
    filters.token = input.token;
  }
  if (typeof input.sourceChainId === "number" && Number.isInteger(input.sourceChainId) && input.sourceChainId > 0) {
    filters.sourceChainId = input.sourceChainId;
  }
  if (typeof input.destinationChainId === "number" && Number.isInteger(input.destinationChainId) && input.destinationChainId > 0) {
    filters.destinationChainId = input.destinationChainId;
  }
  if (typeof input.name === "string" && input.name.trim()) {
    filters.name = input.name.trim().toLowerCase();
  }
  if (typeof input.counterparty === "string" && input.counterparty.trim()) {
    if (!isAddress(input.counterparty.trim())) throw new Error("Invalid counterparty");
    filters.counterparty = getAddress(input.counterparty.trim());
  }
  if (typeof input.direction === "string" && DIRECTIONS.has(input.direction as PaymentDirection)) {
    filters.direction = input.direction as PaymentDirection;
  }
  if (typeof input.transactionType === "string" && TRANSACTION_TYPES.has(input.transactionType as PaymentTransactionType)) {
    filters.transactionType = input.transactionType as PaymentTransactionType;
  }
  if (typeof input.completionMethod === "string" && COMPLETION_METHODS.has(input.completionMethod as PaymentCompletionMethod)) {
    filters.completionMethod = input.completionMethod as PaymentCompletionMethod;
  }
  return filters;
}
