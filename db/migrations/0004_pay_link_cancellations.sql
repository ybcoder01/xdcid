CREATE TABLE IF NOT EXISTS "pay_link_cancellations" (
  "request_id" varchar(66) PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "nonce" varchar(66) NOT NULL,
  "cancelled_at" timestamp with time zone NOT NULL,
  "cancellation_signature" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pay_link_cancellations_name_idx"
  ON "pay_link_cancellations" ("name");
CREATE INDEX IF NOT EXISTS "pay_link_cancellations_nonce_idx"
  ON "pay_link_cancellations" ("nonce");
