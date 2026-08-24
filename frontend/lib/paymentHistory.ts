import { randomBytes } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getAddress, recoverMessageAddress, type Address, type Hex } from "viem";
import { getDatabase, isDatabaseConfigured } from "./db/client";
import { paymentAccessChallenges, paymentRecords } from "./db/schema";
import {
  decryptPaymentContext,
  encryptPaymentContext,
  type EncryptedPaymentContext
} from "./paymentRecordCrypto";

const ACCESS_TTL_MS = 5 * 60 * 1000;
export const PAYMENT_RECORD_RETENTION_MONTHS = 15;

export type PrivatePaymentContext = {
  reference?: string;
  description?: string;
};

export type CompletedPaymentInput = {
  id: string;
  requestId: string;
  name: string;
  creator: Address;
  payer: Address;
  amountAtomic: string;
  token: string;
  tokenDecimals: number;
  sourceChainId: number;
  destinationChainId: number;
  sourceTransactionHash: Hex;
  destinationTransactionHash?: Hex;
  completedAt?: Date;
  privateContext?: PrivatePaymentContext;
};

export function isPaymentHistoryConfigured(): boolean {
  return isDatabaseConfigured() && Boolean(process.env.PAYMENT_RECORD_ENCRYPTION_KEY);
}

export async function ensurePaymentHistorySchema(): Promise<void> {
  const db = getDatabase();
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS payment_records (
      id varchar(40) PRIMARY KEY,
      request_id varchar(66) NOT NULL,
      name varchar(255) NOT NULL,
      creator varchar(42) NOT NULL,
      payer varchar(42) NOT NULL,
      amount_atomic varchar(80) NOT NULL,
      token varchar(32) NOT NULL,
      token_decimals integer NOT NULL,
      source_chain_id integer NOT NULL,
      destination_chain_id integer NOT NULL,
      source_transaction_hash varchar(66) NOT NULL UNIQUE,
      destination_transaction_hash varchar(66),
      private_ciphertext text,
      private_iv varchar(64),
      private_tag varchar(64),
      completed_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS payment_records_creator_idx ON payment_records (creator);
    CREATE INDEX IF NOT EXISTS payment_records_payer_idx ON payment_records (payer);
    CREATE INDEX IF NOT EXISTS payment_records_expires_at_idx ON payment_records (expires_at);
    CREATE TABLE IF NOT EXISTS payment_access_challenges (
      id varchar(40) PRIMARY KEY,
      payment_record_id varchar(40) NOT NULL REFERENCES payment_records(id) ON DELETE CASCADE,
      address varchar(42) NOT NULL,
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS payment_access_challenges_record_idx ON payment_access_challenges (payment_record_id);
    CREATE INDEX IF NOT EXISTS payment_access_challenges_expires_idx ON payment_access_challenges (expires_at);
  `));
}

function retentionDate(completedAt: Date): Date {
  const expiresAt = new Date(completedAt);
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + PAYMENT_RECORD_RETENTION_MONTHS);
  return expiresAt;
}

export async function saveCompletedPayment(input: CompletedPaymentInput): Promise<void> {
  await ensurePaymentHistorySchema();
  const completedAt = input.completedAt || new Date();
  const encrypted = input.privateContext
    ? encryptPaymentContext(input.privateContext)
    : undefined;
  await getDatabase().insert(paymentRecords).values({
    id: input.id,
    requestId: input.requestId,
    name: input.name,
    creator: getAddress(input.creator).toLowerCase(),
    payer: getAddress(input.payer).toLowerCase(),
    amountAtomic: input.amountAtomic,
    token: input.token,
    tokenDecimals: input.tokenDecimals,
    sourceChainId: input.sourceChainId,
    destinationChainId: input.destinationChainId,
    sourceTransactionHash: input.sourceTransactionHash.toLowerCase(),
    destinationTransactionHash: input.destinationTransactionHash?.toLowerCase(),
    privateCiphertext: encrypted?.ciphertext,
    privateIv: encrypted?.iv,
    privateTag: encrypted?.tag,
    completedAt,
    expiresAt: retentionDate(completedAt)
  }).onConflictDoNothing();
}

export async function createPaymentAccessChallenge(recordId: string, rawAddress: string) {
  await ensurePaymentHistorySchema();
  const address = getAddress(rawAddress).toLowerCase();
  const [record] = await getDatabase().select({
    creator: paymentRecords.creator,
    payer: paymentRecords.payer,
    expiresAt: paymentRecords.expiresAt
  }).from(paymentRecords).where(eq(paymentRecords.id, recordId)).limit(1);
  if (!record || record.expiresAt <= new Date()) return undefined;
  if (address !== record.creator && address !== record.payer) return undefined;

  const id = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + ACCESS_TTL_MS);
  const message = [
    "XDCID private payment receipt access",
    "Record: " + recordId,
    "Wallet: " + getAddress(address),
    "Challenge: " + id,
    "Expires: " + expiresAt.toISOString(),
    "",
    "This signature is gasless and does not authorize a transaction."
  ].join("\n");
  await getDatabase().insert(paymentAccessChallenges).values({
    id,
    paymentRecordId: recordId,
    address,
    message,
    expiresAt
  });
  return { challengeId: id, message, expiresAt };
}

export async function readAuthorizedPayment(
  recordId: string,
  challengeId: string,
  signature: Hex
) {
  await ensurePaymentHistorySchema();
  const now = new Date();
  const [challenge] = await getDatabase().select().from(paymentAccessChallenges).where(
    and(
      eq(paymentAccessChallenges.id, challengeId),
      eq(paymentAccessChallenges.paymentRecordId, recordId),
      isNull(paymentAccessChallenges.usedAt)
    )
  ).limit(1);
  if (!challenge || challenge.expiresAt <= now) return undefined;

  const recovered = (await recoverMessageAddress({
    message: challenge.message,
    signature
  })).toLowerCase();
  if (recovered !== challenge.address) return undefined;

  const [record] = await getDatabase().select().from(paymentRecords).where(
    and(
      eq(paymentRecords.id, recordId),
      or(
        eq(paymentRecords.creator, recovered),
        eq(paymentRecords.payer, recovered)
      )
    )
  ).limit(1);
  if (!record || record.expiresAt <= now) return undefined;

  await getDatabase().update(paymentAccessChallenges)
    .set({ usedAt: now })
    .where(eq(paymentAccessChallenges.id, challengeId));

  let privateContext: PrivatePaymentContext | undefined;
  if (record.privateCiphertext && record.privateIv && record.privateTag) {
    privateContext = decryptPaymentContext<PrivatePaymentContext>({
      ciphertext: record.privateCiphertext,
      iv: record.privateIv,
      tag: record.privateTag
    });
  }
  return { ...record, privateContext };
}

export async function removeExpiredPaymentData(now = new Date()): Promise<number> {
  await ensurePaymentHistorySchema();
  await getDatabase().delete(paymentAccessChallenges).where(
    lt(paymentAccessChallenges.expiresAt, now)
  );
  const deleted = await getDatabase().delete(paymentRecords)
    .where(lt(paymentRecords.expiresAt, now))
    .returning({ id: paymentRecords.id });
  return deleted.length;
}
