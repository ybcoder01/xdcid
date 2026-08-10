CREATE TABLE IF NOT EXISTS "admin_auth_challenges" (
  "id" varchar(32) PRIMARY KEY NOT NULL,
  "address" varchar(42) NOT NULL,
  "message_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "admin_auth_challenges_address_idx"
  ON "admin_auth_challenges" ("address");

CREATE INDEX IF NOT EXISTS "admin_auth_challenges_expires_at_idx"
  ON "admin_auth_challenges" ("expires_at");
