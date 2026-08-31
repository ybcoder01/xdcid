import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getAddress, type Address, type Hash } from "viem";
import { paymentParticipantFingerprint } from "./paymentParticipantFingerprint";
import {
  isArchiveAccessAdministratorWallet,
  isSameArchiveWallet
} from "./archiveAccessAdministrator";

export type ArchivePlanYears = 1 | 3 | 7;

export type ArchivePurchaseChallenge = {
  id: string;
  wallet: Address;
  walletFingerprint: string;
  planYears: ArchivePlanYears;
  amountAtomic: bigint;
  chainId: number;
  treasury: Address;
  message: string;
  expiresAt: Date;
  usedAt: Date | null;
  transactionHash: Hash | null;
};

export type ArchivePurchaseResult = {
  entitlementId: string;
  startsAt: string;
  expiresAt: string;
  transactionHash: Hash;
  idempotent: boolean;
};

const CHALLENGE_MINUTES = 15;

export function normalizeArchivePlanYears(value: unknown): ArchivePlanYears {
  const years = Number(value);
  if (years !== 1 && years !== 3 && years !== 7) {
    throw new Error("Archive plan must be 1, 3, or 7 years");
  }
  return years;
}

export function archivePurchaseMessage(input: {
  challengeId: string;
  wallet: Address;
  planYears: ArchivePlanYears;
  amountAtomic: bigint;
  chainId: number;
  treasury: Address;
  expiresAt: Date;
}): string {
  return [
    "XDCID Archive Subscription",
    "",
    "Authorize this wallet to purchase or renew archive access.",
    "This signature does not move funds.",
    "",
    `Challenge: ${input.challengeId}`,
    `Wallet: ${input.wallet}`,
    `Plan: ${input.planYears} year${input.planYears === 1 ? "" : "s"}`,
    `Amount: ${input.amountAtomic.toString()} USDC atomic units`,
    `Chain ID: ${input.chainId}`,
    `Treasury: ${input.treasury}`,
    `Expires: ${input.expiresAt.toISOString()}`
  ].join("\n");
}

export async function createArchivePurchaseChallenge(input: {
  wallet: string;
  planYears: ArchivePlanYears;
  amountAtomic: bigint;
  chainId: number;
  treasury: string;
}): Promise<ArchivePurchaseChallenge> {
  if (input.amountAtomic <= 0n) throw new Error("Archive price must be positive");
  const wallet = getAddress(input.wallet);
  const treasury = getAddress(input.treasury);
  if (isSameArchiveWallet(wallet, treasury)) {
    throw new Error(
      "The archive treasury cannot purchase a subscription because the transfer would pay itself"
    );
  }
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60_000);
  const message = archivePurchaseMessage({
    challengeId: id,
    wallet,
    planYears: input.planYears,
    amountAtomic: input.amountAtomic,
    chainId: input.chainId,
    treasury,
    expiresAt
  });
  const client = await ensureSchema();
  await client`
    DELETE FROM archive_subscription_challenges
    WHERE expires_at < now() - interval '1 day'
  `;
  const recent = await client`
    SELECT count(*)::integer AS count
    FROM archive_subscription_challenges
    WHERE wallet_fingerprint = ${paymentParticipantFingerprint(wallet)}
      AND created_at > now() - interval '1 hour'
  `;
  if (Number(recent[0]?.count || 0) >= 10) {
    throw new Error("Too many archive checkout attempts; try again later");
  }
  await client`
    INSERT INTO archive_subscription_challenges (
      id, wallet_address, wallet_fingerprint, plan_years, amount_atomic,
      chain_id, treasury, message, expires_at
    ) VALUES (
      ${id}, ${wallet}, ${paymentParticipantFingerprint(wallet)},
      ${input.planYears}, ${input.amountAtomic.toString()}, ${input.chainId},
      ${treasury}, ${message}, ${expiresAt.toISOString()}
    )
  `;
  return {
    id,
    wallet,
    walletFingerprint: paymentParticipantFingerprint(wallet),
    planYears: input.planYears,
    amountAtomic: input.amountAtomic,
    chainId: input.chainId,
    treasury,
    message,
    expiresAt,
    usedAt: null,
    transactionHash: null
  };
}

