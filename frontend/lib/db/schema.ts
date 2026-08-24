import { relations } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from "drizzle-orm/pg-core";

export const forwardingRecoveries = pgTable(
  "forwarding_recoveries",
  {
    feeTransactionHash: varchar("fee_transaction_hash", { length: 66 }).primaryKey(),
    sourceChainId: integer("source_chain_id").notNull().default(50),
    payer: varchar("payer", { length: 42 }).notNull(),
    recipientAmount: bigint("recipient_amount", { mode: "bigint" }).notNull(),
    convenienceFeeAmount: bigint("convenience_fee_amount", { mode: "bigint" }).notNull(),
    recipient: varchar("recipient", { length: 42 }).notNull(),
    destinationChainId: integer("destination_chain_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull()
  },
  (table) => [
    index("forwarding_recoveries_payer_idx").on(table.payer),
    index("forwarding_recoveries_source_idx").on(table.sourceChainId),
    index("forwarding_recoveries_expires_at_idx").on(table.expiresAt),
    index("forwarding_recoveries_destination_idx").on(table.destinationChainId)
  ]
);

export const forwardingFeeEvents = pgTable(
  "forwarding_fee_events",
  {
    feeTransactionHash: varchar("fee_transaction_hash", { length: 66 }).primaryKey(),
    sourceChainId: integer("source_chain_id").notNull(),
    destinationChainId: integer("destination_chain_id").notNull(),
    recipientAmount: bigint("recipient_amount", { mode: "bigint" }).notNull(),
    convenienceFeeAmount: bigint("convenience_fee_amount", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    burnRecordedAt: timestamp("burn_recorded_at", { withTimezone: true, mode: "date" })
  },
  (table) => [
    index("forwarding_fee_events_created_at_idx").on(table.createdAt),
    index("forwarding_fee_events_route_idx").on(
      table.sourceChainId,
      table.destinationChainId
    )
  ]
);

export const forwardingRecoveryBurns = pgTable(
  "forwarding_recovery_burns",
  {
    feeTransactionHash: varchar("fee_transaction_hash", { length: 66 })
      .primaryKey()
      .references(() => forwardingRecoveries.feeTransactionHash, {
        onDelete: "cascade"
      }),
    burnTransactionHash: varchar("burn_transaction_hash", { length: 66 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
  },
  (table) => [
    uniqueIndex("forwarding_recovery_burn_hash_uidx").on(
      table.burnTransactionHash
    )
  ]
);

export const forwardingRecoveriesRelations = relations(
  forwardingRecoveries,
  ({ one }) => ({
    burn: one(forwardingRecoveryBurns, {
      fields: [forwardingRecoveries.feeTransactionHash],
      references: [forwardingRecoveryBurns.feeTransactionHash]
    })
  })
);

export const forwardingRecoveryBurnsRelations = relations(
  forwardingRecoveryBurns,
  ({ one }) => ({
    recovery: one(forwardingRecoveries, {
      fields: [forwardingRecoveryBurns.feeTransactionHash],
      references: [forwardingRecoveries.feeTransactionHash]
    })
  })
);

export const payLinks = pgTable(
  "pay_links",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    encodedRequest: text("encoded_request").notNull(),
    signature: text("signature").notNull(),
    revocationTokenHash: varchar("revocation_token_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" })
  },
  (table) => [
    index("pay_links_name_idx").on(table.name),
    index("pay_links_expires_at_idx").on(table.expiresAt)
  ]
);

export const payLinkCancellations = pgTable(
  "pay_link_cancellations",
  {
    requestId: varchar("request_id", { length: 66 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    nonce: varchar("nonce", { length: 66 }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }).notNull(),
    cancellationSignature: text("cancellation_signature").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
  },
  (table) => [
    index("pay_link_cancellations_name_idx").on(table.name),
    index("pay_link_cancellations_nonce_idx").on(table.nonce)
  ]
);

export const adminAuthChallenges = pgTable(
  "admin_auth_challenges",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    address: varchar("address", { length: 42 }).notNull(),
    messageHash: varchar("message_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" })
  },
  (table) => [
    index("admin_auth_challenges_address_idx").on(table.address),
    index("admin_auth_challenges_expires_at_idx").on(table.expiresAt)
  ]
);


export const paymentRecords = pgTable(
  "payment_records",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    requestId: varchar("request_id", { length: 66 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    creator: varchar("creator", { length: 42 }).notNull(),
    payer: varchar("payer", { length: 42 }).notNull(),
    amountAtomic: varchar("amount_atomic", { length: 80 }).notNull(),
    token: varchar("token", { length: 32 }).notNull(),
    tokenDecimals: integer("token_decimals").notNull(),
    sourceChainId: integer("source_chain_id").notNull(),
    destinationChainId: integer("destination_chain_id").notNull(),
    sourceTransactionHash: varchar("source_transaction_hash", { length: 66 }).notNull(),
    destinationTransactionHash: varchar("destination_transaction_hash", { length: 66 }),
    privateCiphertext: text("private_ciphertext"),
    privateIv: varchar("private_iv", { length: 64 }),
    privateTag: varchar("private_tag", { length: 64 }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("payment_records_source_tx_uidx").on(table.sourceTransactionHash),
    index("payment_records_creator_idx").on(table.creator),
    index("payment_records_payer_idx").on(table.payer)
  ]
);

export const paymentAccessChallenges = pgTable(
  "payment_access_challenges",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    paymentRecordId: varchar("payment_record_id", { length: 40 })
      .references(() => paymentRecords.id, { onDelete: "cascade" }),
    address: varchar("address", { length: 42 }).notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" })
  },
  (table) => [
    index("payment_access_challenges_record_idx").on(table.paymentRecordId),
    index("payment_access_challenges_expires_idx").on(table.expiresAt)
  ]
);
