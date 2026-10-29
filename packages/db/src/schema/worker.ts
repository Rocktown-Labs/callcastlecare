import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { workerStatusEnum } from "./enums";
import { geographyPoint } from "./geo";

export const workers = pgTable(
  "workers",
  {
    applicationFormData: jsonb("application_form_data"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currentLatitude: numeric("current_latitude", {
      mode: "number",
      precision: 10,
      scale: 8,
    }),
    currentLongitude: numeric("current_longitude", {
      mode: "number",
      precision: 11,
      scale: 8,
    }),
    email: text("email").notNull(),
    equipmentJson: jsonb("equipment_json"),
    firstName: text("first_name").notNull(),
    id: serial("id").primaryKey(),
    isActive: boolean("is_active").notNull().default(false),
    lastLocationUpdatedAt: timestamp("last_location_updated_at", {
      withTimezone: true,
    }),
    lastName: text("last_name").notNull(),
    location: geographyPoint("location"),
    nextOfferEligibleAt: timestamp("next_offer_eligible_at", {
      withTimezone: true,
    }),
    onboardingStatus: workerStatusEnum("onboarding_status")
      .notNull()
      .default("pending"),
    phone: text("phone").notNull(),
    providerVerificationPaidAt: timestamp("provider_verification_paid_at", {
      withTimezone: true,
    }),
    providerVerificationSessionId: text("provider_verification_session_id"),
    serviceRadiusMiles: integer("service_radius_miles").notNull().default(10),
    servicesOffered: text("services_offered").array().notNull().default([]),
    stripeAccountApiVersion: text("stripe_account_api_version"),
    stripeAccountId: text("stripe_account_id"),
    stripeAccountMode: text("stripe_account_mode"),
    stripeAccountStatus: text("stripe_account_status")
      .notNull()
      .default("pending"),
    stripeChargesEnabled: boolean("stripe_charges_enabled")
      .notNull()
      .default(false),
    stripePayoutsEnabled: boolean("stripe_payouts_enabled")
      .notNull()
      .default(false),
    stripeRequirementsJson: jsonb("stripe_requirements_json"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_workers_active")
      .on(table.isActive)
      .where(sql`${table.isActive} = true`),
    uniqueIndex("idx_workers_email").on(sql`lower(${table.email})`),
    index("idx_workers_location").on(
      table.currentLatitude,
      table.currentLongitude
    ),
    index("idx_workers_next_offer_eligible_active").on(
      table.nextOfferEligibleAt,
      table.isActive
    ),
    uniqueIndex("idx_workers_user_id").on(table.userId),
  ]
);
