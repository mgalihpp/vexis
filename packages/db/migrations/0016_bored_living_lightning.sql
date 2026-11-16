CREATE TABLE "service_heartbeats" (
	"name" text PRIMARY KEY NOT NULL,
	"last_tick_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"alerted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "service_heartbeats" ENABLE ROW LEVEL SECURITY;