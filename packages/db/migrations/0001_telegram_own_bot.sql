ALTER TABLE "telegram_links" DROP CONSTRAINT "telegram_links_state_check";--> statement-breakpoint
ALTER TABLE "telegram_links" ADD COLUMN "bot_token" text;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD COLUMN "bot_username" text;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_state_check" CHECK ("telegram_links"."chat_id" is not null or "telegram_links"."link_code" is not null or "telegram_links"."bot_token" is not null);