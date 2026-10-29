import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { earningTypeEnum, payoutStatusEnum } from "./enums";
import { orders } from "./order";
import { workers } from "./worker";

export const earningsLedger = pgTable(
  "earnings_ledger",
  {
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    earningType: earningTypeEnum("earning_type").notNull(),
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    releaseAt: timestamp("release_at", { withTimezone: true }),
    workerId: integer("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_earnings_ledger_worker_release").on(
      table.workerId,
      table.releaseAt
    ),
    index("idx_earnings_ledger_order_id").on(table.orderId),
  ]
);

export const tipHolds = pgTable(
  "tip_holds",
  {
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    scheduledReleaseAt: timestamp("scheduled_release_at", {
      withTimezone: true,
    }).notNull(),
    workerId: integer("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_tip_holds_scheduled_release").on(table.scheduledReleaseAt),
    uniqueIndex("idx_tip_holds_order_id").on(table.orderId),
  ]
);

export const payouts = pgTable(
  "payouts",
  {
    amountCents: integer("amount_cents").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    failureReason: text("failure_reason"),
    id: serial("id").primaryKey(),
    orderId: integer("order_id").references(() => orders.id, {
      onDelete: "cascade",
    }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    providerPayoutId: text("provider_payout_id"),
    status: payoutStatusEnum("status").notNull().default("pending"),
    workerId: integer("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("idx_payouts_order_id").on(table.orderId),
    index("idx_payouts_worker_status").on(table.workerId, table.status),
  ]
);
