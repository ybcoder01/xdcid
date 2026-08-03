import { and, eq, gt, lt, sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import {
  forwardingRecoveries,
  forwardingRecoveryBurns
} from "./db/schema";
import {
  getDatabase,
  isDatabaseConfigured
} from "./db/client";
import type { ForwardingRecoveryRecord } from "./forwardingRecovery";

let schemaPromise: Promise<void> | undefined;

export function isForwardingRecoveryStoreConfigured(): boolean {
  return isDatabaseConfigured();
}

export async function checkForwardingRecoveryStore(): Promise<void> {
  await ensureForwardingRecoverySchema();
  await getDatabase().execute(sql`select 1`);
}

export async function getForwardingRecoveryRecord(
  feeTransactionHash: string
): Promise<ForwardingRecoveryRecord | null> {
  await ensureForwardingRecoverySchema();
  const rows = await getDatabase()
    .select()
    .from(forwardingRecoveries)
    .where(
      and(
        eq(forwardingRecoveries.feeTransactionHash, normalizeHash(feeTransactionHash)),
        gt(forwardingRecoveries.expiresAt, new Date())
      )
    )
    .limit(1);
  const record = rows[0];
  if (!record) return null;
  return {
    version: 1,
    feeTransactionHash: record.feeTransactionHash as ForwardingRecoveryRecord["feeTransactionHash"],
    payer: record.payer as ForwardingRecoveryRecord["payer"],
    recipientAmount: record.recipientAmount.toString(),
    recipient: record.recipient as ForwardingRecoveryRecord["recipient"],
    destinationChainId: record.destinationChainId,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString()
  };
}

export async function createForwardingRecoveryRecord(
  record: ForwardingRecoveryRecord
): Promise<boolean> {
  await ensureForwardingRecoverySchema();
  await removeExpiredRecoveries();
  const created = await getDatabase()
    .insert(forwardingRecoveries)
    .values({
      feeTransactionHash: normalizeHash(record.feeTransactionHash),
      payer: record.payer,
      recipientAmount: BigInt(record.recipientAmount),
      recipient: record.recipient,
      destinationChainId: record.destinationChainId,
      createdAt: new Date(record.createdAt),
      expiresAt: new Date(record.expiresAt)
    })
    .onConflictDoNothing()
    .returning({ feeTransactionHash: forwardingRecoveries.feeTransactionHash });
  return created.length === 1;
}

export async function getForwardingRecoveryUse(
  feeTransactionHash: string
): Promise<string | null> {
  await ensureForwardingRecoverySchema();
  const rows = await getDatabase()
    .select({ burnTransactionHash: forwardingRecoveryBurns.burnTransactionHash })
    .from(forwardingRecoveryBurns)
    .where(
      eq(
        forwardingRecoveryBurns.feeTransactionHash,
        normalizeHash(feeTransactionHash)
      )
    )
    .limit(1);
  return rows[0]?.burnTransactionHash ?? null;
}

export async function markForwardingRecoveryUsed(
  feeTransactionHash: string,
  burnTransactionHash: string
): Promise<"created" | "same" | "conflict"> {
  await ensureForwardingRecoverySchema();
  const normalizedFeeHash = normalizeHash(feeTransactionHash);
  const normalizedBurnHash = normalizeHash(burnTransactionHash);
  const created = await getDatabase()
    .insert(forwardingRecoveryBurns)
    .values({
      feeTransactionHash: normalizedFeeHash,
      burnTransactionHash: normalizedBurnHash
    })
    .onConflictDoNothing()
    .returning({ burnTransactionHash: forwardingRecoveryBurns.burnTransactionHash });
  if (created.length === 1) return "created";

  const existing = await getForwardingRecoveryUse(normalizedFeeHash);
  return existing === normalizedBurnHash ? "same" : "conflict";
}

async function ensureForwardingRecoverySchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = createSchema().catch((cause) => {
      schemaPromise = undefined;
      throw cause;
    });
  }
  await schemaPromise;
}

async function createSchema(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Forwarding recovery storage is not configured");
  }
  const client = neon(connectionString);
  await client`
    CREATE TABLE IF NOT EXISTS forwarding_recoveries (
      fee_transaction_hash varchar(66) PRIMARY KEY NOT NULL,
      payer varchar(42) NOT NULL,
      recipient_amount bigint NOT NULL CHECK (recipient_amount > 0),
      recipient varchar(42) NOT NULL,
      destination_chain_id integer NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      expires_at timestamptz NOT NULL
    )
  `;
  await client`
    CREATE INDEX IF NOT EXISTS forwarding_recoveries_payer_idx
    ON forwarding_recoveries (payer)
  `;
  await client`
    CREATE INDEX IF NOT EXISTS forwarding_recoveries_expires_at_idx
    ON forwarding_recoveries (expires_at)
  `;
  await client`
    CREATE INDEX IF NOT EXISTS forwarding_recoveries_destination_idx
    ON forwarding_recoveries (destination_chain_id)
  `;
  await client`
    CREATE TABLE IF NOT EXISTS forwarding_recovery_burns (
      fee_transaction_hash varchar(66) PRIMARY KEY NOT NULL
        REFERENCES forwarding_recoveries (fee_transaction_hash) ON DELETE CASCADE,
      burn_transaction_hash varchar(66) NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL
    )
  `;
  await client`
    CREATE UNIQUE INDEX IF NOT EXISTS forwarding_recovery_burn_hash_uidx
    ON forwarding_recovery_burns (burn_transaction_hash)
  `;
}

async function removeExpiredRecoveries(): Promise<void> {
  await getDatabase()
    .delete(forwardingRecoveries)
    .where(lt(forwardingRecoveries.expiresAt, new Date()));
}

function normalizeHash(value: string): string {
  return value.toLowerCase();
}
