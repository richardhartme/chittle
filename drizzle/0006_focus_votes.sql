CREATE TYPE "public"."focus_vote" AS ENUM('up', 'down');--> statement-breakpoint
CREATE TABLE "focus_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recording_id" uuid NOT NULL,
	"area" text NOT NULL,
	"vote" "focus_vote" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "focus_votes_recording_area_unique" UNIQUE("recording_id","area")
);
--> statement-breakpoint
ALTER TABLE "focus_votes" ADD CONSTRAINT "focus_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_votes" ADD CONSTRAINT "focus_votes_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "focus_votes_user_created_idx" ON "focus_votes" USING btree ("user_id","created_at");