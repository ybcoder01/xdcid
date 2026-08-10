import { neon } from "@neondatabase/serverless";
import { isDatabaseConfigured } from "./db/client";

let schemaPromise: Promise<void> | undefined;

export function isAdminAuthStoreConfigured(): boolean {
  return isDatabaseConfigured();
}

export async function ensureAdminAuthSchema(): Promise<void> {
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
    throw new Error("Admin authentication storage is not configured");
  }
  const client = neon(connectionString);
  await client`
    CREATE TABLE IF NOT EXISTS admin_auth_challenges (
      id varchar(32) PRIMARY KEY NOT NULL,
      address varchar(42) NOT NULL,
      message_hash varchar(64) NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    )
  `;
  await client`
    CREATE INDEX IF NOT EXISTS admin_auth_challenges_address_idx
    ON admin_auth_challenges (address)
  `;
  await client`
    CREATE INDEX IF NOT EXISTS admin_auth_challenges_expires_at_idx
    ON admin_auth_challenges (expires_at)
  `;
}
