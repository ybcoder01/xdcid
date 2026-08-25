export type StoredPrivatePaymentContext = {
  ciphertext: string;
  iv: string;
  tag: string;
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

export type PaymentRecord = {
  id: string;
  requestId: string;
  name: string;
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
  completedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentRecordWrite = Omit<PaymentRecord, "createdAt" | "updatedAt">;

export type PaymentHistoryQuery = {
  participant: string;
  from?: Date;
  to?: Date;
  token?: string;
  sourceChainId?: number;
  destinationChainId?: number;
  name?: string;
  counterparty?: string;
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
  saveCompletedPayment(record: PaymentRecordWrite): Promise<void>;
  findParticipants(recordId: string): Promise<
    Pick<PaymentRecord, "creator" | "payer"> | undefined
  >;
  hasParticipantPayments(address: string): Promise<boolean>;
  createChallenge(challenge: PaymentAccessChallengeWrite): Promise<void>;
  findUnusedChallenge(
    challengeId: string,
    paymentRecordId: string | null
  ): Promise<PaymentAccessChallenge | undefined>;
  markChallengeUsed(challengeId: string, usedAt: Date): Promise<void>;
  listParticipantPayments(query: PaymentHistoryQuery): Promise<PaymentRecord[]>;
  findParticipantPayment(
    recordId: string,
    participant: string
  ): Promise<PaymentRecord | undefined>;
  deleteExpiredChallenges(now: Date): Promise<number>;
}
