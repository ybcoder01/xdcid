import { randomBytes } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getAddress, type Address } from "viem";
import { encryptPaymentIdentity, decryptPaymentIdentity } from "./paymentRecordCrypto";
import { paymentParticipantFingerprint } from "./paymentParticipantFingerprint";
import type { ExchangeAddressBookEntry, ExchangeAddressBookInput } from "./exchangeAddressBook";

type VaultChallenge = {
  id: string;
  address: Address;
  messageHash: string;
  expiresAt: Date;
  usedAt?: Date;
};

let schemaPromise: Promise<void> | undefined;

export async function createPrivateVaultChallengeRecord(input: Omit<VaultChallenge, "usedAt">) {
  const client = await clientWithSchema();
  await client`DELETE FROM private_vault_challenges WHERE expires_at < now()`;
  await client`
    INSERT INTO private_vault_challenges (id, address, message_hash, expires_at)
    VALUES (${input.id}, ${input.address.toLowerCase()}, ${input.messageHash}, ${input.expiresAt.toISOString()})
  `;
}

export async function getPrivateVaultChallenge(id: string): Promise<VaultChallenge | null> {
  const client = await clientWithSchema();
  const rows = await client`SELECT * FROM private_vault_challenges WHERE id = ${id} LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    address: getAddress(String(row.address)),
    messageHash: String(row.message_hash),
    expiresAt: new Date(String(row.expires_at)),
    usedAt: row.used_at ? new Date(String(row.used_at)) : undefined,
  };
}

export async function consumePrivateVaultChallenge(id: string): Promise<boolean> {
  const client = await clientWithSchema();
  const rows = await client`
    UPDATE private_vault_challenges
    SET used_at = now()
    WHERE id = ${id} AND used_at IS NULL AND expires_at > now()
    RETURNING id
  `;
  return rows.length === 1;
}

export async function listExchangeAddressBookEntries(owner: Address): Promise<ExchangeAddressBookEntry[]> {
  const client = await clientWithSchema();
  const rows = await client`
    SELECT * FROM exchange_address_book_entries
    WHERE owner_fingerprint = ${paymentParticipantFingerprint(owner)}
    ORDER BY updated_at DESC
    LIMIT 100
  `;
  return rows.map(rowToEntry);
}

export async function createExchangeAddressBookEntry(
  owner: Address,
  input: ExchangeAddressBookInput,
): Promise<ExchangeAddressBookEntry> {
  const client = await clientWithSchema();
  const fingerprint = paymentParticipantFingerprint(owner);
  const countRows = await client`
    SELECT count(*)::integer AS count FROM exchange_address_book_entries
    WHERE owner_fingerprint = ${fingerprint}
  `;
  if (Number(countRows[0]?.count || 0) >= 100) {
    throw new Error("Address book limit reached");
  }
  const now = new Date().toISOString();
  const entry: ExchangeAddressBookEntry = {
    ...input,
    id: randomBytes(20).toString("hex"),
    confirmedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const rows = await client`
    INSERT INTO exchange_address_book_entries (
      id, owner_fingerprint, encrypted_payload, created_at, updated_at
    ) VALUES (
      ${entry.id}, ${fingerprint}, ${encryptPaymentIdentity(JSON.stringify(entry))}, ${now}, ${now}
    ) RETURNING *
  `;
  return rowToEntry(rows[0]);
}

export async function updateExchangeAddressBookEntry(
  owner: Address,
  id: string,
  input: ExchangeAddressBookInput,
): Promise<ExchangeAddressBookEntry | null> {
  const client = await clientWithSchema();
  const fingerprint = paymentParticipantFingerprint(owner);
  const currentRows = await client`
    SELECT * FROM exchange_address_book_entries
    WHERE id = ${id} AND owner_fingerprint = ${fingerprint}
    LIMIT 1
  `;
  if (!currentRows[0]) return null;
  const current = rowToEntry(currentRows[0]);
  const now = new Date().toISOString();
  const changedDestination = current.address !== input.address
    || current.chainId !== input.chainId
    || current.asset !== input.asset
    || (current.memo || "") !== (input.memo || "");
  const entry: ExchangeAddressBookEntry = {
    ...input,
    id,
    confirmedAt: changedDestination ? now : current.confirmedAt,
    createdAt: current.createdAt,
    updatedAt: now,
  };
  const rows = await client`
    UPDATE exchange_address_book_entries
    SET encrypted_payload = ${encryptPaymentIdentity(JSON.stringify(entry))}, updated_at = ${now}
    WHERE id = ${id} AND owner_fingerprint = ${fingerprint}
    RETURNING *
  `;
  return rows[0] ? rowToEntry(rows[0]) : null;
}

export async function deleteExchangeAddressBookEntry(owner: Address, id: string): Promise<boolean> {
  const client = await clientWithSchema();
  const rows = await client`
    DELETE FROM exchange_address_book_entries
    WHERE id = ${id} AND owner_fingerprint = ${paymentParticipantFingerprint(owner)}
    RETURNING id
  `;
  return rows.length === 1;
}

async function clientWithSchema() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Private address-book storage is not configured");
  const client = neon(connectionString);
  if (!schemaPromise) {
    schemaPromise = createSchema(client).catch((cause) => {
      schemaPromise = undefined;
      throw cause;
    });
  }
  await schemaPromise;
  return client;
}

async function createSchema(client: NeonQueryFunction<false, false>) {
  await client`
    CREATE TABLE IF NOT EXISTS private_vault_challenges (
      id varchar(32) PRIMARY KEY,
      address varchar(42) NOT NULL,
      message_hash varchar(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    )
  `;
  await client`
    CREATE INDEX IF NOT EXISTS private_vault_challenges_expires_idx
    ON private_vault_challenges (expires_at)
  `;
  await client`
    CREATE TABLE IF NOT EXISTS exchange_address_book_entries (
      id varchar(40) PRIMARY KEY,
      owner_fingerprint varchar(64) NOT NULL,
      encrypted_payload text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await client`
    CREATE INDEX IF NOT EXISTS exchange_address_book_owner_idx
    ON exchange_address_book_entries (owner_fingerprint, updated_at DESC)
  `;
}

function rowToEntry(row: Record<string, unknown>): ExchangeAddressBookEntry {
  const entry = JSON.parse(decryptPaymentIdentity(String(row.encrypted_payload))) as ExchangeAddressBookEntry;
  return {
    ...entry,
    id: String(row.id),
    address: getAddress(entry.address),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
