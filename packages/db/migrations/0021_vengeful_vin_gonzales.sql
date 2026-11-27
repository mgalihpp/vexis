ALTER TABLE "agent_alerts" ADD COLUMN "price" double precision;--> statement-breakpoint
ALTER TABLE "agent_alerts" ADD COLUMN "price_unit" text;--> statement-breakpoint
ALTER TABLE "agent_alerts" ADD COLUMN "price_usd" double precision;--> statement-breakpoint
ALTER TABLE "agent_alerts" ADD COLUMN "active_bin_id" integer;