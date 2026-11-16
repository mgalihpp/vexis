ALTER TABLE "telegram_links" DROP CONSTRAINT "telegram_links_kind_check";--> statement-breakpoint
ALTER TABLE "office_proposals" ADD COLUMN "telegram_message_id" bigint;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD COLUMN "update_offset" bigint;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_kind_check" CHECK (kind in ('volume-watch', 'auto-rebalance', 'office'));