import { and, count, desc, eq, gt, gte, ilike, lt, or, sql, sum } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import {
  forwardingFeeEvents,
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
    sourceChainId: record.sourceChainId,
    payer: record.payer as ForwardingRecoveryRecord["payer"],
    recipientAmount: record.recipientAmount.toString(),
    convenienceFeeAmount: record.convenienceFeeAmount.toString(),
    recipient: record.recipient as ForwardingRecoveryRecord["recipient"],
    destinationChainId: record.destinationChainId,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString()
  };
}

export type AdminForwardingRecoveryResult = {
  feeTransactionHash: string;
  burnTransactionHash: string | null;
  sourceChainId: number;
  destinationChainId: number;
  payer: string;
  recipient: string;
  recipientAmount: string;
  convenienceFeeAmount: string;
  createdAt: string;
  expiresAt: string;
  stage: "awaiting-burn" | "burn-recorded" | "recovery-expired";
  recommendation: string;
};

export async function searchForwardingRecoveries(
  query: string
): Promise<AdminForwardingRecoveryResult[]> {
  await ensureForwardingRecoverySchema();
  const normalized = query.trim().toLowerCase();
  const hashQuery = /^0x[0-9a-f]{64}$/.test(normalized);
  const addressQuery = /^0x[0-9a-f]{40}$/.test(normalized);
  if (!hashQuery && !addressQuery) return [];

  const condition = hashQuery
    ? or(
        eq(forwardingRecoveries.feeTransactionHash, normalized),
        eq(forwardingRecoveryBurns.burnTransactionHash, normalized)
      )
    : ilike(forwardingRecoveries.payer, normalized);

  const rows = await getDatabase()
    .select({
      feeTransactionHash: forwardingRecoveries.feeTransactionHash,
      burnTransactionHash: forwardingRecoveryBurns.burnTransactionHash,
      sourceChainId: forwardingRecoveries.sourceChainId,
      destinationChainId: forwardingRecoveries.destinationChainId,
      payer: forwardingRecoveries.payer,
      recipient: forwardingRecoveries.recipient,
      recipientAmount: forwardingRecoveries.recipientAmount,
      convenienceFeeAmount: forwardingRecoveries.convenienceFeeAmount,
      createdAt: forwardingRecoveries.createdAt,
      expiresAt: forwardingRecoveries.expiresAt
    })
    .from(forwardingRecoveries)
    .leftJoin(
      forwardingRecoveryBurns,
      eq(
        forwardingRecoveries.feeTransactionHash,
        forwardingRecoveryBurns.feeTransactionHash
      )
    )
    .where(condition)
    .orderBy(desc(forwardingRecoveries.createdAt))
    .limit(25);

  const now = Date.now();
  return rows.map((row) => {
    const stage = row.burnTransactionHash
      ? "burn-recorded"
      : row.expiresAt.getTime() <= now
        ? "recovery-expired"
        : "awaiting-burn";
    const recommendation =
      stage === "burn-recorded"
        ? "The burn was recorded. Check Circle attestation and destination mint in the payer recovery flow."
        : stage === "awaiting-burn"
          ? "The payer can resume automatic forwarding from the source wallet using the fee transaction hash."
          : "The recovery window has expired. Review the source-chain transactions before attempting another payment.";

    return {
      feeTransactionHash: row.feeTransactionHash,
      burnTransactionHash: row.burnTransactionHash,
      sourceChainId: row.sourceChainId,
      destinationChainId: row.destinationChainId,
      payer: row.payer,
      recipient: row.recipient,
      recipientAmount: row.recipientAmount.toString(),
      convenienceFeeAmount: row.convenienceFeeAmount.toString(),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      stage,
      recommendation
    };
  });
}

export type ForwardingRevenueReport = {
  generatedAt: string;
  trendDays: number;
  totals: {
    verifiedFeeCount: number;
    convenienceFeeAmount: string;
    recipientVolume: string;
    burnRecordedCount: number;
  };
  routes: Array<{
    sourceChainId: number;
    destinationChainId: number;
    verifiedFeeCount: number;
    convenienceFeeAmount: string;
    recipientVolume: string;
    burnRecordedCount: number;
  }>;
  daily: Array<{
    date: string;
    verifiedFeeCount: number;
    convenienceFeeAmount: string;
    recipientVolume: string;
    burnRecordedCount: number;
  }>;
};

