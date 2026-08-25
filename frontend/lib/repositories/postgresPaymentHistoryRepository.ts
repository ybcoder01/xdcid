import { neon } from "@neondatabase/serverless";
import { and, desc, eq, gte, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { getDatabase, isDatabaseConfigured } from "../db/client";
import {
  paymentAccessChallenges,
  paymentPrivateContexts,
  paymentRecords
} from "../db/schema";
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
  await client`ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS token_address varchar(42)`;
  await client`ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS transaction_type varchar(32) NOT NULL DEFAULT 'legacy'`;
  await client`ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS completion_method varchar(32) NOT NULL DEFAULT 'wallet'`;
  await client`ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS payment_channel varchar(32) NOT NULL DEFAULT 'send'`;
  await client`ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS xdcid_fee_atomic varchar(80)`;
  await client`ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS circle_fee_atomic varchar(80)`;
  await client`ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 2`;
  await client`ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`;
  await client`
    UPDATE payment_records
    SET transaction_type = CASE
      WHEN source_chain_id <> destination_chain_id THEN 'cross_chain_usdc'
      WHEN upper(token) = 'USDC' THEN 'same_chain_usdc'
      ELSE 'native'
    END
    WHERE transaction_type = 'legacy'
  `;
  await client`CREATE INDEX IF NOT EXISTS payment_records_creator_idx ON payment_records (creator)`;
  await client`CREATE INDEX IF NOT EXISTS payment_records_payer_idx ON payment_records (payer)`;
  await client`CREATE INDEX IF NOT EXISTS payment_records_completed_at_idx ON payment_records (completed_at)`;
  await client`CREATE INDEX IF NOT EXISTS payment_records_type_idx ON payment_records (transaction_type)`;
  await client`
    CREATE TABLE IF NOT EXISTS payment_private_contexts (
      payment_record_id varchar(40) PRIMARY KEY REFERENCES payment_records(id) ON DELETE CASCADE,
      ciphertext text NOT NULL,
      iv varchar(64) NOT NULL,
      tag varchar(64) NOT NULL,
      key_version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await client`
    INSERT INTO payment_private_contexts (
      payment_record_id, ciphertext, iv, tag, key_version
    )
    SELECT id, private_ciphertext, private_iv, private_tag, 1
    FROM payment_records
    WHERE private_ciphertext IS NOT NULL
      AND private_iv IS NOT NULL
      AND private_tag IS NOT NULL
    ON CONFLICT (payment_record_id) DO NOTHING
  `;
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
    const {
      privateCiphertext,
      privateIv,
      privateTag,
      ...canonicalRecord
    } = record;
    const saved = await getDatabase()
      .insert(paymentRecords)
      .values({
        ...canonicalRecord,
        privateCiphertext: null,
        privateIv: null,
        privateTag: null
      })
      .onConflictDoUpdate({
        target: paymentRecords.sourceTransactionHash,
        set: {
          destinationTransactionHash: sql`COALESCE(${paymentRecords.destinationTransactionHash}, excluded.destination_transaction_hash)`,
          tokenAddress: sql`COALESCE(${paymentRecords.tokenAddress}, excluded.token_address)`,
          xdcidFeeAtomic: sql`COALESCE(${paymentRecords.xdcidFeeAtomic}, excluded.xdcid_fee_atomic)`,
          circleFeeAtomic: sql`COALESCE(${paymentRecords.circleFeeAtomic}, excluded.circle_fee_atomic)`,
          updatedAt: new Date()
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
    if (privateCiphertext && privateIv && privateTag) {
      await getDatabase()
        .insert(paymentPrivateContexts)
        .values({
          paymentRecordId: saved[0].id,
          ciphertext: privateCiphertext,
          iv: privateIv,
          tag: privateTag,
          keyVersion: 1
        })
        .onConflictDoNothing();
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
      .select({
        payment: paymentRecords,
        privateContext: paymentPrivateContexts
      })
      .from(paymentRecords)
      .leftJoin(
        paymentPrivateContexts,
        eq(paymentPrivateContexts.paymentRecordId, paymentRecords.id)
      )
      .where(and(...conditions))
      .orderBy(desc(paymentRecords.completedAt));
    const requestedLimit = query.limit === null
      ? null
      : Math.min(Math.max(query.limit ?? 100, 1), 500);
    const rows = requestedLimit === null
      ? await databaseQuery
      : await databaseQuery.limit(requestedLimit);
    return rows.map(toPaymentRecord);
  }

  async findParticipantPayment(
    recordId: string,
    participant: string
  ): Promise<PaymentRecord | undefined> {
    await this.ensureSchema();
    const [record] = await getDatabase()
      .select({
        payment: paymentRecords,
        privateContext: paymentPrivateContexts
      })
      .from(paymentRecords)
      .leftJoin(
        paymentPrivateContexts,
        eq(paymentPrivateContexts.paymentRecordId, paymentRecords.id)
      )
      .where(and(
        eq(paymentRecords.id, recordId),
        or(
          eq(paymentRecords.creator, participant),
          eq(paymentRecords.payer, participant)
        )
      ))
      .limit(1);
    return record ? toPaymentRecord(record) : undefined;
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


function toPaymentRecord(row: {
  payment: typeof paymentRecords.$inferSelect;
  privateContext: typeof paymentPrivateContexts.$inferSelect | null;
}): PaymentRecord {
  return {
    ...row.payment,
    privateCiphertext: row.privateContext?.ciphertext ?? row.payment.privateCiphertext,
    privateIv: row.privateContext?.iv ?? row.payment.privateIv,
    privateTag: row.privateContext?.tag ?? row.payment.privateTag
  };
}
