import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { keccak256, type Hex } from "viem";
import { neon } from "@neondatabase/serverless";
import { payLinkCancellations, payLinks } from "./db/schema";
import { getDatabase, isDatabaseConfigured } from "./db/client";
import { paymentRequestId } from "./paymentCancellation";
import {
  validatePayLinkSettlementClaim,
  type PayLinkSettlementClaim
} from "./payLinkSettlement";
import { decodePaymentRequest } from "./paymentRequests";

export const SHORT_PAY_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SHORT_PAY_LINK_ID_PATTERN = /^rq_[A-Za-z0-9_-]{20}$/;

export type StoredPayLink = {
  id: string;
  name: string;
  encodedRequest: string;
  signature: string;
  requestId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  paidAt: string | null;
  paymentId: string | null;
  status: "active" | "expired" | "revoked" | "paid";
};

let schemaPromise: Promise<void> | undefined;

export function isPayLinkStoreConfigured(): boolean {
  return isDatabaseConfigured();
}

export function isShortPayLinkId(value: string): boolean {
  return SHORT_PAY_LINK_ID_PATTERN.test(value);
}

export async function createStoredPayLink(input: {
  name: string;
  encodedRequest: string;
  signature: string;
  requestId: Hex;
  requestExpires: number;
}): Promise<{ record: StoredPayLink; revocationToken: string }> {
  await ensurePayLinkSchema();
  await removeExpiredPayLinks();

  const now = new Date();
  const retentionExpiry = new Date(
    now.getTime() + SHORT_PAY_LINK_TTL_SECONDS * 1_000
  );
  const signedExpiry = input.requestExpires
    ? new Date(input.requestExpires * 1_000)
    : retentionExpiry;
  const expiresAt =
    signedExpiry.getTime() < retentionExpiry.getTime()
      ? signedExpiry
      : retentionExpiry;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = "rq_" + randomBytes(15).toString("base64url");
    const revocationToken = randomBytes(32).toString("base64url");
    const created = await getDatabase()
      .insert(payLinks)
      .values({
        id,
        name: input.name,
        encodedRequest: input.encodedRequest,
        signature: input.signature,
        requestId: input.requestId.toLowerCase(),
        revocationTokenHash: hashToken(revocationToken),
        createdAt: now,
        expiresAt
      })
      .onConflictDoNothing()
      .returning({ id: payLinks.id });

    if (created.length === 1) {
      return {
        record: {
          id,
          name: input.name,
          encodedRequest: input.encodedRequest,
          signature: input.signature,
          requestId: input.requestId.toLowerCase(),
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          revokedAt: null,
          paidAt: null,
          paymentId: null,
          status: "active"
        },
        revocationToken
      };
    }
  }

  throw new Error("Unable to allocate a unique Pay Link ID");
}

export async function getStoredPayLink(id: string): Promise<StoredPayLink | null> {
  if (!isShortPayLinkId(id)) return null;
  await ensurePayLinkSchema();
  const rows = await getDatabase()
    .select()
    .from(payLinks)
    .where(eq(payLinks.id, id))
    .limit(1);
  const record = rows[0];
  if (!record) return null;

  const requestId = record.requestId || keccak256(record.encodedRequest as Hex).toLowerCase();
  if (!record.requestId) {
    await getDatabase()
      .update(payLinks)
      .set({ requestId })
      .where(eq(payLinks.id, record.id));
  }

  const status =
    record.paidAt !== null
      ? "paid"
      : record.revokedAt !== null
      ? "revoked"
      : record.expiresAt.getTime() <= Date.now()
        ? "expired"
        : "active";
  return {
    id: record.id,
    name: record.name,
    encodedRequest: record.encodedRequest,
    signature: record.signature,
    requestId,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
    paidAt: record.paidAt?.toISOString() ?? null,
    paymentId: record.paymentId,
    status
  };
}

export type StoredPayLinkSettlement = PayLinkSettlementClaim & {
  payLinkId?: string;
  paymentId: string;
  sourceTransactionHash: Hex;
  destinationTransactionHash?: Hex;
  paidAt: Date;
};

