CREATE TABLE "agent_rebalances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"pool_address" text NOT NULL,
	"position_address" text NOT NULL,
	"active_bin" integer NOT NULL,
	"lower_bin" integer NOT NULL,
	"upper_bin" integer NOT NULL,
	"new_lower_bin" integer NOT NULL,
	"new_upper_bin" integer NOT NULL,
	"signature" text,
	"delivered" boolean DEFAULT false NOT NULL,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_rebalances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rebalance_wallets" (
	"user_id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"secret_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rebalance_wallets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_kind_check";--> statement-breakpoint
ALTER TABLE "agent_rebalances" ADD CONSTRAINT "agent_rebalances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_rebalances" ADD CONSTRAINT "agent_rebalances_agent_id_user_id_agents_id_user_id_fk" FOREIGN KEY ("agent_id","user_id") REFERENCES "public"."agents"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebalance_wallets" ADD CONSTRAINT "rebalance_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_rebalances_user_at_idx" ON "agent_rebalances" USING btree ("user_id","at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_kind_check" CHECK (kind in ('volume-watch', 'auto-rebalance'));