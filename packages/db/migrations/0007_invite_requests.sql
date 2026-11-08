CREATE TABLE "invite_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_at" timestamp with time zone,
	"invite_id" uuid,
	CONSTRAINT "invite_requests_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "invite_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invite_requests" ADD CONSTRAINT "invite_requests_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE set null ON UPDATE no action;