export async function settleStoredPayLink(
  input: StoredPayLinkSettlement
): Promise<"paid" | "already-paid"> {
  await ensurePayLinkSchema();
  const rows = input.payLinkId && isShortPayLinkId(input.payLinkId)
    ? await getDatabase().select().from(payLinks)
        .where(eq(payLinks.id, input.payLinkId)).limit(1)
    : await getDatabase().select().from(payLinks)
        .where(eq(payLinks.requestId, input.requestId.toLowerCase())).limit(1);
  const record = rows[0];
  if (!record) throw new Error("Pay Link request was not found");

  const storedRequest = decodePaymentRequest(record.encodedRequest);
  const storedRequestId = paymentRequestId(storedRequest).toLowerCase();
  const validationError = validatePayLinkSettlementClaim(storedRequest, input);
  if (validationError) throw new Error(validationError);
  if (record.revokedAt) throw new Error("This Pay Link was cancelled before payment completed");
  if (record.expiresAt.getTime() <= input.paidAt.getTime()) {
    throw new Error("This Pay Link expired before payment completed");
  }
  if (record.paidAt) {
    if (record.sourceTransactionHash?.toLowerCase() === input.sourceTransactionHash.toLowerCase()) {
      return "already-paid";
    }
    throw new Error("This Pay Link has already been paid");
  }

  const updated = await getDatabase()
    .update(payLinks)
    .set({
      requestId: storedRequestId,
      paidAt: input.paidAt,
      paymentId: input.paymentId,
      sourceTransactionHash: input.sourceTransactionHash.toLowerCase(),
      destinationTransactionHash: input.destinationTransactionHash?.toLowerCase() ?? null
    })
    .where(and(
      or(
        eq(payLinks.requestId, storedRequestId),
        eq(payLinks.encodedRequest, record.encodedRequest)
      ),
      isNull(payLinks.paidAt),
      isNull(payLinks.revokedAt)
    ))
    .returning({ sourceTransactionHash: payLinks.sourceTransactionHash });
  if (updated.length > 0) return "paid";

  const raced = await getDatabase().select({
    sourceTransactionHash: payLinks.sourceTransactionHash
  }).from(payLinks).where(eq(payLinks.id, record.id)).limit(1);
  if (raced[0]?.sourceTransactionHash?.toLowerCase() === input.sourceTransactionHash.toLowerCase()) {
    return "already-paid";
  }
  throw new Error("This Pay Link has already been paid or cancelled");
}

export async function isPaymentRequestPaid(requestId: string): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(requestId)) return false;
  await ensurePayLinkSchema();
  const rows = await getDatabase()
    .select({ paidAt: payLinks.paidAt })
    .from(payLinks)
    .where(and(
      eq(payLinks.requestId, requestId.toLowerCase()),
      isNotNull(payLinks.paidAt)
    ))
    .limit(1);
  return Boolean(rows[0]?.paidAt);
}

export async function isPaymentRequestCancelled(requestId: string): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(requestId)) return false;
  await ensurePayLinkSchema();
  const rows = await getDatabase()
    .select({ requestId: payLinkCancellations.requestId })
    .from(payLinkCancellations)
    .where(eq(payLinkCancellations.requestId, requestId.toLowerCase()))
    .limit(1);
  return rows.length === 1;
}

export async function cancelPaymentRequest(input: {
  requestId: string;
  name: string;
  nonce: string;
  encodedRequest: string;
  cancellationSignature: string;
  cancelledAt: Date;
}): Promise<"cancelled" | "already-cancelled"> {
  await ensurePayLinkSchema();
  const created = await getDatabase()
    .insert(payLinkCancellations)
    .values({
      requestId: input.requestId.toLowerCase(),
      name: input.name,
      nonce: input.nonce,
      cancelledAt: input.cancelledAt,
      cancellationSignature: input.cancellationSignature,
    })
    .onConflictDoNothing()
    .returning({ requestId: payLinkCancellations.requestId });

  await getDatabase()
    .update(payLinks)
    .set({ revokedAt: input.cancelledAt })
    .where(eq(payLinks.encodedRequest, input.encodedRequest));

  return created.length === 1 ? "cancelled" : "already-cancelled";
}

