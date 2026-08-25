import { randomBytes } from "node:crypto";
import { getAddress, recoverMessageAddress, type Address, type Hex } from "viem";
import {
  paymentNameFingerprint,
  paymentParticipantFingerprint
} from "./paymentParticipantFingerprint";
import { hasActiveArchiveEntitlement } from "./archiveEntitlements";
import {
  getHistoryAccessPolicy,
  includedHistoryCutoff,
  retainedHistoryCutoff
} from "./historyAccessPolicy";
import { decryptPaymentContext, encryptPaymentContext } from "./paymentRecordCrypto";
import { paymentHistoryRepository } from "./repositories/postgresPaymentHistoryRepository";
import type {
  PaymentChannel,
  PaymentCompletionMethod,
  PaymentDirection,
  PaymentRecord,
  PaymentTransactionType
} from "./repositories/paymentHistoryRepository";

const ACCESS_TTL_MS = 5 * 60 * 1000;

export type PrivatePaymentContext = {
  reference?: string;
  description?: string;
};

export type PaymentHistoryFilters = {
  from?: Date;
  to?: Date;
  token?: string;
  sourceChainId?: number;
  destinationChainId?: number;
  name?: string;
  counterparty?: string;
  direction?: PaymentDirection;
  transactionType?: PaymentTransactionType;
  completionMethod?: PaymentCompletionMethod;
  limit?: number | null;
};

export type CompletedPaymentInput = {
  id: string;
  requestId: string;
  name: string;
  creator: Address;
  payer: Address;
  amountAtomic: string;
  token: string;
  tokenAddress?: Address;
  tokenDecimals: number;
  transactionType: PaymentTransactionType;
  completionMethod: PaymentCompletionMethod;
  paymentChannel: PaymentChannel;
  xdcidFeeAtomic?: string;
  circleFeeAtomic?: string;
  sourceChainId: number;
  destinationChainId: number;
  sourceTransactionHash: Hex;
  destinationTransactionHash?: Hex;
  completedAt?: Date;
  privateContext?: PrivatePaymentContext;
};

export function isPaymentHistoryConfigured(): boolean {
  return paymentHistoryRepository.isConfigured()
    && Boolean(process.env.PAYMENT_RECORD_ENCRYPTION_KEY);
}

export async function ensurePaymentHistorySchema(): Promise<void> {
  await paymentHistoryRepository.ensureSchema();
}

export async function saveCompletedPayment(input: CompletedPaymentInput): Promise<void> {
  const encrypted = input.privateContext
    ? encryptPaymentContext(input.privateContext)
    : undefined;
  const completedAt = input.completedAt || new Date();
  const policy = await getHistoryAccessPolicy();
  const includedAccessExpiresAt = addCalendarMonths(completedAt, policy.freeHistoryMonths);
  const archiveAccessExpiresAt = addCalendarMonths(completedAt, policy.maximumRetentionMonths);
  await paymentHistoryRepository.saveCompletedPayment({
    id: input.id,
    requestId: input.requestId,
    name: input.name,
    nameFingerprint: paymentNameFingerprint(input.name),
    creator: getAddress(input.creator).toLowerCase(),
    payer: getAddress(input.payer).toLowerCase(),
    amountAtomic: input.amountAtomic,
    token: input.token,
    tokenAddress: input.tokenAddress?.toLowerCase() ?? null,
    tokenDecimals: input.tokenDecimals,
    transactionType: input.transactionType,
    completionMethod: input.completionMethod,
    paymentChannel: input.paymentChannel,
    xdcidFeeAtomic: input.xdcidFeeAtomic ?? null,
    circleFeeAtomic: input.circleFeeAtomic ?? null,
    schemaVersion: 2,
    sourceChainId: input.sourceChainId,
    destinationChainId: input.destinationChainId,
    sourceTransactionHash: input.sourceTransactionHash.toLowerCase(),
    destinationTransactionHash: input.destinationTransactionHash?.toLowerCase() ?? null,
    privateCiphertext: encrypted?.ciphertext ?? null,
    privateIv: encrypted?.iv ?? null,
    privateTag: encrypted?.tag ?? null,
    privateKeyVersion: encrypted?.keyVersion ?? null,
    completedAt,
    expiresAt: null
  }, [
    {
      paymentRecordId: input.id,
      participantFingerprint: paymentParticipantFingerprint(input.payer),
      role: "sender",
      includedAccessExpiresAt,
      archiveAccessExpiresAt,
      accessRevokedAt: null
    },
    {
      paymentRecordId: input.id,
      participantFingerprint: paymentParticipantFingerprint(input.creator),
      role: "receiver",
      includedAccessExpiresAt,
      archiveAccessExpiresAt,
      accessRevokedAt: null
    }
  ]);
}

export async function createPaymentAccessChallenge(
  recordId: string,
  rawAddress: string
) {
  const address = getAddress(rawAddress).toLowerCase();
  const access = await paymentHistoryRepository.findParticipantAccess(
    recordId,
    paymentParticipantFingerprint(address)
  );
  if (!access) return undefined;
  return createChallenge(recordId, address, "receipt", recordId);
}

