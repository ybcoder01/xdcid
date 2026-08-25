import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getAddress } from "viem";
import { paymentParticipantFingerprint } from "./paymentParticipantFingerprint";

export type ArchiveEntitlement = {
  id: string;
  subjectType: "wallet";
  walletFingerprint: string;
  startsAt: string;
  expiresAt: string;
  graceEndsAt: string;
  status: "active" | "revoked";
  source: "admin" | "purchase";
  createdBy: string | null;
  createdAt: string;
  revokedAt: string | null;
};

export async function hasActiveArchiveEntitlement(
  walletFingerprint: string,
  graceDays: number,
  now = new Date()
): Promise<boolean> {
  const client = await ensureSchema();
  const rows = await client`
    SELECT expires_at
    FROM history_archive_entitlements
    WHERE subject_type = 'wallet'
      AND wallet_fingerprint = ${walletFingerprint}
      AND status = 'active'
      AND starts_at <= ${now.toISOString()}
      AND expires_at + (${graceDays} * interval '1 day') >= ${now.toISOString()}
    ORDER BY expires_at DESC
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function grantWalletArchiveEntitlement(input: {
  wallet: string;
  startsAt?: Date;
  expiresAt: Date;
  createdBy: string;
  source?: "admin" | "purchase";
}): Promise<ArchiveEntitlement> {
  const wallet = getAddress(input.wallet);
  const startsAt = input.startsAt || new Date();
  if (input.expiresAt <= startsAt) {
    throw new Error("Archive entitlement expiry must be after its start");
  }
  const client = await ensureSchema();
  const id = randomUUID();
  const rows = await client`
    INSERT INTO history_archive_entitlements (
      id, subject_type, wallet_fingerprint, starts_at, expires_at,
      status, source, created_by
    ) VALUES (
      ${id}, 'wallet', ${paymentParticipantFingerprint(wallet)},
      ${startsAt.toISOString()}, ${input.expiresAt.toISOString()},
      'active', ${input.source || "admin"}, ${input.createdBy.toLowerCase()}
    )
    RETURNING *
  `;
  return fromRow(rows[0]);
}

export async function revokeArchiveEntitlement(input: {
  id: string;
  revokedBy: string;
}): Promise<void> {
  const client = await ensureSchema();
  const rows = await client`
    UPDATE history_archive_entitlements
    SET status = 'revoked', revoked_at = now(), revoked_by = ${input.revokedBy.toLowerCase()}
    WHERE id = ${input.id} AND status = 'active'
    RETURNING id
  `;
  if (rows.length !== 1) throw new Error("Active archive entitlement was not found");
}

export async function listArchiveEntitlements(limit = 100): Promise<ArchiveEntitlement[]> {
  const client = await ensureSchema();
  const rows = await client`
    SELECT *
    FROM history_archive_entitlements
    ORDER BY created_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 500)}
  `;
  return rows.map(fromRow);
}

async function ensureSchema() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Archive entitlement storage is not configured");
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
    CREATE INDEX IF NOT EXISTS history_archive_entitlements_wallet_idx
    ON history_archive_entitlements (wallet_fingerprint, status, expires_at)
  `;
  return client;
}

function fromRow(row: Record<string, unknown>): ArchiveEntitlement {
  const expiresAt = new Date(String(row.expires_at));
  return {
    id: String(row.id),
    subjectType: "wallet",
    walletFingerprint: String(row.wallet_fingerprint),
    startsAt: new Date(String(row.starts_at)).toISOString(),
    expiresAt: expiresAt.toISOString(),
    graceEndsAt: expiresAt.toISOString(),
    status: String(row.status) as ArchiveEntitlement["status"],
    source: String(row.source) as ArchiveEntitlement["source"],
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : null
  };
}
