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
  await client`
    CREATE TABLE IF NOT EXISTS admin_auth_rate_limits (
      scope varchar(32) NOT NULL,
      identifier_hash varchar(64) NOT NULL,
      window_started_at timestamptz NOT NULL,
      hit_count integer NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (scope, identifier_hash)
    )
  `;
  await client`
    CREATE INDEX IF NOT EXISTS admin_auth_rate_limits_updated_at_idx
    ON admin_auth_rate_limits (updated_at)
  `;
  await client`
    CREATE TABLE IF NOT EXISTS admin_security_events (
      id varchar(32) PRIMARY KEY NOT NULL,
      event_type varchar(48) NOT NULL,
      outcome varchar(24) NOT NULL,
      address_fingerprint varchar(64),
      client_fingerprint varchar(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await client`
    CREATE INDEX IF NOT EXISTS admin_security_events_created_at_idx
    ON admin_security_events (created_at)
  `;
}