export async function createPaymentHistoryChallenge(rawAddress: string) {
  const address = getAddress(rawAddress).toLowerCase();
  if (!await paymentHistoryRepository.hasParticipantPayments(
    paymentParticipantFingerprint(address)
  )) {
    return undefined;
  }
  return createChallenge(null, address, "history");
}

async function createChallenge(
  paymentRecordId: string | null,
  address: string,
  scope: "receipt" | "history",
  recordId?: string
) {
  const id = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + ACCESS_TTL_MS);
  const message = [
    `XDCID private payment ${scope} access`,
    ...(recordId ? ["Record: " + recordId] : []),
    "Wallet: " + getAddress(address),
    "Challenge: " + id,
    "Expires: " + expiresAt.toISOString(),
    "",
    "This signature is gasless and does not authorize a transaction."
  ].join("\n");
  await paymentHistoryRepository.createChallenge({
    id,
    paymentRecordId,
    address,
    message,
    expiresAt
  });
  return { challengeId: id, message, expiresAt };
}

export async function readAuthorizedPaymentHistory(
  challengeId: string,
  signature: Hex,
  filters?: PaymentHistoryFilters
) {
  const challenge = await authorizeChallenge(challengeId, null, signature);
  if (!challenge) return undefined;

  const counterparty = filters?.counterparty
    ? getAddress(filters.counterparty).toLowerCase()
    : undefined;
  const policy = await getHistoryAccessPolicy();
  const participantFingerprint = paymentParticipantFingerprint(challenge.address);
  const hasArchiveAccess = policy.archiveAccessEnabled && await hasActiveArchiveEntitlement(
    participantFingerprint,
    policy.archiveGraceDays
  );
  const accessCutoff = hasArchiveAccess
    ? retainedHistoryCutoff(policy)
    : includedHistoryCutoff(policy);
  const requestedFrom = filters?.from;
  const effectiveFrom = requestedFrom && requestedFrom > accessCutoff
    ? requestedFrom
    : accessCutoff;
  const records = await paymentHistoryRepository.listParticipantPayments({
    participantFingerprint,
    from: effectiveFrom,
    to: filters?.to,
    token: filters?.token,
    sourceChainId: filters?.sourceChainId,
    destinationChainId: filters?.destinationChainId,
    nameFingerprint: filters?.name ? paymentNameFingerprint(filters.name) : undefined,
    counterpartyFingerprint: counterparty
      ? paymentParticipantFingerprint(counterparty)
      : undefined,
    direction: filters?.direction,
    transactionType: filters?.transactionType,
    completionMethod: filters?.completionMethod,
    limit: filters?.limit
  });
  return records.map((record) => {
    const hydrated = withPrivateContext(record);
    return {
      ...hydrated,
      direction: (hydrated.payer === challenge.address ? "outgoing" : "incoming") as PaymentDirection
    };
  });
}

export async function readAuthorizedPayment(
  recordId: string,
  challengeId: string,
  signature: Hex
) {
  const challenge = await authorizeChallenge(challengeId, recordId, signature);
  if (!challenge) return undefined;

  const record = await paymentHistoryRepository.findParticipantPayment(
    recordId,
    paymentParticipantFingerprint(challenge.address)
  );
  if (!record) return undefined;
  const policy = await getHistoryAccessPolicy();
  const participantFingerprint = paymentParticipantFingerprint(challenge.address);
  const hasArchiveAccess = policy.archiveAccessEnabled && await hasActiveArchiveEntitlement(
    participantFingerprint,
    policy.archiveGraceDays
  );
  const accessCutoff = hasArchiveAccess
    ? retainedHistoryCutoff(policy)
    : includedHistoryCutoff(policy);
  if (record.completedAt < accessCutoff) return undefined;
  return withPrivateContext(record);
}

async function authorizeChallenge(
  challengeId: string,
  paymentRecordId: string | null,
  signature: Hex
) {
  const challenge = await paymentHistoryRepository.findUnusedChallenge(
    challengeId,
    paymentRecordId
  );
  const now = new Date();
  if (!challenge || challenge.expiresAt <= now) return undefined;

  const recovered = (await recoverMessageAddress({
    message: challenge.message,
    signature
  })).toLowerCase();
  if (recovered !== challenge.address) return undefined;

  await paymentHistoryRepository.markChallengeUsed(challengeId, now);
  return challenge;
}

function withPrivateContext(record: PaymentRecord) {
  let privateContext: PrivatePaymentContext | undefined;
  if (record.privateCiphertext && record.privateIv && record.privateTag) {
    privateContext = decryptPaymentContext<PrivatePaymentContext>({
      ciphertext: record.privateCiphertext,
      iv: record.privateIv,
      tag: record.privateTag,
      keyVersion: record.privateKeyVersion ?? 1
    });
  }
  return { ...record, privateContext };
}

function addCalendarMonths(value: Date, months: number): Date {
  const result = new Date(value);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0
  )).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export async function removeExpiredPaymentData(now = new Date()): Promise<number> {
  return paymentHistoryRepository.deleteExpiredChallenges(now);
}
