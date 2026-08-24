import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { getAddress, recoverMessageAddress, type Address, type Hex } from "viem";
import { getDatabase, isDatabaseConfigured } from "./db/client";
import { paymentAccessChallenges, paymentRecords } from "./db/schema";
import {
  decryptPaymentContext,
  encryptPaymentContext
} from "./paymentRecordCrypto";

const ACCESS_TTL_MS = 5 * 60 * 1000;

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
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Payment history storage is not configured");
  const client = neon(connectionString);
  await client`
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
      expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await client`ALTER TABLE payment_records ALTER COLUMN expires_at DROP NOT NULL`;
  await client`CREATE INDEX IF NOT EXISTS payment_records_creator_idx ON payment_records (creator)`;
  await client`CREATE INDEX IF NOT EXISTS payment_records_payer_idx ON payment_records (payer)`;
  await client`
    CREATE TABLE IF NOT EXISTS payment_access_challenges (
      id varchar(40) PRIMARY KEY,
      payment_record_id varchar(40) REFERENCES payment_records(id) ON DELETE CASCADE,
      address varchar(42) NOT NULL,
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    )
  `;
  await client`ALTER TABLE payment_access_challenges ALTER COLUMN payment_record_id DROP NOT NULL`;
  await client`CREATE INDEX IF NOT EXISTS payment_access_challenges_record_idx ON payment_access_challenges (payment_record_id)`;
  await client`CREATE INDEX IF NOT EXISTS payment_access_challenges_expires_idx ON payment_access_challenges (expires_at)`;
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
    expiresAt: null
  }).onConflictDoNothing();
}

export async function createPaymentAccessChallenge(recordId: string, rawAddress: string) {
  await ensurePaymentHistorySchema();
  const address = getAddress(rawAddress).toLowerCase();
  const [record] = await getDatabase().select({
    creator: paymentRecords.creator,
    payer: paymentRecords.payer
  }).from(paymentRecords).where(eq(paymentRecords.id, recordId)).limit(1);
  if (!record) return undefined;
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

export async function createPaymentHistoryChallenge(rawAddress: string) {
  await ensurePaymentHistorySchema();
  const address = getAddress(rawAddress).toLowerCase();
  const [record] = await getDatabase().select({ id: paymentRecords.id })
    .from(paymentRecords)
    .where(or(eq(paymentRecords.creator, address), eq(paymentRecords.payer, address)))
    .limit(1);
  if (!record) return undefined;

  const id = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + ACCESS_TTL_MS);
  const message = [
    "XDCID private payment history access",
    "Wallet: " + getAddress(address),
    "Challenge: " + id,
    "Expires: " + expiresAt.toISOString(),
    "",
    "This signature is gasless and does not authorize a transaction."
  ].join("\n");
  await getDatabase().insert(paymentAccessChallenges).values({
    id,
    paymentRecordId: null,
    address,
    message,
    expiresAt
  });
  return { challengeId: id, message, expiresAt };
}

export async function readAuthorizedPaymentHistory(
  challengeId: string,
  signature: Hex
) {
  await ensurePaymentHistorySchema();
  const now = new Date();
  const [challenge] = await getDatabase().select().from(paymentAccessChallenges).where(
    and(
      eq(paymentAccessChallenges.id, challengeId),
      isNull(paymentAccessChallenges.paymentRecordId),
      isNull(paymentAccessChallenges.usedAt)
    )
  ).limit(1);
  if (!challenge || challenge.expiresAt <= now) return undefined;

  const recovered = (await recoverMessageAddress({
    message: challenge.message,
    signature
  })).toLowerCase();
  if (recovered !== challenge.address) return undefined;

  await getDatabase().update(paymentAccessChallenges)
    .set({ usedAt: now })
    .where(eq(paymentAccessChallenges.id, challengeId));

  const records = await getDatabase().select().from(paymentRecords)
    .where(or(eq(paymentRecords.creator, recovered), eq(paymentRecords.payer, recovered)))
    .orderBy(desc(paymentRecords.completedAt))
    .limit(100);

  return records.map((record) => {
    let privateContext: PrivatePaymentContext | undefined;
    if (record.privateCiphertext && record.privateIv && record.privateTag) {
      privateContext = decryptPaymentContext<PrivatePaymentContext>({
        ciphertext: record.privateCiphertext,
        iv: record.privateIv,
        tag: record.privateTag
      });
    }
    return { ...record, privateContext };
  });
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
  if (!record) return undefined;

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
  const deleted = await getDatabase().delete(paymentAccessChallenges)
    .where(lt(paymentAccessChallenges.expiresAt, now))
    .returning({ id: paymentAccessChallenges.id });
  return deleted.length;
}
