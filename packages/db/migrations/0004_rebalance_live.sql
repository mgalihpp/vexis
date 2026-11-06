ALTER TABLE "agent_rebalances" ADD COLUMN "live" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_rebalances" ADD COLUMN "tx_error" text;