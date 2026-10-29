import { boolean, integer, pgTable, timestamp } from "drizzle-orm/pg-core";

export const featureSettings = pgTable("feature_settings", {
  homesEnabled: boolean("homes_enabled").notNull().default(true),
  id: integer("id").primaryKey().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
