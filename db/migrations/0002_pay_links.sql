CREATE TABLE IF NOT EXISTS "pay_links" (
  "id" varchar(32) PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "encoded_request" text NOT NULL,
  "signature" text NOT NULL,
  "revocation_token_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "pay_links_name_idx"
  ON "pay_links" ("name");
CREATE INDEX IF NOT EXISTS "pay_links_expires_at_idx"
  ON "pay_links" ("expires_at");
