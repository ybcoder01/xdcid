export type StoredPrivatePaymentContext = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export type PaymentRecord = {
  id: string;
  requestId: string;
  name: string;
  creator: string;
  payer: string;
  amountAtomic: string;
  token: string;
  tokenDecimals: number;
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
};

export type PaymentRecordWrite = Omit<PaymentRecord, "createdAt">;

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
