CREATE TABLE "office_threads" (
	"user_id" text NOT NULL,
	"agent" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"key_source" text NOT NULL,
	"prompt_version" text NOT NULL,
	"system" text NOT NULL,
	"user_message" text NOT NULL,
	"reply" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" double precision,
	"duration_ms" integer NOT NULL,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_threads_user_id_agent_pk" PRIMARY KEY("user_id","agent"),
	CONSTRAINT "office_threads_agent_check" CHECK (agent in ('scout', 'strategist', 'risk', 'manager')),
	CONSTRAINT "office_threads_provider_check" CHECK (provider in ('claude', 'openai', 'deepseek', 'meta', 'openrouter')),
	CONSTRAINT "office_threads_key_source_check" CHECK (key_source in ('vexis', 'own'))
);
--> statement-breakpoint
ALTER TABLE "office_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "office_threads" ADD CONSTRAINT "office_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;