export async function getArchivePurchaseChallenge(id: string): Promise<ArchivePurchaseChallenge | null> {
  const client = await ensureSchema();
  const rows = await client`
    SELECT *
    FROM archive_subscription_challenges
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ? challengeFromRow(rows[0]) : null;
}

export async function activateArchivePurchase(input: {
  challenge: ArchivePurchaseChallenge;
  transactionHash: Hash;
}): Promise<ArchivePurchaseResult> {
  const client = await ensureSchema();
  const fingerprint = input.challenge.walletFingerprint;
  const existing = await client`
    SELECT p.entitlement_id, e.starts_at, e.expires_at
    FROM archive_subscription_payments p
    JOIN history_archive_entitlements e ON e.id = p.entitlement_id
    WHERE p.chain_id = ${input.challenge.chainId}
      AND p.transaction_hash = ${input.transactionHash.toLowerCase()}
    LIMIT 1
  `;
  if (existing[0]) {
    await markChallengeUsed(client, input.challenge.id, input.transactionHash);
    return purchaseResult(existing[0], input.transactionHash, true);
  }

  const entitlementId = randomUUID();
  const paymentId = randomUUID();
  const rows = await client`
    WITH inserted_payment AS (
      INSERT INTO archive_subscription_payments (
        id, chain_id, transaction_hash, wallet_fingerprint,
        plan_years, amount_atomic, entitlement_id
      ) VALUES (
        ${paymentId}, ${input.challenge.chainId},
        ${input.transactionHash.toLowerCase()}, ${fingerprint},
        ${input.challenge.planYears}, ${input.challenge.amountAtomic.toString()},
        ${entitlementId}
      )
      ON CONFLICT (chain_id, transaction_hash) DO NOTHING
      RETURNING id
    ),
    current_expiry AS (
      SELECT max(expires_at) AS expires_at
      FROM history_archive_entitlements
      WHERE subject_type = 'wallet'
        AND wallet_fingerprint = ${fingerprint}
        AND status = 'active'
        AND expires_at > now()
    ),
    inserted_entitlement AS (
      INSERT INTO history_archive_entitlements (
        id, subject_type, wallet_fingerprint, starts_at, expires_at,
        status, source, created_by
      )
      SELECT
        ${entitlementId}, 'wallet', ${fingerprint}, now(),
        greatest(now(), coalesce(current_expiry.expires_at, now()))
          + (${input.challenge.planYears} * interval '1 year'),
        'active', 'purchase', null
      FROM inserted_payment, current_expiry
      RETURNING id, starts_at, expires_at
    )
    SELECT id AS entitlement_id, starts_at, expires_at
    FROM inserted_entitlement
  `;

  let resultRow = rows[0];
  if (!resultRow) {
    const concurrent = await client`
      SELECT p.entitlement_id, e.starts_at, e.expires_at
      FROM archive_subscription_payments p
      JOIN history_archive_entitlements e ON e.id = p.entitlement_id
      WHERE p.chain_id = ${input.challenge.chainId}
        AND p.transaction_hash = ${input.transactionHash.toLowerCase()}
      LIMIT 1
    `;
    resultRow = concurrent[0];
  }
  if (!resultRow) throw new Error("Archive entitlement activation could not be confirmed");
  await markChallengeUsed(client, input.challenge.id, input.transactionHash);
  return purchaseResult(resultRow, input.transactionHash, false);
}

export type ActiveArchiveSubscription = {
  entitlementId: string;
  startsAt: string | null;
  expiresAt: string | null;
  source: "admin" | "purchase" | "administrator";
  transactionHash: Hash | null;
  planYears: ArchivePlanYears | null;
  amountAtomic: string | null;
  chainId: number | null;
};

export async function getActiveArchiveSubscription(
  wallet: string,
  now = new Date()
): Promise<ActiveArchiveSubscription | null> {
  const normalizedWallet = getAddress(wallet);
  if (await isArchiveAccessAdministratorWallet(normalizedWallet)) {
    return {
      entitlementId: "archive-administrator",
      startsAt: null,
      expiresAt: null,
      source: "administrator",
      transactionHash: null,
      planYears: null,
      amountAtomic: null,
      chainId: null
    };
  }
  const client = await ensureSchema();
  const rows = await client`
    SELECT
      e.id AS entitlement_id,
      e.starts_at,
      e.expires_at,
      e.source,
      p.transaction_hash,
      p.plan_years,
      p.amount_atomic,
      p.chain_id
    FROM history_archive_entitlements e
    LEFT JOIN archive_subscription_payments p ON p.entitlement_id = e.id
    WHERE e.subject_type = 'wallet'
      AND e.wallet_fingerprint = ${paymentParticipantFingerprint(normalizedWallet)}
      AND e.status = 'active'
      AND e.starts_at <= ${now.toISOString()}
      AND e.expires_at >= ${now.toISOString()}
    ORDER BY e.expires_at DESC, p.created_at DESC NULLS LAST
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    entitlementId: String(row.entitlement_id),
    startsAt: new Date(String(row.starts_at)).toISOString(),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    source: String(row.source) as ActiveArchiveSubscription["source"],
    transactionHash: row.transaction_hash ? String(row.transaction_hash) as Hash : null,
    planYears: row.plan_years ? normalizeArchivePlanYears(row.plan_years) : null,
    amountAtomic: row.amount_atomic ? String(row.amount_atomic) : null,
    chainId: row.chain_id === null || row.chain_id === undefined
      ? null
      : Number(row.chain_id)
  };
}

