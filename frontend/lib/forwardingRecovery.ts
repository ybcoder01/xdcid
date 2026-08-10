import { getAddress, isAddress, zeroAddress, type Address, type Hash } from "viem";
import {
  CCTP_MAX_TRANSFER_AMOUNT,
  isCctpTransactionHash
} from "./cctpMainnet";
import { getPaymentNetwork } from "../config/paymentNetworks";

export const FORWARDING_RECOVERY_TTL_SECONDS = 30 * 24 * 60 * 60;

export type ForwardingRecoveryInput = {
  feeTransactionHash: Hash;
  sourceChainId: number;
  recipientAmount: bigint;
  recipient: Address;
  destinationChainId: number;
};

export type ForwardingRecoveryRecord = {
  version: 1;
  feeTransactionHash: Hash;
  sourceChainId: number;
  payer: Address;
  recipientAmount: string;
  convenienceFeeAmount: string;
  recipient: Address;
  destinationChainId: number;
  createdAt: string;
  expiresAt: string;
};

export function parseForwardingRecoveryInput(
  value: unknown
): ForwardingRecoveryInput {
  if (!isRecord(value)) throw new Error("Recovery request must be an object");

  const feeTransactionHash =
    typeof value.feeTransactionHash === "string"
      ? value.feeTransactionHash.trim()
      : "";
  if (!isCctpTransactionHash(feeTransactionHash)) {
    throw new Error("Fee transaction hash must be 32-byte hex");
  }

  const amountText =
    typeof value.recipientAmount === "string"
      ? value.recipientAmount.trim()
      : "";
  if (!/^\d+$/.test(amountText)) {
    throw new Error("Recipient amount must be USDC base units");
  }
  const recipientAmount = BigInt(amountText);
  if (
    recipientAmount <= 0n ||
    recipientAmount > CCTP_MAX_TRANSFER_AMOUNT
  ) {
    throw new Error("Recipient amount is outside the supported range");
  }

  if (typeof value.recipient !== "string" || !isAddress(value.recipient)) {
    throw new Error("Recipient must be a valid EVM address");
  }
  const recipient = getAddress(value.recipient);
  if (recipient === zeroAddress) {
    throw new Error("Recipient must be a non-zero address");
  }

  const sourceChainId = Number(value.sourceChainId);
  const destinationChainId = Number(value.destinationChainId);
  const source = getPaymentNetwork(sourceChainId);
  const destination = getPaymentNetwork(destinationChainId);
  if (!source || !destination || sourceChainId === destinationChainId) {
    throw new Error("Recovery route is not supported");
  }

  return {
    feeTransactionHash,
    sourceChainId,
    recipientAmount,
    recipient,
    destinationChainId
  };
}

export function recoveryRecordMatches(
  record: ForwardingRecoveryRecord,
  input: ForwardingRecoveryInput
): boolean {
  return (
    record.feeTransactionHash.toLowerCase() ===
      input.feeTransactionHash.toLowerCase() &&
    record.sourceChainId === input.sourceChainId &&
    record.recipientAmount === input.recipientAmount.toString() &&
    record.recipient.toLowerCase() === input.recipient.toLowerCase() &&
    record.destinationChainId === input.destinationChainId
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
