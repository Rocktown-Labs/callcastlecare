ALTER TABLE "payouts" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "payouts" SET "claimed_at" = "created_at" WHERE "status" = 'processing' AND "claimed_at" IS NULL;