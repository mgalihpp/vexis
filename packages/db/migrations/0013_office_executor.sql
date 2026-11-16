ALTER TABLE "office_proposals" DROP CONSTRAINT "office_proposals_proposed_by_check";--> statement-breakpoint
ALTER TABLE "office_config" ADD COLUMN "live" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "office_config" ADD COLUMN "day_capital_sol" double precision;--> statement-breakpoint
ALTER TABLE "office_config" ADD COLUMN "day_capital_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "office_proposals" ADD CONSTRAINT "office_proposals_proposed_by_check" CHECK (proposed_by in ('strategist', 'monitor', 'owner'));