export async function getForwardingRevenueReport(
  requestedDays = 30
): Promise<ForwardingRevenueReport> {
  await ensureForwardingRecoverySchema();
  const trendDays = Math.min(90, Math.max(7, Math.trunc(requestedDays)));
  const database = getDatabase();

  const [totalRows, routeRows, dailyRows] = await Promise.all([
    database
      .select({
        verifiedFeeCount: count(),
        convenienceFeeAmount: sum(forwardingFeeEvents.convenienceFeeAmount),
        recipientVolume: sum(forwardingFeeEvents.recipientAmount),
        burnRecordedCount: count(forwardingFeeEvents.burnRecordedAt)
      })
      .from(forwardingFeeEvents),
    database
      .select({
        sourceChainId: forwardingFeeEvents.sourceChainId,
        destinationChainId: forwardingFeeEvents.destinationChainId,
        verifiedFeeCount: count(),
        convenienceFeeAmount: sum(forwardingFeeEvents.convenienceFeeAmount),
        recipientVolume: sum(forwardingFeeEvents.recipientAmount),
        burnRecordedCount: count(forwardingFeeEvents.burnRecordedAt)
      })
      .from(forwardingFeeEvents)
      .groupBy(
        forwardingFeeEvents.sourceChainId,
        forwardingFeeEvents.destinationChainId
      )
      .orderBy(desc(sum(forwardingFeeEvents.convenienceFeeAmount))),
    database
      .select({
        date: sql<string>`to_char(date_trunc('day', ${forwardingFeeEvents.createdAt}), 'YYYY-MM-DD')`,
        verifiedFeeCount: count(),
        convenienceFeeAmount: sum(forwardingFeeEvents.convenienceFeeAmount),
        recipientVolume: sum(forwardingFeeEvents.recipientAmount),
        burnRecordedCount: count(forwardingFeeEvents.burnRecordedAt)
      })
      .from(forwardingFeeEvents)
      .where(
        gte(
          forwardingFeeEvents.createdAt,
          new Date(Date.now() - trendDays * 24 * 60 * 60 * 1_000)
        )
      )
      .groupBy(sql`date_trunc('day', ${forwardingFeeEvents.createdAt})`)
      .orderBy(sql`date_trunc('day', ${forwardingFeeEvents.createdAt})`)
  ]);

  const totals = totalRows[0];
  return {
    generatedAt: new Date().toISOString(),
    trendDays,
    totals: {
      verifiedFeeCount: totals?.verifiedFeeCount ?? 0,
      convenienceFeeAmount: totals?.convenienceFeeAmount ?? "0",
      recipientVolume: totals?.recipientVolume ?? "0",
      burnRecordedCount: totals?.burnRecordedCount ?? 0
    },
    routes: routeRows.map((row) => ({
      sourceChainId: row.sourceChainId,
      destinationChainId: row.destinationChainId,
      verifiedFeeCount: row.verifiedFeeCount,
      convenienceFeeAmount: row.convenienceFeeAmount ?? "0",
      recipientVolume: row.recipientVolume ?? "0",
      burnRecordedCount: row.burnRecordedCount
    })),
    daily: dailyRows.map((row) => ({
      date: row.date,
      verifiedFeeCount: row.verifiedFeeCount,
      convenienceFeeAmount: row.convenienceFeeAmount ?? "0",
      recipientVolume: row.recipientVolume ?? "0",
      burnRecordedCount: row.burnRecordedCount
    }))
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
      sourceChainId: record.sourceChainId,
      payer: record.payer,
      recipientAmount: BigInt(record.recipientAmount),
      convenienceFeeAmount: BigInt(record.convenienceFeeAmount),
      recipient: record.recipient,
      destinationChainId: record.destinationChainId,
      createdAt: new Date(record.createdAt),
      expiresAt: new Date(record.expiresAt)
    })
    .onConflictDoNothing()
    .returning({ feeTransactionHash: forwardingRecoveries.feeTransactionHash });
  await getDatabase()
    .insert(forwardingFeeEvents)
    .values({
      feeTransactionHash: normalizeHash(record.feeTransactionHash),
      sourceChainId: record.sourceChainId,
      destinationChainId: record.destinationChainId,
      recipientAmount: BigInt(record.recipientAmount),
      convenienceFeeAmount: BigInt(record.convenienceFeeAmount),
      createdAt: new Date(record.createdAt)
    })
    .onConflictDoNothing();
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
  if (created.length === 1) {
    await getDatabase()
      .update(forwardingFeeEvents)
      .set({ burnRecordedAt: new Date() })
      .where(eq(forwardingFeeEvents.feeTransactionHash, normalizedFeeHash));
    return "created";
  }

  const existing = await getForwardingRecoveryUse(normalizedFeeHash);
  if (existing === normalizedBurnHash) {
    await getDatabase()
      .update(forwardingFeeEvents)
      .set({ burnRecordedAt: new Date() })
      .where(eq(forwardingFeeEvents.feeTransactionHash, normalizedFeeHash));
    return "same";
  }
  return "conflict";
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
      source_chain_id integer NOT NULL DEFAULT 50,
      payer varchar(42) NOT NULL,
      recipient_amount bigint NOT NULL CHECK (recipient_amount > 0),
      convenience_fee_amount bigint NOT NULL CHECK (convenience_fee_amount > 0),
      recipient varchar(42) NOT NULL,
      destination_chain_id integer NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      expires_at timestamptz NOT NULL
    )
  `;
  await client`
    ALTER TABLE forwarding_recoveries
    ADD COLUMN IF NOT EXISTS source_chain_id integer NOT NULL DEFAULT 50
  `;
  await client`
    ALTER TABLE forwarding_recoveries
    ADD COLUMN IF NOT EXISTS convenience_fee_amount bigint
  `;
  await client`
    UPDATE forwarding_recoveries
    SET convenience_fee_amount = LEAST(
      5000000,
      GREATEST(100000, ((recipient_amount * 10) + 9999) / 10000)
    )
    WHERE convenience_fee_amount IS NULL
  `;
  await client`
    ALTER TABLE forwarding_recoveries
    ALTER COLUMN convenience_fee_amount SET NOT NULL
  `;
  await client`
    CREATE INDEX IF NOT EXISTS forwarding_recoveries_source_idx
    ON forwarding_recoveries (source_chain_id)
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
  await client`
    CREATE TABLE IF NOT EXISTS forwarding_fee_events (
      fee_transaction_hash varchar(66) PRIMARY KEY NOT NULL,
      source_chain_id integer NOT NULL,
      destination_chain_id integer NOT NULL,
      recipient_amount bigint NOT NULL,
      convenience_fee_amount bigint NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      burn_recorded_at timestamptz
    )
  `;
  await client`
    INSERT INTO forwarding_fee_events (
      fee_transaction_hash,
      source_chain_id,
      destination_chain_id,
      recipient_amount,
      convenience_fee_amount,
      created_at,
      burn_recorded_at
    )
    SELECT
      recovery.fee_transaction_hash,
      recovery.source_chain_id,
      recovery.destination_chain_id,
      recovery.recipient_amount,
      recovery.convenience_fee_amount,
      recovery.created_at,
      burn.created_at
    FROM forwarding_recoveries recovery
    LEFT JOIN forwarding_recovery_burns burn
      ON burn.fee_transaction_hash = recovery.fee_transaction_hash
    ON CONFLICT (fee_transaction_hash) DO NOTHING
  `;
  await client`
    CREATE INDEX IF NOT EXISTS forwarding_fee_events_created_at_idx
    ON forwarding_fee_events (created_at)
  `;
  await client`
    CREATE INDEX IF NOT EXISTS forwarding_fee_events_route_idx
    ON forwarding_fee_events (source_chain_id, destination_chain_id)
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
