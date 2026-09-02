import { neon } from "@neondatabase/serverless";
import { getAddress, isAddress, type Address } from "viem";
import { paymentParticipantFingerprint } from "./paymentParticipantFingerprint";

export type ArchiveAccessAdministrator = {
  wallet: Address;
  walletFingerprint: string;
  updatedBy: Address | null;
  updatedAt: string;
};

export function isSameArchiveWallet(wallet: string, other: string): boolean {
  if (!isAddress(wallet) || !isAddress(other)) return false;
  return getAddress(wallet) === getAddress(other);
}

export async function getArchiveAccessAdministrator(): Promise<ArchiveAccessAdministrator | null> {
  const client = await ensureSchema();
  const rows = await client`
    SELECT wallet_address, wallet_fingerprint, updated_by, updated_at
    FROM archive_access_administrator
    WHERE id = 1
    LIMIT 1
  `;
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function setArchiveAccessAdministrator(input: {
  wallet: string;
  updatedBy: string;
}): Promise<ArchiveAccessAdministrator> {
  const wallet = getAddress(input.wallet);
  const updatedBy = getAddress(input.updatedBy);
  const client = await ensureSchema();
  const rows = await client`
    INSERT INTO archive_access_administrator (
      id, wallet_address, wallet_fingerprint, updated_by, updated_at
    ) VALUES (
      1, ${wallet}, ${paymentParticipantFingerprint(wallet)}, ${updatedBy}, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      wallet_address = excluded.wallet_address,
      wallet_fingerprint = excluded.wallet_fingerprint,
      updated_by = excluded.updated_by,
      updated_at = now()
    RETURNING wallet_address, wallet_fingerprint, updated_by, updated_at
  `;
  return fromRow(rows[0]);
}

export async function isArchiveAccessAdministratorWallet(wallet: string): Promise<boolean> {
  const administrator = await getArchiveAccessAdministrator();
  return administrator ? isSameArchiveWallet(wallet, administrator.wallet) : false;
}

export async function isArchiveAccessAdministratorFingerprint(
  walletFingerprint: string
): Promise<boolean> {
  const administrator = await getArchiveAccessAdministrator();
  return administrator?.walletFingerprint === walletFingerprint;
}

async function ensureSchema() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Archive administrator storage is not configured");
  const client = neon(connectionString);
  await client`
    CREATE TABLE IF NOT EXISTS archive_access_administrator (
      id smallint PRIMARY KEY CHECK (id = 1),
      wallet_address varchar(42) NOT NULL,
      wallet_fingerprint varchar(64) NOT NULL,
      updated_by varchar(42),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const initialWallet = process.env.ARCHIVE_SUBSCRIPTION_TREASURY_ADDRESS || "";
  if (isAddress(initialWallet)) {
    const wallet = getAddress(initialWallet);
    await client`
      INSERT INTO archive_access_administrator (
        id, wallet_address, wallet_fingerprint, updated_by
      ) VALUES (
        1, ${wallet}, ${paymentParticipantFingerprint(wallet)}, null
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
  return client;
}

function fromRow(row: Record<string, unknown>): ArchiveAccessAdministrator {
  return {
    wallet: getAddress(String(row.wallet_address)),
    walletFingerprint: String(row.wallet_fingerprint),
    updatedBy: row.updated_by ? getAddress(String(row.updated_by)) : null,
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}
