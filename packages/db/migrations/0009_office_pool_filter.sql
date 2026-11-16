ALTER TABLE "office_config" ADD COLUMN "pool_preset" text DEFAULT 'blue-chip' NOT NULL;--> statement-breakpoint
ALTER TABLE "office_config" ADD COLUMN "pool_filter" jsonb;--> statement-breakpoint
ALTER TABLE "office_config" ADD CONSTRAINT "office_config_pool_preset_check" CHECK (pool_preset in ('blue-chip', 'mid-cap', 'degen', 'custom'));