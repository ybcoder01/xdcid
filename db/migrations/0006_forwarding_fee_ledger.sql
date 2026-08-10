ALTER TABLE "forwarding_recoveries"
  ADD COLUMN IF NOT EXISTS "convenience_fee_amount" bigint;

UPDATE "forwarding_recoveries"
SET "convenience_fee_amount" = LEAST(
  5000000,
  GREATEST(100000, (("recipient_amount" * 10) + 9999) / 10000)
)
WHERE "convenience_fee_amount" IS NULL;

ALTER TABLE "forwarding_recoveries"
  ALTER COLUMN "convenience_fee_amount" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "forwarding_fee_events" (
  "fee_transaction_hash" varchar(66) PRIMARY KEY NOT NULL,
  "source_chain_id" integer NOT NULL,
  "destination_chain_id" integer NOT NULL,
  "recipient_amount" bigint NOT NULL,
  "convenience_fee_amount" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "burn_recorded_at" timestamp with time zone
);

INSERT INTO "forwarding_fee_events" (
  "fee_transaction_hash",
  "source_chain_id",
  "destination_chain_id",
  "recipient_amount",
  "convenience_fee_amount",
  "created_at",
  "burn_recorded_at"
)
SELECT
  recovery."fee_transaction_hash",
  recovery."source_chain_id",
  recovery."destination_chain_id",
  recovery."recipient_amount",
  recovery."convenience_fee_amount",
  recovery."created_at",
  burn."created_at"
FROM "forwarding_recoveries" recovery
LEFT JOIN "forwarding_recovery_burns" burn
  ON burn."fee_transaction_hash" = recovery."fee_transaction_hash"
ON CONFLICT ("fee_transaction_hash") DO NOTHING;

CREATE INDEX IF NOT EXISTS "forwarding_fee_events_created_at_idx"
  ON "forwarding_fee_events" ("created_at");

CREATE INDEX IF NOT EXISTS "forwarding_fee_events_route_idx"
  ON "forwarding_fee_events" ("source_chain_id", "destination_chain_id");
