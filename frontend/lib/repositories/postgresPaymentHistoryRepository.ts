import { neon } from "@neondatabase/serverless";
import { and, desc, eq, gte, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { getDatabase, isDatabaseConfigured } from "../db/client";
import { paymentAccessChallenges, paymentRecords } from "../db/schema";
import type {
  PaymentAccessChallenge,
  PaymentAccessChallengeWrite,
  PaymentHistoryQuery,
  PaymentHistoryRepository,
  PaymentRecord,
  PaymentRecordWrite
} from "./paymentHistoryRepository";

let schemaPromise: Promise<void> | undefined;

async function createSchema(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Payment history storage is not configured");
  }
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

export class PostgresPaymentHistoryRepository
implements PaymentHistoryRepository {
  isConfigured(): boolean {
    return isDatabaseConfigured();
  }

  async ensureSchema(): Promise<void> {
    if (!schemaPromise) {
      schemaPromise = createSchema().catch((cause) => {
        schemaPromise = undefined;
        throw cause;
      });
    }
    await schemaPromise;
  }

  async saveCompletedPayment(record: PaymentRecordWrite): Promise<void> {
    await this.ensureSchema();
    const saved = await getDatabase()
      .insert(paymentRecords)
      .values(record)
      .onConflictDoUpdate({
        target: paymentRecords.sourceTransactionHash,
        set: {
          destinationTransactionHash: sql`COALESCE(${paymentRecords.destinationTransactionHash}, excluded.destination_transaction_hash)`,
          privateCiphertext: sql`COALESCE(${paymentRecords.privateCiphertext}, excluded.private_ciphertext)`,
          privateIv: sql`COALESCE(${paymentRecords.privateIv}, excluded.private_iv)`,
          privateTag: sql`COALESCE(${paymentRecords.privateTag}, excluded.private_tag)`
        },
        setWhere: sql`
          ${paymentRecords.creator} = excluded.creator AND
          ${paymentRecords.payer} = excluded.payer AND
          ${paymentRecords.amountAtomic} = excluded.amount_atomic AND
          ${paymentRecords.token} = excluded.token AND
          ${paymentRecords.tokenDecimals} = excluded.token_decimals AND
          ${paymentRecords.sourceChainId} = excluded.source_chain_id AND
          ${paymentRecords.destinationChainId} = excluded.destination_chain_id
        `
      })
      .returning({ id: paymentRecords.id });
    if (saved.length !== 1) {
      throw new Error("Transaction hash is already assigned to a different payment");
    }
  }

  async findParticipants(recordId: string) {
    await this.ensureSchema();
    const [record] = await getDatabase()
      .select({ creator: paymentRecords.creator, payer: paymentRecords.payer })
      .from(paymentRecords)
      .where(eq(paymentRecords.id, recordId))
      .limit(1);
    return record;
  }

  async hasParticipantPayments(address: string): Promise<boolean> {
    await this.ensureSchema();
    const [record] = await getDatabase()
      .select({ id: paymentRecords.id })
      .from(paymentRecords)
      .where(or(eq(paymentRecords.creator, address), eq(paymentRecords.payer, address)))
      .limit(1);
    return Boolean(record);
  }

  async createChallenge(challenge: PaymentAccessChallengeWrite): Promise<void> {
    await this.ensureSchema();
    await getDatabase().insert(paymentAccessChallenges).values(challenge);
  }

  async findUnusedChallenge(
    challengeId: string,
    paymentRecordId: string | null
  ): Promise<PaymentAccessChallenge | undefined> {
    await this.ensureSchema();
    const recordCondition = paymentRecordId === null
      ? isNull(paymentAccessChallenges.paymentRecordId)
      : eq(paymentAccessChallenges.paymentRecordId, paymentRecordId);
    const [challenge] = await getDatabase()
      .select()
      .from(paymentAccessChallenges)
      .where(and(
        eq(paymentAccessChallenges.id, challengeId),
        recordCondition,
        isNull(paymentAccessChallenges.usedAt)
      ))
      .limit(1);
    return challenge;
  }

  async markChallengeUsed(challengeId: string, usedAt: Date): Promise<void> {
    await this.ensureSchema();
    await getDatabase()
      .update(paymentAccessChallenges)
      .set({ usedAt })
      .where(eq(paymentAccessChallenges.id, challengeId));
  }

  async listParticipantPayments(query: PaymentHistoryQuery): Promise<PaymentRecord[]> {
    await this.ensureSchema();
    const participant = or(
      eq(paymentRecords.creator, query.participant),
      eq(paymentRecords.payer, query.participant)
    );
    if (!participant) return [];

    const conditions: SQL[] = [participant];
    if (query.from) conditions.push(gte(paymentRecords.completedAt, query.from));
    if (query.to) conditions.push(lte(paymentRecords.completedAt, query.to));
    if (query.token) conditions.push(eq(paymentRecords.token, query.token.toUpperCase()));
    if (query.sourceChainId) {
      conditions.push(eq(paymentRecords.sourceChainId, query.sourceChainId));
    }
    if (query.destinationChainId) {
      conditions.push(eq(paymentRecords.destinationChainId, query.destinationChainId));
    }
    if (query.name) conditions.push(eq(paymentRecords.name, query.name.toLowerCase()));
    if (query.counterparty) {
      const counterpartyMatch = or(
        eq(paymentRecords.creator, query.counterparty),
        eq(paymentRecords.payer, query.counterparty)
      );
      if (counterpartyMatch) conditions.push(counterpartyMatch);
    }

    const databaseQuery = getDatabase()
      .select()
      .from(paymentRecords)
      .where(and(...conditions))
      .orderBy(desc(paymentRecords.completedAt));
    const requestedLimit = query.limit === null
      ? null
      : Math.min(Math.max(query.limit ?? 100, 1), 500);
    return requestedLimit === null
      ? databaseQuery
      : databaseQuery.limit(requestedLimit);
  }

  async findParticipantPayment(
    recordId: string,
    participant: string
  ): Promise<PaymentRecord | undefined> {
    await this.ensureSchema();
    const [record] = await getDatabase()
      .select()
      .from(paymentRecords)
      .where(and(
        eq(paymentRecords.id, recordId),
        or(
          eq(paymentRecords.creator, participant),
          eq(paymentRecords.payer, participant)
        )
      ))
      .limit(1);
    return record;
  }

  async deleteExpiredChallenges(now: Date): Promise<number> {
    await this.ensureSchema();
    const deleted = await getDatabase()
      .delete(paymentAccessChallenges)
      .where(lt(paymentAccessChallenges.expiresAt, now))
      .returning({ id: paymentAccessChallenges.id });
    return deleted.length;
  }
}

export const paymentHistoryRepository: PaymentHistoryRepository =
  new PostgresPaymentHistoryRepository();
