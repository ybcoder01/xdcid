import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { payLinks } from "./db/schema";
import { getDatabase, isDatabaseConfigured } from "./db/client";

export const SHORT_PAY_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SHORT_PAY_LINK_ID_PATTERN = /^rq_[A-Za-z0-9_-]{20}$/;

export type StoredPayLink = {
  id: string;
  name: string;
  encodedRequest: string;
  signature: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: "active" | "expired" | "revoked";
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
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          revokedAt: null,
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

  const status =
    record.revokedAt !== null
      ? "revoked"
      : record.expiresAt.getTime() <= Date.now()
        ? "expired"
        : "active";
  return {
    id: record.id,
    name: record.name,
    encodedRequest: record.encodedRequest,
    signature: record.signature,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
    status
  };
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
  const stored = Buffer.from(record.revocationTokenHash, "hex");
  const supplied = Buffer.from(suppliedHash, "hex");
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
      name varchar(255) NOT NULL,
      encoded_request text NOT NULL,
      signature text NOT NULL,
      revocation_token_hash varchar(64) NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz
    )
  `;
  await client`
    CREATE INDEX IF NOT EXISTS pay_links_name_idx ON pay_links (name)
  `;
  await client`
    CREATE INDEX IF NOT EXISTS pay_links_expires_at_idx ON pay_links (expires_at)
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
