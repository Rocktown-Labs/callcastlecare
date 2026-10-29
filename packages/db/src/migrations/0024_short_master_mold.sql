CREATE TABLE "feature_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"homes_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
