export type StoredPrivatePaymentContext = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
};

export type PaymentTransactionType =
  | "native"
  | "same_chain_usdc"
  | "cross_chain_usdc"
  | "legacy";

export type PaymentCompletionMethod =
  | "direct"
  | "standard"
  | "automatic"
  | "recovered"
  | "wallet";

export type PaymentChannel = "send" | "pay_link";

export type PaymentDirection = "incoming" | "outgoing";

export type PaymentRecord = {
  id: string;
  requestId: string;
  name: string;
  nameFingerprint: string | null;
  creator: string;
  payer: string;
  amountAtomic: string;
  token: string;
  tokenAddress: string | null;
  tokenDecimals: number;
  transactionType: PaymentTransactionType;
  completionMethod: PaymentCompletionMethod;
  paymentChannel: PaymentChannel;
  xdcidFeeAtomic: string | null;
  circleFeeAtomic: string | null;
  schemaVersion: number;
  sourceChainId: number;
  destinationChainId: number;
  sourceTransactionHash: string;
  destinationTransactionHash: string | null;
  privateCiphertext: string | null;
  privateIv: string | null;
  privateTag: string | null;
  privateKeyVersion: number | null;
  completedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentRecordWrite = Omit<PaymentRecord, "createdAt" | "updatedAt">;

export type PaymentParticipantRole = "sender" | "receiver";

export type PaymentParticipantAccess = {
  paymentRecordId: string;
  participantFingerprint: string;
  role: PaymentParticipantRole;
  includedAccessExpiresAt: Date;
  archiveAccessExpiresAt: Date;
  accessRevokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentParticipantAccessWrite = Omit<
  PaymentParticipantAccess,
  "createdAt" | "updatedAt"
>;

export type PaymentHistoryQuery = {
  participantFingerprint: string;
  direction?: PaymentDirection;
  transactionType?: PaymentTransactionType;
  completionMethod?: PaymentCompletionMethod;
  from?: Date;
  to?: Date;
  token?: string;
  sourceChainId?: number;
  destinationChainId?: number;
  nameFingerprint?: string;
  counterpartyFingerprint?: string;
  limit?: number | null;
};

export type PaymentAccessChallenge = {
  id: string;
  paymentRecordId: string | null;
  address: string;
  message: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
};

export type PaymentAccessChallengeWrite = Pick<
  PaymentAccessChallenge,
  "id" | "paymentRecordId" | "address" | "message" | "expiresAt"
>;

export interface PaymentHistoryRepository {
  isConfigured(): boolean;
  ensureSchema(): Promise<void>;
  saveCompletedPayment(
    record: PaymentRecordWrite,
    participantAccess: PaymentParticipantAccessWrite[]
  ): Promise<void>;
  findParticipantAccess(
    recordId: string,
    participantFingerprint: string
  ): Promise<PaymentParticipantAccess | undefined>;
  hasParticipantPayments(participantFingerprint: string): Promise<boolean>;
  createChallenge(challenge: PaymentAccessChallengeWrite): Promise<void>;
  findUnusedChallenge(
    challengeId: string,
    paymentRecordId: string | null
  ): Promise<PaymentAccessChallenge | undefined>;
  markChallengeUsed(challengeId: string, usedAt: Date): Promise<void>;
  listParticipantPayments(query: PaymentHistoryQuery): Promise<PaymentRecord[]>;
  findParticipantPayment(
    recordId: string,
    participantFingerprint: string
  ): Promise<PaymentRecord | undefined>;
  deleteExpiredChallenges(now: Date): Promise<number>;
}
