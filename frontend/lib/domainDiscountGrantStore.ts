import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getAddress, type Address, type Hex } from "viem";
import {
  deserializeDomainDiscountAuthorization,
  serializeDomainDiscountAuthorization,
  type DomainDiscountAuthorization,
} from "./domainDiscounts";
import {
  paymentNameFingerprint,
  paymentParticipantFingerprint,
} from "./paymentParticipantFingerprint";
import {
  decryptPaymentIdentity,
  encryptPaymentIdentity,
} from "./paymentRecordCrypto";

export type StoredDomainDiscountGrant = {
  id: string;
  authorizationHash: Hex;
  chainId: number;
  registrar: Address;
  authorizationContract: Address;
  name: string;
  authorization: DomainDiscountAuthorization;
  signature: Hex;
  createdAt: string;
};

export async function saveDomainDiscountGrant(input: Omit<StoredDomainDiscountGrant, "id" | "createdAt"> & {
  createdBy: Address;
}): Promise<StoredDomainDiscountGrant> {
  const client = await ensureSchema();
  const id = grantId(input.chainId, input.authorizationContract, input.authorizationHash);
  const payload = encryptPaymentIdentity(JSON.stringify({
    name: input.name,
    authorization: serializeDomainDiscountAuthorization(input.authorization),
  }));
  const rows = await client`
    INSERT INTO domain_discount_grants (
      id, authorization_hash, chain_id, registrar_address,
      authorization_contract, beneficiary_fingerprint, name_fingerprint,
      product, term_years, discount_bps, max_uses, valid_after, deadline,
      encrypted_payload, signature, created_by_fingerprint
    ) VALUES (
      ${id}, ${input.authorizationHash.toLowerCase()}, ${input.chainId},
      ${input.registrar.toLowerCase()}, ${input.authorizationContract.toLowerCase()},
      ${paymentParticipantFingerprint(input.authorization.beneficiary)},
      ${paymentNameFingerprint(input.name)}, ${input.authorization.product},
      ${Number(input.authorization.termYears)}, ${input.authorization.discountBps},
      ${input.authorization.maxUses},
      ${new Date(Number(input.authorization.validAfter) * 1_000).toISOString()},
      ${new Date(Number(input.authorization.deadline) * 1_000).toISOString()},
      ${payload}, ${input.signature},
      ${paymentParticipantFingerprint(input.createdBy)}
    )
    ON CONFLICT (id) DO UPDATE SET
      encrypted_payload = excluded.encrypted_payload,
      signature = excluded.signature
    RETURNING *
  `;
  return rowToGrant(rows[0]);
}

export async function findDomainDiscountGrants(input: {
  chainId: number;
  registrar: Address;
  authorizationContract: Address;
  beneficiary: Address;
  name: string;
  product: 0 | 1;
  termYears: number;
  now?: Date;
}): Promise<StoredDomainDiscountGrant[]> {
  const client = await ensureSchema();
  const now = input.now || new Date();
  const rows = await client`
    SELECT * FROM domain_discount_grants
    WHERE chain_id = ${input.chainId}
      AND registrar_address = ${input.registrar.toLowerCase()}
      AND authorization_contract = ${input.authorizationContract.toLowerCase()}
      AND beneficiary_fingerprint = ${paymentParticipantFingerprint(input.beneficiary)}
      AND name_fingerprint = ${paymentNameFingerprint(input.name)}
      AND product = ${input.product}
      AND term_years = ${input.termYears}
      AND valid_after <= ${now.toISOString()}
      AND deadline >= ${now.toISOString()}
    ORDER BY discount_bps DESC, created_at DESC
    LIMIT 10
  `;
  return rows.map(rowToGrant);
}

export async function listDomainDiscountGrants(input: {
  chainId: number;
  authorizationContract: Address;
  limit?: number;
}): Promise<StoredDomainDiscountGrant[]> {
  const client = await ensureSchema();
  const rows = await client`
    SELECT * FROM domain_discount_grants
    WHERE chain_id = ${input.chainId}
      AND authorization_contract = ${input.authorizationContract.toLowerCase()}
    ORDER BY created_at DESC
    LIMIT ${Math.min(Math.max(input.limit || 25, 1), 100)}
  `;
  return rows.map(rowToGrant);
}

async function ensureSchema() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Domain discount storage is not configured");
  const client = neon(connectionString);
  await client`
    CREATE TABLE IF NOT EXISTS domain_discount_grants (
      id varchar(64) PRIMARY KEY,
      authorization_hash varchar(66) NOT NULL,
      chain_id integer NOT NULL,
      registrar_address varchar(42) NOT NULL,
      authorization_contract varchar(42) NOT NULL,
      beneficiary_fingerprint varchar(64) NOT NULL,
      name_fingerprint varchar(64) NOT NULL,
      product integer NOT NULL,
      term_years integer NOT NULL,
      discount_bps integer NOT NULL,
      max_uses integer NOT NULL,
      valid_after timestamptz NOT NULL,
      deadline timestamptz NOT NULL,
      encrypted_payload text NOT NULL,
      signature text NOT NULL,
      created_by_fingerprint varchar(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await client`
    CREATE INDEX IF NOT EXISTS domain_discount_grants_lookup_idx
    ON domain_discount_grants (
      chain_id, registrar_address, beneficiary_fingerprint,
      name_fingerprint, product, term_years, deadline
    )
  `;
  return client;
}

function rowToGrant(row: Record<string, unknown>): StoredDomainDiscountGrant {
  const payload = JSON.parse(
    decryptPaymentIdentity(String(row.encrypted_payload)),
  ) as { name: string; authorization: unknown };
  return {
    id: String(row.id),
    authorizationHash: String(row.authorization_hash) as Hex,
    chainId: Number(row.chain_id),
    registrar: getAddress(String(row.registrar_address)),
    authorizationContract: getAddress(String(row.authorization_contract)),
    name: payload.name,
    authorization: deserializeDomainDiscountAuthorization(payload.authorization),
    signature: String(row.signature) as Hex,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function grantId(chainId: number, contract: Address, authorizationHash: Hex): string {
  return createHash("sha256")
    .update(`${chainId}:${contract.toLowerCase()}:${authorizationHash.toLowerCase()}`)
    .digest("hex");
}
