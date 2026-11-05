-- Links made through the old shared bot have no token and cannot send any more; users link their own bot instead.
DELETE FROM "telegram_links" WHERE "bot_token" IS NULL;--> statement-breakpoint
ALTER TABLE "telegram_links" DROP CONSTRAINT "telegram_links_link_code_unique";--> statement-breakpoint
ALTER TABLE "telegram_links" DROP CONSTRAINT "telegram_links_state_check";--> statement-breakpoint
ALTER TABLE "telegram_links" ALTER COLUMN "bot_token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_links" ALTER COLUMN "bot_username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_links" DROP COLUMN "link_code";--> statement-breakpoint
ALTER TABLE "telegram_links" DROP COLUMN "link_code_expires_at";