async function markChallengeUsed(
  client: Awaited<ReturnType<typeof ensureSchema>>,
  id: string,
  transactionHash: Hash
) {
  await client`
    UPDATE archive_subscription_challenges
    SET used_at = coalesce(used_at, now()),
      transaction_hash = coalesce(transaction_hash, ${transactionHash.toLowerCase()})
    WHERE id = ${id}
  `;
}

async function ensureSchema() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Archive subscription storage is not configured");
  const client = neon(connectionString);
  await client`
    CREATE TABLE IF NOT EXISTS history_archive_entitlements (
      id uuid PRIMARY KEY,
      subject_type varchar(16) NOT NULL CHECK (subject_type IN ('wallet')),
      wallet_fingerprint varchar(64) NOT NULL,
      starts_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      status varchar(16) NOT NULL CHECK (status IN ('active', 'revoked')),
      source varchar(16) NOT NULL CHECK (source IN ('admin', 'purchase')),
      created_by varchar(42),
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz,
      revoked_by varchar(42),
      CHECK (expires_at > starts_at)
    )
  `;
  await client`
    CREATE TABLE IF NOT EXISTS archive_subscription_challenges (
      id uuid PRIMARY KEY,
      wallet_address varchar(42) NOT NULL,
      wallet_fingerprint varchar(64) NOT NULL,
      plan_years integer NOT NULL CHECK (plan_years IN (1, 3, 7)),
      amount_atomic bigint NOT NULL CHECK (amount_atomic > 0),
      chain_id integer NOT NULL,
      treasury varchar(42) NOT NULL,
      message text NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      transaction_hash varchar(66),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await client`
    CREATE INDEX IF NOT EXISTS archive_subscription_challenges_wallet_idx
    ON archive_subscription_challenges (wallet_fingerprint, created_at)
  `;
  await client`
    CREATE TABLE IF NOT EXISTS archive_subscription_payments (
      id uuid PRIMARY KEY,
      chain_id integer NOT NULL,
      transaction_hash varchar(66) NOT NULL,
      wallet_fingerprint varchar(64) NOT NULL,
      plan_years integer NOT NULL CHECK (plan_years IN (1, 3, 7)),
      amount_atomic bigint NOT NULL CHECK (amount_atomic > 0),
      entitlement_id uuid NOT NULL REFERENCES history_archive_entitlements(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (chain_id, transaction_hash)
    )
  `;
  return client;
}

function challengeFromRow(row: Record<string, unknown>): ArchivePurchaseChallenge {
  return {
    id: String(row.id),
    wallet: getAddress(String(row.wallet_address)),
    walletFingerprint: String(row.wallet_fingerprint),
    planYears: normalizeArchivePlanYears(row.plan_years),
    amountAtomic: BigInt(String(row.amount_atomic)),
    chainId: Number(row.chain_id),
    treasury: getAddress(String(row.treasury)),
    message: String(row.message),
    expiresAt: new Date(String(row.expires_at)),
    usedAt: row.used_at ? new Date(String(row.used_at)) : null,
    transactionHash: row.transaction_hash ? String(row.transaction_hash) as Hash : null
  };
}

function purchaseResult(
  row: Record<string, unknown>,
  transactionHash: Hash,
  idempotent: boolean
): ArchivePurchaseResult {
  return {
    entitlementId: String(row.entitlement_id),
    startsAt: new Date(String(row.starts_at)).toISOString(),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    transactionHash,
    idempotent
  };
}
