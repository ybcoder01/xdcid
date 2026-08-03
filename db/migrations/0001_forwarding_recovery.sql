CREATE TABLE IF NOT EXISTS "forwarding_recoveries" (
  "fee_transaction_hash" varchar(66) PRIMARY KEY NOT NULL,
  "payer" varchar(42) NOT NULL,
  "recipient_amount" bigint NOT NULL,
  "recipient" varchar(42) NOT NULL,
  "destination_chain_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "forwarding_recoveries_positive_amount"
    CHECK ("recipient_amount" > 0)
);

CREATE INDEX IF NOT EXISTS "forwarding_recoveries_payer_idx"
  ON "forwarding_recoveries" ("payer");
CREATE INDEX IF NOT EXISTS "forwarding_recoveries_expires_at_idx"
  ON "forwarding_recoveries" ("expires_at");
CREATE INDEX IF NOT EXISTS "forwarding_recoveries_destination_idx"
  ON "forwarding_recoveries" ("destination_chain_id");

CREATE TABLE IF NOT EXISTS "forwarding_recovery_burns" (
  "fee_transaction_hash" varchar(66) PRIMARY KEY NOT NULL
    REFERENCES "forwarding_recoveries" ("fee_transaction_hash") ON DELETE CASCADE,
  "burn_transaction_hash" varchar(66) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "forwarding_recovery_burn_hash_uidx"
  ON "forwarding_recovery_burns" ("burn_transaction_hash");
