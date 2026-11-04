CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_account_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"pool_address" text NOT NULL,
	"vol_1m" double precision NOT NULL,
	"baseline" double precision NOT NULL,
	"ratio" double precision NOT NULL,
	"delivered" boolean DEFAULT false NOT NULL,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"pool_address" text NOT NULL,
	"label" text,
	"last_alert_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_pools_agent_pool_unique" UNIQUE("agent_id","pool_address")
);
--> statement-breakpoint
ALTER TABLE "agent_pools" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"paused_reason" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_user_kind_unique" UNIQUE("user_id","kind"),
	CONSTRAINT "agents_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "agents_kind_check" CHECK (kind in ('volume-watch'))
);
--> statement-breakpoint
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invite_redemptions" (
	"invite_id" uuid NOT NULL,
	"used_by" text NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_redemptions_invite_id_used_by_pk" PRIMARY KEY("invite_id","used_by"),
	CONSTRAINT "invite_redemptions_used_by_unique" UNIQUE("used_by")
);
--> statement-breakpoint
ALTER TABLE "invite_redemptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text,
	"email" text,
	"note" text,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invites_uses_check" CHECK ("invites"."max_uses" >= 1 and "invites"."use_count" >= 0 and "invites"."use_count" <= "invites"."max_uses")
);
--> statement-breakpoint
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pool_minutes" (
	"pool_address" text NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"cumulative_volume" double precision NOT NULL,
	"volume" double precision,
	"tvl" double precision,
	CONSTRAINT "pool_minutes_pool_address_minute_pk" PRIMARY KEY("pool_address","minute")
);
--> statement-breakpoint
ALTER TABLE "pool_minutes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"user_id" text PRIMARY KEY NOT NULL,
	"chat_id" bigint,
	"username" text,
	"link_code" text,
	"link_code_expires_at" timestamp with time zone,
	"linked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_links_chat_id_unique" UNIQUE("chat_id"),
	CONSTRAINT "telegram_links_link_code_unique" UNIQUE("link_code"),
	CONSTRAINT "telegram_links_state_check" CHECK ("telegram_links"."chat_id" is not null or "telegram_links"."link_code" is not null)
);
--> statement-breakpoint
ALTER TABLE "telegram_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_currency_check" CHECK ("user_settings"."currency" in ('usd', 'sol'))
);
--> statement-breakpoint
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'member'))
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"address" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_user_address_unique" UNIQUE("user_id","address")
);
--> statement-breakpoint
ALTER TABLE "wallets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_alerts" ADD CONSTRAINT "agent_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_alerts" ADD CONSTRAINT "agent_alerts_agent_id_user_id_agents_id_user_id_fk" FOREIGN KEY ("agent_id","user_id") REFERENCES "public"."agents"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_pools" ADD CONSTRAINT "agent_pools_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_pools" ADD CONSTRAINT "agent_pools_agent_id_user_id_agents_id_user_id_fk" FOREIGN KEY ("agent_id","user_id") REFERENCES "public"."agents"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_alerts_user_at_idx" ON "agent_alerts" USING btree ("user_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_pools_user_id_idx" ON "agent_pools" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_pools_pool_address_idx" ON "agent_pools" USING btree ("pool_address");--> statement-breakpoint
CREATE INDEX "agents_user_id_idx" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agents_runnable_idx" ON "agents" USING btree ("kind") WHERE "agents"."enabled" and not "agents"."paused";--> statement-breakpoint
CREATE INDEX "invites_created_by_idx" ON "invites" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "wallets_user_id_idx" ON "wallets" USING btree ("user_id");