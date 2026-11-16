CREATE TABLE "office_config" (
	"user_id" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'approval' NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"paused_reason" text,
	"paused_until" timestamp with time zone,
	"guardrails" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"models" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"key_source" text DEFAULT 'vexis' NOT NULL,
	"llm_keys" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"vexis_daily_usd" double precision DEFAULT 0 NOT NULL,
	"wallet_source" text DEFAULT 'user' NOT NULL,
	"office_public_key" text,
	"office_secret_key" text,
	"office_rpc_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_config_mode_check" CHECK (mode in ('approval', 'autopilot')),
	CONSTRAINT "office_config_key_source_check" CHECK (key_source in ('vexis', 'own')),
	CONSTRAINT "office_config_wallet_source_check" CHECK (wallet_source in ('user', 'office'))
);
--> statement-breakpoint
ALTER TABLE "office_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "office_journal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"open_proposal_id" uuid,
	"close_proposal_id" uuid,
	"pool_address" text NOT NULL,
	"pool_name" text,
	"position_address" text,
	"simulated" boolean NOT NULL,
	"amount_sol" double precision NOT NULL,
	"amount_usd" double precision,
	"open_reason" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"close_reason" text,
	"closed_at" timestamp with time zone,
	"pnl_sol" double precision,
	"pnl_usd" double precision
);
--> statement-breakpoint
ALTER TABLE "office_journal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "office_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"agent" text NOT NULL,
	"text" text NOT NULL,
	"tone" text,
	"pool_address" text,
	"proposal_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_messages_agent_check" CHECK (agent in ('scout', 'strategist', 'risk', 'manager', 'monitor', 'executor', 'bookkeeper'))
);
--> statement-breakpoint
ALTER TABLE "office_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "office_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"pool_address" text NOT NULL,
	"pool_name" text,
	"position_address" text,
	"params" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"risk_notes" jsonb,
	"summary" text,
	"proposed_by" text NOT NULL,
	"run_id" uuid,
	"decided_by" text,
	"simulated" boolean DEFAULT true NOT NULL,
	"signature" text,
	"tx_error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_proposals_kind_check" CHECK (kind in ('open', 'rebalance', 'claim', 'close')),
	CONSTRAINT "office_proposals_status_check" CHECK (status in ('draft', 'risk_checked', 'awaiting_approval', 'approved', 'executing', 'done', 'rejected', 'failed', 'expired')),
	CONSTRAINT "office_proposals_proposed_by_check" CHECK (proposed_by in ('strategist', 'monitor'))
);
--> statement-breakpoint
ALTER TABLE "office_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "office_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"agent" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"key_source" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" double precision,
	"duration_ms" integer NOT NULL,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_runs_agent_check" CHECK (agent in ('scout', 'strategist', 'risk', 'manager')),
	CONSTRAINT "office_runs_provider_check" CHECK (provider in ('claude', 'openai', 'deepseek', 'meta')),
	CONSTRAINT "office_runs_key_source_check" CHECK (key_source in ('vexis', 'own'))
);
--> statement-breakpoint
ALTER TABLE "office_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "office_config" ADD CONSTRAINT "office_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_journal" ADD CONSTRAINT "office_journal_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_journal" ADD CONSTRAINT "office_journal_open_proposal_id_office_proposals_id_fk" FOREIGN KEY ("open_proposal_id") REFERENCES "public"."office_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_journal" ADD CONSTRAINT "office_journal_close_proposal_id_office_proposals_id_fk" FOREIGN KEY ("close_proposal_id") REFERENCES "public"."office_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_messages" ADD CONSTRAINT "office_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_messages" ADD CONSTRAINT "office_messages_proposal_id_office_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."office_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_proposals" ADD CONSTRAINT "office_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_runs" ADD CONSTRAINT "office_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "office_journal_user_opened_idx" ON "office_journal" USING btree ("user_id","opened_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "office_journal_user_open_idx" ON "office_journal" USING btree ("user_id") WHERE "office_journal"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "office_messages_user_at_idx" ON "office_messages" USING btree ("user_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "office_proposals_user_created_idx" ON "office_proposals" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "office_proposals_user_pool_open_unique" ON "office_proposals" USING btree ("user_id","pool_address") WHERE status in ('draft', 'risk_checked', 'awaiting_approval', 'approved', 'executing');--> statement-breakpoint
CREATE INDEX "office_proposals_open_idx" ON "office_proposals" USING btree ("status") WHERE status in ('draft', 'risk_checked', 'awaiting_approval', 'approved', 'executing');--> statement-breakpoint
CREATE INDEX "office_runs_user_at_idx" ON "office_runs" USING btree ("user_id","at" DESC NULLS LAST);