export async function revokeStoredPayLink(
  id: string,
  revocationToken: string
): Promise<"revoked" | "already-revoked" | "not-found" | "unauthorized"> {
  if (!isShortPayLinkId(id) || !revocationToken) return "unauthorized";
  await ensurePayLinkSchema();
  const rows = await getDatabase()
    .select({
      revocationTokenHash: payLinks.revocationTokenHash,
      revokedAt: payLinks.revokedAt
    })
    .from(payLinks)
    .where(eq(payLinks.id, id))
    .limit(1);
  const record = rows[0];
  if (!record) return "not-found";

  const suppliedHash = hashToken(revocationToken);
  const stored = Uint8Array.from(
    Buffer.from(record.revocationTokenHash, "hex")
  );
  const supplied = Uint8Array.from(Buffer.from(suppliedHash, "hex"));
  if (
    stored.length !== supplied.length ||
    !timingSafeEqual(stored, supplied)
  ) {
    return "unauthorized";
  }
  if (record.revokedAt) return "already-revoked";

  await getDatabase()
    .update(payLinks)
    .set({ revokedAt: new Date() })
    .where(eq(payLinks.id, id));
  return "revoked";
}

async function ensurePayLinkSchema(): Promise<void> {
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
  if (!connectionString) throw new Error("Pay Link storage is not configured");
  const client = neon(connectionString);
  await client`
    CREATE TABLE IF NOT EXISTS pay_links (
      id varchar(32) PRIMARY KEY NOT NULL,
      request_id varchar(66),
      name varchar(255) NOT NULL,
      encoded_request text NOT NULL,
      signature text NOT NULL,
      revocation_token_hash varchar(64) NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      paid_at timestamptz,
      payment_id varchar(64),
      source_transaction_hash varchar(66),
      destination_transaction_hash varchar(66)
    )
  `;
  await client`ALTER TABLE pay_links ADD COLUMN IF NOT EXISTS request_id varchar(66)`;
  await client`ALTER TABLE pay_links ADD COLUMN IF NOT EXISTS paid_at timestamptz`;
  await client`ALTER TABLE pay_links ADD COLUMN IF NOT EXISTS payment_id varchar(64)`;
  await client`ALTER TABLE pay_links ADD COLUMN IF NOT EXISTS source_transaction_hash varchar(66)`;
  await client`ALTER TABLE pay_links ADD COLUMN IF NOT EXISTS destination_transaction_hash varchar(66)`;
  await client`
    CREATE INDEX IF NOT EXISTS pay_links_request_id_idx ON pay_links (request_id)
  `;
  await client`
    CREATE INDEX IF NOT EXISTS pay_links_name_idx ON pay_links (name)
  `;
  await client`
    CREATE INDEX IF NOT EXISTS pay_links_expires_at_idx ON pay_links (expires_at)
  `;
  await client`
    CREATE TABLE IF NOT EXISTS pay_link_cancellations (
      request_id varchar(66) PRIMARY KEY NOT NULL,
      name varchar(255) NOT NULL,
      nonce varchar(66) NOT NULL,
      cancelled_at timestamptz NOT NULL,
      cancellation_signature text NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL
    )
  `;
  await client`
    CREATE INDEX IF NOT EXISTS pay_link_cancellations_name_idx
      ON pay_link_cancellations (name)
  `;
  await client`
    CREATE INDEX IF NOT EXISTS pay_link_cancellations_nonce_idx
      ON pay_link_cancellations (nonce)
  `;
}

async function removeExpiredPayLinks(): Promise<void> {
  await getDatabase()
    .delete(payLinks)
    .where(lt(payLinks.expiresAt, new Date()));
}

function hashToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
