CREATE TABLE "office_briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"stats" jsonb NOT NULL,
	"headline" text NOT NULL,
	"body" text NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "office_briefings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "office_briefings" ADD CONSTRAINT "office_briefings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_briefings" ADD CONSTRAINT "office_briefings_run_id_office_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."office_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "office_briefings_user_day_unique" ON "office_briefings" USING btree ("user_id","day");