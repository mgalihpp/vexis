ALTER TABLE "telegram_links" DROP CONSTRAINT "telegram_links_chat_id_unique";--> statement-breakpoint
ALTER TABLE "telegram_links" DROP CONSTRAINT "telegram_links_pkey";--> statement-breakpoint
ALTER TABLE "telegram_links" ADD COLUMN "kind" text NOT NULL DEFAULT 'volume-watch';--> statement-breakpoint
ALTER TABLE "telegram_links" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
INSERT INTO "telegram_links" ("user_id", "kind", "bot_token", "bot_username", "chat_id", "username", "linked_at", "created_at", "updated_at")
  SELECT "user_id", 'auto-rebalance', "bot_token", "bot_username", "chat_id", "username", "linked_at", "created_at", "updated_at"
  FROM "telegram_links" t
  WHERE EXISTS (SELECT 1 FROM "agents" a WHERE a."user_id" = t."user_id" AND a."kind" = 'auto-rebalance');--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_kind_pk" PRIMARY KEY("user_id","kind");--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_kind_chat_unique" UNIQUE("kind","chat_id");--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_kind_check" CHECK (kind in ('volume-watch', 'auto-rebalance'));
