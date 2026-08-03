import { relations } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar
} from "drizzle-orm/pg-core";

export const forwardingRecoveries = pgTable(
  "forwarding_recoveries",
  {
    feeTransactionHash: varchar("fee_transaction_hash", { length: 66 }).primaryKey(),
    payer: varchar("payer", { length: 42 }).notNull(),
    recipientAmount: bigint("recipient_amount", { mode: "bigint" }).notNull(),
    recipient: varchar("recipient", { length: 42 }).notNull(),
    destinationChainId: integer("destination_chain_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull()
  },
  (table) => [
    index("forwarding_recoveries_payer_idx").on(table.payer),
    index("forwarding_recoveries_expires_at_idx").on(table.expiresAt),
    index("forwarding_recoveries_destination_idx").on(table.destinationChainId)
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
